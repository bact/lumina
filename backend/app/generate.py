# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Mode 1 job: generate an SBOM from an artefact URL, then check conformance.

``generate_and_check`` is the single background job behind
``POST /api/v1/artifact/check``.  It is written **remote-ready** -- a top-level
function with JSON-serialisable arguments and a JSON-serialisable
(:class:`SbomCheckResponse`) result -- so the same function runs unchanged in a
thread of the in-process queue or in a separate worker process.

Flow:

1. Dispatch the URL by kind: a Hugging Face Hub host goes to Pitloom's HF path;
   any other URL host is treated as a Git repo (shallow clone, then Pitloom).
2. Pitloom writes an SPDX 3 JSON-LD file.
3. The file is checked by the same :func:`run_checker` as an uploaded
   SBOM, which detects the SPDX version from the file.
4. The response carries the generated SBOM as ``sbom`` (read before the file
   is deleted) and, per rule, the evidence in it.
5. What Pitloom logs at WARNING or above while it generates is added to the
   result as ``pitloom.log`` notifications, ``CheckRun.generator`` names the
   Pitloom version, and ``generation_log`` lists everything the generator side
   did (:mod:`app.generation_log`).

A generation failure is returned as a *degraded* response (zeroed conformance,
``execution_successful=False``, one ``error`` notification) rather than raised, so
the job completes ``done`` with a result the UI can render.  Unexpected errors
propagate and the queue marks the job ``error``.
"""

from __future__ import annotations

import contextlib
import importlib.metadata
import ipaddress
import json
import logging
import os
import re
import socket
import tempfile
import threading
from collections.abc import Iterator
from urllib.parse import urlparse

from .conformance import (
    CheckRun,
    ConformanceResult,
    Notification,
    SbomCheckResponse,
    StandardId,
    run_checker,
)
from .generation_log import GenerationLog, hide_temp_dir, note, recording
from .generators import (
    GenerationError,
    generate_from_git,
    generate_from_huggingface,
)
from .sbom_source import load_sbom

logger = logging.getLogger(__name__)

# Hosts of a Hub model URL; Pitloom reads only ``huggingface.co``, so
# :func:`_hub_url` rewrites the others.
_HF_HOSTS = {"huggingface.co", "www.huggingface.co", "hf.co"}

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


def _allowed_private_hosts() -> frozenset[str]:
    """Hosts the operator trusts to resolve to a non-public address:
    ``LUMINA_ALLOWED_PRIVATE_HOSTS``, comma-separated, matched exactly and
    ignoring case (no wildcards, no subdomains)."""
    raw = os.environ.get("LUMINA_ALLOWED_PRIVATE_HOSTS", "")
    return frozenset(h.strip().lower() for h in raw.split(",") if h.strip())


_URL_USERINFO = re.compile(r"://[^/\s@][^/\s]*@")
_CONTROLS = re.compile("[\x00-\x1f\x7f-\x9f]")
_SHOWN_URL_LENGTH = 200


def _display_url(url: str) -> str:
    """*url* made safe to log or echo: credentials masked, control characters
    escaped, cut to :data:`_SHOWN_URL_LENGTH` characters."""
    text = _URL_USERINFO.sub("://***:***@", url[:_SHOWN_URL_LENGTH])
    text = _CONTROLS.sub(lambda m: ascii(m.group())[1:-1], text)
    return text + ("..." if len(url) > _SHOWN_URL_LENGTH else "")


def _hub_url(artifact_url: str) -> str | None:
    """The ``https://huggingface.co/...`` form of a Hub URL, or ``None`` when
    *artifact_url* is not one (any case, ``www.`` and ``hf.co`` included)."""
    parsed = urlparse(artifact_url)
    if (parsed.hostname or "").lower() not in _HF_HOSTS:
        return None
    return parsed._replace(scheme="https", netloc="huggingface.co").geturl()


def _check_url_text(artifact_url: str) -> str:
    """Refuse an over-long, unparsable, non-http(s) or host-less URL, without
    resolving anything; returns the URL's host."""
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
            f"use http or https: '{_display_url(artifact_url)}'",
        )
    if not host:
        raise GenerationError(
            "pitloom.url-unsupported",
            f"Unsupported artefact URL (expected a Git or Hugging Face Hub "
            f"URL): '{_display_url(artifact_url)}'",
        )
    return host


def _ensure_public_http_url(artifact_url: str) -> None:
    """Reject URLs that could reach internal services (SSRF guard).

    Only ``http``/``https`` URLs whose host resolves exclusively to public
    (global) addresses are accepted.  This blocks loopback, RFC 1918 ranges,
    link-local (including cloud metadata endpoints), and other reserved
    space.  ``LUMINA_ALLOWED_PRIVATE_HOSTS`` names hosts (set by the operator,
    never by a request) whose address is not checked; set
    ``LUMINA_ALLOW_PRIVATE_URLS=1`` to disable the address check for every
    host in development.

    Note: this is a resolve-time check; it does not defend against DNS
    rebinding between validation and clone.  Network-level egress policy is the
    real control for a hardened deploy.
    """
    host = _check_url_text(artifact_url)
    if os.environ.get("LUMINA_ALLOW_PRIVATE_URLS") == "1":
        return
    if host.lower() in _allowed_private_hosts():
        logger.info("Fetching %r: host is in LUMINA_ALLOWED_PRIVATE_HOSTS", host)
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
                "refusing to fetch it. The server's operator can allow a "
                "trusted host with LUMINA_ALLOWED_PRIVATE_HOSTS.",
            )


