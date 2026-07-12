import os
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

load_dotenv()
BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
TOPIC = os.getenv("TOPIC", "simulation/images")
OUTPUT_COUNTER = 0

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected successfully. Subscribing to '{TOPIC}'...")
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    global OUTPUT_COUNTER
    OUTPUT_COUNTER += 1
    filename = f"received_image_{OUTPUT_COUNTER}.jpg"
        
    print(f"[RECEIVED] Saved image as {filename}")

# Setup receiver
receiver = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
receiver.on_connect = on_connect
receiver.on_message = on_message

receiver.connect(BROKER_HOST, BROKER_PORT, 60)
receiver.loop_forever()