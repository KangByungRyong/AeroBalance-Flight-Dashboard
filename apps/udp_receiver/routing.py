from django.urls import re_path

from .consumers import FlightDataConsumer

websocket_urlpatterns = [
    re_path(r"^ws/flight/$", FlightDataConsumer.as_asgi()),
]
