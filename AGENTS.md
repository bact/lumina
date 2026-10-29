# Agent instructions

## What this project is

Lumina -- web-based SBOM (Software Bill of Materials) conformance checker.
Takes an SBOM (uploaded, or generated from a Git or Hugging Face URL) or a
SARIF log, and shows per rule of the chosen standard whether the SBOM has
the property the rule asks for.

Full design rationale: `working-docs/design.md`.
Frontend: `frontend/` (design tokens and assets live here too).

The UI shows only real data from the backend: no sample or invented data,
anywhere. A screen that has nothing to show from the API shows nothing.

---

## Stack

| Layer | Technology |
| - | - |
| Frontend | Static HTML/CSS/JS (React 18 + Babel in-browser, no build step) |
| API | FastAPI (Python 3.14) |
| Background jobs | In-process `asyncio` queue (`backend/app/jobs.py`); no broker. An RQ/Taskiq swap is planned: see `working-docs/design.md` |
| SBOM generation | Pitloom (Git repository URL or Hugging Face Hub URL; Pitloom resolves, fetches and reads it) |
| Dev environment | Docker Compose (`docker compose up` — auto-loads override.yml) |

Python minimum: **3.14**. Use `python3.14` when running outside Docker.

---

## Repository layout

```text
lumina/
├── docker-compose.yml          Base compose (nginx target: prod; api with --reload)
├── docker-compose.override.yml Dev overrides — auto-loaded; nginx target: dev,
│                               mounts frontend/ at /workspace/frontend
├── .dockerignore               Keeps caches/git/working-docs out of Docker build context
├── proxy/                      Reverse-proxy service (nginx)
│   ├── Dockerfile              Multi-stage: dev (config only) / prod (self-contained)
│   ├── prod.conf               Prod: root /app (frontend baked in)
│   └── dev.conf                Dev: root /workspace/frontend (bind mount)
├── frontend/                   Static frontend (see working-docs/frontend.md)
│   ├── index.html              Entry point + router
│   ├── colors-and-type.css     Design tokens
│   ├── assets/                 Logo SVGs
│   ├── examples/               Real SBOM and SARIF files the example cards load
│   ├── vendor/                 React, Babel, Lucide, highlight.js (no CDN; see vendor/README.md)
│   └── *.jsx / *.js            Shell, shared components, screens (example-list.jsx: the example cards)
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml          Tool settings (mypy)
│   ├── requirements.txt        Pinned deps; Pitloom by release, the checker by Git commit
│   ├── requirements-dev.txt    Test and lint tools
│   ├── app/
│   │   ├── main.py             FastAPI endpoints
│   │   ├── conformance.py      run_checker, CHECKER_STANDARDS, schemas
│   │   ├── sarif_ingest.py     SARIF 2.1.0 → SbomCheckResponse
│   │   ├── dependencies.py     Installed version (and Git commit) of each dependency, for the About screen
│   │   ├── generation_log.py   Generation log: Lumina steps and Pitloom records
│   │   ├── sbom_source.py      SbomSource (download + display text), @graph line index
│   │   ├── evidence/           Per-rule evidence: SBOM elements and lines behind each outcome
│   │   ├── jobs.py             JobQueue interface + in-process backend
│   │   ├── generate.py         SBOM generation job: artefact URL → SBOM → check (SSRF guard)
│   │   └── generators/         Pitloom-backed SBOM generators (git, hf)
│   └── tests/                  pytest suite + SBOM and SARIF fixtures
├── docker/                     Alternative deployment images (see INSTALL.md)
│   ├── compose/                Production compose override (VM deploy)
│   ├── hfspaces/               Hugging Face Spaces single-file Dockerfile
│   └── standalone/             Single-container image (Cloud Run)
├── scripts/                    OCI VM launch + cloud-init helpers; ui-smoke.mjs
├── .github/                    CI (backend tests, UI smoke test, Dockerfile lint) and Dependabot
├── .hadolint.yaml              Hadolint rules for the Dockerfile lint
├── working-docs/               Internal docs (see "Documentation" below)
│   ├── design.md               Architecture and design decisions
│   ├── demo.md                 Demo guide: set up, warm up, script, troubleshooting
│   ├── deployment-options.md   Free-hosting comparison
│   ├── frontend.md             Frontend notes: screens, examples, conventions
│   └── roadmap.md              What is done and what is next
├── INSTALL.md                  Free public-deployment guide (3 options)
└── README.md                   Overview and quick start
```

---

## Documentation

