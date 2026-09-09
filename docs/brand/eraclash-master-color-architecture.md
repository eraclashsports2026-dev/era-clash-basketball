# EraClash master colour architecture

**Status:** documented in Phase 9A.1; the owner selected the Basketball
environment in Phase 9A.2 — **Night Court V1** (`night-court-production-hybrid`,
Night Court Editorial base + Fracture Core master-brand signature), now the
product default and awaiting owner acceptance on the deployed branch preview.
See `docs/brand/eraclash-basketball-night-court-v1.md`, `era-fracture-usage.md`,
`semantic-color-usage.md` and `portrait-stage-treatment.md`. The four Phase 9A.1
candidates remain in the owner-only lab, unchanged, for comparison.

## Three layers

| Layer | Owner | Scope | Where it lives |
|---|---|---|---|
| 1 · Master EraClash brand | the platform | every EraClash product | `src/theme/masterBrandTokens.js` |
| 2 · Sport environment | each sport | Basketball's surfaces, texture, secondary accent, lighting — production: Night Court V1 | `src/theme/basketballThemes.js` |
| 3 · Semantic game colours | function | Team Gold, Team Blue, Coach/Era Violet, Success, Danger, Disabled, Neutral | `src/theme/semanticTokens.js` |

One resolver (`src/theme/themeResolver.js`) turns the three layers into one
generated stylesheet (`src/theme/basketball-themes.css`, written by
`npm run theme:css`, pinned by a test). Everything applies under
`html[data-theme="<id>"]`; `src/main.jsx` applies the production theme before the
first render (Phase 9A.2). Four scopes per theme: reading + root aliases + lobby
on `html[data-theme]`, arena on `.ec-arena-shell`, the editorial remap on
`.ec-editorial-shell`, and the master-brand header on `.ec-brand-header`.

## Layer 1 — the master brand (from EraClash Logo Mk1)

| Token | Value | Roles |
|---|---|---|
| Obsidian | `#03060B` | main background, navigation, arena foundation, deep negative space |
| Platinum | `#E7EAF0` | typography, neutral structure, dividers, metallic detail |
| Platinum deep | `#C9CFDA` | the letterform's shaded face — secondary neutral |
| Graphite | `#141A24` | neutral cards and panels |
| Fracture Gold | `#E1A72C` | brand emphasis, primary action, Team Gold, winning emphasis, selected states; the warm side of the Era Fracture |
| Fracture Cobalt | `#267CE8` | Team Blue, opposing-side identity; the cool side of the Era Fracture |

The logo is not regenerated and its letter shapes are not altered.

### The Era Fracture

A controlled **diagonal** meeting of Gold and Cobalt (112°, gold to 46%, a 2%
bright seam). It appears only where a state changes or the brand speaks:
logo-adjacent brand moment · main arena divide · roll transition · era reveal ·
selected player card · selected coach card · simulation transition · Result Dock
state transition · share graphic · mode-card selected state.

It never appears on every empty card, every panel corner, every row, every
paragraph, or as decorative noise unrelated to state. Reusable primitives, not
per-component graphics.

## Layer 3 — semantic colours

| Role | Purpose |
|---|---|
| Team Gold | the user's side in solo play; its scores, edges and holds; winning emphasis |
| Team Blue | the opposing side — **Legend Rival** in solo play; its scores, edges and holds |
| Coach/Era Violet | Coach Chaos, Era intelligence, time mechanics — a third identity, never a team |
| Success | success and valid states |
| Warning | warnings that are not yet errors |
| Danger | errors, destructive actions, losses |
| Disabled | unavailable controls |
| Neutral | structure and typography (platinum/graphite) |

A theme may adjust a semantic colour's luminance to hold contrast on its own
surfaces. It may never reverse a meaning.

**Visible labels (solo play):** TEAM GOLD · YOUR FIVE and TEAM BLUE · LEGEND
RIVAL. Internal code keeps `cpu` / `legendCpu`; stored result sides are never
remapped.

## The 60–30–10 rule, as measured

| Family | Target |
|---|---|
| Dominant | 55–65% |
| Secondary | 25–35% |
| Decorative accent | 6–12% |

Semantic colours are reported separately. The auditable distinction: a team or
state colour is **semantic** when it appears inside a DOM region that carries
that meaning (`SEMANTIC_REGIONS` in `semanticTokens.js` — a Gold card, a Blue
score); the same colour anywhere else is **decorative** and counts toward the
accent budget. `scripts/ui/themeLabQa.mjs color-balance` classifies every
sampled pixel of every fixture this way, masks portraits and the logo, and never
counts anti-aliased pixels beyond tolerance against a theme.

## What every theme must not do

- No NBA logos or league marks; no red-white-blue league identity.
- No dominant orange CTA system resembling 82-0.
- No random cracking; one controlled Era Fracture.
- One dominant glow per active product state.
- No theme picker in the public product — the lab is an owner surface.
