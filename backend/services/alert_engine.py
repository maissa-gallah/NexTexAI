"""
Alert Engine
------------
Evaluates predictions against configured rules and publishes alerts to
RabbitMQ. It also broadcasts high-severity alerts to connected WebSocket
clients.
"""
from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

import pika

if TYPE_CHECKING:
    from asyncio import AbstractEventLoop

from config import config
from connection_manager import manager
from models import AlertPayload, FrameData, Prediction

from services.metrics import metrics


class AlertEngine:
    """Evaluates predictions and routes alerts via RabbitMQ + WebSockets."""

    def __init__(self, loop: AbstractEventLoop | None = None):
        self._loop = loop

    def process(self, frame_data: FrameData) -> None:
        """Evaluate a single frame's prediction and publish alerts if needed."""
        prediction = frame_data.prediction
        frame_number = frame_data.frame_number
        pred_class = prediction.class_name
        confidence = prediction.confidence

        try:
            connection = pika.BlockingConnection(
                pika.ConnectionParameters(host=config.rabbitmq_host)
            )
            channel = connection.channel()
            channel.exchange_declare(
                exchange=config.alert_exchange, exchange_type="topic"
            )
            channel.queue_declare(queue=config.cloud_upload_queue, durable=True)

            # --- EVENT 1: New anomaly class (previously unseen) ---
            if pred_class not in config.seen_classes:
                self._handle_new_anomaly_class(
                    channel, prediction, frame_data
                )

            # --- EVENT 2: Confidence threshold exceeded (non-defect-free) ---
            if pred_class != "defect free" and confidence > config.confidence_threshold:
                self._handle_threshold_exceeded(
                    channel, prediction, frame_number
                )

            connection.close()
        except Exception as exc:
            print(f"[ALERT] Failed to process frame #{frame_number}: {exc}")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _handle_new_anomaly_class(
        self,
        channel: pika.BlockingConnection,
        prediction: Prediction,
        frame_data: FrameData,
    ) -> None:
        """Publish a *new anomaly class* event and enqueue the frame for cloud upload."""
        payload = AlertPayload(
            event_type="new_anomaly_class",
            details=prediction.to_dict(),
        )
        channel.basic_publish(
            exchange=config.alert_exchange,
            routing_key="anomaly.new_class",
            body=json.dumps(payload.to_dict()),
        )
        print(f"[ALERT] New Anomaly Class: {prediction.class_name}")

        # Track metrics
        metrics.record_event("new_anomaly_class")
        metrics.record_new_class(class_name=prediction.class_name)
        metrics.record_cloud_upload()

        # Enqueue the frame image for cloud upload (retraining pipeline)
        self._enqueue_cloud_upload(channel, frame_data)

    def _handle_threshold_exceeded(
        self,
        channel: pika.BlockingConnection,
        prediction: Prediction,
        frame_number: int,
    ) -> None:
        """Publish a *threshold exceeded* event and broadcast via WebSocket."""
        payload = AlertPayload(
            event_type="threshold_exceeded",
            details=prediction.to_dict(),
            frame=frame_number,
        )
        payload_dict = payload.to_dict()

        # Track metrics
        metrics.record_event("threshold_exceeded")
        metrics.record_threshold_breach()

        # 1. RabbitMQ for backend workers / database archiving
        channel.basic_publish(
            exchange=config.alert_exchange,
            routing_key="anomaly.threshold_exceeded",
            body=json.dumps(payload_dict),
        )

        # 2. WebSocket broadcast to connected UIs
        if self._loop is not None and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(payload_dict), self._loop
            )
            metrics.record_websocket_broadcast()

        print(
            f"[ALERT] Threshold exceeded — {prediction.class_name} "
            f"({prediction.confidence}) [frame #{frame_number}]"
        )

    @staticmethod
    def _enqueue_cloud_upload(
        channel: pika.BlockingConnection,
        frame_data: FrameData,
    ) -> None:
        """Send the raw frame bytes to the cloud upload queue for retraining."""
        try:
            channel.basic_publish(
                exchange="",
                routing_key=config.cloud_upload_queue,
                body=frame_data.image_bytes,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    headers={
                        "frame_number": str(frame_data.frame_number),
                        "class_name": frame_data.prediction.class_name,
                        "confidence": str(frame_data.prediction.confidence),
                        "event_type": "new_anomaly_class",
                    },
                ),
            )
            print(
                f"[ALERT] Frame #{frame_data.frame_number} enqueued for cloud upload "
                f"(class: {frame_data.prediction.class_name})"
            )
        except Exception as exc:
            print(f"[ALERT] Failed to enqueue frame for cloud upload: {exc}")
