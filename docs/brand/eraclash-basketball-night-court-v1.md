# EraClash Basketball — Night Court V1 (`basketball-night-court-v1`)

**Status:** implemented on the Phase 9A.2 branch as the product default; **OWNER_ACCEPTANCE_PENDING**.
Selected by the owner as *Hybrid — Night Court Editorial base + Fracture Core master-brand signature*
(`data/validation/9a2/basketball-theme-owner-selection.json`). Stable Wave 1 promotion: **not authorised**. Production promotion: **not authorised**.

Theme id `night-court-production-hybrid` (the fifth entry of the owner-only lab; the four Phase 9A.1 candidates
fracture-core, night-court, modern-court, hardwood-luxe are unchanged). Applied by `src/main.jsx` before the first render; there is no user-facing selector.

## Identity

A premium **night-game arena** for active play, paired with **warm editorial surfaces** for reading, analysis, history
and account experiences — held together by the master brand: Obsidian, metallic Platinum, Fracture Gold and Fracture
Cobalt, expressed through one controlled diagonal Era Fracture.

## Three layers

| Layer | Token | Value | Role |
|---|---|---|---|
| 1 · Master brand | Brand Obsidian | `#03060B` | global header, lobby brand band, deep negative space |
| 1 | Metallic Platinum | `#E7EAF0` | arena typography, neutral structure |
| 1 | Structural Graphite | `#141A24` | master-brand neutral panel |
| 1 | Fracture Gold | `#E1A72C` | the warm half of the Era Fracture; primary action; brand emphasis |
| 1 | Fracture Cobalt | `#267CE8` | the cool half of the Era Fracture; Team Blue light |
| 2 · Basketball | Night Obsidian | `#070A0F` | arena page and floor |
| 2 | Arena Graphite | `#111823` | arena panels |
| 2 | Raised Graphite | `#172130` | cards, raised panels |
| 2 | Warm Court Ivory | `#F1EDE4` | every reading canvas: lobby body, Full Postgame, Box Score, gates |
| 2 | Editorial Ink | `#151B24` | reading text and headings |
| 2 | Secondary Ink | `#505765` | secondary reading text |
| 2 | Soft Ivory Divider | `#D7D1C6` | reading dividers and borders |
| 3 · Semantic | see `docs/brand/semantic-color-usage.md` | | |

## Surface mapping

| Surface | Environment | Shell |
|---|---|---|
| Global header | master brand (always obsidian, Mk1 logo, platinum) | `.ec-brand-header` |
| Play Lobby | obsidian brand band + ivory canvas, off-white cards, ink | arena shell + `--ec-l-*` |
| Chaos Clash Time Arena, Coach Chaos, Era Reveal, simulation, Result Dock | dark arena | `.ec-arena-shell` (`--ec-a-*`) |
| Full Postgame, Box Score, Game Story, Coaching & Strategy, Analysis | dark result hero → ivory report | reading tokens (`--ec-t-*`) |
| Dream Matchup builder and picker | ivory editorial | reading tokens |
| Account gate | ivory editorial | reading tokens |
| Membership, Fantasy, mode information | ivory editorial (arena names remapped) | `.ec-editorial-shell` |

## Contextual 60–30–10, as measured (1536×1024)

| Context | Dominant | Secondary | Decorative accent | Targets |
|---|---|---|---|---|
| Arena (empty, roll2, coach, result) | 35.5% | 49.4% | 1.8% | 55–68 / 22–35 / 6–10 |
| Editorial (lobby, postgame, gate, membership) | 81.3% | 15% | 1.5% | 55–68 / 22–35 / 6–10 |
| Combined product | 33.7% | 57.6% | 1.7% | — |

Deviations and their reasons are recorded in `data/validation/9a2/contextual-60-30-10-audit.json` (`deviations`, `reasons`). The
interface was not altered to hit a pixel percentage: the Era Fracture is a line system by contract, so its pixel
area is small while it stays visible and recognisable.

## Accessibility

Rendered text pairs passing AA: 20 fixture/viewport passes of 20; every named token pair ≥ 4.5:1 (lowest 5.06:1).
Long-form Postgame: 350/350 pairs, average 11.14:1, lowest passing 4.69:1.

## Differentiation

CLEARLY DISTINCT. the arena shares 82-0's dark-ground + warm-button STRUCTURE; differentiation rests on night obsidian (not navy), gold (not orange), platinum structure, the cobalt half of the fracture, and the ivory editorial half of the product, which 82-0 does not have

## Preview

`<branch-preview>/play` (owner or tester session) · lab: `<branch-preview>/dev/basketball-theme-lab?theme=night-court-production-hybrid` (owner only).
