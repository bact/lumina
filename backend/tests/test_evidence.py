# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for per-rule evidence in an SPDX 3 JSON SBOM."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import pytest

from app import evidence
from app.conformance import (
    CHECKER_STANDARDS,
    EvidenceItem,
    RegulationId,
    RuleResult,
    SbomCheckResponse,
    run_checker,
)
from app.evidence import rules
from app.sbom_source import load_sbom

ROOT = Path(__file__).parent
SBOM_DIR = ROOT / "fixtures" / "sbom"
DEMO = ROOT.parent.parent / "demo" / "phi-tiny-random.spdx3.json"
SPDX3 = [DEMO, *sorted(SBOM_DIR.glob("spdx3_*.json"))]
SPDX3_CONTEXT = "https://spdx.org/rdf/3.0.1/spdx-context.jsonld"


def _check(path: Path, regulation: RegulationId) -> SbomCheckResponse:
    loaded = load_sbom(path.name, path.read_text(encoding="utf-8"))
    return run_checker(str(path), regulation, loaded)


def _rules(response: SbomCheckResponse) -> dict[str, RuleResult]:
    return {r.rule_id: r for r in response.conformance.rules}


def _points_at(line: str, item: EvidenceItem) -> bool:
    """Whether a display line shows the item: its key, the start of its value
    (``sha256: ...``, ``key=value``) or the element id it names."""
    named = re.search(r"\(([^()]+)\)$", item.value)
    candidates = {
        item.key,
        item.value.split(":")[0],
        item.value.split("=")[0],
        named.group(1) if named else item.value,
    }
    return any(c and c in line for c in candidates)


@pytest.fixture(name="g7_demo", scope="module")
def g7_demo_fixture() -> dict[str, RuleResult]:
    """The G7 AI rules of the demo SBOM, with evidence."""
    return _rules(_check(DEMO, "g7ai"))


@pytest.mark.parametrize(
    ("rule_id", "status", "element_type", "keys"),
    [
        ("BOM-G7AI2026-SLP-001", "found", "ai_AIPackage", ["name"]),
        ("BOM-G7AI2026-MDL-003", "absent", "ai_AIPackage", []),
        ("BOM-G7AI2026-MDL-012", "absent", "ai_AIPackage", []),
        ("BOM-G7AI2026-MDL-002", "found", "ai_AIPackage", ["software_packageUrl"]),
        ("BOM-G7AI2026-MDL-007", "found", "ai_AIPackage", ["verifiedUsing"] * 2),
        ("BOM-G7AI2026-MDL-009", "found", "ai_AIPackage", ["ai_hyperparameter"]),
        ("BOM-G7AI2026-MD-009", "found", "CreationInfo", ["created"]),
        ("BOM-G7AI2026-MD-008", "found", "software_Sbom", ["software_sbomType"]),
        ("BOM-G7AI2026-MD-010", "absent", "SpdxDocument", []),
    ],
)
def test_g7_demo_evidence(
    g7_demo: dict[str, RuleResult],
    rule_id: str,
    status: str,
    element_type: str,
    keys: list[str],
) -> None:
    """System name, model version, licence, hash, roll-up and document rules
    point at the right element and properties of the demo SBOM."""
    (entry,) = g7_demo[rule_id].evidence
    assert (entry.status, entry.element_type) == (status, element_type)
    assert [i.key for i in entry.items] == keys
    assert g7_demo[rule_id].evidence_more == 0


def test_hash_evidence_points_at_each_hash(g7_demo: dict[str, RuleResult]) -> None:
    """Both hashes of the model are shown, each on its own algorithm line."""
    lines = _check(DEMO, "g7ai").sbom
    assert lines is not None
    display = lines.display.split("\n")
    items = g7_demo["BOM-G7AI2026-MDL-007"].evidence[0].items
    assert [i.value.split(":")[0] for i in items] == ["sha256", "sha512"]
    for item, algorithm in zip(items, ("sha256", "sha512"), strict=True):
        assert display[item.line - 1].strip() == f'"algorithm": "{algorithm}",'


def test_not_decided_rules_have_no_evidence(g7_demo: dict[str, RuleResult]) -> None:
    """Out-of-scope and not-applicable rules carry no evidence."""
    undecided = [
        r for r in g7_demo.values() if r.outcome in ("out-of-scope", "not-applicable")
    ]
    assert undecided
    assert all(not r.evidence for r in undecided)