- User-facing docs are `README.md` and `INSTALL.md` only. They never link into
  `working-docs/`; name a PR or issue number instead.
- Development and other non-user-facing docs (design, demo guide, frontend
  notes, audits, plans) live in `working-docs/`. Their content can change
  without notice. Standalone docs there carry `Created` and `Last-Modified`
  dates (`YYYY-MM-DD`) in their front matter.
- Filenames are lowercase, hyphen-separated; a topic that outgrows three files
  gets a same-named subfolder with a "See also" pointer near the top.

---

## Conformance checking -- critical rules

Lumina does no conformance checking itself: `ntia-conformance-checker` runs
every check and `run_checker` in `backend/app/conformance.py` parses its SARIF.
NTIA, G7 AI SBOM, CISA 2026, FSCT 2024 and BSI come from the checker, all
with per-rule results. MOF is not supported (HTTP 501).

**CHECKER_STANDARDS** in `backend/app/conformance.py` maps a Lumina standard
id to the checker's own standard id; add a standard there once the checker
supports it.

Do not change the `SbomCheckResponse` models (`ConformanceResult`, `RuleResult`,
`Evidence`, `FieldGap`, `CheckRun`, `Notification`, `SbomSource` in
`conformance.py`; `LogLine` in `generation_log.py`) without updating
the frontend that reads them (`ArtifactResult` in `frontend/result-view.jsx`,
`RuleClusters` and `RuleEvidence` in `frontend/rule-evidence.jsx`,
`SbomSource` in `frontend/sbom-source.jsx`, `GeneratorLog` in
`frontend/generator-log.jsx`) and the mocked responses in
`scripts/ui-smoke.mjs`. The same goes for `DependencyList` in
`dependencies.py`, which `AboutScreen` in `frontend/screen-about.jsx` reads.

### Adding a standard

(A *standard* is a minimum elements standard: NTIA, BSI TR-03183-2, G7 SBOM for
AI, ... In code and the API it is `standard` / `standard_id`; the user-facing
text spells it out as "minimum elements standard". The checker has its own
standard ids; `CHECKER_STANDARDS` maps Lumina's to the checker's.)

The long-term goal is to cover EU CRA, EO 14028, FDA PMP, ISO/IEC 5230, and
more. The frontend lists exactly what `GET /api/v1/standards` returns, so a
standard appears in the UI only once the backend knows it. To add one:

1. Extend the `StandardId` Literal and `CHECKER_STANDARDS` in
   `backend/app/conformance.py`. `GET /api/v1/standards` then lists it with
   `ready: true`; an id in `StandardId` but not in `CHECKER_STANDARDS` is
   listed with `ready: false` and cannot be picked in the UI.
2. Add its edition-keyed spec code (the `SPEC` + `YEAR` segment of its rule
   ids, ontology form `BOM-[SPEC][YEAR]-...`) to `_SPEC_TO_STANDARD`, and the
   checker's standard id to `_CHECKER_TO_STANDARD`, in
   `backend/app/sarif_ingest.py`; both must name the exact edition.
3. In `frontend/screen-conformance.jsx`, give it a label, a one-line
   description of what the check covers and a source link in
   `STANDARD_INFO`, and name its rule clusters (the cluster segment of
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
- Icon set: Lucide, vendored in `frontend/vendor/` (1.5px stroke). Do not substitute other icon sets
  without updating the `Icon` component in `components.jsx`.
- Show only what the API returns. Labels, descriptions and links for
  standard ids live in one table (`STANDARD_INFO`); never hard-code a
  list of standards, rules or results.
- Show a failed request's `detail` text (`apiErrorMessage` in
  `screen-conformance.jsx`); never replace it with a generic message.
- Only the app shell and each screen's heading are translated (`i18n.js`); the
  rest of a screen is English. Offer a locale in the picker only when it has a
  catalogue with every key.

### UI smoke test

`scripts/ui-smoke.mjs` serves `frontend/`, mocks every `/api/` route, visits
every side-nav screen in headless Chromium and fails on a page or console
error, on an old sample-data string, when the standard chips differ from the
mocked `GET /api/v1/standards`, when a refused request's `detail` is not
shown, when the per-rule BSI result lacks its DOC and COMP clusters and counts,
when CISA 2026 is not preselected, when the SBOM download, rule values and
evidence, Show in SBOM, the Generator log tab or the windowed 50,000-line source
view break, when switching the standard does not re-check the same SBOM (and keep
the generator and its log), when a failed switch loses the earlier result, or when
a finished check or a chosen example is not announced, when the
"Nothing was checked" banner does not give its reason, or when the About screen
does not show each dependency's version (the short commit for one installed from
Git) or a failed request's detail. It needs Node 18+ and
a `node_modules` directory (outside the repository; never commit it) with
`playwright-core`. The page's scripts are vendored in `frontend/vendor/` (see
its README), so the test uses no network and fails on a request to any other
host except fonts:

