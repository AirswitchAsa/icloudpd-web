import json
import logging

from fastapi import WebSocket, WebSocketDisconnect


logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = set()
        self.active_connections[client_id].add(websocket)
        logger.info(f"Client {client_id} connected")

    def disconnect(self, websocket: WebSocket, client_id: str):
        if client_id in self.active_connections:
            self.active_connections[client_id].discard(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]
        logger.info(f"Client {client_id} disconnected")

    async def send_message(self, message: dict, client_id: str):
        if client_id not in self.active_connections:
            return

        for connection in self.active_connections[client_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to client {client_id}: {e}")


manager = ConnectionManager()


async def handle_websocket(websocket: WebSocket, client_id: str):
    try:
        await manager.connect(websocket, client_id)
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                # Handle incoming messages here
                await manager.send_message({"type": "acknowledgment", "data": message}, client_id)
            except json.JSONDecodeError:
                await manager.send_message(
                    {"type": "error", "message": "Invalid JSON format"}, client_id
                )
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, client_id)
