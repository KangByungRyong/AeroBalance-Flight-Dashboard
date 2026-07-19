import json
from datetime import datetime

from django.db import transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views import View
from django.views.generic import TemplateView

from .eobt import ScheduleError, compute_schedule
from .fms import build_fms_filename, build_fms_text
from .models import FlightPlan, FlightPlanWaypoint


class FlightPlanningIndexView(TemplateView):
    template_name = "flight_planning/index.html"
    extra_context = {"active_page": "flight_planning"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["plans"] = FlightPlan.objects.only("id", "name", "dep", "arr", "updated_at")
        return ctx


class FlightPlanDetailView(View):
    def get(self, request: HttpRequest, pk: int) -> JsonResponse:
        try:
            plan = FlightPlan.objects.prefetch_related("waypoints").get(pk=pk)
        except FlightPlan.DoesNotExist:
            return JsonResponse({"error": "Flight Plan을 찾을 수 없습니다."}, status=404)

        data = plan.to_dict()
        data["schedule"] = _schedule_preview(plan)
        return JsonResponse(data)


def _build_schedule(points: list[dict], eta: datetime) -> dict:
    try:
        result = compute_schedule(points, eta)
    except ScheduleError as exc:
        return {"error": str(exc)}

    return {
        "eobt": result["eobt"].isoformat(),
        "departure_utc": result["utc_list"][0].isoformat(),
        "arrival_utc": result["utc_list"][-1].isoformat(),
        "waypoint_utc": [t.isoformat() for t in result["utc_list"][1:-1]],
    }


def _schedule_preview(plan: FlightPlan) -> dict:
    points = [
        {"lat": plan.departure_lat, "lon": plan.departure_lon, "velocity": plan.departure_velocity},
        *[{"lat": wp.lat, "lon": wp.lon, "velocity": wp.velocity} for wp in plan.waypoints.all()],
        {"lat": plan.arrival_lat, "lon": plan.arrival_lon, "velocity": plan.arrival_velocity},
    ]
    return _build_schedule(points, plan.eta)


class FlightPlanPreviewView(View):
    """저장 전 초안(draft)만으로 EOBT/각 지점 통과 UTC를 미리 계산 (저장 없음)."""

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        eta_raw = payload.get("eta")
        eta = parse_datetime(eta_raw) if eta_raw else None
        if not isinstance(eta, datetime):
            return JsonResponse({"error": "도착 예정시각(ETA)이 올바르지 않습니다."}, status=400)

        departure = payload.get("departure") or {}
        arrival = payload.get("arrival") or {}
        waypoints = payload.get("waypoints") or []

        try:
            points = [
                {"lat": departure["lat"], "lon": departure["lon"], "velocity": departure.get("velocity") or 0},
                *[
                    {"lat": wp["lat"], "lon": wp["lon"], "velocity": wp.get("velocity") or 0}
                    for wp in waypoints
                ],
                {"lat": arrival["lat"], "lon": arrival["lon"], "velocity": arrival.get("velocity") or 0},
            ]
        except KeyError:
            return JsonResponse({"error": "departure/arrival/waypoints의 lat/lon이 필요합니다."}, status=400)

        return JsonResponse({"schedule": _build_schedule(points, eta)})


class FlightPlanSaveView(View):
    """신규/수정/다른 이름으로 저장 공용 처리 (`docs/Debug_FPL_Feature_Reference.md` §1-1 패턴)."""

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"error": "이름을 입력하세요."}, status=400)

        eta_raw = payload.get("eta")
        eta = parse_datetime(eta_raw) if eta_raw else None
        if not isinstance(eta, datetime):
            return JsonResponse({"error": "도착 예정시각(ETA)이 올바르지 않습니다."}, status=400)

        departure = payload.get("departure") or {}
        arrival = payload.get("arrival") or {}
        for label, point in (("departure", departure), ("arrival", arrival)):
            if point.get("lat") is None or point.get("lon") is None:
                return JsonResponse({"error": f"{label}의 위치(lat/lon)를 지정하세요."}, status=400)
            if point.get("alt") is None:
                return JsonResponse({"error": f"{label}의 고도(alt)를 지정하세요."}, status=400)

        waypoints = payload.get("waypoints") or []
        for i, wp in enumerate(waypoints):
            missing = [f for f in ("lat", "lon", "alt") if wp.get(f) is None]
            if missing:
                return JsonResponse(
                    {"error": f"waypoints[{i}]에 {', '.join(missing)}가 필요합니다."}, status=400
                )

        save_as = bool(payload.get("save_as"))
        plan_id = payload.get("id")

        if not save_as and plan_id:
            plan = FlightPlan.objects.filter(pk=plan_id).first()
            if plan is None:
                return JsonResponse({"error": "Flight Plan을 찾을 수 없습니다."}, status=404)
            if FlightPlan.objects.exclude(pk=plan.pk).filter(name=name).exists():
                return JsonResponse({"error": "이미 존재하는 이름입니다."}, status=400)
        else:
            if FlightPlan.objects.filter(name=name).exists():
                return JsonResponse({"error": "이미 존재하는 이름입니다."}, status=400)
            plan = FlightPlan()

        plan.name = name
        plan.aircraft_type = payload.get("aircraft_type", "")
        plan.dep = payload.get("dep", "")
        plan.arr = payload.get("arr", "")
        plan.eta = eta
        plan.departure_name = departure.get("name", "")
        plan.departure_lat = departure["lat"]
        plan.departure_lon = departure["lon"]
        plan.departure_alt = departure["alt"]
        plan.departure_velocity = departure.get("velocity") or 0
        plan.arrival_name = arrival.get("name", "")
        plan.arrival_lat = arrival["lat"]
        plan.arrival_lon = arrival["lon"]
        plan.arrival_alt = arrival["alt"]
        plan.arrival_velocity = arrival.get("velocity") or 0

        with transaction.atomic():
            plan.save()
            plan.waypoints.all().delete()
            FlightPlanWaypoint.objects.bulk_create(
                [
                    FlightPlanWaypoint(
                        flight_plan=plan,
                        seq=i + 1,
                        name=wp.get("name", ""),
                        lat=wp["lat"],
                        lon=wp["lon"],
                        alt=wp["alt"],
                        velocity=wp.get("velocity") or 0,
                    )
                    for i, wp in enumerate(waypoints)
                ]
            )

        data = plan.to_dict()
        data["schedule"] = _schedule_preview(plan)
        return JsonResponse(data)