class _WarningCollector(logging.Handler):
    """Collect the WARNING-and-above records Pitloom logs on one thread."""

    def __init__(self, sink: list[Notification]) -> None:
        super().__init__(level=logging.WARNING)
        self._sink = sink
        self._thread = threading.get_ident()

    def emit(self, record: logging.LogRecord) -> None:
        """Keep the record as a notification, unless it is from another thread."""
        if record.thread == self._thread and record.name.split(".")[0] == "pitloom":
            self._sink.append(
                Notification(
                    level="error" if record.levelno >= logging.ERROR else "warning",
                    message=hide_temp_dir(record.getMessage()),
                    descriptor_id="pitloom.log",
                )
            )


@contextlib.contextmanager
def _collect_warnings(sink: list[Notification]) -> Iterator[None]:
    """Turn what Pitloom warns while it generates into notifications for the user.

    The handler sits on the root logger: Pitloom's ``configure_logging()``
    replaces the handlers of the ``pitloom`` logger itself, which would drop
    one added there, and its records still propagate to the root.
    """
    handler = _WarningCollector(sink)
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    try:
        yield
    finally:
        root_logger.removeHandler(handler)


def _pitloom_version() -> str:
    """The installed Pitloom's version, and its short commit when it was
    installed from Git: ``requirements.txt`` pins a commit that can be later
    than the version number it still reports."""
    dist = importlib.metadata.distribution("pitloom")
    raw = dist.read_text("direct_url.json")
    commit = json.loads(raw).get("vcs_info", {}).get("commit_id") if raw else None
    return (
        f"{dist.version} ({commit[:7]})"
        if isinstance(commit, str) and commit
        else dist.version
    )


def generate_and_check(
    artifact_url: str, standard_id: StandardId = "ntia"
) -> SbomCheckResponse:
    """Generate an SBOM for *artifact_url* and check it against *standard_id*."""
    fd, sbom_path = tempfile.mkstemp(prefix="lumina-sbom-", suffix=".spdx3.json")
    os.close(fd)
    warnings: list[Notification] = []
    log = GenerationLog()
    try:
        try:
            with _collect_warnings(warnings), recording(log):
                _check_url_text(artifact_url)
                note("lumina", "info", f"Generating an SBOM for {_display_url(artifact_url)}")
                _generate(artifact_url, sbom_path)
                note("lumina", "info", "Pitloom finished; reading the SBOM it wrote")
        except GenerationError as exc:
            log.add("lumina", "error", f"[{exc.descriptor_id}] {exc.message}")
            logger.warning(
                "Generation failed for %s: [%s] %s",
                _display_url(artifact_url),
                exc.descriptor_id,
                exc.message,
            )
            response = _failure_response(
                standard_id,
                exc.descriptor_id,
                hide_temp_dir(exc.message),
            )
            response.generation_log = log.finish()
            return response
        with open(sbom_path, encoding="utf-8", errors="replace") as sbom_file:
            loaded = load_sbom(sbom_filename(artifact_url), sbom_file.read())
        response = run_checker(sbom_path, standard_id, loaded)
        response.run.generator = f"pitloom {_pitloom_version()}"
        response.run.notifications.extend(warnings)
        response.generation_log = log.finish()
        return response
    finally:
        if os.path.exists(sbom_path):
            os.unlink(sbom_path)


_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


def sbom_filename(artifact_url: str) -> str:
    """``<name>.spdx3.json`` for a generated SBOM: the Hugging Face model name
    (``huggingface.co/<org>/<model>/...``) or the repository name of a Git URL
    (without ``.git``; for a page URL the repository, not the folder);
    ``sbom.spdx3.json`` when the URL names nothing."""
    hub = _hub_url(artifact_url)
    if hub is not None:
        segments = [s for s in urlparse(hub).path.split("/") if s][:2]
        name = segments[-1] if segments else ""
    else:
        # Imported lazily; see app.generators.base.
        # pylint: disable-next=import-outside-toplevel
        from pitloom.extract.remote import RemoteSourceError, parse_git_page

        try:
            name = parse_git_page(artifact_url).repo_name
        except RemoteSourceError:  # a path Pitloom will refuse
            name = ""
    name = _UNSAFE_FILENAME_CHARS.sub("-", name.removesuffix(".git")).strip(".-")
    return f"{name or 'sbom'}.spdx3.json"


def _generate(artifact_url: str, sbom_path: str) -> None:
    """Route *artifact_url* to the right generator, writing to *sbom_path*."""
    hub = _hub_url(artifact_url)
    if hub is not None:
        generate_from_huggingface(hub, sbom_path)
    else:
        # Any other URL with a host is treated as a Git repository
        # (GitHub, GitLab, Bitbucket, self-hosted, ...).
        generate_from_git(artifact_url, sbom_path, _ensure_public_http_url)


def _failure_response(
    standard_id: StandardId, descriptor_id: str, message: str
) -> SbomCheckResponse:
    """A degraded response carrying the generation failure as a notification."""
    return SbomCheckResponse(
        # Lumina itself produced this (empty) result -- the external checker
        # never ran, so don't claim it as the source.
        conformance=ConformanceResult.nothing_checked(standard_id, "lumina-internal"),
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
