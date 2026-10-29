# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0
"""The Hugging Face Dockerfile inlines the standalone image's config files."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
STANDALONE = ROOT / "docker" / "standalone"
HF_DOCKERFILE = ROOT / "docker" / "hfspaces" / "Dockerfile"

# Path inside the HF image -> canonical file in docker/standalone/.
INLINED = {
    "/etc/supervisor/conf.d/lumina.conf": "supervisord.conf",
    "/etc/nginx/lumina.conf.template": "nginx.conf.template",
    "/start.sh": "start.sh",
    "/start-nginx.sh": "start-nginx.sh",
}

HEREDOC = re.compile(
    r"^RUN cat > (?P<path>\S+) << 'EOF'\n(?P<body>.*?)^EOF$",
    re.DOTALL | re.MULTILINE,
)


def _code(text: str) -> list[str]:
    """The lines that do something: no comments, no blank lines."""
    lines = (line.rstrip() for line in text.splitlines())
    return [line for line in lines if line.strip() and not line.lstrip().startswith("#")]


@pytest.mark.parametrize(("image_path", "canonical"), sorted(INLINED.items()))
def test_inlined_file_matches_the_standalone_copy(
    image_path: str, canonical: str
) -> None:
    """Each heredoc in the HF Dockerfile equals its standalone file.

    The two images install Lumina under /lumina and /app; comments may differ.
    """
    heredocs = {
        m["path"]: m["body"]
        for m in HEREDOC.finditer(HF_DOCKERFILE.read_text(encoding="utf-8"))
    }
    standalone = (STANDALONE / canonical).read_text(encoding="utf-8")
    assert _code(heredocs[image_path]) == _code(standalone.replace("/app/", "/lumina/"))
