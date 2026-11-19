## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0

FROM python:3.14-slim

WORKDIR /app

# git is needed at runtime: Pitloom shallow-clones a repository URL for SBOM
# generation.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# SPDX licence list for Pitloom, to name the licence of a LICENSE file from its
# text. A declared licence (for example "Apache2") is read without it. Offline,
# licenseid falls back to the list in its wheel. A failure does not fail the
# build; the generation log then says the text match was skipped.
RUN licenseid update || echo "licenseid update failed: LICENSE file texts will not be matched"

COPY app/ ./app/

EXPOSE 8000
