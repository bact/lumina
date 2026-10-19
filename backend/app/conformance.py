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

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from .generation_log import LogLine

if TYPE_CHECKING:
    from .sbom_source import LoadedSbom

# ── Output schema ─────────────────────────────────────────────────────────

StandardId = Literal["ntia", "bsi", "g7ai", "cisa2026", "fsct2024", "mof"]
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


RuleOutcome = Literal["present", "missing", "not-applicable", "out-of-scope"]
SbomFormat = Literal["spdx3-json", "spdx2-json", "other"]
EvidenceStatus = Literal["found", "absent"]


class EvidenceItem(BaseModel):
    """One property or relationship of an element that a rule reads."""

    key: str
    """The SPDX 3 property (``software_packageVersion``, ``verifiedUsing``) or,
    for a relationship, its type (``hasDeclaredLicense``)."""
    value: str
    """A one-line preview of the value, at most 160 characters."""
    line: int
    """1-based line in ``SbomSource.display``: the key's line, or for a list
    value the entry's (a typed entry's defining key, such as a hash's
    ``algorithm``; a relationship's ``relationshipType``)."""


class Evidence(BaseModel):
    """Where in the SBOM a rule found, or did not find, what it asks for.

    ``found`` evidence shows where the property is, not that its value is
    right; ``absent`` names an element the rule judged that lacks it.
    """

    status: EvidenceStatus
    element_id: str
    """The element's ``spdxId`` (or ``@id`` for a blank node such as
    ``_:CreationInfo0``)."""
    element_type: str
    """The element's SPDX 3 type (``ai_AIPackage``, ``CreationInfo``)."""
    element_name: str | None = None
    line: int
    """1-based first line of the element object in ``SbomSource.display``."""
    end_line: int
    """1-based last line (inclusive) of the element object."""
    items: list[EvidenceItem] = Field(default_factory=list)
    """What satisfies the rule on this element; empty for ``absent`` and when
    the rule's carrier cannot be told from its probe."""


class RuleResult(BaseModel):
    """The checker's outcome for one rule of the standard.

    ``out-of-scope`` rules are catalogue-only: the checker lists them but
    cannot check them, so they never count as missing.
    """

    rule_id: str
    cluster: str
    title: str
    provision: str
    outcome: RuleOutcome
    evidence: list[Evidence] = Field(default_factory=list)
    """Up to 20 elements behind the outcome (see :mod:`app.evidence`); only
    for an SPDX 3 JSON SBOM checked by Lumina."""
    evidence_more: int = 0
    """How many more evidence entries were left out."""


class ConformanceResult(BaseModel):
    """What the checker found: conformance gaps and counts."""

    standard_id: StandardId
    source: CheckerSource
    total: int
    present: int
    missing: int
    unverified: int
    optional_present: int = 0
    optional_missing: int = 0
    """Rules of the standard that only permit a property (BSI "optional"):
    decided like the others but kept out of ``total``, ``present`` and
    ``missing``, since lacking them is not a gap."""
    gaps: list[FieldGap]
    rules: list[RuleResult] = Field(default_factory=list)
    """Per-rule outcomes, when the producer reports them."""
    system_judged_by_model: str | None = None
    """Name of the AI model standing in for the system, when the checker
    judged the System-level rules by the model."""

    @classmethod
    def nothing_checked(
        cls, standard_id: StandardId, source: CheckerSource
    ) -> ConformanceResult:
        """A result with no counts and no findings: nothing was checked."""
        return cls(
            standard_id=standard_id,
            source=source,
            total=0,
            present=0,
            missing=0,
            unverified=0,
            gaps=[],
        )


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
    generator: str = ""
    """What made the SBOM when Lumina generated it (``"pitloom 0.20.2"``); empty
    for an uploaded SBOM or an imported SARIF log."""
    execution_successful: bool = True
    notifications: list[Notification] = Field(default_factory=list)


