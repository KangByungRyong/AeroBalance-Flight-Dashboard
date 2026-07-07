from django.urls import path

from .views import ReplayIndexView

app_name = "replay"

urlpatterns = [
    path("", ReplayIndexView.as_view(), name="index"),
]
