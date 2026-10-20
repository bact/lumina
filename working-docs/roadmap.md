---
Created: 2026-10-20
Last-Modified: 2026-10-20
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Lumina roadmap

A summary, not a copy: each item with more detail links to the note that holds
it. See also [design.md](design.md) (architecture), [demo.md](demo.md) (demo
guide) and [deployment-options.md](deployment-options.md).

## Done (2026-10-18 to 2026-10-20)

- [x] **Per-rule results** for NTIA, G7 SBOM for AI, CISA 2026, FSCT 2024 and
  BSI TR-03183-2, all from `ntia-conformance-checker`; a rule's evidence shows
  the SBOM elements and lines behind it.
- [x] **Three input screens**: Generate & check (a Git or Hugging Face URL),
  Upload SBOM and Import SARIF, with real example files and URLs, shown as a
  collapsible grid of cards.
- [x] **Generator log** and an SBOM source view (windowed for large files).
- [x] **Author and tool**: Lumina is the SBOM's author (a software agent) and
  Pitloom its tool; needs Pitloom's software-agent supplier fix (#312).
- [x] **Accessibility rounds** on every screen (keyboard, screen reader,
  contrast), checked by `scripts/ui-smoke.mjs` and axe-core.
- [x] **Locales**: the app shell and each screen's heading in English, German,
  Japanese, Thai, French and Irish.
- [x] **Pinned by commit**: Pitloom (`main` after #311 and #312) and the
  checker (`82a63b9`), so builds do not move.
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
- [ ] **A PyPI package as input** (`pypi.org/project/<name>`): waits for
  Pitloom's `loom pypi`, which is on its roadmap and not built (Pitloom #313).
