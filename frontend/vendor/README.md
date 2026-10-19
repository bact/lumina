---
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
---

# Vendored front-end libraries

The page runs with no internet: these four files are the unmodified browser
builds of the libraries below, copied from their npm packages, so a demo does
not depend on a CDN. Each keeps its own licence (the texts are alongside).

| File | Library | Version | Licence | Source |
| :--- | :------ | :------ | :------ | :----- |
| `react-18.3.1.production.min.js` | React | 18.3.1 | MIT | npm `react`, `umd/react.production.min.js` |
| `react-dom-18.3.1.production.min.js` | React DOM | 18.3.1 | MIT | npm `react-dom`, `umd/react-dom.production.min.js` |
| `babel-standalone-7.29.0.min.js` | Babel standalone | 7.29.0 | MIT | npm `@babel/standalone`, `babel.min.js` |
| `lucide-0.469.0.min.js` | Lucide icons | 0.469.0 | ISC (portions MIT) | npm `lucide`, `dist/umd/lucide.min.js` |

To update one, fetch the new file from npm, check its version, replace the file
and its row here, and update the `<script>` tags in `../index.html`.

The page also asks Google Fonts for Geist, Geist Mono and Instrument Serif
(`../colors-and-type.css`). Offline, the browser falls back to the system fonts
named after them in the same file; nothing breaks.
