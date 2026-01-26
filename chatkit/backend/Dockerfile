FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (kept minimal)
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl \
  && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r /app/requirements.txt

# Copy app code
COPY app /app/app
COPY scripts /app/scripts

# Ensure start script is executable
RUN chmod +x /app/scripts/start.sh

# App Runner expects the app to listen on the configured port (we default to 8000)
EXPOSE 8000

CMD ["/app/scripts/start.sh"]
