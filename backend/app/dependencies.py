# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Versions of the packages Lumina leans on, for the About screen.

Read from the installed distributions, so the answer is what this process
runs, not what a file says it should run.
"""

from __future__ import annotations

import json
from importlib.metadata import PackageNotFoundError, distribution

from pydantic import BaseModel

# Distribution names of the dependencies the About screen describes.
DEPENDENCIES: tuple[str, ...] = (
    "pitloom",
    "licenseid",
    "ntia-conformance-checker",
)


class DependencyVersion(BaseModel):
    """One installed dependency.

    `commit` is set when pip installed the package from a Git URL (PEP 610);
    for such a package the version string is a development build number and
    the commit is what identifies it.
    """

    id: str
    version: str
    commit: str | None = None


class DependencyList(BaseModel):
    """Response of `GET /api/v1/dependencies`."""

    dependencies: list[DependencyVersion]


def _git_commit(direct_url_json: str | None) -> str | None:
    """The Git commit in a distribution's `direct_url.json`, if it has one."""
    if not direct_url_json:
        return None
    try:
        direct_url = json.loads(direct_url_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(direct_url, dict):
        return None
    vcs_info = direct_url.get("vcs_info")
    if not isinstance(vcs_info, dict) or vcs_info.get("vcs") != "git":
        return None
    commit = vcs_info.get("commit_id")
    return commit if isinstance(commit, str) and commit else None


def installed_dependencies() -> DependencyList:
    """The listed dependencies that are installed, with version and commit.

    A dependency that is not installed is left out: the answer carries no
    version Lumina cannot vouch for.
    """
    found: list[DependencyVersion] = []
    for name in DEPENDENCIES:
        try:
            dist = distribution(name)
        except PackageNotFoundError:
            continue
        found.append(
            DependencyVersion(
                id=name,
                version=dist.version,
                commit=_git_commit(dist.read_text("direct_url.json")),
            )
        )
    return DependencyList(dependencies=found)
