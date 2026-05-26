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

### ConformanceResult schema (canonical shape)

```text
ConformanceResult
  regulation_id : str           # "ntia" | "bsi" | "g7ai" | "mof"
  source        : str           # "ntia-conformance-checker" | "lumina-internal"
  total         : int
  present       : int
  missing       : int
  unverified    : int
  gaps          : list[FieldGap]

FieldGap
  component_id  : str
  field_key     : str           # e.g. "supplier", "ai.modelArchitecture"
  level         : "missing" | "unverified"
  note          : str
```

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

## Input

Currently Lumina takes two types of input:

1) SBOM file (upload)
2) URL

The URL can be:

a. Any link to a publicly-accessible SBOM
b. Any link to a publicly-accessible AI model on Hugging Face Hub (no gate)
c. Any link to a publicly-accessible Git repository (a Python project)

For (b) and (c), an SBOM will be generated, using Pitloom.

In the initial stage, we will implement only (a) for simplicity.
Then we will gradually implement (b) and (c)
(c) can takes long time (can be longer than ten minutes), so need a task queue
and worker architecture, like Celery.

We may try FastAPI + Celery + Redis (or Valkey) to see if it is sufficient.
A Docker is required for local development.
For deployment on public web, we may use Railway for simplicity initially.
