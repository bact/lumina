# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""
Lumina conformance checking engine.

ConformanceEngine routes each regulation to the right checker and
normalises the result into a single ConformanceResult schema.  The
API and UI consume only this schema, so upgrading to a new external
checker is a one-line change in CHECKER_MAP -- nothing else needs
touching.

Current routing (see docs/design.md for rationale):
    ntia  → NtiaCheckerAdapter   (wraps ntia-conformance-checker)
    bsi   → LuminaInternalChecker (fallback until checker adds BSI support)
    g7ai  → LuminaInternalChecker (fallback until checker adds G7 AI support)
    mof   → LuminaInternalChecker (fallback until checker adds MOF support)
"""

from __future__ import annotations

import abc
from typing import Literal

from pydantic import BaseModel


# ── Output schema ─────────────────────────────────────────────────────────

RegulationId = Literal["ntia", "bsi", "g7ai", "mof"]
FieldLevel = Literal["missing", "unverified"]
CheckerSource = Literal["ntia-conformance-checker", "lumina-internal"]


class FieldGap(BaseModel):
    component_id: str
    field_key: str
    level: FieldLevel
    note: str


class ConformanceResult(BaseModel):
    regulation_id: RegulationId
    source: CheckerSource
    total: int
    present: int
    missing: int
    unverified: int
    gaps: list[FieldGap]


# ── Checker protocol ──────────────────────────────────────────────────────


class ConformanceChecker(abc.ABC):
    @abc.abstractmethod
    def check(self, sbom_path: str) -> ConformanceResult:
        """Parse *sbom_path* and return a ConformanceResult."""


# ── NtiaCheckerAdapter ────────────────────────────────────────────────────


class NtiaCheckerAdapter(ConformanceChecker):
    """
    Wraps ntia-conformance-checker and normalises its output into
    ConformanceResult.

    ntia-conformance-checker docs:
      https://github.com/spdx/ntia-conformance-checker
    """

    def check(self, sbom_path: str) -> ConformanceResult:
        from ntia_conformance_checker.main import SbomChecker  # type: ignore

        # SbomChecker is a factory; passing compliance="ntia" returns NTIAChecker.
        # All checks run during __init__ -- no separate run_all_checks() call needed.
        checker = SbomChecker(sbom_path, compliance="ntia")

        gaps: list[FieldGap] = []

        # Component-level gaps (each entry is (component_name, spdx_id))
        _component_fields: list[tuple[str, list[tuple[str, str]]]] = [
            ("name", checker.components_without_names),
            ("version", checker.components_without_versions),
            ("identifier", checker.components_without_identifiers),
            ("supplier", checker.components_without_suppliers),
        ]
        for field_key, missing_list in _component_fields:
            for comp_name, comp_id in missing_list:
                gaps.append(
                    FieldGap(
                        component_id=comp_id,
                        field_key=field_key,
                        level="missing",
                        note=f"Component '{comp_name}' is missing a {field_key}.",
                    )
                )

        # Document-level gaps
        _doc_fields: list[tuple[str, bool, str]] = [
            ("author", checker.doc_author, "SBOM document is missing an author."),
            (
                "timestamp",
                checker.doc_timestamp,
                "SBOM document is missing a creation timestamp.",
            ),
            (
                "dependency_relationships",
                checker.dependency_relationships,
                "SBOM document declares no dependency relationships.",
            ),
        ]
        for field_key, present, note in _doc_fields:
            if not present:
                gaps.append(
                    FieldGap(
                        component_id="document",
                        field_key=field_key,
                        level="missing",
                        note=note,
                    )
                )

        # table_elements holds the 7 NTIA category results as (label, passed) pairs.
        total = len(checker.table_elements)
        present = sum(1 for _, ok in checker.table_elements if ok)

        return ConformanceResult(
            regulation_id="ntia",
            source="ntia-conformance-checker",
            total=total,
            present=present,
            missing=total - present,
            unverified=0,
            gaps=gaps,
        )


# ── LuminaInternalChecker ─────────────────────────────────────────────────


class LuminaInternalChecker(ConformanceChecker):
    """
    Lumina's own field-level checker -- fallback for regulations that
    ntia-conformance-checker does not yet support (BSI, G7 AI, MOF).

    Mirrors the field-level logic in frontend/data.js.
    When ntia-conformance-checker adds support for a regulation, update
    CHECKER_MAP to point that key at NtiaCheckerAdapter and retire the
    corresponding branch here.
    """

    def __init__(self, regulation_id: RegulationId) -> None:
        self._regulation_id = regulation_id

    def check(self, sbom_path: str) -> ConformanceResult:
        raise NotImplementedError(
            f"LuminaInternalChecker for '{self._regulation_id}' is not yet implemented. "
            "Port field definitions and regSummary() logic from frontend/data.js."
        )


# ── Engine ────────────────────────────────────────────────────────────────

# Update this map when ntia-conformance-checker adds support for a regulation.
# NtiaCheckerAdapter is stateless, so a single instance is safe to reuse.
_ntia_adapter = NtiaCheckerAdapter()

CHECKER_MAP: dict[RegulationId, ConformanceChecker] = {
    "ntia": _ntia_adapter,
    "bsi": LuminaInternalChecker("bsi"),
    "g7ai": LuminaInternalChecker("g7ai"),
    "mof": LuminaInternalChecker("mof"),
}


class ConformanceEngine:
    def check(self, sbom_path: str, regulation_id: RegulationId) -> ConformanceResult:
        checker = CHECKER_MAP[regulation_id]
        return checker.check(sbom_path)
