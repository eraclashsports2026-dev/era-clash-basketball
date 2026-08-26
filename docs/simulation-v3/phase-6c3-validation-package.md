# Phase 6C3 validation package

**State: NOT PREPARED. There is no candidate to validate.**

Phase 6C3 opens the formal holdouts exactly once, against a locked candidate.
Phase 6C2C4 locked nothing, so the package cannot be assembled — and assembling a
placeholder would invite the one irreversible mistake available here: burning a
one-time holdout on a parameter set identical to the defaults.

## Holdout status — unchanged and must stay so

| Set | State | Access count |
|---|---|---|
| `historical-holdout-v3` | `SEALED_UNREAD` | **0** |
| `synthetic-stress-holdout-v2` | `SEALED_UNREAD` | **0** |
| `historical-holdout-v2` | `SEALED_UNREAD` | 0 |
| `legacy-holdout-v1` | `SEALED_UNREAD` | 0 |
| `synthetic-stress-v1` | `PREVIOUSLY_INSPECTED_ARCHIVE` | 0 |

**Do not open either formal holdout to validate the default parameter set.** The
default set is not a calibration; it is the engine's existing behaviour. Measuring
it against a holdout would consume the holdout and answer a question nobody asked.

## What Phase 6C3 needs before it can run

1. A locked candidate: `possessionCalibrationVersion = 1.0.0`, status
   `DEVELOPMENT_LOCKED_SCOPED`, with at least one parameter actually moved from
   its default.
2. That candidate's `parameterSetHash`, `calibrationScopeHash`, `foldHash` and
   `identifiabilityPolicyHash` recorded in an immutable manifest.
3. The lock commit pushed, working tree clean.
4. A frozen holdout acceptance policy — already exists from Phase 6C2C2
   (`holdoutAcceptancePolicyVersion 1.0.0`, ratio cap 1.50, zero catastrophic
   fixtures, ≥1,000 games per fixture).

Items 1 and 2 do not exist. Item 3 is satisfiable. Item 4 is done.

## Commands, and what they must refuse

```bash
npm run validation:historical-holdout -- --unlock-holdout
npm run validation:synthetic-holdout -- --unlock-holdout
npm run validation:engine-comparison
npm run validation:private-preview
```

These are **not created in this phase**. Creating an unlock command with no
candidate to justify it makes the irreversible action one flag away from a
curious operator.

When they are created, the requirements are:

- The unlock flag must be mandatory, and absent it every command refuses.
- Each must verify the candidate's `parameterSetHash` matches the locked
  manifest before reading a single fixture, and abort on mismatch.
- Each must refuse a candidate whose status is not `DEVELOPMENT_LOCKED_SCOPED`.
- Each must refuse when `possessionCalibrationVersion` is `null` — which is the
  current state, and the reason none of them exists yet.
- The access event must be written **before** the first simulation, so a crash
  mid-run still records that the seal was broken.
- No ordinary command may reach a holdout fixture. Every existing calibration
  script already asserts this, and `npm run probability:estimate` already refuses
  a holdout fixture id by name.

## Prerequisites that are not engineering

Recorded in [`external-calibration-prerequisites.md`](external-calibration-prerequisites.md).
The two that need no procurement:

1. **Legal clearance of `src/v3/data/eras.js`** — 64 values already in the
   repository, blocking the 7 strongest measurable parameters.
2. **Confounding-resolution fixtures** — a controlled pair where coach preference
   and roster strength oppose each other, to separate `actionMixInfluence` from
   `rosterSensitivity`.

## What Phase 6C3 inherits and need not redo

| Asset | Hash |
|---|---|
| Runtime wiring, 53/53 authoritative | binding `1.0.0` |
| Default parity, 32/32 exact | fixture set `1.0.0` |
| Identifiability v2 methodology | `04c4b45bf1752ce0` |
| Internal folds v3, leak-free | `ab4af0cb555bbe24` |
| Readiness reconciliation | `63fbd507faa74882` |
| Default parameter set | `83f5a17dea0c36d4` |

A future phase starts at the search, not at the plumbing.
