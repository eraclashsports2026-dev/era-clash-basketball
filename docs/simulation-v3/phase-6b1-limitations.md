# Phase 6B1 limitations

**DEVELOPMENT.** `defensiveMatchupVersion` 1.0.0, `DEFENSIVE_MATCHUP_ENGINE_ENABLED` default false,
production unchanged at `engineVersion` 3.2.0. No historical calibration; the engine inherits all of
Phase 6A's data uncertainty (`phase-6a-limitations.md`).

## What is built

Threat and defender profiles · 25-cell pairwise matrix with retained dimensions · exhaustive
120-permutation optimizer with rim preservation, creator containment and a severe-baseline guard ·
14-type mismatch taxonomy with severity bands · era-legal scheme planning capped by coach, era and
personnel · era-gated help responsibilities · per-screen ball-screen coverage using the actual
assigned defenders · temporary switches with recovery · transition cross-matching · bounded
trigger-driven coach adjustments · defensive ledger fields · compact result summary · fingerprint and
cache integration.

## What is NOT built

| Not built | Consequence |
|---|---|
| Offensive action families (isolation, post-up, spot-up, off-ball screen, handoff, cut, motion) | most possessions still resolve as `GENERIC_HALF_COURT`, so a post mismatch is expressed as shot quality rather than as an actual post-up |
| Full transition numbers-advantage engine | transition is triggered and cross-matched but has no 3-on-2 model |
| Offensive coach adjustments | only defensive assignment and coverage adjustments exist |
| Bench, rotations, substitutions, foul-outs | unchanged from Phase 6A |
| Zone as a distinct resolution | `ZONE_MIXED` is a scheme label that shifts help and pre-rotation caps; zone possessions are not resolved differently from man possessions |
| UI, production activation, historical calibration | later phases |

## Honest characterisations

**A post mismatch cannot yet be attacked as a post-up.** The mismatch is detected, priced and fed into
shot quality and foul pressure, but with no post-up action the offence cannot *choose* to exploit it.
That is Phase 6B2's job and is the single biggest limitation here.

**Zone is a label, not a resolution.** `zoneUsage` caps help aggression and pre-rotation and gates the
shell type, which is a real constraint — but a zone possession resolves through the same code path as a
man possession. Calling it a zone engine would be false.

**The matchup modifier is centred, which is a modelling choice.** It expresses deviation from this
plan's average rather than an absolute defensive tax, because the possession baseline already accounts
for team defence. That is correct against double-counting, but it means an *overall* weak defensive
team is penalised through the team aggregates rather than through its assignments.

**Help responsibilities are assigned, not simulated.** A `NAIL_HELPER` is named and gates
`helpCommitment`, but no help rotation is played out possession by possession.

**Adjustment quality is bounded and coarse.** `tacticalAdjustment` scales an execution-quality number
between 0.4 and 1.0 that currently informs nothing downstream — the adjustment either happens or does
not. Making execution quality matter belongs with the offensive actions it would act against.

**Coverage vocabulary is mapped, not shared.** The defensive engine's nine coverages map onto the
action library's nine; `HELP_AND_RECOVER` maps to `HEDGE` because the library has no equivalent. That
mapping is explicit so a silent mismatch cannot ignore the plan's choice.

## Pre-1974 defensive data

Unchanged from the Phase 6A canonical audit: 98 affected cards, 52 reviewed, 45 unreviewed, 1 blocked.

**No targeted research wave was performed in this phase, and none was needed** — every canonical
benchmark player used here (Russell, Chamberlain, Robertson, West, Baylor, Thurmond, Frazier) already
carries either an evidence-graded band or a curated defensive attribute. Unreviewed cards fall back to
documented role and position with lowered confidence; a missing measurement never becomes a fabricated
one, and `wingspanIn` remains null everywhere.

The 45 unreviewed cards still **block Phase 6C calibration**, not this phase.

## What must not be claimed

- that a defensive assignment reproduces a historical coaching decision
- that `ZONE_MIXED` means a zone was simulated
- that a detected post mismatch was attacked as a post-up
- that adjustment frequency is calibrated against real coaching behaviour
- that the engine is validated, accurate, or historically authoritative
