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

## Data Flow (end-to-end)

1. **`image_streamer.py`** reads images from `Dataset/` and publishes them via MQTT to the `simulation/images` topic.
2. **`MqttHandler`** subscribes to that topic; on each message it calls `simulate_prediction()` — randomly assigning a defect class and confidence.
3. **`StreamService`** receives the `FrameData` (image bytes + prediction) and buffers it in an async queue.
4. **`generate_mjpeg()`** consumes the queue and produces a multipart/x-mixed-replace stream: each frame is preceded by JSON metadata (the prediction) and followed by the raw JPEG.
5. **`CameraFeed`** (React) fetches the stream via `fetch()` → `ReadableStream` and parses the multipart boundaries with the `consumeStream()` parser — rendering images and overlaying predictions.
6. **`AlertEngine`** evaluates predictions against thresholds (confidence > 90%, new anomaly classes) and publishes alerts to RabbitMQ + broadcasts via WebSocket to the dashboard.
7. **`cloud_uploader.py`** consumes anomaly frames from RabbitMQ and uploads them to MinIO for retraining pipelines.

---

## Dataset

This project uses the **[Multi-Class Fabric Defect Detection Dataset](https://www.kaggle.com/datasets/ziya07/multi-class-fabric-defect-detection-dataset)** by Ziya (CC0: Public Domain).


### Sequential Streaming Approach

The dataset is used as a **sequential unlabeled stream** to simulate a real-time camera feed:

1. **`image_streamer.py`** reads images from a single folder (default `Dataset/Broken stitch`) and publishes them one by one over MQTT, mimicking frames coming off a production line.
2. **No labels are attached at the source** — the streamer simply sends raw JPEG bytes.
3. **The backend subscribes to the MQTT topic and *simulates* the prediction step**: it randomly assigns a defect class and confidence score to each incoming frame.

---

## Running the Project

### Prerequisites

- Docker & Docker Compose (recommended)
- Python 3.11+ (for local development)
- Dataset extracted to the `Dataset/` folder (see dataset setup below) 

### Quick Start (Docker Compose)

```bash
# 1. Clone and enter the project
cd NexTexAI

# 2. Extract the dataset zip into the Dataset/ folder
#    (e.g., unzip dataset.zip -d Dataset/ — adjust the filename to your downloaded archive)

# 3. Start all services
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

> **📦 Dataset setup:** Before running the streamer, make sure the dataset archive is extracted into the `Dataset/` directory so that the subfolders (e.g. `Broken stitch/`, `hole/`, `stain/`) are directly inside it. Example:
> ```bash
> cd NexTexAI
> unzip dataset.zip -d Dataset/
> ```

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

## Continuous Integration

This project uses **GitHub Actions** to automatically lint and test every push to `main` and every pull request. The pipeline is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and consists of four parallel jobs:

| Job              | What it runs                      | Triggers                   |
|------------------|-----------------------------------|----------------------------|
| `python-lint`    | `ruff check .` on `backend/` & `scripts/` | Push to `main` / PR |
| `python-test`    | `pytest` on `backend/` & `scripts/`       | Push to `main` / PR |
| `frontend-lint`  | `eslint src/` on `camera-app/`            | Push to `main` / PR |
| `frontend-test`  | `react-scripts test` on `camera-app/`     | Push to `main` / PR |

A **passing CI check** is required before merging any pull request, ensuring code quality and preventing regressions.

---

## Linting & Tests

Run the same checks locally before pushing:

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

---

## Production Considerations

The following analysis covers critical areas to address before deploying this architecture to a production environment. Each section identifies current gaps and recommended mitigations.

### 🔒 Security

| Concern | Current State | Production Requirement |
|---------|---------------|-----------------------|
| **MQTT authentication** | `allow_anonymous true` — no auth at all | Enable username/password or certificate-based authentication. Disable anonymous access. |
| **API authentication** | All endpoints are wide open — no auth on `/video_feed`, `/status`, `/metrics`, `/ws/alerts` | Add JWT, OAuth2, or API-key authentication. The frontend should authenticate before accessing streams or WebSockets. |
| **CORS policy** | `allow_origins=["http://localhost:3000"]` with `allow_methods=["*"]` and `allow_headers=["*"]` | Lock to actual production domain(s). Restrict methods and headers to the minimum required set. |
| **Hardcoded credentials** | `minioadmin/minioadmin` and RabbitMQ `guest/guest` exposed in `docker-compose.yml` | Use a secrets manager (Vault, AWS Secrets Manager, Kubernetes Secrets). Never commit secrets — use `.env` files excluded from version control. |

### 📊 Observability

| Concern | Current State | Production Need |
|---------|---------------|-----------------|
| **Logging** | `print()` statements throughout | Structured JSON logging (structlog, python-json-logger) with proper log levels (DEBUG, INFO, WARNING, ERROR). |
