# Phase 6C2C2 — limitations

Read this before quoting any Phase 6C2C2 result.

Phase 6C2C2 was scoped as the **final** calibration-and-release phase. It is not,
and this document explains why in the order the blockers actually bite.

## What was delivered

| Workstream | State |
|---|---|
| 0 — verify and freeze | **VERIFIED** |
| 1 — actual-game side symmetry | **MEASURED → CORRECTED → PASS** |
| 2 — Tier B target coverage | **MEASURED**, gate PASS on its terms |
| 3 — independent source verification | **BLOCKED** |
| 4 — parameter identifiability | **BLOCKED** |
| 5–10 — calibration | **NOT ATTEMPTED** — mechanically impossible |
| 11 — probability revalidation | **MEASURED**, gate holds |
| 12 — calibration lock | **NOT REACHED** |
| 13–15 — formal holdouts | **NOT OPENED** |
| 16–17 — private preview | **NOT ATTEMPTED** |
| 18–20 — production | **NOT ATTEMPTED** |

One genuine engine defect was found and fixed: overtime handed Gold a 4.60pp win
advantage at 6.7 standard errors, and it was the engine's entire measurable side
bias. That is real work, and it is the phase's main product.

## The three blockers

### 1. Parameters are not connected to the engine — 0 of 53

The most fundamental, and the one that would have blocked this phase even with
perfect data and a signed licence.

Nothing outside the calibration plane imports the parameter registry. With every
parameter forced to its declared maximum, five seeded games return **byte-identical
scores** while the parameter-set hash changes. The registry is a specification of
intended knobs, not a set of live controls.

Consequence: Workstreams 5–10 cannot run. A calibration search would evaluate
every candidate as identical to the default and terminate having changed nothing.

**This needs no licence, no data and no vendor.** It is engineering, entirely
within the team's control, and it should be done before anything is procured.

### 2. Tier B coverage is 2 of 384 fields

The coverage *gate* passes — 0 unjustified missing fields — because every gap
carries a specific evidence-backed reason. Tier B is nonetheless unusable:

| Reason | Fields | Fixable by |
|---|---|---|
| `SOURCE_BLOCKED_LICENSING` | 288 (75%) | a purchase |
| `NOT_RECORDED_IN_ERA` | 82 (21%) | **nothing — permanent** |
| `NOT_APPLICABLE` | 12 (3%) | n/a |
| populated | **2 (0.5%)** | |

Measured, not assumed: across all 32 authorized team-season articles, FGM, 3PM,
3PA, FTM, ORB, DRB, TRB and TOV appear in **none**. Eleven of twelve Tier B
metrics are derivable for zero fixtures.

### 3. No authorized independent second source exists

Every free candidate fails: NBA.com on commercial-use and comprehensive-database
clauses; Kaggle on platform non-commercial terms, with its best-fitted dataset a
Basketball-Reference scrape badged CC0; MIT GitHub packages because MIT licenses
the scraper, not the statistics; Sportradar on a display-only grant; media guides
as non-commercial Elias output. StatsCrew has exactly the right data and is
genuinely independent, and grants **no licence at all** — silence is not
permission. Only SportsDataIO reaches permitted, and it must be bought.

Consequence: 0 of 8 holdout fixtures verified, so no formal holdout may be opened.

## Two findings against this project's own posture

Recorded because they are inconvenient, and because a later reviewer will find
them anyway.

- **The Wikipedia baseline may be exposed to the same objection as the excluded
  source.** Every NBA team-season article examined carries a `bbr_team` infobox
  parameter citing Basketball-Reference as its statistical source. CC BY-SA covers
  Wikipedia's text; it does not cure upstream provenance. This does not by itself
  make the corpus unusable — the extracted values are numeric facts with
  revision-level provenance — but it is a live inconsistency, not a hypothetical.
- **The live production engine consumes era data from the excluded source.**
  `src/v3/data/eras.js` records its environment values — pace, FG%, 3PA/game, 3P%,
  FTA/game, AST/game, TOV/game, OREB% for all eight eras — as sourced from
  "Basketball Reference league index". Engine 3.2.0 is ACTIVE and reads it. This
  predates the phase, nothing here touches it, and it is why all 14
  shot-location, conversion and era-anchor parameters are `UNSUPPORTED`.

Both are legal questions and CEO decisions, not engineering ones.

## Corrections to my own work in this phase

- **The source registry asserted a clause it had not verified.** It stated the
  excluded publisher's terms bar AI/model use. That was written from the policy's
  wording, not the source's terms — and the review found NBA.com and Kaggle, both
  excluded, contain no AI clause at all. The registry now records the standing
  instruction and declines to characterise contractual grounds. Listed in
  `APPROVED_CORRECTIONS` with its reason.
- **The support matrix mis-bucketed 47 of 53 parameters** in its first version,
  because it inferred support from `targetMetrics` using a vocabulary I guessed
  instead of the `calibrationSource` field the registry actually declares.
- **The side-symmetry harness double-counted mirror cells.** Both orientations of
  a mirror are byte-identical inputs, so the "pair" was the same game twice —
  halving the true independent sample while reporting the full one, and inflating
  significance on exactly the cells that matter most. Corrected before any mirror
  number was trusted.
- **I invented card ids again.** The first archetype definitions used
  hand-written five-man lineups containing cards that do not exist, and the run
  crashed 3 cells in. Same failure as the 6C2C1 synthetic fixtures. Archetypes are
  now derived from the real pool with a backtracking position solver.

## What remains unestablished

- **Calibration outside 0.2–0.8 probability.** One cell in the lowest bin, none
  above 0.9. Unchanged from 6C2C1.
- **The SLIGHT_FAVORITE ladder rung misses by +0.1016**, about 3.3 standard
  errors at 256 games. Not comfortably noise, and not explained.
- **Historical accuracy of anything.** Every validation cell is synthetic and
  every outcome is engine output. This phase measured the estimator against the
  engine, and the engine against itself.
- **`transitionFor` still leaks across period boundaries.** Balanced in
  expectation, so not a side bias, but a real state leak left unfixed to keep the
  symmetry change minimal.
- **Production engine 3.2.0 retains stronger gold-first ordering** than the engine
  fixed here — gold's nightly form drawn first from the shared stream, gold's
  coach mutating a context blue then reads, gold shooting first on every
  possession pair. Its measured mirror effect is inside noise (48.9% over 3,000
  games), so it is recorded rather than corrected. It remains the rollback engine.

## What this phase does not claim

The engine is not calibrated, not historically authoritative, not validated and
not accurate. `possessionCalibrationVersion` is `null` and all 53 parameters are
at defaults — and disconnected. No formal holdout was opened; all five seal access
counts remain 0. No preview was deployed. No production change was made. `main`
remains at `9cd95ff`.

The frozen acceptance policy does not provide for a scoped lock, and one was not
added after seeing these results. That would have been precisely the post-hoc
accommodation the policy exists to prevent.
