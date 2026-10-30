## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0

# Build context must be the project root (docker-compose.yml sets context: .)
# so proxy/ and frontend/ are reachable during build.

# ── dev stage ────────────────────────────────────────────────────────────────
# Minimal image — just nginx + dev config. The frontend is a volume mount in
# docker-compose.override.yml, so edits show up without a rebuild.

FROM nginx:1.29-alpine AS dev

COPY proxy/dev.conf /etc/nginx/conf.d/default.conf

# ── prod stage (default) ─────────────────────────────────────────────────────
# Self-contained image — no volume mounts required.

FROM nginx:1.29-alpine AS prod

COPY proxy/prod.conf /etc/nginx/conf.d/default.conf
COPY frontend/   /app/
