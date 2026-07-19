from django.urls import path

from .views import InjectionIndexView, InjectionPreviewView, InjectionSendView

app_name = "flight_plan_injection"

urlpatterns = [
    path("", InjectionIndexView.as_view(), name="index"),
    path("preview/", InjectionPreviewView.as_view(), name="preview"),
    path("send/", InjectionSendView.as_view(), name="send"),
]
