from django.apps import AppConfig


class UdpReceiverConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.udp_receiver"
    verbose_name = "UDP 수신기"

    def ready(self) -> None:
        from .udp_listener import start_udp_listener
        start_udp_listener()
