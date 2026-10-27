---
Created: 2026-10-18
Last-Modified: 2026-10-22
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Run a Lumina demo on a new machine

Step by step, from an empty machine to a working demo: set it up, warm it up
the day before, run the demo script, and what to do when something fails.
Lumina is the web page that shows what the conformance checker found in an
SBOM. For the full deployment options (VM, Hugging Face Spaces, Cloud Run) see
[INSTALL.md](../INSTALL.md).

## 1. What you need

Two containers from `docker-compose.yml`: `nginx` (the static page, which
proxies `/api/`) and `api` (FastAPI). The `api` image installs the conformance
checker and Pitloom by Git commit (`backend/requirements.txt`) and runs
`licenseid update` at build time, so licence ids are canonicalised.

| Need | Why | Check |
| :--- | :-- | :---- |
| Docker Engine with Compose v2 (2.24 or later is needed only for the production override) | runs the two containers | `docker compose version` |
| `git` | to get Lumina | `git --version` |
| Internet during the first build | base images, Python packages, two pinned Git commits from `github.com/bact` (the checker and Pitloom) and the SPDX licence list | |
| Internet during the demo, for the *Generate & check* screen only | Lumina clones a Git repository or reads a Hugging Face model's metadata | |
| Free ports 80 and 8000 | the page and the API | `ss -ltn` (Linux) or `lsof -i :80` (macOS) |
| A modern browser (Chromium, Firefox or Safari) | the page | |

*Upload SBOM* and *Import SARIF* work without internet once the images are
built: the page's scripts are bundled (`frontend/vendor/`). Only the web fonts
come from Google Fonts; offline the page falls back to system fonts.

## 2. Set it up (at least a day before)

```shell
git clone https://github.com/bact/lumina.git
cd lumina
git checkout main                  # or the tag made for the demo
export HF_TOKEN=hf_...             # optional: a read token from huggingface.co, avoids Hub rate limits
docker compose up --build
```

- The first build takes several minutes (base images and Python packages,
  including the AI model readers). Wait for a line like
  `Uvicorn running on http://0.0.0.0:8000` from the `api` service, then open
  **<http://localhost>**.
- `HF_TOKEN` must be exported in the shell that runs `docker compose`; the
  compose file passes it to the `api` service. Unset, nothing is passed.
- `docker compose up` also loads `docker-compose.override.yml` (development:
  the frontend is served from the bind mount and the API reloads on change).
  Do not edit files under `frontend/` or `backend/app/` during the demo.
- Stop with `Ctrl+C`, then `docker compose down`.

Check it works, from another terminal:

```shell
curl -s http://localhost/api/health          # {"status":"ok"}
curl -s http://localhost/api/v1/standards    # ntia, bsi, g7ai, cisa2026, fsct2024 ready; mof not
```

Open <http://localhost>. The four screens are *Generate & check*, *Upload SBOM*,
*Import SARIF* and *About*. Upload `frontend/examples/phi-tiny-random.spdx3.json` with
*G7 SBOM for AI*: expect 38 rules checked, 13 present, 25 missing, and the note
that the system was judged by `phi-tiny-random`.

**Licence database.** Run one *Generate & check* (next step). The result must
not carry a notification starting `licenseid database cannot be used`. If it
does, the build could not download the licence list:

```shell
docker compose exec api licenseid update
```

Then run the check again.

## 3. Warm it up (the day before, on the demo network)

Run each once from the page. This confirms the URL works from that machine and
fills caches. The page has a "Try an example" list of cards for these twelve (open
at first, collapsed once you start a check; its header opens it again). A card is
headed by the repository, model or file name; its body says what it is (the model
file format, Safetensors, GGUF, ONNX, fastText or CRFsuite, and the parameter
count the Hub or the file states) and where it comes from. Choosing a card fills
the URL and picks the standard named below.

