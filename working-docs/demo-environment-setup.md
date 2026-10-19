---
Created: 2026-10-19
Last-Modified: 2026-10-19
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Demo environment setup

See also: [DEMO.md](../DEMO.md) (the demo script and troubleshooting),
[INSTALL.md](../INSTALL.md) (public deployment).

Internal notes: how to prepare a fresh machine for the Lumina demo. Do it at
least a day before. The demo script itself is in `DEMO.md`.

## What runs

Two containers from `docker-compose.yml`: `nginx` (static page, proxies
`/api/`) and `api` (FastAPI). The `api` image installs, by Git commit, the
conformance checker and Pitloom (`backend/requirements.txt`), and runs
`licenseid update` at build time so licence ids are canonicalised.

The *Generate & check* screen needs internet (a Git clone, or Hugging Face
metadata). *Upload SBOM* and *Import SARIF* work offline once the images are
built.

## 1. Machine

| Need | Check |
| :--- | :---- |
| Docker Engine with Compose v2 (2.24 or later for the production override) | `docker compose version` |
| `git` | `git --version` |
| Ports 80 and 8000 free | `ss -ltn` (Linux), `lsof -i :80` (macOS) |
| Internet for the first build: base images, Python packages, two Git commits from `github.com/bact`, the SPDX licence list | |
| A modern browser (Chromium, Firefox, Safari) | |

## 2. One-time setup

```shell
git clone https://github.com/bact/lumina.git
cd lumina
git checkout main                  # or the tag made for the demo
export HF_TOKEN=hf_...             # a read token from huggingface.co (optional, avoids Hub rate limits)
docker compose up --build
```

- The first build takes several minutes. Wait for `Uvicorn running on
  http://0.0.0.0:8000`, then open <http://localhost>.
- `HF_TOKEN` must be exported in the shell that runs `docker compose`; the
  compose file passes it to the `api` service. Unset, nothing is passed.
- `docker compose up` also loads `docker-compose.override.yml` (development:
  the frontend is served from the bind mount, the API reloads on change).
  Do not edit files under `frontend/` or `backend/app/` during the demo.
- Stop with `Ctrl+C`, then `docker compose down`.

## 3. Check it works

```shell
curl -s http://localhost/api/health          # {"status":"ok"}
curl -s http://localhost/api/v1/regulations  # ntia, bsi, g7ai, cisa2026, fsct2024 ready; mof not
```

Open <http://localhost>. The four screens are *Generate & check*, *Upload SBOM*,
*Import SARIF* and *About*. Upload `demo/phi-tiny-random.spdx3.json` with
*G7 SBOM for AI*: expect 38 rules checked, 13 present, 25 missing, and the
note that the system was judged by `phi-tiny-random`.

## 4. Licence database

Run one *Generate & check* (step 5 below). The result must not carry a
notification starting `licenseid database cannot be used`. If it does, the
build could not download the licence list:

```shell
docker compose exec api licenseid update
```

Then run the check again.

## 5. Warm up the day before

Run each once from the page, on the demo network. This confirms the URL works
from that machine and fills caches.

| Step | URL | Standard | Expect |
| :--- | :-- | :------- | :----- |
| Model with a dataset | `https://huggingface.co/distilbert/distilbert-base-cased-distilled-squad` | G7 SBOM for AI | 27 of 56 rules present; model Apache-2.0, dataset `squad` CC-BY-SA-4.0 |
| fastText project | `https://github.com/bact/sentimentdemo` | G7 SBOM for AI | 22 of 38 |
| ONNX and CRFsuite project (about 12 s) | `https://github.com/PyThaiNLP/pythainlp` | G7 SBOM for AI | 21 of 38; three ONNX and five CRFsuite models |
| Plain Python project | `https://github.com/pallets/flask` | NTIA, then BSI | NTIA 6 of 7; BSI 6 of 13, 2 optional not provided |

These counts were measured on 2026-10-18 and 2026-10-19; a changed upstream
repository or Hub card can move them by a rule or two. A different count is
not a failure; a crash, a hang or a red error banner is.

## 6. Day of the demo

1. Start the stack at least ten minutes before: `docker compose up` (no
   `--build` needed).
2. Re-run the two `curl` checks.
3. Open the page, set the browser zoom so the rule lists are readable.
4. If Hugging Face or GitHub is unreachable, show only the upload, SARIF
   import and refused-upload steps (`DEMO.md` steps 1 to 3 and 8). They need
   no internet.

## 7. If something goes wrong

| Symptom | What to do |
| :------ | :--------- |
| Port 80 in use | stop the other server, or change `"80:80"` in `docker-compose.yml` |
| Build fails on a `git+https://github.com/...` line | no route to GitHub from Docker: check proxy settings |
| *Generate & check* says "Could not complete" | `docker compose logs api` |
| A Hugging Face URL is slow or fails | wait; check `HF_TOKEN` is exported; try the next step |
| A URL is refused as private | by design: only public `http(s)` addresses are accepted |
| Results look old after an update | `docker compose build --no-cache api` (pip keeps an installed package of the same version number) |
| An upload is refused as too large | the cap is 10 MiB (`LUMINA_MAX_SBOM_BYTES`, nginx `client_max_body_size`) |
| Nothing works | `docker compose down && docker compose up --build`; the demo files in `demo/` are the offline fallback |

## 8. Known limits

- The Docker images were not built by the author of these notes (no Docker
  daemon was available). The first build on the demo machine is the real
  test: do it before the day.
- Hugging Face and GitHub reachability on the demo network cannot be
  guaranteed; see step 4 of the day-of list.
