---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina

A web-based Software Bill of Materials (SBOM) conformance checker.

Lumina checks an SBOM against a minimum elements standard and shows, rule
by rule, whether the SBOM has the property each rule asks for -- so the answer
to *"are we conformant?"* stops being a folder of PDFs. Bring an SBOM file, a
SARIF log from a checker, or a Git or Hugging Face URL for Lumina to generate
an SBOM from. The checks themselves are run by
[ntia-conformance-checker][checker].

The web UI has four screens: *Generate & check* (a URL), *Upload SBOM*,
*Import SARIF* and *About*. It shows only what the API returns: per rule, the
value the SBOM holds and the SBOM elements behind it with a link to their lines
in the SBOM source, the SBOM itself (download and highlighted source), and, for
a generated SBOM, the generator's log. With a result on screen, picking another
minimum elements standard checks the same SBOM again without generating or
uploading it again.

---

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
          FastAPI -- SBOM upload + conformance checking, plus SBOM
          generation (Git repo / Hugging Face URL) run as an in-process
          background job. See backend/app/main.py, conformance.py, generate.py.
```

SBOM generation runs inside the `api` service: there is no separate worker or
Redis.

---

## Conformance checking

Lumina does no checking itself. [ntia-conformance-checker][checker] runs every
check, and Lumina turns its [SARIF][sarif] log into a rule-level result: which
rules the SBOM has a property for, and which it lacks (`present` means the
property exists, not that its value is right). The checker detects SPDX
2 or 3 from the file.

| Minimum elements standard | Checker standard | Result |
| - | - | - |
| NTIA Minimum Elements (2021) | `ntia` | per-rule results; SPDX 2 and 3 |
| G7 SBOM for AI (2026) | `g7ai` | per-rule results; partial coverage, SPDX 3 only |
| CISA 2026 Minimum Elements | `cisa2026` | per-rule results; partial coverage, SPDX 3 only |
| FSCT 2024 (CISA Framing) | `fsct3` (API id `fsct2024`) | per-rule results; partial coverage; SPDX 2 and 3 |
| BSI TR-03183-2 v2.1 | `bsi` | per-rule results; partial coverage, SPDX 3 only; optional elements counted apart |
| Model Openness Framework | none | not supported; the API returns HTTP 501 |

Requirement ids are the [SBOM requirements ontology][bom] ids, for example
`BOM-NTIA2021-DF-001`.

### API

| Endpoint | Purpose |
| - | - |
| `GET /api/v1/standards` | Standards Lumina knows, with `ready` set when the checker supports them |
| `POST /api/v1/sbom/check` | Upload an SBOM (SPDX 2 or 3; up to 10 MiB by default) and check it; the result carries the SBOM and per-rule evidence |
| `POST /api/v1/artifact/check` | Generate an SBOM from a Git or Hugging Face URL, then check it (background job); the result carries the generated SBOM, per-rule evidence and the generator log |
| `GET /api/v1/jobs/{job_id}` | Status and result of a background job |
| `POST /api/v1/sarif/import` | Read a SARIF 2.1.0 log from any producer, without running a check; an embedded JSON SBOM is returned as `sbom` |

Every check returns one `SbomCheckResponse`: the conformance result (counts,
per-rule outcomes and gaps), the checker run (tool, version, the generator of a
generated SBOM, notifications), and the SBOM itself (`sbom`: the uploaded or
generated file for download and a pretty-printed copy with line numbers; for an
imported SARIF log, the embedded SBOM when it is JSON). For an SPDX 3 JSON
SBOM each rule also carries `evidence`: the elements that have, or lack, what
the rule asks for, with their lines in the SBOM. A refused request (413 too large, 422 unreadable or unsupported, 501
unsupported standard) carries the reason in `detail`.

### Adding a standard

Add it to `StandardId` and `CHECKER_STANDARDS` in
[`backend/app/conformance.py`](backend/app/conformance.py) once the checker
supports it; the UI lists what `GET /api/v1/standards` returns. See
[AGENTS.md](AGENTS.md#adding-a-standard) for the SARIF and UI steps.

**Roadmap:** EU CRA, EO 14028, FDA PMP, and ISO/IEC 5230 are planned; none is
in the API yet.

[checker]: https://github.com/bact/ntia-conformance-checker
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
├── frontend/                   Static frontend (see AGENTS.md)
│   ├── index.html              Entry point + router
│   ├── colors-and-type.css     Design tokens
│   ├── assets/                 Logo SVGs
│   ├── examples/               Real SBOM and SARIF files the example cards load
│   ├── vendor/                 React, Babel, Lucide, highlight.js (no CDN)
│   └── *.jsx / *.js            Shell, shared components, screens
├── backend/                    Python API
│   ├── Dockerfile
│   ├── pyproject.toml          mypy configuration
│   ├── requirements.txt        Pinned; Pitloom and the checker by Git commit
│   ├── requirements-dev.txt    Test and lint tools
│   ├── app/
│   │   ├── main.py             FastAPI app + endpoints
│   │   ├── conformance.py      run_checker, CHECKER_STANDARDS, schemas
│   │   ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│   │   ├── generation_log.py   Generation log shown in the Generator log tab
│   │   ├── sbom_source.py      SBOM source text and @graph line index
│   │   ├── evidence/           Per-rule evidence: the SBOM elements behind each outcome
│   │   ├── jobs.py             JobQueue interface + in-process backend
│   │   ├── generate.py         Generation job: artefact URL → SBOM → check
│   │   └── generators/         Pitloom-backed SBOM generators (git, hf)
│   └── tests/                  pytest suite + SBOM and SARIF fixtures
├── scripts/
│   ├── oci-launch.sh           Retry-launch an Oracle Cloud A1 free VM (capacity loop)
│   ├── oci-launch.env.example  Template for oci-launch.sh's local config
│   ├── cloud-init.sh           First-boot script: installs Docker on the VM
│   └── ui-smoke.mjs            Headless-browser smoke test of the frontend (see AGENTS.md)
├── docker/                     Alternative deployment images (see INSTALL.md)
├── .github/                    CI: backend tests; Dependabot
└── INSTALL.md                  Free public-deployment guide
```
