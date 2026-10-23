---
Created: 2026-10-20
Last-Modified: 2026-10-23
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

## Cost for about 30 users a day

An estimate, not a quote: prices and free allowances change, so check the
provider's page before relying on a figure. Assumes 30 users a day at about 3
checks each (about 2,700 checks a month), half uploads and half generated
from a Git or Hugging Face URL.

Measured on a laptop-class machine (Python 3.14, Pitloom at `main`):

| Operation | CPU | Elapsed | Memory |
| :-------- | :-- | :------ | :----- |
| Check one example SBOM (CISA 2026) | about 1 s | about 1 s | about 50 MiB |
| Generate from a mid-size Git repository, then check | about 4 s | about 7 s | about 170 MiB |

That is about 10,000 vCPU-seconds a month (plan for 30,000 with large
repositories), about 60,000 requests (page loads and job polling) and about 3
GB sent to users.

| Option | Monthly cost | Notes |
| :----- | :----------- | :---- |
| **A** OCI Always Free VM plus Cloudflare Tunnel | $0 | A domain is optional (about $1). Arm capacity is often unavailable at signup, and Oracle may reclaim an idle instance. |
| **B** Hugging Face Spaces, CPU Basic | $0 | Sleeps when idle; an in-memory job is lost if it sleeps. |
| **C** Cloud Run, `--min-instances 0` | $0 | Far inside the free tier (2 M requests, 180 K vCPU-seconds, 360 K GiB-seconds); egress about $0.20. A job can be lost between polls. |
| **C** Cloud Run, `--min-instances 1` | about $10 to $15 | Rough: an always-on instance, for reliable jobs. Use the provider's calculator. |

Cloning is inbound traffic, which none of the three bills. Pitloom clones
shallowly (`--depth 1`) and skips blobs over 10 MB (`BLOB_LIMIT`): `pallets/flask`
fetched about 1 MB and `bact/ntia-conformance-checker` about 4 MB (31 MB on
disk). The costs that depend on the clone are:

- **Cloud Run disk is memory.** A 500 MB checkout takes 500 MB of the 2 GiB.
- **Clone time is billed time** on Cloud Run.
- **No total size cap.** Only the per-blob filter and a 10-minute git timeout
  (`GIT_TIMEOUT_SECONDS`) exist. A public instance can be pointed at a huge
  repository: keep `--max-instances 1`, the memory limit and a budget alert.

## Not concrete yet

Scaling beyond the in-process queue (a worker plus Redis, an RQ or Taskiq
backend) is a design sketch, not an instruction: see
[Staged backends](design.md#staged-backends).
