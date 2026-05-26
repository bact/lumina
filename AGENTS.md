# Agent instructions

## What this project is

Lumina -- web-based SBOM (Software Bill of Materials) viewer and conformance
checker. Reads an SBOM; shows which fields each active regulation requires and
whether they are present, missing, or unverified.

Full design rationale: `docs/design.md`.
Frontend (static React app + design tokens + nginx config): `frontend/`.

---

## Stack

| Layer | Technology |
| - | - |
| Frontend | Static HTML/CSS/JS (React 18 + Babel in-browser, no build step) |
| API | FastAPI (Python 3.14) |
| Task queue | Celery + Redis (long-running SBOM generation) |
| Broker/cache | Redis or Valkey (drop-in replacement) |
| Dev environment | Docker Compose (`docker compose up`) |

Python minimum: **3.14**. Use `python3.14` when running outside Docker.

---

## Repository layout

```text
lumina/
├── docker-compose.yml
├── frontend/                   Static web frontend (nginx + React 18)
│   ├── Dockerfile              nginx image; copies nginx.conf + static files
│   ├── nginx.conf              Serves frontend, proxies /api/ to FastAPI
│   ├── index.html              App entry + router
│   ├── colors-and-type.css     Design tokens (import this; do not redefine tokens)
│   ├── assets/                 Logo SVGs
│   ├── data.js                 Fixture SBOM + field-level conformance logic
│   ├── conformance.py ← PORT   data.js logic → LuminaInternalChecker
│   └── *.jsx / *.js            Screens and components
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             FastAPI endpoints
│       ├── conformance.py      ConformanceEngine, CHECKER_MAP, schemas
│       └── worker.py           Celery tasks (SBOM generation)
└── docs/
    └── design.md               Architecture and design decisions
```

---

## Conformance checking -- critical rules

`ntia-conformance-checker` currently handles **NTIA Minimum Elements only**.
BSI TR-03183, G7 AI SBOM, and MOF use `LuminaInternalChecker` as a fallback.

**CHECKER_MAP** in `backend/app/conformance.py` is the single place to update
when the external checker adds support for a new regulation. No other file
needs changing -- the `ConformanceResult` schema the API returns is identical
regardless of which checker produced it.

Do not change `ConformanceResult` or `FieldGap` fields without updating both
the Pydantic models in `conformance.py` and the fixture schema in
`ui-kits/lumina-app/data.js` (the JS prototype consumes the same shape).

When implementing `LuminaInternalChecker` for BSI / G7 AI / MOF, port the
field definitions and `regSummary()` logic from `frontend/data.js`.
That file is the authoritative field list for all four regulations.

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
- The frontend in `frontend/` is the visual source of truth.
  When implementing production screens, match it pixel-for-pixel before
  deviating.

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
- CORS: tighten `allow_origins` from `"*"` before any public deployment.
- Validate SBOM files through `spdx-tools` before passing to any checker.