@pytest.mark.parametrize("regulation", sorted(CHECKER_STANDARDS))
@pytest.mark.parametrize("path", SPDX3, ids=lambda p: p.name)
def test_every_decided_rule_has_evidence_that_points_at_the_sbom(
    path: Path, regulation: RegulationId
) -> None:
    """On every SPDX 3 fixture and standard: every present rule has found
    evidence, every missing rule absent evidence first, and every line points
    at its element or item in the display."""
    response = _check(path, regulation)
    assert response.sbom is not None
    lines = response.sbom.display.split("\n")
    for rule in response.conformance.rules:
        statuses = [e.status for e in rule.evidence]
        if rule.outcome == "present":
            assert set(statuses) == {"found"}, rule.rule_id
        elif rule.outcome == "missing":
            assert statuses[0] == "absent", rule.rule_id
        for entry in rule.evidence:
            assert lines[entry.line - 1].strip() == "{"
            span = "\n".join(lines[entry.line - 1 : entry.end_line])
            assert json.dumps(entry.element_id) in span
            assert bool(entry.items) == (entry.status == "found"), rule.rule_id
            for item in entry.items:
                assert len(item.value) <= 160 and "\n" not in item.value
                assert _points_at(lines[item.line - 1], item), (rule.rule_id, item)


def test_ntia_evidence_on_an_spdx3_sbom() -> None:
    """NTIA: components without an identifier are absent, the others found
    with their package URL; dependencies point at the relationships."""
    found = _rules(_check(SBOM_DIR / "spdx3_g7ai.json", "ntia"))
    identifiers = found["BOM-NTIA2021-DF-004"].evidence
    assert [(e.status, e.element_name) for e in identifiers] == [
        ("absent", "Test AI System"),
        ("absent", "resize-tool"),
        ("found", "Test AI Model"),
        ("found", "Test Training Dataset"),
    ]
    assert identifiers[2].items[0].key == "software_packageUrl"
    dependencies = found["BOM-NTIA2021-DF-005"].evidence
    assert {e.element_type for e in dependencies} == {"Relationship"}


_BSI_OK = "spdx3_bsi_compliant.json"
_NO_CREATOR = "spdx3_bsi_missing_creator.json"


@pytest.mark.parametrize(
    ("path", "regulation", "rule_id", "element_type", "key"),
    [
        (_BSI_OK, "bsi", "BOM-BSI2025-DOC-001", "CreationInfo", "createdBy"),
        (_BSI_OK, "bsi", "BOM-BSI2025-COMP-007", "software_Package", "verifiedUsing"),
        (_BSI_OK, "bsi", "BOM-BSI2025-COMP-012", "software_Package", "externalRef"),
        (_BSI_OK, "bsi", "BOM-BSI2025-COMP-014", "software_Package", "hasDeclaredLicense"),
        (_NO_CREATOR, "cisa2026", "BOM-CISA2026-META-007", "CreationInfo", None),
        (_NO_CREATOR, "cisa2026", "BOM-CISA2026-META-005", "SpdxDocument", None),
    ],
    ids=["contact", "hash-via", "download-via", "licence", "tool-absent", "type-absent"],
)
def test_bsi_and_cisa_evidence(
    path: str, regulation: RegulationId, rule_id: str, element_type: str, key: str | None
) -> None:
    """BSI contacts, hashes and downloads through a distribution artefact and
    licences; CISA document-level gaps on the creation info or document."""
    (entry,) = _rules(_check(SBOM_DIR / path, regulation))[rule_id].evidence
    assert entry.element_type == element_type
    assert [i.key for i in entry.items] == ([key] if key else [])
    assert entry.status == ("found" if key else "absent")


def test_spdx2_and_non_json_get_the_source_but_no_evidence() -> None:
    """Evidence is for SPDX 3 JSON only; the source is always returned."""
    spdx2 = _check(SBOM_DIR / "spdx2_missing_supplier.spdx.json", "ntia")
    tag_value = _check(SBOM_DIR / "spdx21_minimal.spdx", "ntia")
    assert spdx2.sbom is not None and spdx2.sbom.format == "spdx2-json"
    assert tag_value.sbom is not None and tag_value.sbom.format == "other"
    for response in (spdx2, tag_value):
        assert all(not r.evidence for r in response.conformance.rules)


