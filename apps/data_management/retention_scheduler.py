"""보존 기간이 지난 세션을 주기적으로 아카이브하는 백그라운드 태스크
(`CLAUDE.md` §10, `archive.py: archive_expired_sessions()` 참고).

`apps/udp_receiver/udp_listener.py`/`apps/absim_link/rest_client.py`/
`apps/data_management/session_watchdog.py`와 동일한 twisted_loop(Daphne)/
lifespan(Uvicorn 등) 이중 등록 패턴으로 시작한다.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

_task: "asyncio.Task | None" = None


def _should_start() -> bool:
    """다른 백그라운드 모듈과 동일 — runserver reloader 프로세스에서는 실행하지
    않고, 실제로 서빙하는 내부 프로세스에서만 실행한다."""
    import os
    import sys

    using_runserver = any("runserver" in arg for arg in sys.argv)
    run_main = os.environ.get("RUN_MAIN")

    if using_runserver and run_main != "true":
        return "--noreload" in sys.argv
    return True


async def _sweep_loop() -> None:
    from asgiref.sync import sync_to_async
    from django.conf import settings

    from .archive import archive_expired_sessions

    interval = getattr(settings, "SESSION_RETENTION_SWEEP_INTERVAL_SEC", 3600.0)
    while True:
        await asyncio.sleep(interval)
        try:
            count = await sync_to_async(archive_expired_sessions, thread_sensitive=False)()
            if count:
                logger.info("보존 기간 경과 세션 %d건 자동 아카이브", count)
        except Exception:
            logger.exception("세션 보존 정책 스윕 실패")


_started = False


async def start_retention_scheduler() -> None:
    """ASGI 서버를 실제로 구동하는 이벤트 루프 위에서 스케줄러를 시작한다.
    여러 시작 경로가 중복 호출할 수 있으므로 멱등하게 동작한다."""
    global _started, _task
    if _started or not _should_start():
        return
    _started = True
    _task = asyncio.ensure_future(_sweep_loop())
    logger.info("세션 보존 정책 스케줄러 시작")


def stop_retention_scheduler() -> None:
    """ASGI lifespan shutdown 시점에 호출되어 태스크를 정리한다."""
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
