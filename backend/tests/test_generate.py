# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the artefact-URL validation (SSRF guard) in app.generate."""

from __future__ import annotations

import pytest

from app.generate import _ensure_public_http_url
from app.generators import GenerationError


@pytest.mark.parametrize(
    "url,descriptor",
    [
        ("file:///etc/passwd", "lumina.url-scheme-blocked"),
        ("ssh://git@github.com/x/y.git", "lumina.url-scheme-blocked"),
        ("ftp://example.org/repo", "lumina.url-scheme-blocked"),
        ("not-a-url", "lumina.url-scheme-blocked"),
        ("http://", "pitloom.url-unsupported"),
        ("http://127.0.0.1/repo.git", "lumina.url-private-address"),
        ("http://localhost/repo.git", "lumina.url-private-address"),
        ("http://10.0.0.5/repo.git", "lumina.url-private-address"),
        ("http://192.168.1.1/repo.git", "lumina.url-private-address"),
        # Cloud metadata endpoint (link-local)
        ("http://169.254.169.254/latest/meta-data/", "lumina.url-private-address"),
        ("http://[::1]/repo.git", "lumina.url-private-address"),
    ],
)
def test_blocked_urls(url: str, descriptor: str) -> None:
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url(url)
    assert excinfo.value.descriptor_id == descriptor


def test_public_ip_literal_allowed() -> None:
    # An IP literal avoids a DNS dependency in the test; 93.184.216.34 is a
    # documented public address (example.com).
    _ensure_public_http_url("https://93.184.216.34/repo.git")


def test_private_url_escape_hatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUMINA_ALLOW_PRIVATE_URLS", "1")
    _ensure_public_http_url("http://127.0.0.1/repo.git")
