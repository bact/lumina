# Agent instructions

## What this project is

Lumina -- web-based SBOM (Software Bill of Materials) conformance checker.
Takes an SBOM (uploaded, or generated from a Git or Hugging Face URL) or a
SARIF log, and shows per rule of the chosen regulation whether the SBOM has
the property the rule asks for.

Full design rationale: `docs/design.md`.
Frontend: `frontend/` (design tokens and assets live here too).

The UI shows only real data from the backend: no sample or invented data,
anywhere. A screen that has nothing to show from the API shows nothing.

---

## Stack

| Layer | Technology |
| - | - |
| Frontend | Static HTML/CSS/JS (React 18 + Babel in-browser, no build step) |
| API | FastAPI (Python 3.14) |
| Background jobs | In-process `asyncio` queue (`backend/app/jobs.py`); no broker. An RQ/Taskiq swap is planned for Stage 2 — see `docs/design.md` |
| SBOM generation | Pitloom (Git checkout or Hugging Face Hub URL) |
| Dev environment | Docker Compose (`docker compose up` — auto-loads override.yml) |

Python minimum: **3.14**. Use `python3.14` when running outside Docker.

---

## Repository layout

```text
lumina/
├── docker-compose.yml          Base compose (nginx target: prod; api with --reload)
├── docker-compose.override.yml Dev overrides — auto-loaded; nginx target: dev,
│                               mounts frontend/ at /workspace/frontend
├── .dockerignore               Keeps caches/git/docs out of Docker build context
├── proxy/                      Reverse-proxy service (nginx)
│   ├── Dockerfile              Multi-stage: dev (config only) / prod (self-contained)
│   ├── prod.conf               Prod: root /app (frontend baked in)
│   └── dev.conf                Dev: root /workspace/frontend (bind mount)
├── frontend/                   Static frontend (see frontend/readme.md)
│   ├── index.html              Entry point + router
│   ├── colors-and-type.css     Design tokens
│   ├── assets/                 Logo SVGs
│   └── *.jsx / *.js            Shell, shared components, screens
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt        Pinned deps; Pitloom and the checker by Git commit
│   ├── app/
│   │   ├── main.py             FastAPI endpoints
│   │   ├── conformance.py      run_checker, CHECKER_STANDARDS, schemas
│   │   ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│   │   ├── jobs.py             JobQueue interface + in-process backend
│   │   ├── generate.py         Mode-1 job: artefact URL → SBOM → check (SSRF guard)
│   │   └── generators/         Pitloom-backed SBOM generators (git, hf)
│   └── tests/                  pytest suite + SBOM and SARIF fixtures
├── docker/                     Alternative deployment images (see INSTALL.md)
│   ├── compose/                Production compose override (VM deploy)
│   ├── hfspaces/               Hugging Face Spaces single-file Dockerfile
│   └── standalone/             Single-container image (Cloud Run)
├── scripts/                    OCI VM launch + cloud-init helpers; ui-smoke.mjs
├── docs/
│   └── design.md               Architecture and design decisions
└── INSTALL.md                  Free public-deployment guide (3 options)
```

---

## Conformance checking -- critical rules

Lumina does no conformance checking itself: `ntia-conformance-checker` runs
every check and `run_checker` in `backend/app/conformance.py` parses its SARIF.
NTIA, G7 AI SBOM, CISA 2026, FSCT 2024 and BSI come from the checker; BSI
reports a verdict (a `sbom.verdict` notification) but no per-rule results.
MOF is not supported (HTTP 501).

**CHECKER_STANDARDS** in `backend/app/conformance.py` maps a Lumina regulation
id to the checker's standard id; add a regulation there once the checker
supports it.

Do not change the `SbomCheckResponse` models (`ConformanceResult`, `RuleResult`,
`FieldGap`, `CheckRun`, `Notification`) in `conformance.py` without updating
the frontend that reads them (`ArtifactResult` in
`frontend/screen-conformance.jsx`) and the mocked responses in
`scripts/ui-smoke.mjs`.

### Adding a regulation

The long-term goal is to cover EU CRA, EO 14028, FDA PMP, ISO/IEC 5230, and
more. The frontend lists exactly what `GET /api/v1/regulations` returns, so a
regulation appears in the UI only once the backend knows it. To add one:

1. Extend the `RegulationId` Literal and `CHECKER_STANDARDS` in
   `backend/app/conformance.py`. `GET /api/v1/regulations` then lists it with
   `ready: true`; an id in `RegulationId` but not in `CHECKER_STANDARDS` is
   listed with `ready: false` and cannot be picked in the UI.
2. Add its edition-keyed spec code (the `SPEC` + `YEAR` segment of its rule
   ids, ontology form `BOM-[SPEC][YEAR]-...`) to `_SPEC_TO_REGULATION`, and the
   checker's standard id to `_STANDARD_TO_REGULATION`, in
   `backend/app/sarif_ingest.py`; both must name the exact edition.
3. In `frontend/screen-conformance.jsx`, give it a label, a one-line
   description of what the check covers and a source link in
   `IMPORT_REGULATIONS`, and name its rule clusters (the cluster segment of
   its rule ids) in `RULE_CLUSTERS`. Without them the UI still works but shows
   the bare id and cluster codes.

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
- Keep each implementation of an interface (such as `JobQueue` in `jobs.py`)
  in its own class, not as branches inside one class.
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
- Show only what the API returns. Labels, descriptions and links for
  regulation ids live in one table (`IMPORT_REGULATIONS`); never hard-code a
  list of regulations, rules or results.
- Show a failed request's `detail` text (`apiErrorMessage` in
  `screen-conformance.jsx`); never replace it with a generic message.
- Only the app shell is translated (`i18n.js`). Offer a locale in the picker
  only when it has a catalogue with every shell key.

### UI smoke test

`scripts/ui-smoke.mjs` serves `frontend/`, mocks every `/api/` route, visits
every side-nav screen in headless Chromium and fails on a page or console
error, on an old sample-data string, when the regulation chips differ from the
mocked `GET /api/v1/regulations`, when a refused request's `detail` is not
shown, or when the BSI verdict-only result shows counts. It needs Node 18+ and
a `node_modules` directory (outside the repository; never commit it) with
`playwright-core`, `react@18.3.1`, `react-dom@18.3.1`,
`@babel/standalone@7.29.0` and `lucide`, which also serve the page's CDN
scripts offline:

```shell
npm install --prefix /some/dir playwright-core react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0 lucide
LUMINA_SMOKE_NODE_MODULES=/some/dir/node_modules \
LUMINA_SMOKE_CHROMIUM=/path/to/chromium \
node scripts/ui-smoke.mjs /tmp/lumina-shots
```

`LUMINA_SMOKE_CHROMIUM` can be left unset when playwright-core finds its own
browser. It prints one line per check, exits non-zero on a failure, and writes
a full-page screenshot of every state to the given directory: look at them
after a UI change.

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
- Lumina does not parse SBOM files itself: the checker reads them (SPDX 2
  through `spdx-tools`, SPDX 3 through its own reader) and reports a file it
  cannot read as an `spdx.parsing-error` notification. A file whose SPDX
  version cannot be determined is refused with HTTP 422.