| Card | URL | Standard | Expect |
| :--- | :-- | :------- | :----- |
| distilbert/distilbert-base-cased-distilled-squad | `https://huggingface.co/distilbert/distilbert-base-cased-distilled-squad` | G7 SBOM for AI | 27 of 56 rules present; model Apache-2.0, dataset `squad` CC-BY-SA-4.0 |
| microsoft/phi-4 | `https://huggingface.co/microsoft/phi-4` | G7 SBOM for AI | 23 of 38 present; no dataset listed; parameter count read from the Hub's Safetensors summary; "judged by `phi-4`" |
| mistralai/Mistral-Small-4-119B-2603 | `https://huggingface.co/mistralai/Mistral-Small-4-119B-2603` | G7 SBOM for AI | 22 of 38 present; no dataset listed; model Apache-2.0; "judged by `Mistral-Small-4-119B-2603`" |
| ibm-granite/granite-4.2-30b | `https://huggingface.co/ibm-granite/granite-4.2-30b` | G7 SBOM for AI | 25 of 38 present; model Apache-2.0; parameter count read from the Hub's Safetensors summary; a `descendantOf` link to its base model `granite-4.1-30b-base`; "judged by `granite-4.2-30b`" |
| sonyinteractive/grooming-risk-classifier | `https://huggingface.co/sonyinteractive/grooming-risk-classifier` | G7 SBOM for AI | 25 of 38 present; text classification; model Apache-2.0; parameter count read from the Hub's Safetensors summary; a `descendantOf` link to its base model `embeddinggemma-300m` |
| JTS-AI/OpenJAI-v1.0-14B | `https://huggingface.co/JTS-AI/OpenJAI-v1.0-14B` | G7 SBOM for AI | 25 of 38 present; text generation; model Apache-2.0; parameter count read from the Hub's Safetensors summary; a `descendantOf` link to its base model `Qwen3-14B` |
| Qwen/Qwen2.5-0.5B-Instruct-GGUF | `https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF` | G7 SBOM for AI | 22 of 38 present; model Apache-2.0; parameter count read from the Hub's GGUF summary; a `descendantOf` link to the base model `Qwen2.5-0.5B-Instruct` (quantized) |
| bact/sentimentdemo | `https://github.com/bact/sentimentdemo` | G7 SBOM for AI | 22 of 38 |
| PyThaiNLP/pythainlp (about 12 s) | `https://github.com/PyThaiNLP/pythainlp` | G7 SBOM for AI | 21 of 38; three ONNX and five CRFsuite models |
| gitlab.com/pythainlp/pythainlp (about 18 s) | `https://gitlab.com/pythainlp/pythainlp` | G7 SBOM for AI | 27 of 38 present; three ONNX models; a GitLab mirror of the project above |
| pallets/flask | `https://github.com/pallets/flask` | CISA 2026, then NTIA and BSI TR-03183-2 | CISA 2026 12 of 14; NTIA 6 of 7; BSI 6 of 13, 2 optional not provided |
| labs.etsi.org/rep/ocf/sdk | `https://labs.etsi.org/rep/ocf/sdk` | CISA 2026, then NTIA and BSI TR-03183-2 | CISA 2026 11 of 14; NTIA 6 of 7; BSI 6 of 13, 2 optional not provided; a GitLab server (the repository redirects to `.git`) |

These counts were measured on 2026-10-19 and 2026-10-20; a changed upstream
repository or Hub card can move them by a rule or two. A model's "judged by"
note appears for every Hub model above, and four of them (Granite, the 303M
classifier, OpenJAI and the GGUF model) show a notification "1 component(s) are
not connected to the SBOM root": the base model's package has no link into the
root. That is a note, not a failure. A different count is not a failure; a
crash, a hang or a red error banner is.

## 4. A six-minute demo script

The repository carries real example files in
[`frontend/examples/`](../frontend/examples/), served by the page itself: four
SBOMs on *Upload SBOM* and four SARIF logs on *Import SARIF*, each a "Try an
example" card (see [frontend.md](frontend.md) for how each was
made). The first is a small SBOM Pitloom generated for a tiny Safetensors model,
and the SARIF log the checker made from it for the G7 SBOM for AI standard.

