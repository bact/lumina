---
name: lumina-design
description: Use this skill to generate well-branded interfaces and assets for Lumina, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# Lumina Design Skill

Lumina is a Software Bill of Materials (SBOM) conformance tool. It validates SBOMs against the SPDX format spec and against regulatory minimum-element requirements. Currently supported: NTIA Minimum Elements, BSI TR-03183, G7 AI SBOM, MOF. On the roadmap (reserved in `plannedRegulations` in `data.js`, not yet shown in the UI): EU CRA, EO 14028, FDA PMP, ISO/IEC 5230. The UI is data-driven — it renders only regulations that are actually supported. The name is about **illumination** — making a dense, machine-formatted document legible. Lumina is the sibling of **[Pitloom](https://github.com/bact/pitloom)**, an SBOM generator. The metaphor: Pitloom weaves the threads of metadata into fabric; Lumina reads that fabric and shows you the regulatory pattern in it.

## How to use this skill

1. Read **`ui-kits/lumina-app/readme.md`** first. It contains product context
   and how the kit's design-token paths are served in dev Docker.
2. Read **`frontend/colors-and-type.css`** (the canonical copy) to absorb
   tokens. Use the CSS variables — do not hard-code hex values.
3. Read **`ui-kits/lumina-app/`** for component implementations and the
   example screens.

## When making visual artifacts (slides, mocks, throwaway prototypes)

- Copy `frontend/colors-and-type.css` into your artifact directory and `@import` it.
- Copy any logo SVGs you need from `frontend/assets/` (don't link to them across folders).
- Use Lucide via CDN for icons (1.5px stroke). Never invent emoji or hand-roll icon SVGs.
- Reach for the components in `ui-kits/lumina-app/components.jsx` when relevant — copy the JSX rather than importing across the file tree.

## When working on production code

- Lift the tokens into your codebase's existing token system (Tailwind config, CSS vars, design-token JSON — whatever applies).
- Treat the JSX in `ui-kits/lumina-app/` as a visual spec, not as production components. Re-implement against your real component library.
- If a screen needs something not in the system, ask before inventing it.

## Hard rules — do not break without explicit approval

- **One accent color.** The shu red (`--shu`) is the only saturated color in the system. Never introduce a second accent, never use blue/green/purple gradients.
- **No gradients.** Anywhere.
- **No emoji.** In copy or as icons.
- **Sentence case** for all UI labels, buttons, headings, table headers. Title Case only for the wordmark and proper nouns (regulation names).
- **No `opacity: 0.5`** for disabled states. Use the `--ink-4` / `--paper-2` token pair.
- **No bouncing motion.** Easing curves never overshoot. Durations stay under 320ms.
- **Hairline borders, not shadows**, for cards. Shadows are reserved for popovers, dropdowns, dialogs.
- **Sharp corners.** 4px max on cards, buttons, inputs. Pills only for status chips and tags.

## If invoked without other guidance

Ask the user:
1. What surface? (a screen, a marketing page, a slide, a 1-pager)
2. Who is the audience? (developer, compliance officer, exec)
3. What's the single thing this artifact needs to communicate?

Then produce a single HTML file. Show your work early — drop in a placeholder layout first, get a thumbs-up, then iterate.

## Open questions / flagged substitutions

- **Fonts.** Geist + Geist Mono + Instrument Serif are all Google Fonts. If the user has produced real licensed font files, drop them in `fonts/` and replace the `@import` with `@font-face`.
- **Icons.** Lucide is a substitution; if the user has a proprietary icon set, replace the Lucide CDN script.
- **The margin-note pattern** is invented in this system, not borrowed from a real product. Validate with real users before rolling it out across all surfaces.
