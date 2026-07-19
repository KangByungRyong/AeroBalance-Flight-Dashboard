"""Flight Plan → X-Plane `.fms`(v11) 내보내기 (`CLAUDE.md` §10).

X-Plane REST/WebSocket Web API는 FMS 라우트 쓰기를 지원하지 않고, 네이티브
Plugin SDK 전용 함수(`XPLMLoadFMSFlightPlan` 등)도 ABFAP에서 직접 호출할 수
없다(X-Plane은 별도 PC, 10.0.0.110). 대신 X-Plane이 읽을 수 있는 v11 `.fms`
텍스트 파일을 생성해 다운로드 제공하면, 사용자가 수동으로 X-Plane PC의
`Output/FMS plans/` 폴더에 배치하고 X-Plane에서 LOAD한다.

전 지점(출발/경유/도착)을 위경도(lat/lon) fix(type 28)로 채운다 — 공항/절차를
ICAO 식별자로 참조하면 X-Plane 항법데이터베이스(AIRAC 사이클) 버전 불일치로
못 찾을 수 있기 때문. `CYCLE`은 항법데이터를 참조하지 않으므로 임의값으로 채운다.

주의: 이 포맷은 실제 X-Plane 12 LOAD 테스트로 검증되지 않았다 — 커뮤니티에
문서화된 v11 포맷 규격을 따랐으나, 운영 배치 전 반드시 실기에서 LOAD가 되는지
확인할 것 (미확정 항목, `CLAUDE.md` 참고).

`build_fms_text()`는 `FlightPlan.to_dict()`와 같은 모양의 plain dict
(`dep`/`arr`/`departure`/`arrival`/`waypoints`)를 받는다 — 저장된 FlightPlan
레코드뿐 아니라 Pilot Flight 페이지에서 Edit Box로 조정한, 아직 저장되지 않은
좌표로도 그대로 생성할 수 있도록 모델 인스턴스에 의존하지 않는다.
"""
from datetime import datetime

_FIX_TYPE = 28  # lat/lon 사용자 지점(navdata 조회 불필요)


def _line(name: str, alt_ft: float, lat: float, lon: float) -> str:
    safe_name = (name or "WPT").strip().replace(" ", "_")[:10].upper() or "WPT"
    return f"{_FIX_TYPE} {safe_name} {float(alt_ft):.6f} {float(lat):.6f} {float(lon):.6f}"


def build_fms_text(plan: dict) -> str:
    departure = plan.get("departure") or {}
    arrival = plan.get("arrival") or {}
    waypoints = plan.get("waypoints") or []

    entries = [
        _line(
            departure.get("name") or plan.get("dep") or "DEP",
            departure.get("alt") or 0,
            departure["lat"],
            departure["lon"],
        ),
        *[
            _line(wp.get("name") or f"WPT{i + 1}", wp.get("alt") or 0, wp["lat"], wp["lon"])
            for i, wp in enumerate(waypoints)
        ],
        _line(
            arrival.get("name") or plan.get("arr") or "ARR",
            arrival.get("alt") or 0,
            arrival["lat"],
            arrival["lon"],
        ),
    ]

    lines = [
        "I",
        "1100 Version",
        "CYCLE 0000",
        f"ADEP {plan.get('dep') or 'ZZZZ'}",
        f"ADES {plan.get('arr') or 'ZZZZ'}",
        f"NUMENR {len(entries)}",
        *entries,
    ]
    return "\n".join(lines) + "\n"


def build_fms_filename(callsign: str, when: datetime) -> str:
    safe_callsign = "".join(c for c in callsign if c.isalnum()) or "FLIGHT"
    return f"{safe_callsign}_{when:%Y%m%d}.fms"
