# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""
Conformance result schema and the checker entry point.

Every check is run by ntia-conformance-checker. :func:`run_checker` runs it and
returns its SARIF log as the schema below; the API and UI consume only this schema.
"""

from __future__ import annotations

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
    """A single field-level conformance gap found on one component."""

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


# ── Checker ───────────────────────────────────────────────────────────────

# Lumina regulation id -> ntia-conformance-checker standard id.
# A regulation missing here is not supported by the checker.
CHECKER_STANDARDS: dict[RegulationId, str] = {
    "ntia": "ntia",
    "bsi": "bsi",
    "g7ai": "g7ai",
}


def run_checker(sbom_path: str, regulation_id: RegulationId) -> SbomCheckResponse:
    """Check *sbom_path* against *regulation_id* with ntia-conformance-checker.

    The checker's SARIF log (without the embedded SBOM) is parsed by
    :func:`sarif_ingest.parse_sarif`, the same parser as ``POST /api/v1/sarif/import``.

    Raises:
        NotImplementedError: the checker does not support *regulation_id*.
        ValueError: the SBOM format cannot be determined or is not supported.
    """
    standard = CHECKER_STANDARDS.get(regulation_id)
    if standard is None:
        raise NotImplementedError(
            f"Regulation '{regulation_id}' is not supported by ntia-conformance-checker."
        )
    # Imported here to keep app start-up light and to avoid a cycle with sarif_ingest.
    # pylint: disable=import-outside-toplevel,cyclic-import
    from ntia_conformance_checker.cli_utils import get_sbom_spec
    from ntia_conformance_checker.constants import DEFAULT_SBOM_SPEC
    from ntia_conformance_checker.sbom_checker import SbomChecker

    from .sarif_ingest import parse_sarif

    sbom_spec = get_sbom_spec(sbom_path, DEFAULT_SBOM_SPEC)
    if not sbom_spec:
        raise ValueError("Could not determine the SBOM format, or it is unsupported.")
    checker = SbomChecker(sbom_path, compliance=standard, sbom_spec=sbom_spec)
    return parse_sarif(checker.output_sarif(embed_sbom=False))