class FlightPlanFmsExportView(View):
    """저장된 FlightPlan → X-Plane `.fms`(v11) 파일 다운로드 (`CLAUDE.md` §10, `fms.py` 참고)."""

    def get(self, request: HttpRequest, pk: int) -> HttpResponse:
        plan = FlightPlan.objects.prefetch_related("waypoints").filter(pk=pk).first()
        if plan is None:
            return JsonResponse({"error": "Flight Plan을 찾을 수 없습니다."}, status=404)

        callsign = (request.GET.get("callsign") or plan.name).strip()
        text = build_fms_text(plan.to_dict())
        filename = build_fms_filename(callsign, timezone.now())

        response = HttpResponse(text, content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class FlightPlanFmsPreviewExportView(View):
    """편집 중(저장 여부 무관)인 좌표로 `.fms` 파일을 생성해 다운로드한다
    (`pilot_flight` 페이지 — Edit Box로 조정한 값을 그대로 반영, `fms.py` 참고)."""

    def post(self, request: HttpRequest) -> HttpResponse:
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        departure = payload.get("departure") or {}
        arrival = payload.get("arrival") or {}
        for label, point in (("departure", departure), ("arrival", arrival)):
            if point.get("lat") is None or point.get("lon") is None:
                return JsonResponse({"error": f"{label}의 위치(lat/lon)를 지정하세요."}, status=400)

        callsign = (payload.get("callsign") or "FLIGHT").strip()
        text = build_fms_text(payload)
        filename = build_fms_filename(callsign, timezone.now())

        response = HttpResponse(text, content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class FlightPlanDeleteView(View):
    def post(self, request: HttpRequest, pk: int) -> JsonResponse:
        deleted, _ = FlightPlan.objects.filter(pk=pk).delete()
        if not deleted:
            return JsonResponse({"error": "Flight Plan을 찾을 수 없습니다."}, status=404)
        return JsonResponse({"success": True})
