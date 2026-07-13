"""
Alerts Router
-------------
WebSocket endpoint for real-time anomaly alerts pushed to connected UIs.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from connection_manager import manager

router = APIRouter(tags=["alerts"])


@router.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; wait for client lifecycle events
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
