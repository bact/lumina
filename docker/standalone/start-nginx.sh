#!/bin/sh
# SPDX-FileContributor: Arthit Suriyawongkul
# SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
# SPDX-FileType: SOURCE
# SPDX-License-Identifier: Apache-2.0
#
# Starts nginx only once the API answers /api/health.
#
# nginx is the process that listens on $PORT, and a platform such as Cloud Run
# counts the container as started as soon as that port is open. If nginx
# opened it first, the platform could throttle the CPU while the API was still
# importing its packages, and every /api/ call would return 502. Holding nginx
# back keeps the port closed, and the start-up CPU available, until the API is
# ready.
#
# LUMINA_API_WAIT is the number of seconds to wait (default 120, below Cloud
# Run's 240 s start-up limit). If the API never answers, exit non-zero: the
# platform then reports a container that failed to start, which is easier to
# diagnose than a site that loads and fails on every /api/ call.

WAIT=${LUMINA_API_WAIT:-120}
waited=0

until python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" 2>/dev/null; do
    waited=$((waited + 1))
    if [ "$waited" -ge "$WAIT" ]; then
        echo "start-nginx: the API did not answer /api/health within ${WAIT}s" >&2
        exit 1
    fi
    sleep 1
done

exec /usr/sbin/nginx -g "daemon off;"
