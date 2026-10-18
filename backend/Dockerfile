# ==============================================================================
# 🐳 MedAttend AI Backend — Production Dockerfile
# Optimized for Hugging Face Spaces (Port 7860) & Cloud VPS Deployments
# ==============================================================================

FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# Install minimal OS dependencies for OpenCV Headless and InsightFace compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python package dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Pre-cache InsightFace buffalo_sc models so container boots in < 1 second
RUN python -c "import insightface; app = insightface.app.FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])" || true

# Copy all application code
COPY . .

# Expose port (7860 for Hugging Face Spaces default, configurable via $PORT)
EXPOSE 7860

# Start FastAPI Uvicorn engine
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
