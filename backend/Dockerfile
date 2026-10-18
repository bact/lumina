## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0

FROM python:3.14-slim

WORKDIR /app

# git is needed at runtime for Mode-1 SBOM generation (shallow clone of a
# repository URL before Pitloom scans the checkout).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# SPDX licence list for Pitloom: without it licence ids stay as written (for
# example "apache-2.0") and every generated SBOM carries a warning saying so.
# A failed download does not fail the build; the warning then tells the truth.
RUN licenseid update || echo "licenseid update failed: licence ids will not be canonicalised"

COPY app/ ./app/

EXPOSE 8000
