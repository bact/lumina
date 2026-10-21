---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Vendored front-end libraries

The page runs with no internet: these files are the browser builds of the
libraries below, copied from their npm packages (highlight.js is bundled, see its row), so a demo does
not depend on a CDN. Each keeps its own licence (the texts are alongside).

| File | Library | Version | Licence | Source |
| :--- | :------ | :------ | :------ | :----- |
| `react-18.3.1.production.min.js` | React | 18.3.1 | MIT | npm `react`, `umd/react.production.min.js` |
| `react-dom-18.3.1.production.min.js` | React DOM | 18.3.1 | MIT | npm `react-dom`, `umd/react-dom.production.min.js` |
| `babel-standalone-7.29.0.min.js` | Babel standalone | 7.29.0 | MIT | npm `@babel/standalone`, `babel.min.js` |
| `lucide-0.469.0.min.js` | Lucide icons | 0.469.0 | ISC (portions MIT) | npm `lucide`, `dist/umd/lucide.min.js` |
| `highlight-11.12.0-json.min.js` | highlight.js | 11.12.0 | BSD-3-Clause | npm `highlight.js`: `lib/core` plus `lib/languages/json`, bundled with esbuild (`--bundle --minify --format=iife`, `window.hljs = hljs`) so only the JSON grammar ships (22 KB) |

To update one, fetch the new file from npm, check its version, replace the file
and its row here, and update the `<script>` tags in `../index.html`.

The page also asks Google Fonts for Geist and Geist Mono
(`../colors-and-type.css`). Offline, the browser falls back to the system fonts
named after them in the same file; nothing breaks.
