# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for SARIF 2.1.0 ingestion into SbomCheckResponse."""

from __future__ import annotations

import json
import os
from typing import Any

import pytest

from app.sarif_ingest import SarifIngestError, _rule_title, parse_sarif

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "sarif")


def _load(name: str) -> dict[str, Any]:
    """load."""
    with open(os.path.join(_FIXTURES, name), encoding="utf-8") as f:
        result: dict[str, Any] = json.load(f)
        return result


def test_conformant_log_no_gaps() -> None:
    """A clean SARIF log yields zero gaps and full present/total counts."""
    response = parse_sarif(_load("conformant.sarif.json"))
    conf = response.conformance
    assert conf.regulation_id == "ntia"
    assert conf.source == "ntia-conformance-checker"
    assert conf.missing == 0
    assert conf.gaps == []
    assert conf.total == 7
    assert conf.present == 7
    # CheckRun: clean run, no notifications.
    assert response.run.tool_name == "ntia-conformance-checker"
    assert response.run.tool_version == "5.0.2"
    assert response.run.execution_successful is True
    assert response.run.notifications == []


def test_component_level_missing_supplier() -> None:
    """A component-level missing-supplier finding maps to two field gaps."""
    response = parse_sarif(_load("missing_supplier.sarif.json"))
    conf = response.conformance
    assert conf.missing == 1
    assert conf.present == 6
    assert conf.total == 7
    assert len(conf.gaps) == 2
    assert {g.component_id for g in conf.gaps} == {"SPDXRef-Package", "SPDXRef-Saxon"}
    assert all(g.field_key == "supplier" for g in conf.gaps)


def test_document_level_missing_author() -> None:
    """A document-level finding is attributed to the "document" component id."""
    response = parse_sarif(_load("missing_document_author.sarif.json"))
    gaps = response.conformance.gaps
    assert len(gaps) == 1
    assert gaps[0].component_id == "document"
    assert gaps[0].field_key == "author"


def test_third_party_tool_tagged_external_sarif() -> None:
    """A non-ntia-conformance-checker producer is tagged as external-sarif."""
    response = parse_sarif(_load("third_party_tool.sarif.json"))
    assert response.conformance.source == "external-sarif"
    assert response.run.tool_name == "some-other-checker"
    assert response.run.tool_version == "1.0.0"


def test_parse_warnings_surface_as_notifications() -> None:
    """SPDX parser warnings pass through as CheckRun notifications, not gaps."""
    response = parse_sarif(_load("with_parse_warning.sarif.json"))
    # Conformance side: clean (no results in fixture).
    assert response.conformance.gaps == []
    # CheckRun side: two SPDX validation warnings carried through.
    assert response.run.execution_successful is True
    assert len(response.run.notifications) == 2
    n = response.run.notifications[0]
    assert n.level == "warning"
    assert n.descriptor_id == "spdx.validation-message"
    assert "deprecated format" in n.message


def test_rejects_wrong_version() -> None:
    """Any SARIF version other than 2.1.0 is rejected."""
    bad = _load("conformant.sarif.json")
    bad["version"] = "1.0"
    with pytest.raises(SarifIngestError, match="Unsupported SARIF version"):
        parse_sarif(bad)


def test_rejects_no_runs() -> None:
    """A SARIF log with an empty ``runs`` array is rejected."""
    with pytest.raises(SarifIngestError, match="no runs"):
        parse_sarif({"version": "2.1.0", "runs": []})


def test_rejects_non_dict() -> None:
    """A non-dict SARIF payload is rejected."""
    with pytest.raises(SarifIngestError):
        parse_sarif("not a sarif log")  # type: ignore[arg-type]


def test_embedded_sbom_absent_by_default() -> None:
    """When the producer links the artifact by URI only, embedded_sbom is None."""
    response = parse_sarif(_load("conformant.sarif.json"))
    assert response.embedded_sbom is None


def test_embedded_sbom_text_round_trip() -> None:
    """``artifact.contents.text`` is surfaced verbatim on the response envelope."""
    log = _load("conformant.sarif.json")
    # Inject an embedded SBOM into the log.
    log["runs"][0]["artifacts"] = [
        {
            "location": {"uri": "test.spdx.json"},
            "mimeType": "application/spdx+json",
            "contents": {"text": '{"name": "stub"}'},
        }
    ]
    response = parse_sarif(log)
    assert response.embedded_sbom is not None
    assert response.embedded_sbom.uri == "test.spdx.json"
    assert response.embedded_sbom.mime_type == "application/spdx+json"
    assert response.embedded_sbom.text == '{"name": "stub"}'
    assert response.embedded_sbom.binary_base64 is None


