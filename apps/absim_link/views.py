from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.generic import TemplateView


class RestStatusView(TemplateView):
    template_name = "absim_link/status.html"
    extra_context = {"active_page": "rest_status"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["dashboard_base_url"] = getattr(settings, "ABSIM_DASHBOARD_BASE_URL", "")
        ctx["poll_interval_sec"] = getattr(settings, "ABSIM_POLL_INTERVAL_SEC", 1.0)
        return ctx


def rest_status_api(request: HttpRequest) -> JsonResponse:
    """ABSim-Dashboard REST 연동 상태 JSON API (1초 폴링용)."""
    from .rest_client import get_status_dict
    return JsonResponse(get_status_dict())


def tracks_api(request: HttpRequest) -> JsonResponse:
    """캐시된 ABSim-Dashboard 항적 스냅샷 (Air Traffic Tracking 지도 폴링용)."""
    from .rest_client import get_tracks
    return JsonResponse({"tracks": get_tracks()})


def models_api(request: HttpRequest) -> JsonResponse:
    """캐시된 ABSim-Dashboard Model 상태 스냅샷 (Flight Plan Injection 대상 선택용)."""
    from .rest_client import get_models
    return JsonResponse({"models": get_models()})
