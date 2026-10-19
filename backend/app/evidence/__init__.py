# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Per-rule evidence: where in an SPDX 3 JSON SBOM a rule found what it asks for.

An extra pass after the check, over the same file, which never changes the
check's outcome.  For each decided rule it lists elements, with their lines in
``SbomSource.display``:

* ``absent`` -- an element the checker reported as lacking what the rule asks
  for (its findings for the rule), with no items.  A document-level finding
  names the ``CreationInfo`` element for a creation info property, the SBOM
  element for the SBOM type, else the ``SpdxDocument``.
* ``found`` -- an element the rule judged and the checker did not report, with
  the properties, hashes, relationships or contacts that carry what the rule
  asks for.  This shows *where* the property is, not that its value is right.

Absent entries come first; at most :data:`MAX_EVIDENCE` are kept per rule and
``RuleResult.evidence_more`` counts the rest.

Which elements a rule judges and whether each passes come from the installed
checker (:meth:`RuleBasedChecker.rule_results`, the probes behind a rule's
``applies_when`` and the adapter's ``get_components_of_kind``); what carries a
rule comes from its probe params in the checker's spec (:mod:`.carriers`), so
no rule table is copied here.  Only top-level ``@graph`` objects can be
evidence: an element written inline inside another has no lines of its own.

Modules: :mod:`.carriers` (rule -> carrier), :mod:`.values` (reading and
previewing JSON values), :mod:`.reader` (items on an element),
:mod:`.rules` (the pass over the rules).
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from .rules import MAX_EVIDENCE, EvidencePass

if TYPE_CHECKING:
    from ntia_conformance_checker.rule_based_checker import RuleBasedChecker

    from ..conformance import SbomCheckResponse

__all__ = ["MAX_EVIDENCE", "TIME_BUDGET_SECONDS", "EvidenceTimeout", "add_evidence"]

logger = logging.getLogger(__name__)

TIME_BUDGET_SECONDS = 5.0
"""How long the pass may take; a larger SBOM gets no evidence, only its source."""


class EvidenceTimeout(Exception):
    """The evidence pass ran over its time budget."""


def add_evidence(
    response: SbomCheckResponse,
    checker: RuleBasedChecker,
    document: dict[str, Any],
    budget: float = TIME_BUDGET_SECONDS,
) -> None:
    """Fill ``evidence`` and ``evidence_more`` of every rule of *response*.

    *checker* is the checker that produced *response* from the file *document*
    was parsed from.  Never raises: on any failure, or after *budget* seconds
    (an SBOM of several megabytes can take that long), one WARNING is logged
    and no rule gets evidence.
    """
    deadline = time.monotonic() + budget

    def tick() -> None:
        if time.monotonic() > deadline:
            raise EvidenceTimeout(f"took longer than {budget:g} s")

    try:
        found = EvidencePass(checker, document, tick).run()
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("Evidence skipped: %s: %s", type(exc).__name__, exc)
        return
    for rule in response.conformance.rules:
        rule.evidence, rule.evidence_more = found.get(rule.rule_id, ([], 0))
