"""
Status Router
-------------
Health-check / status + metrics endpoints for monitoring and dashboard display.
"""
from config import config
from connection_manager import manager
from fastapi import APIRouter
from models import Prediction
from services.metrics import metrics
from services.stream_service import stream_service

router = APIRouter(tags=["status"])

# Global counters set by the main app at runtime
_image_counter: int = 0
_latest_prediction: Prediction | None = None


def set_status(counter: int, prediction: Prediction | None) -> None:
    """Update the shared status counters (called from app startup logic)."""
    global _image_counter, _latest_prediction
    _image_counter = counter
    _latest_prediction = prediction

@router.get("/health")
async def health():
    return {
        "status": "healthy",
    }

@router.get("/status")
async def status():
    return {
        "status": "healthy",
        "images_ingested": _image_counter,
        "latest_prediction": _latest_prediction.to_dict()
        if _latest_prediction
        else None,
        "tracked_anomaly_classes": list(config.seen_classes),
    }


@router.get("/metrics")
async def metrics_endpoint():
    """
    Detailed operational metrics for monitoring & observability.

    Returns:
        - uptime: service runtime
        - frames: total processed + latest frame number
        - stream: queue backlog (current vs max)
        - events: total emitted alerts broken down by type
        - predictions: per-class distribution
        - anomalies: threshold breaches + new class discoveries
        - websocket: total broadcasts
        - cloud_uploads: total enqueued
        - connections: current active WebSocket connections
        - errors: processing error count
    """
    data = metrics.to_dict()

    # Augment with live queue info and connection count
    data["stream"]["queue_max"] = stream_service.queue_maxsize
    data["stream"]["queue_utilization_pct"] = (
        round((stream_service.queue_size / stream_service.queue_maxsize) * 100, 1)
        if stream_service.queue_maxsize > 0
        else 0.0
    )
    data["connections"] = {
        "active_websockets": len(manager.active_connections),
    }

    return data
