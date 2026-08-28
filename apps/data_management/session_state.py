"""활성 `FlightSession`의 in-memory 캐시.

UDP 리스너(50Hz)/REST 폴러가 매 패킷·매 poll마다 DB를 조회하지 않고 세션 활성
여부를 확인할 수 있도록 하는 싱글톤(`udp_status`/`rest_status`와 동일한 패턴).
세션 시작/종료 시 `set_active()`/`clear_active()`로 갱신하고, 서버 (재)시작 시
`load_from_db()`로 DB에 남아있는 활성 세션 상태를 복원한다.
"""
from dataclasses import dataclass


@dataclass
class _ActiveSession:
    session_id: int | None = None
    callsign: str = ""
    started_at: float = 0.0  # Unix timestamp — 워치독이 UDP 미수신 시 폴백 기준으로 사용


_active = _ActiveSession()


def set_active(session_id: int, callsign: str, started_at: float) -> None:
    _active.session_id = session_id
    _active.callsign = callsign
    _active.started_at = started_at


def clear_active() -> None:
    _active.session_id = None
    _active.callsign = ""
    _active.started_at = 0.0


def get_active_session_id() -> int | None:
    return _active.session_id


def get_active_callsign() -> str:
    return _active.callsign


def get_active_started_at() -> float:
    return _active.started_at


def load_from_db() -> None:
    """서버 시작 시 DB에 남아있는 활성 세션(end_time IS NULL)을 복원."""
    from .models import FlightSession

    session = (
        FlightSession.objects.filter(end_time__isnull=True).order_by("-start_time").first()
    )
    if session is not None:
        set_active(session.id, session.callsign, session.start_time.timestamp())
    else:
        clear_active()
