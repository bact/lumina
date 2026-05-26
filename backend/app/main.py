# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Lumina API -- FastAPI application."""

import os
import tempfile
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .conformance import (
    CHECKER_MAP,
    ConformanceEngine,
    ConformanceResult,
    LuminaInternalChecker,
    RegulationId,
)

app = FastAPI(
    title="Lumina",
    description="SBOM viewer and conformance checker API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

_engine = ConformanceEngine()


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Redirect bare root to the interactive API docs."""
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/regulations")
def list_regulations() -> dict:
    """Return the regulations Lumina can check against."""
    return {
        "regulations": [
            {
                "id": reg_id,
                "checker": type(checker).__name__,
                "ready": not isinstance(checker, LuminaInternalChecker),
            }
            for reg_id, checker in CHECKER_MAP.items()
        ]
    }


@app.post("/api/v1/sbom/check", response_model=ConformanceResult)
async def check_sbom(
    file: Annotated[
        UploadFile,
        File(description="SBOM file (SPDX 2.x / 3.0, JSON/XML/YAML/tag-value)"),
    ],
    regulation: Annotated[RegulationId, Form()] = "ntia",
) -> ConformanceResult:
    """
    Upload an SBOM file and check it against the requested regulation.

    Only 'ntia' is fully implemented today.  Other regulations raise
    501 until LuminaInternalChecker is ported from frontend/data.js.
    """
    content = await file.read()

    with tempfile.NamedTemporaryFile(
        delete=False, suffix=_suffix(file.filename)
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        return _engine.check(tmp_path, regulation)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not process SBOM: {exc}"
        ) from exc
    finally:
        os.unlink(tmp_path)


def _suffix(filename: str | None) -> str:
    if not filename:
        return ".spdx"
    ext = filename.rsplit(".", 1)[-1].lower()
    return f".{ext}" if ext else ".spdx"
