"""
Status Router
-------------
Health-check / status endpoint for monitoring and dashboard display.
"""
from fastapi import APIRouter

from config import config
from models import Prediction

router = APIRouter(tags=["status"])

# Global counters set by the main app at runtime
_image_counter: int = 0
_latest_prediction: Prediction | None = None


def set_status(counter: int, prediction: Prediction | None) -> None:
    """Update the shared status counters (called from app startup logic)."""
    global _image_counter, _latest_prediction
    _image_counter = counter
    _latest_prediction = prediction


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
