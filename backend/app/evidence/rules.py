# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""The evidence pass over a standard's rules for one checker run.

See also :mod:`app.evidence` (what evidence means) and
:mod:`app.evidence.reader` (the items on an element).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ntia_conformance_checker.model import Finding
from ntia_conformance_checker.model import RuleResult as CheckerRuleResult
from ntia_conformance_checker.probes import lookup
from ntia_conformance_checker.rule_based_checker import RuleBasedChecker
from ntia_conformance_checker.spec import SpecRule

from ..conformance import Evidence, EvidenceItem, EvidenceStatus
from ..sbom_source import GraphElement, GraphIndex
from .carriers import Carrier, carrier, on_creation_info
from .reader import SbomReader

MAX_EVIDENCE = 20
"""Evidence entries per rule; ``RuleResult.evidence_more`` counts the rest."""

_DECIDED = ("present", "missing")
_ROLLUPS = ("any-of", "all-of")

Entry = tuple[GraphElement, EvidenceStatus, list[Carrier]]


class EvidencePass:  # pylint: disable=too-few-public-methods
    """Evidence for every decided rule of *checker*'s standard."""

    def __init__(
        self,
        checker: RuleBasedChecker,
        document: dict[str, Any],
        tick: Callable[[], None],
    ) -> None:
        """*tick* is called often and may raise to stop the pass."""
        self._checker = checker
        self._spec = checker.spec
        self._tick = tick
        self._reader = SbomReader(GraphIndex(document, tick))
        self._results: dict[str, CheckerRuleResult] = {}
        self._kinds: dict[str, list[str]] = {}

    def run(self) -> dict[str, tuple[list[Evidence], int]]:
        """``(evidence, how many more)`` of every decided rule, by rule id."""
        self._results = self._checker.rule_results()
        out: dict[str, tuple[list[Evidence], int]] = {}
        for rule in self._spec.rules:
            self._tick()
            result = self._results.get(self._spec.rule_id(rule))
            if result is not None and result.outcome in _DECIDED:
                out[result.rule_id] = self._rule(rule, result)
        return out

    def _parts(self, rule: SpecRule) -> list[tuple[SpecRule, Carrier]]:
        """The probed rules behind *rule*: itself, or a roll-up's sub-rules."""
        if rule.aggregation in _ROLLUPS:
            subs = [r for r in self._spec.rules if r.parent == rule.slug]
        else:
            subs = [rule]
        return [(r, carrier(r.probe)) for r in subs if r.probe is not None]

    def _rule(
        self, rule: SpecRule, result: CheckerRuleResult
    ) -> tuple[list[Evidence], int]:
        parts = self._parts(rule)
        first: Carrier = parts[0][1] if parts else ("", {})
        entries: dict[str, Entry] = {}
        for finding in result.findings:
            element = self._finding_element(finding, first)
            if element is not None:
                entries.setdefault(element.element_id, (element, "absent", []))
        for part, part_carrier in parts:
            part_result = self._results.get(self._spec.rule_id(part))
            if part_result is None or part_result.outcome not in _DECIDED:
                continue
            for element in self._found(part, part_carrier, part_result):
                entry = entries.setdefault(element.element_id, (element, "found", []))
                if entry[1] == "found":
                    entry[2].append(part_carrier)
        shown = list(entries.values())[:MAX_EVIDENCE]
        return [self._evidence(*e) for e in shown], len(entries) - len(shown)

    def _evidence(
        self, element: GraphElement, status: EvidenceStatus, carriers: list[Carrier]
    ) -> Evidence:
        items: list[EvidenceItem] = []
        for found in carriers:
            items.extend(self._reader.items(element, found))
        return Evidence(
            status=status,
            element_id=element.element_id,
            element_type=element.element_type,
            element_name=element.name,
            line=element.line,
            end_line=element.end_line,
            items=items,
        )

    def _finding_element(
        self, finding: Finding, found: Carrier
    ) -> GraphElement | None:
        """The element a finding is about."""
        index = self._reader.index
        if not finding.is_document_level:
            return index.get(finding.component_id)
        if on_creation_info(found):
            info = self._reader.creation_info()
            return info[0] if info else None
        if found[0] == "sbom_type":
            return next(iter(self._reader.root_sboms()), index.document)
        return index.document

    def _found(
        self, rule: SpecRule, found: Carrier, result: CheckerRuleResult
    ) -> list[GraphElement]:
        """The elements *rule* judged that the checker did not report."""
        kind = found[1].get("kind")
        if kind is None:
            return self._document_found(found) if result.outcome == "present" else []
        failing = {f.component_id for f in result.findings} | self._excluded(rule)
        index = self._reader.index
        elements = (index.get(i) for i in self._judged(kind) if i not in failing)
        return [e for e in elements if e is not None]

    def _judged(self, kind: str) -> list[str]:
        """Ids of the components of *kind* the checker judges, in its order."""
        if kind not in self._kinds:
            self._kinds[kind] = [
                spdx_id
                for _, spdx_id in self._checker.adapter.get_components_of_kind(
                    kind, self._checker.reachable_component_ids
                )
            ]
        return self._kinds[kind]

    def _excluded(self, rule: SpecRule) -> set[str]:
        """Components a conditional rule does not apply to: the findings of
        its ``applies_when`` probe, run as the checker runs it."""
        condition = rule.applies_when
        if condition is None:
            return set()
        return {
            f.component_id
            for f in lookup(condition.name)(self._checker, **condition.params)
        }

    def _document_found(self, found: Carrier) -> list[GraphElement]:
        """Elements carrying a document-level rule that passed; the document
        itself when none can be told."""
        name = found[0]
        index = self._reader.index
        info = self._reader.creation_info()
        holders: list[GraphElement | None] = []
        if name == "require_document_property":
            holders = [index.document, info[0] if info else None]
        elif name == "require_document_contact":
            holders = [info[0] if info else None]
        elif name == "sbom_type":
            holders = list(self._reader.root_sboms())
        elif name == "dependency_relationship":
            return self._reader.dependency_relationships()
        with_items = [
            e
            for e in dict.fromkeys(holders)
            if e is not None and self._reader.items(e, found)
        ]
        if with_items:
            return with_items
        return [index.document] if index.document is not None else []
