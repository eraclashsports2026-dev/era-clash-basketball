# Phase 6B2 limitations

**DEVELOPMENT.** All five modules are behind flags defaulting to false. Production remains
`engineVersion` 3.2.0. No historical calibration exists; every result inherits the data uncertainty in
`phase-6a-limitations.md`.

## What is built

Assignment-quality corrections (`defensiveDemand`, `creationLocus`, real `paintAvailability`) ·
mismatch correlation clusters · the pre-recording research gap closed to zero unreviewed · real zone
resolution with five shells · six offensive action families · zone-attack actions · offensive game
plan with 14 triggers and 15 gated responses · expanded ledger · fingerprint and cache integration.

## What is NOT built

| Not built | Consequence |
|---|---|
| Motion, Princeton, triangle, flex as *systems* | a coach's system shapes the action **mix**, not a set play |
| Full transition numbers-advantage engine | transition is expanded (cross-matching, pull-out) but has no explicit 3-on-2 model |
| Defensive counter-adjustments to offensive adjustments | each side adjusts to outcomes, not to the other's adjustments |
| Bench, rotations, substitutions, foul-outs | unchanged |
| Historical calibration, holdout validation | Phase 6C |
| Any UI | the entire phase is invisible to users |

## Honest characterisations

**Offensive efficiency rose in the A/B and is not calibrated.** Gold FG% went 51.8% → 55.7% with the
expanded actions on. That direction is *expected* — mismatches are now exploitable where before they
were merely detected — but 55.7% is high, and whether the magnitude is right is exactly what Phase 6C
must decide. **Do not read the A/B as evidence the engine is more accurate.** It is evidence the engine
is more *expressive*.

**Post-up share is homogeneous across coaches who post at all.** Five of seven benchmark coaches land
at 21–25% post-up because the post-mismatch trigger raises it for anyone whose system supports
posting. Only D'Antoni (9.5%) and Kerr (13.3%) diverge sharply. The willingness scaling helps but does
not fully separate coaches whose post tendencies are merely *similar*.

**Zone is a resolution path, not a full zone engine.** Five shells, eight gaps, area responsibilities
and rotation quality are real. What is absent: zone-specific defensive rotations played out
possession by possession, trap variants, matchup-zone re-assignment inside a possession, and any
distinction between a 2-3 with an active top and a passive one.

**`primaryThreatTracker` is assignment, not simulation.** A box-and-one names the chaser; it does not
simulate him chasing.

**Cut and handoff types stay broad.** `cutType` is `null` rather than an invented `BACKDOOR`. Naming
one would claim play-design knowledge the data does not support.

**Transition expansion is partial.** Cross-matching, nearest-credible-threat pickup and the pull-out
into half-court exist. Lane filling, trailer behaviour and an explicit numbers advantage do not.

**Adjustment frequency is bounded, not calibrated.** 0.8–3.8 applied per game by coach. Plausible,
measurable, and unvalidated.

**The paint-availability model is a prior, not a measurement.** It is derived from documented threat
profiles and era shot value, and it produces the right *ordering* (a 1960s hub holds a defender in the
paint; a 2020s hub does not). The absolute values are not measured against tracking data, which does
not exist for most of these players.

## What must not be claimed

- that the engine is historically accurate, calibrated or validated
- that a `ZONE_MIXED`-era result and a 6B2 zone result are comparable
- that adjustment frequency reflects real coaching behaviour
- that a `GENERIC_HALF_COURT` possession expressed a system
- that the A/B efficiency change measures improved accuracy
- that a broad `CUT` or `HANDOFF` label describes a specific historical play
