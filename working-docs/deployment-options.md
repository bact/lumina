---
Created: 2026-10-20
Last-Modified: 2026-10-20
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Deployment options: which one to pick

See also: [design.md](design.md#infrastructure) (architecture, single-container
images), [INSTALL.md](../INSTALL.md) (the concrete steps for each option).

[INSTALL.md](../INSTALL.md) holds only instructions that can be followed
without changing code. Reasoning about which option fits, and design sketches
that are not concrete yet, live here.

## Choosing

| Option | Best for |
| :----- | :------- |
| **A** VM with Docker Compose (OCI Always Free + Cloudflare Tunnel) | Always-on, full features, the unmodified `docker compose` stack. nginx and api stay on one host and talk over the compose network, so there are no cross-service URLs to re-wire. Survives a change of a platform's sleeping policy. |
| **B** Hugging Face Spaces | Simplest setup, no infrastructure to manage, a free `*.hf.space` HTTPS URL. |
| **C** Google Cloud Run | Scale-to-zero (no charges when idle), low traffic, Google Cloud ecosystem. |

## Why the Cloud Run free-tier flags

- `--max-instances 1`: one in-process job at a time, matching the
  `Semaphore(1)` in `backend/app/jobs.py`.
- `--memory 2Gi`: peak during git clone plus Pitloom scan.

## Not concrete yet

Scaling beyond the in-process queue (a worker plus Redis, an RQ or Taskiq
backend) is a design sketch, not an instruction: see
[Staged backends](design.md#staged-backends).
