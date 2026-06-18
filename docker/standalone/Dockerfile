## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0
##
## Combined single-container image for Cloud Run (and any single-container PaaS).
## Runs nginx (static frontend + /api/ reverse proxy) and uvicorn via supervisord.
##
## Build from the repo root:
##   docker build -f docker/standalone/Dockerfile -t lumina .
##
## PORT env var: injected by Cloud Run (8080); defaults to 7860 for local testing.

FROM python:3.14-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# Backend
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app/ ./app/

# Frontend static files
COPY frontend/ /app/frontend/

# nginx config template (port substituted at start time by start.sh)
COPY docker/standalone/nginx.conf.template /etc/nginx/lumina.conf.template

# supervisord drop-in (picked up via Debian's default /etc/supervisor/supervisord.conf [include])
COPY docker/standalone/supervisord.conf /etc/supervisor/conf.d/lumina.conf

# Entrypoint: writes nginx config from template, then starts supervisord
COPY docker/standalone/start.sh /start.sh
RUN chmod +x /start.sh

ENV PORT=7860
EXPOSE 7860

CMD ["/start.sh"]
