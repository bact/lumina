<!--
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
-->

# Lumina frontend

Static web frontend for the Lumina SBOM conformance checker: React 18 and
Babel run in the browser, so there is no build step. nginx serves it and
proxies `/api/` to the backend; every screen needs that API.

The UI shows only what the API returns. The regulation list comes from
`GET /api/v1/regulations`, every result is an `SbomCheckResponse`, and a
refused request shows the server's own error `detail`.

## Screens

| Screen | API | What it does |
| - | - | - |
| **Generate & check** (default) | `POST /api/v1/artifact/check`, then `GET /api/v1/jobs/{job_id}` | Paste a Git repository or Hugging Face Hub URL; the server generates an SPDX 3 SBOM with Pitloom and checks it. Polls the job every 2.5 s. |
| **Upload SBOM** | `POST /api/v1/sbom/check` (multipart `file` + `regulation`) | Check an SBOM file you have. |
| **Import SARIF** | `POST /api/v1/sarif/import` (the SARIF JSON as the body) | Read a SARIF 2.1.0 log from a file or pasted text; nothing is re-checked. |
| **About** | `GET /api/v1/regulations` | Dependencies, licence, and the regulations the API lists with what each check covers. |

The three check screens render the result with the same `ArtifactResult`
view: counts, per-rule outcomes grouped by cluster, gaps and run notifications.
It shows no counts, and says why, when the SBOM could not be checked
(`execution_successful` is false) and when no rule applies
(`sbom.nothing-applies`). The
"judged by model" note appears only for G7 AI, and the *Unverified* tile only
when that count is above 0.

## Regulations

The regulation chips list exactly what `GET /api/v1/regulations` returns, in
its order. A regulation with `ready: false` is shown but cannot be selected.
Labels, a one-line description of what each check covers, and a source link
come from one table, `IMPORT_REGULATIONS` in `screen-conformance.jsx`; an id
missing from it is shown by its id. `RULE_CLUSTERS` in the same file names and
orders the rule clusters of each regulation; a cluster missing from it is
still shown, by its code.

## Files

| File | What's in it |
| - | - |
| `index.html` | Entry point and router (`SCREENS`). Loads the modules in order; skip link, focus styles, `prefers-reduced-motion`. |
| `colors-and-type.css` | Design tokens: CSS variables for colours, typography, spacing, motion. |
| `assets/` | Logo SVGs. |
| `i18n.js` | `window.LUMINA_I18N`: locales, catalogues, `t()`. |
| `components.jsx` | `Icon`, `Logo`, `Button`, `StatusChip`, `RegTag`, `Card`, `MarginNote`, `TextField`, `Eyebrow`, `Mono`, `SummaryTile`, `ErrorCard`, `useLocale`. |
| `app-shell.jsx` | `TopBar` (logo, `LanguageSwitcher`), `SideNav` and `NAV_SECTIONS`, the side-nav items. |
| `screen-conformance.jsx` | `IMPORT_REGULATIONS`, `RULE_CLUSTERS`, the API helpers (`apiErrorMessage`, `postForResult`, `useRegulations`), `RegulationPicker`, the Generate & check screen (`ImportScreen`), `RuleClusters` and `ArtifactResult`. |
| `screen-upload.jsx` | Upload SBOM (`UploadScreen`) and Import SARIF (`SarifScreen`). |
| `screen-about.jsx` | About (`AboutScreen`). |

## Internationalization

Only the app shell is translated: the skip link, the language picker, the
side navigation and the main landmark's label. Screen content is English. The
picker offers only locales that have a catalogue (English, Deutsch, 日本語);
each catalogue has every shell key, and `t()` falls back to English for a key
a catalogue lacks. `setLocale()` updates `<html lang>` and the choice is kept
in `localStorage` when the browser allows it.

## Accessibility

Built against WCAG 2.2 AA:

- **Landmarks:** `<header>`, `<nav aria-label="Primary navigation">`,
  `<main id="main-content">` labelled with the screen name. A *Skip to main
  content* link is the first focusable element.
- **Keyboard:** every interactive element is a `<button>` or carries
  `role="button"` / `role="radio"` with Enter/Space handlers. The language
  popover closes on Esc and returns focus to its button.
- **Regulation picker:** a `radiogroup`; an unsupported regulation is a radio
  with `aria-disabled="true"`, out of the tab order.
- **Errors and progress:** an error card has `role="alert"`; the working
  message has `role="status"`.
- **Decorative icons and dots:** `aria-hidden="true"`; status is always text
  plus colour, never colour alone.
- **Focus indicator:** a 2px ink outline plus shu glow on `:focus-visible`.
- **Motion:** `@media (prefers-reduced-motion: reduce)` disables transitions
  and animations.

## Icons

[Lucide](https://lucide.dev/) at a 1.5px stroke, vendored in `vendor/` with
React and Babel (no CDN; the page works offline apart from web fonts). To use
a different icon set, replace the Lucide `<script>` in `index.html` and update
the `Icon` component in `components.jsx`.

## Smoke test

`scripts/ui-smoke.mjs` loads this frontend in headless Chromium against a
mocked API and checks every screen; see `AGENTS.md` for how to run it.

## Not implemented

- Viewing the SBOM itself (components, dependency graph, raw document). An
  imported SARIF log's `embedded_sbom` is returned by the API but not shown.
- An SBOM URL or SARIF URL as input (the API takes files and bodies only).
- Authentication.
- Small-viewport layouts (the layout is desktop-first).
