import json
import logging

from django.http import HttpRequest, JsonResponse
from django.utils import timezone
from django.views import View
from django.views.generic import TemplateView

from apps.flight_planning.models import FlightPlan

from . import session_state
from .archive import export_sessions, import_from_archive_data, parse_archive_bytes
from .models import AbsimTrackLog, FlightSession, Pilot

logger = logging.getLogger(__name__)


class DataManagementIndexView(TemplateView):
    """저장된 세션 조회·관리 전용 화면 (`CLAUDE.md` §5·§10) — 세션 시작 액션은
    `flight_planning` 페이지에서 수행한다."""

    template_name = "data_management/index.html"
    extra_context = {"active_page": "management"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["sessions"] = FlightSession.objects.select_related("pilot", "flight_plan")[:200]
        return ctx


class SessionDetailView(View):
    def get(self, request: HttpRequest, pk: int) -> JsonResponse:
        session = FlightSession.objects.select_related("pilot", "flight_plan").filter(pk=pk).first()
        if session is None:
            return JsonResponse({"error": "세션을 찾을 수 없습니다."}, status=404)

        start_ts = session.start_time.timestamp()
        end_ts = session.end_time.timestamp() if session.end_time else None
        track_filter = {"polled_at__gte": start_ts}
        if end_ts is not None:
            track_filter["polled_at__lte"] = end_ts

        snapshot = session.flight_plan_snapshot or {}

        return JsonResponse(
            {
                "id": session.id,
                "callsign": session.callsign,
                "pilot": {
                    "name": session.pilot.name,
                    "organization": session.pilot.organization,
                    "license_no": session.pilot.license_no,
                },
                "is_free_flight": session.is_free_flight,
                "flight_plan_name": session.flight_plan.name if session.flight_plan else snapshot.get("name", ""),
                "dep": snapshot.get("dep", ""),
                "arr": snapshot.get("arr", ""),
                "start_time": session.start_time.isoformat(),
                "end_time": session.end_time.isoformat() if session.end_time else None,
                "end_reason": session.end_reason,
                "notes": session.notes,
                "flight_data_count": session.flight_data.count(),
                "absim_track_count": AbsimTrackLog.objects.filter(**track_filter).count(),
                "is_archived": session.is_archived,
                "archived_at": session.archived_at.isoformat() if session.archived_at else None,
                "archive_path": session.archive_path,
            }
        )


class SessionBulkExportView(View):
    """체크박스로 선택한 여러 세션을 한 번에 내보낸다(데이터 관리 페이지 상단
    "내보내기" 버튼, `archive.py: export_sessions()`). 세션별로 결과(성공/건너뜀/
    실패)를 돌려준다 — 진행 중이거나 이미 내보낸 세션은 건너뜀으로 표시."""

    def post(self, request: HttpRequest) -> JsonResponse:
        from django.conf import settings

        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        session_ids = payload.get("session_ids") or []
        if not session_ids:
            return JsonResponse({"error": "선택된 세션이 없습니다."}, status=400)

        results = export_sessions(session_ids, settings.SESSION_ARCHIVE_DIR)
        return JsonResponse({"results": results})


class SessionFileImportView(View):
    """파일 열기 다이얼로그로 고른 아카이브 파일(들)을 DB로 복원한다
    (`archive.py: import_from_archive_data()`). 원본 세션 레코드가 남아있으면
    그 레코드에 복원, 없으면(삭제됐거나 다른 백업 파일) 새 세션으로 복원—
    파일당 결과를 돌려준다."""

    def post(self, request: HttpRequest) -> JsonResponse:
        files = request.FILES.getlist("files")
        if not files:
            return JsonResponse({"error": "파일을 선택하세요."}, status=400)

        results = []
        for f in files:
            try:
                data = parse_archive_bytes(f.read())
                outcome = import_from_archive_data(data)
                results.append(
                    {
                        "filename": f.name,
                        "status": "ok",
                        "session_id": outcome["session"].id,
                        "callsign": outcome["session"].callsign,
                        "flight_data": outcome["flight_data"],
                        "absim_tracks": outcome["absim_tracks"],
                        "reused": outcome["reused"],
                    }
                )
            except Exception as exc:
                logger.exception("아카이브 파일 가져오기 실패: %s", f.name)
                results.append({"filename": f.name, "status": "error", "message": str(exc)})

        return JsonResponse({"results": results})


class PilotListCreateView(View):
    def get(self, request: HttpRequest) -> JsonResponse:
        pilots = list(Pilot.objects.values("id", "name", "organization", "license_no"))
        return JsonResponse({"pilots": pilots})

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"error": "이름을 입력하세요."}, status=400)

        pilot = Pilot.objects.create(
            name=name,
            organization=(payload.get("organization") or "").strip(),
            license_no=(payload.get("license_no") or "").strip(),
            notes=(payload.get("notes") or "").strip(),
        )
        return JsonResponse(
            {"id": pilot.id, "name": pilot.name, "organization": pilot.organization, "license_no": pilot.license_no}
        )


