# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0

"""Tests for the generation log (app.generation_log) and its use by app.generate."""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
from pathlib import Path

import pytest
from pitloom.logging_config import configure_logging

from app import generate
from app.generation_log import (
    MAX_LINE_CHARS,
    MAX_LOG_LINES,
    GenerationLog,
    note,
    recording,
)
from app.generators import GenerationError

SPDX3_FIXTURE = Path(__file__).parent / "fixtures" / "sbom" / "spdx3_g7ai.json"


@pytest.fixture(autouse=True)
def _pitloom_logging() -> None:
    """Pitloom's own logger set up the way its entry points do."""
    configure_logging()


def test_note_outside_a_generation_does_nothing() -> None:
    """Generators call note() without a log in hand; it is a no-op outside a run."""
    note("lumina", "info", "nobody is listening")  # must not raise


def test_a_multi_line_message_is_one_log_line_per_line() -> None:
    """Tool output with several lines becomes one log line per line."""
    log = GenerationLog()
    log.add("git", "info", "Cloning into 'x'...\nremote: done")
    assert [line.message for line in log.finish()] == [
        "Cloning into 'x'...",
        "remote: done",
    ]


def test_the_temporary_directory_is_hidden() -> None:
    """The server's temporary directory path is not shown to the user."""
    log = GenerationLog()
    log.add("lumina", "info", f"cloning into {tempfile.gettempdir()}/lumina-clone-x")
    assert log.finish()[0].message == "cloning into <tmp>/lumina-clone-x"


def test_a_long_line_is_cut_and_says_so() -> None:
    """A line over the cap is cut and the cut is stated."""
    log = GenerationLog()
    log.add("git", "info", "x" * (MAX_LINE_CHARS + 7))
    message = log.finish()[0].message
    assert message.startswith("x" * MAX_LINE_CHARS)
    assert message.endswith("(7 more characters)")


def test_too_many_lines_are_counted_not_kept() -> None:
    """Past the line limit lines are counted, and the count is shown last."""
    log = GenerationLog()
    log.add("git", "info", "\n".join(["l"] * (MAX_LOG_LINES + 3)))
    lines = log.finish()
    assert len(lines) == MAX_LOG_LINES + 1
    assert lines[-1].message == "3 more lines not shown (limit)."
    assert lines[-1].level == "warning"


@pytest.mark.parametrize(
    ("emit", "expected"),
    [
        (lambda: logging.getLogger("pitloom.x").info("INFO %s", "kept"), "info"),
        (lambda: logging.getLogger("pitloom.x").warning("warn"), "warning"),
        (lambda: logging.getLogger("pitloom.x").error("err"), "error"),
        (lambda: logging.getLogger("pitloom.x").debug("hidden"), None),
        (lambda: logging.getLogger("other.x").warning("not pitloom"), None),
    ],
    ids=["info", "warning", "error", "debug", "other-logger"],
)
def test_only_pitloom_records_of_info_and_above_are_recorded(
    emit: object, expected: str | None
) -> None:
    """INFO and above from Pitloom's loggers only; DEBUG and other loggers not."""
    log = GenerationLog()
    with recording(log):
        emit()  # type: ignore[operator]
    lines = log.finish()
    assert [line.level for line in lines] == ([expected] if expected else [])
    assert all(line.source == "pitloom" for line in lines)


def test_records_of_another_thread_are_not_recorded() -> None:
    """A concurrent generation's records do not leak into this log."""
    log = GenerationLog()
    with recording(log):
        worker = threading.Thread(
            target=lambda: logging.getLogger("pitloom.x").warning("other thread")
        )
        worker.start()
        worker.join()
    assert not log.finish()


def test_recording_stops_after_the_context_exits() -> None:
    """Nothing is recorded once the generation has ended."""
    log = GenerationLog()
    with recording(log):
        pass
    logging.getLogger("pitloom.x").warning("late")
    note("lumina", "info", "late")
    assert not log.finish()


def test_the_response_carries_the_log_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Lumina's steps and Pitloom's records interleave in the order they happened."""

    def fake_generate(_url: str, sbom_path: str) -> None:
        note("lumina", "info", "$ git clone ...")
        logging.getLogger("pitloom.x").info("MODEL=m: named after its file")
        shutil.copy(SPDX3_FIXTURE, sbom_path)

    monkeypatch.setattr(generate, "_generate", fake_generate)
    response = generate.generate_and_check("https://example.org/r", "ntia")
    assert response.generation_log is not None
    assert [(line.source, line.message) for line in response.generation_log] == [
        ("lumina", "Generating an SBOM for https://example.org/r"),
        ("lumina", "$ git clone ..."),
        ("pitloom", "MODEL=m: named after its file"),
        ("lumina", "Pitloom finished; reading the SBOM it wrote"),
    ]
    assert [line.elapsed_ms for line in response.generation_log] == sorted(
        line.elapsed_ms for line in response.generation_log
    )


def test_a_failed_generation_keeps_its_log(monkeypatch: pytest.MonkeyPatch) -> None:
    """The failure is the last line of the log, so the user sees why it stopped."""

    def failing(_url: str, _path: str) -> None:
        note("lumina", "info", "$ git clone ...")
        raise GenerationError("git.clone-failed", "fatal: repository not found")

    monkeypatch.setattr(generate, "_generate", failing)
    response = generate.generate_and_check("https://example.org/r", "ntia")
    assert response.generation_log is not None
    last = response.generation_log[-1]
    assert (last.level, last.message) == (
        "error",
        "[git.clone-failed] fatal: repository not found",
    )
    assert response.run.execution_successful is False
