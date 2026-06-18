# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Mode 1 job: generate an SBOM from an artefact URL, then check conformance.

``generate_and_check`` is the single background job behind
``POST /api/v1/artifact/check``.  It is written **remote-ready** -- a top-level
function with JSON-serialisable arguments and a JSON-serialisable
(:class:`SbomCheckResponse`) result -- so the same function runs unchanged whether
the Stage 0 in-process queue calls it in a thread or a future RQ/Taskiq worker
runs it in another process.

Flow:

1. Dispatch the URL by kind: a Hugging Face Hub host goes to Pitloom's HF path;
   any other URL host is treated as a Git repo (shallow clone, then Pitloom).
2. Pitloom writes an SPDX 3 JSON-LD file.
3. The file is fed through the same :class:`ConformanceEngine` as an uploaded
   SBOM (the checker detects the SPDX version itself).

A generation failure is returned as a *degraded* response (zeroed conformance,
``execution_successful=False``, one ``error`` notification) rather than raised, so
the job completes ``done`` with a result the UI can render.  Unexpected errors
propagate and the queue marks the job ``error``.
"""

from __future__ import annotations

import logging
import os
import tempfile
from urllib.parse import urlparse

from .conformance import (
    CheckRun,
    ConformanceEngine,
    ConformanceResult,
    Notification,
    RegulationId,
    SbomCheckResponse,
)
from .generators import (
    GenerationError,
    generate_from_git,
    generate_from_huggingface,
)

logger = logging.getLogger(__name__)

# Stateless; safe to reuse across jobs.
_engine = ConformanceEngine()

_HF_HOSTS = {"huggingface.co", "www.huggingface.co"}


def generate_and_check(
    artifact_url: str, regulation_id: RegulationId = "ntia"
) -> SbomCheckResponse:
    """Generate an SBOM for *artifact_url* and check it against *regulation_id*."""
    fd, sbom_path = tempfile.mkstemp(prefix="lumina-sbom-", suffix=".spdx3.json")
    os.close(fd)
    try:
        try:
            _generate(artifact_url, sbom_path)
        except GenerationError as exc:
            logger.warning(
                "Generation failed for %s: [%s] %s",
                artifact_url,
                exc.descriptor_id,
                exc.message,
            )
            return _failure_response(regulation_id, exc.descriptor_id, exc.message)
        return _engine.check(sbom_path, regulation_id)
    finally:
        if os.path.exists(sbom_path):
            os.unlink(sbom_path)


def _generate(artifact_url: str, sbom_path: str) -> None:
    """Route *artifact_url* to the right generator, writing to *sbom_path*."""
    host = (urlparse(artifact_url).hostname or "").lower()
    if host in _HF_HOSTS:
        generate_from_huggingface(artifact_url, sbom_path)
    elif host:
        # Any other URL with a host is treated as a Git repository
        # (GitHub, GitLab, Bitbucket, self-hosted, ...).
        generate_from_git(artifact_url, sbom_path)
    else:
        raise GenerationError(
            "pitloom.url-unsupported",
            f"Unsupported artefact URL (expected a Git or Hugging Face Hub "
            f"URL): {artifact_url!r}",
        )


def _failure_response(
    regulation_id: RegulationId, descriptor_id: str, message: str
) -> SbomCheckResponse:
    """A degraded response carrying the generation failure as a notification."""
    return SbomCheckResponse(
        conformance=ConformanceResult(
            regulation_id=regulation_id,
            source="ntia-conformance-checker",
            total=0,
            present=0,
            missing=0,
            unverified=0,
            gaps=[],
        ),
        run=CheckRun(
            tool_name="lumina",
            execution_successful=False,
            notifications=[
                Notification(
                    level="error", message=message, descriptor_id=descriptor_id
                )
            ],
        ),
    )
