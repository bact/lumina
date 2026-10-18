# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the artefact-URL validation (SSRF guard) in app.generate."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.generate import _ensure_public_http_url
from app.generators import GenerationError, generate_from_huggingface
from app.generators.base import creation_info
from app.generators.git import _run_pitloom


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
    """Each blocked URL is refused with its own descriptor id."""
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url(url)
    assert excinfo.value.descriptor_id == descriptor


def test_public_ip_literal_allowed() -> None:
    """A public IP literal passes the guard."""
    # An IP literal avoids a DNS dependency in the test; 93.184.216.34 is a
    # documented public address (example.com).
    _ensure_public_http_url("https://93.184.216.34/repo.git")


def test_private_url_escape_hatch(monkeypatch: pytest.MonkeyPatch) -> None:
    """The environment variable lets a private address through."""
    monkeypatch.setenv("LUMINA_ALLOW_PRIVATE_URLS", "1")
    _ensure_public_http_url("http://127.0.0.1/repo.git")


def test_creation_info_names_lumina_as_software_agent() -> None:
    """The creation metadata is the shape the installed Pitloom accepts."""
    creator = creation_info().creators[0]
    assert (creator.name, creator.type) == ("Lumina", "software-agent")


def test_hf_generator_writes_a_valid_aibom(tmp_path: Path) -> None:
    """Real Pitloom call (offline model file): guards the Pitloom API names."""
    model = tmp_path / "m.safetensors"
    header = b'{"__metadata__":{}}'
    model.write_bytes(len(header).to_bytes(8, "little") + header)
    out = tmp_path / "out.spdx3.json"
    generate_from_huggingface(str(model), str(out))
    assert "ai_AIPackage" in out.read_text(encoding="utf-8")


def test_git_generator_writes_a_valid_sbom(tmp_path: Path) -> None:
    """Real Pitloom call on a tiny project: guards the Pitloom API names."""
    project = tmp_path / "p"
    project.mkdir()
    (project / "pyproject.toml").write_text(
        '[project]\nname = "demo"\nversion = "1.0"\n', encoding="utf-8"
    )
    out = tmp_path / "out.spdx3.json"
    _run_pitloom(str(project), str(out))
    assert "software_Package" in out.read_text(encoding="utf-8")


def test_git_generator_ignores_the_checkouts_own_pitloom_config(
    tmp_path: Path,
) -> None:
    """A cloned repo is untrusted: its ``[tool.pitloom]`` must not name host paths.

    The missing registry and required fragment would each fail the run if read.
    """
    host = tmp_path / "host"
    project = tmp_path / "p"
    project.mkdir()
    (project / "pyproject.toml").write_text(
        '[project]\nname = "demo"\nversion = "1.0"\n'
        "[tool.pitloom]\n"
        f'id-registry = "{(host / "ids.json").as_posix()}"\n'
        "[tool.pitloom.fragment]\n"
        f'files = [{{path = "{(host / "f.json").as_posix()}", required = true}}]\n',
        encoding="utf-8",
    )
    out = tmp_path / "out.spdx3.json"
    _run_pitloom(str(project), str(out))
    assert "software_Package" in out.read_text(encoding="utf-8")
    assert not host.exists()


def test_huggingface_hub_client_is_installed() -> None:
    """Pitloom reads a Hub model through ``huggingface_hub`` (a Pitloom extra)."""
    assert importlib.util.find_spec("huggingface_hub") is not None