```shell
npm install --prefix /some/dir playwright-core
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

**Always keep the UI accessible.** Every frontend change (a new screen, tab,
control, message or colour) must stay usable by keyboard alone and with a screen
reader, with appropriate labels, readable font sizes and sufficient colour
contrast. Treat a regression here like a failing test: fix it in the same
change. Target: WCAG 2.2 AA. Specifically:

**Keyboard**
- Every interactive element is a `<button>`, `<a href>` or form control, or has
  the right `role` with `tabIndex=0` and Enter/Space handlers. Nothing is
  reachable by mouse only; nothing traps focus.
- Composite widgets follow the WAI-ARIA pattern (tabs: arrow keys, Home/End,
  roving `tabIndex`; listbox: arrows, Esc closes and returns focus). Where
  choosing is expensive (the standard picker re-checks the SBOM), arrows move
  focus only and Enter/Space choose; say so in a screen-reader description.
- Keep the visible focus ring (`:focus-visible`); never remove an outline
  without a replacement. A scrollable region that holds text has `tabIndex=0`
  and a name, so the keyboard can scroll it.
- Moving content (a jump to a line, a tab switch) also moves focus to where the
  user lands.
- Choosing a screen moves focus to its `<main>` and sets a translated
  `document.title`; each screen has one `<h1>`, and a result has an `<h2>` per
  cluster and section.

**Screen readers and labels**
- Every control has an accessible name. When it has visible text, the name
  contains that text (WCAG 2.5.3, label in name): `aria-label="Show in SBOM:
  mock-pkg"`, not "Show mock-pkg in SBOM" for a visible "Show in SBOM".
- Inputs have a `<label>` (or `aria-label`); groups of related controls have
  `role="group"` with a name.
- ARIA references (`aria-controls`, `aria-labelledby`) point at elements that
  exist.
- Changes that happen without a page load are announced: a `role="status"` live
  region that is mounted before its text changes (a finished check, a copied
  log, an example that filled the form); errors use `role="alert"`.
- Decorative icons and dots: `aria-hidden="true"`. Landmarks and headings give
  each screen a sensible outline; `lang` is set on text in another language. Text that is not translated
  stays in a `lang="en"` wrapper under another locale.

**Text, colour and motion**
- Body text at least 12 px and in relative units where it can be; the page must
  work at 200% zoom and at 390 px width without sideways page scroll (code and
  log boxes scroll inside themselves).
- Contrast at least 4.5:1 for text (3:1 for large text and for UI borders and
  focus rings), in every state: hover, disabled, selected, highlighted. Use the
  tokens in `colors-and-type.css`; a new colour gets its ratio checked.
- No colour as the sole conveyor of state: pair it with text or a shape
  (INFO/WARNING/ERROR written out, a dot plus a label).
- Respect `prefers-reduced-motion`.
- Progress bars: `role="progressbar"` with `aria-valuemin/max/now`.

**Checking**: run `scripts/ui-smoke.mjs` (it asserts names, tabs and
announcements) and scan the changed screens with axe-core (WCAG 2 A/AA and
best-practice rules) in a browser; both must report nothing. Automated tools
find only part of the problems: for a new widget also try the keyboard flow by
hand, and a screen reader when one is at hand.

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
  `LUMINA_ALLOW_PRIVATE_URLS=1` only in development. A host that must resolve
  to a non-public address goes in `LUMINA_ALLOWED_PRIVATE_HOSTS` (exact
  hostnames, operator-set; never a request option, which would defeat the guard).
- A Git clone is stopped past `LUMINA_MAX_CLONE_BYTES` of disk (default
  512 MiB; `git.too-large`); Cloud Run's disk is memory, so raise it only with
  the instance's memory.
- Conformance comes from the checker alone: it reads the file (SPDX 2
  through `spdx-tools`, SPDX 3 through its own reader) and reports a file it
  cannot read as an `spdx.parsing-error` notification. Lumina only parses
  SPDX 3 JSON itself to show the source and the rule evidence (line numbers),
  never to decide a verdict. A file whose SPDX
  version cannot be determined is refused with HTTP 422.
