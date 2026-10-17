# Agent instructions

## What this project is

Lumina -- web-based SBOM (Software Bill of Materials) viewer and conformance
checker. Reads an SBOM; shows which fields each active regulation requires and
whether they are present, missing, or unverified.

Full design rationale: `docs/design.md`.
Design source of truth: `ui-kits/lumina-app/` (dev Docker only, not in prod image).
Production frontend: `frontend/` (canonical design tokens + assets live here).

---

## Stack

| Layer | Technology |
| - | - |
| Frontend | Static HTML/CSS/JS (React 18 + Babel in-browser, no build step) |
| API | FastAPI (Python 3.14) |
| Background jobs | In-process `asyncio` queue (`backend/app/jobs.py`); no broker. RQ/Taskiq swap planned at Stage 2 — see `docs/design.md` |
| SBOM generation | Pitloom (Git checkout or Hugging Face Hub URL) |
| Dev environment | Docker Compose (`docker compose up` — auto-loads override.yml) |

Python minimum: **3.14**. Use `python3.14` when running outside Docker.

---

## Repository layout

```text
lumina/
├── docker-compose.yml          Production compose (nginx target: prod)
├── docker-compose.override.yml Dev overrides — auto-loaded; nginx target: dev,
│                               mounts project root at /workspace
├── .dockerignore               Keeps caches/git/docs out of Docker build context
├── proxy/                      Reverse-proxy service (nginx)
│   ├── Dockerfile              Multi-stage: dev (config only) / prod (self-contained)
│   ├── prod.conf               Prod: root /app, frontend only
│   └── dev.conf                Dev: root /workspace/frontend, aliases for ui-kit paths
├── ui-kits/lumina-app/         Design source of truth — dev Docker only, not in prod image
│   ├── index.html              Entry point; ../../ paths routed by proxy/dev.conf → frontend/
│   ├── data.js                 Authoritative field list for all four regulations
│   └── *.jsx / *.js            Screens and components
├── frontend/                   Frontend source — always in the Docker image
│   ├── index.html              Implementation entry + router
│   ├── colors-and-type.css     Design tokens — canonical copy (import this)
│   ├── assets/                 Logo SVGs — canonical copy
│   └── *.jsx / *.js            Screens and components
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt        Pinned deps (one temporary git+SHA pin — see file)
│   ├── app/
│   │   ├── main.py             FastAPI endpoints
│   │   ├── conformance.py      run_checker, CHECKER_STANDARDS, schemas
│   │   ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│   │   ├── jobs.py             JobQueue interface + in-process backend
│   │   ├── generate.py         Mode-1 job: artefact URL → SBOM → check (SSRF guard)
│   │   └── generators/         Pitloom-backed SBOM generators (git, hf)
│   └── tests/                  pytest suite + SARIF fixtures
├── docker/                     Alternative deployment images (see INSTALL.md)
│   ├── compose/                Production compose override (VM deploy)
│   ├── hfspaces/               Hugging Face Spaces single-file Dockerfile
│   └── standalone/             Single-container image (Cloud Run)
├── scripts/                    OCI VM launch + cloud-init helpers
├── docs/
│   └── design.md               Architecture and design decisions
└── INSTALL.md                  Free public-deployment guide (3 options)
```

---

## Conformance checking -- critical rules

Lumina does no conformance checking itself: `ntia-conformance-checker` runs
every check and `run_checker` in `backend/app/conformance.py` parses its SARIF.
Support for NTIA, G7 AI SBOM and BSI comes from the checker; BSI reports a
verdict (a `sbom.verdict` notification) but no per-rule gaps. MOF is not supported (HTTP 501).

**CHECKER_STANDARDS** in `backend/app/conformance.py` maps a Lumina regulation
id to the checker's standard id; add a regulation there once the checker
supports it.

