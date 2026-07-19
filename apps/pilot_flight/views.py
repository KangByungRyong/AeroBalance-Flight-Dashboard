from django.views.generic import TemplateView

from apps.flight_planning.models import FlightPlan


class PilotFlightIndexView(TemplateView):
    """조종사가 실제로 탑승해 운항하는 "정식 비행" 준비/시작 화면 (`CLAUDE.md` §10).

    Pilot 선택 + Callsign + 저장된 Flight Plan을 지도로 불러와 확인/조정
    (Edit Box) + `.fms` 생성/다운로드 + 데이터 저장 시작(비행 시작)을 한
    화면에서 처리한다. FPL 라이브러리 자체의 CRUD는 `flight_planning` 페이지
    책임 — 여기서는 저장된 FPL을 "불러와서 쓰기"만 한다.
    """

    template_name = "pilot_flight/index.html"
    extra_context = {"active_page": "pilot_flight"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["plans"] = FlightPlan.objects.only("id", "name", "dep", "arr")
        return ctx
