---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Deploying Lumina

Lumina runs as a Docker container (or two). Pick the option that fits your
situation, then follow its section end-to-end.

## Deployment options

| Option | Platform | Cost | Always-on | Config in |
| :----- | :------- | :--- | :-------- | :-------- |
| **A** | VM with Docker Compose — OCI Always Free + Cloudflare Tunnel | $0 | Yes | [`docker/compose/`](docker/compose/) |
| **B** | Hugging Face Spaces | Free tier | Mostly* | [`docker/hfspaces/`](docker/hfspaces/) |
| **C** | Google Cloud Run | Free tier | No (scale-to-zero) | [`docker/standalone/`](docker/standalone/) |

\* HF Spaces may sleep when inactive; the first request after a sleep takes
30–60 s to wake.

**Choosing:**

- No infrastructure to manage, simplest setup → **Option B** (HF Spaces).
- Always-on, full control, can survive a sleeping policy change → **Option A** (VM).
- Low traffic, pay nothing when idle, Google Cloud ecosystem → **Option C** (Cloud Run).

---

## Before you deploy — test locally first

Confirm the app builds and runs on your machine before provisioning anything.
You only need **Docker**, **Docker Compose v2**, and **git**.

```bash
git clone https://github.com/bact/lumina.git
cd lumina
docker compose up --build
```

The first build is slow: it installs the conformance checker and Pitloom from
pinned Git commits, and pulls base images. When it settles, open **<http://localhost>**.

Smoke-test in another terminal:

```bash
curl -s http://localhost/api/health          # -> {"status":"ok"}
curl -s http://localhost/api/v1/standards  # lists standards + readiness
```

Test the **generate-and-check** flow end-to-end (paste a small Git or HF repo
URL in the *Generate & check* screen, or use the API directly):

```bash
# Submit a job — returns {"job_id": "..."}
curl -s -X POST http://localhost/api/v1/artifact/check \
  -H 'Content-Type: application/json' \
  -d '{"artifact_url":"https://github.com/bact/pitloom","standard_id":"ntia"}'

# Poll until status == "done" (substitute the job id)
curl -s http://localhost/api/v1/jobs/<JOB_ID>
```

Stop when satisfied:

```bash
docker compose down
```

