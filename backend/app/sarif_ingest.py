# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""SARIF 2.1.0 ingestion -> :class:`SbomCheckResponse`.

Accepts a SARIF log dict produced by any tool that follows the rule-id
convention documented in ``ntia-conformance-checker``'s ``RULES.md``:

    SBOM-[SPEC]-[CATEGORY]-[NNN]

* ``SBOM`` is a fixed namespace prefix shared by every rule id.
* ``SPEC`` is an uppercase short standard code -- the spec id uppercased
  (``NTIA``, ``FSCT3``, ``BSI``, ``G7AI``, ``MOF``).  It drives
  ``ConformanceResult.regulation_id``.
* ``CATEGORY`` is an uppercase short category code (``DF``, ``META``, ``COMP``,
  ...).  Not interpreted here, but preserved in the rule lookup table.
* ``NNN`` is a zero-padded (3-digit) sequence number.

The legacy ``[SPEC]-[CATEGORY]-[NN]`` form (no ``SBOM-`` prefix) is still
tolerated by :func:`_spec_of`.

The producer is identified by ``run.tool.driver.name``;
``ntia-conformance-checker`` is recognised explicitly and anything else is
tagged ``external-sarif``.

The field name a result maps to (``FieldGap.field_key``) is taken from the
SARIF rule's ``properties.elementId`` when present, falling back to the
rule's ``properties.slug`` (spec prefix stripped) and finally to the rule id.
"""

from __future__ import annotations

from typing import Any, get_args

from .conformance import (
    CheckerSource,
    CheckRun,
    ConformanceResult,
    EmbeddedSbom,
    FieldGap,
    Notification,
    NotificationLevel,
    RegulationId,
    SbomCheckResponse,
)


# Map uppercase spec code (the SPEC segment of a rule id, i.e. the spec id
# uppercased) -> Lumina regulation id.  Extend when new RegulationId literals
# or specs are added.
_SPEC_TO_REGULATION: dict[str, RegulationId] = {
    "NTIA": "ntia",
    "FSCT": "ntia",  # FSCT (CISA Framing...) is a superset of NTIA.
    "FSCT3": "ntia",  # FSCT 3rd edition; superset of NTIA, no separate UI yet.
    "CISA": "ntia",  # CISA 2025 SBOM Minimum Elements -- placeholder.
    "BSI": "bsi",
    "G7AI": "g7ai",
    "MOF": "mof",
}

# Map ntia-conformance-checker ``complianceStandard`` (the spec id) to a
# RegulationId.  Preferred over rule-id inference because it survives
# heterogeneous rule sets.
_STANDARD_TO_REGULATION: dict[str, RegulationId] = {
    "ntia": "ntia",
    "fsct3": "ntia",
    "fsct3-min": "ntia",  # legacy spec id (pre-rename)
    "bsi": "bsi",
    "g7-ai": "g7ai",
    "g7ai": "g7ai",
    "mof": "mof",
}

# Map producer tool names to CheckerSource literals.
_KNOWN_PRODUCERS: dict[str, CheckerSource] = {
    "ntia-conformance-checker": "ntia-conformance-checker",
}


class SarifIngestError(ValueError):
    """Raised when the input is not a usable SARIF 2.1.0 log."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise SarifIngestError(message)


def _spec_of(rule_id: str) -> str:
    """Return the SPEC segment of a rule id, uppercased.

    Handles the current ``SBOM-[SPEC]-[CAT]-[NNN]`` scheme (SPEC is the
    segment after the fixed ``SBOM`` namespace prefix) and tolerates the
    legacy ``[SPEC]-[CAT]-[NN]`` form.
    """
    parts = [p for p in rule_id.split("-") if p]
    if not parts:
        return ""
    if parts[0].upper() == "SBOM" and len(parts) > 1:
        return parts[1].upper()
    return parts[0].upper()


