"""
X-Plane 12 UDP 수신 모듈.

X-Plane DATA 출력 포맷 파서:
  DHEAD       = 5  : 헤더 b'DATA*' (5바이트)
  RECORD_SIZE = 36 : 그룹당 36바이트
    - group_index : 4바이트 (int32 LE, 패딩 없음)
    - values      : 8 × float32 LE (32바이트)
"""
import asyncio
import logging
import os
import struct
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_DHEAD = 5                        # 헤더: b'DATA*' (5바이트)
_RECORD_SIZE = 36                 # group_index(4) + values(8×float32=32) = 36바이트
_DATA_HEADER = b'DATA*'           # 5바이트 전체 헤더


# ─── 수신 상태 싱글톤 ─────────────────────────────────────────
@dataclass
class _UdpStatus:
    is_receiving: bool = False
    last_packet_time: float = 0.0
    source_addr: str = ""
    total_packets: int = 0
    packets_per_second: float = 0.0
    received_groups: dict = field(default_factory=dict)  # group_idx → 마지막 수신 시각
    last_payload: dict = field(default_factory=dict)
    _win_start: float = field(default_factory=time.time, repr=False)
    _win_count: int = field(default=0, repr=False)


udp_status = _UdpStatus()
_transports: list = []

# ─── 비행 데이터 저장 버퍼 (CLAUDE.md §10) ─────────────────────
# 활성 세션이 있는 동안에만 채워지고, 주기적으로 bulk_create로 flush된다.
# 패킷마다 동기 저장하면 20ms 주기를 못 맞춰 이벤트루프가 막히므로 버퍼링한다.
_flight_data_buffer: list = []


def _payload_to_flight_data(session_id: int, payload: dict):
    """수신된 패킷을 하나도 빠짐없이 FlightData 1행으로 만든다 — X-Plane이 이번
    패킷에 실제로 보낸 그룹이 무엇이든(위치 그룹이 없어도) 저장한다. 요약
    컬럼(lat/lon 등)은 없으면 NULL — 값을 지어내지 않는다. 원본은 항상
    `params`(raw 그룹 포함, `_parse()` 참고)에 그대로 들어있다."""
    from apps.data_management.models import FlightData

    return FlightData(
        session_id=session_id,
        timestamp=payload["ts"],
        lat=payload.get("lat"),
        lon=payload.get("lon"),
        alt_ft=payload.get("alt_ft"),
        ias_kt=payload.get("ias_kt"),
        tas_kt=payload.get("tas_kt"),
        gs_kt=payload.get("gs_kt"),
        heading=payload.get("heading"),
        pitch=payload.get("pitch"),
        roll=payload.get("roll"),
        params=payload.get("params", {}),
    )


async def _flush_flight_data_loop() -> None:
    from asgiref.sync import sync_to_async
    from django.conf import settings

    from apps.data_management.models import FlightData

    interval = getattr(settings, "FLIGHT_DATA_FLUSH_INTERVAL_SEC", 1.0)
    while True:
        await asyncio.sleep(interval)
        if not _flight_data_buffer:
            continue
        batch = _flight_data_buffer[:]
        _flight_data_buffer.clear()
        try:
            await sync_to_async(FlightData.objects.bulk_create)(batch)
        except Exception:
            # 유실 방지 — 다음 flush 주기에 재시도(DB 일시 장애 대비). DB가
            # 장시간 다운되면 버퍼가 계속 자라나므로, 장애가 길어질 경우
            # 별도 대응이 필요할 수 있음(§10 미확정 항목 참고 가치).
            logger.exception("FlightData bulk_create 실패 — 다음 주기에 재시도 (%d건)", len(batch))
            _flight_data_buffer[:0] = batch


