"""
Video Router
------------
Exposes the live MJPEG video feed endpoint.
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from services.stream_service import stream_service

router = APIRouter(tags=["video"])


@router.get("/video_feed")
async def video_feed():
    """Serves a real-time MJPEG live stream usable by an HTML <img> tag."""
    return StreamingResponse(
        stream_service.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
