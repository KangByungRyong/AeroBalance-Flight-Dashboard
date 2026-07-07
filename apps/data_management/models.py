from django.db import models


class FlightSession(models.Model):
    pilot_name = models.CharField("조종사명", max_length=100)
    organization = models.CharField("소속", max_length=200, blank=True)
    start_time = models.DateTimeField("시작 시각", auto_now_add=True)
    end_time = models.DateTimeField("종료 시각", null=True, blank=True)
    notes = models.TextField("메모", blank=True)

    class Meta:
        db_table = "flight_session"
        ordering = ["-start_time"]
        verbose_name = "비행 세션"
        verbose_name_plural = "비행 세션 목록"

    def __str__(self) -> str:
        return f"{self.pilot_name} / {self.start_time:%Y-%m-%d %H:%M}"

    @property
    def is_active(self) -> bool:
        return self.end_time is None


class FlightData(models.Model):
    session = models.ForeignKey(
        FlightSession,
        on_delete=models.CASCADE,
        related_name="flight_data",
        db_index=False,  # 복합 인덱스로 대체
    )
    timestamp = models.FloatField("타임스탬프 (Unix)")
    lat = models.FloatField("위도")
    lon = models.FloatField("경도")
    alt_ft = models.FloatField("고도 (ft)")
    ias_kt = models.FloatField("IAS (kt)")
    tas_kt = models.FloatField("TAS (kt)", default=0.0)
    gs_kt = models.FloatField("지상속도 (kt)", default=0.0)
    heading = models.FloatField("헤딩 (°)")
    pitch = models.FloatField("피치 (°)")
    roll = models.FloatField("롤 (°)")
    params = models.JSONField("추가 파라미터", default=dict, blank=True)

    class Meta:
        db_table = "flight_data"
        indexes = [
            models.Index(fields=["session", "timestamp"], name="idx_session_timestamp"),
        ]
        verbose_name = "비행 데이터"
        verbose_name_plural = "비행 데이터 목록"

    def __str__(self) -> str:
        return f"Session {self.session_id} @ {self.timestamp}"


class FlightEvent(models.Model):
    session = models.ForeignKey(
        FlightSession,
        on_delete=models.CASCADE,
        related_name="events",
    )
    timestamp = models.DateTimeField("발생 시각", auto_now_add=True)
    category = models.CharField("카테고리", max_length=50, blank=True)
    description = models.TextField("설명")

    class Meta:
        db_table = "flight_event"
        ordering = ["timestamp"]
        verbose_name = "특이사항"
        verbose_name_plural = "특이사항 목록"

    def __str__(self) -> str:
        return f"[{self.category}] {self.description[:40]}"
