# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""The SBOM a check ran on, as the API returns it, and where its elements are.

:func:`load_sbom` builds the :class:`~app.conformance.SbomSource` of an
uploaded or generated SBOM: the original text for download and ``display``,
the text pretty-printed when it is a JSON object, which every line number in
the response refers to.

:class:`GraphIndex` finds the lines of the ``@graph`` elements of an SPDX 3
JSON SBOM in ``display`` without searching the text: ``json.dumps(indent=2)``
puts every scalar and every empty container on one line and a non-empty
container on its own opening and closing lines, so the number of lines a value
takes follows from its structure alone (:func:`json_lines`).  Walking the
parsed document once gives every element's first and last line in linear time.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from .conformance import SbomFormat, SbomSource

SPDX3_CONTEXT_MARK = "spdx.org/rdf/3"


@dataclass(frozen=True)
class LoadedSbom:
    """An SBOM's :class:`SbomSource` and, for SPDX 3 JSON, its parsed document."""

    source: SbomSource
    spdx3_document: dict[str, Any] | None = None
    """The parsed JSON object when ``source.format`` is ``spdx3-json`` (the
    evidence pass reads it), else ``None``."""
    is_json: bool = False
    """Whether the text is JSON."""


def load_sbom(filename: str, text: str) -> LoadedSbom:
    """The :class:`LoadedSbom` of *text*, an SBOM named *filename*."""
    document = parse_json(text)
    is_json = document is not _NOT_JSON
    display = text
    if isinstance(document, dict):
        try:
            display = json.dumps(document, indent=2, ensure_ascii=False)
        except (RecursionError, ValueError):
            document = None
    sbom_format = detect_format(document)
    return LoadedSbom(
        source=SbomSource(
            filename=filename,
            format=sbom_format,
            text=text,
            display=display,
            line_count=display.count("\n") + 1,
        ),
        spdx3_document=(
            document
            if sbom_format == "spdx3-json" and isinstance(document, dict)
            else None
        ),
        is_json=is_json,
    )


_NOT_JSON = object()


def parse_json(text: str) -> Any:
    """*text* parsed as JSON (a leading byte order mark ignored), or a sentinel
    that is no JSON value when it is not JSON."""
    try:
        return json.loads(text.removeprefix("\ufeff"))
    except (RecursionError, ValueError):
        return _NOT_JSON


def detect_format(document: Any) -> SbomFormat:
    """``spdx3-json``, ``spdx2-json`` or ``other`` for a parsed JSON value."""
    if not isinstance(document, dict):
        return "other"
    context = document.get("@context")
    contexts = context if isinstance(context, list) else [context]
    if "@graph" in document and any(
        isinstance(c, str) and SPDX3_CONTEXT_MARK in c for c in contexts
    ):
        return "spdx3-json"
    version = document.get("spdxVersion")
    if isinstance(version, str) and version.startswith("SPDX-2"):
        return "spdx2-json"
    return "other"


def json_lines(value: Any) -> int:
    """Lines *value* takes in ``json.dumps(value, indent=...)`` output."""
    if isinstance(value, dict):
        return 2 + sum(map(json_lines, value.values())) if value else 1
    if isinstance(value, list):
        return 2 + sum(map(json_lines, value)) if value else 1
    return 1


def child_lines(container: Any, line: int) -> Iterator[tuple[Any, Any, int]]:
    """``(key or index, child, first line)`` of each child of *container*, a
    dict or list whose opening bracket is on *line*."""
    line += 1
    pairs = container.items() if isinstance(container, dict) else enumerate(container)
    for key, child in pairs:
        yield key, child, line
        line += json_lines(child)


def _str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


@dataclass(frozen=True, eq=False)
class GraphElement:
    """One object of ``@graph`` and the lines it spans in ``display``."""

    data: dict[str, Any]
    line: int
    end_line: int

    @property
    def element_id(self) -> str:
        """``spdxId``, or ``@id`` for a blank node."""
        return _str(self.data.get("spdxId")) or _str(self.data.get("@id"))

    @property
    def element_type(self) -> str:
        """The SPDX 3 type name (``type``, or ``@type``)."""
        return _str(self.data.get("type")) or _str(self.data.get("@type"))

    @property
    def name(self) -> str | None:
        """The element's ``name``, when it has one."""
        return _str(self.data.get("name")) or None

    def value_at(self, path: tuple[str | int, ...]) -> Any:
        """The value at *path* (keys and list indexes) inside the element."""
        value: Any = self.data
        for step in path:
            value = value[step]
        return value

    def line_of(self, path: tuple[str | int, ...]) -> int:
        """The line where the value at *path* starts (its key's line)."""
        value: Any = self.data
        line = self.line
        for step in path:
            for key, child, child_line in child_lines(value, line):
                if key == step:
                    value, line = child, child_line
                    break
            else:
                raise KeyError(step)
        return line

    def children(self, path: tuple[str | int, ...]) -> Iterator[tuple[Any, Any, int]]:
        """:func:`child_lines` of the container at *path*."""
        return child_lines(self.value_at(path), self.line_of(path))


class GraphIndex:
    """The ``@graph`` elements of an SPDX 3 JSON document, by id and by type.

    Only top-level ``@graph`` objects are indexed: an element written inline
    inside another one has no entry of its own.
    """

    def __init__(
        self, document: dict[str, Any], tick: Callable[[], None] | None = None
    ) -> None:
        """Index *document*; *tick* is called every 1000 elements (it may raise
        to stop a pass that takes too long)."""
        self.by_id: dict[str, GraphElement] = {}
        self.by_type: dict[str, list[GraphElement]] = {}
        line = 2  # line 1 is the document's "{"
        for key, value in document.items():
            if key == "@graph" and isinstance(value, list) and value:
                line = self._index_graph(value, line, tick)
            else:
                line += json_lines(value)

    def _index_graph(
        self, graph: list[Any], key_line: int, tick: Callable[[], None] | None
    ) -> int:
        """Index *graph*, whose key is on *key_line*; return the next key's line."""
        line = key_line + 1
        for count, item in enumerate(graph):
            if tick is not None and count % 1000 == 999:
                tick()
            size = json_lines(item)
            if isinstance(item, dict):
                element = GraphElement(item, line, line + size - 1)
                if element.element_id:
                    self.by_id.setdefault(element.element_id, element)
                self.by_type.setdefault(element.element_type, []).append(element)
            line += size
        return line + 1  # the closing "]"

    def get(self, ref: Any) -> GraphElement | None:
        """The element *ref* names (an id, or an inline object's id)."""
        if isinstance(ref, dict):
            ref = ref.get("spdxId") or ref.get("@id")
        return self.by_id.get(_str(ref))

    def of_type(self, element_type: str) -> list[GraphElement]:
        """Every indexed element of *element_type*."""
        return self.by_type.get(element_type, [])

    @property
    def document(self) -> GraphElement | None:
        """The ``SpdxDocument`` element."""
        return next(iter(self.of_type("SpdxDocument")), None)
