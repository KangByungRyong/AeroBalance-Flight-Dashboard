from django.apps import AppConfig


class DataManagementConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.data_management"
    verbose_name = "데이터 관리"

    def ready(self) -> None:
        # apps/udp_receiver/apps.py와 동일한 이유(Daphne는 ASGI lifespan을
        # 지원하지 않음)로 twisted_loop에 직접 태스크를 예약한다.
        try:
            from daphne.server import twisted_loop
        except ImportError:
            return

        from .retention_scheduler import start_retention_scheduler
        from .session_watchdog import start_watchdog
        twisted_loop.create_task(start_watchdog())
        twisted_loop.create_task(start_retention_scheduler())
