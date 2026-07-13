"""
Connection Manager
------------------
Manages active WebSocket connections and broadcasts messages to all clients.
"""
from fastapi import WebSocket


class ConnectionManager:
    """Tracks connected WebSocket clients and supports broadcasting."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for conn in stale:
            self.active_connections.remove(conn)


# Singleton instance used across the application
manager = ConnectionManager()
