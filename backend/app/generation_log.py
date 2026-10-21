# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""The log of one SBOM generation, for the user to read.

While :func:`app.generate.generate_and_check` runs, everything the generator side
did is recorded here in order: the steps Lumina took and every record Pitloom
logged (INFO and above: the redirects followed, the repository, branch and
folder named, the ``git`` command lines).  The response carries it as
``generation_log``; nothing is invented, and a line the generator did not
produce is not added.

The log lives in a context variable so the generators call :func:`note` without
passing it around; outside a generation :func:`note` does nothing.
"""

from __future__ import annotations

import contextlib
import contextvars
import logging
import re
import tempfile
import threading
import time
from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel

LogSource = Literal["lumina", "pitloom"]
LogLevel = Literal["info", "warning", "error"]

MAX_LOG_LINES = 1000
MAX_LINE_CHARS = 2000


def hide_temp_dir(text: str) -> str:
    """*text* without the server's temporary directory (a path, not a URL part)."""
    pattern = rf"(?<![\w./:-]){re.escape(tempfile.gettempdir())}"
    return re.sub(pattern, "<tmp>", text)


class LogLine(BaseModel):
    """One line of the generation log."""

    source: LogSource
    """Who wrote it: ``lumina`` (a step Lumina took) or ``pitloom`` (a record
    Pitloom logged)."""
    level: LogLevel
    message: str
    elapsed_ms: int
    """Milliseconds since the generation started."""


class GenerationLog:
    """An ordered, bounded list of :class:`LogLine`."""

    def __init__(self) -> None:
        self.lines: list[LogLine] = []
        self._dropped = 0
        self._start = time.monotonic()

    def _elapsed_ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)

    def add(self, source: LogSource, level: LogLevel, message: str) -> None:
        """Append one line (a multi-line *message* becomes several lines)."""
        for text in hide_temp_dir(message).splitlines() or [""]:
            if len(self.lines) >= MAX_LOG_LINES:
                self._dropped += 1
                continue
            if len(text) > MAX_LINE_CHARS:
                cut = len(text) - MAX_LINE_CHARS
                text = f"{text[:MAX_LINE_CHARS]} ... ({cut} more characters)"
            self.lines.append(
                LogLine(
                    source=source,
                    level=level,
                    message=text,
                    elapsed_ms=self._elapsed_ms(),
                )
            )

    def finish(self) -> list[LogLine]:
        """The lines, with a closing line when some were left out."""
        if self._dropped:
            # Past the limit on purpose: the user must see that lines are missing.
            self.lines.append(
                LogLine(
                    source="lumina",
                    level="warning",
                    message=f"{self._dropped} more lines not shown (limit).",
                    elapsed_ms=self._elapsed_ms(),
                )
            )
            self._dropped = 0
        return self.lines


_current: contextvars.ContextVar[GenerationLog | None] = contextvars.ContextVar(
    "generation_log", default=None
)


def note(source: LogSource, level: LogLevel, message: str) -> None:
    """Add a line to the generation in progress; nothing when there is none."""
    log = _current.get()
    if log is not None:
        log.add(source, level, message)


class _PitloomHandler(logging.Handler):
    """Copy the INFO-and-above records Pitloom logs on one thread into a log."""

    def __init__(self, log: GenerationLog) -> None:
        super().__init__(level=logging.INFO)
        self._log = log
        self._thread = threading.get_ident()

    def emit(self, record: logging.LogRecord) -> None:
        """Keep the record, unless it is not Pitloom's or from another thread."""
        if record.thread != self._thread or record.name.split(".")[0] != "pitloom":
            return
        level: LogLevel = "info"
        if record.levelno >= logging.ERROR:
            level = "error"
        elif record.levelno >= logging.WARNING:
            level = "warning"
        self._log.add("pitloom", level, record.getMessage())


@contextlib.contextmanager
def recording(log: GenerationLog) -> Iterator[None]:
    """Make *log* the current one and record Pitloom's log records into it.

    The handler sits on the root logger for the same reason as the warning
    collector in :mod:`app.generate`: Pitloom replaces the handlers of its own
    logger.
    """
    handler = _PitloomHandler(log)
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    token = _current.set(log)
    try:
        yield
    finally:
        _current.reset(token)
        root_logger.removeHandler(handler)
