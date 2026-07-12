import os
import json
import random
import asyncio
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
import pika
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

# --- Configurations ---
BROKER_HOST = os.getenv("BROKER_HOST", "localhost")
BROKER_PORT = int(os.getenv("BROKER_PORT", "1883"))
MQTT_TOPIC = os.getenv("TOPIC", "simulation/images")

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
QUEUE_NAME = "image_processing_queue"
ALERT_EXCHANGE = "anomaly_alerts"

CONFIDENCE_THRESHOLD = 0.90

# --- State Tracking & Async Streaming Queues ---
SEEN_CLASSES = set(["defect free"])
latest_prediction = None
image_counter = 0

# Local queue to feed the MJPEG endpoint safely across frames
video_stream_queue = asyncio.Queue(maxsize=10)
_main_loop = None 

DEFECT_CLASSES = [
    "Broken stitch", "defect free", "hole", "horizontal",
    "lines", "Needle mark", "Pinched fabric", "stain", "Vertical"
]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Business & Alert Logic ---

def simulate_prediction() -> dict:
    defect_class = random.choice(DEFECT_CLASSES)
    confidence = round(random.uniform(0.75, 0.99), 3)
    return {"class": defect_class, "confidence": confidence}

def evaluate_and_alert_rabbitmq(prediction: dict):
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()
        channel.exchange_declare(exchange=ALERT_EXCHANGE, exchange_type='topic')
        
        pred_class = prediction["class"]
        confidence = prediction["confidence"]

        if pred_class not in SEEN_CLASSES:
            SEEN_CLASSES.add(pred_class)
            alert_payload = {"event_type": "new_anomaly_class", "details": prediction}
            channel.basic_publish(
                exchange=ALERT_EXCHANGE,
                routing_key="anomaly.new_class",
                body=json.dumps(alert_payload)
            )
            print(f" [RMQ ALERT] New Anomaly Class: {pred_class}")

        if pred_class != "defect free" and confidence > CONFIDENCE_THRESHOLD:
            alert_payload = {"event_type": "threshold_exceeded", "details": prediction}
            channel.basic_publish(
                exchange=ALERT_EXCHANGE,
                routing_key="anomaly.threshold_exceeded",
                body=json.dumps(alert_payload)
            )
            print(f" [RMQ ALERT] Threshold Exceeded! {pred_class} ({confidence:.1%})")

        connection.close()
    except Exception as e:
        print(f"Failed to publish alert event to RabbitMQ: {e}")

# --- MQTT Handlers ---

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"Connected to MQTT Broker. Subscribing to '{MQTT_TOPIC}'...")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    global image_counter, latest_prediction, _main_loop
    image_counter += 1
    
    prediction = simulate_prediction()
    latest_prediction = prediction
    print(f"[MQTT RECEIVED] Frame #{image_counter} | Predicted: {prediction['class']}")
    
    # 1. Thread-safe handoff to the local UI video streaming queue
    if _main_loop is not None and _main_loop.is_running():
        if video_stream_queue.full():
            try:
                video_stream_queue.get_nowait() # Drop oldest if UI falls behind
            except asyncio.QueueEmpty:
                pass
        
        # Package frame along with metadata
        frame_data = (msg.payload, image_counter, prediction)
        asyncio.run_coroutine_threadsafe(
            video_stream_queue.put(frame_data), _main_loop
        )
    
    # 2. Forward raw payload to RabbitMQ queue for background tasks
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()
        channel.queue_declare(queue=QUEUE_NAME, durable=True)
        channel.basic_publish(
            exchange='',
            routing_key=QUEUE_NAME,
            body=msg.payload,
            properties=pika.BasicProperties(delivery_mode=2)
        )
        connection.close()
    except Exception as e:
        print(f"Error buffering raw image into RabbitMQ: {e}")

    # 3. Handle Alert Rules
    evaluate_and_alert_rabbitmq(prediction)

# --- Background Task Management ---

@app.on_event("startup")
async def startup_event():
    global _main_loop
    # Grab the running FastAPI event loop so the MQTT thread can talk to it safely
    _main_loop = asyncio.get_running_loop()

    mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    
    mqtt_client.connect(BROKER_HOST, BROKER_PORT, 60)
    mqtt_client.loop_start()
    app.state.mqtt_client = mqtt_client

@app.on_event("shutdown")
async def shutdown_event():
    app.state.mqtt_client.loop_stop()
    app.state.mqtt_client.disconnect()

# --- Async Stream Generators ---

async def generate_mjpeg():
    """Generates the multipart MJPEG stream containing image parts and metadata parts."""
    while True:
        try:
            img_bytes, counter, pred = await video_stream_queue.get()
            
            # 1. Metadata Boundary Part
            metadata = f'{{"counter":{counter},"class":"{pred["class"]}","confidence":{pred["confidence"]}}}'
            yield (b'--frame\r\n'
                   b'Content-Type: application/json\r\n\r\n' +
                   metadata.encode() + b'\r\n')
            
            # 2. Image Boundary Part
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + img_bytes + b'\r\n')
        except Exception as e:
            print(f"Error in MJPEG stream: {e}")
            await asyncio.sleep(0.1)

# --- API Endpoints ---

@app.get("/video_feed")
async def video_feed():
    """Serves a real-time MJPEG live stream readable directly by an HTML <img> tag."""
    return StreamingResponse(
        generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/status")
async def status():
    return {
        "status": "healthy",
        "images_ingested": image_counter,
        "latest_prediction": latest_prediction,
        "tracked_anomaly_classes": list(SEEN_CLASSES)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)