class EmbeddedSbom(BaseModel):
    """The source SBOM carried inside the SARIF log, if the producer embedded it.

    Mirrors SARIF ``artifact.contents`` (§3.24.7).  Exactly one of ``text``
    or ``binary_base64`` is set, matching the SARIF spec's mutual exclusion.
    Set on ``POST /api/v1/sarif/import`` when the producer embedded the SBOM
    (``output_sarif(embed_sbom=True)``, the checker CLI's ``sarif-sbom``
    output), so a client can show it alongside the findings from one
    round-trip; the web UI does not yet.
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


class SbomSource(BaseModel):
    """The SBOM a result is about, for download and for showing with line
    numbers (see :mod:`app.sbom_source`)."""

    filename: str
    format: SbomFormat
    text: str
    """The original bytes decoded as UTF-8 (undecodable bytes replaced)."""
    display: str
    """``text`` pretty-printed (indent 2) when it is a JSON object, else
    ``text`` itself.  Every line number in the response refers to it."""
    line_count: int
    """Number of ``\\n``-separated lines of ``display``."""


class SbomCheckResponse(BaseModel):
    """API envelope returned by /sbom/check and /sarif/import."""

    conformance: ConformanceResult
    run: CheckRun
    embedded_sbom: EmbeddedSbom | None = None
    """Source SBOM carried inside the SARIF log, if the producer embedded
    it.  ``None`` when the SARIF log links the artifact by URI only
    (the default of every SARIF producer including this one)."""
    sbom: SbomSource | None = None
    """The SBOM checked (uploaded or generated), or the embedded SBOM of an
    imported SARIF log when its text is JSON."""
    generation_log: list[LogLine] | None = None
    """What the generator side did, in order (see :mod:`app.generation_log`);
    ``None`` unless Lumina generated the SBOM."""


# ── Checker ───────────────────────────────────────────────────────────────

# Lumina standard id -> ntia-conformance-checker standard id.
# A standard missing here is not supported by the checker.
CHECKER_STANDARDS: dict[StandardId, str] = {
    "ntia": "ntia",
    "bsi": "bsi",
    "g7ai": "g7ai",
    "cisa2026": "cisa2026",
    "fsct2024": "fsct3",  # the checker's id for FSCT 2024
}


def run_checker(
    sbom_path: str, standard_id: StandardId, loaded: LoadedSbom | None = None
) -> SbomCheckResponse:
    """Check *sbom_path* against *standard_id* with ntia-conformance-checker.

    The checker's SARIF log (without the embedded SBOM) is parsed by
    :func:`sarif_ingest.parse_sarif`, the same parser as ``POST /api/v1/sarif/import``.

    *loaded* is the same file as read by :func:`app.sbom_source.load_sbom`:
    when given, the response carries it as ``sbom`` and, for an SPDX 3 JSON
    SBOM, each rule's evidence (:func:`app.evidence.add_evidence`, which
    never fails the check).

    Raises:
        NotImplementedError: the checker does not support *standard_id*.
        ValueError: the SPDX version of the SBOM cannot be determined.
    """
    checker_standard = CHECKER_STANDARDS.get(standard_id)
    if checker_standard is None:
        raise NotImplementedError(
            f"Minimum elements standard '{standard_id}' is not supported by "
            "ntia-conformance-checker."
        )
    # Imported here to keep app start-up light and to avoid a cycle with sarif_ingest.
    # pylint: disable=import-outside-toplevel,cyclic-import
    from ntia_conformance_checker.cli_utils import get_spdx_version
    from ntia_conformance_checker.constants import DEFAULT_SBOM_SPEC
    from ntia_conformance_checker.sbom_checker import SbomChecker

    from .sarif_ingest import parse_sarif

    version = get_spdx_version(sbom_path, DEFAULT_SBOM_SPEC)
    if version is None:
        raise ValueError("Could not determine the SPDX version of the SBOM.")
    sbom_spec = "spdx3" if version[0] == 3 else "spdx2"
    checker = SbomChecker(sbom_path, compliance=checker_standard, sbom_spec=sbom_spec)
    response = parse_sarif(checker.output_sarif(embed_sbom=False))
    if loaded is not None:
        response.sbom = loaded.source
        if loaded.spdx3_document is not None and sbom_spec == "spdx3":
            from .evidence import add_evidence

            add_evidence(response, checker, loaded.spdx3_document)
    return response
