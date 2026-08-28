import json
import uuid
from datetime import datetime, timedelta

import httpx
from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views import View
from django.views.generic import TemplateView

from apps.absim_link.rest_client import get_models
from apps.flight_planning.eobt import ScheduleError, compute_schedule_for_plan_from_eobt
from apps.flight_planning.models import FlightPlan

from .models import FlightPlanInjection


class InjectionIndexView(TemplateView):
    template_name = "flight_plan_injection/index.html"
    extra_context = {"active_page": "flight_plan_injection"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["plans"] = FlightPlan.objects.only("id", "name")
        ctx["history"] = FlightPlanInjection.objects.all()[:50]
        return ctx


def _fmt_utc(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_payload(plan: FlightPlan, target_model: str, callsign: str, gufi_id: str, eobt: datetime) -> dict:
    """반환: POST payload dict. eobt(출발 예정시각)는 호출측이 Injection 시각+Offset으로 미리 계산해 전달."""
    schedule = compute_schedule_for_plan_from_eobt(plan, eobt)
    utc_list = schedule["utc_list"]
    waypoints = list(plan.waypoints.all())

    payload = {
        "gufi_id": gufi_id,
        "callsign": callsign,
        "target_model": target_model,
        "aircraft_type": plan.aircraft_type,
        "dep": plan.dep,
        "arr": plan.arr,
        "eobt": _fmt_utc(schedule["eobt"]),
        "departure": {
            "name": plan.departure_name, "lat": plan.departure_lat, "lon": plan.departure_lon,
            "alt": plan.departure_alt, "velocity": plan.departure_velocity,
            "utc": _fmt_utc(utc_list[0]),
        },
        "arrival": {
            "name": plan.arrival_name, "lat": plan.arrival_lat, "lon": plan.arrival_lon,
            "alt": plan.arrival_alt, "velocity": plan.arrival_velocity,
            "utc": _fmt_utc(utc_list[-1]),
        },
        "waypoints": [
            {
                "name": wp.name, "lat": wp.lat, "lon": wp.lon, "alt": wp.alt, "velocity": wp.velocity,
                "utc": _fmt_utc(utc_list[i + 1]),
            }
            for i, wp in enumerate(waypoints)
        ],
    }
    return payload


def _resolve_request(payload_in: dict):
    """공용: FlightPlan 로드 + payload 구성.

    Departure Time(EOBT) = Injection 시각(현재 시간, `timezone.now()`) + Offset —
    Flight Plan에 저장된 ETA는 Injection 단계에서는 쓰지 않는다(CLAUDE.md §9 갱신 참고).
    반환: (plan, payload, eobt, error_message). 실패 시 plan/payload/eobt는 None.
    """
    plan_id = payload_in.get("flight_plan_id")
    target_model = (payload_in.get("target_model") or "").strip()
    callsign = (payload_in.get("callsign") or target_model).strip()

    if not plan_id or not target_model:
        return None, None, None, "flight_plan_id/target_model이 필요합니다."

    try:
        offset_min = float(payload_in.get("departure_offset_min") or 0)
    except (TypeError, ValueError):
        return None, None, None, "Departure Offset이 올바르지 않습니다."
    if offset_min < 0:
        return None, None, None, "Departure Offset은 0 이상이어야 합니다."

    plan = FlightPlan.objects.prefetch_related("waypoints").filter(pk=plan_id).first()
    if plan is None:
        return None, None, None, "Flight Plan을 찾을 수 없습니다."

    injection_time = timezone.now()
    eobt = injection_time + timedelta(minutes=offset_min)

    gufi_id = f"ABF-{uuid.uuid4().hex}"
    try:
        payload = _build_payload(plan, target_model, callsign, gufi_id, eobt)
    except ScheduleError as exc:
        return plan, None, None, str(exc)

    return plan, payload, eobt, ""


class InjectionPreviewView(View):
    """실제 전송될 JSON payload만 계산해서 보여준다 (전송/이력 저장 없음)."""

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload_in = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        _plan, payload, _eobt, error = _resolve_request(payload_in)
        if error:
            return JsonResponse({"error": error}, status=400)
        return JsonResponse({"payload": payload})


class InjectionSendView(View):
    """실제 `POST /api/abfap/fpl/` 전송 + 이력 기록.

    서버측에서도 대상 Model 가용성을 재검증한다(`docs/Debug_FPL_Feature_Reference.md`
    §3 원칙 — 화면의 disabled 처리와 별개로 레이스 컨디션 방지).
    """

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload_in = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        plan, payload, eobt, error = _resolve_request(payload_in)
        if error:
            return JsonResponse({"error": error}, status=400)

        target_model = payload["target_model"]
        force = bool(payload_in.get("force"))

        if not force and FlightPlanInjection.objects.filter(
            flight_plan_id=plan.id, target_model_name=target_model, success=True
        ).exists():
            return JsonResponse(
                {
                    "error": "이미 이 Model로 전송된 Flight Plan입니다. 재전송하려면 강제 전송을 사용하세요.",
                    "duplicate": True,
                },
                status=409,
            )

        model_entry = next((m for m in get_models() if m.get("model") == target_model), None)
        if model_entry is None:
            return JsonResponse({"error": f"알 수 없는 Model: {target_model}"}, status=404)
        if not (model_entry.get("process_running") and model_entry.get("udp_connected")):
            return JsonResponse(
                {"error": f"{target_model}: RUN 상태 및 UDP 연결이 정상인 Model만 대상으로 지정할 수 있습니다."},
                status=409,
            )

        base_url = getattr(settings, "ABSIM_DASHBOARD_BASE_URL", "").rstrip("/")
        timeout = getattr(settings, "ABSIM_REQUEST_TIMEOUT_SEC", 2.0)

        success = False
        status_code = None
        error_message = ""
        dashboard_injection_id = None
        dashboard_flight_plan_id = None

        if not base_url:
            error_message = "ABSIM_DASHBOARD_BASE_URL이 설정되지 않았습니다."
        else:
            try:
                resp = httpx.post(f"{base_url}/api/abfap/fpl/", json=payload, timeout=timeout)
                status_code = resp.status_code
                try:
                    body = resp.json()
                except ValueError:
                    body = {}
                success = bool(body.get("success"))
                dashboard_injection_id = body.get("injection_id")
                dashboard_flight_plan_id = body.get("flight_plan_id")
                error_message = body.get("error", "") or ("" if success else f"HTTP {resp.status_code}")
            except httpx.HTTPError as exc:
                error_message = str(exc)

        record = FlightPlanInjection.objects.create(
            flight_plan=plan,
            flight_plan_name=plan.name,
            target_model_name=target_model,
            callsign=payload["callsign"],
            gufi_id=payload["gufi_id"],
            eobt=eobt,
            dashboard_injection_id=dashboard_injection_id,
            dashboard_flight_plan_id=dashboard_flight_plan_id,
            status_code=status_code,
            success=success,
            error_message=error_message[:255],
        )

        return JsonResponse(
            {
                "success": success,
                "error": error_message,
                "gufi_id": payload["gufi_id"],
                "injection_id": record.id,
                "dashboard_injection_id": dashboard_injection_id,
                "injected_at": record.injected_at.isoformat(),
            },
            status=200 if success else (status_code or 502),
        )
