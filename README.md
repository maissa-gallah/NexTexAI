# NexTexAI Technical Assessment

Real-time fabric defect detection system. Images are streamed via MQTT, classified by a simulated AI backend, and displayed live in a React dashboard with anomaly alerts, metrics, and cloud uploads.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  image_streamer.py           scripts/                              │
│  Publishes images from a local folder to MQTT topic                │
└───────────────────┬─────────────────────────────────────────────────┘
                    │ MQTT (raw JPEG bytes)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MQTT Broker (Mosquitto)                    docker: mqtt (1883)     │
└───────────────────┬─────────────────────────────────────────────────┘
                    │ subscribe
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend — FastAPI (Python)                  docker: backend (8000) │
│                                                                     │
│  app.py ──► MqttHandler (on_message)                                │
│                │ simulate_prediction() → Prediction                 │
│                │ push FrameData → StreamService Queue               │
│                ▼                                                    │
│  StreamService ──► generate_mjpeg() ──► /video_feed (MJPEG)       │
│                                                                     │
│  AlertEngine ──► RabbitMQ (anomaly alerts)                          │
│                  └──► cloud_uploader.py ──► MinIO (S3 storage)      │
│                                                                     │
│  WebSocket ──► /ws/alerts (live alerts to dashboard)               │
│  /status, /metrics, /health                                         │
└───────────────────┬─────────────────────────────────────────────────┘
                    │ HTTP (MJPEG stream + JSON APIs + WebSocket)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend — React + nginx               docker: frontend (3000:80) │
│                                                                     │
│  CameraFeed ──► fetch(/video_feed) ──► consumeStream() parser      │
│                   ├── onImage → render JPEG frame                   │
│                   └── onJson  → update PredictionOverlay            │
│  DashboardAlerts ──► WebSocket(/ws/alerts)                          │
│  CloudStatus ──► /status, /metrics                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
├── docker-compose.yml              # Orchestrates all services
├── pyproject.toml                  # Python project config (ruff, pytest)
│
├── backend/                        # FastAPI backend
│   ├── app.py                      # Entry point, lifecycle, callback wiring
│   ├── config.py                   # Centralised env-based configuration
│   ├── models.py                   # Data models (Prediction, FrameData, AlertPayload)
│   ├── connection_manager.py       # WebSocket connection manager
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Container build
│   ├── routers/
│   │   ├── video.py                # GET /video_feed — MJPEG stream
│   │   ├── alerts.py               # WS /ws/alerts — real-time anomaly alerts
│   │   └── status.py               # GET /health, /status, /metrics
│   ├── services/
│   │   ├── mqtt_handler.py         # MQTT client lifecycle & message ingestion
│   │   ├── stream_service.py       # Async queue → MJPEG generator
│   │   ├── alert_engine.py         # Prediction evaluation → RabbitMQ alerts
│   │   └── metrics.py              # Real-time operational metrics singleton
│   └── tests/
│       └── test_models.py
│
├── camera-app/                     # React frontend
│   ├── Dockerfile                  # nginx-based production build
│   ├── nginx.conf                  # Reverse proxy to backend
│   ├── package.json
│   └── src/
│       ├── components/
│       │   ├── App/                # Root layout
│       │   ├── CameraFeed/         # MJPEG stream player
│       │   ├── PredictionOverlay/  # Prediction labels overlaid on video
│       │   ├── DashboardAlerts/    # WebSocket-powered alert feed
│       │   ├── CloudStatus/        # System health & metrics display
│       │   └── Header/             # Top navigation bar
│       └── hooks/
│           ├── useVideoStream.js   # MJPEG stream consumption hook
│           └── useSystemStatus.js  # Status/metrics polling hook
│
├── scripts/                        # Standalone utility scripts
│   ├── image_streamer.py           # MQTT publisher (folder → topic)
│   ├── image_receiver.py           # MQTT subscriber (topic → disk)
│   ├── cloud_uploader.py           # RabbitMQ consumer → MinIO uploads
│   ├── Dockerfile
│   └── requirements.txt
│
└── Dataset/                        # Sample fabric defect images
    ├── Broken stitch/
    ├── defect free/
    ├── hole/
    ├── horizontal/
    ├── lines/
    ├── Needle mark/
    ├── Pinched fabric/
    ├── stain/
    └── Vertical/
```

---

## Data Flow (end-to-end)

1. **`image_streamer.py`** reads JPEG images from `Dataset/` and publishes them via MQTT to the `simulation/images` topic.
2. **`MqttHandler`** subscribes to that topic; on each message it calls `simulate_prediction()` — randomly assigning a defect class and confidence.
3. **`StreamService`** receives the `FrameData` (image bytes + prediction) and buffers it in an async queue.
4. **`generate_mjpeg()`** consumes the queue and produces a multipart/x-mixed-replace stream: each frame is preceded by JSON metadata (the prediction) and followed by the raw JPEG.
5. **`CameraFeed`** (React) fetches the stream via `fetch()` → `ReadableStream` and parses the multipart boundaries with the `consumeStream()` parser — rendering images and overlaying predictions.
6. **`AlertEngine`** evaluates predictions against thresholds (confidence > 90%, new anomaly classes) and publishes alerts to RabbitMQ + broadcasts via WebSocket to the dashboard.
7. **`cloud_uploader.py`** consumes anomaly frames from RabbitMQ and uploads them to MinIO for retraining pipelines.

---

## Running the Project

### Prerequisites

- Docker & Docker Compose (recommended)
- Python 3.11+ (for local development)

### Quick Start (Docker Compose)

```bash
# 1. Clone and enter the project
cd NexTexAI

