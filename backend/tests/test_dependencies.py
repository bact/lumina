# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Dependency versions for the About screen."""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version

import pytest
from fastapi.testclient import TestClient

from app import dependencies, main

COMMIT = "2355afcd7ec9af732f80680928849db6008e6e9a"


def _git_direct_url(commit: str = COMMIT) -> str:
    return json.dumps(
        {
            "url": "https://example.org/pkg.git",
            "vcs_info": {"vcs": "git", "commit_id": commit},
        }
    )


@dataclass
class _FakeDist:
    """A distribution with a fixed version and `direct_url.json`."""

    version: str
    direct_url: str | None

    def read_text(self, filename: str) -> str | None:
        """Return the fixed `direct_url.json`, nothing for other files."""
        return self.direct_url if filename == "direct_url.json" else None


def test_endpoint_reports_the_installed_versions() -> None:
    """Each listed dependency that is installed comes back with its version."""
    body = TestClient(main.app).get("/api/v1/dependencies").json()
    reported = {d["id"]: d for d in body["dependencies"]}
    for name in dependencies.DEPENDENCIES:
        try:
            installed = version(name)
        except PackageNotFoundError:
            assert name not in reported
            continue
        assert reported[name]["version"] == installed


def test_git_installed_package_reports_its_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A package installed from a Git URL reports the commit it was built from."""
    monkeypatch.setattr(
        dependencies,
        "distribution",
        lambda name: _FakeDist("0.1.dev928+g2355afc", _git_direct_url()),
    )
    result = dependencies.installed_dependencies()
    assert [d.id for d in result.dependencies] == list(dependencies.DEPENDENCIES)
    assert {d.commit for d in result.dependencies} == {COMMIT}
    assert result.dependencies[0].version == "0.1.dev928+g2355afc"


@pytest.mark.parametrize(
    "direct_url",
    [
        None,
        "",
        "not json",
        "[]",
        json.dumps({"url": "file:///tmp/pkg", "dir_info": {}}),
        json.dumps({"vcs_info": {"vcs": "hg", "commit_id": "abc"}}),
        json.dumps({"vcs_info": {"vcs": "git"}}),
        json.dumps({"vcs_info": {"vcs": "git", "commit_id": ""}}),
    ],
)
def test_no_commit_unless_installed_from_git(
    monkeypatch: pytest.MonkeyPatch, direct_url: str | None
) -> None:
    """A release, a local path or a malformed record has no commit."""
    monkeypatch.setattr(
        dependencies, "distribution", lambda name: _FakeDist("1.2.3", direct_url)
    )
    result = dependencies.installed_dependencies()
    assert {d.version for d in result.dependencies} == {"1.2.3"}
    assert {d.commit for d in result.dependencies} == {None}


def test_missing_package_is_left_out(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dependency that is not installed is not listed with a made-up version."""

    def fake_distribution(name: str) -> _FakeDist:
        if name == "licenseid":
            raise PackageNotFoundError(name)
        return _FakeDist("1.0", None)

    monkeypatch.setattr(dependencies, "distribution", fake_distribution)
    ids = [d.id for d in dependencies.installed_dependencies().dependencies]
    assert ids == ["pitloom", "ntia-conformance-checker"]
