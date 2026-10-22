# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the artefact-URL validation (SSRF guard) in app.generate."""

from __future__ import annotations

import importlib.metadata
import importlib.util
import json
import logging
import shutil
import tempfile
from pathlib import Path

import pytest
from pitloom.logging_config import configure_logging

from app import generate
from app.conformance import Notification
from app.generate import _ensure_public_http_url
from app.generation_log import hide_temp_dir
from app.generators import GenerationError, generate_from_huggingface
from app.generators.base import creation_info

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


_PRIVATE_DNS = [(2, 1, 6, "", ("172.29.10.40", 0))]


@pytest.mark.parametrize(
    ("allowed", "url", "passes"),
    [
        ("labs.etsi.org", "https://labs.etsi.org/x/y.git", True),
        (" Other.example , LABS.ETSI.ORG ,", "https://Labs.Etsi.Org/x/y.git", True),
        ("labs.etsi.org", "https://evil.labs.etsi.org/x.git", False),
        ("labs.etsi.org", "https://etsi.org/x.git", False),
        ("", "https://labs.etsi.org/x/y.git", False),
        (",", "https://labs.etsi.org/x/y.git", False),
    ],
    ids=["listed", "case-and-spaces", "subdomain", "parent", "unset", "empty-entry"],
)
def test_allowed_private_hosts_are_exact_and_operator_set(
    monkeypatch: pytest.MonkeyPatch, allowed: str, url: str, passes: bool
) -> None:
    """Only a listed host skips the address check; nothing else widens."""
    monkeypatch.setattr("app.generate.socket.getaddrinfo", lambda *a, **k: _PRIVATE_DNS)
    monkeypatch.setenv("LUMINA_ALLOWED_PRIVATE_HOSTS", allowed)
    if passes:
        _ensure_public_http_url(url)
        return
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url(url)
    assert excinfo.value.descriptor_id == "lumina.url-private-address"
    assert "LUMINA_ALLOWED_PRIVATE_HOSTS" in excinfo.value.message


def test_an_allowed_host_still_gets_the_scheme_and_length_checks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The allowlist skips the address check only."""
    monkeypatch.setenv("LUMINA_ALLOWED_PRIVATE_HOSTS", "labs.etsi.org")
    with pytest.raises(GenerationError) as excinfo:
        _ensure_public_http_url("ftp://labs.etsi.org/x")
    assert excinfo.value.descriptor_id == "lumina.url-scheme-blocked"


def test_creation_info_names_lumina_as_the_author_and_leaves_pitloom_the_tool() -> None:
    """Lumina ran Pitloom: Lumina is the author (a software agent), Pitloom the tool."""
    meta = creation_info()
    assert [(c.name, c.type) for c in meta.creators] == [("Lumina", "software-agent")]
    assert meta.tools is None  # Pitloom's default: the tool "Pitloom"


def test_hf_generator_writes_a_valid_aibom(tmp_path: Path) -> None:
    """Real Pitloom call (offline model file): guards the Pitloom API names."""
    model = tmp_path / "m.safetensors"
    header = b'{"__metadata__":{}}'
    model.write_bytes(len(header).to_bytes(8, "little") + header)
    out = tmp_path / "out.spdx3.json"
    generate_from_huggingface(str(model), str(out))
    assert "ai_AIPackage" in out.read_text(encoding="utf-8")


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


def test_generated_result_carries_the_sbom(monkeypatch: pytest.MonkeyPatch) -> None:
    """The generated SBOM is returned (read before its file is deleted),
    named after the model, with evidence."""
    paths: list[str] = []

    def fake_generate(_url: str, sbom_path: str) -> None:
        paths.append(sbom_path)
        shutil.copy(SPDX3_FIXTURE, sbom_path)

    monkeypatch.setattr(generate, "_generate", fake_generate)
    response = generate.generate_and_check("https://huggingface.co/o/m", "g7ai")
    assert response.sbom is not None
    assert response.sbom.filename == "m.spdx3.json"
    assert response.sbom.text == SPDX3_FIXTURE.read_text(encoding="utf-8")
    assert any(r.evidence for r in response.conformance.rules)
    assert not Path(paths[0]).exists()


def test_warnings_are_collected_only_during_generation() -> None:
    """A warning logged after the context manager exits is not collected."""
    sink: list[Notification] = []
    with generate._collect_warnings(sink):  # pylint: disable=protected-access
        pass
    logging.getLogger("pitloom").warning("after")
    assert not sink


def test_failure_message_hides_the_server_temp_dir(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A generation error does not reveal the server's temporary directory."""
    tmp = tempfile.gettempdir()

    def fail(_url: str, _path: str) -> None:
        raise GenerationError("git.clone-failed", f"fatal: {tmp}/x/y not found")

    monkeypatch.setattr(generate, "_generate", fail)
    response = generate.generate_and_check("https://example.org/r", "ntia")
    message = response.run.notifications[0].message
    assert tmp not in message
    assert "<tmp>/x/y" in message


@pytest.mark.parametrize(
    ("template", "hidden"),
    [
        ("fatal: {tmp}/x/y not found", True),
        ("timeout for https://gitlab.example.org{tmp}/project", False),
        ("see 'file://{tmp}/x'", False),
    ],
)
def test_hide_temp_dir_leaves_urls_alone(template: str, hidden: bool) -> None:
    """Only a path is hidden, not a part of a URL that looks like the temp dir."""
    text = template.format(tmp=tempfile.gettempdir())
    assert (hide_temp_dir(text) != text) is hidden


def test_pitloom_warnings_survive_its_logging_setup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pitloom's ``configure_logging()`` replaces its logger's handlers; its
    warnings still reach the user, with the temp dir hidden."""

    def fake_generate(_url: str, sbom_path: str) -> None:
        configure_logging()
        logging.getLogger("pitloom.assemble").warning(
            "WARNING-ish: %s/clone failed", tempfile.gettempdir()
        )
        shutil.copy(SPDX3_FIXTURE, sbom_path)

    monkeypatch.setattr(generate, "_generate", fake_generate)
    response = generate.generate_and_check("https://example.org/r", "ntia")
    messages = [n.message for n in response.run.notifications]
    assert messages == ["WARNING-ish: <tmp>/clone failed"]


class _FakeDistribution:  # pylint: disable=too-few-public-methods
    """What ``importlib.metadata.distribution`` returns, with a chosen
    ``direct_url.json``."""

    version = "0.20.2"

    def __init__(self, direct_url: str | None) -> None:
        self._direct_url = direct_url

    def read_text(self, _name: str) -> str | None:
        """The file's text, or ``None`` when the distribution has none."""
        return self._direct_url


_GIT = {
    "vcs_info": {"vcs": "git", "commit_id": "26ede5b7fce26afcc8c460e461fbc7922a7ab8c1"}
}


@pytest.mark.parametrize(
    ("direct_url", "expected"),
    [
        (json.dumps(_GIT), "0.20.2 (26ede5b)"),
        (json.dumps({"dir_info": {}}), "0.20.2"),  # installed from a directory
        (None, "0.20.2"),  # an ordinary wheel: no direct_url.json
        (json.dumps({"vcs_info": {"commit_id": ""}}), "0.20.2"),  # states nothing
    ],
    ids=["git", "directory", "wheel", "empty-commit"],
)
def test_the_generator_line_names_the_pinned_commit(
    direct_url: str | None, expected: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """requirements.txt pins a commit, later than the version number it reports."""
    monkeypatch.setattr(
        importlib.metadata, "distribution", lambda _n: _FakeDistribution(direct_url)
    )
    assert generate._pitloom_version() == expected  # pylint: disable=protected-access
