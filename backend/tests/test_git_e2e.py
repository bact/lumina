# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0
"""A Git URL from end to end in Lumina: a local GitLab-style server over smart
HTTP (``git http-backend``), Pitloom fetching from it, the checker reading the
SBOM, and the result the user sees.

Pitloom owns reading the URL (branch, folder, redirect); these tests check
what Lumina adds and that the pieces fit: the address guard on every redirect,
the SBOM's author, the repository's own settings ignored, the generation log,
and a refused URL that is logged and shown.
"""

from __future__ import annotations

import logging
import shutil
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import generate, main
from app.generate import generate_and_check
from app.generators import GenerationError, generate_from_git
from tests._git_http_server import backend_available, make_repo, serve_git

pytestmark = pytest.mark.skipif(
    not backend_available(), reason="needs git http-backend"
)

_DEMO = '[project]\nname = "demo"\nversion = "1.0"\n'
_HOSTILE = (
    _DEMO
    + '[tool.pitloom]\nid-registry = "/nonexistent/host/ids.json"\n'
    + '[tool.pitloom.fragment]\nfiles = [{path = "/nonexistent/f.json", required = true}]\n'
)


@pytest.fixture(name="base")
def _base(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A GitLab-style server on loopback, which Lumina's guard allows only
    with ``LUMINA_ALLOW_PRIVATE_URLS`` (a development setting)."""
    monkeypatch.setenv("LUMINA_ALLOW_PRIVATE_URLS", "1")
    root = tmp_path / "srv"
    make_repo(
        root,
        "g/p",
        {
            "main": {
                "pyproject.toml": _DEMO,
                "svc/a/pyproject.toml": '[project]\nname = "svc-a"\nversion = "2"\n',
            },
            "feat/x": {
                "pyproject.toml": '[project]\nname = "on-feat"\nversion = "3"\n'
            },
        },
    )
    make_repo(root, "g/hostile", {"main": {"pyproject.toml": _HOSTILE}})
    make_repo(root, "g/mono", {"main": {"one/pyproject.toml": _DEMO}})
    with serve_git(root, gitlab_style=True) as base:
        yield base


@pytest.mark.parametrize(
    ("page", "package"),
    [
        ("/g/p", "demo"),
        ("/g/p/-/tree/main/svc/a", "svc-a"),
        ("/g/p/-/tree/feat/x", "on-feat"),
    ],
    ids=["bare-gitlab-url", "folder-page", "branch-with-slash"],
)
def test_the_sbom_describes_the_project_the_url_names(
    base: str, page: str, package: str, tmp_path: Path
) -> None:
    """A GitLab URL without ``.git`` (redirected by the server) or a page URL:
    the SBOM holds the project it names."""
    out = tmp_path / "out.spdx3.json"
    generate_from_git(base + page, str(out), generate._ensure_public_http_url)  # pylint: disable=protected-access
    assert f'"name":"{package}"' in out.read_text(encoding="utf-8")


def test_lumina_is_the_author_pitloom_the_tool_and_the_repository_is_untrusted(
    base: str, tmp_path: Path
) -> None:
    """Lumina authored the SBOM (a software agent), Pitloom is the tool, and
    the project's own supplier is not the agent. The repository's
    ``[tool.pitloom]`` naming host paths is not read: the missing registry and
    required fragment would fail the run."""
    import json  # pylint: disable=import-outside-toplevel

    out = tmp_path / "out.spdx3.json"
    generate_from_git(base + "/g/hostile", str(out), generate._ensure_public_http_url)  # pylint: disable=protected-access
    graph = json.loads(out.read_text(encoding="utf-8"))["@graph"]
    demo = next(e for e in graph if e.get("name") == "demo")
    assert "suppliedBy" not in demo
    by_id = {e["spdxId"]: e for e in graph if "spdxId" in e}
    info = next(e for e in graph if e["type"] == "CreationInfo")
    assert [(by_id[i]["type"], by_id[i]["name"]) for i in info["createdBy"]] == [
        ("SoftwareAgent", "Lumina")
    ]
    assert [by_id[i]["name"] for i in info["createdUsing"]] == ["Pitloom"]


def test_every_redirect_target_goes_through_lumina_s_guard(
    base: str, tmp_path: Path
) -> None:
    """Pitloom hands the redirect target to Lumina's check before asking it;
    a refusal is Lumina's own descriptor, unchanged."""
    seen: list[str] = []

    def guard(url: str) -> None:
        seen.append(url)
        raise GenerationError("lumina.url-private-address", f"refused {url}")

    with pytest.raises(GenerationError) as excinfo:
        generate_from_git(base + "/g/p", str(tmp_path / "o.json"), guard)
    assert excinfo.value.descriptor_id == "lumina.url-private-address"
    assert seen == [base + "/g/p.git"]


@pytest.mark.parametrize(
    ("page", "descriptor"),
    [
        ("/g/missing", "git.clone-failed"),
        ("/g/p/-/tree/nope/x", "git.ref-not-found"),
        ("/g/p/-/tree/main/no/folder", "git.path-not-found"),
        ("/g/mono", "git.no-project"),
    ],
)
def test_a_url_that_cannot_be_read_has_pitloom_s_code(
    base: str, page: str, descriptor: str, tmp_path: Path
) -> None:
    """Pitloom's code becomes the descriptor the user sees."""
    with pytest.raises(GenerationError) as excinfo:
        generate_from_git(
            base + page,
            str(tmp_path / "o.json"),
            generate._ensure_public_http_url,  # pylint: disable=protected-access
        )
    assert excinfo.value.descriptor_id == descriptor


def test_the_whole_chain_gives_a_result_with_the_log_the_user_reads(base: str) -> None:
    """URL, Pitloom, checker, response: the SBOM, per-rule results, and a
    generation log that names the redirect followed and the folder read."""
    response = generate_and_check(base + "/g/p/-/tree/main/svc/a", "ntia")
    assert response.sbom is not None and response.sbom.filename == "p.spdx3.json"
    assert '"name":"svc-a"' in response.sbom.text
    assert response.conformance.rules
    assert not [n for n in response.run.notifications if n.level == "error"]
    assert response.generation_log is not None
    log = "\n".join(line.message for line in response.generation_log)
    assert "redirected to" in log and "folder svc/a" in log
    assert response.run.generator.startswith("pitloom ")


@pytest.mark.usefixtures("base")
@pytest.mark.parametrize(
    ("url", "descriptor"),
    [
        ("ssh://git@host/o/r.git", "lumina.url-scheme-blocked"),
        ("http://127.0.0.1:9/o/r", "git.clone-failed"),
    ],
)
def test_a_refused_url_is_logged_and_shown(
    url: str,
    descriptor: str,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Never silent: the user gets an error notification naming the reason,
    and the server log gets a warning."""
    if descriptor == "lumina.url-scheme-blocked":
        monkeypatch.delenv("LUMINA_ALLOW_PRIVATE_URLS")
    with caplog.at_level(logging.WARNING):
        response = generate_and_check(url, "ntia")
    (note,) = [n for n in response.run.notifications if n.level == "error"]
    assert note.descriptor_id == descriptor and note.message
    assert any(descriptor in r.getMessage() for r in caplog.records)
    assert response.sbom is None


def test_the_job_api_runs_the_whole_chain(base: str) -> None:
    """``POST /api/v1/artifact/check`` queues the job, ``GET /api/v1/jobs/<id>``
    returns the result: the same chain behind the web page."""
    with TestClient(main.app) as client:
        posted = client.post(
            "/api/v1/artifact/check",
            json={"artifact_url": base + "/g/p", "standard_id": "ntia"},
        )
        assert posted.status_code == 202
        job_id = posted.json()["job_id"]
        for _ in range(120):
            status = client.get(f"/api/v1/jobs/{job_id}").json()
            if status["status"] in {"done", "failed"}:
                break
            time.sleep(0.5)
    assert status["status"] == "done", status
    assert status["result"]["sbom"]["filename"] == "p.spdx3.json"
    assert shutil.which("git")