# ─── 파서 ─────────────────────────────────────────────────────
def _parse(data: bytes) -> dict:
    """X-Plane DATA 패킷을 파싱하여 표준 페이로드 dict를 반환."""
    if len(data) < _DHEAD or data[:_DHEAD] != _DATA_HEADER:
        logger.debug("패킷 헤더 불일치: %s", data[:_DHEAD])
        return {}

    from .dataref_config import GROUP_MAP, STANDARD_FIELD_MAP

    groups: dict[str, dict] = {}
    offset = _DHEAD

    while offset + _RECORD_SIZE <= len(data):
        group_idx = struct.unpack_from('<i', data, offset)[0]
        values: tuple = struct.unpack_from('<8f', data, offset + 4)  # 4바이트 group_index 이후
        offset += _RECORD_SIZE

        if group_idx not in GROUP_MAP:
            # dataref_config.py에 아직 등록 안 된 그룹도 원본 8-float를 그대로
            # 보존한다 — X-Plane이 실제로 보낸 데이터를 이름 매핑이 없다는
            # 이유로 버리지 않기 위함(CLAUDE.md §10 "UDP 정보 전체 저장" 요구).
            # 필드명 매핑은 없지만 수치 자체는 유실 없이 params에 남는다.
            groups[f"_unknown_{group_idx}"] = list(values)
            continue

        group_def = GROUP_MAP[group_idx]
        group_name: str = group_def["name"]
        parsed: dict[str, float] = {}

        for i, fname in enumerate(group_def["fields"]):
            if fname is not None:
                val = float(values[i])
                # X-Plane "not applicable" 센티널 값 필터 (-999 계열)
                if val > -998.0:
                    parsed[fname] = val
            else:
                # Dummy 필드도 미등록 그룹(_unknown_*)과 동일하게 원본 값을
                # 보존한다 — 이름 매핑이 없다는 이유로 조용히 버리지 않는다
                # (CLAUDE.md §1 "UDP 정보 전체 저장" 원칙, 2026-08-28 반영).
                # 의미를 모르는 슬롯이므로 센티널 필터는 적용하지 않는다.
                parsed[f"_dummy_{i}"] = float(values[i])

        groups[group_name] = parsed
        udp_status.received_groups[group_idx] = time.time()

    remaining = len(data) - offset
    if remaining > 0:
        logger.warning("패킷 끝 잘린 레코드 무시: %d바이트 남음", remaining)

    if not groups:
        return {}

    # WebSocket 표준 페이로드 구성
    payload: dict = {"ts": time.time(), "params": groups}

    for (grp_name, field_name), ws_key in STANDARD_FIELD_MAP.items():
        if grp_name in groups and field_name in groups[grp_name]:
            payload[ws_key] = groups[grp_name][field_name]

    return payload


# ─── 상태 갱신 ────────────────────────────────────────────────
def _update_status(payload: dict, addr: tuple, now: float) -> None:
    udp_status.is_receiving = True
    udp_status.last_packet_time = now
    udp_status.source_addr = f"{addr[0]}:{addr[1]}"
    udp_status.total_packets += 1
    udp_status.last_payload = payload

    # 1초 슬라이딩 윈도우 PPS 계산
    udp_status._win_count += 1
    elapsed = now - udp_status._win_start
    if elapsed >= 1.0:
        udp_status.packets_per_second = udp_status._win_count / elapsed
        udp_status._win_start = now
        udp_status._win_count = 0


# ─── 상태 조회 API ────────────────────────────────────────────
def get_status_dict() -> dict:
    """현재 UDP 수신 상태를 JSON 직렬화 가능한 dict로 반환."""
    from .dataref_config import GROUP_MAP

    now = time.time()
    since_last = (now - udp_status.last_packet_time) if udp_status.last_packet_time else None
    is_active = since_last is not None and since_last < 3.0

    groups_info: dict[int, dict] = {}
    for idx, gdef in GROUP_MAP.items():
        last_seen = udp_status.received_groups.get(idx, 0)
        groups_info[idx] = {
            "label": gdef["label"],
            "receiving": last_seen > 0 and (now - last_seen) < 3.0,
        }

    last = udp_status.last_payload
    snapshot: dict = {}
    if last:
        for key in ("ias_kt", "tas_kt", "gs_kt", "alt_ft", "vvi_fpm",
                    "pitch", "roll", "heading", "lat", "lon",
                    "g_normal", "mach", "aoa_deg", "beta_deg"):
            val = last.get(key)
            if val is not None:
                snapshot[key] = round(val, 4)

    return {
        "is_active":            is_active,
        "is_receiving":         udp_status.is_receiving,
        "last_packet_time":     udp_status.last_packet_time,
        "since_last_sec":       round(since_last, 2) if since_last is not None else None,
        "source_addr":          udp_status.source_addr,
        "total_packets":        udp_status.total_packets,
        "packets_per_second":   round(udp_status.packets_per_second, 1),
        "received_groups":      sorted(udp_status.received_groups.keys()),
        "groups_info":          {str(k): v for k, v in groups_info.items()},
        "snapshot":             snapshot,
    }


