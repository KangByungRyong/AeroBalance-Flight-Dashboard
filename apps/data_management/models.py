from django.db import models


class Pilot(models.Model):
    name = models.CharField("이름", max_length=100)
    organization = models.CharField("소속", max_length=200, blank=True)
    license_no = models.CharField("자격번호", max_length=50, blank=True)
    notes = models.TextField("메모", blank=True)
    created_at = models.DateTimeField("등록 시각", auto_now_add=True)

    class Meta:
        db_table = "pilot"
        ordering = ["name"]
        verbose_name = "조종사"
        verbose_name_plural = "조종사 목록"

    def __str__(self) -> str:
        return self.name


class FlightSession(models.Model):
    class EndReason(models.TextChoices):
        MANUAL = "manual", "수동 종료"
        TIMEOUT = "timeout", "타임아웃 자동 종료"

    pilot = models.ForeignKey(
        Pilot,
        on_delete=models.PROTECT,
        related_name="flight_sessions",
        verbose_name="조종사",
    )
    flight_plan = models.ForeignKey(
        "flight_planning.FlightPlan",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="flight_sessions",
        verbose_name="Flight Plan",
        help_text="Free Flight인 경우 비워둠",
    )
    flight_plan_snapshot = models.JSONField(
        "FPL 스냅샷",
        null=True,
        blank=True,
        help_text="세션 시작 시점 FlightPlan.to_dict() 고정 — 이후 FPL이 수정/삭제돼도 안 바뀜",
    )
    callsign = models.CharField("Callsign", max_length=20)
    start_time = models.DateTimeField("시작 시각", auto_now_add=True)
    end_time = models.DateTimeField("종료 시각", null=True, blank=True)
    end_reason = models.CharField(
        "종료 사유", max_length=10, choices=EndReason.choices, blank=True
    )
    notes = models.TextField("메모", blank=True)
    archived_at = models.DateTimeField(
        "아카이브 시각",
        null=True,
        blank=True,
        help_text="설정되면 FlightData/AbsimTrackLog는 DB에서 삭제되고 archive_path 파일에만 존재",
    )
    archive_path = models.CharField("아카이브 파일 경로", max_length=500, blank=True)

    class Meta:
        db_table = "flight_session"
        ordering = ["-start_time"]
        verbose_name = "비행 세션"
        verbose_name_plural = "비행 세션 목록"

    def __str__(self) -> str:
        return f"{self.callsign} / {self.pilot.name} / {self.start_time:%Y-%m-%d %H:%M}"

    @property
    def is_active(self) -> bool:
        return self.end_time is None

    @property
    def is_free_flight(self) -> bool:
        return self.flight_plan_id is None

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None


class FlightData(models.Model):
    session = models.ForeignKey(
        FlightSession,
        on_delete=models.CASCADE,
        related_name="flight_data",
        db_index=False,  # 복합 인덱스로 대체
    )
    timestamp = models.FloatField("타임스탬프 (Unix)")
    # 요약 컬럼은 전부 nullable — 이번 패킷에 해당 그룹이 없으면 값을 지어내지
    # 않고 NULL로 남긴다. 실제로 수신된 원본은 항상 params에 보존된다
    # (`apps/udp_receiver/udp_listener.py: _payload_to_flight_data()` 참고,
    # CLAUDE.md §10 "UDP 정보 전체 저장" 요구 — 2026-07-19 반영).
    lat = models.FloatField("위도", null=True, blank=True)
    lon = models.FloatField("경도", null=True, blank=True)
    alt_ft = models.FloatField("고도 (ft)", null=True, blank=True)
    ias_kt = models.FloatField("IAS (kt)", null=True, blank=True)
    tas_kt = models.FloatField("TAS (kt)", null=True, blank=True)
    gs_kt = models.FloatField("지상속도 (kt)", null=True, blank=True)
    heading = models.FloatField("헤딩 (°)", null=True, blank=True)
    pitch = models.FloatField("피치 (°)", null=True, blank=True)
    roll = models.FloatField("롤 (°)", null=True, blank=True)
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


class AbsimTrackLog(models.Model):
    """ABSim-Dashboard REST 폴링 항적 이력 (`CLAUDE.md` §10).

    `FlightSession`과 FK로 묶지 않고 `polled_at` 시간 범위로만 느슨하게 연관시킨다
    — 세션과 무관한 Model도 포함해 폴링 시점에 뜬 전체 배열을 그대로 저장한다.
    """

    polled_at = models.FloatField("폴링 시각 (Unix)")
    model_name = models.CharField("Model", max_length=50)
    callsign = models.CharField("Callsign", max_length=20, blank=True)
    gufi_id = models.CharField("GufiID", max_length=50, blank=True)
    lat = models.FloatField("위도")
    lon = models.FloatField("경도")
    alt = models.FloatField("고도 (ft)")
    hdg = models.FloatField("헤딩 (°)", default=0.0)
    pitch = models.FloatField("피치 (°)", default=0.0)
    roll = models.FloatField("롤 (°)", default=0.0)
    spd = models.FloatField("지상속도 (kt)", default=0.0)
    tas = models.FloatField("TAS (kt)", default=0.0)
    cas = models.FloatField("CAS (kt)", default=0.0)
    uam_status = models.CharField("UAM 상태", max_length=30, blank=True)
    udp_connected = models.BooleanField("UDP 연결 상태", default=False)

    class Meta:
        db_table = "absim_track_log"
        indexes = [
            models.Index(fields=["polled_at"], name="idx_absim_track_polled_at"),
        ]
        verbose_name = "ABSim 항적 이력"
        verbose_name_plural = "ABSim 항적 이력 목록"

    def __str__(self) -> str:
        return f"{self.model_name} @ {self.polled_at}"
