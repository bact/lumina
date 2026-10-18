---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina

A web-based Software Bill of Materials (SBOM) conformance checker.

Lumina checks an SBOM against a regulation's minimum elements and shows, rule
by rule, whether the SBOM has the property each rule asks for -- so the answer
to *"are we conformant?"* stops being a folder of PDFs. Bring an SBOM file, a
SARIF log from a checker, or a Git or Hugging Face URL for Lumina to generate
an SBOM from. The checks themselves are run by
[ntia-conformance-checker](https://github.com/spdx/ntia-conformance-checker).

The web UI has four screens: *Generate & check* (a URL), *Upload SBOM*,
*Import SARIF* and *About*. It shows only what the API returns.

---

For a demo on a new machine, see [DEMO.md](DEMO.md).

## Quick start with Docker

**Prerequisites:** Docker and Docker Compose (v2).

```shell
git clone https://github.com/bact/lumina.git
cd lumina
docker compose up
```

`docker compose up` auto-loads `docker-compose.override.yml` (development
mode). The nginx image uses the `dev` stage, which serves `frontend/` from a
bind mount, so frontend edits show up on reload without a rebuild.

Then open **<http://localhost>** in your browser.

| Service | URL | Notes |
| - | - | - |
| Frontend | <http://localhost> | Static frontend |
| API | <http://localhost/api/> | Proxied by nginx |
| API (direct) | <http://localhost:8000> | For development / curl |

**Production mode** (frontend baked into the nginx image):

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

### Run the API outside Docker (faster iteration)

```shell
cd backend
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Requires Python 3.14. SBOM generation also needs `git` on PATH (for cloning
repository URLs); Pitloom is installed via `requirements.txt`.

Run the backend checks (from `backend/`):

```shell
pip install -r requirements-dev.txt
pytest
mypy
pylint app tests
```

The frontend has a headless-browser smoke test, `scripts/ui-smoke.mjs`; see
[AGENTS.md](AGENTS.md#ui-smoke-test).

### Open a shell in a running container

```shell
docker compose exec api bash
docker compose exec nginx sh
```

---

## Services

```text
nginx   → http://localhost:80
          Reverse proxy: serves the static frontend and proxies /api/ to
          FastAPI. Built from proxy/Dockerfile.

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

Lumina does no checking itself. [ntia-conformance-checker][checker] runs every
check, and Lumina turns its [SARIF][sarif] log into a field-level result: which
requirements the SBOM has a property for, and which it lacks (`present` means the
property exists, not that its value is right). The checker detects SPDX
2 or 3 from the file.

| Regulation | Checker standard | Result |
| - | - | - |
| NTIA Minimum Elements (2021) | `ntia` | per-requirement gaps |
| G7 SBOM for AI Minimum Elements (2026) | `g7ai` | per-requirement gaps; partial coverage, SPDX 3 only |
| CISA 2026 Minimum Elements | `cisa2026` | per-requirement gaps; partial coverage, SPDX 3 only |
| FSCT 2024 (CISA Framing) | `fsct3` (API id `fsct2024`) | per-requirement gaps; partial coverage |
| BSI TR-03183-2 v2.1 | `bsi` | per-requirement gaps; partial coverage, SPDX 3 only |
| MOF | none | not supported; the API returns HTTP 501 |

Requirement ids are the [SBOM requirements ontology][bom] ids, for example
`BOM-NTIA2021-DF-001`.

### API

| Endpoint | Purpose |
| - | - |
| `GET /api/v1/regulations` | Regulations Lumina knows, with `ready` set when the checker supports them |
| `POST /api/v1/sbom/check` | Upload an SBOM (SPDX 2 or 3; up to 10 MiB by default) and check it |
| `POST /api/v1/artifact/check` | Generate an SBOM from a Git or Hugging Face URL, then check it (background job) |
| `GET /api/v1/jobs/{job_id}` | Status and result of a background job |
| `POST /api/v1/sarif/import` | Read a SARIF 2.1.0 log from any producer, without running a check |

Every check returns one `SbomCheckResponse`: the conformance result (counts,
per-rule outcomes and gaps), the checker run (tool, version, the generator of a
generated SBOM, notifications), and, when an imported SARIF log embeds it, the
SBOM. A refused request (413 too large, 422 unreadable or unsupported, 501
unsupported regulation) carries the reason in `detail`.

### Adding a regulation

Add it to `RegulationId` and `CHECKER_STANDARDS` in
[`backend/app/conformance.py`](backend/app/conformance.py) once the checker
supports it; the UI lists what `GET /api/v1/regulations` returns. See
[AGENTS.md](AGENTS.md#adding-a-regulation) for the SARIF and UI steps.

**Roadmap:** EU CRA, EO 14028, FDA PMP, and ISO/IEC 5230 are planned; none is
in the API yet.

See [docs/design.md](docs/design.md) for the full architecture.

[checker]: https://github.com/spdx/ntia-conformance-checker
[sarif]: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
[bom]: https://bact.github.io/bom/

---

## Project layout

```text
lumina/
├── docker-compose.yml          Base compose (nginx target: prod; api with --reload)
├── docker-compose.override.yml Dev overrides — auto-loaded; nginx target: dev
├── proxy/                      Reverse-proxy service (nginx)
│   ├── Dockerfile              Multi-stage: dev (config only) / prod (self-contained)
│   ├── prod.conf               Prod: root /app, frontend only
│   └── dev.conf                Dev: root /workspace/frontend (bind-mounted frontend/)
├── frontend/                   Static frontend (see frontend/readme.md)
│   ├── index.html              Entry point + router
│   ├── colors-and-type.css     Design tokens
│   ├── assets/                 Logo SVGs
│   └── *.jsx / *.js            Shell, shared components, screens
├── backend/                    Python API
│   ├── Dockerfile
│   ├── requirements.txt        Pinned; Pitloom and the checker by Git commit
│   └── app/
│       ├── main.py             FastAPI app + endpoints
│       ├── conformance.py      run_checker, CHECKER_STANDARDS, schemas
│       ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│       ├── jobs.py             JobQueue interface + in-process backend
│       ├── generate.py         Mode-1 job: artefact URL → SBOM → check
│       └── generators/         Pitloom-backed SBOM generators (git, hf)
├── scripts/
│   ├── oci-launch.sh           Retry-launch an Oracle Cloud A1 free VM (capacity loop)
│   ├── oci-launch.env.example  Template for oci-launch.sh's local config
│   ├── cloud-init.sh           First-boot script: installs Docker on the VM
│   └── ui-smoke.mjs            Headless-browser smoke test of the frontend (see AGENTS.md)
├── docs/
│   └── design.md               Architecture and design decisions
└── INSTALL.md                  Free public-deployment guide
```
