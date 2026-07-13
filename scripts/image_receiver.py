"""
MQTT Image Receiver
--------------------
Subscribes to an MQTT topic and saves received images to a local folder.
Useful for testing the image stream pipeline.

Usage:
    python image_receiver.py
"""
import os
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# --- CONFIGURATION ---
load_dotenv()
BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
TOPIC = os.getenv("TOPIC", "simulation/images")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "received_images")

OUTPUT_COUNTER = 0


def ensure_output_dir():
    """Create the output directory if it doesn't exist."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output directory: '{os.path.abspath(OUTPUT_DIR)}'")


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected successfully. Subscribing to '{TOPIC}' ...")
    client.subscribe(TOPIC)


def on_message(client, userdata, msg):
    global OUTPUT_COUNTER
    OUTPUT_COUNTER += 1
    filename = f"received_image_{OUTPUT_COUNTER:06d}.jpg"
    filepath = os.path.join(OUTPUT_DIR, filename)

    with open(filepath, 'wb') as f:
        f.write(msg.payload)

    print(f"[RECEIVED] Saved {filename} ({len(msg.payload)} bytes)")


# Setup receiver
ensure_output_dir()

receiver = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
receiver.on_connect = on_connect
receiver.on_message = on_message

receiver.connect(BROKER_HOST, BROKER_PORT, 60)
print(f"Listening on '{TOPIC}' ... Press Ctrl+C to stop.")
receiver.loop_forever()
