# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Generate an SBOM from a Hugging Face Hub URL or model id.

Pitloom reads HF metadata via the HF API and does **not** download model files,
so the host stays light on disk and bandwidth.  ``model_source`` accepts a full
URL, a URL with a tree path, or a bare model id.  HF auth is optional (lower quota
without a token, acceptable for now).
"""

from __future__ import annotations

from pathlib import Path

from .base import GenerationError, creation_info


def generate_from_huggingface(model_source: str, output_path: str) -> None:
    """Write an SPDX 3 SBOM for *model_source* to *output_path*.

    Raises :class:`GenerationError` with a ``pitloom.*`` descriptor on failure.
    """
    # Imported lazily; see app.generators.base.
    # pylint: disable=import-outside-toplevel
    from pitloom.assemble import generate_huggingface_sbom

    try:
        generate_huggingface_sbom(
            model_source=model_source,
            output_path=Path(output_path),
            creation_info=creation_info(),
        )
    except Exception as exc:  # noqa: BLE001 - normalised to GenerationError
        raise GenerationError("pitloom.generation-failed", str(exc)) from exc
