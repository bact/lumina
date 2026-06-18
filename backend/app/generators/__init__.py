# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""SBOM generators for Mode 1 (artefact-URL input).

One interface, two source kinds, both backed by Pitloom (SPDX 3 JSON-LD):

* :func:`generate_from_git` -- shallow-clone a Git repo, then run Pitloom on it.
* :func:`generate_from_huggingface` -- run Pitloom on an HF Hub model id/URL.

Errors are normalised to :class:`GenerationError`, which carries a SARIF-style
``descriptor_id`` for the caller to surface in ``CheckRun.notifications``.
"""

from .base import GenerationError
from .git import generate_from_git
from .hf import generate_from_huggingface

__all__ = [
    "GenerationError",
    "generate_from_git",
    "generate_from_huggingface",
]
