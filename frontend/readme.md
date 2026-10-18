<!--
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
-->

# Lumina Frontend

Static web frontend for the Lumina SBOM viewer and conformance checker.
Eight screens, four ways to read the same SBOM, built on `colors-and-type.css`.
Served by nginx; no build step required.

## Structure

| File | What's in it |
|---|---|
| `index.html` | App entry + router. Loads all modules. Sets `lang`, `viewport`, skip-link, focus styles, `prefers-reduced-motion`. |
| `colors-and-type.css` | Design tokens -- CSS variables for colours, typography, spacing, motion. |
| `assets/` | Logo SVGs. |
| `data.js` | One ghost-mesh SBOM in SPDX 3.0-ish shape -- components (software + AI), dependency edges, regulations with field-level requirements, "Where to look" hints, license metadata, known vulnerabilities. **Authoritative field list for the regulations of the viewer screens; the *Generate & check* screen is driven by real results.** |
| `i18n.js` | i18n / l10n module -- `t()`, `tNodes()`, `formatNumber()`, `formatDate()`, `formatRelativeTime()`, locale catalogue (14 languages), and the `useLocale()` hook (exported from `components.jsx`). |
| `components.jsx` | `Icon`, `Logo`, `Button`, `StatusChip`, `RegTag`, `Card`, `MarginNote`, `TextField`, `Eyebrow`, `Divider`, `Mono`, `useLocale` -- all with built-in keyboard / aria support where they're interactive. |
| `app-shell.jsx` | `TopBar` (`<header>`, project switcher with `aria-haspopup` / ESC, `LanguageSwitcher`), `SideNav` (`<nav aria-label="Primary">`, real `<button>` items, grouped Views / Conformance / Security / Source / Workspace). |
| `view-primitives.jsx` | Shared bits used across the viewer screens: `FieldStatusDot`, `KindTag`, `SeverityChip`, `FixChip`, `Legend`, `RegStrip` (radio group), `RegSummaryLine` (progressbar), `SummaryTile`. |
| `screen-overview.jsx` | Overview / dashboard screen |
| `screen-inventory.jsx` | Inventory table (`<caption>`, `scope="col"`, keyboard rows) + Component detail (drill-in) |
| `screen-conformance.jsx` | Conformance -- radio-group regulation picker, big % `progressbar`, per-field cards, "Where to look" hints -- plus Import flow |
| `screen-raw.jsx` | Raw SBOM viewer -- keyboard-focusable line gutter, per-line conformance dots |
| `screen-graph.jsx` | Dependency graph -- focusable SVG nodes with descriptive aria-labels |
| `screen-vulnerabilities.jsx` | CVE / GHSA list grouped by component |

## Screens

1. **Overview** -- KPI tiles, open-findings preview, connected-loom panel.
2. **Inventory** -- Searchable, filterable table of all components.
3. **Raw** -- The SBOM as it really is. Line-by-line SPDX 3.0 JSON-LD; the gutter shows which fields the active regulation checks and whether each is present, missing, or unverified.
4. **Graph** -- Dependency tree under the root component. Nodes are colored by their conformance against the active regulation; AI elements are marked M (model) or D (dataset); components with known CVEs get a shu-red `!`.
5. **Conformance** -- Pick a regulation, see a big % summary, then a per-field card list of what's missing and where that information usually lives ("Where to look" pulled from `data.findHints`).
6. **Vulnerabilities** -- Known CVE / GHSA records grouped by component, with severity, fix availability, and disclosure timeline.
7. **Component detail** -- Drill-in from any view. Findings, declared fields, provenance trail, signature margin note.
8. **Import** (*Generate & check*) -- paste a Git or Hugging Face URL, pick a regulation, see the checker's result by cluster. Not a file upload.

## Regulations covered

The fixture data ships field-level definitions for these prototype regulations / standards (CISA 2026 and FSCT 2024 exist only on the *Generate & check* screen):