# ─── asyncio Protocol ─────────────────────────────────────────
class _XPlaneProtocol(asyncio.DatagramProtocol):
    def __init__(self, channel_layer) -> None:
        self.channel_layer = channel_layer

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        try:
            payload = _parse(data)
            if not payload:
                return

            now = time.time()
            _update_status(payload, addr, now)

            from apps.data_management.session_state import get_active_session_id

            session_id = get_active_session_id()
            if session_id is not None:
                _flight_data_buffer.append(_payload_to_flight_data(session_id, payload))

            asyncio.ensure_future(
                self.channel_layer.group_send(
                    "flight_data",
                    {"type": "flight.update", "data": payload},
                )
            )
        except Exception:
            logger.exception("UDP 패킷 처리 오류 (addr=%s)", addr)


def _should_start() -> bool:
    """Django runserver는 두 프로세스를 사용:

      - 외부(reloader) 프로세스: RUN_MAIN 미설정, 실제로 서버를 서빙하지 않음
      - 내부(app)      프로세스: RUN_MAIN="true", 실제 ASGI 서버 실행

    UDP 리스너는 실제로 서빙하는 내부 프로세스에서만 실행해야 한다.
    """
    import sys

    using_runserver = any("runserver" in arg for arg in sys.argv)
    run_main = os.environ.get("RUN_MAIN")

    if using_runserver and run_main != "true":
        return "--noreload" in sys.argv
    return True


# ─── 진입점 ───────────────────────────────────────────────────
_listener_started = False


async def start_udp_listener() -> None:
    """ASGI 서버를 실제로 구동하는 이벤트 루프 위에서 UDP 리스너를 시작한다.
    (apps.py의 ready()가 Daphne의 twisted_loop에 태스크로 예약하거나,
    lifespan을 지원하는 서버라면 config/asgi.py의 lifespan startup에서 호출)

    중요: 이 함수는 반드시 ASGI 서버를 구동하는 이벤트 루프에서 실행되어야
    한다. Channels의 InMemoryChannelLayer는 채널마다 asyncio.Queue를 만들어
    사용하는데, 이 큐는 그것을 생성/대기하는 이벤트 루프에 종속된다. 별도
    스레드에서 독립된 이벤트 루프를 만들어 group_send()를 호출하면(과거
    구현), WebSocket Consumer가 대기 중인 큐의 Future를 다른 스레드에서
    깨우게 되어 즉시 전달되지 않고 쌓였다가 메인 루프가 우연히 다시 깨어날
    때 한꺼번에 배출되는 현상(버퍼링처럼 보이는 끊김)이 발생했다.

    여러 시작 경로가 중복 호출할 수 있으므로 멱등하게 동작한다.
    """
    global _listener_started
    if _listener_started or not _should_start():
        return
    _listener_started = True

    from channels.layers import get_channel_layer
    from django.conf import settings

    port: int = getattr(settings, "UDP_PORT", 49100)
    loop = asyncio.get_running_loop()
    channel_layer = get_channel_layer()

    transport, _ = await loop.create_datagram_endpoint(
        lambda: _XPlaneProtocol(channel_layer),
        local_addr=("0.0.0.0", port),
    )
    logger.info("UDP 리스너 시작: 0.0.0.0:%d", port)
    _transports.append(transport)

    asyncio.ensure_future(_flush_flight_data_loop())


def stop_udp_listener() -> None:
    """ASGI lifespan shutdown 시점에 호출되어 UDP 소켓을 정리한다."""
    for transport in _transports:
        transport.close()
    _transports.clear()
