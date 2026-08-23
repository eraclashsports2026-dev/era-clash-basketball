# Current Engine Audit — V2.3.5 (`src/engine.js` + `src/rating.js` + `api/_lib/game-core.js`)

Traced line-by-line on 2026-08-23 from the production code. This is what the
live engine actually does — not what we'd like it to do.

## THE CURRENT RESULT EQUATION (plain English)

**The V2 engine chooses the winner FIRST, then manufactures a box score to
match.** The full chain:

1. **Team rating** (`rating.js teamRating`): for each of the 5 slots, a
   position-weighted linear sum of season averages (pts/reb/ast/stl/blk × slot
   weights) plus a large accolade term (MVPs ×30, Finals MVPs ×22, DPOYs ×20,
   All-NBA, All-Defense, titles, popularity). Out-of-position slot = ×0.88.
   The 5 slot ratings are summed and multiplied by the chemistry multiplier
   (0.88–1.08 from `analyzeBalance` bonuses/gaps).
2. **Winner** (`engine.js simulateGame`): one Elo-style draw —
   `P(gold) = clamp(1/(1+10^(−(Rg−Rb)/650)), 0.04, 0.96)`; a single `rng()`
   call decides the game. **Nothing that happens "in the game" can change
   this.**
3. **Score**: loser gets `96 + rng·20`; margin = rating gap /90 (capped 13)
   + noise, capped 32 (upsets forced to margins ≤12). Winner = loser + margin.
4. **Box score** (`allocateBox`): each team's predetermined total is divided
   among its 5 players proportionally to season PPG × noise(0.8–1.2), with
   rounding repaired so player points sum exactly. REB/AST/STL/BLK are the
   player's season averages × noise(0.75–1.25) — **completely independent of
   anything that happened in the game, of the opponent, and of each other.**
5. **MVP**: highest game-score formula among the winner's five box rows.
6. **Matchup edges** (`categoryScores`): seven category sums (creation,
   interior, rim protection, rebounding, perimeter D, spacing, star power)
   from season stats + curated attributes, scaled to ±20. **Display + text
   only — they never touch the winner math.**
7. **Series**: `simulateSeries` replays step 2–4 until 4 wins on one shared
   rng stream. **Every game uses the identical win probability**; there is no
   game-to-game form, no adjustment, no home/away, no fatigue.
8. **Season**: 82 independent draws vs freshly generated opponents.
9. **Seed**: server crypto seed per simulationId → fully reproducible; a
   REMATCH gets a new simulationId → new seed → possibly different outcome
   (bounded by the same fixed P).

## Factor-by-factor classification

| Factor | Role in V2.3.5 |
|---|---|
| OVR (display) | **Not used** by the engine (display percentile of slotRating) |
| slotRating / accolades | **Directly changes winner** (via teamRating → Elo) |
| Player position / OOP penalty | **Directly** (×0.88 in slotRating) |
| Chemistry (analyzeBalance) | **Directly** (×0.88–1.08 team multiplier) |
| Team construction | **Indirectly** (only via chemistry's 6 named checks) |
| Archetypes / curated attributes | **Indirect, weak** (only via 2 of 7 matchup-edge categories → which affect NOTHING but display; plus chemistry v2.5 insights → display only). **Zero effect on winner.** |
| Usage / ball dominance | **Display only** (chemistry insight) — 5 superstars stack almost freely; hero-ball gap costs at most −3% team rating |
| Shot attempts / FGA | **Not modeled** |
| Shooting %, shot profile, rim/mid/3PT | **Not modeled** (no FGM/FGA exist) |
| Free throws | **Not modeled** |
| Possessions / pace | **Not modeled** (score base is a uniform 96–115 draw) |
| Assists / rebounds / steals / blocks | **Box-score-only** — season average × noise; unrelated to the game, the opponent, or each other |
| Offensive vs defensive rebounds | **Not modeled** (single REB number) |
| Spacing / off-ball value | **Display only** (edges + chemistry text) |
| Defensive assignments / help / switching | **Not modeled** |
| Matchup edges | **Narrative/display only** |
| Player tendencies / role redundancy | **Not modeled** (beyond hero-ball chemistry gap) |
| Era normalization | **Not modeled** — raw per-game season averages across eras (a 1962 rebound = a 2020 rebound) |
| Variance | Single Elo draw + score noise + box noise; **bounded but crude** ("final score + noise" is literally the current model) |
| Seed generation | Server crypto per simulationId; deterministic replay ✓ |
| Best-of-7 independence | Games share one rng stream (deterministic ✓) but **identical P each game**, no per-game form |
| Win-82 independence | Same — 82 identical-P draws vs random opponents |

## What this means for V3

- The V2 winner is a **two-number comparison** (team ratings) with dice. Every
  box-score detail is decoration. "Draft the five highest slotRating players"
  is already the optimal strategy; chemistry moves the needle at most ±20%
  relative (0.88↔1.08), which a single superstar's accolade block usually
  outweighs.
- Nothing in V2 can express: finite possessions, usage conflict, shot
  economics, matchup defense, coaching, or era environments.
- **V3 must invert the causality**: events → box score → score → winner.
- V2 stays intact as fallback (`src/engine.js` untouched); V3 lives in
  `src/v3/` behind `SIM_ENGINE_V3_ENABLED` (default **false**; enabled on
  Vercel *preview* deployments only via `VERCEL_ENV === "preview"`).
