FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libgl1 \
    libgles2 \
    libegl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Keep MediaPipe Tasks separate from TensorFlow's native inference runtime.
COPY requirements-mediapipe-tasks.txt .
RUN python -m venv /opt/mediapipe-tasks \
    && /opt/mediapipe-tasks/bin/pip install --no-cache-dir -r requirements-mediapipe-tasks.txt

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
