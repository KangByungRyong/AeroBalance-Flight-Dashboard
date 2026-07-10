from django.apps import AppConfig


class UdpReceiverConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.udp_receiver"
    verbose_name = "UDP 수신기"

    def ready(self) -> None:
        # Daphne(현재 runserver가 사용하는 ASGI 서버)는 ASGI lifespan
        # 프로토콜을 지원하지 않아 config/asgi.py의 lifespan 훅이 호출되지
        # 않는다. 대신 daphne.server가 임포트 시점에 미리 만들어 두는,
        # 나중에 reactor.run()이 실제로 구동할 이벤트 루프(twisted_loop)에
        # 직접 태스크를 등록한다. 이 시점에는 루프가 아직 실행 전이고 우리는
        # 같은(메인) 스레드에서 동기적으로 호출되므로 스레드/루프 안전성
        # 문제 없이 task만 예약해두면 reactor 시작과 함께 실행된다.
        #
        # Uvicorn 등 lifespan을 지원하는 ASGI 서버로 배포 전환 시에는
        # config/asgi.py의 lifespan 훅이 대신 이 역할을 한다
        # (start_udp_listener는 중복 호출에 안전하도록 멱등하게 작성됨).
        try:
            from daphne.server import twisted_loop
        except ImportError:
            return

        from .udp_listener import start_udp_listener
        twisted_loop.create_task(start_udp_listener())
