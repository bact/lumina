## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0

# Build context must be the project root (docker-compose.yml sets context: .)
# so both frontend/ and ui-kits/ are reachable during build.

# ── dev stage ────────────────────────────────────────────────────────────────
# Minimal image — just nginx + dev config. All content is provided by volume
# mounts in docker-compose.override.yml so live-reload works without rebuilds.
# Serves the production frontend at / and the UI kit at /ui-kits/lumina-app/.

FROM nginx:1.27-alpine AS dev

COPY proxy/dev.conf /etc/nginx/conf.d/default.conf
# Content served from /workspace, which docker-compose.override.yml
# bind-mounts from the project root at runtime.

# ── prod stage (default) ─────────────────────────────────────────────────────
# Self-contained image — no volume mounts required. UI kit and root design
# assets are not included.

FROM nginx:1.27-alpine AS prod

COPY proxy/prod.conf /etc/nginx/conf.d/default.conf
COPY frontend/   /app/
