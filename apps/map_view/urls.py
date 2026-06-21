from django.urls import path

from .views import MapIndexView

app_name = "map_view"

urlpatterns = [
    path("", MapIndexView.as_view(), name="index"),
]