> Prefer to iterate without Docker? See
> [README](README.md#run-the-api-outside-docker-faster-iteration) — SBOM
> generation needs `git` on your PATH.

---

## Option A — VM with Docker Compose (OCI Always Free + Cloudflare Tunnel)

**Best for:** always-on, full features, running the unmodified `docker compose`
stack. Lumina's nginx and api services stay on the same host and communicate
over the compose network — no cross-service URLs to re-wire.

**What you need:**

- An [Oracle Cloud](https://www.oracle.com/cloud/free/) account (free, no card
  for Always Free resources). Any Linux VM with Docker works — OCI is used here
  because it offers a genuinely free ARM instance that never expires.
- A [Cloudflare](https://dash.cloudflare.com/sign-up) account (free) for HTTPS.
- An SSH key pair. Create one if needed:

  ```bash
  ssh-keygen -t ed25519 -C "lumina-deploy"
  ```

**Docker config:** [`docker/compose/`](docker/compose/)

### Step 1 — Create the VM

In the OCI Console → **Menu → Compute → Instances → Create instance**:

1. **Name:** `lumina` (or any name you prefer).
2. **Image and shape:**
   - Image: **Canonical Ubuntu 24.04 Minimal aarch64**
   - Shape: **VM.Standard.A1.Flex** — set **1 OCPU, 6 GB RAM**. The free
     allowance is 4 OCPU / 24 GB total across all A1 instances; start small for
     better capacity availability.
3. **Primary VNIC** (scroll down):
   - **Hostname:** `lumina`
   - **VCN / Subnet:** leave the default (`Public Subnet-vcn-...`) — it has an
     internet gateway for outbound traffic.
   - **Public IPv4:** keep **Assign automatically**.
   - **Private DNS record:** select **Assign a private DNS record**.
4. **SSH keys:** choose **Paste public key** and paste `~/.ssh/id_ed25519.pub`.
5. **Initialization script:** expand **Advanced options → Management → Paste
   cloud-init script** and paste the contents of
   [`scripts/cloud-init.sh`](scripts/cloud-init.sh):

   ```bash
   #!/bin/bash
   apt-get update
   apt-get install -y curl git
   curl -fsSL https://get.docker.com | sh
   usermod -aG docker ubuntu
   ```

6. **Boot volume:** expand **Advanced options → Boot volume**:
   - **Size:** 60–80 GB (minimum 47 GB; the 200 GB Always Free allowance is
     shared across all volumes).
   - **Performance:** **Balanced (10 VPUs)** — included free.
7. Click **Create**. Note the **public IPv4 address** when it reaches Running.
8. SSH in:

   ```bash
   ssh ubuntu@<PUBLIC_IP>
   ```

> **Firewall:** Cloudflare Tunnel only makes outbound connections — no inbound
> ports need to be opened. Leave the OCI security list closed.

#### Out of capacity? Automate retries with the OCI CLI

The A1 free shape is often oversubscribed. The Console times out retries; the
CLI does not. [`scripts/oci-launch.sh`](scripts/oci-launch.sh) retries until a
slot opens.

1. Install and configure the CLI:

   ```bash
   brew install oci-cli
   oci setup config   # prompts for User/Tenancy OCID, region, generates an API key
   ```

   Upload the generated key: Console → **My profile → API keys → Add API key**
   → paste `~/.oci/oci_api_key_public.pem`. Verify with `oci iam region list`.

2. Collect the OCIDs (`COMP` = your tenancy or compartment OCID):

   ```bash
   export COMP=<tenancy-or-compartment-OCID>

   # Availability domain name(s)
   oci iam availability-domain list --compartment-id "$COMP" \
       --query 'data[].name' --raw-output

   # Default public subnet
   oci network subnet list --compartment-id "$COMP" --all --output json \
     | python3 -c "import sys,json; [print(s['display-name'], s['id']) \
         for s in json.load(sys.stdin)['data']]"

   # Ubuntu 24.04 aarch64 image OCID
   oci compute image list --compartment-id "$COMP" \
       --operating-system "Canonical Ubuntu" \
       --operating-system-version "24.04" \
       --shape VM.Standard.A1.Flex \
       --query 'data[0].id' --raw-output
   ```

3. Create the gitignored config and run the script:

   ```bash
   cp scripts/oci-launch.env.example scripts/oci-launch.env
   # edit scripts/oci-launch.env — fill in COMP, SUBNET, IMAGE, ADS
   ./scripts/oci-launch.sh
   ```

   The script sweeps every availability domain and retries until capacity opens.
   On success it prints the AD and instance OCID. Get the public IP:

   ```bash
   oci compute instance list-vnics --instance-id <INSTANCE_OCID> \
     --query 'data[0]."public-ip"' --raw-output
   ```

### Step 2 — Verify Docker on the server

The cloud-init script installs Docker at first boot. After SSH-ing in:

```bash
newgrp docker                              # activate group without logout/login
docker version && docker compose version   # both should print version info
```

If `docker: command not found`, cloud-init may still be running. Check with:

```bash
sudo cat /var/log/cloud-init-output.log
```

### Step 3 — Clone Lumina

```bash
git clone https://github.com/bact/lumina.git
cd lumina
```

### Step 4 — Start Lumina

The base `docker-compose.yml` is dev-oriented. Apply the production override
from [`docker/compose/docker-compose.prod.yml`](docker/compose/docker-compose.prod.yml)
(it uses `!reset`, so Docker Compose 2.24 or later is required; `!override`
needs 2.24.4 or later):

```bash
docker compose \
  -f docker-compose.yml \
  -f docker/compose/docker-compose.prod.yml \
  up -d --build
```

Verify on the VM:

```bash
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml ps
curl -s http://localhost/api/health   # -> {"status":"ok"}
curl -sI http://localhost/            # -> 200 OK
```

### Step 5 — Expose via Cloudflare Tunnel

Pick one sub-option.

**Option A1 — Stable URL on your own domain** (recommended; needs a domain in
your Cloudflare account, ~$10/yr from any registrar):

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel
   → Cloudflared**. Name it `lumina`.
2. Copy the install token (the long string after `--token`).
3. On the VM, save the token and start the tunnel connector:

   ```bash
   echo "TUNNEL_TOKEN=<PASTE_TOKEN>" >> .env
   docker compose \
     -f docker-compose.yml \
     -f docker/compose/docker-compose.prod.yml \
     --profile tunnel up -d
   ```

4. In the tunnel's **Public Hostnames** tab → **Add a public hostname**:
   - Subdomain: `lumina` (or any) · Domain: your domain
   - Service: `HTTP` → `nginx:80`
5. Visit `https://lumina.yourdomain.com` — TLS is free via Cloudflare.

**Option A2 — Instant ephemeral URL, no domain** (good for a quick demo; URL
changes if the tunnel restarts):

```bash
docker run --rm --network lumina_default \
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://nginx:80
```

It prints `https://<random-words>.trycloudflare.com`. The network name is
`<folder>_default`; verify with `docker network ls`.

### Step 6 — Verify the public site

```bash
curl -s https://lumina.yourdomain.com/api/health
curl -s https://lumina.yourdomain.com/api/v1/standards
```

Open the URL in a browser and upload an SBOM to confirm end-to-end.

### Operating

```bash
# Logs (all services, or just one)
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml logs -f
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml logs -f api

# Update to latest code
git pull
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml up -d --build

# Restart / stop
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml restart
docker compose -f docker-compose.yml -f docker/compose/docker-compose.prod.yml down
```

`restart: always` in the prod override means services come back after a VM reboot.

---

## Option B — Hugging Face Spaces

**Best for:** simplest setup, no infrastructure to manage, free `*.hf.space`
HTTPS URL.

**What you need:** a [Hugging Face](https://huggingface.co/join) account (free).
No card required.

**Caveats:**

- Spaces may sleep when inactive; the first request after sleep takes 30–60 s.
- In-memory job state (Mode-1 generation via `POST /api/v1/artifact/check`) is
  lost if the Space sleeps between submission and completion. For reliable
  generation, keep traffic flowing or use the synchronous SBOM upload path
  (`POST /api/v1/sbom/check`, completes in seconds).
- Private Spaces require a paid HF plan.

**Docker config:** [`docker/hfspaces/`](docker/hfspaces/) — a single
self-contained Dockerfile that clones Lumina from GitHub during the build.
The Space repo needs only this one file.

**Hardware:** CPU Basic (free) — 2 vCPU, 16 GB RAM. Plenty for SBOM generation.

### Steps

1. **Create a Space** at <https://huggingface.co/new-space>:
   - **Space SDK:** Docker
   - **Hardware:** CPU Basic (free)
   - **Visibility:** Public (free)

2. **Clone your new Space repo:**

   ```bash
   git clone https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME lumina-space
   cd lumina-space
   ```

3. **Add the Dockerfile:**

   ```bash
   cp /path/to/lumina/docker/hfspaces/Dockerfile Dockerfile
   ```

   If you are deploying your own fork, open the file and set `LUMINA_REPO` to
   your fork's URL.

4. **Push:**

   ```bash
   git add Dockerfile
   git commit -m "Deploy Lumina"
   git push
   ```

   HF Spaces detects the push, builds the image (a few minutes the first time),
   and starts the container. Watch progress in the Space's **Logs** tab.

5. **Verify** — the app URL is shown at the top of the Space page:

   ```bash
   curl -s https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/api/health
   curl -s https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/api/v1/standards
   ```

### Updating

Push a new commit to the Space repo to trigger a rebuild:

```bash
# In lumina-space/
git commit --allow-empty -m "Rebuild"
git push
```

To pin a specific Lumina version, set `LUMINA_REF` in the Dockerfile to a
branch or tag (a commit SHA does not work with a shallow clone):

```dockerfile
ARG LUMINA_REF=v0.2.0   # branch or tag
```

---

## Option C — Google Cloud Run

**Best for:** scale-to-zero (no charges when idle), low-traffic deployments,
Google Cloud ecosystem.

**What you need:**

- A [Google Cloud](https://console.cloud.google.com/) project with billing
  enabled (required even for the free tier).
- `gcloud` CLI installed:

  ```bash
  brew install google-cloud-sdk
  gcloud init && gcloud auth login
  ```

**Caveats:**

- Scale-to-zero means in-memory job state (Mode-1 generation) can be lost if
  the instance shuts down between polling calls. With `--min-instances=1` the
  instance stays warm but consumes the free vCPU-second allowance (~4 days of
  always-on per month before small charges apply). For reliable generation jobs,
  either set `--min-instances=1` or use the synchronous SBOM upload path.
- Billing must be enabled even to use the free tier; set a budget alert.

**Docker config:** [`docker/standalone/`](docker/standalone/) — nginx + uvicorn
in one container via supervisord. Cloud Run injects `PORT=8080`; the container
reads it at start.

**Free tier:** 2 M requests/month · 360 K vCPU-seconds · 180 K GB-seconds.

### Steps

1. **Enable APIs** (one-time):

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
       artifactregistry.googleapis.com
   ```

2. **Set project and region:**

   ```bash
   export PROJECT=$(gcloud config get-value project)
   export REGION=us-central1   # largest free tier, cheapest egress
   ```

3. **Create an Artifact Registry repository** (one-time):

   ```bash
   gcloud artifacts repositories create lumina \
       --repository-format=docker \
       --location=${REGION}
   ```

4. **Build and push** (uses Cloud Build; free 120 build-minutes/day):

   ```bash
   # Run from the Lumina repo root
   gcloud builds submit . \
       --config docker/standalone/cloudbuild.yaml \
       --substitutions _IMAGE=${REGION}-docker.pkg.dev/${PROJECT}/lumina/app:latest
   ```

   This path has not been tested by the maintainers: no Docker daemon or
   Google Cloud project was available when it was written.

5. **Deploy:**

   ```bash
   gcloud run deploy lumina \
       --image  ${REGION}-docker.pkg.dev/${PROJECT}/lumina/app:latest \
       --region ${REGION} \
       --memory 2Gi \
       --cpu    1 \
       --min-instances 0 \
       --max-instances 1 \
       --timeout 600 \
       --allow-unauthenticated
   ```

   Cloud Run prints the service URL (`https://lumina-xxxx-uc.a.run.app`).

6. **Verify:**

   ```bash
   curl -s https://lumina-xxxx-uc.a.run.app/api/health
   curl -s https://lumina-xxxx-uc.a.run.app/api/v1/standards
   ```

7. **Optional — custom domain:** Cloud Run console → service → **Manage custom
   domains**. TLS certificate is provisioned automatically.

### Updating

```bash
gcloud builds submit . \
    --config docker/standalone/cloudbuild.yaml \
    --substitutions _IMAGE=${REGION}-docker.pkg.dev/${PROJECT}/lumina/app:latest

gcloud run deploy lumina \
    --image ${REGION}-docker.pkg.dev/${PROJECT}/lumina/app:latest \
    --region ${REGION}
```

### Free tier settings

| Flag | Value | Reason |
| :--- | :---- | :----- |
| `--min-instances` | `0` | Scale-to-zero; no idle charges |
| `--max-instances` | `1` | One in-process job at a time (matches `Semaphore(1)`) |
| `--memory` | `2Gi` | Peak during git clone + Pitloom scan |
| `--cpu` | `1` | Checkout and conformance check are not CPU-bound |

---

## Next steps — scaling up

The current deployment runs SBOM generation in-process (no Redis, no worker).
This is intentional: the `JobQueue` abstraction in `backend/app/jobs.py` lets
the backend swap from `InProcessJobQueue` to an RQ or Taskiq worker without
changing the API, the frontend, or the job functions.

When load grows and the in-process queue is no longer enough, the upgrade path is:

1. Add a `worker` service and a local `redis:alpine` container (or Upstash
   serverless Redis) to the compose stack.
2. Add an `RQJobQueue` or `TaskiqJobQueue` next to `InProcessJobQueue` in
   `backend/app/jobs.py` and use it where the app creates its queue.
3. Nothing else changes — the HTTP contract, the frontend polling loop, the
   generators, and the conformance pipeline are all untouched.

The staged-backends design, the RQ vs Taskiq comparison and guidance on when to
pick each are in the project's internal design notes.

---

## Hardening for public use

These apply to all options once the deployment is working.

1. **Tighten CORS.** The frontend is same-origin (served by the same host),
   so the wildcard is unnecessary. Set the environment variable on the api
   service (comma-separated for multiple origins):

   ```yaml
   environment:
     LUMINA_CORS_ORIGINS: https://lumina.yourdomain.com
   ```

   No rebuild needed — restart the container. (Default without the variable
   is `*`.)

2. **Limit upload size.** The API refuses an SBOM upload larger than
   `LUMINA_MAX_SBOM_BYTES` (default 10 MiB) with HTTP 413; it holds the whole
   file in memory. Every nginx config (`proxy/prod.conf`, `proxy/dev.conf`,
   `docker/standalone/nginx.conf.template`, `docker/hfspaces/Dockerfile`) sets
   `client_max_body_size 11m;` for `/api/`: 1 MiB above the API's cap, for the
   multipart framing. The API alone cannot stop an upload from being spooled
   to disk first, so keep the proxy limit. Raise or lower both together, for
   example:

   ```nginx
   client_max_body_size 26m;  # and LUMINA_MAX_SBOM_BYTES=26214400 (25 MiB)
   ```

3. **Cap resources** (Option A). Per service in the prod compose override:

   ```yaml
   deploy:
     resources:
       limits: { cpus: "1.0", memory: 768m }
   ```

4. **Keep the port off the public interface** (Option A). With Cloudflare
   Tunnel you don't need `80:80` on the host — set nginx
   `ports: !override ["127.0.0.1:8080:80"]` in
   `docker/compose/docker-compose.prod.yml` (`!override` replaces the base
   list; a plain list would add to it), and keep
   the OCI security list closed.

5. **Set a budget alert** (Option C). Cloud Run billing must be enabled even for
   free-tier use; a $1 alert catches accidental always-on configuration.

6. **Keep dependencies updated.** Rebuild periodically to pick up security
   fixes:
   - Option A: `git pull` + `up -d --build`
   - Option B: push a rebuild commit to the Space repo
   - Option C: re-run `gcloud builds submit` + `gcloud run deploy`

7. **Artefact-URL fetching (SSRF).** `POST /api/v1/artifact/check` fetches a
   user-supplied URL server-side. The built-in guard
   (`backend/app/generate.py`) allows only http/https URLs resolving to
   public addresses, and clones skip blobs over 10 MB. Leave
   `LUMINA_ALLOW_PRIVATE_URLS` unset in production — it is a dev-only escape
   hatch. For defence in depth, add network-level egress rules so the
   containers cannot reach internal ranges or cloud metadata endpoints.

---

## Troubleshooting

| Symptom | Fix |
| :------ | :-- |
| **OCI** "Out of capacity for VM.Standard.A1.Flex" | A1 slots are scarce. Try another AD. Otherwise use `scripts/oci-launch.sh` to retry automatically — see Option A, Step 1. |
| **OCI** `docker: command not found` after SSH | cloud-init still running. Wait 1–2 min; check `sudo cat /var/log/cloud-init-output.log`. |
| **OCI** `docker: permission denied` | Run `newgrp docker` or log out/in after the `usermod -aG docker` step. |
| **OCI** Tunnel up but 502 from the public URL | Tunnel service mapping must point to `nginx:80`, not `localhost` or `api`. |
| **OCI** Quick tunnel can't reach nginx | Compose network name is `<folder>_default`. Confirm with `docker network ls` and pass `--network` accordingly. |
| **All** `curl /api/health` fails | Check container logs: `docker compose logs api` (Option A) or the platform's log viewer (B/C). Usually a Python dep error or the API still starting. |
| **All** Build fails — dep install error | `ntia-conformance-checker` and Pitloom are installed from pinned Git commits (`backend/requirements.txt`). If GitHub is unreachable during build, retry. |
| **All** Site loads but API calls fail in browser | The browser is hitting the API host directly, bypassing nginx. Use the public hostname (tunnel URL / HF Space URL / Cloud Run URL), not the raw IP or API port. |
| **HF Spaces** Space stuck in "Building" | Check the **Logs** tab in the Space page. Common cause: pip install timeout on a slow dep — retry the build by pushing an empty commit. |
| **HF Spaces** 503 on first request | Space is waking from sleep. Wait 30–60 s and retry. |
| **Cloud Run** Generation job lost between submission and poll | Instance scaled to zero. Set `--min-instances=1` or use the synchronous upload path (`POST /api/v1/sbom/check`). |
| **Cloud Run** `gcloud builds submit` fails | Check Cloud Build quota (`cloudbuild.googleapis.com` must be enabled) and that billing is active. |
