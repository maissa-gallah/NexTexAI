# Scripts — Image Streaming & Cloud Uploader

Standalone utility scripts for simulating image acquisition, MQTT-based frame relay, and anomaly-frame uploads to MinIO for retraining pipelines.

## Prerequisites

- Python 3.10+
- **MQTT broker** (e.g., Mosquitto) running on `localhost:1883`
- **RabbitMQ** (for `cloud_uploader.py`)
- **MinIO** (for `cloud_uploader.py`)

## Setup

```bash
# 1. Create a virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy and customise environment variables
cp .env .env
# Edit .env to match your setup
```

## Scripts

| Script | Purpose |
|---|---|
| `image_streamer.py` | Publishes images from a local folder to an MQTT topic at a configurable rate. |
| `image_receiver.py` | Subscribes to an MQTT topic and saves received images to disk. |
| `cloud_uploader.py` | Listens on a RabbitMQ queue and uploads anomaly frames to MinIO (S3-compatible). |

## Usage

### 1. Stream images over MQTT

```bash
python image_streamer.py
```

Reads images from `IMAGE_FOLDER` (set in `.env`) and publishes them one by one to the MQTT topic.

### 2. Receive images via MQTT

```bash
python image_receiver.py
```

Subscribes to the same MQTT topic and saves each incoming image to `OUTPUT_DIR/`.

### 3. Upload anomaly frames to MinIO

```bash
python cloud_uploader.py
```

Consumes messages from the RabbitMQ `cloud_upload_queue` and uploads each frame to MinIO under `retraining/<class_name>/frame_<number>.jpg`.

## Environment Variables

See `.env` for a full list of configurable options with their defaults.
