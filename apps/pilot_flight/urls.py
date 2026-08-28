from django.urls import path

from .views import PilotFlightIndexView

app_name = "pilot_flight"

urlpatterns = [
    path("", PilotFlightIndexView.as_view(), name="index"),
]
