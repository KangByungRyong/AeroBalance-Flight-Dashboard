from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", RedirectView.as_view(url="/map/", permanent=False)),
    path("map/", include("apps.map_view.urls")),
    path("chart/", include("apps.strip_chart.urls")),
    path("management/", include("apps.data_management.urls")),
    path("replay/", include("apps.replay.urls")),
    path("udp/", include("apps.udp_receiver.urls")),
]