1. **Upload SBOM.** Click the example card *phi-tiny-random* (it
   picks *G7 SBOM for AI*), then *Check SBOM*. The other examples are *microsoft/phi-4* (Safetensors), *Qwen/Qwen2.5-0.5B-Instruct-GGUF* (GGUF) and a Chainguard container image
   with an SPDX 2 SBOM (NTIA). Lumina shows the
   rules by cluster (Metadata, System-level properties, Models, Dataset
   properties, and so on), each with the value the
   SBOM holds. Point out:
   - *Present* means the property exists, not that its value is right.
   - *Not checked* rules are ones SPDX 3.0.1 cannot show, or that the checker
     does not check. They are never counted as missing.
   - The note "judged by that model": the SBOM's only root is the model, so the
     system-level rules read the model.
   - *Show more* on a rule lists the SBOM elements behind it, and *Show in SBOM*
     jumps to those lines in the *SBOM source* tab.
2. **Switch the standard.** With the result showing, click *NTIA Minimum Elements*,
   *CISA 2026 Minimum Elements*, *FSCT 2024 (CISA Framing)* or *BSI TR-03183-2*. The same SBOM is checked again at once, with
   nothing uploaded again. Each standard asks for different things, and the page
   says which of its rules were not checked.
3. **Import SARIF.** Click the example card *phi-tiny-random* (G7): the
   log appears in the text box, so you can show what it holds. Then *Import SARIF*.
   This is what the checker writes; Lumina shows the same result without running a check. (An
   imported log has no SBOM source tab and no per-rule evidence, because the log
   does not carry the SBOM text.)
