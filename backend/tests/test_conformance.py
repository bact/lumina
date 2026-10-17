# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for run_checker: Lumina runs ntia-conformance-checker and parses its SARIF."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.conformance import CHECKER_STANDARDS, run_checker

_SBOMS = os.path.join(os.path.dirname(__file__), "fixtures", "sbom")
SPDX2 = os.path.join(_SBOMS, "spdx2_missing_supplier.spdx.json")
SPDX3_G7 = os.path.join(_SBOMS, "spdx3_g7ai.json")


def test_ntia_on_spdx2_reports_the_missing_supplier() -> None:
    conf = run_checker(SPDX2, "ntia").conformance
    assert (conf.regulation_id, conf.source) == ("ntia", "ntia-conformance-checker")
    assert {g.field_key for g in conf.gaps} == {"supplier"}
    assert conf.missing == 1


def test_g7ai_on_spdx3_detects_the_format() -> None:
    # An SPDX 3 file would read as SPDX 2 (all rules not applicable) without detection.
    conf = run_checker(SPDX3_G7, "g7ai").conformance
    assert conf.regulation_id == "g7ai"
    assert (conf.total, conf.missing, conf.gaps) == (39, 0, [])


def test_g7ai_on_spdx2_has_nothing_to_check() -> None:
    response = run_checker(SPDX2, "g7ai")
    assert response.conformance.total == 0
    notes = {n.descriptor_id for n in response.run.notifications}
    assert "sbom.nothing-applies" in notes


def test_bsi_gives_a_run_without_rule_results() -> None:
    response = run_checker(SPDX3_G7, "bsi")
    assert response.conformance.regulation_id == "bsi"
    assert response.conformance.gaps == []


def test_unsupported_regulation() -> None:
    assert "mof" not in CHECKER_STANDARDS
    with pytest.raises(NotImplementedError, match="mof"):
        run_checker(SPDX2, "mof")


def test_unreadable_sbom(tmp_path: Path) -> None:
    path = tmp_path / "not-an-sbom.json"
    path.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match="SBOM format"):
        run_checker(str(path), "ntia")
