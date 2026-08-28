from django.urls import re_path

from .consumers import ReplayDataConsumer

websocket_urlpatterns = [
    re_path(r"^ws/replay/$", ReplayDataConsumer.as_asgi()),
]
