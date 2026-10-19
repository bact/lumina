# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the SBOM source (format, display) and the @graph line index."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.generate import sbom_filename
from app.sbom_source import GraphIndex, json_lines, load_sbom

ROOT = Path(__file__).parent
SBOMS = sorted((ROOT / "fixtures" / "sbom").glob("spdx3_*.json")) + sorted(
    (ROOT.parent.parent / "demo").glob("*.spdx3.json")
)
SPDX3_CONTEXT = "https://spdx.org/rdf/3.0.1/spdx-context.jsonld"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (json.dumps({"@context": SPDX3_CONTEXT, "@graph": []}), "spdx3-json"),
        (json.dumps({"@context": ["x", SPDX3_CONTEXT], "@graph": []}), "spdx3-json"),
        (json.dumps({"@context": SPDX3_CONTEXT}), "other"),
        (json.dumps({"@context": {"spdx": SPDX3_CONTEXT}, "@graph": []}), "other"),
        (json.dumps({"@context": "https://spdx.org/rdf/2", "@graph": []}), "other"),
        (json.dumps({"spdxVersion": "SPDX-2.3"}), "spdx2-json"),
        (json.dumps({"spdxVersion": "SPDX-3.0"}), "other"),
        (json.dumps({"spdxVersion": 2}), "other"),
        ("﻿" + json.dumps({"spdxVersion": "SPDX-2.2"}), "spdx2-json"),
        ("[1, 2]", "other"),
        ("SPDXVersion: SPDX-2.3\n", "other"),
        ("{" * 100_000, "other"),
        ("", "other"),
    ],
    ids=[
        "spdx3",
        "spdx3-context-list",
        "spdx3-no-graph",
        "context-object",
        "other-context",
        "spdx2",
        "spdx-version-3",
        "spdx-version-number",
        "bom",
        "array",
        "tag-value",
        "deep-nesting",
        "empty",
    ],
)
def test_format_detection(text: str, expected: str) -> None:
    """The format comes from the JSON object's context, graph or SPDX version."""
    assert load_sbom("x", text).source.format == expected


@pytest.mark.parametrize(
    "text",
    [
        '{"b":1,"a":[{"c":"é"},[],{}]}',
        '{"a":"line\\u2028sep\\u0085x"}',
        "[1,\n2]",
        "not json\nat all\n",
        "",
    ],
    ids=["object", "unicode-separators", "array", "text", "empty"],
)
def test_display_and_line_count(text: str) -> None:
    """A JSON object is pretty-printed (order and non-ASCII kept); anything
    else is shown as it is.  ``line_count`` counts ``\\n``-separated lines."""
    source = load_sbom("x", text).source
    value = json.loads(text) if text.startswith("{") else None
    expected = (
        json.dumps(value, indent=2, ensure_ascii=False)
        if isinstance(value, dict)
        else text
    )
    assert (source.text, source.display) == (text, expected)
    assert source.line_count == len(source.display.split("\n"))


def test_only_spdx3_json_keeps_the_parsed_document() -> None:
    """The evidence pass gets the document of an SPDX 3 JSON SBOM only."""
    spdx3 = load_sbom("x", json.dumps({"@context": SPDX3_CONTEXT, "@graph": []}))
    spdx2 = load_sbom("x", json.dumps({"spdxVersion": "SPDX-2.3"}))
    assert spdx3.spdx3_document == {"@context": SPDX3_CONTEXT, "@graph": []}
    assert spdx2.spdx3_document is None
    assert (spdx2.is_json, load_sbom("x", "nope").is_json) == (True, False)


@pytest.mark.parametrize(
    "value",
    [1, "s", None, [], {}, [[]], {"a": {}}, {"a": [1, {"b": [2, 3]}, []]}, [{}, [{}]]],
)
def test_json_lines_matches_json_dumps(value: Any) -> None:
    """The line count from structure equals that of the dumped text."""
    assert json_lines(value) == len(json.dumps(value, indent=2).split("\n"))


@pytest.mark.parametrize("path", SBOMS, ids=lambda p: p.name)
def test_index_lines_point_at_each_element_and_key(path: Path) -> None:
    """Every element's first line opens it, its id is on one of its lines and
    every key is on the line computed for it, in every SPDX 3 fixture."""
    loaded = load_sbom(path.name, path.read_text(encoding="utf-8"))
    assert loaded.spdx3_document is not None
    lines = loaded.source.display.split("\n")
    index = GraphIndex(loaded.spdx3_document)
    elements = [e for group in index.by_type.values() for e in group]
    assert len(elements) == len(loaded.spdx3_document["@graph"])
    for element in elements:
        assert lines[element.line - 1].strip() == "{"
        assert lines[element.end_line - 1].strip() in ("}", "},")
        span = "\n".join(lines[element.line - 1 : element.end_line])
        assert json.dumps(element.element_id) in span
        for key in element.data:
            assert lines[element.line_of((key,)) - 1].lstrip().startswith(
                json.dumps(key) + ":"
            )


def test_index_ignores_a_string_that_looks_like_an_element() -> None:
    """A string value holding JSON text that looks like an element does not
    shift or add elements (no substring search)."""
    fake = json.dumps({"spdxId": "urn:b", "type": "X"}, indent=2)
    document = {
        "@context": SPDX3_CONTEXT,
        "comment": fake,
        "@graph": [
            {"spdxId": "urn:a", "type": "T", "comment": fake},
            {"spdxId": "urn:b", "type": "T"},
        ],
    }
    lines = load_sbom("x", json.dumps(document)).source.display.split("\n")
    index = GraphIndex(document)
    assert list(index.by_id) == ["urn:a", "urn:b"]
    element = index.by_id["urn:b"]
    assert '"spdxId": "urn:b"' in lines[element.line_of(("spdxId",)) - 1]


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/org/repo", "repo.spdx3.json"),
        ("https://github.com/org/repo.git", "repo.spdx3.json"),
        ("https://gitlab.example.org/a/b/c/", "c.spdx3.json"),
        ("https://huggingface.co/org/model", "model.spdx3.json"),
        ("https://huggingface.co/org/model/tree/main", "model.spdx3.json"),
        ("https://huggingface.co/gpt2", "gpt2.spdx3.json"),
        ("https://example.org/", "sbom.spdx3.json"),
        ("https://example.org/a%20b..", "a-20b.spdx3.json"),
    ],
)
def test_generated_sbom_filename(url: str, expected: str) -> None:
    """A generated SBOM is named after the repository or model."""
    assert sbom_filename(url) == expected
