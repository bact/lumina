#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Container entrypoint: writes the nginx server block from the template
# (substituting __PORT__ with $PORT), then starts supervisord.
#
# PORT is injected by Cloud Run (8080) or defaults to 7860 for
# Hugging Face Spaces and local testing.

PORT=${PORT:-7860}

# Remove the Debian default site (it may be a symlink; replace with our config).
rm -f /etc/nginx/sites-enabled/default

sed "s/__PORT__/${PORT}/g" /etc/nginx/lumina.conf.template \
    > /etc/nginx/sites-enabled/lumina.conf

exec supervisord -n -c /etc/supervisor/supervisord.conf
