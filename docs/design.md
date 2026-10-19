---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina design

Lumina is a web-based software bill of materials (SBOM) conformance checker.
For a chosen regulation it shows, rule by rule, whether the SBOM has the
property each rule asks for. "Present" means the property exists, not that its
value is right. The web UI shows only what the API returns; it has no sample
or fixture data.

Backend processing uses the SPDX Python toolchain:

- **Conformance checking** — [`ntia-conformance-checker`][ncc] runs every
  check; Lumina does no checking of its own (see
  [Checker routing](#checker-routing)).
- **SBOM generation** — [Pitloom][pitloom], for the artefact-URL input mode (see
  [Mode 1](#mode-1--artefact-url-sbom-generation)). Pitloom emits **SPDX 3
  JSON-LD** and is the single generator for both source kinds:
  - **Git repository URLs** — Lumina shallow-clones the repo, then runs Pitloom
    on the local checkout (`generate_project_sbom`).
  - **Hugging Face Hub URLs** — Pitloom reads HF metadata directly
    (`generate_model_sbom`); no model download.

  Generation runs as a [background job](#background-job-execution).

The backend normalises every result to a single `SbomCheckResponse` envelope and
passes it to the web UI.

[ncc]: https://github.com/bact/ntia-conformance-checker
[pitloom]: https://github.com/bact/pitloom

## Web UI

Static React pages in `frontend/` (see [`frontend/readme.md`](../frontend/readme.md)),
one per input mode plus About:

| Screen | Input mode | Endpoint |
| :----- | :--------- | :------- |
| *Generate & check* (default) | [Mode 1](#mode-1--artefact-url-sbom-generation) | `POST /api/v1/artifact/check`, then `GET /api/v1/jobs/{job_id}` |
| *Upload SBOM* | [Mode 2](#mode-2--sbom-upload) | `POST /api/v1/sbom/check` |
| *Import SARIF* | [Mode 3](#mode-3--sarif-import) | `POST /api/v1/sarif/import` |
| *About* | — | `GET /api/v1/regulations` |

The regulation picker lists exactly what `GET /api/v1/regulations` returns; a
regulation with `ready: false` is shown but cannot be picked. One result view
renders every `SbomCheckResponse`; it shows no counts when the SBOM could not
be checked or when no rule applies (`sbom.nothing-applies`). A refused request shows the server's `detail`.

## Conformance checking architecture

The API knows six regulation ids (`RegulationId` in
[`backend/app/conformance.py`](../backend/app/conformance.py)): `ntia` (NTIA
Minimum Elements), `bsi` (BSI TR-03183-2), `g7ai` (G7 SBOM for AI Minimum
Elements), `cisa2026` (CISA 2026 Minimum Elements), `fsct2024` (FSCT 2024, the
CISA Framing document) and `mof` (Model Openness Framework). The checker
supports all but MOF.

**Current checker support:**
`ntia-conformance-checker` covers **NTIA Minimum Elements** and, partially,
**G7 AI SBOM**, **CISA 2026 Minimum Elements** and **BSI TR-03183-2 v2.1** (all
SPDX 3 only; rules the checker does not check, such as elements SPDX 3.0.1
cannot show, are reported as out of scope) and **FSCT 2024** (the checker's
`fsct3`). **MOF** is not
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
result, run-level metadata, and (optionally) the source SBOM carried
inside the SARIF log.

```text
SbomCheckResponse
  conformance   : ConformanceResult
  run           : CheckRun
  embedded_sbom : EmbeddedSbom?       # populated only on SARIF-import path
                                      # when the producer chose to embed
  sbom          : SbomSource?         # the SBOM checked (upload or generated),
                                      # or an embedded SBOM whose text is JSON

ConformanceResult                     # what was found
  regulation_id : str                 # "ntia" | "bsi" | "g7ai" | "cisa2026"
                                      # | "fsct2024" | "mof"
  source        : str                 # "ntia-conformance-checker"
                                      # | "lumina-internal" | "external-sarif"
  total         : int                 # decided rules (see "Counts" below)
  present       : int
  missing       : int
  unverified    : int                 # always 0 today
  gaps          : list[FieldGap]
  rules         : list[RuleResult]    # per-rule outcome, when the SARIF log
                                      # has ruleOutcomes (the checker's do)
  system_judged_by_model : str?       # model name standing in for the system

RuleResult
  rule_id       : str                 # "BOM-G7AI2026-MDL-006.1"
  cluster       : str                 # rule-id segment: "MD" | "SLP" | "MDL" ...
  title         : str                 # the element checked
  provision     : str                 # "requirement" | "recommendation"
  outcome       : str                 # "present" | "missing"
                                      # | "not-applicable" | "out-of-scope"
  evidence      : list[Evidence]      # at most 20; SPDX 3 JSON checks only
  evidence_more : int                 # entries left out of evidence
  applies_to    : str                 # kind of element judged: "system" |
                                      # "ai_model" | "dataset" | "component" | ""
  combine       : str                 # "" (every judged element must have it)
                                      # | "any-of" | "all-of" | "self-only"

Evidence                              # where the SBOM shows the outcome
  status        : "found" | "absent"
  element_id    : str                 # spdxId, or @id ("_:CreationInfo0")
  element_type  : str                 # "ai_AIPackage" | "CreationInfo" ...
  element_name  : str?
  line, end_line: int                 # 1-based, inclusive, in sbom.display
  items         : list[EvidenceItem]  # empty for "absent"

EvidenceItem
  key           : str                 # property or relationship type
  value         : str                 # one-line preview, <= 160 characters
  line          : int                 # line of the key (of the entry, for a
                                      # list value) in sbom.display

SbomSource
  filename      : str                 # upload name; "<repo or model>.spdx3.json"
  format        : "spdx3-json" | "spdx2-json" | "other"
  text          : str                 # original bytes as UTF-8 (download)
  display       : str                 # pretty JSON (indent 2) for a JSON
                                      # object, else text
  line_count    : int                 # "\n"-separated lines of display

FieldGap
  component_id  : str
  field_key     : str                 # e.g. "supplier", "ai.modelArchitecture"
  level         : "missing" | "unverified"
  note          : str

CheckRun                              # how the run went
  tool_name             : str
  tool_version          : str
  generator             : str         # "pitloom <version>" for a generated
                                      # SBOM; empty otherwise
  execution_successful  : bool
  notifications         : list[Notification]

Notification                          # parse error / validation warning / etc.
  level          : "error" | "warning" | "note"
  message        : str
  descriptor_id  : str                # see "Notifications" below

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

**Counts.** With `run.properties.ruleOutcomes` in the log, every decided rule
counts — present or missing — sub-rules included (a sub-rule can be decided
differently from its parent, so neither stands for the other); not-applicable
and out-of-scope rules never count. A log without `ruleOutcomes` says only
what is missing: `missing` is the number of distinct failing rule ids, `total`
and `present` stay 0, and a `sarif.no-rule-outcomes` warning says so. When the
checker could not read the SBOM (`executionSuccessful: false`) every count is 0
and no gap is reported.

**Notifications.** `descriptor_id` names the class of event:

| Id | From | Meaning |
| :- | :--- | :------ |
| `spdx.parsing-error`, `spdx.validation-message`, `spdx.floating-component`, `spdx.unknown-pointer` | checker | The SBOM could not be read, failed validation, or has elements not connected to its root or pointers to missing elements |
| `sbom.nothing-applies` | checker | No rule of the regulation applies to this SBOM |
| `sarif.no-rule-outcomes` | Lumina | The log has no `ruleOutcomes`; only missing rules are counted |
| `pitloom.log` | Lumina, Mode 1 | A WARNING-or-above record Pitloom logged while generating |
| `pitloom.generation-failed`, `pitloom.url-unsupported` | Lumina, Mode 1 | Pitloom failed, or the URL has no host |
| `git.clone-failed`, `git.timeout` | Lumina, Mode 1 | The shallow clone failed or exceeded 600 s |
| `lumina.url-too-long`, `lumina.url-invalid`, `lumina.url-scheme-blocked`, `lumina.url-unresolvable`, `lumina.url-private-address` | Lumina, Mode 1 | The URL guard refused the URL: over 2048 characters, unparsable, not http/https, unresolvable, or resolving to a non-public address |

### SBOM source and rule evidence

`sbom` lets the UI offer the checked SBOM for download (`text`, as received or
as generated) and show it with line numbers (`display`). Every line number in
the response refers to `display`: an SBOM that is a JSON object is
pretty-printed there (`json.dumps(indent=2, ensure_ascii=False)`, key order
kept), anything else is shown as it is. Mode 3 sets `sbom` from an embedded
SBOM whose text is JSON, without evidence.

`evidence` says, for a rule the checker decided on an SPDX 3 JSON SBOM, which
`@graph` elements it judged and what on them it read
([`backend/app/evidence/`](../backend/app/evidence/__init__.py)):

- **absent** -- an element the checker reported as lacking what the rule asks
  for (the rule's findings); a document-level gap names the `CreationInfo`
  element, the SBOM element (SBOM type) or the `SpdxDocument`. Absent
  entries come first.
- **found** -- an element the rule judged that the checker did not report,
  with the properties, hashes, relationships or contacts that carry the rule
  and their lines. The UI labels these elements "Has it" and "Lacks it", not
  "Present" and "Missing", which are the rule's verdict: a rule that judges
  several elements (the root packages for a System-level rule) is Missing when
  any one lacks the property, so a Missing rule can list elements that have it
  (`applies_to` and `combine` let the UI say so in words). Found evidence shows *where* the property is, not that its
  value is right: the checker decides presence, and Lumina still does no
  checking of its own.

Which elements a rule judges and whether each passes come from the same
checker instance that produced the result (its per-rule results, the
`applies_when` probes and the adapter's components of each kind); the
properties to point at come from each rule's probe params in the checker's
spec. Only the two attribute probes (`supplier`, `timestamp` ...) name no
SPDX 3 property, so a small table in `evidence/carriers.py` mirrors how the
checker's SPDX 3 adapter reads each one; a rule whose carrier cannot be told
gets element evidence without items. Element lines come from the structure of
the parsed document (`app/sbom_source.py`), never from searching the text.

The pass runs after the check, over the same file, and never changes or fails
it: any error, or a pass over 5 s (an SBOM of many megabytes), logs one
warning and leaves every rule without evidence. An element written inline
inside another one, rather than as its own `@graph` object, is never
evidence.

### Generator log

A generated result also carries `generation_log`: what the generator side did,
in order, for a user who wants to see the working. Each line has a `source`
(`lumina`: a step Lumina took, including the real `git clone` command line;
`git`: its own output on success; `pitloom`: a record Pitloom logged at INFO or
above), a `level` (`info`, `warning`, `error`), the `message` and `elapsed_ms`
since the start. A failed generation keeps its log, ending with the error.
Nothing is added that the generator did not produce, so a quiet Pitloom run
shows few `pitloom` lines. The server's temporary directory is shown as
`<tmp>`. The log is bounded (1000 lines, 2000 characters a line; a closing line
says how many were left out). `null` for an uploaded SBOM or an imported SARIF
log. Code: [`backend/app/generation_log.py`](../backend/app/generation_log.py);
the UI shows it as the "Generator log" tab, in a monospace font.

### Checker routing

Lumina does no conformance checking itself. `run_checker` in
[`backend/app/conformance.py`](../backend/app/conformance.py) (the source of
truth) runs `ntia-conformance-checker` for a regulation, using the standard id
in `CHECKER_STANDARDS`, and parses its SARIF into `ConformanceResult` with
`parse_sarif`. The SPDX version (2 or 3) is detected from the file.

- `ntia`, `g7ai` (partial), `cisa2026` (partial), `fsct2024` (partial) and
  `bsi` (partial) are supported.
- Per-rule results carry every rule's outcome. `out-of-scope` rules are
  catalogue-only (the checker cannot check them) and are shown as "not
  checked", never as missing. When the SBOM's only root is one AI model, the G7 AI
  check judges the system-level rules by that model and the result names it in
  `system_judged_by_model`.
- BSI results are per rule, in clusters `DOC` (SBOM document) and `COMP`
  (components). A rule's `provision` is `requirement` or `permission`
  (optional). Lumina passes the provision through; `total`, `present` and
  `missing` count only the other rules, a permission is counted in
  `optional_present` / `optional_missing`, and its missing outcome is shown as
  "Not provided" and is not a gap.
- `mof` is not supported by the checker; the API returns 501 for it.

When the checker adds a regulation, add it to `RegulationId` and
`CHECKER_STANDARDS`, and its rule-id spec code to the maps in
`sarif_ingest.py`; the API response shape and the UI stay unchanged (the steps
are in `AGENTS.md`, "Adding a regulation").

Beyond the current regulations, EU CRA, EO 14028, FDA PMP, and
ISO/IEC 5230 are on the roadmap; none is in the API yet.

## Input modes

Lumina accepts three input modes.  All three converge on the **same**
SARIF parser (`sarif_ingest.parse_sarif`) and the same response envelope
(`SbomCheckResponse`), so adding a new input mode is a question of
filling in the upstream half only -- the conformance pipeline never
forks.

```text
   Mode 1                    Mode 2                    Mode 3
   ──────                    ──────                    ──────
   Artefact URL              SBOM upload               SARIF import
   (Git repo / HF Hub)                                 (JSON body)
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

### Mode 1 — Artefact URL (SBOM generation)

- **Endpoint:** `POST /api/v1/artifact/check`
- **Body:** `{ "artifact_url": "...", "regulation_id": "ntia" }`
- **Flow:** the URL is checked by the SSRF guard (http/https only, at most 2048
  characters, every resolved address public) and dispatched by host: a Hugging
  Face Hub host goes to Pitloom's model path, any other host is treated as a
  Git repository. Pitloom writes an **SPDX 3 JSON-LD** file; Lumina then feeds
  that temp file through the same `run_checker` as mode 2. Because generation
  can take minutes (large clones), it runs as a
  [background job](#background-job-execution): the endpoint returns a `job_id`
  immediately (202) and the client polls `GET /api/v1/jobs/{job_id}`. A
  regulation the checker does not support is refused with 501 before anything
  is queued.
- **`embedded_sbom`:** absent.  Lumina holds the SBOM Pitloom just produced; no
  need to round-trip via SARIF.
- **Generators (one interface, dispatched by URL kind; both Pitloom):**
  - **Git repository URLs** — a **shallow clone** (`git clone --depth 1`,
    blobs over 10 MB skipped, redirects not followed, no credential prompt)
    into a temp work directory, then Pitloom's `generate_project_sbom(dir,
    output_path=..., pitloom_config=PitloomConfig())` on the checkout, then the
    temp directory is removed. The checkout is untrusted, so an empty explicit
    config replaces its own `[tool.pitloom]`: a repository cannot name host
    paths (fragments, ID registry) or switch features on. Pitloom itself never
    runs the project's build backend unless the caller asks.
    Bounded by a 600 s clone timeout and cleaned up in a `finally`. Covers
    GitHub and any Git host; Pitloom reads the project's Python packaging
    metadata.
  - **Hugging Face Hub URLs** — Pitloom's `generate_model_sbom(url)`
    (needs the `pitloom[huggingface_hub]` extra). Reads HF metadata via the HF API; it does **not**
    download model files, so the host stays light on disk and bandwidth. HF
    auth is optional (lower quota without a token, acceptable for now).
  Both record Lumina as a tool, not a creator, in the SBOM's creation info.
- **Sync model:** asynchronous via the job queue (see
  [Background job execution](#background-job-execution)). Stage 0/1 runs the
  job in-process; Stage 2 can move it to a worker without changing this
  contract.
- **Generator output:** what Pitloom logs at WARNING or above while it
  generates is added as `pitloom.log` notifications, and `CheckRun.generator`
  names the Pitloom version.
- **Failure surfacing:** a refused URL or a failed clone or generation does not
  fail the job; it completes `done` with `execution_successful: false`, source
  `lumina-internal`, zeroed counts, and one `error` notification
  (`lumina.url-*`, `git.*` or `pitloom.*`, see "Notifications"). Only an
  unexpected exception marks the job `error`.

### Mode 2 — SBOM upload

- **Endpoint:** `POST /api/v1/sbom/check`
- **Body:** multipart `file` plus a `regulation` form field (default `ntia`).
  An SBOM URL is not supported.
- **Size cap:** `LUMINA_MAX_SBOM_BYTES`, default 10 MiB. A larger file, or a
  `Content-Length` above the cap plus 64 KiB for the multipart framing, is
  refused with 413. Every nginx config allows 11m per `/api/` request, 1 MiB
  above the default cap, so nginx stops a far larger upload first.
- **Flow:** Lumina writes the upload to a temp file (deleted in a `finally`)
  and passes its path to `run_checker`, which runs the checker, calls
  `output_sarif(embed_sbom=False)` and feeds the SARIF log through
  `parse_sarif`. An SBOM the checker cannot process is refused with 422 (for
  example when its SPDX version cannot be determined); an unsupported
  regulation with 501.
- **`embedded_sbom`:** absent.  Lumina already has the SBOM the user
  just supplied; embedding would double in-memory size for no benefit.
- **Sync model:** synchronous for now (the check runs in a thread pool).  May
  move behind the same queue as mode 1 once we measure typical SBOM-parse
  latency on large inputs.

### Mode 3 — SARIF import

- **Endpoint:** `POST /api/v1/sarif/import`
- **Body:** SARIF 2.1.0 JSON body (a SARIF URL is not supported). A declared
  `Content-Length` above `LUMINA_MAX_SBOM_BYTES` is refused with 413.
- **Flow:** SARIF goes straight into `parse_sarif`.  No checker call;
  the SARIF log already contains the outcomes. Only the first run is read.
- **Refusals (422):** a body that is not a JSON object, a `version` other than
  `2.1.0`, no runs, a field of the wrong type, or a standard Lumina does not
  support. The standard comes from rule ids of the ontology form
  `BOM-[SPEC][YEAR]-[CATEGORY]-[NNN][.M]`, keyed by edition: `NTIA2021`,
  `BSI2025`, `G7AI2026`, `CISA2026`, `FSCT2024`. Every rule id the log names (its
  catalogue, results and outcomes) must be of one supported edition; another
  edition (for example `CISA2025`) or a mix of standards is refused, never read
  as another. A `run.properties.complianceStandard` hint must name a known
  checker standard and agree with every rule id.
- **Producer:** `ntia-conformance-checker` is recognised by name; any other
  producer's result has source `external-sarif`.
- **`embedded_sbom`:** **populated iff** the producer chose to embed. The API
  returns it; the web UI does not show it yet.
- **Sync model:** synchronous (parsing is cheap; no external calls).

## Background job execution

Only Mode 1 (SBOM generation) needs background execution — a Git clone plus
Pitloom generation can take minutes for a big repository. Modes 2 and
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
| **2 (on load growth)** | `RQ` *or* `Taskiq` | a worker process + Redis | Add a backend setting (none exists yet), a `worker` service in compose, and Redis. Endpoints, jobs, generators, frontend untouched. |

Because Stage 0 ships behind the interface, the broker choice is **deferred to the
moment a worker is actually needed**. (`arq` is deliberately not a target.)

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
| Best paired with | a **local `redis:alpine` container** (always-on, unmetered, $0 on the same box) | **Upstash** serverless Redis (metered free tier) *or* a local container |
| Pick it when | you want the simplest, most durable, self-contained worker | you want async + serverless Redis, or broker flexibility |

Guidance:

- **Single box (likely):** a local Redis container is $0 and unmetered — simplest
  and cheapest. RQ's fork-per-job isolation cleanly reclaims disk/memory after
  each large-clone job.
- **Serverless / split hosting, or you specifically want Upstash:** prefer
  **Taskiq** — its leaner connection burns fewer of Upstash's metered commands,
  and the broker abstraction is a second hedge. Tune the listener block interval
  long (30–60 s) to keep the idle command rate low.

### Resource safety (any stage)

- Concurrency cap (semaphore of 1 at Stage 0; worker count at Stage 2).
- Timeout on the `git clone` subprocess (600 s; Pitloom generation itself has no
  timeout yet); blobs over 10 MB are skipped; the temp work-dir is removed in a
  `finally`.
- At most 1000 finished job records are kept in memory; the oldest go first.
- Recommended, not set in the compose files: a container memory limit so a
  runaway job is contained, not the whole host (see INSTALL.md, "Hardening
  for public use").
- Not implemented: refusing clones above a size threshold.

### SARIF exchange format

The wire format between ntia-conformance-checker, third-party producers, and
Lumina is **SARIF 2.1.0**.  Rule ids follow
`BOM-[SPEC][YEAR]-[CATEGORY]-[NNN][.M]` (the SBOM requirements ontology),
where `SPEC` and `YEAR` name the standard and edition (e.g. `NTIA2021`,
`CISA2026`) and `.M` marks a sub-rule. No other form is read, and a standard or
edition Lumina does not support is refused, not mapped to another (see
[Mode 3](#mode-3--sarif-import)).  The lowercased rule id is OSCAL-control-id-shaped so a future
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
