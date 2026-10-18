# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the artefact-URL validation (SSRF guard) in app.generate."""

from __future__ import annotations

import http.server
import importlib.util
import json
import logging
import shutil
import threading
from pathlib import Path

import pytest

from app import generate
from app.conformance import Notification
from app.generate import _ensure_public_http_url
from app.generators import GenerationError, generate_from_huggingface
from app.generators.base import creation_info
from app.generators.git import _run_pitloom, _shallow_clone

SPDX3_FIXTURE = Path(__file__).parent / "fixtures" / "sbom" / "spdx3_g7ai.json"


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


def test_creation_info_names_lumina_as_a_tool_not_a_creator() -> None:
    """Pitloom makes the first creator the project's supplier; Lumina is not."""
    meta = creation_info()
    assert [t.name for t in meta.tools] == ["Lumina"]
    assert not meta.creators


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


@pytest.mark.parametrize(
    "url",
    [
        "http://[64:ff9b::7f00:1]/r.git",  # NAT64 of 127.0.0.1
        "http://[64:ff9b::a9fe:a9fe]/r.git",  # NAT64 of 169.254.169.254
        "http://[::127.0.0.1]/r.git",
        "http://[::ffff:10.0.0.1]/r.git",
        "http://[fec0::1]/r.git",
        "http://224.0.0.1/r.git",
    ],
)
def test_embedded_or_special_addresses_are_blocked(url: str) -> None:
    """IPv6 forms that embed a private IPv4, site-local and multicast addresses."""
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url(url)
    assert excinfo.value.descriptor_id == "lumina.url-private-address"


@pytest.mark.parametrize(
    ("url", "descriptor"),
    [
        ("http://[::1", "lumina.url-invalid"),
        ("https://example.org/" + "a" * 3000, "lumina.url-too-long"),
    ],
)
def test_odd_urls_are_refused_with_a_descriptor(url: str, descriptor: str) -> None:
    """Odd urls are refused with a descriptor."""
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url(url)
    assert excinfo.value.descriptor_id == descriptor


def test_clone_does_not_follow_a_redirect(tmp_path: Path) -> None:
    """A public URL that redirects to another host must not be followed."""
    hits: list[str] = []

    class Target(http.server.BaseHTTPRequestHandler):
        """A request handler."""

        def do_GET(self) -> None:  # pylint: disable=invalid-name
            """Answer a GET request."""
            hits.append(self.path)
            self.send_response(404)
            self.end_headers()

        def log_message(self, *_args: object) -> None:
            """Keep the test output quiet."""

    target = http.server.HTTPServer(("127.0.0.1", 0), Target)

    class Redirect(http.server.BaseHTTPRequestHandler):
        """A request handler."""

        def do_GET(self) -> None:  # pylint: disable=invalid-name
            """Answer a GET request."""
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{target.server_port}/x")
            self.end_headers()

        def log_message(self, *_args: object) -> None:
            """Keep the test output quiet."""

    redirect = http.server.HTTPServer(("127.0.0.1", 0), Redirect)
    threads = [
        threading.Thread(target=server.serve_forever, daemon=True)
        for server in (target, redirect)
    ]
    for thread in threads:
        thread.start()
    try:
        with pytest.raises(GenerationError):
            _shallow_clone(
                f"http://127.0.0.1:{redirect.server_port}/r.git", str(tmp_path / "w")
            )
    finally:
        for server in (target, redirect):
            server.shutdown()
            server.server_close()
    assert not hits


def test_a_scanned_project_does_not_get_lumina_as_its_supplier(tmp_path: Path) -> None:
    """Regression: the supplier must come from the project, which states none."""
    project = tmp_path / "p"
    project.mkdir()
    (project / "pyproject.toml").write_text(
        '[project]\nname = "demo"\nversion = "1.0"\n', encoding="utf-8"
    )
    out = tmp_path / "out.spdx3.json"
    _run_pitloom(str(project), str(out))
    graph = json.loads(out.read_text(encoding="utf-8"))["@graph"]
    demo = next(e for e in graph if e.get("name") == "demo")
    assert "suppliedBy" not in demo
    assert "Lumina" not in {e.get("name") for e in graph if e["type"] != "Tool"}


def test_pitloom_warnings_reach_the_user_as_notifications(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """What Pitloom warns while it generates is shown, not left in the server log."""

    def fake_generate(_url: str, sbom_path: str) -> None:
        logging.getLogger("pitloom.extract.x").warning("FORMAT=gguf: reader missing")
        shutil.copy(SPDX3_FIXTURE, sbom_path)

    monkeypatch.setattr(generate, "_generate", fake_generate)
    response = generate.generate_and_check("https://example.org/r", "ntia")
    assert [n.message for n in response.run.notifications] == [
        "FORMAT=gguf: reader missing"
    ]
    assert response.run.generator.startswith("pitloom ")


def test_warnings_are_collected_only_during_generation() -> None:
    """A warning logged after the context manager exits is not collected."""
    sink: list[Notification] = []
    with generate._collect_warnings(sink):  # pylint: disable=protected-access
        pass
    logging.getLogger("pitloom").warning("after")
    assert not sink
