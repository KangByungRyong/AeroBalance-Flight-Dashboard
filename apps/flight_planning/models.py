from django.db import models


class FlightPlan(models.Model):
    """FPL 라이브러리 항목. `docs/ABFAP_FPL_Interface.md` §1-2 Injection 요청 필드와
    1:1 대응하도록 구성 — 이 레코드에서 그대로 POST payload를 만들 수 있다.
    """

    name = models.CharField("이름", max_length=100, unique=True)
    aircraft_type = models.CharField("기종", max_length=50, blank=True)
    dep = models.CharField("출발지 ICAO", max_length=8, blank=True)
    arr = models.CharField("목적지 ICAO", max_length=8, blank=True)
    eta = models.DateTimeField(
        "도착 예정시각 (ETA)",
        help_text="EOBT는 이 값에서 역산됨 (CLAUDE.md §8 참고)",
    )

    departure_name = models.CharField("출발 지점명", max_length=30, blank=True)
    departure_lat = models.FloatField("출발 위도")
    departure_lon = models.FloatField("출발 경도")
    departure_alt = models.FloatField("출발 고도 (ft)")
    departure_velocity = models.FloatField("출발 속도 (kt)", default=0)

    arrival_name = models.CharField("도착 지점명", max_length=30, blank=True)
    arrival_lat = models.FloatField("도착 위도")
    arrival_lon = models.FloatField("도착 경도")
    arrival_alt = models.FloatField("도착 고도 (ft)")
    arrival_velocity = models.FloatField("도착 속도 (kt)", default=0)

    created_at = models.DateTimeField("생성 시각", auto_now_add=True)
    updated_at = models.DateTimeField("수정 시각", auto_now=True)

    class Meta:
        db_table = "flight_plan"
        ordering = ["-updated_at"]
        verbose_name = "Flight Plan"
        verbose_name_plural = "Flight Plan 목록"

    def __str__(self) -> str:
        return self.name

    def to_dict(self) -> dict:
        """지도/편집 폼 로드 및 Injection 페이로드 생성에 공용으로 쓰는 표현."""
        return {
            "id": self.pk,
            "name": self.name,
            "aircraft_type": self.aircraft_type,
            "dep": self.dep,
            "arr": self.arr,
            "eta": self.eta.isoformat(),
            "departure": {
                "name": self.departure_name,
                "lat": self.departure_lat,
                "lon": self.departure_lon,
                "alt": self.departure_alt,
                "velocity": self.departure_velocity,
            },
            "arrival": {
                "name": self.arrival_name,
                "lat": self.arrival_lat,
                "lon": self.arrival_lon,
                "alt": self.arrival_alt,
                "velocity": self.arrival_velocity,
            },
            "waypoints": [
                {
                    "seq": wp.seq,
                    "name": wp.name,
                    "lat": wp.lat,
                    "lon": wp.lon,
                    "alt": wp.alt,
                    "velocity": wp.velocity,
                }
                for wp in self.waypoints.all()
            ],
        }


class FlightPlanWaypoint(models.Model):
    """출발/도착을 제외한 순수 경유점 (`docs/ABFAP_FPL_Interface.md` §1-3 참고)."""

    flight_plan = models.ForeignKey(
        FlightPlan, related_name="waypoints", on_delete=models.CASCADE
    )
    seq = models.PositiveIntegerField("순서")
    name = models.CharField("지점명", max_length=30, blank=True)
    lat = models.FloatField("위도")
    lon = models.FloatField("경도")
    alt = models.FloatField("고도 (ft)")
    velocity = models.FloatField("속도 (kt)", default=0)

    class Meta:
        db_table = "flight_plan_waypoint"
        ordering = ["seq"]
        unique_together = [("flight_plan", "seq")]
        verbose_name = "경유점"
        verbose_name_plural = "경유점 목록"

    def __str__(self) -> str:
        return f"{self.flight_plan.name} #{self.seq} {self.name}"
