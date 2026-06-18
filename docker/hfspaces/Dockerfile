## SPDX-FileContributor: Arthit Suriyawongkul
## SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
## SPDX-FileType: SOURCE
## SPDX-License-Identifier: Apache-2.0
##
## Hugging Face Spaces Dockerfile.
##
## Place this file (named "Dockerfile") at the root of your HF Space repository.
## The Space repo itself can contain only this one file; Lumina is cloned from
## GitHub during the build.
##
## To use your own fork, change LUMINA_REPO to your fork URL, or edit the
## git clone line below.

FROM python:3.14-slim

ENV PORT=7860

ARG LUMINA_REPO=https://github.com/bact/lumina.git
ARG LUMINA_REF=main

RUN apt-get update \
    && apt-get install -y --no-install-recommends git nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${LUMINA_REF} ${LUMINA_REPO} /lumina

WORKDIR /lumina/backend
RUN pip install --no-cache-dir -r requirements.txt

# supervisord drop-in
RUN cat > /etc/supervisor/conf.d/lumina.conf << 'EOF'
[program:api]
command=uvicorn app.main:app --host 127.0.0.1 --port 8000
directory=/lumina/backend
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

# nginx config template (__PORT__ replaced at start time)
RUN cat > /etc/nginx/lumina.conf.template << 'EOF'
server {
    listen __PORT__ default_server;
    server_name _;

    root /lumina/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8000/api/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
    }
}
EOF

# Entrypoint: writes nginx config from template, then starts supervisord
RUN cat > /start.sh << 'EOF'
#!/bin/sh
PORT=${PORT:-7860}
rm -f /etc/nginx/sites-enabled/default
sed "s/__PORT__/${PORT}/g" /etc/nginx/lumina.conf.template \
    > /etc/nginx/sites-enabled/lumina.conf
exec supervisord -n -c /etc/supervisor/supervisord.conf
EOF
RUN chmod +x /start.sh

EXPOSE 7860
CMD ["/start.sh"]
