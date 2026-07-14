"""
Cloud Uploader Worker
----------------------
Listens to RabbitMQ for anomaly frame messages and uploads them
to MinIO (S3-compatible local storage) for retraining datasets.

Requires a running RabbitMQ broker and MinIO server.

Usage:
    python cloud_uploader.py
"""
import os

import boto3
import pika
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
CLOUD_UPLOAD_QUEUE = os.getenv("CLOUD_UPLOAD_QUEUE", "cloud_upload_queue")

MINIO_ENDPOINT = os.getenv("CLOUD_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("CLOUD_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("CLOUD_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("CLOUD_BUCKET", "retraining-data")
MINIO_USE_SSL = os.getenv("CLOUD_SECURE", "false").lower() == "true"


def get_s3_client():
    """Create a boto3 S3 client configured for MinIO."""
    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if MINIO_USE_SSL else 'http'}://{MINIO_ENDPOINT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


def ensure_bucket(s3_client):
    """Create the target bucket if it doesn't already exist."""
    try:
        s3_client.head_bucket(Bucket=MINIO_BUCKET)
        print(f" [BUCKET] Bucket '{MINIO_BUCKET}' already exists.")
    except Exception:
        s3_client.create_bucket(Bucket=MINIO_BUCKET)
        print(f" [BUCKET] Created bucket '{MINIO_BUCKET}'.")


def upload_frame(image_bytes: bytes, class_name: str, frame_number: int, confidence: float):
    """
    Upload a single frame to MinIO organized by anomaly class.

    Path: retraining-data/<class_name>/frame_<frame_number>.jpg
    """
    s3 = get_s3_client()
    ensure_bucket(s3)

    safe_class = class_name.replace(" ", "_").replace("/", "-")
    key = f"retraining/{safe_class}/frame_{frame_number:06d}.jpg"

    s3.put_object(
        Bucket=MINIO_BUCKET,
        Key=key,
        Body=image_bytes,
        ContentType="image/jpeg",
        Metadata={
            "class": class_name,
            "frame_number": str(frame_number),
            "confidence": str(confidence),
            "purpose": "retraining",
        },
    )
    print(f" [UPLOAD] Uploaded {key} to MinIO bucket '{MINIO_BUCKET}'")


def on_message(ch, method, properties, body):
    """RabbitMQ consumer callback."""
    headers = properties.headers or {}

    class_name = headers.get("class_name", "unknown")
    frame_number = int(headers.get("frame_number", 0))
    confidence = float(headers.get("confidence", 0.0))

    print(f" [WORKER] Received frame #{frame_number} (class: {class_name}, conf: {confidence})")

    try:
        upload_frame(body, class_name, frame_number, confidence)
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print(f" [WORKER] Frame #{frame_number} uploaded successfully.")
    except Exception as e:
        print(f" [WORKER ERROR] Failed to upload frame #{frame_number}: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)


def main():
    """Start the Cloud Uploader worker."""
    print(" [*] Cloud Uploader Worker starting ...")

    connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
    channel = connection.channel()

    channel.queue_declare(queue=CLOUD_UPLOAD_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=CLOUD_UPLOAD_QUEUE, on_message_callback=on_message)

    print(f" [*] Waiting for messages on '{CLOUD_UPLOAD_QUEUE}'. To exit press CTRL+C")
    channel.start_consuming()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n [*] Cloud Uploader Worker stopped.")
    except Exception as e:
        print(f" [FATAL] Cloud Uploader crashed: {e}")
