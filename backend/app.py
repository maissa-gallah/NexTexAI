"""
Application Entry Point
-----------------------
Wires together the FastAPI application, middleware, routers, and
background services (MQTT ingestion, alert engine, video streaming).
"""
from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import config
from models import Prediction, FrameData
from services.mqtt_handler import MqttHandler
from services.alert_engine import AlertEngine
from services.stream_service import stream_service
from routers.video import router as video_router
from routers.alerts import router as alerts_router
from routers.status import router as status_router, set_status

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(title="NexTexAI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(video_router)
app.include_router(alerts_router)
app.include_router(status_router)

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

image_counter: int = 0
latest_prediction: Prediction | None = None
_mqtt_handler: MqttHandler | None = None
_alert_engine: AlertEngine | None = None

# ---------------------------------------------------------------------------
# Callback — runs on every incoming MQTT frame
# ---------------------------------------------------------------------------

def _on_frame_received(frame_data: FrameData) -> None:
    """Called by MqttHandler for each incoming image frame."""
    global image_counter, latest_prediction
    image_counter = frame_data.frame_number
    latest_prediction = frame_data.prediction

    # 1. Push frame into the MJPEG streaming queue
    stream_service.push(frame_data)

    # 2. Evaluate alert rules (RabbitMQ + WebSocket broadcast)
    if _alert_engine is not None:
        _alert_engine.process(frame_data)

    # 3. Update status endpoint counters
    set_status(image_counter, latest_prediction)

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event() -> None:
    loop = asyncio.get_running_loop()

    # Inject the event loop into services that need thread-safe async calls
    stream_service._loop = loop  # noqa

    global _alert_engine, _mqtt_handler
    _alert_engine = AlertEngine(loop=loop)

    _mqtt_handler = MqttHandler(
        on_frame_received=_on_frame_received,
        loop=loop,
    )
    _mqtt_handler.start()
    app.state.mqtt_handler = _mqtt_handler

    print("[APP] Startup complete.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if _mqtt_handler is not None:
        _mqtt_handler.stop()
    print("[APP] Shutdown complete.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)