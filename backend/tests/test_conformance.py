# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for run_checker: Lumina runs ntia-conformance-checker and parses its SARIF."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from ntia_conformance_checker.registry import get_spec

from app.conformance import (
    CHECKER_STANDARDS,
    run_checker,
)

_SBOMS = os.path.join(os.path.dirname(__file__), "fixtures", "sbom")
SPDX2 = os.path.join(_SBOMS, "spdx2_missing_supplier.spdx.json")
SPDX3_G7 = os.path.join(_SBOMS, "spdx3_g7ai.json")
SPDX21 = os.path.join(_SBOMS, "spdx21_minimal.spdx")


def test_ntia_on_spdx2_reports_the_missing_supplier() -> None:
    """NTIA on an SPDX 2 SBOM reports the missing supplier."""
    conf = run_checker(SPDX2, "ntia").conformance
    assert (conf.regulation_id, conf.source) == ("ntia", "ntia-conformance-checker")
    assert {g.field_key for g in conf.gaps} == {"supplier"}
    assert conf.missing == 1


def test_g7ai_on_spdx3_detects_the_format() -> None:
    """An SPDX 3 file is read as SPDX 3.

    Read as SPDX 2 (the checker's default), every rule would be not applicable.
    """
    conf = run_checker(SPDX3_G7, "g7ai").conformance
    assert conf.regulation_id == "g7ai"
    assert (conf.total, conf.missing, conf.gaps) == (56, 1, [])


def test_g7ai_on_spdx2_has_nothing_to_check() -> None:
    """G7 AI on an SPDX 2 SBOM checks nothing and says so."""
    response = run_checker(SPDX2, "g7ai")
    assert response.conformance.total == 0
    notes = {n.descriptor_id for n in response.run.notifications}
    assert "sbom.nothing-applies" in notes


def test_bsi_reports_its_rules_per_requirement() -> None:
    """BSI is rule-based: clusters DOC and COMP, provisions passed through."""
    conf = run_checker(SPDX3_G7, "bsi").conformance
    assert conf.regulation_id == "bsi"
    assert len(conf.rules) == len(get_spec("bsi").rules)
    assert {r.cluster for r in conf.rules} == {"DOC", "COMP"}
    assert {r.provision for r in conf.rules} == {"requirement", "permission"}
    assert "out-of-scope" in {r.outcome for r in conf.rules}
    # A permission (BSI "optional") is counted apart: lacking it is no gap.
    required = [r for r in conf.rules if r.provision != "permission"]
    optional = [r for r in conf.rules if r.provision == "permission"]
    assert conf.missing == sum(r.outcome == "missing" for r in required)
    assert conf.optional_missing == sum(r.outcome == "missing" for r in optional)
    assert conf.optional_present == sum(r.outcome == "present" for r in optional)
    assert conf.optional_missing > 0  # the fixture really lacks one


def test_spdx21_is_still_checked() -> None:
    """An SPDX 2.1 SBOM is still checked."""
    conf = run_checker(SPDX21, "ntia").conformance
    assert conf.total == 7


def test_unsupported_regulation() -> None:
    """MOF has no checker standard and is refused."""
    assert "mof" not in CHECKER_STANDARDS
    with pytest.raises(NotImplementedError, match="mof"):
        run_checker(SPDX2, "mof")


def test_unreadable_sbom(tmp_path: Path) -> None:
    """A file with no SPDX version is refused with ValueError."""
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
