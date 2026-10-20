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

The UI shows only what the API returns. The standard list comes from
`GET /api/v1/standards`, every result is an `SbomCheckResponse`, and a
refused request shows the server's own error `detail`.

## Screens

| Screen | API | What it does |
| - | - | - |
| **Generate & check** (default) | `POST /api/v1/artifact/check`, then `GET /api/v1/jobs/{job_id}` | Paste a Git repository or Hugging Face Hub URL; the server generates an SPDX 3 SBOM with Pitloom and checks it. Polls the job every 2.5 s. |
| **Upload SBOM** | `POST /api/v1/sbom/check` (multipart `file` + `standard`) | Check an SBOM file you have, or one of the four example SBOMs. |
| **Import SARIF** | `POST /api/v1/sarif/import` (the SARIF JSON as the body) | Read a SARIF 2.1.0 log from a file or pasted text; an example button puts one of four real logs in the text box to read (and edit) before importing; nothing is re-checked. |
| **About** | `GET /api/v1/standards` | Dependencies, licence, and the standards the API lists with what each check covers. |

The three check screens render the result with the same `ArtifactResult`
view: counts, per-rule outcomes grouped by cluster, gaps and run notifications.
It shows no counts, and says why, when the SBOM could not be checked
(`execution_successful` is false) and when no rule applies
(`sbom.nothing-applies`): the banner gives the reason, the checker's own message
when it says why, else "<standard> is checked on SPDX 3 SBOMs only; this SBOM is
SPDX 2" for an SPDX 2 JSON SBOM under a standard whose `STANDARD_INFO` entry
lists `sbomSpecs: ["spdx3"]`, else a generic line. It is announced too. The
"judged by model" note appears only for G7 AI, and the *Unverified* tile only
when that count is above 0.

## Example files

