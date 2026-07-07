from django.urls import path

from .views import StripChartExternalView, StripChartIndexView

app_name = "strip_chart"

urlpatterns = [
    path("", StripChartIndexView.as_view(), name="index"),
    path("external/", StripChartExternalView.as_view(), name="external"),
]