| Regulation | Fields | Scope | Backend checker (now) |
|---|---|---|---|
| **NTIA Minimum Elements** (2021-07) | 7 | Software | `ntia-conformance-checker` |
| **BSI TR-03183** Part 2 v2.1.0 | 11 | Software | `ntia-conformance-checker` (verdict only) |
| **G7 AI SBOM** Minimum Elements (2026-05) | 11 (prototype list; the live check reports the checker's 81 rules) | AI (models + datasets) | `ntia-conformance-checker` (partial) |
| **MOF** (Model Openness Framework) v1.0 | 11 | AI models | not supported |

`ntia-conformance-checker` runs every check; the backend `run_checker`
parses its SARIF into the `ConformanceResult` schema the API returns and the UI
consumes. See `docs/design.md` for the full architecture.

Client-side conformance (fixture data in `data.js`) is demo data; the backend
result comes from `ntia-conformance-checker`.

Switching the active regulation re-runs every view's annotations against that
regulation's field list. The G7 AI scope automatically narrows the in-scope
components to AI elements.

## Interactions implemented

- Side-nav switching between screens
- Project switcher dropdown in the top bar
- Inventory search + filter chips
- Click any row / line / node → opens component detail
- Single-select regulation chip strip on Conformance / Raw / Graph
- "Where to look" hint panel appears next to missing-field lists
- Drag-and-drop or click-to-pick in the import flow → parsing simulation → done state
- Margin notes with `Learn more` / `Don't show again` actions (no-op)

## Internationalization

The app ships the **plumbing** for full localization; English is the only fully translated catalogue, with German and Japanese sampled to prove the wiring.

- `i18n.js` is a tiny singleton (`window.LUMINA_I18N`) exposing `t(key, vars)`, `tNodes(key, vars)` (for interpolating React nodes), and `formatNumber / formatDate / formatRelativeTime` (powered by `Intl.*`).
- Supported locales (picker order): English, Deutsch, Français, Español, Italiano, Português, Svenska, 日本語, 한국어, 繁體中文, 简体中文, ไทย, Bahasa Indonesia, Tiếng Việt.
- The `LanguageSwitcher` in the top bar is a native `<select>` with `aria-label="Language"` so OS-level locale tooling works.
- `setLocale(code)` updates `document.documentElement.lang` so screen readers switch language mid-session.
- Missing keys fall back to English. Numbers and dates localize even when the surrounding UI text doesn't.
- React components use `const { t, formatNumber } = useLocale();` to re-render automatically when the user switches language.

## Accessibility

Built against WCAG 2.2 AA. Specifically:

- **Landmarks** -- `<header>`, `<nav aria-label="Primary">`, `<main id="main-content">`. A `Skip to main content` link appears as the first focusable element.
- **Keyboard** -- every interactive element is a `<button>` or carries `role="button"` / `role="radio"` with `tabIndex=0` and Enter/Space handlers. The project switcher closes on ESC and restores focus to the trigger.
- **Screen reader labels** -- every clickable card / row / SVG node has a descriptive `aria-label`; decorative dots and icons carry `aria-hidden="true"`; em-dashes for missing values are read as "not declared".
- **Picker semantics** -- Conformance / Raw / Graph regulation picker is a `radiogroup` with `role="radio"` + `aria-checked` per option.
- **Progress** -- the big % bar and per-field bars expose `role="progressbar"` with `aria-valuemin/max/now`.
- **Focus indicator** -- a 2px ink outline plus shu glow appears on `:focus-visible` for every focusable element.
- **Contrast** -- `--ink-3` darkened to `#605C53` to clear 4.5:1 against `--paper` for all body / tertiary text. `--ink-4` and `--ink-5` are reserved for decorative / placeholder use.
- **Motion** -- global `@media (prefers-reduced-motion: reduce)` disables transitions and animations.
- **Labels** -- `TextField` accepts a `label` prop (rendered visually-hidden) and falls back to `aria-label` from `placeholder`.

## Icons

[Lucide](https://lucide.dev/) via CDN at 1.5px stroke. To swap to a different icon set, replace the `<script src="https://unpkg.com/lucide@latest…">` tag in `index.html` and update the `Icon` component in `components.jsx`.

## Not yet implemented

- Authentication / SSO flows
- Settings, billing, team management
- Mobile / small-viewport layouts (desktop-first; mobile rules not yet defined)
- Notifications, real-time CI status, webhook configuration
