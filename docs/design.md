---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina design

Lumina is a web-based software bill of materials (SBOM) viewer.

It shows information from the SBOM itself, together with additional information
about conformance.

A lot of processing will be done in the backend by SPDX Python toolchain:

- SBOM generation is done by Pitloom
  <https://github.com/bact/pitloom>
- Conformance checking is done by NTIA Conformance Checker
  <https://github.com/spdx/ntia-conformance-checker>

Results will be passed to the web UI.

## Conformance checking architecture

The UI supports four regulations: NTIA Minimum Elements, BSI TR-03183,
G7 AI SBOM Minimum Elements, and MOF (Model Openness Framework).

**Current checker support:**
`ntia-conformance-checker` currently only covers **NTIA Minimum Elements**.
BSI TR-03183, G7 AI SBOM, and MOF are not yet implemented in the checker.

**Design principle:** the backend must present a single, uniform
`ConformanceResult` schema to the API regardless of which checker
produced it. This lets the frontend consume results identically, and
lets us swap in new checker support the moment it becomes available
without touching the API contract or the UI.

### Response schema (canonical shape)

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
  regulation_id : str                 # "ntia" | "bsi" | "g7ai" | "mof"
  source        : str                 # "ntia-conformance-checker"
                                      # | "lumina-internal" | "external-sarif"
  total         : int
  present       : int
  missing       : int
  unverified    : int
  gaps          : list[FieldGap]

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

A `ConformanceEngine` in the backend routes each regulation to the
appropriate checker implementation:

```python
checker_map = {
    "ntia":  NtiaCheckerAdapter,       # wraps ntia-conformance-checker
    "bsi":   LuminaInternalChecker,    # → NtiaCheckerAdapter once supported
    "g7ai":  LuminaInternalChecker,    # → NtiaCheckerAdapter once supported
    "mof":   LuminaInternalChecker,    # → NtiaCheckerAdapter once supported
}
```

`NtiaCheckerAdapter` wraps the `ntia-conformance-checker` library and
normalises its output into `ConformanceResult`.

`LuminaInternalChecker` replicates the field-level logic from the UI
prototype (`data.js`) in Python, as a fallback for regulations the
external checker does not yet handle.

When `ntia-conformance-checker` adds support for BSI, G7 AI SBOM, or
MOF, update `checker_map` to point those keys at `NtiaCheckerAdapter`.
The API response shape, the UI, and all downstream code remain unchanged.

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
   (HF Hub)                  / SBOM URL                / SARIF URL
        │                          │                         │
        ▼                          │                         │
  ┌──────────────┐                 │                         │
  │   Pitloom    │                 │                         │
  │  (SBOM gen)  │ ────────────┐   │                         │
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

### Mode 1 — Artefact URL (Pitloom-mediated)

* **Endpoint (planned):** `POST /api/v1/artifact/check`
* **Body:** `{ "artifact_url": "...", "regulation_id": "ntia" }`
* **Flow:** Lumina calls Pitloom with the artefact URL; Pitloom returns a
  generated SBOM; Lumina writes it to a temp file and feeds it through
  the same `NtiaCheckerAdapter` as mode 2.
* **`embedded_sbom`:** absent.  Lumina holds the SBOM Pitloom just
  returned; no need to round-trip via SARIF.
* **Scope (initial):**
  * **Hugging Face Hub URLs only.**  Pitloom reads HF metadata via the
    HF API -- it does **not** download model files, so the host stays
    light on disk and bandwidth.  HF auth is optional (lower quota
    without a token, acceptable for now).
  * **Git URLs are explicitly out of scope** in this phase.  A Git
    artefact requires `git clone` into a managed work directory,
    disk-space accounting, and lifecycle management of that directory.
    None of that infrastructure exists yet, so the endpoint will reject
    Git URLs until that work lands.
* **Sync model:** **async**.  Pitloom calls run as background tasks
  (FastAPI + Celery + Redis/Valkey, or equivalent).  The endpoint
  returns a job id; the client polls a status endpoint or subscribes via
  websocket / SSE.
* **Failure surfacing:** Pitloom errors land in
  `CheckRun.notifications` with `descriptor_id="pitloom.*"`
  (e.g. `pitloom.fetch-failed`, `pitloom.url-unsupported`,
  `pitloom.timeout`).  `execution_successful` flips to `false` for
  fatal Pitloom errors; the conformance fields stay zeroed.

### Mode 2 — SBOM upload or SBOM URL

* **Endpoint:** `POST /api/v1/sbom/check`
* **Body:** multipart file *or* `{ "sbom_url": "..." }`
* **Flow:** Lumina holds the SBOM (either the upload payload or a fetch
  of the URL) and passes the temp-file path to `NtiaCheckerAdapter`,
  which calls `output_sarif(embed_sbom=False)` and feeds the SARIF log
  through `parse_sarif`.
* **`embedded_sbom`:** absent.  Lumina already has the SBOM the user
  just supplied; embedding would double in-memory size for no benefit.
* **Sync model:** synchronous for now.  May move behind the same queue
  as mode 1 once we measure typical SBOM-parse latency on large inputs.

### Mode 3 — SARIF upload or SARIF URL

* **Endpoint:** `POST /api/v1/sarif/import`
* **Body:** SARIF 2.1.0 JSON body *or* `{ "sarif_url": "..." }`
* **Flow:** SARIF goes straight into `parse_sarif`.  No checker call;
  the SARIF log already contains the verdict.
* **`embedded_sbom`:** **populated iff** the producer chose to embed.
  When present, the frontend can render the source SBOM alongside the
  findings without a separate fetch.  When absent, the frontend renders
  conformance results only and the SBOM section stays empty.
* **Sync model:** synchronous (parsing is cheap; no external calls).

### SARIF exchange format

The wire format between ntia-conformance-checker, Pitloom-mediated
calls, third-party producers, and Lumina is **SARIF 2.1.0**.  Rule ids
follow `SBOM-[SPEC]-[CATEGORY]-[NNN]` (see ntia-conformance-checker's
`RULES.md`), where `SPEC` is the spec id uppercased (e.g. `NTIA`,
`FSCT3`).  The lowercased rule id is OSCAL-control-id-shaped so a future
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

## Infrastructure notes

We may try FastAPI + Celery + Redis (or Valkey) for the async queue
that mode 1 needs.  Docker is required for local development.
For public deployment, Railway is the initial target for simplicity.
