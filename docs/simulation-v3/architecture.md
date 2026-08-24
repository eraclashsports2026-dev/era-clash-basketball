# Simulation Engine V3 — Architecture

**Branch:** `simulation-engine-v3` · **Flag:** `SIM_ENGINE_V3_ENABLED` (default **false**; auto-on when `VERCEL_ENV === "preview"`) · **V2 untouched** — `api/_lib/game-core.js` still serves production.

## Design thesis

The winner is never chosen. V2 computed a team rating, ran an elo-style
probability, picked the winner FIRST, then manufactured a box score to match
(see [current-engine-audit.md](current-engine-audit.md)). V3 inverts this: a
seeded possession loop produces events (turnovers, shots, blocks, fouls,
rebounds, putbacks), the box score is the ledger of those events, and the
winner is whoever the ledger says scored more. Every postgame number is real.

## Data flow

```
players.js + attributes.js
        │
        ▼
src/v3/playerProfile.js      playerDNA(p): ~28 capability fields + provenance
        │                    (VERIFIED / HUMAN_REVIEWED / CALCULATED / INFERRED)
        ▼
src/v3/roles.js              allocateUsage(): finite budget, shares sum to 1,
        │                    caps [0.08, 0.34] with iterative renorm;
        │                    compression/strain → emergent efficiency cost
        ▼
src/v3/gameplan.js           buildGamePlan(coach, roster, era, opponent):
        │                    ideal plan bent toward roster capability by
        │                    adaptability; era rules constrain (no-3PT
        │                    redistribution, zone illegal pre-2002)
        ▼
src/v3/defense.js            assignDefense(): threat-ranked greedy matching,
        │                    position gap discounted by switchability —
        │                    NOT "PG guards PG"
        ▼
src/v3/possession.js         playGame(seed): alternating possessions at era
        │                    pace × coach tempo; TO → shooter (by share) →
        │                    zone (era 3PA volume) → foul/FT (PF attributed to
        │                    a real defender) → block-causes-miss → make/assist
        │                    → rebound/putback; GAME STATE (late-game urgency,
        │                    lead protection, hack-a fouls) · FATIGUE (pace/
        │                    pressure cost late, ≤6%, load-scaled) · CRASH vs
        │                    GET-BACK (boards concede transition) · xPts shot-
        │                    quality ledger · in-game coach adjustments at two
        │                    checkpoints (adaptability-scaled, once per type,
        │                    era-legal) · unbounded OT until a winner exists
        ▼
src/v3/engine.js             simulateGameV3/SeriesV3/SeasonV3 — series/season
        │                    use deriveSeed(parent, i) children
        ▼
src/v3/analysis.js           expectedWinPct (25 derived-seed sims), honest
                             gameSummary / turningPointV3, coach recs, preview
```

Server entry: `api/_lib/game-core-v3.js` → `computeResultV3()` returns the
V2-compatible result shape plus a `v3` block (fullBox, usage, assignments,
plans, expectedGoldWinPct). `api/game.js` routes on the flag; `api/v3meta.js`
serves coach/era cards and roster-contextual recommendations.

## Seeds and variance

- `mulberry32(seed)` drives everything; **same simulationId + seed ⇒ identical
  game**, byte for byte.
- Rematch = new seed = a genuinely different game (different possession count,
  different form, different events) — never `finalScore + random()`.
- `nightlyForm(rng, consistency)` bounds per-game skill expression to
  [0.72, 1.32]; consistency narrows it. Variance is bounded: a role-player
  team never beats a superstar team because a dial spun.
- `deriveSeed(parent, index)` (splitmix-style hash) gives series game N and
  season game N independent but reproducible streams.

## Era Styles are an environment, not a power ranking

One era per game, shared by both teams. Era data (`src/v3/data/eras.js`) holds
verified rules (3PT line from 1979-80, illegal defense until 2001, handcheck
ban 2004-05, backcourt 10s→8s in 2000-01) and league trends (pace, FG%, 3PA
per game). Effects:

- Pace scales possessions for both teams.
- League FG% sets a conversion factor `0.75 + 0.25·(era.fgPct / 0.472)`
  applied to BOTH teams.
- 3PA/game scales three-point volume; pre-1980 eras have **no three-point
  scoring**, but shooting skill still matters (mid-range value, gravity,
  spacing retained — benchmarked: the high-spacing archetype keeps >30% vs a
  balanced elite team in the 1960s).
