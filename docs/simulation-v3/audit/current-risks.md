# Risk register

Only real risks. Classified by what they block.

## Blocks Coach Intelligence (Phase 4)

| Risk | Detail |
| --- | --- |
| **Dormant coach fields** | `pnr`, `insideOut`, `starEmpowerment`, `tacticalAdjustment`, `man` have zero engine consumers. Coach Intelligence will either consume them (requiring new possession actions) or must formally mark them research-only |
| **Daily/Challenges bypass coaches** | The highest-traffic mode does not exercise the coach path, so coach regressions would ship undetected |

## Blocks Simulation V3 completion

| Risk | Detail |
| --- | --- |
| **Mixed card conventions** | 310 of 381 cards are `LEGACY_UNVERIFIED`; 44 are hand-set prime figures systematically higher than a true decade mean. Every downstream layer treats `pts` as one comparable quantity |
| **Shooting data gap** | 43 of 381 cards carry measured splits. The rest infer shooting from position/era/volume |
| **Pre-1974 defensive blindness** | Steals and blocks did not exist. Corrected by hand for the review set only; the rest of the pre-1974 pool still derives `eventCreation` from zeroes |
| **No bench / five-player purity** | Gates foul-outs, rotations, and fatigue realism |

## Post-launch concerns

| Risk | Detail |
| --- | --- |
| **Chemistry meter is decorative** | Prominent UI with no engine effect. Needs replacement or removal, which is a CEO decision |
| **`App.jsx` is 1,236 lines** | Blocks safe UI iteration |
| **"Best 82" leaderboard is device-local** | `localStorage`, not a real leaderboard |
| **12/12 Vercel function slots used** | No headroom for a new endpoint without consolidation |

## Low priority

| Risk | Detail |
| --- | --- |
| `iq` computed, consumed by nothing | Dead derived field |
| `src/simClient.js`, `api/simulate.js` dead | Removable |
| Curated attribute coverage ~25% | Improves gradually |

## Resolved in Phase 2B

- **Person identity was wrong nine ways.** Seven humans were split across two
  identities each (a lineup could field two Bill Russells); two pairs of
  different humans collided (Chet Walker was refused alongside Chet Holmgren).
  Now resolved from card names via `src/v3/data/persons.js`.
- **Larry Nance's 1988-89 All-Defensive First Team was missing.**
- **Card statistical conventions were undocumented.** Now explicit per card.
