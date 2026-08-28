"""`docs/Debug_FPL.ini` + `DebugFPL_Waypoint*.ini`(옛 Debug FPL 시드 데이터, `docs/
Debug_FPL_Feature_Reference.md` §5 참고)를 FlightPlan 라이브러리로 가져오는 시드 커맨드.

이름(Debug_FPL.ini의 노선명) 기준 get_or_create — 재실행해도 안전(중복 생성 안 됨).
기존 레코드가 있으면 경로(출발/도착/경유점)만 갱신하고, 사용자가 화면에서 입력했을
ETA는 신규 생성 시에만 임시값을 채우고 이후에는 건드리지 않는다.

ini 포맷은 출발/도착을 경유점 목록(`Total Waypoint Indx`)에도 velocity=0으로 중복
기재하므로, FlightPlan.departure_velocity/arrival_velocity에는 그 중복 행의 값을
그대로 쓰고(원본이 0이면 0), 실제 FlightPlanWaypoint 목록에서는 그 첫/마지막 행을
제외한다.
"""
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.flight_planning.models import FlightPlan, FlightPlanWaypoint

DOCS_DIR = Path(settings.BASE_DIR) / "docs"
INDEX_FILE = "Debug_FPL.ini"


def _parse_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().split(",")]


def _read_waypoint_file(path: Path) -> dict:
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    departure = _parse_row(lines[1])
    arrival = _parse_row(lines[2])
    total = int(_parse_row(lines[3])[1])
    path_rows = [_parse_row(lines[4 + i]) for i in range(total)]

    return {
        "departure_name": departure[0],
        "departure_lat": float(departure[1]),
        "departure_lon": float(departure[2]),
        "departure_alt": float(departure[3]),
        "departure_velocity": float(path_rows[0][4]),
        "arrival_name": arrival[0],
        "arrival_lat": float(arrival[1]),
        "arrival_lon": float(arrival[2]),
        "arrival_alt": float(arrival[3]),
        "arrival_velocity": float(path_rows[-1][4]),
        "waypoints": [
            {
                "name": row[0],
                "lat": float(row[1]),
                "lon": float(row[2]),
                "alt": float(row[3]),
                "velocity": float(row[4]),
            }
            for row in path_rows[1:-1]
        ],
    }


class Command(BaseCommand):
    help = "docs/Debug_FPL.ini 참조 노선 데이터를 FlightPlan 라이브러리로 시드한다."

    def handle(self, *args, **options):
        index_path = DOCS_DIR / INDEX_FILE
        index_lines = (l for l in index_path.read_text(encoding="utf-8").splitlines() if l.strip())
        for row in (_parse_row(line) for line in index_lines):
            name, waypoint_filename = row[0], row[1]
            data = _read_waypoint_file(DOCS_DIR / waypoint_filename)
            self._seed_plan(name, data)

    @transaction.atomic
    def _seed_plan(self, name: str, data: dict) -> None:
        route_fields = {k: v for k, v in data.items() if k != "waypoints"}
        plan, created = FlightPlan.objects.get_or_create(
            name=name,
            defaults={"eta": timezone.now() + timedelta(hours=1), **route_fields},
        )
        if not created:
            for field, value in route_fields.items():
                setattr(plan, field, value)
            plan.save()

        plan.waypoints.all().delete()
        FlightPlanWaypoint.objects.bulk_create(
            FlightPlanWaypoint(flight_plan=plan, seq=seq, **wp)
            for seq, wp in enumerate(data["waypoints"], start=1)
        )

        action = "생성" if created else "갱신"
        self.stdout.write(
            self.style.SUCCESS(f"[{action}] {name} (경유점 {len(data['waypoints'])}개)")
        )
