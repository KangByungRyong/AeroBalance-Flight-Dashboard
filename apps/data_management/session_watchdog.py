"""활성 `FlightSession` 자동 종료 워치독 (`CLAUDE.md` §10).

UDP 최종 수신 시각(없으면 세션 시작 시각)이 `SESSION_AUTO_END_TIMEOUT_SEC`를
넘기면 활성 세션을 `end_reason='timeout'`으로 자동 종료한다.
`apps/udp_receiver/udp_listener.py`/`apps/absim_link/rest_client.py`와 동일한
twisted_loop(Daphne)/lifespan(Uvicorn 등) 이중 등록 패턴으로 시작한다.
"""
import asyncio
import logging
import time

logger = logging.getLogger(__name__)

_watchdog_task: "asyncio.Task | None" = None


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


async def _check_once() -> None:
    from asgiref.sync import sync_to_async
    from django.conf import settings
    from django.utils import timezone

    from apps.udp_receiver.udp_listener import udp_status

    from . import session_state
    from .models import FlightSession

    session_id = session_state.get_active_session_id()
    if session_id is None:
        return

    timeout_sec = getattr(settings, "SESSION_AUTO_END_TIMEOUT_SEC", 60.0)
    reference_time = udp_status.last_packet_time or session_state.get_active_started_at()
    if reference_time and (time.time() - reference_time) < timeout_sec:
        return

    def _end_session() -> int:
        return FlightSession.objects.filter(pk=session_id, end_time__isnull=True).update(
            end_time=timezone.now(), end_reason=FlightSession.EndReason.TIMEOUT
        )

    updated = await sync_to_async(_end_session)()
    if updated:
        session_state.clear_active()
        logger.warning("세션 %s 자동 종료(타임아웃) — UDP 수신 끊김", session_id)


async def _watchdog_loop() -> None:
    from django.conf import settings

    interval = getattr(settings, "SESSION_WATCHDOG_INTERVAL_SEC", 5.0)
    while True:
        await asyncio.sleep(interval)
        try:
            await _check_once()
        except Exception:
            logger.exception("세션 워치독 점검 실패")


_watchdog_started = False


async def start_watchdog() -> None:
    """ASGI 서버를 실제로 구동하는 이벤트 루프 위에서 워치독을 시작한다.
    여러 시작 경로가 중복 호출할 수 있으므로 멱등하게 동작한다."""
    global _watchdog_started, _watchdog_task
    if _watchdog_started or not _should_start():
        return
    _watchdog_started = True

    from asgiref.sync import sync_to_async

    from . import session_state

    await sync_to_async(session_state.load_from_db)()

    _watchdog_task = asyncio.ensure_future(_watchdog_loop())
    logger.info("세션 자동 종료 워치독 시작")


def stop_watchdog() -> None:
    """ASGI lifespan shutdown 시점에 호출되어 워치독 태스크를 정리한다."""
    global _watchdog_task
    if _watchdog_task is not None:
        _watchdog_task.cancel()
        _watchdog_task = None
