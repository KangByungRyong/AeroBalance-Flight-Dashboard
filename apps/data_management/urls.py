from django.urls import path

from .views import DataManagementIndexView

app_name = "data_management"

urlpatterns = [
    path("", DataManagementIndexView.as_view(), name="index"),
    # ─── 추후 구성 예정 ───
    # path("session/start/", SessionStartView.as_view(), name="session_start"),
    # path("session/<int:pk>/end/", SessionEndView.as_view(), name="session_end"),
    # path("session/<int:session_pk>/event/", EventCreateView.as_view(), name="event_create"),
]
