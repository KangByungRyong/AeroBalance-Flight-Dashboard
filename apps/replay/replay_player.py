"""Replay 재생 엔진 (`CLAUDE.md` 신규 — 2026-08-28).

저장된 `FlightSession`의 `FlightData`(X-Plane UDP 저장분)를 실제 기록된
페이스 그대로 재생하며 Channels 그룹(`replay_data`)에 브로드캐스트한다.
`udp_listener.py`의 실시간 페이로드와 동일한 필드 구성(lat/lon/alt_ft/ias_kt/
tas_kt/gs_kt/heading/pitch/roll/params)을 쓰되, 타임스탬프는 재생 시작 시각을
0점으로 하는 게 아니라 각 세션의 자동 감지된 "이륙 시점"을 재생 시작 시각에
맞춰 리매핑한다 — Map(`ws/flight/`)·Chart의 기존 실시간 슬라이딩 윈도우가
그대로 재사용되어 Online 데이터와 같은 화면에 자연스럽게 겹쳐 보인다.
"""
import asyncio
import logging
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_FETCH_CHUNK_SIZE = 2000


@dataclass
class _ReplayRuntime:
    session_id: int
    callsign: str
    label: str
    total_rows: int
    task: "asyncio.Task | None" = None
    sent_rows: int = 0
    finished: bool = False
    error: str = ""


_active: dict[int, _ReplayRuntime] = {}


def is_active() -> bool:
    return bool(_active)


def get_status() -> dict:
    return {
        "playing": is_active(),
        "sessions": [
            {
                "session_id": r.session_id,
                "callsign": r.callsign,
                "label": r.label,
                "total_rows": r.total_rows,
                "sent_rows": r.sent_rows,
                "progress": round(r.sent_rows / r.total_rows, 4) if r.total_rows else 0.0,
                "finished": r.finished,
                "error": r.error,
            }
            for r in _active.values()
        ],
    }


def _detect_takeoff_ts_sync(session_id: int) -> float | None:
    """이륙 시점 자동 감지 — 1순위 Alt AGL(Gear) 임계값 통과, 2순위 지상속도
    임계값 통과(AGL 데이터가 없는 세션 대비 폴백). 둘 다 없으면 None(호출측이
    세션 시작 시각으로 대체)."""
    from django.conf import settings
    from django.db import connection

    agl_threshold = getattr(settings, "REPLAY_TAKEOFF_AGL_THRESHOLD_FT", 50.0)
    gs_threshold = getattr(settings, "REPLAY_TAKEOFF_GS_THRESHOLD_KT", 40.0)

    with connection.cursor() as cur:
        cur.execute(
            "SELECT timestamp FROM flight_data "
            "WHERE session_id = %s "
            "AND JSON_EXTRACT(params, '$.position.gear_height_ftagl') > %s "
            "ORDER BY timestamp ASC LIMIT 1",
            [session_id, agl_threshold],
        )
        row = cur.fetchone()
        if row:
            return float(row[0])

        cur.execute(
            "SELECT timestamp FROM flight_data "
            "WHERE session_id = %s AND gs_kt > %s "
            "ORDER BY timestamp ASC LIMIT 1",
            [session_id, gs_threshold],
        )
        row = cur.fetchone()
        return float(row[0]) if row else None


def _count_rows_sync(session_id: int, from_ts: float) -> int:
    from apps.data_management.models import FlightData

    return FlightData.objects.filter(session_id=session_id, timestamp__gte=from_ts).count()


def _fetch_chunk_sync(session_id: int, after_ts: float | None, from_ts: float) -> list[dict]:
    from apps.data_management.models import FlightData

    qs = FlightData.objects.filter(session_id=session_id, timestamp__gte=from_ts)
    if after_ts is not None:
        qs = qs.filter(timestamp__gt=after_ts)
    return list(
        qs.order_by("timestamp").values(
            "timestamp", "lat", "lon", "alt_ft", "ias_kt", "tas_kt",
            "gs_kt", "heading", "pitch", "roll", "params",
        )[:_FETCH_CHUNK_SIZE]
    )


