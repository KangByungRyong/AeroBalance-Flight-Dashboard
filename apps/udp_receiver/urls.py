from django.urls import path

from . import views

app_name = "udp_receiver"

urlpatterns = [
    path("", views.UdpStatusView.as_view(), name="status"),
    path("api/status/", views.udp_status_api, name="api_status"),
]