- There is no native-decade bonus and no "1990s defense +8" style constant
  anywhere in the codebase. The era-dominance benchmark asserts no archetype
  behaves monotonically across eras and no era swings any archetype's win%
  by more than 30 points.

## Coaches are philosophy, not bonuses

25 researched coaches (`src/v3/data/coaches.js`, research in
[coaches-research.md](coaches-research.md)) each carry a documented system
(pace, threeEmphasis, ballMovement, postEmphasis, defensive scheme, usage
concentration, adaptability) with sources and confidence per field. There is
**no Coach OVR** and no flat win bonus; a coach only changes the game through
the plan translation above, so the same coach helps one roster and hurts
another. Benchmarked coach-only win spread: ~14% with real pace/shot-mix
shifts — coaches matter, but never overpower talent.

## Daily Challenge fairness (Part 48)

The Daily's contract is *same UTC day ⇒ same puzzle for every player*. V3
preserves this without touching the existing daily module
(`src/dailyChallenge.js` is unchanged):

- The V3 daily seed is `hashString(date | goldIds | blueIds | coachIds | eraId)`
  — computed in `api/_lib/game-core-v3.js`, deterministic per (day, lineup).
- Two players submitting identical decisions on the same day get identical
  results; different lineups differ, which is the puzzle's point.
- Lineup legality remains validated server-side (`DAILY_INVALID_LINEUP`),
  claims stay atomic (SET NX) — no changes to storage or claim semantics.

## Addendum systems (Advanced Simulation Integrity)

- **Translation Doctrine** — [translation-doctrine.md](translation-doctrine.md):
  transport the player, not their circumstances; relative-to-era normalization
  (`data/leagueNorms.js`, verified league averages, stat-specific formulas);
  graded confidence (HIGH/MEDIUM/LOW) that never feeds variance.
- **Expected vs realized** — every game stores `expectedGoldWinPct` (computed
  BEFORE the result, never rewritten), an `outcomeClass`
  (EXPECTED / TOSS_UP / MILD_UPSET / SIGNIFICANT_UPSET / MAJOR_UPSET), and
  per-team expected points (`xPts`) so postgame can say "Gold generated the
  better looks but Blue converted the hard ones" honestly. Users see bands
  (TOSS-UP → STRONG EDGE), never decimal probabilities.
- **Coach career phases** — `data/coachPhases.js` (researched): multi-phase
  coaches (Riley Showtime→Knicks grind, Nelson→Nellie-ball, Popovich
  post→motion, 14 of 25 genuinely multi-phase) carry demonstrated toolkits
  that inform in-game adjustments. One consumer coach card per coach, always.
- **Duplicate persons** — `persons.js`: no two era-versions of one person on a
  team (server error `DUPLICATE_PERSON` + client draft guard); cross-team
  versions allowed (80s vs 90s Jordan is a supported matchup).
- **Simulation fingerprint** — every result carries seed + engine/possession/
  game-state/fatigue/player-data/coach-data/era-data/calibration versions.
  `benchmarks/v3/replay.mjs` reproduces any stored game exactly; old results
  are never recomputed on newer engines.
- **Historical backtesting** — `benchmarks/v3/backtest.mjs`: 14 researched
  real five-man units (from the pool, real coaches, native eras) checked for
  identity direction (pace, 3PA volume, off/def efficiency field-relative,
  usage hierarchy). Split 9 calibration / 5 holdout; formulas are tuned only
  against calibration, holdout measures generalization every run.
- **Meta telemetry** — `simulation_completed` analytics now carry coach ids,
  era, expected%, outcome class, and overtime count for post-release balance
  review (pick-rate vs win-rate analysis accounts for selection bias before
  any rebalance).
- **Preview discipline** — pre-sim, V3 shows only the KEY CLASH tension (via
  /api/v3meta) — no edge counts, no expected winner; coach recommendations are
  three strategically DIFFERENT lenses (Role Balance / Spacing-Movement /
  Defensive Identity), never a solved top-3.

## What V3 never does

- Never chooses a winner before simulating.
- Never fabricates a stat for prose (all summary numbers come from the
  possession ledger; when the loser shot better, the summary says so).
- Never applies a "superstar stacking penalty" constant — the cost of
  stacking five 30%-usage stars emerges from the finite usage budget and
  off-ball retention.
- Never grants an era or coach a numeric team bonus.
- Never models home court, travel, altitude, crowds, or injuries (doctrine).
- Never rewrites the pre-game expectation after seeing the final score.
- Never lets data uncertainty masquerade as game variance.
