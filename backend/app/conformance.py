# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""
Lumina conformance checking engine.

ConformanceEngine routes each regulation to the right checker and
normalises the result into a single ConformanceResult schema.  The
API and UI consume only this schema, so upgrading to a new external
checker is a one-line change in CHECKER_MAP -- nothing else needs
touching.

Current routing (see docs/design.md for rationale):
    ntia  → NtiaCheckerAdapter   (wraps ntia-conformance-checker)
    bsi   → LuminaInternalChecker (fallback until checker adds BSI support)
    g7ai  → LuminaInternalChecker (fallback until checker adds G7 AI support)
    mof   → LuminaInternalChecker (fallback until checker adds MOF support)
"""

from __future__ import annotations

import abc
from typing import Literal

from pydantic import BaseModel, Field


# ── Output schema ─────────────────────────────────────────────────────────

RegulationId = Literal["ntia", "bsi", "g7ai", "mof"]
FieldLevel = Literal["missing", "unverified"]
CheckerSource = Literal[
    "ntia-conformance-checker",
    "lumina-internal",
    "external-sarif",
]
NotificationLevel = Literal["error", "warning", "note"]


class FieldGap(BaseModel):
    component_id: str
    field_key: str
    level: FieldLevel
    note: str


class ConformanceResult(BaseModel):
    """What the checker found: conformance gaps and counts."""

    regulation_id: RegulationId
    source: CheckerSource
    total: int
    present: int
    missing: int
    unverified: int
    gaps: list[FieldGap]


class Notification(BaseModel):
    """A non-finding event from the run (parse error, validation warning, etc.).

    Mirrors SARIF ``invocations[].toolExecutionNotifications[]``.  ``descriptor_id``
    is the producer's notification class (e.g. ``"spdx.parsing-error"``,
    ``"spdx.validation-message"``); ``level`` matches SARIF level vocabulary.
    """

    level: NotificationLevel
    message: str
    descriptor_id: str = ""


class CheckRun(BaseModel):
    """How the check went: tool identity, parse status, notifications.

    Holds run-level metadata that is *not* a conformance finding.  Scales
    to future additions (timing, signing status, ingestion provenance)
    without polluting ConformanceResult.
    """

    tool_name: str
    tool_version: str = ""
    execution_successful: bool = True
    notifications: list[Notification] = Field(default_factory=list)


class EmbeddedSbom(BaseModel):
    """The source SBOM carried inside the SARIF log, if the producer embedded it.

    Mirrors SARIF ``artifact.contents`` (§3.24.7).  Exactly one of ``text``
    or ``binary_base64`` is set, matching the SARIF spec's mutual exclusion.
    Lumina populates this when ``ntia-conformance-checker --embed-sbom`` is
    used so the frontend can render the SBOM alongside conformance findings
    from a single round-trip.
    """

    uri: str
    """Artifact URI from ``artifact.location.uri`` (typically the basename
    of the source file)."""

    mime_type: str = ""
    """MIME type from ``artifact.mimeType`` (e.g. ``application/spdx+json``)."""

    text: str | None = None
    """UTF-8 decoded content when the artifact is textual (SPDX JSON, YAML,
    tag-value, RDF/XML).  ``None`` for binary artifacts."""

    binary_base64: str | None = None
    """Base64-encoded content when the artifact is not UTF-8 decodable.
    ``None`` for text artifacts."""


class SbomCheckResponse(BaseModel):
    """API envelope returned by /sbom/check and /sarif/import."""

    conformance: ConformanceResult
    run: CheckRun
    embedded_sbom: EmbeddedSbom | None = None
    """Source SBOM carried inside the SARIF log, if the producer embedded
    it.  ``None`` when the SARIF log links the artifact by URI only
    (the default of every SARIF producer including this one)."""


# ── Checker protocol ──────────────────────────────────────────────────────


class ConformanceChecker(abc.ABC):
    @abc.abstractmethod
    def check(self, sbom_path: str) -> SbomCheckResponse:
        """Parse *sbom_path* and return a SbomCheckResponse envelope."""


# ── NtiaCheckerAdapter ────────────────────────────────────────────────────


class NtiaCheckerAdapter(ConformanceChecker):
    """
    Wraps ntia-conformance-checker and normalises its output into a
    SbomCheckResponse (ConformanceResult + CheckRun).

    ntia-conformance-checker docs:
      https://github.com/spdx/ntia-conformance-checker
    """

    def check(self, sbom_path: str) -> SbomCheckResponse:
        """Run ntia-conformance-checker and normalise its SARIF output.

        Implementation note: we deliberately route the in-process path
        through SARIF (without embedding) instead of poking at checker
        attributes directly.  This keeps the in-process path and the
        ``POST /api/v1/sarif/import`` path on the *same* parser
        (:func:`sarif_ingest.parse_sarif`), so behaviour cannot drift
        between them.

        ``embed_sbom`` is **off**: Lumina already holds the SBOM (the user
        just uploaded it on this endpoint) so round-tripping it through the
        SARIF log would double the in-memory size for no benefit.  The
        SARIF-import endpoint is the only place where embedded content is
        actually consumed (when the producer chose to embed).
        """
        # Import lazily so app start-up doesn't pay for the SPDX deps.
        # pylint: disable=import-outside-toplevel
        from ntia_conformance_checker.main import SbomChecker  # type: ignore

        from .sarif_ingest import parse_sarif

        # SbomChecker is a factory; passing compliance="ntia" returns NTIAChecker.
        # All checks run during __init__ -- no separate run_all_checks() call needed.
        checker = SbomChecker(sbom_path, compliance="ntia")
        sarif = checker.output_sarif(embed_sbom=False)
        return parse_sarif(sarif)


# ── LuminaInternalChecker ─────────────────────────────────────────────────


class LuminaInternalChecker(ConformanceChecker):
    """
    Lumina's own field-level checker -- fallback for regulations that
    ntia-conformance-checker does not yet support (BSI, G7 AI, MOF).

    Mirrors the field-level logic in frontend/data.js.
    When ntia-conformance-checker adds support for a regulation, update
    CHECKER_MAP to point that key at NtiaCheckerAdapter and retire the
    corresponding branch here.
    """

    def __init__(self, regulation_id: RegulationId) -> None:
        self._regulation_id = regulation_id

    def check(self, sbom_path: str) -> SbomCheckResponse:
        raise NotImplementedError(
            f"LuminaInternalChecker for '{self._regulation_id}' is not yet implemented. "
            "Port field definitions and regSummary() logic from frontend/data.js."
        )


# ── Engine ────────────────────────────────────────────────────────────────

# Update this map when ntia-conformance-checker adds support for a regulation.
# NtiaCheckerAdapter is stateless, so a single instance is safe to reuse.
_ntia_adapter = NtiaCheckerAdapter()

CHECKER_MAP: dict[RegulationId, ConformanceChecker] = {
    "ntia": _ntia_adapter,
    "bsi": LuminaInternalChecker("bsi"),
    "g7ai": LuminaInternalChecker("g7ai"),
    "mof": LuminaInternalChecker("mof"),
}


class ConformanceEngine:
    def check(
        self, sbom_path: str, regulation_id: RegulationId
    ) -> SbomCheckResponse:
        checker = CHECKER_MAP[regulation_id]
        return checker.check(sbom_path)
