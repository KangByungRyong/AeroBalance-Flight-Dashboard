import json
import logging

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.generic import TemplateView

from apps.data_management.models import FlightSession

from . import replay_player

logger = logging.getLogger(__name__)


class ReplayIndexView(TemplateView):
    """Replay — 저장된 세션 선택 + 재생/정지 컨트롤 화면.

    자체 지도/차트는 없다 — 재생 데이터는 서버가 `ws/replay/`로 브로드캐스트해
    Air Traffic Tracking(`/map/`)·Data Chart(`/chart/`) 페이지에 표시된다."""

    template_name = "replay/index.html"
    extra_context = {"active_page": "replay", "max_sessions": settings.REPLAY_MAX_SESSIONS}


def replay_sessions_api(request: HttpRequest) -> JsonResponse:
    """재생 가능한 세션 목록 — 종료됐고 아카이브되지 않은 세션(진행 중인 세션은
    이미 실시간으로 보이므로 제외, 아카이브된 세션은 FlightData가 DB에서
    삭제되어 재생 불가)."""
    sessions = (
        FlightSession.objects.select_related("pilot")
        .filter(end_time__isnull=False, archived_at__isnull=True)
        .order_by("-start_time")[:100]
    )
    data = [
        {
            "id": s.id,
            "callsign": s.callsign,
            "pilot_name": s.pilot.name,
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat() if s.end_time else None,
        }
        for s in sessions
    ]
    return JsonResponse({"sessions": data, "max_sessions": settings.REPLAY_MAX_SESSIONS})


async def replay_start_view(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)

    session_ids = payload.get("session_ids") or []
    if not session_ids:
        return JsonResponse({"error": "재생할 세션을 선택하세요."}, status=400)
    if len(session_ids) > settings.REPLAY_MAX_SESSIONS:
        return JsonResponse(
            {"error": f"최대 {settings.REPLAY_MAX_SESSIONS}개까지 선택할 수 있습니다."}, status=400
        )

    result = await replay_player.start_replay(session_ids)
    return JsonResponse(result)


async def replay_stop_view(request: HttpRequest) -> JsonResponse:
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)
    await replay_player.stop_replay()
    return JsonResponse({"status": "ok"})


def replay_status_api(request: HttpRequest) -> JsonResponse:
    return JsonResponse(replay_player.get_status())
