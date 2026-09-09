# Current simulation audit — what actually decides a game

**The live engine is V3.** `api/_lib/flags.js` sets `simV3` to `true` by
default; `api/game.js:134,146` selects `computeResultV3` when it is on. The V2
engine survives only behind `SIM_ENGINE_V3_ENABLED=false`.

This distinction matters because the two engines decide a game in opposite
directions.

## The decision chain (V3, live)

`src/v3/engine.js` is explicit about the order, and the order is the product:

```
teamDNA → buildGamePlan(coach, era, opponent) → allocateUsage(concentration)
        → assignDefense(threat-ranked) → defenseContext → prepareSide
        → playGame(possession loop) → realized box score → winner
```

`const winner = gRes.totals.pts > bRes.totals.pts ? "Gold" : "Blue"` — the
winner is **read off the scoreboard after the basketball happens**. Nothing
selects it in advance.

## What determines each output

| Output | Determined by | Classification |
| --- | --- | --- |
| **Winner** | Points scored in the simulated possession loop | Emergent |
| **Score** | Possession-by-possession resolution in `possession.js` | Emergent |
| **Box score** | Per-player realized events accumulated in the loop | Emergent |
| **MVP** | `pickMvp(winner's lines)` — `engine.js:76`, read from the realized box score | Emergent, post-hoc |
| **Chemistry** | `src/chemistryView.js`, called only by `ChemistryMeter.jsx`, `TeamSlots.jsx`, `Postgame.jsx` | **Presentation only** |
| **Coach effect** | `gameplan.js` → concentration, scheme, tempo; halftime/Q3 adjustments | Directly affects result |
| **Era effect** | `eraStyles.js` → shared environment for both teams | Directly affects result |
| **Narrative** | `api/narrative.js` (LLM), fed the finished structured result | Presentation only |

## System classification

**Directly affects the result:** player DNA · finite usage allocation · defensive
assignment · coach game plan · era style · seeded variance.

**Indirectly affects the result:** curated attributes (`src/attributes.js`) feed
DNA, which feeds everything downstream.

**Presentation only:** the Chemistry meter · AI narrative · OVR / `displayOVR` ·
matchup edge bars (V2 `categoryScores`).

**Not modeled at all:** benches and rotations (five players, no substitutions) ·
injuries · home court · travel/rest · foul-outs beyond attribution · Player
Intelligence and Team Intelligence (both deliberately unwired).

## The three findings that matter most

1. **Chemistry is decorative.** It has had zero engine effect since v2.5.0. The
   meter is prominent in the UI, which makes it the largest gap between what the
   product appears to model and what it models.
2. **OVR is UI-primary but absent from V3.** `displayOVR` is a percentile over
   the pool. No file in `src/v3/` imports it. Two different notions of "how good
   is this player" now coexist.
3. **Daily and Challenges bypass coach and era**, so the mode most players touch
   daily exercises a different code path from the headline simulation.
