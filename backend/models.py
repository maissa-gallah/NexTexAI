"""
Data Models
-----------
Simple typed data structures used throughout the application.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Prediction:
    """A simulated or real defect-classification result."""
    class_name: str
    confidence: float

    def to_dict(self) -> dict:
        return {"class": self.class_name, "confidence": self.confidence}

    @classmethod
    def from_dict(cls, data: dict) -> Prediction:
        return cls(class_name=data["class"], confidence=data["confidence"])


@dataclass
class AlertPayload:
    """Payload published to RabbitMQ and broadcast via WebSocket."""
    event_type: str
    details: dict
    frame: int | None = None

    def to_dict(self) -> dict:
        d: dict = {"event_type": self.event_type, "details": self.details}
        if self.frame is not None:
            d["frame"] = self.frame
        return d


@dataclass
class FrameData:
    """Data carried through the video stream queue per frame."""
    image_bytes: bytes
    frame_number: int
    prediction: Prediction