# 2. Start all services
docker compose up --build
```

This starts:

| Service           | Container           | Port(s)        | Description                          |
|-------------------|---------------------|----------------|--------------------------------------|
| **MQTT Broker**   | `mosquitto_broker`  | `1883`, `9001` | Message relay (Mosquitto)            |
| **RabbitMQ**      | `rabbitmq`          | `5672`, `15672`| Alert queue & management UI          |
| **MinIO**         | `minio`             | `9000`, `9002` | S3-compatible object storage         |
| **Backend**       | `nextexai_backend`  | `8000`         | FastAPI app (MJPEG + APIs)           |
| **Frontend**      | `nextexai_frontend` | `3000` → `80`  | React dashboard (nginx)              |
| **Streamer**      | `nextexai_streamer` | —              | MQTT image publisher                 |
| **Uploader**      | `nextexai_uploader` | —              | RabbitMQ → MinIO anomaly uploader    |

Once running, open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Running Locally (Development)

#### 1. Start infrastructure

```bash
docker compose up mqtt rabbitmq minio -d
```

#### 2. Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

#### 3. Frontend

```bash
cd camera-app
npm install
npm start          # Runs on http://localhost:3000
```

#### 4. Image streamer

```bash
cd scripts
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python image_streamer.py
```

#### 5. Cloud uploader (optional)

```bash
cd scripts
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python cloud_uploader.py
```

The uploader listens on a RabbitMQ queue and uploads anomaly frames to MinIO for retraining pipelines.

---

## Environment Variables

All configuration is loaded from environment variables with sensible defaults.

| Variable               | Default              | Description                          |
|------------------------|----------------------|--------------------------------------|
| `BROKER_HOST`          | `localhost`          | MQTT broker hostname                 |
| `BROKER_PORT`          | `1883`               | MQTT broker port                     |
| `TOPIC`                | `simulation/images`  | MQTT topic                           |
| `RABBITMQ_HOST`        | `localhost`          | RabbitMQ hostname                    |
| `CONFIDENCE_THRESHOLD` | `0.90`               | Alert trigger threshold              |
| `SEEN_CLASSES`         | *(comma-separated)*  | Known anomaly classes                |
| `IMAGE_FOLDER`         | `Dataset/Broken stitch` | Streamer source folder            |
| `DELAY_SECONDS`        | `0.066`              | Interval between frames (≈15 FPS)    |

---

## API Endpoints

| Endpoint              | Type          | Description                          |
|-----------------------|---------------|--------------------------------------|
| `GET /video_feed`     | MJPEG stream  | Live camera feed with predictions    |
| `GET /status`         | JSON          | System status & latest prediction    |
| `GET /metrics`        | JSON          | Detailed operational metrics         |
| `GET /health`         | JSON          | Health check                         |
| `WS /ws/alerts`       | WebSocket     | Real-time anomaly alert broadcast    |

---

## Linting & Tests

### Backend

```bash
cd backend

# Run tests
pytest                    # All tests
pytest -v                 # Verbose output

# Lint (ruff)
ruff check .              # Check for issues
ruff check . --fix        # Auto-fix where possible
ruff format --check .     # Check formatting
ruff format .             # Auto-format
```

### Frontend

```bash
cd camera-app

# Lint (ESLint via react-scripts)
npm run build             # Lint errors fail the build

# Run tests
npm test                  # Launches test runner in watch mode
npx react-scripts test --watchAll=false   # Single run (CI-friendly)
```

---

## Local Disk Storage vs MQTT

### True Event-Driven Behavior
MQTT uses a Publish/Subscribe model. The simulation script reads files from the data folder and publishes them at set intervals to a topic. Our consuming application subscribes to that topic and reacts instantly to incoming data, exactly like a production IoT or telemetry pipeline.

### Architectural Decoupling
The application processing the data doesn't need to know where the data folder is, or even that it's looking at simulated data. We can easily swap the simulation script for real live data later without changing your consumer code (no need to change our backend base code we just need to publish via the real data simulator into the queue and our backend consume it)

### Conclusion
MQTT is the clear winner for streaming simulations.
It behaves exactly like a real production setup and makes it incredibly easy to connect everything without headaches later on.

## RabbitMQ for ML inference pipeline

RabbitMQ is used to decouple ML inference from downstream processing tasks such as anomaly storage, alerting, and retraining pipelines. It acts as a reliable buffer between producers and consumers, ensuring that slow or temporarily unavailable services do not impact the real-time image processing pipeline.

## MQTT vs RabbitMQ

### MQTT is excellent for:

* IoT devices,
* cameras,
* sensors,
* lightweight telemetry streams.

### RabbitMQ is better for:

* guaranteed delivery,
* durable queues,
* retries,
* acknowledgements,
* work distribution among multiple consumers.