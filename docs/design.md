---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina design

Lumina is a web-based software bill of materials (SBOM) viewer and conformance
checker. It shows information from the SBOM itself together with a conformance
verdict for a chosen regulation.

Backend processing uses the SPDX Python toolchain:

- **Conformance checking** — [`ntia-conformance-checker`][ncc], with a Lumina
  internal fallback for regulations the checker does not yet cover (see
  [Checker routing](#checker-routing)).
- **SBOM generation** — [Pitloom][pitloom], for the artefact-URL input mode (see
  [Mode 1](#mode-1--artefact-url-sbom-generation)). Pitloom emits **SPDX 3
  JSON-LD** and is the single generator for both source kinds:
  - **Git repository URLs** — Lumina shallow-clones the repo, then runs Pitloom
    on the local checkout (`generate_sbom`).
  - **Hugging Face Hub URLs** — Pitloom reads HF metadata directly
    (`generate_huggingface_sbom`); no model download.

  Generation runs as a [background job](#background-job-execution).

The backend normalises every result to a single `SbomCheckResponse` envelope and
passes it to the web UI.

[ncc]: https://github.com/spdx/ntia-conformance-checker
[pitloom]: https://github.com/bact/pitloom

## Conformance checking architecture

The UI knows six regulations: NTIA Minimum Elements, BSI TR-03183,
G7 AI SBOM Minimum Elements, CISA 2026, FSCT 2024 and MOF (Model Openness
Framework); the checker supports all but MOF.

**Current checker support:**
`ntia-conformance-checker` covers **NTIA Minimum Elements** and, partially,
**G7 AI SBOM**, **CISA 2026 Minimum Elements** (both SPDX 3 only; rules the checker does not check are reported as
out of scope) and **FSCT 2024** (the CISA Framing document, the checker's `fsct3`). **BSI TR-03183** reports a verdict only. **MOF** is not
implemented in the checker.

**Design principle:** the backend must present a single, uniform
`ConformanceResult` schema to the API regardless of which checker
produced it. This lets the frontend consume results identically, and
lets us swap in new checker support the moment it becomes available
without touching the API contract or the UI.

### Response schema (canonical shape)

These are Pydantic models in
[`backend/app/conformance.py`](../backend/app/conformance.py) (the source of
truth); the annotated shape below is the wire contract.

The API envelope is `SbomCheckResponse`. It bundles the conformance
verdict, run-level metadata, and (optionally) the source SBOM carried
inside the SARIF log.

```text
SbomCheckResponse
  conformance   : ConformanceResult
  run           : CheckRun
  embedded_sbom : EmbeddedSbom?       # populated only on SARIF-import path
                                      # when the producer chose to embed

ConformanceResult                     # what was found
  regulation_id : str                 # "ntia" | "bsi" | "g7ai" | "cisa2026"
                                      # | "fsct2024" | "mof"
  source        : str                 # "ntia-conformance-checker"
                                      # | "lumina-internal" | "external-sarif"
  total         : int
  present       : int
  missing       : int
  unverified    : int
  gaps          : list[FieldGap]
  rules         : list[RuleResult]    # per-rule outcome, when the producer
                                      # reports it (G7 AI, NTIA)
  system_judged_by_model : str?       # model name standing in for the system

RuleResult
  rule_id       : str                 # "BOM-G7AI2026-MDL-006.1"
  cluster       : str                 # rule-id segment: "MD" | "SLP" | "MDL" ...
  title         : str                 # the element checked, from the rule slug
  provision     : str                 # "requirement" | "recommendation"
  outcome       : str                 # "present" | "missing"
                                      # | "not-applicable" | "out-of-scope"

FieldGap
  component_id  : str
  field_key     : str                 # e.g. "supplier", "ai.modelArchitecture"
  level         : "missing" | "unverified"
  note          : str

CheckRun                              # how the run went
  tool_name             : str
  tool_version          : str
  execution_successful  : bool
  notifications         : list[Notification]

Notification                          # parse error / validation warning / etc.
  level          : "error" | "warning" | "note"
  message        : str
  descriptor_id  : str                # e.g. "spdx.parsing-error",
                                      # "spdx.validation-message",
                                      # "pitloom.fetch-failed"

EmbeddedSbom                          # SARIF artifact.contents (§3.24.7)
  uri            : str                # basename / artifact URI
  mime_type      : str                # see "MIME types" below
  text           : str?               # set for textual SBOMs (most cases)
  binary_base64  : str?               # set when the artifact is not UTF-8
```

`run`, `conformance`, and `embedded_sbom` live on the envelope so the
frontend can render all three concerns from a single backend
round-trip.  The fields map 1:1 to SARIF concepts (see "SARIF exchange
format" below) so an OSCAL exporter or a different SARIF producer can
be slotted in without changing the response shape.

### Checker routing

Lumina does no conformance checking itself. `run_checker` in
[`backend/app/conformance.py`](../backend/app/conformance.py) (the source of
truth) runs `ntia-conformance-checker` for a regulation, using the standard id
in `CHECKER_STANDARDS`, and parses its SARIF into `ConformanceResult` with
`parse_sarif`. The SPDX version (2 or 3) is detected from the file.

- `ntia`, `g7ai` (partial), `cisa2026` (partial), `fsct2024` (partial) and `bsi` (verdict only) are
  supported.
- G7 AI results carry every rule's outcome. `out-of-scope` rules are
  catalogue-only (the checker cannot check them) and are shown as "not
  checked", never as missing. When the SBOM has no AI system of its own, the
  checker judges the system-level rules by its one AI model and the result
  names it in `system_judged_by_model`.
- The *Generate & check* screen lets the user pick NTIA, G7 AI, CISA 2026
  or FSCT 2024 (not BSI: verdict only) and shows each rule's outcome grouped by cluster. The static viewer screens (Overview,
  Inventory, Conformance) still show prototype data; `frontend/data.js` keeps
  its `g7ai` entry `active: false` until they are fed from results.
- `mof` is not supported by the checker; the API returns 501 for it.

When the checker adds a regulation, add it to `CHECKER_STANDARDS` — the API
response shape, the UI, and all downstream code stay unchanged.

Beyond the current regulations, EU CRA, EO 14028, FDA PMP, and
ISO/IEC 5230 are on the roadmap. Their ids are reserved in
`plannedRegulations` in `data.js`; the UI renders only supported regulations,
and promotion follows the steps in `AGENTS.md` ("Adding a regulation").

## Input modes

Lumina accepts three input modes.  All three converge on the **same**
SARIF parser (`sarif_ingest.parse_sarif`) and the same response envelope
(`SbomCheckResponse`), so adding a new input mode is a question of
filling in the upstream half only -- the conformance pipeline never
forks.

```text
   Mode 1                    Mode 2                    Mode 3
   ──────                    ──────                    ──────
   Artefact URL              SBOM upload               SARIF upload
   (Git repo / HF Hub)       / SBOM URL                / SARIF URL
        │                          │                         │
        ▼  (background job)        │                         │
  ┌──────────────┐                 │                         │
  │ Pitloom      │                 │                         │
  │ (SPDX 3):    │                 │                         │
  │  clone→gen   │ ────────────┐   │                         │
  │  HF metadata │             │   │                         │
  └──────────────┘             │   │                         │
                               ▼   ▼                         │
                         ┌──────────────────┐                │
                         │ ntia-conformance │                │
                         │     -checker     │                │
                         │ output_sarif(    │                │
                         │   embed_sbom=    │                │
                         │   False)         │                │
                         └────────┬─────────┘                │
                                  │ SARIF                    │
                                  ▼                          ▼
                           ┌────────────────────────────────────┐
                           │   parse_sarif(sarif)               │
                           │   → SbomCheckResponse(             │
                           │       conformance, run,            │
                           │       embedded_sbom?               │
                           │     )                              │
                           └────────────────────────────────────┘
```

> **Implementation status (Stage 0).** The backend Mode-1 path
> (`/api/v1/artifact/check` → background job → `SbomCheckResponse`) is wired and
> API-testable. On the frontend, **only the Import screen** calls the real API:
> it submits the job, polls, and renders a *self-contained* result panel
> (conformance counts, gaps, notifications). The rest of the UI — the Overview,
> Inventory, Graph, and Conformance **viewer** screens — still renders from the
> static `frontend/data.js` prototype data and is **not yet connected to real
> backend results**. Mapping `SbomCheckResponse` (and the generated SBOM) into
> those screens' data model is **to be done**.

### Mode 1 — Artefact URL (SBOM generation)

- **Endpoint:** `POST /api/v1/artifact/check`
- **Body:** `{ "artifact_url": "...", "regulation_id": "ntia" }`
- **Flow:** the URL is dispatched by kind to a Pitloom-backed generator, which
  writes an **SPDX 3 JSON-LD** file; Lumina then feeds that temp file through the
  same `run_checker` as mode 2 (which detects the SPDX version, exactly as for an
  uploaded SBOM). Because generation can take minutes (large
  clones), it runs as a [background job](#background-job-execution): the endpoint
  returns a `job_id` immediately and the client polls `GET /api/v1/jobs/{job_id}`.
- **`embedded_sbom`:** absent.  Lumina holds the SBOM Pitloom just produced; no
  need to round-trip via SARIF.
- **Generators (one interface, dispatched by URL kind; both Pitloom):**
  - **Git repository URLs** — a **shallow clone** (`git clone --depth 1`) into a
    temp work directory, then Pitloom's `generate_project_sbom(dir,
    output_path=..., pitloom_config=PitloomConfig())` on the checkout, then the
    temp directory is removed. The checkout is untrusted, so an empty explicit
    config replaces its own `[tool.pitloom]`: a repository cannot name host
    paths (fragments, ID registry) or switch features on. Pitloom itself never
    runs the project's build backend unless the caller asks.
    Bounded by a clone timeout and cleaned up in a `finally`. Covers GitHub and
    any Git host; Pitloom reads the project's Python packaging metadata.
  - **Hugging Face Hub URLs** — Pitloom's `generate_model_sbom(url)`
    (needs the `pitloom[huggingface_hub]` extra). Reads HF metadata via the HF API; it does **not**
    download model files, so the host stays light on disk and bandwidth. HF
    auth is optional (lower quota without a token, acceptable for now).
- **Sync model:** asynchronous via the job queue (see
  [Background job execution](#background-job-execution)). Stage 0/1 runs the
  job in-process; Stage 2 can move it to a worker without changing this
  contract.
- **Failure surfacing:** errors land in `CheckRun.notifications` with a
  source-specific `descriptor_id` — `git.clone-failed`, `git.timeout` for the
  clone step; `pitloom.generation-failed`, `pitloom.url-unsupported` for
  generation.  `execution_successful` flips to `false` for fatal generator
  errors; the conformance fields stay zeroed.

### Mode 2 — SBOM upload or SBOM URL

- **Endpoint:** `POST /api/v1/sbom/check`
- **Body:** multipart file (an SBOM URL is not supported yet)
- **Flow:** Lumina holds the SBOM (either the upload payload or a fetch
  of the URL) and passes the temp-file path to `run_checker`,
  which runs the checker, calls `output_sarif(embed_sbom=False)` and feeds the
  SARIF log through `parse_sarif`.
- **`embedded_sbom`:** absent.  Lumina already has the SBOM the user
  just supplied; embedding would double in-memory size for no benefit.
- **Sync model:** synchronous for now.  May move behind the same queue
  as mode 1 once we measure typical SBOM-parse latency on large inputs.

### Mode 3 — SARIF upload or SARIF URL

- **Endpoint:** `POST /api/v1/sarif/import`
- **Body:** SARIF 2.1.0 JSON body (a SARIF URL is not supported yet)
- **Flow:** SARIF goes straight into `parse_sarif`.  No checker call;
  the SARIF log already contains the verdict.
- **`embedded_sbom`:** **populated iff** the producer chose to embed.
  When present, the frontend can render the source SBOM alongside the
  findings without a separate fetch.  When absent, the frontend renders
  conformance results only and the SBOM section stays empty.
- **Sync model:** synchronous (parsing is cheap; no external calls).

## Background job execution

Only Mode 1 (SBOM generation) needs background execution — a Git clone plus
Pitloom generation can take 2–3 minutes, longer for big repositories. Modes 2 and
3 stay synchronous. The design goal is **start cheap, scale without a rewrite**: a
small `JobQueue` boundary stays fixed while the backend behind it is swappable.

### The boundary

The API talks to one interface and nothing else:

```text
JobQueue.enqueue(job_name, **kwargs) -> job_id
JobQueue.get(job_id)                 -> JobRecord(status, result?, error?)
```

Everything above and below this line is **invariant across scaling stages** — the
HTTP contract (`POST /artifact/check` → `job_id`, `GET /jobs/{job_id}`), the
frontend (submit + poll), the job function itself
(`generate_and_check(artifact_url, regulation_id) -> SbomCheckResponse`), the
generators, and the conformance pipeline. Only the `JobQueue` *backend* changes.

**Discipline that keeps the swap free:** job functions are written as if they
already run in a separate worker — a top-level named function, JSON-serialisable
arguments (a URL string, a regulation id), a JSON-serialisable result. They never
close over live in-process objects. Today the function runs in a thread; a future
worker runs the identical function untouched.

### Staged backends

| Stage | Backend | Extra services | Notes |
| :---- | :------ | :------------- | :---- |
| **0–1 (now)** | `InProcessJobQueue` | none | `asyncio` task + in-memory `dict`; blocking `git clone` + Pitloom offloaded with `asyncio.to_thread`; `Semaphore(1)` caps concurrency. **Jobs are lost on restart — accepted.** Stage 1 = bump the semaphore + add a container memory limit; no code change. |
| **2 (on load growth)** | `RQ` *or* `Taskiq` | a worker process + Redis | Flip `JOB_BACKEND`, add a `worker` service to compose, point at Redis. Endpoints, jobs, generators, frontend untouched. |

Because Stage 0 ships behind the interface, the broker choice is **deferred to the
moment a worker is actually needed**. (We deliberately do **not** target `arq`,
which is in maintenance-only mode as of 2026.)

### Stage 2 options — RQ vs Taskiq

Both implement the same `JobQueue` interface; the decision is deferred. The job
workload is I/O-bound (a `git clone` subprocess + Pitloom file/network I/O), so a
sync worker is no disadvantage.

| | **RQ** | **Taskiq** |
| :-- | :----- | :--------- |
| Model | sync, fork-per-job | async, FastAPI-native |
| Broker | Redis only | broker-agnostic (Redis, NATS, …) |
| Crash/OOM isolation | **strong** — each job in a forked child; memory reclaimed per job | per-task, in the worker process |
| Idle chatter (metered Redis) | higher — heartbeats + job/worker registries | leaner — single async connection |
| Best paired with | a **local `redis:alpine` container** (always-on, unmetered, $0 on the same box) | **Upstash** serverless Redis (free tier 500K cmd/month) *or* a local container |
| Pick it when | you want the simplest, most durable, self-contained worker | you want async + serverless Redis, or broker flexibility |

Guidance:

- **Single box (likely):** a local Redis container is $0 and unmetered — simplest
  and cheapest. RQ's fork-per-job isolation cleanly reclaims disk/memory after
  each large-clone job.
- **Serverless / split hosting, or you specifically want Upstash:** prefer
  **Taskiq** — its leaner connection burns fewer of Upstash's metered commands,
  and the broker abstraction is a second hedge. Tune the listener block interval
  long (30–60 s) to keep idle command rate well under the free monthly budget.

### Resource safety (any stage)

- Concurrency cap (semaphore at Stage 0; worker count at Stage 2).
- Timeout on the `git clone` subprocess (600 s; Pitloom generation itself has no
  timeout yet); temp work-dir
  removed in a `finally`.
- Container memory limit so a runaway job is contained, not the whole host.
- Optional: refuse clones above a size threshold.

### SARIF exchange format

The wire format between ntia-conformance-checker, Pitloom-mediated
calls, third-party producers, and Lumina is **SARIF 2.1.0**.  Rule ids
follow `BOM-[SPEC][YEAR]-[CATEGORY]-[NNN]` (the SBOM requirements ontology),
where `SPEC` and `YEAR` name the standard and edition (e.g. `NTIA2021`,
`CISA2026`). No other form is read, and a standard or edition Lumina does not
support is refused, not mapped to another.  The lowercased rule id is OSCAL-control-id-shaped so a future
OSCAL exporter on either side can reuse them as `control` / `group`
ids without remapping.

`output_sarif(embed_sbom=...)` controls whether the producer attaches
the source SBOM in `artifacts[0].contents` (SARIF §3.24.7).  Default is
off (link-by-URI).  Lumina turns it off for modes 1 and 2 (it has the
SBOM already) and consumes it when present on mode 3.

### MIME types for embedded SBOMs

When `embedded_sbom.mime_type` is populated, it comes from
ntia-conformance-checker's MIME picker, which is registry-aware:

| Format                   | MIME type                           | IANA status               |
| ------------------------ | ----------------------------------- | ------------------------- |
| SPDX 2 JSON              | `application/spdx+json`             | registered                |
| SPDX 3 JSON-LD           | `application/ld+json`               | registered (generic)      |
| SPDX 2 RDF/XML           | `application/rdf+xml`               | registered                |
| SPDX 2 XML (non-RDF)     | `application/xml`                   | generic                   |
| YAML                     | `application/yaml`                  | registered (generic)      |
| SPDX 2 tag-value (.spdx) | `text/plain`                        | generic                   |
| unknown                  | `application/octet-stream`          | generic                   |

`application/spdx3+json` has been submitted to IANA but is not yet
approved, so we fall back to `application/ld+json` for SPDX 3 until
that registration lands.

## Infrastructure

At Stage 0–1 the stack is **FastAPI + nginx** with no separate worker and no
Redis — SBOM generation runs in-process (see
[Background job execution](#background-job-execution)).  This fits inside the
smallest free or cheap hosts.  Three deployment options are supported, each with
its own Docker configuration under `docker/`:

| Option | Platform | Docker config | Shape |
| :----- | :------- | :------------ | :---- |
| **A** | VM with Docker Compose — OCI Always Free + Cloudflare Tunnel | [`docker/compose/`](../docker/compose/) | Two containers: nginx + api, via `docker compose` |
| **B** | Hugging Face Spaces (free CPU Basic tier) | [`docker/hfspaces/`](../docker/hfspaces/) | Single container: nginx + uvicorn via supervisord; git-clones Lumina at build time |
| **C** | Google Cloud Run (free tier, scale-to-zero) | [`docker/standalone/`](../docker/standalone/) | Single container: nginx + uvicorn via supervisord; built from local source |

Options B and C use a single-container image because those platforms run one
container per deployment.  The `docker/standalone/` image reads the `PORT` env
var (injected by Cloud Run as `8080`; defaults to `7860` for HF Spaces and
local testing) and writes the nginx server block at start time via `start.sh`.

At Stage 2 a `worker` service and a Redis (a local `redis:alpine` container, or
Upstash serverless Redis) are added when load justifies them.  The worker rides
on the same host (Option A) or as a separate Cloud Run job / HF Space (B/C);
the `JobQueue` interface means only the backend implementation changes.

- **Local development:** see the [README](../README.md#quick-start-with-docker).
- **Deployment step-by-step:** see [INSTALL.md](../INSTALL.md).
