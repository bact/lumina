# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""SARIF 2.1.0 ingestion -> :class:`SbomCheckResponse`.

Accepts a SARIF log dict from any tool whose rule ids follow the SBOM
requirements ontology (``https://bact.github.io/bom/``):

    BOM-[SPEC][YEAR]-[CATEGORY]-[NNN][.M]

* ``SPEC`` + ``YEAR`` name the standard (``NTIA2021``, ``G7AI2026``); the two
  together drive ``ConformanceResult.standard_id`` when
  ``run.properties.complianceStandard`` is absent. An edition Lumina does not
  support is refused with :class:`SarifIngestError`, never read as another.
* ``CATEGORY`` is a short category code (``DF``, ``META``, ``COMP``, ...); it is
  kept in the rule lookup table, not interpreted.
* ``NNN`` is a 3-digit sequence number; ``.M`` marks a sub-element of rule ``NNN``.

Only this form is read; ids in any other shape name no standard.

``run.properties.ruleOutcomes``, when present, sets the counts: every decided
(present or missing) rule counts, sub-rules included. A log without it says
only what is missing, so only the missing count is set.

The producer is identified by ``run.tool.driver.name``;
``ntia-conformance-checker`` is recognised explicitly and anything else is
tagged ``external-sarif``.

The field name a result maps to (``FieldGap.field_key``) is taken from the
SARIF rule's ``properties.elementId`` when present, falling back to the
rule's ``properties.slug`` (spec prefix stripped) and finally to the rule id.
"""

from __future__ import annotations

from typing import Any, NamedTuple, get_args

from .conformance import (
    CheckerSource,
    CheckRun,
    ConformanceResult,
    EmbeddedSbom,
    FieldGap,
    Notification,
    NotificationLevel,
    StandardId,
    RuleOutcome,
    RuleResult,
    SbomCheckResponse,
    SbomSource,
)
from .sbom_source import load_sbom

# Map the SPEC segment of a rule id, uppercased and whole (``CISA2026`` keeps
# its year: another edition is another document) -> Lumina standard id.
# Extend when a new edition or StandardId literal is supported.
_SPEC_TO_STANDARD: dict[str, StandardId] = {
    "NTIA2021": "ntia",
    "BSI2025": "bsi",
    "G7AI2026": "g7ai",
    "CISA2026": "cisa2026",
    "FSCT2024": "fsct2024",
}

# Map ntia-conformance-checker ``complianceStandard`` (the spec id) to a
# StandardId.  Preferred over rule-id inference because it survives
# heterogeneous rule sets.
_CHECKER_TO_STANDARD: dict[str, StandardId] = {
    "ntia": "ntia",
    "bsi": "bsi",
    "g7ai": "g7ai",
    "cisa2026": "cisa2026",
    "fsct3": "fsct2024",  # the checker's id for FSCT 2024
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
    """Return the SPEC+YEAR segment of a rule id, uppercased.

    ``BOM-G7AI2026-MDL-001`` -> ``G7AI2026``. An id of any other shape gives
    ``""``.
    """
    parts = rule_id.split("-")
    if len(parts) > 1 and parts[0].upper() == "BOM":
        return parts[1].upper()
    return ""


def _component_id(result: dict[str, Any]) -> str:
    """Return the component a result is about.

    ``"document"`` if the result has no logicalLocations or the location's
    kind is ``"module"`` (the convention for document-level findings).
    """
    locations = result.get("locations") or []
    if not locations:
        return "document"
    logical = locations[0].get("logicalLocations") or []
    if not logical:
        return "document"
    loc = logical[0]
    if loc.get("kind") == "module" or loc.get("name") == "document":
        return "document"
    # Prefer SPDX-style fully-qualified id; fall back to name.
    return str(loc.get("fullyQualifiedName") or loc.get("name") or "document")


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
        if sep and head.lower() in _CHECKER_TO_STANDARD:
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


def _embedded_source(embedded: EmbeddedSbom | None) -> SbomSource | None:
    """The embedded SBOM as an :class:`SbomSource`, when its text is JSON."""
    if embedded is None or embedded.text is None:
        return None
    name = embedded.uri.replace("\\", "/").rsplit("/", 1)[-1] or "sbom.json"
    loaded = load_sbom(name, embedded.text)
    return loaded.source if loaded.is_json else None


def _all_rule_ids(run: dict[str, Any], rule_index: dict[str, Any]) -> list[str]:
    """Every rule id the run names: its catalogue, its results and its outcomes."""
    ids = set(rule_index)
    for result in run.get("results") or []:
        ids.add(str(result.get("ruleId") or ""))
    outcomes = (run.get("properties") or {}).get("ruleOutcomes")
    if isinstance(outcomes, dict):
        ids.update(str(rule_id) for rule_id in outcomes)
    return sorted(ids - {""})


def _infer_standard_id(standard_hint: str, rule_ids: list[str]) -> StandardId:
    """Pick a ``StandardId`` from the SARIF log.

    1. ``run.properties.complianceStandard``, when present, must name a known
       standard, and every rule id must be of that standard and edition.
    2. With no hint, every rule id must be of one supported standard and
       edition.
    A standard Lumina does not support (for example another edition of CISA),
    or a log that mixes standards, is refused, never read as another.
    """
    specs = {rule_id: _spec_of(rule_id) for rule_id in rule_ids}
    if standard_hint:
        if standard_hint not in _CHECKER_TO_STANDARD:
            raise SarifIngestError(
                f"Unsupported standard: complianceStandard {standard_hint!r}"
            )
        standard = _CHECKER_TO_STANDARD[standard_hint]
        for rule_id, spec_code in specs.items():
            if _SPEC_TO_STANDARD.get(spec_code) != standard:
                raise SarifIngestError(
                    f"Unsupported standard: complianceStandard {standard_hint!r} "
                    f"contradicts rule id {rule_id!r}"
                )
        return standard
    found = {_SPEC_TO_STANDARD.get(code) for code in specs.values()}
    if len(found) == 1 and None not in found:
        return next(iter(found))  # type: ignore[arg-type]
    codes = sorted({code or "?" for code in specs.values()})
    raise SarifIngestError(
        f"Unsupported standard: no single supported standard in rule id spec(s) "
        f"{codes or 'none'}"
    )


def _build_gaps(
    results: list[dict[str, Any]],
    rule_index: dict[str, dict[str, Any]],
    optional: frozenset[str],
) -> list[FieldGap]:
    """Convert SARIF ``run.results`` entries into Lumina field gaps; a rule
    the standard only permits is no gap."""
    gaps: list[FieldGap] = []
    for result in results:
        rule_id = str(result.get("ruleId") or "")
        if not rule_id or rule_id in optional:
            continue
        rule_descriptor = rule_index.get(rule_id)
        message = (result.get("message") or {}).get("text") or rule_id
        gaps.append(
            FieldGap(
                component_id=_component_id(result),
                field_key=_field_key_from_rule(rule_descriptor, rule_id),
                level="missing",
                note=str(message),
            )
        )
    return gaps


class _Counts(NamedTuple):
    """Rule counts of a run; ``optional_*`` are the permission rules."""

    total: int
    present: int
    missing: int
    optional_present: int = 0
    optional_missing: int = 0


def _optional_rule_ids(rule_index: dict[str, dict[str, Any]]) -> frozenset[str]:
    """Ids of the rules the standard only permits (provision ``permission``)."""
    return frozenset(
        rule_id
        for rule_id, rule in rule_index.items()
        if (rule.get("properties") or {}).get("provision") == "permission"
    )


def _count_outcomes(outcomes: dict[str, Any], optional: frozenset[str]) -> _Counts:
    """Return the counts from ``run.properties.ruleOutcomes``.

    Every decided rule (present or missing) counts, sub-rules included, as in
    the checker's own report and the cluster lists: a sub-rule can be decided
    differently from its parent, so neither stands for the other. Rules in
    *optional* are counted apart, not in the first three.
    """
    decided = {k: o for k, o in outcomes.items() if o in ("present", "missing")}
    required = [o for k, o in decided.items() if k not in optional]
    extra = [o for k, o in decided.items() if k in optional]
    missing = required.count("missing")
    optional_missing = extra.count("missing")
    return _Counts(
        len(required),
        len(required) - missing,
        missing,
        len(extra) - optional_missing,
        optional_missing,
    )


def _count_findings(results: list[dict[str, Any]], optional: frozenset[str]) -> _Counts:
    """Return the counts for a run without ``ruleOutcomes``.

    Such a log says only what is missing: the rules that were present are not
    known, so neither they nor the total are counted. A rule in *optional* is
    counted in ``optional_missing``, not in ``missing``.
    """
    ids = {str(r.get("ruleId")) for r in results if r.get("ruleId")}
    return _Counts(0, 0, len(ids - optional), 0, len(ids & optional))


def _judged_by_model(properties: dict[str, Any]) -> str | None:
    """Return ``run.properties.systemJudgedByModel`` when it is a non-empty string."""
    value = properties.get("systemJudgedByModel")
    return value if isinstance(value, str) and value else None


def _cluster_of(rule_id: str) -> str:
    """Return the cluster code of ``BOM-G7AI2026-MDL-006.1`` -> ``MDL``."""
    parts = rule_id.split("-")
    return parts[2].upper() if len(parts) > 3 else ""


_ACRONYMS = {"sbom": "SBOM", "ai": "AI", "url": "URL", "id": "ID"}


def _rule_title(rule: dict[str, Any]) -> str:
    """Name the element a rule checks, not its failure message.

    The checker's short description is a failure message
    (``"Model properties is missing."``); the element is what precedes
    ``" is missing."``. A rule without one falls back to its slug
    (``g7ai-sbom-data-format-version-missing`` -> ``SBOM data format version``).
    """
    short = str((rule.get("shortDescription") or {}).get("text") or "").strip()
    for suffix in (" is missing.", " are missing."):
        if short.endswith(suffix):
            return short[: -len(suffix)]
    slug = str((rule.get("properties") or {}).get("slug") or "")
    parts = slug.split("-")[1:]
    if parts and parts[-1] == "missing":
        parts = parts[:-1]
    if parts:
        text = " ".join(_ACRONYMS.get(part, part) for part in parts)
        return text[0].upper() + text[1:]
    return short


def _build_rule_results(
    outcomes: Any, rule_index: dict[str, dict[str, Any]]
) -> list[RuleResult]:
    """List the outcome of every catalogue rule named in ``ruleOutcomes``.

    Outcomes without a rule descriptor and values outside the known outcome
    vocabulary are skipped, not guessed.
    """
    if not isinstance(outcomes, dict):
        return []
    known: tuple[RuleOutcome, ...] = get_args(RuleOutcome)
    rules: list[RuleResult] = []
    for rule_id, rule in rule_index.items():
        outcome = next((k for k in known if k == outcomes.get(rule_id)), None)
        if outcome is None:
            continue
        props = rule.get("properties") or {}
        rules.append(
            RuleResult(
                rule_id=rule_id,
                cluster=_cluster_of(rule_id),
                title=_rule_title(rule),
                provision=str(props.get("provision") or ""),
                outcome=outcome,
            )
        )
    return rules


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
    standard_id = _infer_standard_id(standard_hint, _all_rule_ids(run, rule_index))

    results = run.get("results") or []
    outcomes = properties.get("ruleOutcomes")
    if not _notifications_from_invocations(run)[1]:
        # The checker could not read the SBOM: its per-rule "missing" results
        # are not findings, so none is reported.
        return ConformanceResult.nothing_checked(standard_id, source)
    optional = _optional_rule_ids(rule_index)
    counts = (
        _count_outcomes(outcomes, optional)
        if isinstance(outcomes, dict)
        else _count_findings(results, optional)
    )
    return ConformanceResult(
        standard_id=standard_id,
        source=source,
        total=counts.total,
        present=counts.present,
        missing=counts.missing,
        unverified=0,
        optional_present=counts.optional_present,
        optional_missing=counts.optional_missing,
        gaps=_build_gaps(results, rule_index, optional),
        rules=_build_rule_results(outcomes, rule_index),
        system_judged_by_model=_judged_by_model(properties),
    )


def _build_check_run(run: dict[str, Any], driver: dict[str, Any]) -> CheckRun:
    """Build the ``CheckRun`` portion of a parsed SARIF run."""
    notifications, execution_successful = _notifications_from_invocations(run)
    properties = run.get("properties") or {}
    if "ruleOutcomes" not in properties and run.get("results"):
        notifications.append(
            Notification(
                level="warning",
                message="The SARIF log has no rule outcomes: only what is "
                "missing is known, so the present rules are not counted.",
                descriptor_id="sarif.no-rule-outcomes",
            )
        )
    return CheckRun(
        tool_name=str(driver.get("name") or ""),
        tool_version=str(driver.get("version") or ""),
        execution_successful=execution_successful,
        notifications=notifications,
    )


def parse_sarif(sarif: dict[str, Any]) -> SbomCheckResponse:
    """Parse a SARIF 2.1.0 log dict into a Lumina :class:`SbomCheckResponse`.

    Raises:
        SarifIngestError: the log is not usable SARIF 2.1.0, is malformed
            (a field of the wrong type) or names an unsupported standard.
    """
    try:
        return _parse(sarif)
    except SarifIngestError:
        raise
    except (AttributeError, TypeError, KeyError, ValueError) as exc:
        raise SarifIngestError(f"Malformed SARIF log ({type(exc).__name__})") from exc


def _parse(sarif: dict[str, Any]) -> SbomCheckResponse:
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

    check_run = _build_check_run(run, driver)
    if len(runs) > 1:
        check_run.notifications.append(
            Notification(
                level="warning",
                message=f"The SARIF log has {len(runs)} runs: only the first "
                "is shown.",
                descriptor_id="sarif.extra-runs-ignored",
            )
        )
    embedded = _embedded_sbom(run)
    return SbomCheckResponse(
        conformance=_build_conformance_result(run, driver, rule_index),
        run=check_run,
        embedded_sbom=embedded,
        sbom=_embedded_source(embedded),
    )