`examples/` holds real files the "Try an example" buttons on *Upload SBOM* and
*Import SARIF* load (`EXAMPLE_SBOMS`, `EXAMPLE_SARIFS` in `screen-upload.jsx`).
A button fetches `/examples/<file>` and selects it as if it were chosen from
disk (on Import SARIF it puts the log's text in the text box instead, replacing
what was there, with a *Clear text* button) (what was chosen, with the example's note, stays on screen and is
announced; of two quick choices the newer wins), so the check that follows is the ordinary upload or import. None is
edited by hand; `scripts/ui-smoke.mjs` checks that each listed file exists and
is an SPDX document or a SARIF 2.1.0 log. An example holds no personal data (no
person's name or email address): a project SBOM carries its authors' addresses,
so none is included.

| File | How it was made |
| - | - |
| `phi-tiny-random.spdx3.json` | `loom model` on a tiny Safetensors model |
| `phi-4.spdx3.json`, `qwen2.5-0.5b-instruct-gguf.spdx3.json` | the SBOM Lumina's *Generate & check* returned on 2026-10-20 for `huggingface.co/microsoft/phi-4` and `huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF` (Pitloom 0.20.2) |
| `chainguard-image.spdx.json` | an SPDX 2.3 JSON SBOM that apko wrote for a Chainguard container image, copied unchanged from the checker's test data (`tests/data/SPDXSBOMExampleTests/chainguard.spdx.json`) |
| `*.sarif.json` | `sbomcheck -s <spdx3\|spdx2> -c <g7ai\|ntia> -r sarif -o <file>` on the SBOM of the same name (checker pinned in `backend/requirements.txt`) |

The Hub SBOMs are one run each, dated 2026-10-20 (their `created` time
is real and does not change when the demo is rebuilt); the button's note says so.
To refresh one, rerun the command or URL above and replace the file. A file
that is not a real tool output does not belong here.

## Result view, evidence and SBOM source

When the response carries the checked SBOM (`sbom`: `filename`, `format`,
`text`, `display`, `line_count`), `ArtifactResult` adds:

- **Download SBOM** next to the tabs: saves `sbom.text` (the original bytes)
  as `sbom.filename` through a Blob URL, so it works offline.
- **Tabs** "Result" | "SBOM source" (WAI-ARIA tabs: arrow keys, Home, End), plus
  "Generator log" when the response carries `generation_log` (a generated SBOM,
  or a failed generation, which has no SBOM source tab).
- **Rule rows** show, under the title, the value the SBOM holds for the
  element (up to three, from the `items` of the elements that have it; prefixed
  with the element's name when the rule judged several), so the default view
  needs no click. A hint such as "1 of 2 root packages lacks it" and, in the
  details, a plain sentence say why a rule is Present or Missing.
- **Rule details**: each rule row has a *Show more / Show less* button
  (`aria-expanded`) and the result an *Expand all / Collapse all* button. The
  details list `rule.evidence`: element name, id and type, *Has it* or
  *Lacks it*, and its `items` (key: value), then "and N more" for
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

A response with neither `sbom` nor `generation_log` (a SARIF log with no JSON
SBOM) shows the result alone: no tabs, no download, no rule toggles.

## Minimum elements standards

(*Standard* means a minimum elements standard; the UI spells that out.)
The standard chips list exactly what `GET /api/v1/standards` returns, in
its order. An entry with `ready: false` is shown but cannot be selected. Picking another
standard while a result with `sbom.text` is shown checks that SBOM again
(`recheckSbom`, `POST /api/v1/sbom/check`) with no new generation or upload, and
keeps the generator, its log and warnings of the first run.
*G7 SBOM for AI* (`DEFAULT_STANDARD`, `g7ai`) is preselected when the API
lists it as ready; otherwise the first ready one is.
Labels, a one-line description of what each check covers, and a source link
come from one table, `STANDARD_INFO` in `screen-conformance.jsx`; an id
missing from it is shown by its id. `RULE_CLUSTERS` in the same file names and
orders the rule clusters of each standard; a cluster missing from it is
still shown, by its code.

## Files

| File | What's in it |
| - | - |
| `index.html` | Entry point and router (`SCREENS`). Loads the modules in order; skip link, focus styles, `prefers-reduced-motion`. |
| `colors-and-type.css` | Design tokens: CSS variables for colours, typography, spacing, motion. |
| `assets/` | Logo SVGs. |
| `i18n.js` | `window.LUMINA_I18N`: locales, catalogues, `t()`. |
| `components.jsx` | `Icon`, `Logo`, `Button`, `StatusChip`, `StandardTag`, `Card`, `MarginNote`, `TextField`, `Eyebrow`, `Mono`, `SummaryTile`, `ErrorCard`, `useLocale`. |
| `app-shell.jsx` | `TopBar` (logo, `LanguageSwitcher`), `SideNav` and `NAV_SECTIONS`, the side-nav items. |
| `screen-conformance.jsx` | `STANDARD_INFO`, `DEFAULT_STANDARD`, `RULE_CLUSTERS`, the API helpers (`apiErrorMessage`, `postForResult`, `useStandards`), `StandardPicker`, `ScreenFrame` and the Generate & check screen (`ImportScreen`). |
| `sbom-source.jsx` | `SbomSource` (windowed, highlighted source view), `DownloadSbomButton`, `downloadSbom`, the per-line highlight.js to React conversion. |
| `generator-log.jsx` | `GeneratorLog`: the "Generator log" tab (`generation_log`, monospace, copy button), shown for a generated SBOM or a failed generation. |
| `rule-evidence.jsx` | `RuleClusters` (per-rule outcomes by cluster, with the details toggles) and `RuleEvidence`. |
| `result-view.jsx` | `ArtifactResult` (tabs, download, Show in SBOM wiring), `ResultTabs`, `RunLine`. |
| `screen-upload.jsx` | Upload SBOM (`UploadScreen`) and Import SARIF (`SarifScreen`). |
| `screen-about.jsx` | About (`AboutScreen`). |
| `vendor/` | React, React DOM, Babel, Lucide and highlight.js (JSON grammar), each with its licence; see `vendor/README.md`. |

## Internationalization

Only the app shell and each screen's heading are translated: the skip link,
the language picker, the top-bar title, the side navigation, the main landmark's
label and the eyebrow and title of Generate & check, Upload SBOM, Import SARIF
and About. The rest of a screen is English. The
picker offers only locales that have a catalogue (English, Deutsch, Français, Gaeilge, 日本語, ไทย);
each catalogue has every key, and `t()` falls back to English for a key
a catalogue lacks. `setLocale()` updates `<html lang>` and the choice is kept
in `localStorage` when the browser allows it.

## Accessibility

Built against WCAG 2.2 AA:

- **Landmarks:** `<header>`, `<nav aria-label="Primary navigation">`,
  `<main id="main-content">` labelled with the screen name. A *Skip to main
  content* link is the first focusable element.
- **Keyboard:** every interactive element is a `<button>` or carries
  `role="button"` / `role="radio"` with Enter/Space handlers.
- **Language picker:** a listbox. ArrowDown on its button opens it, with focus on
  the selected option; the arrow keys, Home and End move focus (one tab stop,
  roving `tabindex`), Enter or Space picks, Esc or Tab closes and returns focus
  to the button. Each option is named by its visible text, native name in its
  own `lang`, English name in `lang="en"`.
- **Screens:** the document title names the screen (translated), choosing a
  screen moves focus to its `<main>` (no ring, it is not a control) so a screen
  reader announces it, and each screen has one `<h1>`. A result adds an `<h2>`
  for each rule cluster, *Gaps* and *Notifications*.
- **Skip the rule list:** a result with rules has a link, hidden until it has
  focus, just before the first rule; Enter moves focus to the *Gaps* heading (or
  the "No conformance gaps found" line) after the list.
- **Language of parts:** `<html lang>` follows the locale; a screen's eyebrow
  and `<h1>` carry the locale's `lang`, the rest of the screen (English) sits in
  a `lang="en"` wrapper whenever the locale is not English.
- **Text size:** no text under 12 px (`Mono` and `code` use `max(0.94em, 12px)`);
  the page does not scroll sideways at 320 px, and a long value is clamped to two
  lines in the rule list with its full text in *Show more*.
- **Standard picker:** a `radiogroup` named "Minimum elements standard" with one
  tab stop (the chosen chip); the arrow keys, Home and End move focus between
  the usable chips and Enter or Space chooses, because choosing can start a new
  check of the SBOM on screen (so, unlike the standard radio pattern, an arrow key
  does not choose). A hidden description says so. An unsupported chip is a radio
  with `aria-disabled="true"`, skipped by the keys.
- **Errors and progress:** an error card has `role="alert"`; the working
  message has `role="status"`, and a finished check, a copied log or source and
  an example that filled the form are announced through live regions
  (`ResultAnnouncer` and the screens' own `role="status"` regions).
- **Names:** a control with visible text has an accessible name containing it
  (WCAG 2.5.3); tab, tabpanel, `aria-controls` and `aria-labelledby` ids exist.
- **Decorative icons and dots:** `aria-hidden="true"`; status is always text
  plus colour, never colour alone.
- **Focus indicator:** a 2px ink outline plus shu glow on `:focus-visible`.
- **Motion:** `@media (prefers-reduced-motion: reduce)` disables transitions
  and animations. No timer runs while the page is idle (each `Icon` draws itself).

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
