---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: Apache-2.0
---

# Deploying Lumina on the public internet (free tier)

This is a step-by-step guide to run Lumina on the public internet at **$0/month**,
using an always-free virtual machine and a free Cloudflare Tunnel for HTTPS.

You can copy–paste every command. Total time: ~30–45 minutes.

## What you are deploying

Lumina is a small multi-container app (see `docker-compose.yml`):

| Service    | Role                                                        | Needed for |
| :--------- | :---------------------------------------------------------- | :--------- |
| `nginx`    | Serves the static frontend and proxies `/api/` to the API   | always     |
| `api`      | FastAPI conformance checker (`/api/v1/sbom/check`, ...)     | always     |
| `worker`   | Celery worker for long-running **SBOM generation**          | optional   |
| `redis`    | Broker/cache for the worker                                 | optional   |

Two important facts that make this easy:

- The **frontend needs no build step** — it is static HTML + in-browser Babel +
  React from a CDN. nginx just serves the `frontend/` folder.
- The **core conformance check is synchronous** and does **not** use Redis. The
  `worker` + `redis` services are only for the SBOM-*generation* feature. You can
  deploy without them (see [Lean deployment](#lean-deployment-nginx--api-only)).

The result: a public HTTPS URL (e.g. `https://lumina.example.com` or a free
`https://<random>.trycloudflare.com`) that anyone can use.

## Cost summary

| Item                          | Provider                 | Cost        |
| :---------------------------- | :----------------------- | :---------- |
| Always-on Linux VM            | Oracle Cloud Always Free | **$0**      |
| Public HTTPS + tunnel         | Cloudflare Tunnel        | **$0**      |
| Stable custom domain (option) | any registrar            | ~$10/year (optional — a free `trycloudflare.com` URL works without it) |

> **Why a VM instead of a free PaaS?** Lumina's nginx proxies to the API by its
> compose service name (`http://api:8000`). Keeping the whole `docker compose`
> on one host preserves that wiring unchanged, and a single free VM runs all four
> services comfortably. Free PaaS alternatives are listed at the
> [end](#other-free-options).

---

## Prerequisites

- An **Oracle Cloud** account (free, no charge): <https://www.oracle.com/cloud/free/>
  (any provider's free VM works — see [other options](#other-free-options)).
- A **Cloudflare** account (free): <https://dash.cloudflare.com/sign-up>
- An SSH key pair on your laptop. Create one if needed:

  ```bash
  ssh-keygen -t ed25519 -C "lumina-deploy"
  ```

---

## Part 1 — Create a free always-on server

Using **Oracle Cloud Infrastructure (OCI) Always Free** (an Ampere ARM VM that
never expires):

1. Sign in to the OCI Console → **Menu → Compute → Instances → Create instance**.
2. **Name:** set the instance name to `lumina` (or any name you prefer).
3. **Primary VNIC information** (scroll down to this section):
   - **Hostname:** `lumina`
   - **VCN / Subnet:** leave the pre-selected default (`Public Subnet-vcn-...`).
     It has an internet gateway attached, which the instance needs to reach Docker
     Hub and Cloudflare outbound. No inbound ports are opened by this choice —
     the OCI security list still blocks them by default.
   - **Public IPv4 address:** keep **Assign automatically** checked.
     This is the IP you will SSH to. IPv6 is not needed — leave it unchecked.
   - **Private DNS record:** select **Assign a private DNS record**.
     This registers the hostname (`lumina`) in the VCN's internal DNS — useful
     if you add more instances later. No external exposure.
4. **Image and shape:**
   - Image: **Canonical Ubuntu 24.04 Minimal aarch64**
   - Shape: **Ampere (VM.Standard.A1.Flex)** — set **1–2 OCPU, 6–12 GB RAM**
     (all within the Always Free allowance).
5. **SSH keys:** under **Add SSH keys**, choose **Paste public key** and paste
   the contents of `~/.ssh/id_ed25519.pub`.
6. **Initialization script:** expand the **Advanced options → Management** section,
   set **Initialization script** to **Paste cloud-init script**, and paste:

   ```bash
   #!/bin/bash
   apt-get update
   apt-get install -y curl git
   curl -fsSL https://get.docker.com | sh
   usermod -aG docker ubuntu
   ```

   This installs Docker automatically at first boot. The instance is ready
   to use by the time you SSH in (~2–3 minutes after creation).

7. **Boot volume:** expand **Advanced options → Boot volume**:
   - **Size:** 60–80 GB (default 50 GB is fine too; up to 200 GB is free).
   - **Performance:** leave at **Balanced (10 VPUs)** — included in Always Free.
     Higher Performance (20 VPUs) and above cost extra.

8. Click **Create**. When it is running, note the **public IPv4 address**.
9. SSH in (default user on Ubuntu images is `ubuntu`):

   ```bash
   ssh ubuntu@<PUBLIC_IP>
   ```

> **Firewall:** With Cloudflare Tunnel (Part 5) you do **not** need to open any
> inbound ports — the tunnel makes only outbound connections. Leave the OCI
> security list closed. (If you later want direct access, open TCP 80/443 in the
> instance's subnet **Security List** and run `sudo ufw allow 80,443/tcp`.)

---

## Part 2 — Verify Docker on the server

The initialization script from Part 1 already installed Docker and added `ubuntu`
to the `docker` group. After SSH-ing in, activate the group membership and verify:

```bash
# Activate docker group without logging out/in
newgrp docker

# Verify
docker version && docker compose version
```

If `docker: command not found`, the cloud-init script may still be running — wait
a minute and retry. Check its log with `sudo cat /var/log/cloud-init-output.log`.

---

## Part 3 — Get Lumina and add a production config

```bash
# Clone the repo (use your fork's URL if you have one)
git clone https://github.com/bact/lumina.git
cd lumina
```

The repo's `docker-compose.yml` is dev-oriented (live-reload, source mounts,
exposed debug ports). Create a **production override** that hardens it — baked
image, no `--reload`, no source mounts, no exposed DB/API ports:

```bash
cat > docker-compose.prod.yml <<'YAML'
# Production overrides. Run with:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
services:
  nginx:
    restart: always
    # Reachable on the host for local checks / quick tunnel. Cloudflare Tunnel
    # (Part 5) reaches it over the compose network as http://nginx:80, so you may
    # set this to "127.0.0.1:8080:80" to keep it off the public interface.
    ports:
      - "80:80"

  api:
    restart: always
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000   # no --reload
    volumes: []        # use the baked image, not a host mount
    ports: []          # do not expose the API directly

  worker:
    restart: always
    volumes: []

  redis:
    restart: always
    ports: []          # do not expose Redis

  # Cloudflare Tunnel connector (named tunnel). Enabled only with --profile tunnel.
  cloudflared:
    image: cloudflare/cloudflared:latest
    profiles: ["tunnel"]
    restart: always
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
    depends_on:
      - nginx
YAML
```

---

## Part 4 — Build and start Lumina

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Wait for the build (first time pulls base images and installs Python deps), then
check it is healthy **on the VM**:

```bash
docker compose ps
curl -s http://localhost/api/health        # -> {"status":"ok"} (or similar)
curl -sI http://localhost/                  # -> 200, serves index.html
```

If both respond, Lumina is running locally on the VM. Now make it public.

---

## Part 5 — Put it on the public internet (Cloudflare Tunnel)

Pick **one** option.

### Option A — Stable URL on your own domain (recommended)

Needs a domain added to your free Cloudflare account (any registrar; ~$10/yr).

1. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels →
   Create a tunnel → Cloudflared**. Name it `lumina`.
2. Cloudflare shows an **install token**. Copy the token value (the long string
   after `--token`).
3. On the VM, save it and start the connector:

   ```bash
   echo "TUNNEL_TOKEN=<PASTE_TOKEN_HERE>" >> .env
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile tunnel up -d
   ```

4. Back in the tunnel's **Public Hostnames** tab, click **Add a public hostname**:
   - **Subdomain:** `lumina` (or any) · **Domain:** your domain
   - **Service:** `HTTP` → `nginx:80`
   - Save.
5. Visit **`https://lumina.yourdomain.com`** — Cloudflare terminates TLS for free.

### Option B — Instant URL, no domain, $0 (ephemeral)

Great for a quick demo. The URL is random and changes if the tunnel restarts.

```bash
docker run --rm --network lumina_default \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://nginx:80
```

It prints a line like `https://<random-words>.trycloudflare.com` — share that.

> The `--network lumina_default` name is `<project>_default`; the project name is
> the folder (`lumina`). Confirm with `docker network ls`. Keep this command
> running (use `tmux`/`screen`, or turn it into a service like the
> `cloudflared` block above but with `--url http://nginx:80` instead of a token).

---

## Part 6 — Verify the public site

Open the public URL in a browser. You should see the Lumina UI. Test the API
through the public hostname:

```bash
curl -s https://lumina.yourdomain.com/api/health
curl -s https://lumina.yourdomain.com/api/v1/regulations
```

Upload an SBOM in the UI (or via the API) to confirm conformance checking works
end-to-end.

---

## Operating it

```bash
# Logs (all services, or one)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

# Update to the latest code
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Restart / stop
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

`restart: always` plus Docker's default start-on-boot means Lumina comes back up
after a VM reboot.

---

## Lean deployment (nginx + api only)

The core conformance checker does not need the worker or Redis. To run only the
two required services (lighter, fewer moving parts), start just those:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build nginx api
```

Add `worker` and `redis` later only if you enable SBOM-generation features.

---

## Hardening for public use

These are recommended once it works:

1. **Tighten CORS.** In prod the frontend is same-origin (served by nginx, calls
   `/api`), so the wildcard is unnecessary. In `backend/app/main.py`:

   ```python
   allow_origins=["https://lumina.yourdomain.com"],   # was ["*"]
   ```

   Rebuild the `api` service afterward.
2. **Limit upload size.** Add to `proxy/prod.conf` inside `server { … }`:

   ```nginx
   client_max_body_size 25m;   # cap SBOM upload size
   ```

3. **Keep ports off the public interface.** With the tunnel you don't need the
   host `80:80` publish — set nginx `ports` to `127.0.0.1:8080:80` in
   `docker-compose.prod.yml`, and keep the OCI security list closed.
4. **Cap resources** so a large SBOM can't exhaust the VM. Per service in the
   prod override:

   ```yaml
   deploy:
     resources:
       limits: { cpus: "1.0", memory: 768m }
   ```

5. **Updates.** Rebuild periodically (`git pull` + `up -d --build`) to pick up
   dependency and security fixes.

---

## Other free options

The VM path above is the most faithful (runs the repo's compose unchanged) and
always-on. Alternatives, with trade-offs:

| Platform                     | Fits Lumina?                                                                 | Notes |
| :--------------------------- | :-------------------------------------------------------------------------- | :---- |
| **Oracle Cloud Always Free** | ✅ full stack via `docker compose`                                          | Recommended. Genuinely always-free ARM VM. |
| **Fly.io**                   | ⚠️ api + redis + worker as separate apps                                    | Small free allowance; needs a card; nginx upstream must be re-pointed. |
| **Render**                   | ⚠️ Static Site (frontend) + Web Service (api) free; Redis free 25 MB         | Background **worker is paid**; free web services **sleep** after 15 min idle; cross-service URLs need CORS + nginx upstream changes. |
| **Koyeb**                    | ⚠️ one free web service                                                      | Enough for a combined nginx+api image; not the 4-service compose. |
| **Hugging Face Spaces**      | ⚠️ single Docker container, free, `*.hf.space` HTTPS                         | Requires repackaging nginx+api into one image (e.g. supervisord); sleeps when idle. |

For any of these you would split or repackage the services and re-point nginx's
`/api/` upstream from `http://api:8000` to the API's actual URL. The single-VM
approach avoids that.

---

## Troubleshooting

| Symptom                                   | Fix |
| :---------------------------------------- | :-- |
| "Out of capacity for VM.Standard.A1.Flex" | A1 free slots are scarce. Try another availability domain (AD-2/AD-3) if your region has one. Otherwise retry every few minutes — capacity frees up unpredictably (off-peak hours help). Free tier locks you to your home region; OCI CLI lets you automate retries without timing out. |
| `curl http://localhost/api/health` fails  | `docker compose ... logs api` — usually a Python/dep error or the api still starting. |
| Tunnel up but 502 from the public URL     | Service mapping wrong: it must point to `nginx:80` (not `localhost`/`api`). |
| `docker: permission denied`               | Re-run `newgrp docker` or log out/in after the `usermod -aG docker` step. |
| Build fails on ARM                        | All base images (`python:3.14-slim`, `nginx:1.27-alpine`, `redis:7-alpine`) are multi-arch; ensure you didn't pin an `amd64`-only image. |
| Quick tunnel can't reach nginx            | Use the correct compose network name (`docker network ls`) in `--network`. |
| Site loads but API calls fail in browser  | Check the browser console: if cross-origin, you're not going through nginx — use the tunnel hostname, not the API host directly. |
