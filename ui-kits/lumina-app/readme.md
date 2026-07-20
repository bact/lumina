<!--
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: CC0-1.0
-->

# Lumina UI Kit — Design source of truth

Click-through design prototype for the Lumina SBOM viewer. Eight screens,
real component coverage, four regulations — built on `../../colors-and-type.css`.

**This directory is the visual source of truth.** When implementing or updating
`frontend/`, match this prototype pixel-for-pixel before deviating. Do not
promote changes here to production without review.

This kit is kept in the development repo only. It is **not** included in the
production Docker image (`proxy/Dockerfile`'s prod stage copies from
`frontend/`, not here).

## Paths

The `index.html` uses `../../colors-and-type.css` and `../../assets/` which
resolve to `/colors-and-type.css` and `/assets/` URLs. In dev Docker these are
aliased by `proxy/dev.conf` to serve from `frontend/` — the canonical copies.

| Resource | Served from |
|---|---|
| Design tokens (`../../colors-and-type.css`) | `frontend/colors-and-type.css` |
| Logo assets (`../../assets/`) | `frontend/assets/` |

To browse, use the dev Docker image:

```sh
docker compose up
# then open http://localhost/ui-kits/lumina-app/
```

## Structure

| File | What's in it |
|---|---|
| `index.html` | App entry + router. |
| `data.js` | Fixture SBOM + field-level conformance logic. **Authoritative field list for all four regulations** — port to `backend/app/conformance.py` when implementing `LuminaInternalChecker`. |
| `i18n.js` | Locale strings + `useLocale()` hook. |
| `components.jsx` | Shared UI atoms. |
| `app-shell.jsx` | Top bar + side nav. |
| `view-primitives.jsx` | Shared view helpers. |
| `screen-*.jsx` | Individual screens. |

## Regulations covered

| Regulation | Fields | Scope |
|---|---|---|
| NTIA Minimum Elements (2021-07) | 7 | Software |
| BSI TR-03183 Part 2 v2.1.0 | 11 | Software |
| G7 AI SBOM Minimum Elements (2026-05) | 11 | AI (models + datasets) |
| MOF (Model Openness Framework) v1.0 | 11 | AI models |

**Planned** (ids reserved in `plannedRegulations` in `data.js`; not rendered
until they gain field definitions and a checker): EU CRA, EO 14028, FDA PMP,
ISO/IEC 5230. To promote one, move its entry into `regulations` with a
`fields` list — every screen is data-driven and picks it up automatically —
then extend `RegulationId` and `CHECKER_MAP` in `backend/app/conformance.py`.
