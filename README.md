---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina

A web-based Software Bill of Materials (SBOM) viewer and conformance checker.

Lumina reads an SBOM and shows whether the fields a given regulation actually
asks for are present -- so the answer to *"are we conformant?"* stops being a
folder of PDFs.

---

## Quick start with Docker

**Prerequisites:** Docker and Docker Compose (v2).

```sh
git clone https://github.com/bact/lumina.git
cd lumina
docker compose up
```

Then open **<http://localhost>** in your browser.

| Service | URL | Notes |
| - | - | - |
| UI | <http://localhost> | Static SBOM viewer |
| API | <http://localhost/api/> | Proxied by nginx |
| API (direct) | <http://localhost:8000> | For development / curl |
| Redis | localhost:6379 | Broker + Celery result backend |

Stop everything:

```sh
docker compose down
```

Stop and remove volumes (wipes Redis state):

```sh
docker compose down -v
```

---

## Development workflow

### Rebuild after dependency changes

```sh
docker compose build
docker compose up
```

### Tail logs for a specific service

```sh
docker compose logs -f api
docker compose logs -f worker
```

### Serve the frontend locally (no Docker)

```sh
python3.14 -m http.server 3000 --directory frontend
```

Then open **<http://localhost:3000>**.

### Run the API outside Docker (faster iteration)

```sh
cd backend
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Requires Python 3.14 and a local Redis instance (or `docker compose up redis`).

### Open a shell in a running container

```sh
docker compose exec api bash
docker compose exec worker bash
```

---

## Services

```
nginx   → http://localhost:80
          Serves the static frontend and proxies /api/ to FastAPI.
          Built from frontend/Dockerfile.

api     → http://localhost:8000
          FastAPI -- SBOM upload, conformance checking.
          See backend/app/main.py and backend/app/conformance.py.

worker  → (no HTTP port)
          Celery worker for long-running SBOM generation tasks
          (Git repos, Hugging Face models).
          See backend/app/worker.py.

redis   → localhost:6379
          Celery broker and result backend.
          Valkey is a drop-in replacement if preferred.
```

---

## Conformance checking

| Regulation | Checker (now) | When external support lands |
|---|---|---|
| NTIA Minimum Elements | `ntia-conformance-checker` | already active |
| BSI TR-03183 | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |
| G7 AI SBOM | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |
| MOF | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |

See [docs/design.md](docs/design.md) for the full architecture.

---

## Project layout

```
lumina/
├── docker-compose.yml
├── frontend/                 Static web frontend (nginx + React 18)
│   ├── Dockerfile            nginx image; copies nginx.conf + static files
│   ├── nginx.conf            Serves frontend, proxies /api/ to FastAPI
│   ├── index.html            App entry point + router
│   ├── colors-and-type.css   Design tokens (CSS variables)
│   ├── assets/               Logo SVGs
│   ├── data.js               Fixture SBOM + field-level conformance logic
│   ├── i18n.js               Locale strings
│   ├── components.jsx        Shared UI components
│   ├── app-shell.jsx         Navigation shell
│   ├── view-primitives.jsx   Low-level view helpers
│   └── screen-*.jsx          Individual screens
├── backend/                  Python API + task worker
│   ├── Dockerfile
│   ├── requirements.txt      Pinned deps for Docker / pip install -r
│   └── app/
│       ├── main.py           FastAPI app + endpoints
│       ├── conformance.py    ConformanceEngine, CHECKER_MAP, schemas
│       └── worker.py         Celery tasks (SBOM generation)
└── docs/
    └── design.md             Architecture and design decisions
```