4. **Generate & check, a model with a dataset** (needs internet). Click
   the card *distilbert/distilbert-base-cased-distilled-squad* (or paste its URL from
   the table above), then *Generate & check*. Lumina generates the SBOM with Pitloom from the Hub
   metadata (no weights are downloaded) and checks it. Point out the model's
   Apache-2.0 licence, the dataset `squad` with its own licence (CC-BY-SA-4.0,
   read from the dataset's card) and the `trainedOn` link between them. Open the
   *Generator log* tab to show what the server did. In the result, *SBOM author*
   is Lumina (a software agent: it ran Pitloom) and *SBOM tool name* is Pitloom.
   Then click the card *microsoft/phi-4*: a
   model with no dataset. Its parameter count comes from the Safetensors summary
   on the Hub; no weights are downloaded. The *Generator log* says so: it reads the Hub metadata and downloads no model files.
5. **A project that ships a fastText model.** Click the card *bact/sentimentdemo*, then *Generate & check*. Pitloom finds the model file and hashes it (SHA-256 and SHA-512). Its
   name is just "model": the file name is all the file states, and the SBOM says
   so. The System producer rule is *Missing* while one line inside it says the
   project has a producer: the rule judges every root package, and the model
   has none.
6. **A project that ships ONNX and CRFsuite models.** Click the card *PyThaiNLP/pythainlp*, then *Generate & check*. Slowest step (about 12 seconds). Three ONNX models carry a version and a
   parameter count read from the files; five CRFsuite models carry less, because
   that format states less. The SBOM records what each file states and nothing
   more.
7. **A project with no AI model.** Click the card *pallets/flask* (it
   picks *CISA 2026 Minimum Elements*), then *Generate & check*, then click *BSI
   TR-03183-2* to check the same SBOM again. BSI shows optional elements apart from *Missing*
   ("Not provided"): lacking them is not a gap.
8. **Errors are shown, not hidden.** Upload a text file, or one over 10 MiB
   (`head -c 11000000 /dev/zero > big.json`): the page shows the server's
   message.

To make your own SBOMs for the demo, install Pitloom and the checker as the
"G7 SBOM for AI" page of the Pitloom documentation shows, then:

```shell
loom model path/to/model.safetensors -o model.spdx3.json
sbomcheck -s spdx3 -c g7ai -r sarif -o model.g7ai.sarif.json model.spdx3.json
```

`sbomcheck` exits 1 when the SBOM does not conform; that is a result, not an error.

## 5. The day of the demo

1. Start the stack at least ten minutes before: `docker compose up` (no
   `--build` needed).
2. Re-run the two `curl` checks from step 2.
3. Open the page and set the browser zoom so the rule lists are readable.
4. If Hugging Face or GitHub is unreachable on the day, there is nothing to
   work around: fall back to steps 1 to 3 and 8 of the script, which need no
   internet.

## 6. If something goes wrong

| Symptom | Cause and fix |
| :------ | :------------ |
| `port is already allocated` for 80 | another web server runs on the machine: stop it, or change `"80:80"` in `docker-compose.yml` and open that port |
| the build fails on a `git+https://github.com/...` line | the machine cannot reach GitHub: check the network or proxy settings of Docker |
| the page loads but every check says "Could not complete" | read `docker compose logs api`; the page shows the server's message |
| *Generate & check* says the URL is refused | Lumina only accepts public `http(s)` addresses; a private or local address is refused on purpose (name one trusted host in `LUMINA_ALLOWED_PRIVATE_HOSTS` for the `api` service, or set `LUMINA_ALLOW_PRIVATE_URLS=1` only on a trusted network) |
| a Git URL of a private repository fails | Lumina clones without credentials, so only public repositories work |
| a Git URL fails with `git.too-large` | The repository takes more than `LUMINA_MAX_CLONE_BYTES` (default 512 MiB) of disk; pick a smaller one, or raise the setting on the `api` service |
| a Hugging Face URL is slow or fails | Hub rate limits without a token; wait, or export `HF_TOKEN` for the `api` service (which also lets Lumina read private models: do not do this on a public instance), or go on to the next step |
| after updating, results look old | pip keeps an already installed package of the same version number even when the pinned commit changed: rebuild with `docker compose build --no-cache api`, or in a virtual environment run `pip install --force-reinstall --no-deps -r requirements.txt` for the two pinned lines |
| an upload is refused as too large | the default cap is 10 MiB; raise `LUMINA_MAX_SBOM_BYTES` and nginx's `client_max_body_size` together |
| switching the standard says "Could not switch the standard" | the SBOM was refused when sent again (for example over the size cap); the earlier result stays on screen |
| nothing works | `docker compose down && docker compose up --build`; the files in `frontend/examples/` are the offline fallback |

## 7. The API alone, without Docker

For a curl-only demo of the API (no web page). Needs Python 3.14 and `git`.

```shell
cd backend
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # one to four minutes
licenseid update                         # SPDX licence list; without it licence ids are not canonicalised
uvicorn app.main:app --port 8000          # leave running; use a second terminal below
# second terminal, from the repository root:
cd backend && curl -s -F file=@../frontend/examples/phi-tiny-random.spdx3.json -F standard=g7ai \
  http://localhost:8000/api/v1/sbom/check
```

The web page needs nginx in front of the API (it calls `/api/` on its own
address), so use Docker for the page.

## 8. What was and was not tested

- Tested in a clean Python 3.14 environment (the same `pip install -r
  requirements.txt` the image runs): the install, all five standards through
  the API, SARIF import, and the Git-URL flow against a local Git server.
- Ten demo URLs were run for real (four on 2026-10-19, and `microsoft/phi-4`, the
  Mistral, GGUF, Granite, `sonyinteractive/grooming-risk-classifier` and
  `JTS-AI/OpenJAI-v1.0-14B` models on 2026-10-20) and gave the counts in step 3.
  `labs.etsi.org/rep/ocf/sdk` was generated and checked (NTIA, BSI) through the
  backend on 2026-10-22, not yet through the page. Behind a DNS that resolves
  that host to a private address, name it in `LUMINA_ALLOWED_PRIVATE_HOSTS`.
- The web page was exercised with a headless browser against mocked and real
  API responses (see `scripts/ui-smoke.mjs`).
- The Docker images themselves were **not built** on the machine where this
  guide was written (no Docker daemon there). Build once on the demo machine
  before the day of the demo, and run steps 2 and 3. That first build is the
  real test.
- Hugging Face and GitHub reachability on the demo network cannot be
  guaranteed, so try one real URL of each beforehand.
