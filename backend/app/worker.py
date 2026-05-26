# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""
Lumina Celery worker.

Handles long-running tasks (SBOM generation from Git repos or Hugging Face
model pages) that would time out in a synchronous HTTP request.

Queue:  lumina-tasks  (default)
Broker: Redis / Valkey (REDIS_URL env var)
"""

import os

from celery import Celery

app = Celery(
    "lumina",
    broker=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
)

app.conf.task_routes = {"app.worker.*": {"queue": "lumina-tasks"}}


@app.task(name="app.worker.generate_sbom_from_repo", bind=True, max_retries=2)
def generate_sbom_from_repo(self, repo_url: str) -> dict:
    """
    Clone *repo_url* and run Pitloom to produce an SBOM.

    Can take >10 min for large repos -- run via Celery, not inline.
    TODO: call Pitloom CLI / library; store result; notify caller.
    """
    raise NotImplementedError("Pitloom integration not yet implemented.")


@app.task(name="app.worker.generate_sbom_from_hf", bind=True, max_retries=2)
def generate_sbom_from_hf(self, model_id: str) -> dict:
    """
    Fetch model metadata from Hugging Face Hub and produce an AI SBOM.

    TODO: call Pitloom with HF model page; store result; notify caller.
    """
    raise NotImplementedError("Hugging Face SBOM generation not yet implemented.")
