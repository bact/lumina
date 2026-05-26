## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0

FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000