def _inline_creation_info_sbom(tmp_path: Path) -> Path:
    graph: list[dict[str, Any]] = [
        {
            "type": "SpdxDocument",
            "spdxId": "urn:doc",
            "creationInfo": {
                "type": "CreationInfo",
                "specVersion": "3.0.1",
                "created": "2026-01-01T00:00:00Z",
                "createdBy": ["urn:person"],
            },
            "rootElement": ["urn:pkg"],
        },
        {"type": "Person", "spdxId": "urn:person", "name": "P", "creationInfo": "_:c"},
        {"type": "CreationInfo", "@id": "_:c", "specVersion": "3.0.1",
         "created": "2026-01-01T00:00:00Z", "createdBy": ["urn:person"]},
        {"type": "software_Package", "spdxId": "urn:pkg", "name": "pkg",
         "creationInfo": "_:c"},
    ]  # fmt: skip
    path = tmp_path / "inline.spdx3.json"
    path.write_text(json.dumps({"@context": SPDX3_CONTEXT, "@graph": graph}))
    return path


def test_inline_creation_info_points_inside_the_document(tmp_path: Path) -> None:
    """A creation info written inside the SpdxDocument is found there."""
    response = _check(_inline_creation_info_sbom(tmp_path), "ntia")
    assert response.sbom is not None
    lines = response.sbom.display.split("\n")
    (entry,) = _rules(response)["BOM-NTIA2021-DF-007"].evidence
    assert (entry.status, entry.element_type) == ("found", "SpdxDocument")
    (item,) = entry.items
    assert lines[item.line - 1].strip() == '"created": "2026-01-01T00:00:00Z",'


def _many_packages_sbom(tmp_path: Path, count: int) -> Path:
    graph: list[dict[str, Any]] = [
        {"type": "CreationInfo", "@id": "_:c", "specVersion": "3.0.1",
         "created": "2026-01-01T00:00:00Z", "createdBy": ["urn:person"]},
        {"type": "Person", "spdxId": "urn:person", "name": "P", "creationInfo": "_:c"},
        {"type": "SpdxDocument", "spdxId": "urn:doc", "creationInfo": "_:c",
         "rootElement": ["urn:root"]},
        {"type": "software_Package", "spdxId": "urn:root", "name": "root",
         "software_packageVersion": "1", "creationInfo": "_:c"},
        {"type": "Relationship", "spdxId": "urn:rel", "creationInfo": "_:c",
         "from": "urn:root", "relationshipType": "dependsOn",
         "to": [f"urn:p{i:02d}" for i in range(count)]},
    ]  # fmt: skip
    graph += [
        {"type": "software_Package", "spdxId": f"urn:p{i:02d}", "name": f"p{i:02d}",
         "creationInfo": "_:c"}
        for i in range(count)
    ]  # fmt: skip
    path = tmp_path / "many.spdx3.json"
    path.write_text(json.dumps({"@context": SPDX3_CONTEXT, "@graph": graph}))
    return path


def test_evidence_is_capped_at_20_per_rule(tmp_path: Path) -> None:
    """Absent entries come first; past 20 the rest are counted, not listed."""
    response = _check(_many_packages_sbom(tmp_path, 25), "ntia")
    version = _rules(response)["BOM-NTIA2021-DF-003"]
    assert len(version.evidence) == 20
    assert {e.status for e in version.evidence} == {"absent"}
    assert version.evidence_more == 6  # 25 absent + the root found, minus 20
    name = _rules(response)["BOM-NTIA2021-DF-002"]
    assert (len(name.evidence), name.evidence_more) == (20, 6)


def test_a_failure_is_swallowed_with_one_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Evidence never fails the check: no rule gets evidence, one WARNING."""

    def boom(_self: object) -> None:
        raise KeyError("bad")

    monkeypatch.setattr(rules.EvidencePass, "run", boom)
    with caplog.at_level(logging.WARNING, logger="app.evidence"):
        response = _check(DEMO, "g7ai")
    assert response.conformance.rules
    assert all(not r.evidence for r in response.conformance.rules)
    warnings = [r for r in caplog.records if r.name == "app.evidence"]
    assert [r.getMessage() for r in warnings] == ["Evidence skipped: KeyError: 'bad'"]


def test_evidence_is_skipped_past_its_time_budget(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A pass over its budget leaves every rule without evidence."""
    monkeypatch.setattr(evidence.add_evidence, "__defaults__", (0.0,))
    with caplog.at_level(logging.WARNING, logger="app.evidence"):
        response = _check(DEMO, "g7ai")
    assert all(not r.evidence for r in response.conformance.rules)
    assert "EvidenceTimeout" in caplog.text
