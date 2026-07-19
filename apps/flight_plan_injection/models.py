from django.db import models


class FlightPlanInjection(models.Model):
    """ABSim-Dashboard로의 Injection 이력.

    `docs/Debug_FPL_Feature_Reference.md` §2 핵심 설계를 그대로 따른다: FK가 아니라
    이름 스냅샷을 같이 저장해 원본 FlightPlan/Model이 삭제·변경돼도 이력 조회가
    깨지지 않는다.
    """

    flight_plan = models.ForeignKey(
        "flight_planning.FlightPlan",
        null=True,
        on_delete=models.SET_NULL,
        related_name="injections",
    )
    flight_plan_name = models.CharField("FPL 이름 (스냅샷)", max_length=100)
    target_model_name = models.CharField("대상 Model", max_length=50)
    callsign = models.CharField("Callsign", max_length=20)
    gufi_id = models.CharField("GufiID", max_length=50)
    eobt = models.DateTimeField("EOBT (계산값)", null=True, blank=True)

    dashboard_injection_id = models.IntegerField("Dashboard injection_id", null=True, blank=True)
    dashboard_flight_plan_id = models.IntegerField("Dashboard flight_plan_id", null=True, blank=True)
    status_code = models.IntegerField("HTTP 상태 코드", null=True, blank=True)
    success = models.BooleanField("성공 여부", default=False)
    error_message = models.CharField("오류 메시지", max_length=255, blank=True)

    injected_at = models.DateTimeField("전송 시각", auto_now_add=True)

    class Meta:
        db_table = "flight_plan_injection"
        ordering = ["-injected_at"]
        verbose_name = "Flight Plan Injection 이력"
        verbose_name_plural = "Flight Plan Injection 이력"

    def __str__(self) -> str:
        return f"{self.flight_plan_name} → {self.target_model_name} ({'성공' if self.success else '실패'})"
