FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# WeasyPrint runtime deps (libpango for text shaping, fonts for fallback rendering).
# Kept even before invoice/report routes are ported so the image is ready when
# those land.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 \
      fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Templates ride along with app/. Listed explicitly so a future repo
# layout change that drops them surfaces here at build time instead of
# at first PDF render.
RUN test -f app/templates/invoices/_pdf.html

ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=${BUILD_COMMIT}

EXPOSE 8000
# Trust X-Forwarded-* from Traefik / Cloudflare so request.url_for() builds
# https URLs (Google OAuth rejects http:// redirect URIs).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
