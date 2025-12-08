# Backend Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for rasterio
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev build-essential curl && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY Backend/Requirements.txt /app/Requirements.txt
RUN pip install --no-cache-dir -r /app/Requirements.txt

# Copy app source
COPY Backend/ /app/

# Ensure data directories exist (mounted in compose in production)
RUN mkdir -p /app/dem /app/wp_2020 /app/tile_cache

EXPOSE 8000

# Start FastAPI via uvicorn
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
