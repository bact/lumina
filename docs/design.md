---
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

## Input

Currently Lumina takes two types of input:

1) SBOM file (upload)
2) URL

The URL can be:

a. Any link to a publicly-accessible SBOM
b. Any link to a publicly-accessible AI model on Hugging Face Hub (no gate)
c. Any link to a publicly-accessible Git repository (a Python project)

For (b) and (c), an SBOM will be generated, using Pitloom.
