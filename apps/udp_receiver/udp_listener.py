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
import threading
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

        groups[group_name] = parsed
        udp_status.received_groups[group_idx] = time.time()

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

            asyncio.ensure_future(
                self.channel_layer.group_send(
                    "flight_data",
                    {"type": "flight.update", "data": payload},
                )
            )
        except Exception:
            logger.exception("UDP 패킷 처리 오류 (addr=%s)", addr)


async def _udp_listen(port: int) -> None:
    from channels.layers import get_channel_layer

    loop = asyncio.get_running_loop()
    channel_layer = get_channel_layer()

    transport, _ = await loop.create_datagram_endpoint(
        lambda: _XPlaneProtocol(channel_layer),
        local_addr=("0.0.0.0", port),
    )
    logger.info("UDP 리스너 시작: 0.0.0.0:%d", port)
    try:
        await asyncio.Future()
    finally:
        transport.close()
        logger.info("UDP 리스너 종료")


# ─── 진입점 ───────────────────────────────────────────────────
def start_udp_listener() -> None:
    """별도 스레드에서 asyncio 이벤트 루프를 돌려 UDP 수신을 시작.

    Django runserver는 두 프로세스를 사용:
      - 외부(reloader) 프로세스: RUN_MAIN 미설정, channel layer 공유 불가
      - 내부(app)      프로세스: RUN_MAIN="true", 실제 channel layer 보유
    UDP 리스너는 내부 프로세스에서만 실행해야 한다.
    """
    import sys

    using_runserver = any("runserver" in arg for arg in sys.argv)
    run_main = os.environ.get("RUN_MAIN")

    if using_runserver and run_main != "true":
        # 자동 재로더 외부 프로세스 → 스킵 (--noreload 예외)
        if "--noreload" not in sys.argv:
            return

    from django.conf import settings

    port: int = getattr(settings, "UDP_PORT", 49100)

    def _run() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_udp_listen(port))
        except Exception:
            logger.exception("UDP 리스너 비정상 종료")
        finally:
            loop.close()

    thread = threading.Thread(target=_run, daemon=True, name="udp-listener")
    thread.start()
    logger.info("UDP 리스너 스레드 시작 (포트 %d)", port)
