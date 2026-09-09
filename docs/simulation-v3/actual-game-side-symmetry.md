# Actual-game side symmetry

**State: MEASURED, then CORRECTED, then RE-MEASURED. Gate PASS.**

`actualGameSymmetryVersion 1.0.0` — registered as **result-affecting**, because it
changes who gets the ball.

## Why this is a separate question from probability symmetry

Phase 6C2C1 built a Monte Carlo estimator that runs paired orientations and
reports a mirror matchup at exactly 0.5000. That is a fair *probability*. It is
not evidence of a fair *game*.

Pairing cancels a side tilt in the average. A player plays one game, not a paired
average. So the estimator could report perfect symmetry while every single game
quietly favoured Gold — and it did.

The engine's own code already knew this. `monteCarloProbability.js` carries the
note: a systematic side advantage *"is a bug, not something to average away
silently."* This workstream stopped averaging it away.

## Baseline — 240,000 paired games across 48 cells

Cells span all 8 Era Styles, man and zone, four coach pairings, and six team
archetypes derived from the real card pool.

| Metric | Baseline | Gate |
|---|---|---|
| Aggregate Gold advantage | +0.097pp | ≤ 0.5pp — PASS |
| 95% CI | −0.10 to +0.30pp | within ±1.0pp — PASS |
| Systematic across cells | t = 1.01, same-direction 0.58 | PASS |
| Cells beyond ±2pp | 1 of 48, **0** BH-significant | PASS |
| Score margin / possessions | +0.021 pts / +0.011 | PASS |
| **Gold gets first possession** | **100%** | **FAIL** |
| **Overtime Gold win rate** | **54.6%** of 5,289 OT games (+4.60pp) | **FAIL** |

The aggregate passing was the trap. It looked clean because the bias was
concentrated in 2.2% of games — and the arithmetic closes exactly:

```
0.022 (OT share) x 4.60pp (OT bias) = 0.101pp
observed aggregate                  = 0.097pp
```

**The engine's entire measurable side bias was overtime.** An aggregate-only gate
would have passed a 6.7-sigma defect.

## Root cause — two mechanisms compounding

### 1. The opening side was never seeded

`src/v3/possession/game.js:435`

```js
let offSide = period % 2 === 1 ? "gold" : "blue";
```

The sole line in the repository that decided who has the ball. No tip-off, no
jump ball, no seeded draw. Period 1 is odd, so **Gold opened every game ever
simulated**, for every seed.

### 2. The period budget is a total, and is not forced even

`game.js:434` sets one budget shared by both teams; `game.js:437` iterates it;
`game.js:454` credits a possession per iteration. When the budget is **odd**, the
period-starting side takes `ceil(budget/2)` — the first *and* last possession of
the period.

Across regulation this cancels: Gold starts periods 1 and 3, Blue starts 2 and 4.

**Overtime is period 5. Odd. And unpaired.** Gold started every first overtime and
collected the extra possession whenever the OT budget was odd — in exactly the
games that are 50/50 by definition. Because OT budget is `pace x 5/24`, the parity
is era-dependent, so the effect varied by era while always pointing one way.

## The fix

Smallest change that addresses the actual cause, and the one basketball already
uses:

```js
// Decided by the seed, not by which team the caller happened to pass first.
const openingSide = rng.chance(0.5) ? "gold" : "blue";

// Regulation alternates from the opening tip. Overtime takes a FRESH jump ball.
let offSide = period <= REGULATION_PERIODS
  ? (period % 2 === 1 ? openingSide : otherSide(openingSide))
  : (rng.chance(0.5) ? "gold" : "blue");
```

Deliberately **not** done: running two games and averaging, correcting the score
afterward, a hidden side bonus, flipping winners post-simulation, forcing the
budget even, or letting the Monte Carlo probability influence the actual result.

Two further asymmetries fixed alongside, both one-liners:

- **A tie no longer becomes a Blue win.** `game.js:540` used strict `>`, so an
  exact tie was labelled `"Blue"`. Unreachable in a normal game — the invariant
  check rejects ties — but the max-overtime guard can exit level. The tie branch
  consumes no RNG unless reached, so no ordinary game's stream changed.
- **Invariant reporting no longer hides one side.** `invariants.js` collected
  Gold's violations before Blue's and then `slice(0, 12)`, so with more than
  twelve violations Blue's were silently dropped. A gate that reads "zero
  invariant failures" cannot rest on a message able to hide half of them.
  Violations now carry `side` as a field and the sample is drawn evenly.

## After — 240,000 paired games, same cells and seeds

| Metric | Before | After |
|---|---|---|
| Gold first possession | **100%** | 49.0% |
| OT Gold-first rate | **100%** | 50.7% |
| **OT Gold win rate** | **54.6% (6.7σ)** | **50.2% (0.3σ)** |
| OT side advantage | +4.60pp | **+0.18pp** |
| Possession difference | +0.0111 | **−0.0004** |
| Aggregate advantage | +0.097pp | −0.111pp |
| 95% CI | −0.10 to +0.30pp | −0.31 to +0.09pp |
| Cells beyond ±2pp | 1 | **0** |
| BH-significant cells | 0 | **0** |
| Invariant violations / ties | 0 / 0 | **0 / 0** |

**All ten gates PASS.**

The possession difference collapsing to −0.0004 is the confirmation that matters:
the extra-possession mechanism is gone, not merely masked.

### On the 49.0% first-possession rate

Against 240,000 games that looks like a 9-sigma miss. It is not. The opening draw
is the first RNG call and depends **only on the seed**, and the 48 cells share
2,500 seeds. The true independent sample is 2,500, so the standard error is
1.0pp, not 0.1pp — and 49.0% is **0.96 standard errors** from even.

Sharing the seed across cells is also correct behaviour: the same seed opens the
same *slot* regardless of the teams in it, which is precisely what lets a paired
orientation balance which *team* opens.

## Determinism

All six frozen baseline cases replay **stable**. Same seed reproduces exactly;
new seeds still vary (30 seeds gave 30 distinct scorelines).

Every development fingerprint changed, as it must — this is a result-affecting
change, which is why `actualGameSymmetryVersion` carries `affectsResult: true`.
Production engine 3.2.0 is a separate module and is untouched.

The Phase 6C2A frozen baseline artefact was **not** rewritten. The live drift
baseline moved to `post-6c2c2-symmetry/`, following the repo's existing
`pre-6c2a/` / `post-6c2a/` precedent, so prior reports stay attributable.

The overtime baseline case needed a new seed for the fourth time
(2020 → 39 → 13 → **36**), because the behaviour change moved its scoreline out
of overtime. Seed 36 was chosen because it reaches **double** overtime, which
also exercises the repeat loop and the second overtime's independent jump ball.
The assertion that an overtime case exists was not relaxed.

## Known, unfixed, and deliberately out of scope

- **`transitionFor` leaks across period boundaries.** `game.js:401` initialises
  one global slot that `runPeriod` never clears, so a break earned on the last
  possession of a period can be granted to the next period's starter. Balanced in
  expectation across periods 2–4, so it is a state leak rather than a side bias.
  Fixing it would change results beyond side symmetry.
- **Production engine 3.2.0 has stronger gold-first ordering** than the engine
  fixed here: gold's nightly form is drawn from the shared stream before blue's
  (`v3/possession.js:57`), gold's coach adjusts first *and* mutates the context
  blue then reads (`v3/possession.js:198-201`), and gold shoots first on every
  possession pair. A mirror measurement on it returned 48.9% over 3,000 games —
  inside noise — so it is recorded, not corrected. It remains the rollback engine.
