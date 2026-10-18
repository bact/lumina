# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""API tests: regulation support, upload cap and job submission."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app import main

SPDX3_G7 = os.path.join(
    os.path.dirname(__file__), "fixtures", "sbom", "spdx3_g7ai.json"
)


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    """A client for the app."""
    return TestClient(main.app)


def test_regulations_report_what_the_checker_supports(client: TestClient) -> None:
    """ntia, bsi, g7ai, cisa2026 and fsct2024 are ready; mof is not."""
    ready = {
        r["id"]: r["ready"]
        for r in client.get("/api/v1/regulations").json()["regulations"]
    }
    assert ready == {
        "ntia": True,
        "bsi": True,
        "g7ai": True,
        "cisa2026": True,
        "fsct2024": True,
        "mof": False,
    }


def test_g7_upload_returns_per_rule_outcomes(client: TestClient) -> None:
    """The G7 check over HTTP carries every rule's outcome."""
    with open(SPDX3_G7, "rb") as f:
        response = client.post(
            "/api/v1/sbom/check",
            files={"file": ("x.json", f)},
            data={"regulation": "g7ai"},
        )
    assert response.status_code == 200
    assert len(response.json()["conformance"]["rules"]) == 81


def test_unsupported_regulation_upload_is_501(client: TestClient) -> None:
    """MOF is refused for an upload."""
    response = client.post(
        "/api/v1/sbom/check",
        files={"file": ("x.json", b"{}")},
        data={"regulation": "mof"},
    )
    assert response.status_code == 501


def test_unsupported_regulation_artifact_is_refused_before_any_work(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """MOF is refused at submit time: nothing is queued, nothing is cloned."""
    queued: list[object] = []
    monkeypatch.setattr(main._jobs, "enqueue", lambda *a, **k: queued.append(k))  # pylint: disable=protected-access
    response = client.post(
        "/api/v1/artifact/check",
        json={"artifact_url": "https://github.com/o/r", "regulation_id": "mof"},
    )
    assert response.status_code == 501
    assert not queued


def test_oversize_upload_is_413(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A file above the cap is refused; one at the cap is not."""
    monkeypatch.setattr(main, "MAX_SBOM_BYTES", 10)
    over = client.post("/api/v1/sbom/check", files={"file": ("x.json", b"x" * 11)})
    at_cap = client.post("/api/v1/sbom/check", files={"file": ("x.json", b"x" * 10)})
    assert over.status_code == 413
    assert at_cap.status_code != 413


def test_declared_oversize_body_is_refused(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A Content-Length above the cap plus form framing is refused (413)."""
    monkeypatch.setattr(main, "MAX_SBOM_BYTES", 10)
    response = client.post(
        "/api/v1/sbom/check",
        files={"file": ("x.json", b"x")},
        headers={"content-length": str(10 + 64 * 1024 + 1)},
    )
    assert response.status_code == 413


def test_a_multi_megabyte_sbom_is_not_refused_for_size(client: TestClient) -> None:
    """Large SBOMs are normal: the default cap is far above 1 MB."""
    assert main.MAX_SBOM_BYTES >= 100 * 1024 * 1024
    response = client.post(
        "/api/v1/sbom/check", files={"file": ("x.json", b" " * (3 * 1024 * 1024))}
    )
    assert response.status_code != 413


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("a.json", ".json"),
        ("a.SPDX", ".spdx"),
        ("a./b", ".spdx"),
        ("a." + "x" * 300, ".spdx"),
        ("noext", ".spdx"),
        (None, ".spdx"),
        ("a.t/../../x", ".spdx"),
    ],
)
def test_upload_suffix_is_a_plain_extension(
    filename: str | None, expected: str
) -> None:
    """Upload suffix is a plain extension."""
    assert main._suffix(filename) == expected  # pylint: disable=protected-access


@pytest.mark.parametrize("name", ["a./b", "a." + "x" * 300])
def test_odd_upload_filenames_do_not_crash(client: TestClient, name: str) -> None:
    """Odd upload filenames do not crash."""
    response = client.post("/api/v1/sbom/check", files={"file": (name, b"{}")})
    assert response.status_code < 500


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", 100 * 1024 * 1024),
        ("abc", 100 * 1024 * 1024),
        ("0", 100 * 1024 * 1024),
        ("2048", 2048),
    ],
)
def test_max_sbom_bytes_ignores_a_bad_setting(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: int
) -> None:
    """Max sbom bytes ignores a bad setting."""
    monkeypatch.setenv("LUMINA_MAX_SBOM_BYTES", raw)
    assert main._max_sbom_bytes() == expected  # pylint: disable=protected-access


def test_an_oversize_sarif_body_is_refused(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The SARIF import has the same size cap as an upload."""
    monkeypatch.setattr(main, "MAX_SBOM_BYTES", 10)
    response = client.post("/api/v1/sarif/import", json={"pad": "x" * 100})
    assert response.status_code == 413
