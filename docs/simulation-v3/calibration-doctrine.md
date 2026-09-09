# Calibration doctrine

The rule every calibration decision in Phase 6C2 and later must satisfy. It is
locked. A change here is a product decision, not an implementation detail.

## The rule

> **The selected Era Style supplies the historical league environment. The
> quality and construction of the all-time roster determine how far above or
> below that environment the team performs.**

Two halves, both load-bearing.

## What follows from it

**Do not calibrate all-time teams to league-average output.** A lineup of
all-time greats is *supposed* to exceed its era's average. A calibration that
drives the deviation toward zero has not become more accurate; it has deleted
the roster from the simulation.

**Do not let all-time talent erase the Era Style.** If a 1960s roster produces
2020s three-point volume, the era has stopped meaning anything and every
historical matchup collapses into one generic game.

**So the target is never a number — it is a *relationship*.** The question is
never "does this team score 112?" It is "is this team the right distance above
its own era's environment, in the right direction, for the right reasons?"

## How that turns into a measurement

A deviation from the era environment is **expected**, and its absence is a
defect:

- deviation ≈ 0 → the roster does not matter
- deviation enormous → the era does not matter
- deviation plausible and **consistent across eras** → both layers are working

Consistency across eras is the sharp edge. Phase 6C1 measured team FG% between
**+1.4** points above environment (2010s) and **+9.5** (1970s). Both are the
right sign. A sevenfold spread in magnitude for the same class of roster is the
defect — which is why the register asks Phase 6C2 to fix the era-dependence and
explicitly *not* the sign.

## Prohibited implementations

- **No flat bonuses.** No `coachBonus`, `eraBonus`, zone coach bonus, or
  all-time talent bonus. A flat additive term is a confession that the mechanism
  is unmodelled, and it stacks in ways nobody can trace.
- **No universal OVR at team, coach, or era level.** Collapsing a team to one
  number destroys exactly the construction information the doctrine's second
  half depends on.
- **No single opaque accuracy score.** Component errors are always retained. One
  easily-matched metric otherwise masks a real failure.
- **No player-ID special cases** in generic weighting logic. Hard-coding
  "if the defender is Bill Russell" is not a model.
- **No increase in simulation randomness to cover a low-confidence fixture.**
  Low source confidence lowers a fixture's **weight**. It never widens a
  tolerance and never adds noise. Adding variance to make an error bar cover a
  target is hiding the error, not reducing it.
- **No fabricated data to complete a schema.** Nulls are preserved. See
  `historical-fixture-schema.md`.

## Status discipline

The engine's status is **DEVELOPMENT — CALIBRATION REQUIRED** and stays there.
It is not historically authoritative, definitive, scientifically proven,
validated, or fully accurate, and no document may say otherwise.

A framework that *measures* a calibration is not a calibration.
`possessionCalibrationVersion` is `null`/PLANNED for exactly this reason, and
the cache-key builder for calibrated results throws until real coefficients
exist.
