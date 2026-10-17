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
3. The file is checked by the same :func:`run_checker` as an uploaded
   SBOM (the checker detects the SPDX version itself).

A generation failure is returned as a *degraded* response (zeroed conformance,
``execution_successful=False``, one ``error`` notification) rather than raised, so
the job completes ``done`` with a result the UI can render.  Unexpected errors
propagate and the queue marks the job ``error``.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
import tempfile
from urllib.parse import urlparse

from .conformance import (
    CheckRun,
    ConformanceResult,
    Notification,
    RegulationId,
    SbomCheckResponse,
    run_checker,
)
from .generators import (
    GenerationError,
    generate_from_git,
    generate_from_huggingface,
)

logger = logging.getLogger(__name__)

_HF_HOSTS = {"huggingface.co", "www.huggingface.co"}

_ALLOWED_SCHEMES = {"http", "https"}


def _ensure_public_http_url(artifact_url: str) -> None:
    """Reject URLs that could reach internal services (SSRF guard).

    Only ``http``/``https`` URLs whose host resolves exclusively to public
    (global) addresses are accepted.  This blocks loopback, RFC 1918 ranges,
    link-local (including cloud metadata endpoints), and other reserved
    space.  Set ``LUMINA_ALLOW_PRIVATE_URLS=1`` to disable the address check
    in development (e.g. cloning from a Git server on the LAN).

    Note: this is a resolve-time check; it does not defend against DNS
    rebinding between validation and clone.  Acceptable at this stage --
    network-level egress policy is the real control for a hardened deploy.
    """
    parsed = urlparse(artifact_url)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise GenerationError(
            "lumina.url-scheme-blocked",
            f"URL scheme {parsed.scheme!r} is not allowed; "
            f"use http or https: {artifact_url!r}",
        )
    host = parsed.hostname
    if not host:
        raise GenerationError(
            "pitloom.url-unsupported",
            f"Unsupported artefact URL (expected a Git or Hugging Face Hub "
            f"URL): {artifact_url!r}",
        )
    if os.environ.get("LUMINA_ALLOW_PRIVATE_URLS") == "1":
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise GenerationError(
            "lumina.url-unresolvable",
            f"Could not resolve host {host!r}: {exc}",
        ) from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise GenerationError(
                "lumina.url-private-address",
                f"Host {host!r} resolves to a non-public address ({ip}); "
                "refusing to fetch it.",
            )


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
        return run_checker(sbom_path, regulation_id)
    finally:
        if os.path.exists(sbom_path):
            os.unlink(sbom_path)


def _generate(artifact_url: str, sbom_path: str) -> None:
    """Route *artifact_url* to the right generator, writing to *sbom_path*."""
    _ensure_public_http_url(artifact_url)
    host = (urlparse(artifact_url).hostname or "").lower()
    if host in _HF_HOSTS:
        generate_from_huggingface(artifact_url, sbom_path)
    else:
        # Any other URL with a host is treated as a Git repository
        # (GitHub, GitLab, Bitbucket, self-hosted, ...).
        generate_from_git(artifact_url, sbom_path)


def _failure_response(
    regulation_id: RegulationId, descriptor_id: str, message: str
) -> SbomCheckResponse:
    """A degraded response carrying the generation failure as a notification."""
    return SbomCheckResponse(
        conformance=ConformanceResult(
            regulation_id=regulation_id,
            # Lumina itself produced this (empty) result -- the external
            # checker never ran, so don't claim it as the source.
            source="lumina-internal",
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
