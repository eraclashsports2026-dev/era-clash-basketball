# Synthetic V2 verdict aggregation

The 6C4B2 blocker recorded: "NO frozen rule turns per-fixture guardrail outcomes
into a set verdict. The guardrails are per-fixture predicates; the pass/fail
arithmetic over 16 fixtures is undefined."

## The set verdicts

| verdict | meaning |
|---|---|
| `SYNTHETIC_HOLDOUT_V2_PASS` | no fixture FAILed, no fixture was INVALID_RUN, and every required guardrail was decided PASS on at least its minimum number of applicable fixtures |
| `SYNTHETIC_HOLDOUT_V2_FAIL` | at least one fixture FAILed |
| `SYNTHETIC_HOLDOUT_V2_INVALID_RUN` | no fixture FAILed but the run cannot support a PASS — a fixture was INVALID_RUN, or a required guardrail was never decided on enough fixtures |

## The rule

1. Compute every guardrail-fixture cell from the frozen thresholds and the frozen practical margins. A cell is PASS or FAIL only if the observation clears the threshold by at least the practical margin; inside the margin it is INDETERMINATE.
2. Apply the catastrophic rule: a failed structural or determinism guardrail makes its fixture FAIL and every non-structural cell on that fixture INDETERMINATE.
3. A fixture's verdict is FAIL if any of its cells is FAIL; INVALID_RUN if any required cell is NOT_MEASURED; otherwise PASS provided at least one cell is PASS.
4. The set verdict is SYNTHETIC_HOLDOUT_V2_FAIL if any fixture is FAIL.
5. Otherwise the set verdict is SYNTHETIC_HOLDOUT_V2_INVALID_RUN if any fixture is INVALID_RUN, or if any adjudicable guardrail was decided PASS on fewer than its minDecidedFixturesForSetPass applicable fixtures.
6. Otherwise the set verdict is SYNTHETIC_HOLDOUT_V2_PASS.

## Zero fixture failures are tolerated

`perGuardrailAllowedFailures: 0`.

A failure budget — 'k of 16 fixtures may breach' — would weaken a frozen numeric threshold, which this phase may not do. The protection against a noise-driven failure is the practical margin, not a tolerance for real breaches: an observation within the margin of the threshold is INDETERMINATE, never FAIL. So the strict reading costs nothing in robustness and invents no allowance the frozen policy does not contain.

## A run cannot pass by being unmeasurable

a run cannot pass by being unmeasurable: every adjudicable guardrail must be decided PASS on at least two thirds of its applicable fixtures, rounded up, and never fewer than one.

| guardrail | applicable fixtures | must be decided PASS on |
|---|---|---|
| `requireZeroInvariantFailures` | 16 | 11 |
| `requireZeroImpossibleResults` | 16 | 11 |
| `forbidUniversalActionDominance` | 16 | 11 |
| `forbidUniversalShellDominance` | 9 | 6 |
| `requireSameSeedReplay` | 16 | 11 |
| `requireNewSeedVariance` | 16 | 11 |
| `requireConstructionCanBeatHigherOvr` | 5 | 4 |
| `requireExtremeTalentRemainsMeaningful` | 1 | 1 |

On top of this, the runner requires the set-level construction existential bar:
if no applicable fixture ever demonstrates a coherent lower-rated five winning at
least 0.35 of decided
games, `requireConstructionCanBeatHigherOvr` has not been demonstrated at all and
the set verdict is `SYNTHETIC_HOLDOUT_V2_INVALID_RUN` rather than a pass.