async def _broadcast(data: dict) -> None:
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
    await channel_layer.group_send("replay_data", {"type": "replay.update", "data": data})


async def _play_session(runtime: _ReplayRuntime, takeoff_ts: float) -> None:
    from asgiref.sync import sync_to_async
    from django.conf import settings

    max_gap = getattr(settings, "REPLAY_MAX_GAP_SEC", 3.0)
    wall_offset = time.time() - takeoff_ts
    after_ts: float | None = None

    try:
        while True:
            rows = await sync_to_async(_fetch_chunk_sync)(runtime.session_id, after_ts, takeoff_ts)
            if not rows:
                break
            for row in rows:
                target = wall_offset + row["timestamp"]
                delay = min(target - time.time(), max_gap)
                if delay > 0:
                    await asyncio.sleep(delay)

                await _broadcast(
                    {
                        "type": "point",
                        "session_id": runtime.session_id,
                        "callsign": runtime.callsign,
                        "label": runtime.label,
                        "ts": wall_offset + row["timestamp"],
                        "lat": row["lat"],
                        "lon": row["lon"],
                        "alt_ft": row["alt_ft"],
                        "ias_kt": row["ias_kt"],
                        "tas_kt": row["tas_kt"],
                        "gs_kt": row["gs_kt"],
                        "heading": row["heading"],
                        "pitch": row["pitch"],
                        "roll": row["roll"],
                        "params": row["params"] or {},
                    }
                )
                runtime.sent_rows += 1
                after_ts = row["timestamp"]
    except Exception:
        logger.exception("Replay 재생 실패 (session_id=%s)", runtime.session_id)
        runtime.error = "재생 중 오류가 발생했습니다."
    finally:
        runtime.finished = True
        await _broadcast(
            {
                "type": "end",
                "session_id": runtime.session_id,
                "callsign": runtime.callsign,
                "label": runtime.label,
            }
        )
        _active.pop(runtime.session_id, None)


async def start_replay(session_ids: list[int]) -> dict:
    """선택된 세션(최대 `REPLAY_MAX_SESSIONS`개)의 재생을 시작한다. 이미 재생
    중이면 먼저 정지한 뒤 새 선택으로 다시 시작한다(단순한 단일 재생 상태 유지)."""
    from asgiref.sync import sync_to_async
    from django.conf import settings

    from apps.data_management.models import FlightSession

    max_sessions = getattr(settings, "REPLAY_MAX_SESSIONS", 5)
    session_ids = list(dict.fromkeys(session_ids))[:max_sessions]

    if _active:
        await stop_replay()

    sessions = await sync_to_async(lambda: list(FlightSession.objects.filter(pk__in=session_ids)))()
    by_id = {s.id: s for s in sessions}

    results = []
    for sid in session_ids:
        session = by_id.get(sid)
        if session is None:
            results.append({"session_id": sid, "status": "error", "message": "세션을 찾을 수 없습니다."})
            continue

        takeoff_ts = await sync_to_async(_detect_takeoff_ts_sync)(sid)
        if takeoff_ts is None:
            takeoff_ts = session.start_time.timestamp()
            logger.warning("세션 %s 이륙 시점 감지 실패 — 세션 시작 시각으로 대체", sid)

        total_rows = await sync_to_async(_count_rows_sync)(sid, takeoff_ts)
        if total_rows == 0:
            results.append({"session_id": sid, "status": "error", "message": "재생할 데이터가 없습니다."})
            continue

        runtime = _ReplayRuntime(
            session_id=sid,
            callsign=session.callsign,
            label=f"{session.callsign}_Replay",
            total_rows=total_rows,
        )
        _active[sid] = runtime
        runtime.task = asyncio.ensure_future(_play_session(runtime, takeoff_ts))
        results.append(
            {"session_id": sid, "status": "started", "callsign": session.callsign, "total_rows": total_rows}
        )

    return {"results": results}


async def stop_replay() -> None:
    tasks = [r.task for r in _active.values() if r.task is not None]
    for t in tasks:
        t.cancel()
    for t in tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
    _active.clear()
