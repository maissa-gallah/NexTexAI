"""
Metrics Collector
-----------------
Central singleton that tracks real-time operational metrics for the
application — processed events, queue backlogs, event distributions,
per-class predictions, and more.

All counters are thread-safe (CPython GIL ensures atomic increment
for simple ints) and are read by the /metrics health-check endpoint.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class Metrics:
    """Singleton metrics state."""

    # --- Timestamps ---
    started_at: float = field(default_factory=time.time)

    # --- Frame / event counters ---
    total_frames_processed: int = 0
    total_events_emitted: int = 0  # alerts published to RabbitMQ

    # --- Stream ---
    stream_queue_backlog: int = 0  # updated on each frame push

    # --- Distribution by event type ---
    events_by_type: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # --- Distribution by prediction class ---
    predictions_by_class: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # --- Anomaly-specific counters ---
    threshold_breaches: int = 0       # confidence > threshold && not defect-free
    new_anomaly_classes_discovered: int = 0
    new_anomaly_frames_by_class: dict[str, int] = field(
        default_factory=lambda: defaultdict(int)
    )  # per-class frame count for newly discovered anomalies

    # --- WebSocket ---
    websocket_broadcasts: int = 0

    # --- Cloud uploads ---
    cloud_uploads_enqueued: int = 0

    # --- Latest frame ---
    latest_frame_number: int = 0
    latest_prediction_class: str | None = None
    latest_prediction_confidence: float | None = None

    # --- Error tracking ---
    processing_errors: int = 0

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def record_frame(self, frame_number: int) -> None:
        self.total_frames_processed += 1
        self.latest_frame_number = frame_number

    def record_event(self, event_type: str) -> None:
        self.total_events_emitted += 1
        self.events_by_type[event_type] += 1

    def record_prediction(self, class_name: str, confidence: float) -> None:
        self.predictions_by_class[class_name] += 1
        self.latest_prediction_class = class_name
        self.latest_prediction_confidence = confidence

    def record_threshold_breach(self) -> None:
        self.threshold_breaches += 1

    def record_new_class(self, class_name: str | None = None) -> None:
        self.new_anomaly_classes_discovered += 1
        if class_name is not None:
            self.new_anomaly_frames_by_class[class_name] += 1

    def record_websocket_broadcast(self) -> None:
        self.websocket_broadcasts += 1

    def record_cloud_upload(self) -> None:
        self.cloud_uploads_enqueued += 1

    def record_error(self) -> None:
        self.processing_errors += 1

    def to_dict(self) -> dict:
        """Serialise all metrics to a plain dict for the JSON endpoint."""
        now = time.time()
        uptime_seconds = now - self.started_at
        return {
            "uptime": {
                "seconds": round(uptime_seconds, 2),
                "human": self._format_uptime(uptime_seconds),
            },
            "frames": {
                "total_processed": self.total_frames_processed,
                "latest_frame": self.latest_frame_number,
            },
            "stream": {
                "queue_backlog": self.stream_queue_backlog,
            },
            "events": {
                "total_emitted": self.total_events_emitted,
                "by_type": dict(self.events_by_type),
            },
            "predictions": {
                "by_class": dict(self.predictions_by_class),
            },
            "anomalies": {
                "threshold_breaches": self.threshold_breaches,
                "new_classes_discovered": self.new_anomaly_classes_discovered,
                "new_classes_by_class": dict(self.new_anomaly_frames_by_class),
            },
            "websocket": {
                "broadcasts": self.websocket_broadcasts,
            },
            "cloud_uploads": {
                "enqueued": self.cloud_uploads_enqueued,
            },
            "errors": {
                "processing_errors": self.processing_errors,
            },
        }

    @staticmethod
    def _format_uptime(seconds: float) -> str:
        hours, rem = divmod(int(seconds), 3600)
        minutes, secs = divmod(rem, 60)
        parts = []
        if hours:
            parts.append(f"{hours}h")
        if minutes:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")
        return " ".join(parts)


# Singleton instance
metrics = Metrics()
