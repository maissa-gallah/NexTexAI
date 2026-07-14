FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command (override in docker-compose per service)
CMD ["python", "image_streamer.py"]
