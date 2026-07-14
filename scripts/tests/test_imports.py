"""Minimal tests to verify script dependencies are importable."""


def test_imports():
    """Verify all required packages can be imported."""
    import boto3  # noqa: F401
    import dotenv  # noqa: F401
    import paho.mqtt.client as mqtt  # noqa: F401
    import pika  # noqa: F401

    # Quick sanity check on a known MQTT constant
    assert hasattr(mqtt, "CallbackAPIVersion")
