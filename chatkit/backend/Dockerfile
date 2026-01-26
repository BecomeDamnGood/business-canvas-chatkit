FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY scripts /app/scripts

# THIS FIX: copy widgets into the image at the path your server expects
COPY widgets /app/widgets

RUN chmod +x /app/scripts/start.sh

EXPOSE 8000

CMD ["/app/scripts/start.sh"]
