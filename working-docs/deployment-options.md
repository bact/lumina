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

## Cost by number of users

An estimate, not a quote: prices and free allowances change, so check the
provider's page before relying on a figure (the Cloud Run egress rate below is
from memory and was not re-checked). Assumes 3 checks per user a day, half
uploads and half generated from a Git or Hugging Face URL, 30 days a month.

Measured on a laptop-class machine (Python 3.14, Pitloom at `main`):

| Operation | CPU | Elapsed | Memory |
| :-------- | :-- | :------ | :----- |
| Check one example SBOM (CISA 2026) | about 1 s | about 1 s | about 50 MiB |
| Generate from a mid-size Git repository, then check | about 5 s | about 8 s | about 170 MiB |

That is about 3 vCPU-seconds and 4.75 s of instance time per check on
average, plus about 22 requests (page loads and job polling) and 1 MB sent to
the user. Large repositories can cost three times as much CPU.

| Users a day | Checks a month | vCPU-seconds | Requests | Sent to users |
| ----------: | -------------: | -----------: | -------: | ------------: |
| 10 | 900 | 2.7 K | 20 K | 1 GB |
| 30 | 2,700 | 8 K | 60 K | 3 GB |
| 100 | 9,000 | 27 K | 200 K | 9 GB |
| 1,000 | 90,000 | 270 K | 2 M | 90 GB |

Monthly cost for the options of [INSTALL.md](../INSTALL.md):

| Option | 10 | 30 | 100 | 1,000 |
| :----- | -: | -: | --: | ----: |
| **A** OCI Always Free VM plus Cloudflare Tunnel | $0 | $0 | $0 | $0 |
| **B** Hugging Face Spaces, CPU Basic | $0 | $0 | $0 | $0, or about $22 for CPU Upgrade |
| **C** Cloud Run, `--min-instances 0` | $0 | $0 | about $1 | about $14 to $31 |
| **C** Cloud Run, `--min-instances 1` | about $10 to $15 | same | same | same, plus the usage above |

- **A:** the VM is free and so is its 10 TB outbound allowance. At 1,000 users
  a day the work is 10% to 30% of one core. Oracle may reclaim an Always Free
  instance it judges idle, which is a risk at 10 users a day, and Arm capacity
  is often unavailable at signup. A domain is optional (about $1).
- **B:** CPU Basic is free and CPU Upgrade (8 vCPU, 32 GB) is $0.03 an hour.
  Free hardware sleeps after a period of inactivity (48 hours at the time of
  writing), and an in-memory job is lost when it sleeps.
- **C:** the free tier (2 M requests, 180 K vCPU-seconds, 360 K GiB-seconds)
  covers up to about 100 users a day; the 100 row is egress only, beyond its
  free 1 GB at about $0.12 a GB. At 1,000 users the usage costs about $14 with
  the measured figures and about $31 with three times the CPU, of which about
  $11 is egress. `--min-instances 1` adds a rough $10 to $15 for an always-on
  instance.

### Capacity comes before cost

The job queue holds one job at a time (`Semaphore(1)`) and keeps its state in
memory, so one instance serves every request. At 1,000 users a day, 1,500
generations of about 8 s are about 3 hours of work; if a third of them arrive
in one hour the single worker is nearly full and users queue. More than one
Cloud Run instance does not help: a poll that reaches another instance does
not find the job. Past a few hundred users a day the next step is the shared
job store in [Staged backends](design.md#staged-backends) (a worker plus
Redis), whose cost is not estimated here.

### Clones

Cloning is inbound traffic, which none of the three bills. Pitloom clones
shallowly (`--depth 1`) and skips blobs over 10 MB (`BLOB_LIMIT`):
`pallets/flask` fetched about 1 MB and `bact/ntia-conformance-checker` about
4 MB (31 MB on disk). The costs that depend on the clone are:

- **Cloud Run disk is memory.** A 500 MB checkout takes 500 MB of the 2 GiB.
- **Clone time is billed time** on Cloud Run.
- **No total size cap.** Only the per-blob filter and a 10-minute git timeout
  (`GIT_TIMEOUT_SECONDS`) exist. A public instance can be pointed at a huge
  repository: keep `--max-instances 1`, the memory limit and a budget alert.

## Not concrete yet

Scaling beyond the in-process queue (a worker plus Redis, an RQ or Taskiq
backend) is a design sketch, not an instruction: see
[Staged backends](design.md#staged-backends).
