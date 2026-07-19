from django.urls import path

from .views import RestStatusView, models_api, rest_status_api, tracks_api

app_name = "absim_link"

urlpatterns = [
    path("", RestStatusView.as_view(), name="status"),
    path("api/status/", rest_status_api, name="status_api"),
    path("api/tracks/", tracks_api, name="tracks_api"),
    path("api/models/", models_api, name="models_api"),
]
