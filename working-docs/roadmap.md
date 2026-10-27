---
Created: 2026-10-20
Last-Modified: 2026-10-27
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina roadmap

A summary, not a copy: each item with more detail links to the note that holds
it. See also [design.md](design.md) (architecture), [demo.md](demo.md) (demo
guide) and [deployment-options.md](deployment-options.md).

## Done (2026-10-18 to 2026-10-21)

- [x] **Per-rule results** for NTIA, G7 SBOM for AI, CISA 2026, FSCT 2024 and
  BSI TR-03183-2, all from `ntia-conformance-checker`; a rule's evidence shows
  the SBOM elements and lines behind it.
- [x] **Three input screens**: Generate & check (a Git or Hugging Face URL),
  Upload SBOM and Import SARIF, with real example files and URLs, shown as a
  collapsible grid of cards.
- [x] **Git URLs handled by Pitloom** (#55): clone URLs and page URLs of
  GitHub, GitLab, Gitea/Forgejo/Codeberg, Bitbucket and SourceHut; redirects
  followed hop by hop through Lumina's SSRF guard; Pitloom's log lines reach
  the generator log.
- [x] **Generator log** and an SBOM source view (windowed for large files).
- [x] **Author and tool**: Lumina is the SBOM's author (a software agent) and
  Pitloom its tool; needs Pitloom's software-agent supplier fix (#312).
- [x] **Accessibility rounds** on every screen (keyboard, screen reader,
  contrast), checked by `scripts/ui-smoke.mjs` and axe-core.
- [x] **Locales**: the app shell and each screen's heading in English, German,
  Japanese, Thai, French and Irish.
- [x] **Pinned by commit**: Pitloom (the merge of its #357, 0.21.0 before the
  release) and the checker (`82a63b9`), so builds do not move.
- [x] **Internal docs in `working-docs/`**, user docs kept to `README.md` and
  `INSTALL.md`.

## Open

- [ ] **Check the demo on the real machine**: build the Docker images (never
  built where the demo guide was written), run `licenseid update`, and
  compare the counts in [demo.md](demo.md) with the app's. The counts were
  measured without the SPDX licence database and before Pitloom #311.
- [ ] **Native-speaker review** of the Thai and Irish text and of the German
  and Japanese page titles.
- [ ] **Tag the checker pin** (`82a63b9` has no tag and lives on unmerged
  checker branches); then move the pin to the tag.
- [ ] **More standards**: EU CRA, EO 14028, FDA PMP, ISO/IEC 5230. None is in
  the API; the steps to add one are in `AGENTS.md`, "Adding a standard".
- [ ] **Translate whole screens**, not only the shell and headings.
- [ ] **Stage 2 job queue** (a worker and Redis behind `JobQueue`): see
  [design.md](design.md#staged-backends).
- [ ] **Cloudflare**: designed, not built; the demo option is a static
  frontend on Cloudflare with the API elsewhere. See
  [design.md](design.md#cloudflare-designed-not-built).
- [ ] **Non-GitHub examples** in "Try an example", after Pitloom 0.21.0 is
  released and the pin is on it (the page forms of GitLab, Bitbucket, SourceHut
  and others need it). Candidates, checked 2026-10-23 with `git ls-remote`
  only (a run of Lumina on each, the licence and the model format are not
  checked): `gitlab.com/ncz-os/mnemos-embedkit` (ONNX) and
  `gitlab.com/armbiant/yolo-ultralytics` (ONNX, folder
  `examples/YOLOv8-ONNXRuntime`) answer; `gitlab.com/gitlab-org/spamcheck`
  (TensorFlow Lite) answers with a sign-in redirect, so it is gone or private;
  the two Hugging Face Spaces (`kenhktsui/fasttext-language-identification`,
  `espnet/silero-vad`) do not resolve. A Space is a Git repository on
  `huggingface.co/spaces/...`; Pitloom classifies every `huggingface.co`
  address as a model (checked), so a Space is not readable until Pitloom
  handles it. Each example must be a real run: the licence and
  the model format read from the result, not from a list.
- [ ] **A PyPI package as input** (`pypi.org/project/<name>`): waits for
  Pitloom's `loom pypi`, which is on its roadmap and not built (Pitloom #313).
