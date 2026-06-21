from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.generic import TemplateView


class UdpStatusView(TemplateView):
    template_name = "udp_receiver/status.html"
    extra_context = {"active_page": "udp_status"}

    def get_context_data(self, **kwargs: object) -> dict:
        ctx = super().get_context_data(**kwargs)
        ctx["udp_port"] = getattr(settings, "UDP_PORT", 49100)
        ctx["xplane_ip"] = getattr(settings, "XPLANE_IP", "10.0.0.110")
        return ctx


def udp_status_api(request: HttpRequest) -> JsonResponse:
    """UDP 수신 상태 JSON API (1초 폴링용)."""
    from .udp_listener import get_status_dict
    return JsonResponse(get_status_dict())
