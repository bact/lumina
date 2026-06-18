# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Shared pieces for the SBOM generators.

Both generators are backed by Pitloom and emit SPDX 3 JSON-LD.  This module holds
what they have in common: the typed error they raise (carrying a SARIF-style
``descriptor_id`` so the caller can surface it in ``CheckRun.notifications``) and
the Pitloom creation metadata stamped on every generated SBOM.

Pitloom is imported lazily inside the helpers so importing the app -- or running
tests that never generate -- does not pull in the SPDX/Pitloom dependency tree.
"""

from __future__ import annotations

from typing import Any


class GenerationError(Exception):
    """An SBOM-generation failure with a SARIF-style descriptor id.

    ``descriptor_id`` mirrors the producer notification classes used elsewhere
    (e.g. ``git.clone-failed``, ``git.timeout``, ``pitloom.generation-failed``,
    ``pitloom.url-unsupported``) so :mod:`app.generate` can map it straight onto a
    ``Notification`` without re-deriving the cause.
    """

    def __init__(self, descriptor_id: str, message: str) -> None:
        super().__init__(message)
        self.descriptor_id = descriptor_id
        self.message = message


def creation_info() -> Any:
    """Pitloom ``CreationMetadata`` identifying Lumina as the SBOM creator."""
    # Imported lazily; see module docstring.
    # pylint: disable=import-outside-toplevel
    from pitloom.core.creation import CreationMetadata

    return CreationMetadata(creator_name="Lumina")
