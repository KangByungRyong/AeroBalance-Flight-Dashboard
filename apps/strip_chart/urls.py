from django.urls import path

from .views import StripChartIndexView

app_name = "strip_chart"

urlpatterns = [
    path("", StripChartIndexView.as_view(), name="index"),
]
