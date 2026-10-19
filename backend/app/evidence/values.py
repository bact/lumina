# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Reading SPDX 3 JSON values for evidence, and their one-line previews.

See also :mod:`app.evidence.reader`, which uses these on elements.
"""

from __future__ import annotations

import json
from typing import Any

from ..conformance import EvidenceItem
from ..sbom_source import child_lines

MAX_PREVIEW = 160
"""Longest value preview, in characters."""

_BLANK_NAMES = frozenset({"noassertion", "noassertionelement", "noassertionlicense"})
# The key a typed value object is pointed at by (a hash by its algorithm).
_ANCHOR_KEYS = ("algorithm", "externalRefType", "externalIdentifierType", "key")


def local_name(value: Any) -> str:
    """The last segment of an IRI (``.../HashAlgorithm/sha256`` -> ``sha256``)."""
    return value.rsplit("/", 1)[-1].strip() if isinstance(value, str) else ""


def ref_id(value: Any) -> str:
    """The id an element reference names (an id, or an inline element)."""
    if isinstance(value, dict):
        value = value.get("spdxId") or value.get("@id")
    return value.strip() if isinstance(value, str) else ""


def is_blank(value: Any) -> bool:
    """Whether a property value says nothing: absent, false, empty or
    NOASSERTION (as a string, an individual or a ``noAssertion`` presence)."""
    if value is None or value is False:
        return True
    if isinstance(value, str):
        return not value.strip() or local_name(value).lower() in _BLANK_NAMES
    if isinstance(value, list):
        return all(is_blank(i) for i in value)
    if isinstance(value, dict):
        return not value
    return False


def as_list(value: Any) -> list[Any]:
    """*value* as a list (``None`` is empty)."""
    if isinstance(value, list):
        return value
    return [] if value is None else [value]


def anchor_line(value: Any, line: int) -> int:
    """The line to point at for a list item starting on *line*: a typed object's
    defining key (a hash's ``algorithm``), else the item's first line."""
    if isinstance(value, dict):
        lines = {key: key_line for key, _, key_line in child_lines(value, line)}
        for key in _ANCHOR_KEYS:
            if key in lines:
                return lines[key]
    return line


def text_item(key: str, text: str, line: int) -> EvidenceItem:
    """An item whose value is *text* on one line, cut to :data:`MAX_PREVIEW`."""
    text = " ".join(text.split())
    if len(text) > MAX_PREVIEW:
        text = text[: MAX_PREVIEW - 1] + "…"
    return EvidenceItem(key=key, value=text, line=line)


def describe_object(value: dict[str, Any]) -> str:
    """A hash, external reference or identifier, dictionary entry, or JSON."""
    if "hashValue" in value:
        return f"{local_name(value.get('algorithm'))}: {value.get('hashValue')}"
    if "externalRefType" in value:
        locators = ", ".join(str(v) for v in as_list(value.get("locator")))
        return f"{local_name(value['externalRefType'])}: {locators}"
    if "externalIdentifierType" in value:
        id_type = local_name(value["externalIdentifierType"])
        return f"{id_type}: {value.get('identifier')}"
    if "key" in value and "value" in value:
        return f"{value['key']}={value['value']}"
    return json.dumps(value, ensure_ascii=False)[: MAX_PREVIEW * 2]


def contact(agent: Any) -> str:
    """An agent's email address or URL, as the checker's SPDX 3 adapter reads a
    contact (a ``Person`` or ``Organization`` with an ``email``, or a
    ``urlScheme``/``other`` http(s) external identifier); ``""`` if none."""
    if not isinstance(agent, dict) or local_name(agent.get("type")) not in (
        "Person",
        "Organization",
    ):
        return ""
    for ext in as_list(agent.get("externalIdentifier")):
        if not isinstance(ext, dict):
            continue
        id_type = local_name(ext.get("externalIdentifierType"))
        identifier = str(ext.get("identifier") or "").strip()
        if id_type == "email" and "@" in identifier:
            return identifier
        if id_type in ("urlScheme", "other") and identifier.startswith(
            ("http://", "https://")
        ):
            return identifier
    return ""