class SessionStartView(View):
    """"비행 시작"(데이터 저장 시작) — `pilot_flight` 페이지에서 호출 (`CLAUDE.md` §10).

    활성 세션(`end_time IS NULL`)은 항상 최대 1개 — 이미 있으면 409로 막는다
    (현재 UDP 리스너가 발신지 구분 없이 단일 스트림으로 받는 구조라 동시 세션을
    지원할 수 없음).
    """

    def post(self, request: HttpRequest) -> JsonResponse:
        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid JSON"}, status=400)

        pilot_id = payload.get("pilot_id")
        callsign = (payload.get("callsign") or "").strip()
        flight_plan_id = payload.get("flight_plan_id")
        notes = (payload.get("notes") or "").strip()
        # pilot_flight 페이지의 Edit Box로 조정된 좌표가 있으면 그걸 그대로
        # 스냅샷으로 쓴다 — 없으면 flight_plan_id의 저장된 값을 그대로 사용.
        flight_plan_snapshot_override = payload.get("flight_plan_snapshot")

        if not pilot_id:
            return JsonResponse({"error": "조종사를 선택하세요."}, status=400)
        if not callsign:
            return JsonResponse({"error": "Callsign을 입력하세요."}, status=400)

        pilot = Pilot.objects.filter(pk=pilot_id).first()
        if pilot is None:
            return JsonResponse({"error": "조종사를 찾을 수 없습니다."}, status=404)

        if FlightSession.objects.filter(end_time__isnull=True).exists():
            return JsonResponse(
                {"error": "이미 활성 세션이 있습니다. 먼저 종료하세요.", "active_session": True}, status=409
            )

        flight_plan = None
        flight_plan_snapshot = flight_plan_snapshot_override
        if flight_plan_id:
            flight_plan = FlightPlan.objects.prefetch_related("waypoints").filter(pk=flight_plan_id).first()
            if flight_plan is None:
                return JsonResponse({"error": "Flight Plan을 찾을 수 없습니다."}, status=404)
            if flight_plan_snapshot is None:
                flight_plan_snapshot = flight_plan.to_dict()

        session = FlightSession.objects.create(
            pilot=pilot,
            flight_plan=flight_plan,
            flight_plan_snapshot=flight_plan_snapshot,
            callsign=callsign,
            notes=notes,
        )
        session_state.set_active(session.id, session.callsign, session.start_time.timestamp())

        return JsonResponse(
            {
                "status": "ok",
                "session_id": session.id,
                "callsign": session.callsign,
                "start_time": session.start_time.isoformat(),
            }
        )


class SessionEndView(View):
    def post(self, request: HttpRequest, pk: int) -> JsonResponse:
        session = FlightSession.objects.filter(pk=pk, end_time__isnull=True).first()
        if session is None:
            return JsonResponse({"error": "활성 세션을 찾을 수 없습니다."}, status=404)

        session.end_time = timezone.now()
        session.end_reason = FlightSession.EndReason.MANUAL
        session.save(update_fields=["end_time", "end_reason"])
        session_state.clear_active()

        return JsonResponse({"status": "ok"})


def session_active_api(request: HttpRequest) -> JsonResponse:
    """현재 활성 세션 상태 (Top Navbar/`flight_planning` "비행 시작" 버튼 폴링용)."""
    session_id = session_state.get_active_session_id()
    if session_id is None:
        return JsonResponse({"active": False})

    session = FlightSession.objects.select_related("pilot").filter(pk=session_id).first()
    if session is None:
        session_state.clear_active()
        return JsonResponse({"active": False})

    return JsonResponse(
        {
            "active": True,
            "session_id": session.id,
            "callsign": session.callsign,
            "pilot_name": session.pilot.name,
            "start_time": session.start_time.isoformat(),
        }
    )


def db_usage_api(request: HttpRequest) -> JsonResponse:
    """현재 DB 사용 용량 (`DB_CAPACITY_LIMIT_GB` 기준, 데이터 관리 페이지 상단
    위젯 폴링용)."""
    from .db_usage import get_db_usage

    return JsonResponse(get_db_usage())
