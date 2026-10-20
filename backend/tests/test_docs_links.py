# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0
"""User-facing docs must not link into ``working-docs/``."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("name", ["README.md", "INSTALL.md"])
def test_user_docs_do_not_link_working_docs(name: str) -> None:
    text = (ROOT / name).read_text(encoding="utf-8")
    assert "working-docs" not in text