def test_embedded_sbom_binary_round_trip() -> None:
    """``artifact.contents.binary`` is preserved as base64 string."""
    log = _load("conformant.sarif.json")
    log["runs"][0]["artifacts"] = [
        {
            "location": {"uri": "blob.bin"},
            "mimeType": "application/octet-stream",
            "contents": {"binary": "aGVsbG8="},
        }
    ]
    response = parse_sarif(log)
    assert response.embedded_sbom is not None
    assert response.embedded_sbom.binary_base64 == "aGVsbG8="
    assert response.embedded_sbom.text is None


def test_ontology_rule_ids_identify_the_standard() -> None:
    """Ontology rule ids identify the standard."""
    log = _load("ntia_ontology_ids.sarif.json")
    del log["runs"][0]["properties"]["complianceStandard"]  # fall back to the id
    conf = parse_sarif(log).conformance
    assert conf.regulation_id == "ntia"
    assert conf.source == "ntia-conformance-checker"
    assert {g.field_key for g in conf.gaps} == {"supplier"}


def test_counts_follow_rule_outcomes() -> None:
    """Decided top-level rules only: sub-rules and not-applicable rules are out."""
    conf = parse_sarif(_load("g7ai_missing_model_info.sarif.json")).conformance
    assert conf.regulation_id == "g7ai"
    assert (conf.total, conf.present, conf.missing) == (39, 36, 3)
    assert {g.field_key for g in conf.gaps} == {
        "model_hash_algorithm_missing",
        "model_hash_value_missing",
        "model_prop_missing",
    }


def test_nothing_applies_is_all_not_applicable() -> None:
    """Nothing applies is all not applicable."""
    log = _load("g7ai_missing_model_info.sarif.json")
    run = log["runs"][0]
    run["results"] = []
    run["properties"]["ruleOutcomes"] = {
        rule_id: "not-applicable" for rule_id in run["properties"]["ruleOutcomes"]
    }
    conf = parse_sarif(log).conformance
    assert (conf.total, conf.present, conf.missing) == (0, 0, 0)


def _rule_log() -> dict[str, Any]:
    """rule log."""
    log = _load("g7ai_missing_model_info.sarif.json")
    run = log["runs"][0]
    run["properties"]["systemJudgedByModel"] = "m"
    return log


def test_rule_results_carry_cluster_title_and_outcome() -> None:
    """Rule results carry cluster title and outcome."""
    conf = parse_sarif(_rule_log()).conformance
    by_id = {r.rule_id: r for r in conf.rules}
    outcomes = _rule_log()["runs"][0]["properties"]["ruleOutcomes"]
    assert conf.rules and set(by_id) <= set(outcomes)
    for rule in conf.rules:
        assert rule.outcome == outcomes[rule.rule_id]
        assert rule.cluster == rule.rule_id.split("-")[2]
    assert {r.outcome for r in conf.rules} >= {"present", "missing"}
    assert all(r.title and not r.title.endswith("missing.") for r in conf.rules)


@pytest.mark.parametrize(
    ("value", "expected"),
    [("m", "m"), (None, None), ("", None), (3, None), (["m"], None)],
)
def test_system_judged_by_model_only_when_a_name(
    value: object, expected: str | None
) -> None:
    """System judged by model only when a name."""
    log = _rule_log()
    log["runs"][0]["properties"]["systemJudgedByModel"] = value
    assert parse_sarif(log).conformance.system_judged_by_model == expected


@pytest.mark.parametrize("outcomes", [None, "x", ["present"], {}])
def test_no_usable_rule_outcomes_gives_no_rules(outcomes: object) -> None:
    """No usable rule outcomes gives no rules."""
    log = _rule_log()
    log["runs"][0]["properties"]["ruleOutcomes"] = outcomes
    assert parse_sarif(log).conformance.rules == []


def test_unknown_outcome_value_is_skipped_not_guessed() -> None:
    """Unknown outcome value is skipped not guessed."""
    log = _rule_log()
    props = log["runs"][0]["properties"]["ruleOutcomes"]
    victim = next(iter(props))
    props[victim] = "maybe"
    assert victim not in {r.rule_id for r in parse_sarif(log).conformance.rules}


@pytest.mark.parametrize(
    ("rule", "title"),
    [
        (
            {"properties": {"slug": "g7ai-sbom-data-format-version-missing"}},
            "SBOM data format version",
        ),
        ({"properties": {"slug": "g7ai-model-name"}}, "Model name"),
        ({"properties": {"slug": "g7ai-ai-model-url-missing"}}, "AI model URL"),
        (
            {
                "properties": {"slug": "g7ai-missing"},
                "shortDescription": {"text": "T."},
            },
            "T.",
        ),
        ({"shortDescription": {"text": "No slug."}}, "No slug."),
        ({}, ""),
    ],
)
def test_rule_title_names_the_element_not_the_failure(
    rule: dict[str, Any], title: str
) -> None:
    """Rule title names the element not the failure."""
    assert _rule_title(rule) == title
