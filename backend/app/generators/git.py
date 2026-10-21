# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Generate an SBOM from a Git repository URL.

Pitloom does the work: it reads the URL (a clone URL, or the address of a
repository web page naming a branch, tag or commit and a folder), follows the
Git server's own redirect, shallow-clones into a temporary directory, reads the
project and removes the directory (``pitloom.assemble.generate_git_project_sbom``).
Lumina's part is policy: the address check (an SSRF guard, handed to Pitloom to
run on every redirect target), the SBOM's author, and turning a Pitloom failure
into a :class:`~app.generators.base.GenerationError`.  What Pitloom logs (the
redirects followed, the repository and branch named, the ``git`` commands) reaches
the generation log through the Pitloom logger.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from .base import GenerationError, creation_info


def generate_from_git(
    repo_url: str, output_path: str, check_url: Callable[[str], None]
) -> None:
    """Write an SPDX 3 SBOM of the repository *repo_url* names to *output_path*.

    *check_url* raises :class:`GenerationError` for an address that must not be
    fetched; Pitloom calls it with every redirect target before requesting it.

    Raises :class:`GenerationError`: with the code Pitloom gives a refused or
    failed fetch (``git.clone-failed``, ``git.timeout``, ``git.ref-not-found``,
    ``git.path-not-found``, ``git.no-project``, ...), with *check_url*'s own for a
    refused address, and ``pitloom.generation-failed`` for any other failure.
    """
    # Imported lazily; see app.generators.base.
    # pylint: disable=import-outside-toplevel
    from pitloom.assemble import generate_git_project_sbom
    from pitloom.core.config import PitloomConfig
    from pitloom.extract.remote import RemoteSourceError

    try:
        generate_git_project_sbom(
            repo_url,
            check_url=check_url,
            output_path=Path(output_path),
            creation_metadata=creation_info(),
            # The repository is untrusted: Pitloom ignores its own
            # [tool.pitloom]; the empty config says Lumina wants none.
            pitloom_config=PitloomConfig(),
        )
    except RemoteSourceError as exc:
        raise GenerationError(exc.code, str(exc)) from exc
    except GenerationError:
        raise
    except Exception as exc:
        raise GenerationError("pitloom.generation-failed", str(exc)) from exc
