# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for run_checker: Lumina runs ntia-conformance-checker and parses its SARIF."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.conformance import (
    CHECKER_STANDARDS,
    Notification,
    SbomCheckResponse,
    run_checker,
)

_SBOMS = os.path.join(os.path.dirname(__file__), "fixtures", "sbom")
SPDX2 = os.path.join(_SBOMS, "spdx2_missing_supplier.spdx.json")
SPDX3_G7 = os.path.join(_SBOMS, "spdx3_g7ai.json")
SPDX21 = os.path.join(_SBOMS, "spdx21_minimal.spdx")
BSI_OK = os.path.join(_SBOMS, "spdx3_bsi_compliant.json")
BSI_MISSING_CREATOR = os.path.join(_SBOMS, "spdx3_bsi_missing_creator.json")


def test_ntia_on_spdx2_reports_the_missing_supplier() -> None:
    """Ntia on spdx2 reports the missing supplier."""
    conf = run_checker(SPDX2, "ntia").conformance
    assert (conf.regulation_id, conf.source) == ("ntia", "ntia-conformance-checker")
    assert {g.field_key for g in conf.gaps} == {"supplier"}
    assert conf.missing == 1


def test_g7ai_on_spdx3_detects_the_format() -> None:
    # An SPDX 3 file would read as SPDX 2 (all rules not applicable) without detection.
    """G7ai on spdx3 detects the format."""
    conf = run_checker(SPDX3_G7, "g7ai").conformance
    assert conf.regulation_id == "g7ai"
    assert (conf.total, conf.missing, conf.gaps) == (56, 1, [])


def test_g7ai_on_spdx2_has_nothing_to_check() -> None:
    """G7ai on spdx2 has nothing to check."""
    response = run_checker(SPDX2, "g7ai")
    assert response.conformance.total == 0
    notes = {n.descriptor_id for n in response.run.notifications}
    assert "sbom.nothing-applies" in notes


def _verdict(response: SbomCheckResponse) -> Notification:
    """verdict."""
    (note,) = [
        n for n in response.run.notifications if n.descriptor_id == "sbom.verdict"
    ]
    return note


def test_bsi_reports_its_verdict_as_a_notification() -> None:
    # BSI has no per-requirement results; the verdict is all the log carries.
    """Bsi reports its verdict as a notification."""
    ok = run_checker(BSI_OK, "bsi")
    bad = run_checker(BSI_MISSING_CREATOR, "bsi")
    assert ok.conformance.gaps == bad.conformance.gaps == []
    assert (_verdict(ok).level, _verdict(bad).level) == ("note", "error")


def test_spdx21_is_still_checked() -> None:
    """Spdx21 is still checked."""
    conf = run_checker(SPDX21, "ntia").conformance
    assert conf.total == 7


def test_unsupported_regulation() -> None:
    """Unsupported regulation."""
    assert "mof" not in CHECKER_STANDARDS
    with pytest.raises(NotImplementedError, match="mof"):
        run_checker(SPDX2, "mof")


def test_unreadable_sbom(tmp_path: Path) -> None:
    """Unreadable sbom."""
    path = tmp_path / "not-an-sbom.json"
    path.write_text("{}", encoding="utf-8")
    with pytest.raises(ValueError, match="SPDX version"):
        run_checker(str(path), "ntia")


def test_g7ai_reports_every_rule_with_catalogue_only_ones_out_of_scope() -> None:
    """All 81 rules carry an outcome; catalogue-only ones are out-of-scope."""
    conf = run_checker(SPDX3_G7, "g7ai").conformance
    outcomes = {r.outcome for r in conf.rules}
    assert len(conf.rules) == 81
    assert outcomes <= {"present", "missing", "not-applicable", "out-of-scope"}
    assert "out-of-scope" in outcomes
    assert conf.missing == sum(r.outcome == "missing" for r in conf.rules)


def test_cisa2026_reports_its_rules_in_three_clusters() -> None:
    """CISA 2026 is a regulation of its own, not NTIA."""
    conf = run_checker(SPDX3_G7, "cisa2026").conformance
    assert conf.regulation_id == "cisa2026"
    assert len(conf.rules) == 23
    assert {r.cluster for r in conf.rules} == {"META", "COMP", "PP"}
    assert {r.outcome for r in conf.rules if r.cluster == "PP"} == {"out-of-scope"}


def test_fsct2024_reports_its_rules_and_is_not_ntia() -> None:
    """FSCT 2024 is a regulation of its own."""
    conf = run_checker(SPDX3_G7, "fsct2024").conformance
    assert conf.regulation_id == "fsct2024"
    assert len(conf.rules) == 13
    assert {r.cluster for r in conf.rules} == {"META", "COMP"}
