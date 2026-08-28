"""EOBT 역산 로직 (`CLAUDE.md` §8, 2026-07-18 확정 / 2026-07-19 첫 Waypoint 예외 추가).

사용자가 도착 예정시각(ETA)을 입력하면, 경로를 [departure, waypoints…, arrival]
순서로 두고 각 구간(leg)의 거리를 그 구간 **도착 지점의 velocity(kt)** 로 나눠
소요시간을 구한다. 총 비행시간(=Σleg_time + 이착륙 각 20초)만큼 ETA에서 거슬러
올라간 시각이 EOBT다. 같은 방식으로 각 지점의 통과 예정 UTC도 계산한다.

**예외**: departure/arrival의 velocity는 항상 0으로 기재되며(순항 속도가 아니라
각각 이륙/착륙을 의미) 실제 순항 시간 계산에 쓰지 않는다.
- [departure → 첫 Waypoint] 구간: 첫 Waypoint는 이륙 고도(climb-out)를 의미하므로
  거리/속도 계산 없이 이륙 구간(20초)에 포함된 것으로 처리한다 — 첫 Waypoint의
  통과 예정 UTC는 출발 UTC와 동일(`eobt + 20초`).
- [마지막 Waypoint → arrival] 구간: 마지막 Waypoint는 착륙 진입(final approach)을
  의미하므로 동일하게 거리/속도 계산 없이 착륙 구간(20초)에 포함된 것으로
  처리한다 — arrival의 통과 예정 UTC는 마지막 Waypoint와 동일.
- 따라서 순항 시간 계산에는 Waypoint 간 구간만 쓰이며, Waypoint가 하나도 없는
  (departure→arrival 직항) 경로는 순항 속도를 구할 방법이 없어 `ScheduleError`.

`docs/ABFAP_FPL_Interface.md`의 `eobt`/`departure.utc`/`arrival.utc`/
`waypoints[].utc` 필드를 채우는 데 쓰인다 (Injection 단계, `apps/flight_plan_injection`).
"""
import math
from datetime import datetime, timedelta

EARTH_RADIUS_NM = 3440.065
TAKEOFF_SEC = 20
LANDING_SEC = 20


class ScheduleError(ValueError):
    """구간별 속도 누락 등으로 일정을 계산할 수 없을 때."""


def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(a))


def _leg_seconds(points: list[dict]) -> list[float]:
    """points: [{"lat", "lon", "velocity"}, ...] (departure → waypoints → arrival 순서).

    각 leg의 소요시간(초) 목록을 반환. 구간 속도가 0 이하/누락이면 ScheduleError.
    """
    if len(points) < 2:
        raise ScheduleError("최소 출발/도착 2개 지점이 필요합니다.")
    if len(points) == 2:
        raise ScheduleError(
            "출발/도착 속도는 이/착륙을 의미해 순항 시간 계산에 쓸 수 없습니다 — "
            "최소 1개 이상의 경유점(순항 속도)이 필요합니다."
        )

    # [출발 → 첫 Waypoint], [마지막 Waypoint → 도착] 두 구간은 순항이 아니라
    # 이륙/착륙 구간이므로 거리/속도 계산 없이 각각 이륙·착륙 시간(20초)에 포함한다.
    leg_seconds: list[float] = [0.0]
    for i in range(1, len(points) - 2):
        a, b = points[i], points[i + 1]
        speed_kt = b.get("velocity") or 0
        if speed_kt <= 0:
            raise ScheduleError(f"{i + 2}번째 지점의 속도(velocity)가 필요합니다.")
        dist_nm = _haversine_nm(a["lat"], a["lon"], b["lat"], b["lon"])
        leg_seconds.append(dist_nm / speed_kt * 3600.0)
    leg_seconds.append(0.0)
    return leg_seconds


def _utc_list_from_eobt(eobt: datetime, leg_seconds: list[float]) -> list[datetime]:
    utc_list = [eobt + timedelta(seconds=TAKEOFF_SEC)]
    cumulative = 0.0
    for leg_sec in leg_seconds:
        cumulative += leg_sec
        utc_list.append(eobt + timedelta(seconds=TAKEOFF_SEC + cumulative))
    return utc_list


def compute_schedule(points: list[dict], eta: datetime) -> dict:
    """ETA(도착 예정시각)에서 EOBT를 역산 (Flight Planning 화면 — CLAUDE.md §8).

    반환: {"eobt": datetime, "utc_list": list[datetime]} — utc_list는 points와 1:1 대응.
    """
    leg_seconds = _leg_seconds(points)
    total_flight_sec = sum(leg_seconds) + TAKEOFF_SEC + LANDING_SEC
    eobt = eta - timedelta(seconds=total_flight_sec)
    return {"eobt": eobt, "utc_list": _utc_list_from_eobt(eobt, leg_seconds)}


def compute_schedule_from_eobt(points: list[dict], eobt: datetime) -> dict:
    """EOBT(출발 예정시각)를 직접 기준으로 각 지점 통과 UTC를 순방향 계산.

    Flight Plan Injection — EOBT = Injection 시각(현재 시간) + Offset으로 이미
    정해져 있으므로 ETA 역산 없이 바로 순방향 계산한다.
    반환 형식은 `compute_schedule()`과 동일.
    """
    leg_seconds = _leg_seconds(points)
    return {"eobt": eobt, "utc_list": _utc_list_from_eobt(eobt, leg_seconds)}


def _points_for_plan(flight_plan) -> list[dict]:
    return [
        {"lat": flight_plan.departure_lat, "lon": flight_plan.departure_lon,
         "velocity": flight_plan.departure_velocity},
        *[
            {"lat": wp.lat, "lon": wp.lon, "velocity": wp.velocity}
            for wp in flight_plan.waypoints.all()
        ],
        {"lat": flight_plan.arrival_lat, "lon": flight_plan.arrival_lon,
         "velocity": flight_plan.arrival_velocity},
    ]


def compute_schedule_for_plan(flight_plan) -> dict:
    """`FlightPlan` 인스턴스의 ETA로부터 바로 일정을 계산하는 편의 함수 (Flight Planning 화면용)."""
    return compute_schedule(_points_for_plan(flight_plan), flight_plan.eta)


def compute_schedule_for_plan_from_eobt(flight_plan, eobt: datetime) -> dict:
    """`FlightPlan` 인스턴스의 좌표/속도만 가져와 주어진 EOBT 기준으로 순방향 계산 (Injection 화면용)."""
    return compute_schedule_from_eobt(_points_for_plan(flight_plan), eobt)
