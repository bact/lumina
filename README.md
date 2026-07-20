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

```shell
git clone https://github.com/bact/lumina.git
cd lumina
docker compose up
```

`docker compose up` auto-loads `docker-compose.override.yml` (development
mode). The nginx image uses the `dev` stage, which also serves the UI kit.

Then open **<http://localhost>** in your browser.

| Service | URL | Notes |
| - | - | - |
| Frontend | <http://localhost> | Production frontend (implementation) |
| UI kit | <http://localhost/ui-kits/lumina-app/> | Design source of truth (dev only) |
| API | <http://localhost/api/> | Proxied by nginx |
| API (direct) | <http://localhost:8000> | For development / curl |

**Production mode** (UI kit excluded from image):

```shell
docker compose -f docker-compose.yml up
```

Stop everything:

```shell
docker compose down
```

Stop and remove volumes:

```shell
docker compose down -v
```

---

## Deploying publicly

To run Lumina on the public internet for free (always-on VM + free HTTPS),
follow **[INSTALL.md](INSTALL.md)**.

---

## Development workflow

### Rebuild after dependency changes

```shell
docker compose build
docker compose up
```

### Tail logs for a specific service

```shell
docker compose logs -f api
docker compose logs -f nginx
```

### Serve the frontend locally (no Docker)

```shell
python3.14 -m http.server 3000 --directory frontend
```

Then open **<http://localhost:3000>**.

> **UI kit:** the UI kit at `ui-kits/lumina-app/` requires the dev Docker
> image to resolve its design-token paths correctly. Browse it via
> `docker compose up` at **<http://localhost/ui-kits/lumina-app/>**.

### Run the API outside Docker (faster iteration)

```shell
cd backend
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Requires Python 3.14. SBOM generation also needs `git` on PATH (for cloning
repository URLs); Pitloom is installed via `requirements.txt`.

### Open a shell in a running container

```shell
docker compose exec api bash
docker compose exec nginx sh
```

---

## Services

```text
nginx   → http://localhost:80
          Reverse proxy: serves the static frontend, proxies /api/ to FastAPI,
          and (in dev) also serves the UI kit at /ui-kits/lumina-app/.
          Built from proxy/Dockerfile.

api     → http://localhost:8000
          FastAPI -- SBOM upload + conformance checking, plus Mode-1 SBOM
          generation (Git repo / Hugging Face URL) run as an in-process
          background job. See backend/app/main.py, conformance.py, generate.py.
```

SBOM generation needs no separate worker or Redis at this stage; a worker +
Redis are introduced only if load grows. See
[docs/design.md](docs/design.md#background-job-execution) for the staged plan.

---

## Conformance checking

| Regulation | Checker (now) | When external support lands |
| - | -| - |
| NTIA Minimum Elements | `ntia-conformance-checker` | already active |
| BSI TR-03183 | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |
| G7 AI SBOM | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |
| MOF | Lumina internal (stub) | update `CHECKER_MAP` in `conformance.py` |

**Roadmap:** EU CRA, EO 14028, FDA PMP, and ISO/IEC 5230 are planned. Their
ids are reserved in `plannedRegulations` (`frontend/data.js`); the UI shows
only regulations that are actually supported. See
[AGENTS.md](AGENTS.md) "Adding a regulation" for the promotion steps.

See [docs/design.md](docs/design.md) for the full architecture.

---

## Project layout

```text
lumina/
├── docker-compose.yml          Production compose (nginx target: prod)
├── docker-compose.override.yml Dev overrides — auto-loaded; nginx target: dev
├── proxy/                      Reverse-proxy service (nginx)
│   ├── Dockerfile              Multi-stage: dev (config only) / prod (self-contained)
│   ├── prod.conf               Prod: root /app, frontend only
│   └── dev.conf                Dev: root /workspace/frontend, aliases for ui-kit paths
├── ui-kits/lumina-app/         Design source of truth — dev Docker only, not in prod image
│   ├── index.html              Entry point; design-token paths routed by proxy/dev.conf
│   ├── data.js                 Authoritative field list for all regulations
│   └── *.jsx / *.js            Screens and components
├── frontend/                   Frontend source — always in the Docker image
│   ├── index.html              Implementation entry + router
│   ├── colors-and-type.css     Design tokens (canonical copy)
│   ├── assets/                 Logo SVGs
│   └── *.jsx / *.js            Screens and components
├── backend/                    Python API
│   ├── Dockerfile
│   ├── requirements.txt        Deps pinned by version (or commit SHA) for reproducible builds
│   └── app/
│       ├── main.py             FastAPI app + endpoints
│       ├── conformance.py      ConformanceEngine, CHECKER_MAP, schemas
│       ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│       ├── jobs.py             JobQueue interface + in-process backend
│       ├── generate.py         Mode-1 job: artefact URL → SBOM → check
│       └── generators/         Pitloom-backed SBOM generators (git, hf)
├── scripts/
│   ├── oci-launch.sh           Retry-launch an Oracle Cloud A1 free VM (capacity loop)
│   └── cloud-init.sh           First-boot script: installs Docker on the VM
├── docs/
│   └── design.md               Architecture and design decisions
└── INSTALL.md                  Free public-deployment guide
```
