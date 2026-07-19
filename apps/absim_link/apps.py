from django.apps import AppConfig


class AbsimLinkConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.absim_link"
    verbose_name = "ABSim-Dashboard 연동"

    def ready(self) -> None:
        # apps/udp_receiver/apps.py와 동일한 이유(Daphne는 ASGI lifespan을
        # 지원하지 않음)로 twisted_loop에 직접 태스크를 예약한다.
        try:
            from daphne.server import twisted_loop
        except ImportError:
            return

        from .rest_client import start_poller
        twisted_loop.create_task(start_poller())
