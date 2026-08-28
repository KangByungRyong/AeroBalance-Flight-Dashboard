from django.urls import path

from .views import (
    ReplayIndexView,
    replay_sessions_api,
    replay_start_view,
    replay_status_api,
    replay_stop_view,
)

app_name = "replay"

urlpatterns = [
    path("", ReplayIndexView.as_view(), name="index"),
    path("api/sessions/", replay_sessions_api, name="sessions_api"),
    path("start/", replay_start_view, name="start"),
    path("stop/", replay_stop_view, name="stop"),
    path("status/", replay_status_api, name="status"),
]
