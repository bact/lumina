# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Generate an SBOM from a Git repository URL.

Pitloom does not fetch Git URLs itself, so Lumina does the fetch: a **shallow
clone** (``git clone --depth 1``) into a temporary work directory, then Pitloom's
``generate_sbom`` on the checkout (it reads the project's Python packaging
metadata).  The work directory is always removed in a ``finally``; the clone is
bounded by a timeout.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .base import GenerationError, creation_info

# A shallow clone is bounded, but a large repo over a slow link can still take a
# while.  Cap it so a single job cannot hang the worker indefinitely.
CLONE_TIMEOUT_SECONDS = 600


def generate_from_git(repo_url: str, output_path: str) -> None:
    """Clone *repo_url* (shallow) and write an SPDX 3 SBOM to *output_path*.

    Raises :class:`GenerationError` with a ``git.*`` descriptor for clone
    failures and a ``pitloom.*`` descriptor for generation failures.
    """
    work_dir = tempfile.mkdtemp(prefix="lumina-clone-")
    try:
        _shallow_clone(repo_url, work_dir)
        _run_pitloom(work_dir, output_path)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _shallow_clone(repo_url: str, work_dir: str) -> None:
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--", repo_url, work_dir],
            check=True,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise GenerationError(
            "git.timeout",
            f"git clone exceeded {CLONE_TIMEOUT_SECONDS}s for {repo_url}",
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip() or f"git exited {exc.returncode}"
        raise GenerationError("git.clone-failed", detail) from exc


def _run_pitloom(project_dir: str, output_path: str) -> None:
    # Imported lazily; see app.generators.base.
    # pylint: disable=import-outside-toplevel
    from pitloom.assemble import generate_sbom

    try:
        generate_sbom(
            project_dir=Path(project_dir),
            output_path=Path(output_path),
            creation_info=creation_info(),
        )
    except Exception as exc:  # noqa: BLE001 - normalised to GenerationError
        raise GenerationError("pitloom.generation-failed", str(exc)) from exc
