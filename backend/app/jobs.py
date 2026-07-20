# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Background job execution for Lumina.

Only Mode 1 (SBOM generation) needs background execution: a ``git clone`` plus
Pitloom generation can take minutes.  Modes 2 and 3 stay synchronous.

The API talks to one small ``JobQueue`` boundary and nothing else::

    JobQueue.enqueue(job_name, **kwargs) -> job_id
    JobQueue.get(job_id)                 -> JobRecord

Everything above and below that boundary -- the HTTP contract, the frontend, the
job functions, the generators, the conformance pipeline -- is invariant across
scaling stages.  Only the *backend* changes:

* **Stage 0-1 (now):** :class:`InProcessJobQueue` -- an ``asyncio`` task plus an
  in-memory dict.  Blocking work is offloaded with ``asyncio.to_thread`` and a
  semaphore caps concurrency.  Jobs are lost on restart (accepted).
* **Stage 2 (on load growth):** an ``RQ`` / ``Taskiq`` backend implementing this
  same interface, run as a separate worker process.  See ``docs/design.md``.

To keep that future swap free, **jobs are written as if they already run in a
separate worker**: a top-level named function, JSON-serialisable arguments, a
JSON-serialisable result.  They never close over live in-process objects.  The
queue dispatches by *name* (as a real broker would), so the in-memory backend and
a broker backend resolve the same registry the same way.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

logger = logging.getLogger(__name__)

JobStatus = Literal["queued", "running", "done", "error"]

# A registered job: a top-level callable taking JSON-serialisable keyword
# arguments and returning a JSON-serialisable result.
JobFn = Callable[..., Any]


@dataclass
class JobRecord:
    """The observable state of a single job.

    ``result`` is set only when ``status == "done"``; ``error`` only when
    ``status == "error"``.  Both are JSON-serialisable so this record survives a
    future move across a process boundary unchanged.
    """

    id: str
    status: JobStatus = "queued"
    result: Any = None
    error: str | None = None


@dataclass
class JobQueue:
    """Interface the API depends on.  Backends subclass and override.

    Holds the job registry (``name -> callable``) so every backend dispatches by
    name identically.
    """

    registry: dict[str, JobFn] = field(default_factory=dict)

    def register(self, name: str, fn: JobFn) -> None:
        """Bind *name* to *fn* so it can be enqueued by name."""
        self.registry[name] = fn

    def enqueue(self, job_name: str, **kwargs: Any) -> str:
        """Schedule ``registry[job_name](**kwargs)`` and return a job id."""
        raise NotImplementedError

    def get(self, job_id: str) -> JobRecord | None:
        """Return the job's current record, or ``None`` if the id is unknown."""
        raise NotImplementedError


class InProcessJobQueue(JobQueue):
    """Stage 0-1 backend: run jobs in this process, track state in memory.

    The job runs as an ``asyncio`` task.  The (blocking) job function is offloaded
    to a worker thread with ``asyncio.to_thread`` so it never stalls the event
    loop, even for a multi-minute clone.  A semaphore caps how many run at once so
    concurrent large clones cannot exhaust the host.

    State lives in an in-memory dict, so **jobs are lost on restart** -- an
    accepted trade at this stage (the user simply resubmits).
    """

    def __init__(
        self,
        registry: dict[str, JobFn] | None = None,
        concurrency: int = 1,
        max_finished_jobs: int = 1000,
    ) -> None:
        super().__init__(registry=registry or {})
        self._jobs: dict[str, JobRecord] = {}
        self._semaphore = asyncio.Semaphore(concurrency)
        # Keep at most this many finished records; oldest are evicted first so
        # the dict cannot grow without bound on a long-running instance.
        self._max_finished_jobs = max_finished_jobs
        # Hold a reference to each task so it is not garbage-collected mid-run.
        self._tasks: set[asyncio.Task[None]] = set()

    def enqueue(self, job_name: str, **kwargs: Any) -> str:
        if job_name not in self.registry:
            raise KeyError(f"No job registered under {job_name!r}")
        self._evict_finished()
        job_id = uuid.uuid4().hex
        self._jobs[job_id] = JobRecord(id=job_id, status="queued")
        task = asyncio.create_task(self._run(job_id, job_name, kwargs))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job_id

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    def _evict_finished(self) -> None:
        """Drop the oldest finished records beyond ``max_finished_jobs``.

        Dict insertion order gives oldest-first; queued/running jobs are
        never evicted.
        """
        finished = [
            job_id
            for job_id, record in self._jobs.items()
            if record.status in ("done", "error")
        ]
        for job_id in finished[: len(finished) - self._max_finished_jobs]:
            del self._jobs[job_id]

    async def _run(
        self,
        job_id: str,
        job_name: str,
        kwargs: dict[str, Any],
    ) -> None:
        fn = self.registry[job_name]
        async with self._semaphore:
            record = self._jobs[job_id]
            record.status = "running"
            try:
                # The job function is blocking (subprocess + file/network I/O);
                # run it off the event loop.
                record.result = await asyncio.to_thread(fn, **kwargs)
                record.status = "done"
            except Exception as exc:  # noqa: BLE001, pylint: disable=broad-exception-caught
                # Job runner boundary: any failure must be captured and
                # reported via JobRecord.error, so we deliberately catch all.
                logger.exception("Job %s (%s) failed", job_id, job_name)
                record.error = str(exc)
                record.status = "error"
