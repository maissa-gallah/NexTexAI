import os
import io
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import threading
import queue
from PIL import Image

load_dotenv()

BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
TOPIC = os.getenv("TOPIC", "simulation/images")

app = FastAPI()

# Enable CORS for React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async_image_queue = asyncio.Queue(maxsize=10)
latest_image = None
image_counter = 0
_main_loop = None 

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected to MQTT. Subscribing to '{TOPIC}'...")
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    global latest_image, image_counter
    image_counter += 1

    if _main_loop is not None and _main_loop.is_running():
        if async_image_queue.full():
            try:
                async_image_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
                
        asyncio.run_coroutine_threadsafe(
            async_image_queue.put(msg.payload), _main_loop
        )

    latest_image = msg.payload
    print(f"[RECEIVED] Image #{image_counter} ({len(msg.payload)} bytes)")

# Setup MQTT in a background thread
def mqtt_loop():
    receiver = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    receiver.on_connect = on_connect
    receiver.on_message = on_message
    receiver.connect(BROKER_HOST, BROKER_PORT, 60)
    receiver.loop_forever()

# Start MQTT listener in background
mqtt_thread = threading.Thread(target=mqtt_loop, daemon=True)
mqtt_thread.start()

async def generate_mjpeg():
    while True:
        try:
            img_bytes = await async_image_queue.get()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + img_bytes + b'\r\n')
        except Exception as e:
            print(f"Error in MJPEG stream: {e}")
            await asyncio.sleep(0.1)

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/latest_image")
async def get_latest_image():
    if latest_image:
        return Response(content=latest_image, media_type="image/jpeg")
    return {"error": "No image available"}

@app.get("/status")
async def status():
    print(f"Status requested: {image_counter} images received.")
    return {
        "status": "running",
        "images_received": image_counter,
        "queue_size": async_image_queue.qsize()
    }

@app.get("/health")
async def health():
    return {
        "status": "running"
    }

@app.on_event("startup")
async def _capture_event_loop():
    global _main_loop
    _main_loop = asyncio.get_running_loop()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)