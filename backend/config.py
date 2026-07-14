"""
Application Configuration
-------------------------
Centralised configuration loaded from environment variables with sensible defaults.
"""
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


@dataclass
class AppConfig:
    # --- MQTT ---
    broker_host: str = field(default_factory=lambda: os.getenv("BROKER_HOST", "localhost"))
    broker_port: int = field(default_factory=lambda: int(os.getenv("BROKER_PORT", "1883")))
    mqtt_topic: str = field(default_factory=lambda: os.getenv("TOPIC", "simulation/images"))

    # --- RabbitMQ ---
    rabbitmq_host: str = field(default_factory=lambda: os.getenv("RABBITMQ_HOST", "localhost"))
    queue_name: str = "image_processing_queue"
    alert_exchange: str = "anomaly_alerts"
    cloud_upload_queue: str = field(default_factory=lambda: os.getenv("CLOUD_UPLOAD_QUEUE", "cloud_upload_queue"))

    # --- Prediction / Alerting ---
    confidence_threshold: float = field(
        default_factory=lambda: float(os.getenv("CONFIDENCE_THRESHOLD", "0.90"))
    )
    seen_classes: set = field(default_factory=lambda: set(
        os.getenv("SEEN_CLASSES", "Broken stitch,defect free,hole,horizontal").split(",")
    ))

    # --- Known defect classes ---
    defect_classes: list = field(default_factory=lambda: [
        "Broken stitch", "defect free", "hole", "horizontal",
        "lines", "Needle mark", "Pinched fabric", "stain", "Vertical",
    ])

    # --- CORS ---
    cors_origins: list = field(default_factory=lambda: ["http://localhost:3000"])

    # --- Video stream ---
    video_queue_maxsize: int = 10


config = AppConfig()
