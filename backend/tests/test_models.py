"""Tests for data models (no external dependencies required)."""

from models import FrameData, Prediction


class TestPrediction:
    def test_to_dict(self):
        pred = Prediction(class_name="hole", confidence=0.85)
        d = pred.to_dict()
        assert d == {"class": "hole", "confidence": 0.85}

    def test_from_dict(self):
        pred = Prediction.from_dict({"class": "defect free", "confidence": 0.99})
        assert pred.class_name == "defect free"
        assert pred.confidence == 0.99


class TestFrameData:
    def test_construction(self):
        pred = Prediction(class_name="stain", confidence=0.72)
        frame = FrameData(
            image_bytes=b"fake-jpeg-bytes",
            frame_number=42,
            prediction=pred,
        )
        assert frame.frame_number == 42
        assert frame.prediction.class_name == "stain"
        assert isinstance(frame.image_bytes, bytes)