Do not change `ConformanceResult` or `FieldGap` fields without updating both
the Pydantic models in `conformance.py` and the fixture schemas in
`ui-kits/lumina-app/data.js` and `frontend/data.js` (both consume the same shape).

### Adding a regulation

The long-term goal is to cover EU CRA, EO 14028, FDA PMP, ISO/IEC 5230, and
more. Their ids are reserved in `plannedRegulations` in `data.js` (both
copies). The UI must only ever show regulations that are actually supported —
never render a planned entry. To promote one:

1. Move its entry from `plannedRegulations` into `regulations` in
   `ui-kits/lumina-app/data.js` and give it a `fields` list (screens are
   data-driven and pick it up automatically); mirror to `frontend/data.js`.
2. Extend the `RegulationId` Literal and `CHECKER_STANDARDS` in
   `backend/app/conformance.py`.
3. `GET /api/v1/regulations` then reports it with the correct `ready` flag —
   no other backend change needed.

---

## File and URL conventions

- Filenames and URL paths: **lowercase, ASCII, hyphen-separated** -- no spaces,
  no underscores, no camelCase.
- All source files must carry SPDX licence headers:

  ```python
  # SPDX-FileContributor: Arthit Suriyawongkul
  # SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
  # SPDX-FileType: SOURCE
  # SPDX-License-Identifier: Apache-2.0
  ```

  Adjust comment syntax per file type (`##` for Dockerfile, `<!--...-->` for
  HTML/Markdown). Documentation files use `CC0-1.0`; source files use
  `Apache-2.0`.

---

## Python conventions

- Type-annotate all function signatures and class attributes.
- Use `from __future__ import annotations` for forward references.
- Prefer `abc.ABC` + `@abc.abstractmethod` for the checker protocol; keep
  implementations in separate classes (not branches inside one class).
- Do not use `hasattr` guards in production code -- confirm the
  `ntia-conformance-checker` API shape first, then write direct attribute
  access.

---

## Frontend / design system

- Design tokens live in `colors-and-type.css`. Use CSS variables (`--ink`,
  `--paper`, `--shu`, etc.); never hardcode colours or font names in
  component styles.
- Washi paper palette: `--paper` (#F6F3EC) background, sumi-ink text, single
  shu-red accent (`--shu` #C8392A). No large coloured backgrounds.
- Icon set: Lucide via CDN (1.5px stroke). Do not substitute other icon sets
  without updating the `Icon` component in `components.jsx`.
- `ui-kits/lumina-app/` is the visual source of truth (design template).
  When implementing or updating `frontend/`, match the ui-kit pixel-for-pixel
  before deviating. Changes to ui-kit must be reviewed before promotion to
  `frontend/`.

---

## Accessibility

WCAG 2.2 AA. Specifically:

- Every interactive element is a `<button>` or has `role="button"` /
  `role="radio"` with `tabIndex=0` and Enter/Space handlers.
- Every clickable row, card, or SVG node has a descriptive `aria-label`.
- Decorative icons and dots: `aria-hidden="true"`.
- Progress bars: `role="progressbar"` with `aria-valuemin/max/now`.
- No colour as the sole conveyor of state (dot + text label, not dot alone).
- Respect `prefers-reduced-motion`.

---

## Security

- No personal or sensitive information in code, comments, or fixtures.
- Uploaded SBOM files: write to `tempfile.NamedTemporaryFile`, delete in
  `finally` after processing. Never persist user uploads to disk long-term
  without explicit storage design.
- CORS: default is `"*"` (fine behind the same-origin nginx proxy). For public
  deployments set `LUMINA_CORS_ORIGINS` (comma-separated origins) on the api
  service.
- Artefact-URL fetching (`POST /api/v1/artifact/check`) has an SSRF guard in
  `backend/app/generate.py`: http/https only, public addresses only. Set
  `LUMINA_ALLOW_PRIVATE_URLS=1` only in development.
- Validate SBOM files through `spdx-tools` before passing to any checker.
