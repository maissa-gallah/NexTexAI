"""
Stream Service
--------------
Manages an asynchronous queue that feeds the MJPEG video stream.
Each incoming frame (bytes + metadata) is stored in the queue and
consumed by the MJPEG generator for HTTP live streaming.
"""
from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from asyncio import AbstractEventLoop

from config import config
from models import FrameData


class StreamService:
    """Buffers incoming frames and exposes an async MJPEG generator."""

    def __init__(self, loop: AbstractEventLoop | None = None) -> None:
        self._queue: asyncio.Queue[FrameData] = asyncio.Queue(
            maxsize=config.video_queue_maxsize
        )
        self._loop = loop

    # ------------------------------------------------------------------
    # Producer (thread-safe — call from any thread)
    # ------------------------------------------------------------------

    def push(self, frame_data: FrameData) -> None:
        """Thread-safe push — schedules the coroutine on the event loop."""
        if self._loop is not None and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._async_push(frame_data), self._loop
            )

    async def _async_push(self, frame_data: FrameData) -> None:
        """Internal async push that safely interacts with the queue."""
        if self._queue.full():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        await self._queue.put(frame_data)

    # ------------------------------------------------------------------
    # Queue introspection (for metrics / health checks)
    # ------------------------------------------------------------------

    @property
    def queue_size(self) -> int:
        """Return the current number of frames waiting in the stream queue."""
        try:
            # asyncio.Queue doesn't expose a public *size* reliably from
            # outside the event-loop thread, but for metrics polling from
            # the same loop this is safe.
            return self._queue.qsize()
        except NotImplementedError:
            return -1

    @property
    def queue_maxsize(self) -> int:
        return self._queue.maxsize

    # ------------------------------------------------------------------
    # Consumer (async generator for StreamingResponse)
    # ------------------------------------------------------------------

    async def generate_mjpeg(self):
        """Yields multipart MJPEG chunks with metadata + image pairs."""
        while True:
            try:
                frame: FrameData = await self._queue.get()

                # 1. Metadata boundary part
                meta = {
                    "counter": frame.frame_number,
                    "class": frame.prediction.class_name,
                    "confidence": frame.prediction.confidence,
                }
                yield (
                    b"--frame\r\n"
                    b"Content-Type: application/json\r\n\r\n"
                    + json.dumps(meta).encode()
                    + b"\r\n"
                )

                # 2. Image boundary part
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame.image_bytes
                    + b"\r\n"
                )
            except Exception as exc:
                print(f"[STREAM] Error in MJPEG generator: {exc}")
                await asyncio.sleep(0.1)


# Singleton instance
stream_service = StreamService()
