import json

from channels.generic.websocket import AsyncWebsocketConsumer


class FlightDataConsumer(AsyncWebsocketConsumer):
    GROUP_NAME = "flight_data"

    async def connect(self) -> None:
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, code: int) -> None:
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def flight_update(self, event: dict) -> None:
        """Channel Layer 그룹 메시지를 WebSocket 클라이언트로 전달."""
        await self.send(text_data=json.dumps(event["data"]))
