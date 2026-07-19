from django.urls import path

from .views import (
    FlightPlanDeleteView,
    FlightPlanDetailView,
    FlightPlanningIndexView,
    FlightPlanPreviewView,
    FlightPlanSaveView,
)

app_name = "flight_planning"

urlpatterns = [
    path("", FlightPlanningIndexView.as_view(), name="index"),
    path("save/", FlightPlanSaveView.as_view(), name="save"),
    path("preview/", FlightPlanPreviewView.as_view(), name="preview"),
    path("<int:pk>/", FlightPlanDetailView.as_view(), name="detail"),
    path("<int:pk>/delete/", FlightPlanDeleteView.as_view(), name="delete"),
]
