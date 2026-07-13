"""
MQTT Handler
------------
Manages the MQTT client lifecycle and message ingestion.
Incoming frames are forwarded to the streaming service and to RabbitMQ
for background processing / alert evaluation.
"""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, Callable

import paho.mqtt.client as mqtt
import pika

if TYPE_CHECKING:
    from asyncio import AbstractEventLoop

from config import config
from models import Prediction, FrameData


class MqttHandler:
    """Wraps an MQTT client and dispatches incoming images."""

    def __init__(
        self,
        on_frame_received: Callable[[FrameData], None],
        loop: AbstractEventLoop | None = None,
    ):
        self._on_frame_received = on_frame_received
        self._loop = loop
        self._client: mqtt.Client | None = None
        self._counter: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Connect to the broker and begin listening in a background thread."""
        self._client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message

        self._client.connect(config.broker_host, config.broker_port, 60)
        self._client.loop_start()
        print(f"[MQTT] Connected to {config.broker_host}:{config.broker_port}")

    def stop(self) -> None:
        """Disconnect from the broker and stop the background thread."""
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            print("[MQTT] Disconnected.")

    # ------------------------------------------------------------------
    # Internal MQTT callbacks
    # ------------------------------------------------------------------

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: object,
        flags: dict,
        reason_code: int,
        properties: mqtt.Properties | None = None,
    ) -> None:
        print(f"[MQTT] Subscribing to '{config.mqtt_topic}'...")
        client.subscribe(config.mqtt_topic)

    def _on_message(
        self,
        client: mqtt.Client,
        userdata: object,
        msg: mqtt.MQTTMessage,
    ) -> None:
        self._counter += 1

        # Simulate a prediction for every incoming frame
        prediction = Prediction(
            class_name=random.choice(config.defect_classes),
            confidence=round(random.uniform(0.75, 0.99), 3),
        )

        print(
            f"[MQTT] Frame #{self._counter} | "
            f"Predicted: {prediction.class_name} ({prediction.confidence})"
        )

        frame_data = FrameData(
            image_bytes=msg.payload,
            frame_number=self._counter,
            prediction=prediction,
        )

        # Forward to the registered callback (runs alert + streaming logic)
        self._on_frame_received(frame_data)

        # Also forward raw image to RabbitMQ for background workers
        self._publish_raw_to_rabbitmq(msg.payload)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _publish_raw_to_rabbitmq(payload: bytes) -> None:
        try:
            connection = pika.BlockingConnection(
                pika.ConnectionParameters(host=config.rabbitmq_host)
            )
            channel = connection.channel()
            channel.queue_declare(queue=config.queue_name, durable=True)
            channel.basic_publish(
                exchange="",
                routing_key=config.queue_name,
                body=payload,
                properties=pika.BasicProperties(delivery_mode=2),
            )
            connection.close()
        except Exception as exc:
            print(f"[MQTT] Error buffering raw image into RabbitMQ: {exc}")
