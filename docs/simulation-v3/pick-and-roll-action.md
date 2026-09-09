# Pick-and-roll action system

**Status:** built, hidden, wired to nothing.
**Version:** `actionLibraryVersion` 1.0.0 (DEVELOPMENT).
**Files:** `src/v3/actions/pickAndRoll.js`, `tests/v5c-pick-and-roll.test.js`,
`benchmarks/v3/pick-and-roll.mjs`.

> This is the first entry in a versioned **action library**. It is **not** the
> possession engine. `possessionEngineVersion` stays `null` — one modelled
> action is not an engine.

## 1. What it replaces

The coach field `pnr` was researched across 30 coaches and read by nothing. The
tempting fix is `high pnr coach = +5 offense`. That is not basketball, and it is
forbidden here: **there is no bonus term in this file, and the module returns no
score and no winner.** Tests assert both.

`pnr` status: `PLANNED_POSSESSION_ENGINE` → **`ACTIVE_ACTION_LIBRARY`**. It now
drives **variant selection**, never points.

## 2. Inputs

Ball handler · screener · handler's defender · screener's defender · strong/weak
side spacing · offensive coach philosophy · defensive coach philosophy · Era
Style · Team Intelligence spacing · Player Intelligence profiles.

## 3. Variants (9)

`HIGH_PNR` · `SIDE_PNR` · `SPREAD_PNR` · `EMPTY_CORNER_PNR` · `PICK_AND_POP` ·
`SHORT_ROLL` · `SLIP_SCREEN` · `RE_SCREEN` · `REJECT_SCREEN`

Availability is **gated** on personnel and era. A lineup with no shooters is not
offered `SPREAD_PNR`. A rim-bound screener is not offered `PICK_AND_POP`. A
coach who never ran a variant does not get it for free.

## 4. Coverages (9)

`DROP` · `SWITCH` · `HEDGE` · `BLITZ` · `ICE` · `UNDER` · `OVER` ·
`LATE_SWITCH` · `HELP_AND_RECOVER`

Each **concedes something specific**. That is the model — trade-offs, not
penalties:

| Coverage | Concedes | Buys |
| --- | --- | --- |
| DROP | the pull-up | rim protection, rebounding position |
| UNDER | the jumper | space against a non-shooter |
| OVER | rim/roll | denies the pull-up |
| SWITCH | a mismatch | trivial recovery |
| BLITZ | short roll, weak side, rebounding | forces the ball out |
| HEDGE | roll timing | slows the handler |
| ICE | baseline drive | keeps the ball off the screen |

## 5. Outputs

`offense`: ballHandlerShotQuality · rimPressure · rollOpportunity ·
popOpportunity · shortRollPlaymaking · weakSideOpportunity · foulPressure ·
turnoverRisk

`defense`: containment · rimProtection · switchMismatch · recoveryDifficulty ·
helpCommitment · reboundPosition

Plus `expectedOutcomes`, `strengths`, `concerns`, `eraEffects`, `coachInputs`,
`confidence`, `provenance`. **No score. No winner.**

## 6. Verified behaviour

| Scenario | Result |
| --- | --- |
| Curry vs DROP vs OVER | pull-up **9.7 → 3.4** — drop is punished |
| Curry vs UNDER vs Westbrook vs UNDER | **10.0 vs 2.8** — only a shooter punishes going under |
| Jokić vs BLITZ vs Eaton vs BLITZ | short roll **10.0 vs 2.7** — a passing big beats a trap |
| Dirk vs DROP vs Eaton vs DROP | pop **10.0 vs 0.0** — pop threat separates cleanly |
| Spaced vs crowded weak side | **9.6 vs 2.1** — spacing decides whether help can sit |
| Harden vs SWITCH | mismatch detected, rim protection drops |

## 7. Era changes economics, not the action

**Pick-and-roll long predates three-point spacing** and is available in all
eight eras. What the era moves:

- **Pick-and-pop** is worth far less without an arc (Dirk: 10.0 in the 2020s,
  4.1 in the 1960s) — the shot still exists, it is worth two.
- **Rolling is EASIER where help may not pre-rotate.** Illegal-defense rules
  forbade pre-rotated help, so the roll man met one body instead of a wall.
  `rollOpportunity` is keyed on `helpDefenseFreedom`, so it peaks in the 1960s.
- **Drop coverage** is punished harder as perimeter shot value rises.

### The benchmark caught an era acting as a flat bonus

The first version keyed `rollOpportunity` on `interiorDensity`, which barely
varies. The consequence showed up immediately in the sweep: pull-up, rim
pressure **and** rolling all rose monotonically toward the 2020s — the signature
of an era behaving as a universal multiplier.

Re-keying it on help-defence freedom fixed the cause. Now **pull-up peaks in the
2020s and rolling peaks in the 1960s**, which is both what the rulebook implies
and what makes the era a genuine trade-off.

## 8. Benchmark

`node benchmarks/v3/pick-and-roll.mjs` — **2,700 scenarios**
(5 handlers × 5 screeners × 4 defensive pairs × 3 spacings × 3 coach pairs × 3 eras).

- **7 distinct variants** chosen, top at 44%
- **5 distinct coverages** chosen, top at 32%
- Every input demonstrably matters: shooting gravity, pop threat, rim
  protection, switchability, spacing, era
- No coverage, variant, coach or era dominates

## 9. Isolation

Deterministic · seed-free · imported by no simulation module (test-enforced) ·
`affectsResult` false. The possession engine remains the **future** consumer that
will turn these action outcomes into possessions.

## 10. Confidence

Pull-up shooting and roll/pop threat rest on the least-verified player data — 22%
of cards carry measured shooting splits. Confidence travels with every
evaluation. See `player-data-risk-register.md`.
