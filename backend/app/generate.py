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
   SBOM, which detects the SPDX version from the file.
4. What Pitloom logs at WARNING or above while it generates is added to the
   result as ``pitloom.log`` notifications, and ``CheckRun.generator`` names
   the Pitloom version.

A generation failure is returned as a *degraded* response (zeroed conformance,
``execution_successful=False``, one ``error`` notification) rather than raised, so
the job completes ``done`` with a result the UI can render.  Unexpected errors
propagate and the queue marks the job ``error``.
"""

from __future__ import annotations

import contextlib
import importlib.metadata
import ipaddress
import logging
import os
import socket
import tempfile
import threading
from collections.abc import Iterator
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

# Longer URLs are refused before they are parsed, logged or echoed back.
MAX_URL_LENGTH = 2048

_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_IPV4_COMPATIBLE = ipaddress.ip_network("::/96")


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Whether *ip* is a unicast address that reaches the public internet.

    An IPv6 address that embeds an IPv4 one (mapped, 6to4, Teredo, NAT64 and
    the deprecated IPv4-compatible form) is public only if that IPv4 address is.
    """
    if not ip.is_global or ip.is_multicast:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.is_site_local:
            return False
        embedded = ip.ipv4_mapped or ip.sixtofour
        if ip.teredo:
            embedded = ip.teredo[1]
        if ip in _NAT64 or ip in _IPV4_COMPATIBLE:
            embedded = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        if embedded is not None:
            return _is_public_ip(embedded)
    return True


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
    if len(artifact_url) > MAX_URL_LENGTH:
        raise GenerationError(
            "lumina.url-too-long", f"URL is longer than {MAX_URL_LENGTH} characters."
        )
    try:
        parsed = urlparse(artifact_url)
        host = parsed.hostname
    except ValueError as exc:
        raise GenerationError("lumina.url-invalid", f"Invalid URL: {exc}") from exc
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise GenerationError(
            "lumina.url-scheme-blocked",
            f"URL scheme {parsed.scheme!r} is not allowed; "
            f"use http or https: {artifact_url!r}",
        )
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
    except (socket.gaierror, UnicodeError) as exc:
        raise GenerationError(
            "lumina.url-unresolvable",
            f"Could not resolve host {host!r}: {exc}",
        ) from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not _is_public_ip(ip):
            raise GenerationError(
                "lumina.url-private-address",
                f"Host {host!r} resolves to a non-public address ({ip}); "
                "refusing to fetch it.",
            )


class _WarningCollector(logging.Handler):
    """Collect the WARNING-and-above records Pitloom logs on one thread."""

    def __init__(self, sink: list[Notification]) -> None:
        super().__init__(level=logging.WARNING)
        self._sink = sink
        self._thread = threading.get_ident()

    def emit(self, record: logging.LogRecord) -> None:
        """Keep the record as a notification, unless it is from another thread."""
        if record.thread == self._thread:
            self._sink.append(
                Notification(
                    level="error" if record.levelno >= logging.ERROR else "warning",
                    message=record.getMessage(),
                    descriptor_id="pitloom.log",
                )
            )


@contextlib.contextmanager
def _collect_warnings(sink: list[Notification]) -> Iterator[None]:
    """Turn what Pitloom warns while it generates into notifications for the user."""
    handler = _WarningCollector(sink)
    pitloom_logger = logging.getLogger("pitloom")
    pitloom_logger.addHandler(handler)
    try:
        yield
    finally:
        pitloom_logger.removeHandler(handler)


def _pitloom_version() -> str:
    return importlib.metadata.version("pitloom")


def generate_and_check(
    artifact_url: str, regulation_id: RegulationId = "ntia"
) -> SbomCheckResponse:
    """Generate an SBOM for *artifact_url* and check it against *regulation_id*."""
    fd, sbom_path = tempfile.mkstemp(prefix="lumina-sbom-", suffix=".spdx3.json")
    os.close(fd)
    warnings: list[Notification] = []
    try:
        try:
            with _collect_warnings(warnings):
                _generate(artifact_url, sbom_path)
        except GenerationError as exc:
            logger.warning(
                "Generation failed for %s: [%s] %s",
                artifact_url,
                exc.descriptor_id,
                exc.message,
            )
            return _failure_response(
                regulation_id,
                exc.descriptor_id,
                exc.message.replace(tempfile.gettempdir(), "<tmp>"),
            )
        response = run_checker(sbom_path, regulation_id)
        response.run.generator = f"pitloom {_pitloom_version()}"
        response.run.notifications.extend(warnings)
        return response
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
        # Lumina itself produced this (empty) result -- the external checker
        # never ran, so don't claim it as the source.
        conformance=ConformanceResult.nothing_checked(regulation_id, "lumina-internal"),
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