def _logical_location(result: dict[str, Any]) -> tuple[str, str]:
    """Return ``(component_id, kind)`` for a result.

    Falls back to ``("document", "module")`` if the result has no
    logicalLocations or the location's kind is ``"module"`` (our convention
    for doc-level findings).
    """
    locations = result.get("locations") or []
    if not locations:
        return ("document", "module")
    logical = locations[0].get("logicalLocations") or []
    if not logical:
        return ("document", "module")
    loc = logical[0]
    if loc.get("kind") == "module" or loc.get("name") == "document":
        return ("document", "module")
    # Prefer SPDX-style fully-qualified id; fall back to name.
    comp_id = loc.get("fullyQualifiedName") or loc.get("name") or "document"
    return (str(comp_id), str(loc.get("kind") or "package"))


def _build_rule_index(driver: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index ``tool.driver.rules`` by ``id`` for O(1) lookup."""
    index: dict[str, dict[str, Any]] = {}
    for rule in driver.get("rules") or []:
        rid = rule.get("id")
        if isinstance(rid, str) and rid:
            index[rid] = rule
    return index


def _field_key_from_rule(rule: dict[str, Any] | None, rule_id: str) -> str:
    """Derive ``FieldGap.field_key`` from a rule descriptor.

    Preference order:

    1. ``properties.elementId``  -- explicit, set by ntia-conformance-checker.
    2. ``properties.slug`` with the spec prefix stripped, ``-`` -> ``_``.
       e.g. ``"ntia-component-name"`` -> ``"component_name"``.
    3. The full rule id (last resort, keeps the link visible in the UI).
    """
    props = (rule or {}).get("properties") or {}
    element_id = props.get("elementId")
    if isinstance(element_id, str) and element_id:
        return element_id

    slug = props.get("slug")
    if isinstance(slug, str) and slug:
        head, sep, tail = slug.partition("-")
        # Strip a known spec prefix if present, else keep the slug verbatim.
        if sep and head.upper() in _SPEC_TO_REGULATION:
            return tail.replace("-", "_")
        return slug.replace("-", "_")

    return rule_id


_SARIF_LEVEL_TO_NOTIFICATION: dict[str, NotificationLevel] = {
    "error": "error",
    "warning": "warning",
    "note": "note",
}


def _notifications_from_invocations(
    run: dict[str, Any],
) -> tuple[list[Notification], bool]:
    """Extract toolExecutionNotifications + executionSuccessful from a SARIF run."""
    invocations = run.get("invocations") or []
    if not invocations:
        return ([], True)
    inv = invocations[0]
    notes: list[Notification] = []
    for n in inv.get("toolExecutionNotifications") or []:
        level_raw = str(n.get("level") or "warning")
        descriptor = (n.get("descriptor") or {}).get("id") or ""
        message = (n.get("message") or {}).get("text") or ""
        notes.append(
            Notification(
                level=_SARIF_LEVEL_TO_NOTIFICATION.get(level_raw, "warning"),
                message=str(message),
                descriptor_id=str(descriptor),
            )
        )
    successful = bool(inv.get("executionSuccessful", True))
    return (notes, successful)


def _embedded_sbom(run: dict[str, Any]) -> EmbeddedSbom | None:
    """Extract an ``EmbeddedSbom`` from ``runs[0].artifacts[0]`` if present.

    Only the first artifact is considered; the conformance checkers we
    target emit a single artifact (the input SBOM file).  Returns ``None``
    when the producer linked by URI only (no ``contents`` object).
    """
    artifacts = run.get("artifacts") or []
    if not artifacts:
        return None
    artifact = artifacts[0]
    contents = artifact.get("contents")
    if not isinstance(contents, dict):
        return None
    uri = str(((artifact.get("location") or {}).get("uri")) or "")
    mime_type = str(artifact.get("mimeType") or "")
    text = contents.get("text")
    binary = contents.get("binary")
    return EmbeddedSbom(
        uri=uri,
        mime_type=mime_type,
        text=str(text) if isinstance(text, str) else None,
        binary_base64=str(binary) if isinstance(binary, str) else None,
    )


def _infer_regulation_id(
    standard_hint: str, rule_index: dict[str, dict[str, Any]]
) -> RegulationId:
    """Pick a ``RegulationId`` from the SARIF log.

    Preference order:

    1. ``run.properties.complianceStandard`` matching a known standard id.
    2. The SPEC prefix of the first rule whose prefix is recognised.
    3. ``"ntia"`` if that's a valid ``RegulationId``, else the first literal.
    """
    if standard_hint in _STANDARD_TO_REGULATION:
        return _STANDARD_TO_REGULATION[standard_hint]

    for rule_id in rule_index:
        spec_code = _spec_of(rule_id)
        if spec_code in _SPEC_TO_REGULATION:
            return _SPEC_TO_REGULATION[spec_code]

    valid_regs = get_args(RegulationId)
    return "ntia" if "ntia" in valid_regs else valid_regs[0]


def _build_gaps(
    results: list[dict[str, Any]], rule_index: dict[str, dict[str, Any]]
) -> list[FieldGap]:
    """Convert SARIF ``run.results`` entries into Lumina field gaps."""
    gaps: list[FieldGap] = []
    for result in results:
        rule_id = str(result.get("ruleId") or "")
        if not rule_id:
            continue
        rule_descriptor = rule_index.get(rule_id)
        component_id, _kind = _logical_location(result)
        message = (result.get("message") or {}).get("text") or rule_id
        gaps.append(
            FieldGap(
                component_id=component_id,
                field_key=_field_key_from_rule(rule_descriptor, rule_id),
                level="missing",
                note=str(message),
            )
        )
    return gaps


def _count_totals(
    results: list[dict[str, Any]], rule_index: dict[str, dict[str, Any]]
) -> tuple[int, int, int]:
    """Return ``(total, present, missing)`` counts for a SARIF run.

    ``total`` = number of *active* rules in the driver catalogue; ``missing``
    = number of unique rule ids that appeared in results; ``present`` =
    ``total - missing``.  Catalogue-only rules (rules whose
    ``properties.status != "active"``) are excluded so the counts reflect
    what the checker actually verified.
    """
    active_rules = [
        rid
        for rid, rule in rule_index.items()
        if str(((rule.get("properties") or {}).get("status")) or "active") == "active"
    ]
    total = len(active_rules) or len(rule_index)
    missing_rule_ids = {str(r.get("ruleId")) for r in results if r.get("ruleId")}
    missing = len(missing_rule_ids)
    present = max(total - missing, 0)
    return total, present, missing


def _build_conformance_result(
    run: dict[str, Any],
    driver: dict[str, Any],
    rule_index: dict[str, dict[str, Any]],
) -> ConformanceResult:
    """Build the ``ConformanceResult`` portion of a parsed SARIF run."""
    producer_name = str(driver.get("name") or "")
    source: CheckerSource = _KNOWN_PRODUCERS.get(producer_name, "external-sarif")

    properties = run.get("properties") or {}
    standard_hint = str(properties.get("complianceStandard") or "")
    regulation_id = _infer_regulation_id(standard_hint, rule_index)

    results = run.get("results") or []
    total, present, missing = _count_totals(results, rule_index)
    return ConformanceResult(
        regulation_id=regulation_id,
        source=source,
        total=total,
        present=present,
        missing=missing,
        unverified=0,
        gaps=_build_gaps(results, rule_index),
    )


def _build_check_run(run: dict[str, Any], driver: dict[str, Any]) -> CheckRun:
    """Build the ``CheckRun`` portion of a parsed SARIF run."""
    notifications, execution_successful = _notifications_from_invocations(run)
    return CheckRun(
        tool_name=str(driver.get("name") or ""),
        tool_version=str(driver.get("version") or ""),
        execution_successful=execution_successful,
        notifications=notifications,
    )


def parse_sarif(sarif: dict[str, Any]) -> SbomCheckResponse:
    """Parse a SARIF 2.1.0 log dict into a Lumina :class:`SbomCheckResponse`."""
    _require(isinstance(sarif, dict), "SARIF log must be a JSON object")
    _require(
        sarif.get("version") == "2.1.0",
        f"Unsupported SARIF version: {sarif.get('version')!r} (need '2.1.0')",
    )

    runs = sarif.get("runs") or []
    _require(bool(runs), "SARIF log has no runs")
    run = runs[0]

    driver = (run.get("tool") or {}).get("driver") or {}
    rule_index = _build_rule_index(driver)

    return SbomCheckResponse(
        conformance=_build_conformance_result(run, driver, rule_index),
        run=_build_check_run(run, driver),
        embedded_sbom=_embedded_sbom(run),
    )
