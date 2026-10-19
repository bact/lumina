# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Lumina API -- FastAPI application."""

import os
import re
import tempfile
from typing import Annotated, Any, get_args

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from .conformance import (
    CHECKER_STANDARDS,
    RegulationId,
    SbomCheckResponse,
    run_checker,
)
from .generate import generate_and_check
from .jobs import InProcessJobQueue
from .sarif_ingest import SarifIngestError, parse_sarif
from .sbom_source import load_sbom

app = FastAPI(
    title="Lumina",
    description="SBOM conformance checker API.",
    version="0.1.0",
)

# Comma-separated allowed origins.  Default "*" is fine behind the nginx
# same-origin proxy; set e.g. LUMINA_CORS_ORIGINS=https://lumina.example.org
# for any public deployment (see INSTALL.md "Hardening for public use").
_cors_origins = [
    origin.strip()
    for origin in os.environ.get("LUMINA_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload cap for POST /api/v1/sbom/check (the whole file is held in memory) and
# for the declared size of a POST /api/v1/sarif/import body.  Multipart framing
# and the other form fields add to an upload's request body.  The nginx configs
# allow 11m per request, 1 MiB above the default cap.
_FORM_OVERHEAD = 64 * 1024
_DEFAULT_MAX_SBOM_BYTES = 10 * 1024 * 1024


def _max_sbom_bytes() -> int:
    """``LUMINA_MAX_SBOM_BYTES``, or 10 MiB when unset or not a positive integer."""
    raw = os.environ.get("LUMINA_MAX_SBOM_BYTES", "")
    return int(raw) if raw.isdigit() and int(raw) > 0 else _DEFAULT_MAX_SBOM_BYTES


MAX_SBOM_BYTES = _max_sbom_bytes()

# Stage 0-1 job backend: runs Mode-1 SBOM generation in-process (see jobs.py and
# docs/design.md "Background job execution").  Swappable for an RQ/Taskiq backend
# at Stage 2 without touching the endpoints below.
_jobs = InProcessJobQueue()
_jobs.register("generate_and_check", generate_and_check)


class ArtifactCheckRequest(BaseModel):
    """Body for ``POST /api/v1/artifact/check``."""

    artifact_url: str
    regulation_id: RegulationId = "ntia"


class JobSubmission(BaseModel):
    """Response acknowledging an enqueued job."""

    job_id: str


class JobStatusResponse(BaseModel):
    """Current state of a background job.

    ``result`` is set once ``status == "done"``; ``error`` once
    ``status == "error"``.
    """

    status: str
    result: SbomCheckResponse | None = None
    error: str | None = None


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Redirect bare root to the interactive API docs."""
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe used by orchestration and uptime checks."""
    return {"status": "ok"}


@app.get("/api/v1/regulations")
def list_regulations() -> dict[str, Any]:
    """Return the regulations Lumina knows, and whether the checker supports each."""
    return {
        "regulations": [
            {"id": reg_id, "ready": reg_id in CHECKER_STANDARDS}
            for reg_id in get_args(RegulationId)
        ]
    }


@app.post("/api/v1/sbom/check", response_model=SbomCheckResponse)
async def check_sbom(
    request: Request,
    file: Annotated[
        UploadFile,
        File(description="SBOM file (SPDX 2.x / 3.0, JSON/XML/YAML/tag-value)"),
    ],
    regulation: Annotated[RegulationId, Form()] = "ntia",
) -> SbomCheckResponse:
    """
    Upload an SBOM file and check it against the requested regulation.

    A regulation that ntia-conformance-checker does not support returns 501.
    """
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_SBOM_BYTES + _FORM_OVERHEAD:
        raise HTTPException(
            status_code=413, detail=f"SBOM is larger than {MAX_SBOM_BYTES} bytes."
        )
    content = await file.read(MAX_SBOM_BYTES + 1)
    if len(content) > MAX_SBOM_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"SBOM is larger than {MAX_SBOM_BYTES} bytes.",
        )

    with tempfile.NamedTemporaryFile(
        delete=False, suffix=_suffix(file.filename)
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    text = content.decode("utf-8", errors="replace")
    del content  # keep at most the text and its display in memory

    try:
        return await run_in_threadpool(
            _check_upload, tmp_path, regulation, _upload_name(file.filename), text
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"Could not process SBOM: {exc}"
        ) from exc
    finally:
        os.unlink(tmp_path)


@app.post("/api/v1/sarif/import", response_model=SbomCheckResponse)
async def import_sarif(sarif: dict[str, Any], request: Request) -> SbomCheckResponse:
    """
    Read a SARIF 2.1.0 log from any producer, without running a check.

    Rule ids must be of the SBOM requirements ontology form and name one
    supported standard and edition; anything else is refused with 422 (see
    :mod:`app.sarif_ingest`).  Lumina recognises ``ntia-conformance-checker``
    as the producer name; any other producer is reported as ``external-sarif``.
    """
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_SBOM_BYTES:
        raise HTTPException(status_code=413, detail="SARIF log is too large.")
    try:
        return parse_sarif(sarif)
    except SarifIngestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post(
    "/api/v1/artifact/check",
    response_model=JobSubmission,
    status_code=202,
)
async def check_artifact(req: ArtifactCheckRequest) -> JobSubmission:
    """
    Generate an SBOM from an artefact URL (a Git repository or a Hugging Face
    Hub URL) and check it against the requested regulation.

    Generation can take minutes, so this returns a ``job_id`` immediately;
    poll ``GET /api/v1/jobs/{job_id}`` for the result.

    A regulation the checker does not support returns 501 at once, before any
    clone or generation work.
    """
    if req.regulation_id not in CHECKER_STANDARDS:
        raise HTTPException(
            status_code=501,
            detail=f"Regulation '{req.regulation_id}' is not supported by "
            "ntia-conformance-checker.",
        )
    job_id = _jobs.enqueue(
        "generate_and_check",
        artifact_url=req.artifact_url,
        regulation_id=req.regulation_id,
    )
    return JobSubmission(job_id=job_id)


@app.get("/api/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str) -> JobStatusResponse:
    """Return the current status (and, when finished, result) of a job."""
    record = _jobs.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Unknown job id: {job_id}")
    return JobStatusResponse(
        status=record.status, result=record.result, error=record.error
    )


def _check_upload(
    path: str, regulation: RegulationId, filename: str, text: str
) -> SbomCheckResponse:
    """Check the uploaded file at *path*; *text* is its content."""
    return run_checker(path, regulation, load_sbom(filename, text))


def _upload_name(filename: str | None) -> str:
    """The upload's file name without any directory part, or ``sbom``."""
    return (filename or "").replace("\\", "/").rsplit("/", 1)[-1] or "sbom"


_SUFFIX = re.compile(r"\.[A-Za-z0-9]{1,8}")


def _suffix(filename: str | None) -> str:
    """The upload's extension for the temp file; ``.spdx`` unless a plain one."""
    if filename:
        ext = os.path.splitext(filename)[1]
        if _SUFFIX.fullmatch(ext):
            return ext.lower()
    return ".spdx"
