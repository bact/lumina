# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for SARIF 2.1.0 ingestion into SbomCheckResponse."""

from __future__ import annotations

import json
import os

import pytest

from app.sarif_ingest import SarifIngestError, parse_sarif

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "sarif")


def _load(name: str) -> dict:
    with open(os.path.join(_FIXTURES, name), encoding="utf-8") as f:
        return json.load(f)


def test_conformant_log_no_gaps() -> None:
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
    response = parse_sarif(_load("missing_supplier.sarif.json"))
    conf = response.conformance
    assert conf.missing == 1
    assert conf.present == 6
    assert conf.total == 7
    assert len(conf.gaps) == 2
    assert {g.component_id for g in conf.gaps} == {"SPDXRef-Package", "SPDXRef-Saxon"}
    assert all(g.field_key == "supplier" for g in conf.gaps)


def test_document_level_missing_author() -> None:
    response = parse_sarif(_load("missing_document_author.sarif.json"))
    gaps = response.conformance.gaps
    assert len(gaps) == 1
    assert gaps[0].component_id == "document"
    assert gaps[0].field_key == "author"


def test_third_party_tool_tagged_external_sarif() -> None:
    response = parse_sarif(_load("third_party_tool.sarif.json"))
    assert response.conformance.source == "external-sarif"
    assert response.run.tool_name == "some-other-checker"
    assert response.run.tool_version == "1.0.0"


def test_parse_warnings_surface_as_notifications() -> None:
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
    bad = _load("conformant.sarif.json")
    bad["version"] = "1.0"
    with pytest.raises(SarifIngestError, match="Unsupported SARIF version"):
        parse_sarif(bad)


def test_rejects_no_runs() -> None:
    with pytest.raises(SarifIngestError, match="no runs"):
        parse_sarif({"version": "2.1.0", "runs": []})


def test_rejects_non_dict() -> None:
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
