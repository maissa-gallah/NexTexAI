"""
MQTT Image Streamer
--------------------
Publishes images from a local folder to an MQTT broker topic.
Useful for simulating a continuous stream of camera frames.

Usage:
    python image_streamer.py
"""
import os
import time
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# --- CONFIGURATION ---
load_dotenv()
BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
TOPIC = os.getenv("TOPIC", "simulation/images")
IMAGE_FOLDER = os.getenv("IMAGE_FOLDER", "../Dataset/Broken stitch")
DELAY_SECONDS = float(os.getenv("DELAY_SECONDS", "1"))


def stream_images():
    """Stream images from IMAGE_FOLDER over MQTT."""
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)

    print(f"Connecting to broker at {BROKER_HOST}:{BROKER_PORT} ...")
    try:
        client.connect(BROKER_HOST, BROKER_PORT, 60)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    client.loop_start()

    if not os.path.exists(IMAGE_FOLDER):
        print(f"Error: Folder '{IMAGE_FOLDER}' not found.")
        client.loop_stop()
        return

    valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp')
    files = sorted([
        f for f in os.listdir(IMAGE_FOLDER)
        if f.lower().endswith(valid_extensions) and os.path.isfile(os.path.join(IMAGE_FOLDER, f))
    ])

    if not files:
        print(f"No valid images found in '{IMAGE_FOLDER}'.")
        client.loop_stop()
        return

    print(f"Found {len(files)} images. Starting stream ...")

    try:
        for file_name in files:
            file_path = os.path.join(IMAGE_FOLDER, file_name)

            with open(file_path, 'rb') as f:
                image_bytes = f.read()

            payload = bytearray(image_bytes)

            print(f"[SENDING] {file_name} ({len(payload)} bytes) ...")
            result = client.publish(TOPIC, payload, qos=1)
            result.wait_for_publish()

            time.sleep(DELAY_SECONDS)

        print("\nFinished streaming all images.")

    except KeyboardInterrupt:
        print("\nStreaming stopped.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    stream_images()
