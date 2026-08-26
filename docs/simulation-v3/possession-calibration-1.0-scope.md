# Possession calibration 1.0 — scope

**State: NOT LOCKED. `possessionCalibrationVersion = null`.**

There is no calibration 1.0. This document records why, and what the scope would
be if the blockers cleared.

## Why no candidate exists

A candidate requires at least one eligible parameter. Readiness v2 reconciled at
53 of 53 with **0 eligible for search**:

| Class | Count |
|---|---|
| `FREE_CALIBRATION` | 0 |
| `STRONGLY_REGULARIZED_CALIBRATION` | 0 |
| `STRUCTURAL_CALIBRATION_ONLY` | 2 |
| `DEFAULT_FROZEN_CONFOUNDED` | 7 |
| `DEFAULT_FROZEN_NO_EFFECT` | 37 |
| `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` | 7 |

## Domain claim status

Every domain, honestly labelled:

| Domain | Status |
|---|---|
| Opportunity distribution | `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` — no measurable effect at declared thresholds |
| Shot location | `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` — strong effects, no authorized target |
| Conversion | `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` — strong effects, no authorized target |
| Possession events | `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` |
| Era style / three-point | `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA` — `eras.js` provenance |
| Zone | `STRUCTURALLY_CALIBRATED` (structural checks only; nothing fitted) |
| Coach identity | `DEFAULT_FROZEN_CONFOUNDED` |
| Adjustments | `DEFAULT_FROZEN_CONFOUNDED` |
| Probability | `INTERNALLY_PROBABILITY_VALIDATED` (against the engine, not history) |
| Rules (3PT line, zone legality, shot clock, conservation) | `FIXED_BASKETBALL_RULE` |
| Formal holdout validation | `FORMAL_HOLDOUT_NOT_YET_OPENED` |

Nothing is `HISTORICALLY_NUMERICALLY_CALIBRATED`.
Nothing is `HISTORICALLY_QUALITATIVELY_CALIBRATED`.

## What a locked 1.0 would require

In dependency order:

1. **Legal clearance of `eras.js`** — 64 era-environment values already in the
   repository. Cheapest item; unblocks 7 parameters that include the strongest
   measurable effects in the engine.
2. **Confounding resolution fixtures** — a controlled pair where coach preference
   and roster strength point in opposite directions would separate
   `actionMixInfluence` from `rosterSensitivity`. Fixture design, no purchase.
3. **A licensed Tier B source** — the only route to `FREE_CALIBRATION` for
   anything, because it is the only route to team-efficiency and possession-event
   targets.
4. **A revisit of the practical-effect thresholds** — declared before results and
   correctly not moved afterward, but the margin on several share metrics is
   close enough that a future phase should set them deliberately, before running.

Items 1 and 2 need no procurement. They should go first.

## What is already locked and does not need redoing

- Runtime wiring: 53 of 53 parameters authoritative, 0 disconnected.
- Default parity: 32 of 32 fixtures byte-identical including RNG step counts.
- Identifiability methodology: v2, frozen, hash `04c4b45bf1752ce0`.
- Internal folds: v3, leak-free, hash `ab4af0cb555bbe24`.
- Readiness: reconciled, hash `63fbd507faa74882`.

A future phase inherits all of it and starts at the search, not at the plumbing.
