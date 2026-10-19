# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""What on an element of an SPDX 3 JSON SBOM carries a rule, with its lines.

:class:`SbomReader` reads a carrier (:mod:`app.evidence.carriers`) on one
``@graph`` element, or on an element it links to through the rule's ``via``
relationships, and returns :class:`~app.conformance.EvidenceItem` objects.  A
list value gives one item per qualifying entry, on that entry's line (a typed
object's defining key, such as a hash's ``algorithm``); any other value gives
one item on its key's line.  A relationship gives one item on the
relationship's ``relationshipType`` line.

The value checks follow the checker's SPDX 3 adapter closely enough to point
at the right values (blank and NOASSERTION values skipped, ``name/value``
vocabulary entries, identifying ``externalIdentifier`` types, hash algorithm
and value present); whether an element passes is always the checker's call.
"""

from __future__ import annotations

import json
from functools import cached_property
from typing import Any

from ntia_conformance_checker.adapters.spdx3_adapter import IDENTIFIER_TYPES
from ntia_conformance_checker.spdx3_utils import (
    SPDX3_PACKAGE_DEPENDENCY_RELATIONSHIP_TYPES,
)

from ..conformance import EvidenceItem
from ..sbom_source import GraphElement, GraphIndex
from .carriers import Carrier
from .values import (
    anchor_line,
    as_list,
    contact,
    describe_object,
    is_blank,
    local_name,
    ref_id,
    text_item,
)

MAX_ITEMS = 20
"""Items per evidence entry, and list entries in one preview."""

_RELATIONSHIP_TYPES = ("Relationship", "LifecycleScopedRelationship")
_PROPERTY_PROBES = ("require_property", "require_document_property")
_CONTACT_PROBES = ("require_contact", "require_document_contact")

Path = tuple[str | int, ...]


class SbomReader:
    """Reads carriers on the elements of one indexed SBOM."""

    def __init__(self, index: GraphIndex) -> None:
        self.index = index

    # ---- Document structure ----------------------------------------------------

    def creation_info(self) -> tuple[GraphElement, Path] | None:
        """The element holding the document's creation info, and the path to
        it there (``("creationInfo",)`` when it is inline, else ``()``)."""
        document = self.index.document
        if document is None:
            return None
        info = document.data.get("creationInfo")
        if isinstance(info, dict):
            return (document, ("creationInfo",))
        element = self.index.get(info)
        return (element, ()) if element is not None else None

    def root_sboms(self) -> list[GraphElement]:
        """The ``software_Sbom`` elements among the document's roots."""
        document = self.index.document
        roots = as_list(document.data.get("rootElement")) if document else []
        found = (self.index.get(r) for r in roots)
        return [
            e for e in found if e is not None and e.element_type == "software_Sbom"
        ]

    def dependency_relationships(self) -> list[GraphElement]:
        """Dependency relationships between elements of the document, as the
        adapter's ``check_dependency_relationships`` counts them."""
        return [
            rel
            for rel in self._all_relationships
            if local_name(rel.data.get("relationshipType"))
            in SPDX3_PACKAGE_DEPENDENCY_RELATIONSHIP_TYPES
            and self.index.get(rel.data.get("from"))
            and any(self.index.get(t) for t in as_list(rel.data.get("to")))
        ]

    # ---- Items -----------------------------------------------------------------

    def items(self, element: GraphElement, found: Carrier) -> list[EvidenceItem]:
        """What on *element* (or an element it links to) carries the rule."""
        name, params = found
        info = self.creation_info()
        prefix: Path = info[1] if info is not None and info[0] is element else ()
        holders = [(element, prefix)] + [
            (linked, ()) for linked in self._linked(element, params.get("via") or [])
        ]
        items: list[EvidenceItem] = []
        for holder, path in holders:
            if name in _PROPERTY_PROBES:
                for prop in params["properties"]:
                    items.extend(self._property_items(holder, prop, path))
            elif name == "require_hash":
                items.extend(self._hash_items(holder, params.get("algorithms")))
            elif name in _CONTACT_PROBES:
                for prop in params["properties"]:
                    items.extend(self._contact_items(holder, (*path, prop)))
            elif name == "sbom_type":
                items.extend(self._property_items(holder, "software_sbomType", path))
        if name == "require_relationship":
            items.extend(self._relationship_items(element, params))
        elif name == "dependency_relationship":
            ends = [element.data.get("from"), *as_list(element.data.get("to"))]
            rel_type = local_name(element.data.get("relationshipType"))
            items.append(self._relationship_item(element, rel_type, ends))
        return items[:MAX_ITEMS]

    def _property_items(
        self, element: GraphElement, prop: str, prefix: Path
    ) -> list[EvidenceItem]:
        key, _, wanted = prop.partition("/")
        container = element.value_at(prefix)
        if not isinstance(container, dict) or key not in container:
            return []
        path = (*prefix, key)
        value = container[key]
        if not isinstance(value, list):
            if not _counts(key, wanted, value):
                return []
            return [self._item(key, value, element.line_of(path))]
        return [
            self._item(key, child, anchor_line(child, line))
            for _, child, line in element.children(path)
            if _counts(key, wanted, child)
        ]

    def _hash_items(
        self, element: GraphElement, algorithms: list[str] | None
    ) -> list[EvidenceItem]:
        wanted = {a.lower() for a in algorithms} if algorithms else None
        if not isinstance(element.data.get("verifiedUsing"), list):
            return []
        items = []
        for _, method, line in element.children(("verifiedUsing",)):
            if not isinstance(method, dict) or local_name(method.get("type")) != "Hash":
                continue
            algorithm = local_name(method.get("algorithm"))
            if is_blank(algorithm) or is_blank(method.get("hashValue")):
                continue
            if wanted is None or algorithm.lower() in wanted:
                items.append(
                    self._item("verifiedUsing", method, anchor_line(method, line))
                )
        return items

    def _contact_items(self, element: GraphElement, path: Path) -> list[EvidenceItem]:
        container = element.value_at(path[:-1])
        key = str(path[-1])
        if not isinstance(container, dict) or key not in container:
            return []
        refs = (
            [(ref, line) for _, ref, line in element.children(path)]
            if isinstance(container[key], list)
            else [(container[key], element.line_of(path))]
        )
        items = []
        for ref, line in refs:
            agent = ref if isinstance(ref, dict) else self._data(ref)
            address = contact(agent)
            if agent is not None and address:
                text = f"{agent.get('name') or ''} <{address}> ({ref_id(ref)})"
                items.append(text_item(key, text.strip(), line))
        return items

    def _relationship_items(
        self, element: GraphElement, params: dict[str, Any]
    ) -> list[EvidenceItem]:
        """Relationships that put *element* where the rule asks (as the
        ``from`` end, or a ``to`` end for direction ``to``)."""
        to_end = params.get("direction", "from") == "to"
        target_has = params.get("target_has") or []
        completeness = bool(params.get("completeness"))
        index = self._by_to if to_end else self._by_from
        items = []
        for rel_type in params["relationships"]:
            for rel in index.get((rel_type, element.element_id), []):
                if completeness and is_blank(rel.data.get("completeness")):
                    continue
                ends = (
                    [rel.data.get("from")]
                    if to_end
                    else [
                        t
                        for t in as_list(rel.data.get("to"))
                        if not is_blank(ref_id(t)) and self._has_any(t, target_has)
                    ]
                )
                if ends or (completeness and not target_has):
                    items.append(self._relationship_item(rel, rel_type, ends))
        return items

    def _relationship_item(
        self, rel: GraphElement, rel_type: str, ends: list[Any]
    ) -> EvidenceItem:
        has_type = "relationshipType" in rel.data
        line = rel.line_of(("relationshipType",)) if has_type else rel.line
        return self._item(rel_type, ends, line)

    def _has_any(self, ref: Any, properties: list[str]) -> bool:
        if not properties:
            return True
        target = self._data(ref)
        return target is not None and any(
            not is_blank(target.get(p)) for p in properties
        )

    def _data(self, ref: Any) -> dict[str, Any] | None:
        element = self.index.get(ref)
        return element.data if element is not None else None

    def _item(self, key: str, value: Any, line: int) -> EvidenceItem:
        return text_item(key, self._describe(value), line)

    def _describe(self, value: Any) -> str:
        """A readable rendering of a property value; an element reference
        shows the element's name (or licence expression) first."""
        if isinstance(value, str):
            target = self._data(value)
            label = target and (
                target.get("name") or target.get("simplelicensing_licenseExpression")
            )
            return f"{label} ({value.strip()})" if isinstance(label, str) else value
        if isinstance(value, list):
            return ", ".join(self._describe(v) for v in value[:MAX_ITEMS])
        if isinstance(value, dict):
            return describe_object(value)
        return json.dumps(value)

    # ---- Relationships ---------------------------------------------------------

    @cached_property
    def _all_relationships(self) -> list[GraphElement]:
        return [r for t in _RELATIONSHIP_TYPES for r in self.index.of_type(t)]

    @cached_property
    def _by_from(self) -> dict[tuple[str, str], list[GraphElement]]:
        """Relationships by ``(type, from id)``."""
        out: dict[tuple[str, str], list[GraphElement]] = {}
        for rel in self._all_relationships:
            rel_type = local_name(rel.data.get("relationshipType"))
            out.setdefault((rel_type, ref_id(rel.data.get("from"))), []).append(rel)
        return out

    @cached_property
    def _by_to(self) -> dict[tuple[str, str], list[GraphElement]]:
        """Relationships by ``(type, to id)``."""
        out: dict[tuple[str, str], list[GraphElement]] = {}
        for rel in self._all_relationships:
            rel_type = local_name(rel.data.get("relationshipType"))
            for target in as_list(rel.data.get("to")):
                out.setdefault((rel_type, ref_id(target)), []).append(rel)
        return out

    def _linked(self, element: GraphElement, via: list[str]) -> list[GraphElement]:
        """Elements *element* links to through a *via* relationship."""
        linked = (
            self.index.get(target)
            for rel_type in via
            for rel in self._by_from.get((rel_type, element.element_id), [])
            for target in as_list(rel.data.get("to"))
        )
        return [e for e in linked if e is not None]


def _counts(key: str, wanted: str, value: Any) -> bool:
    """Whether a value of property *key* is what a rule asks for: not blank,
    the *wanted* vocabulary entry (``externalRef/vcs``) when one is named, and
    an identifying type for ``externalIdentifier``."""
    if is_blank(value):
        return False
    if isinstance(value, dict):
        type_name = local_name(value.get("externalRefType")) or local_name(
            value.get("externalIdentifierType")
        )
        if wanted:
            return type_name == wanted and not is_blank(
                value.get("locator") or value.get("identifier")
            )
        return key != "externalIdentifier" or type_name in IDENTIFIER_TYPES
    return not wanted or local_name(value) == wanted
