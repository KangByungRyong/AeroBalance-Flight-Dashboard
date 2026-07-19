"""ABSim-Dashboard(WS#3) REST 연동 폴링 클라이언트.

Dashboard가 노출하는 GET /api/abfap/tracks/, /api/abfap/model-status/ 를 주기적으로
조회해 in-memory 캐시에 저장한다 (`docs/ABFAP_Export_Interface.md` §1~2 기준).
X-Plane 항적과의 병합(Channels Consumer 전달)은 map_view 쪽에서 이 모듈의
get_status_dict()/get_tracks()/get_models()를 읽어 처리한다.
"""
import asyncio
import logging
import time
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)


@dataclass
class _RestStatus:
    is_connected: bool = False
    last_success_time: float = 0.0
    last_error: str = ""
    last_error_time: float = 0.0
    poll_count: int = 0
    error_count: int = 0
    tracks: list = field(default_factory=list)
    models: list = field(default_factory=list)


rest_status = _RestStatus()
_poll_task: "asyncio.Task | None" = None


def _should_start() -> bool:
    """apps/udp_receiver/udp_listener.py의 동일 함수 참고 — runserver의 reloader
    프로세스에서는 실행하지 않고, 실제로 서빙하는 내부 프로세스에서만 실행한다."""
    import os
    import sys

    using_runserver = any("runserver" in arg for arg in sys.argv)
    run_main = os.environ.get("RUN_MAIN")

    if using_runserver and run_main != "true":
        return "--noreload" in sys.argv
    return True


async def _poll_once(client: httpx.AsyncClient, base_url: str) -> None:
    now = time.time()
    try:
        tracks_resp = await client.get(f"{base_url}/api/abfap/tracks/")
        tracks_resp.raise_for_status()
        model_resp = await client.get(f"{base_url}/api/abfap/model-status/")
        model_resp.raise_for_status()

        rest_status.tracks = tracks_resp.json().get("tracks", [])
        rest_status.models = model_resp.json().get("models", [])
        rest_status.is_connected = True
        rest_status.last_success_time = now
        rest_status.poll_count += 1
    except Exception as exc:
        # httpx.AsyncClient의 타임아웃류 예외는 str(exc)가 빈 문자열일 수 있음
        # (동기 클라이언트는 'timed out'이 붙지만 비동기 백엔드는 메시지가 없음) —
        # 원인 파악이 가능하도록 예외 타입명을 항상 붙인다.
        message = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
        rest_status.is_connected = False
        rest_status.last_error = message
        rest_status.last_error_time = now
        rest_status.error_count += 1
        logger.warning("ABSim-Dashboard REST 폴링 실패 (%s): %s", base_url, message)


async def _poll_loop() -> None:
    from django.conf import settings

    base_url: str = getattr(settings, "ABSIM_DASHBOARD_BASE_URL", "")
    interval: float = getattr(settings, "ABSIM_POLL_INTERVAL_SEC", 1.0)
    timeout: float = getattr(settings, "ABSIM_REQUEST_TIMEOUT_SEC", 2.0)

    if not base_url:
        logger.warning("ABSIM_DASHBOARD_BASE_URL 미설정 — REST 폴링을 시작하지 않음")
        return

    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            await _poll_once(client, base_url.rstrip("/"))
            await asyncio.sleep(interval)


_poller_started = False


async def start_poller() -> None:
    """ASGI 서버를 실제로 구동하는 이벤트 루프 위에서 폴링을 시작한다.
    (apps/udp_receiver/udp_listener.py: start_udp_listener()와 동일한 이유 —
    이 모듈 자체는 channel layer를 쓰지 않지만, 향후 map_view 쪽에서 이 데이터를
    같은 이벤트 루프 기준으로 소비하게 되므로 동일한 시작 경로를 따른다.)

    여러 시작 경로가 중복 호출할 수 있으므로 멱등하게 동작한다.
    """
    global _poller_started, _poll_task
    if _poller_started or not _should_start():
        return
    _poller_started = True
    _poll_task = asyncio.ensure_future(_poll_loop())
    logger.info("ABSim-Dashboard REST 폴러 시작")


def stop_poller() -> None:
    """ASGI lifespan shutdown 시점에 호출되어 폴링 태스크를 정리한다."""
    global _poll_task
    if _poll_task is not None:
        _poll_task.cancel()
        _poll_task = None


def get_tracks() -> list:
    return rest_status.tracks


def get_models() -> list:
    return rest_status.models


def get_status_dict() -> dict:
    """현재 REST 연동 상태를 JSON 직렬화 가능한 dict로 반환."""
    now = time.time()
    since_last = (now - rest_status.last_success_time) if rest_status.last_success_time else None

    return {
        "is_connected":      rest_status.is_connected,
        "last_success_time": rest_status.last_success_time,
        "since_last_sec":    round(since_last, 2) if since_last is not None else None,
        "last_error":        rest_status.last_error,
        "last_error_time":   rest_status.last_error_time,
        "poll_count":        rest_status.poll_count,
        "error_count":       rest_status.error_count,
        "track_count":       len(rest_status.tracks),
        "model_count":       len(rest_status.models),
    }
