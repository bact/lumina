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

## Result view, evidence and SBOM source

When the response carries the checked SBOM (`sbom`: `filename`, `format`,
`text`, `display`, `line_count`), `ArtifactResult` adds:

- **Download SBOM** next to the tabs: saves `sbom.text` (the original bytes)
  as `sbom.filename` through a Blob URL, so it works offline.
- **Tabs** "Result" | "SBOM source" (WAI-ARIA tabs: arrow keys, Home, End).
- **Rule details**: each rule row has a *Show more / Show less* button
  (`aria-expanded`) and the result an *Expand all / Collapse all* button. The
  details list `rule.evidence`: element name, id and type, *Found* or
  *Absent*, and its `items` (key: value), then "and N more" for
  `evidence_more`. A rule without evidence says so.
- **SBOM source**: `sbom.display` with line numbers, indent guides and JSON highlighting (highlight.js, JSON grammar only, vendored)
  (keys, strings, numbers, literals, punctuation; `--syntax-*` tokens), done
  per line as React text nodes. The view is windowed (fixed 20 px rows; only
  the visible rows plus 40 above and below are in the DOM), so a 10 MiB SBOM
  stays responsive; a line over 4,000 characters is cut in the view only.
  The toolbar has the file name, line count, *Go to line*, *Copy* and
  *Download*.
- **Show in SBOM** (per evidence entry: `line`..`end_line`; per item: its
  `line`) switches to the source tab, scrolls the range into view, marks it
  (background plus a left bar, fading to a lighter tint), moves focus to the
  source and sets the URL hash (`#sbom-L57` or `#sbom-L57-L80`; a hash typed
  in the same session jumps too). *Back to result* returns to the rule's
  toggle.

A response without `sbom` (older servers, a SARIF log with no JSON SBOM)
shows the result alone: no tabs, no download, no rule toggles.

## Regulations

The regulation chips list exactly what `GET /api/v1/regulations` returns, in
its order. A regulation with `ready: false` is shown but cannot be selected.
*G7 SBOM for AI* (`DEFAULT_REGULATION`, `g7ai`) is preselected when the API
lists it as ready; otherwise the first ready one is.
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
| `screen-conformance.jsx` | `IMPORT_REGULATIONS`, `DEFAULT_REGULATION`, `RULE_CLUSTERS`, the API helpers (`apiErrorMessage`, `postForResult`, `useRegulations`), `RegulationPicker`, `ScreenFrame` and the Generate & check screen (`ImportScreen`). |
| `sbom-source.jsx` | `SbomSource` (windowed, highlighted source view), `DownloadSbomButton`, `downloadSbom`, the per-line highlight.js to React conversion. |
| `generator-log.jsx` | `GeneratorLog`: the "Generator log" tab (`generation_log`, monospace, copy button), shown for a generated SBOM or a failed generation. |
| `rule-evidence.jsx` | `RuleClusters` (per-rule outcomes by cluster, with the details toggles) and `RuleEvidence`. |
| `result-view.jsx` | `ArtifactResult` (tabs, download, Show in SBOM wiring), `ResultTabs`, `RunLine`. |
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

- A structured view of the SBOM (components, dependency graph); only its
  source is shown.
- An SBOM URL or SARIF URL as input (the API takes files and bodies only).
- Authentication.
- A full small-viewport design: the layout is desktop-first; below 640 px
  the side nav becomes a strip above the screen and gutters shrink.
