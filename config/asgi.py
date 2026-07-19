import os

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

django.setup()

from apps.udp_receiver.routing import websocket_urlpatterns  # noqa: E402

_inner_application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        ),
    }
)


class _LifespanApplication:
    """UDP 리스너를 ASGI 서버의 이벤트 루프 위에서 구동하기 위한 lifespan 훅.

    UDP 리스너가 Channels의 channel layer(WebSocket Consumer가 사용하는
    것과 동일한 asyncio.Queue 기반)에 안전하게 group_send()하려면 반드시
    서버를 실제로 구동하는 이 이벤트 루프 위에서 실행되어야 한다.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "lifespan":
            await self.app(scope, receive, send)
            return

        from apps.udp_receiver.udp_listener import start_udp_listener, stop_udp_listener
        from apps.absim_link.rest_client import start_poller, stop_poller

        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                try:
                    await start_udp_listener()
                    await start_poller()
                except Exception as exc:
                    await send({"type": "lifespan.startup.failed", "message": str(exc)})
                    return
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                stop_udp_listener()
                stop_poller()
                await send({"type": "lifespan.shutdown.complete"})
                return


application = _LifespanApplication(_inner_application)
