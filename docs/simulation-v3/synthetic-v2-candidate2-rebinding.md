# Synthetic Stress Holdout V2, rebound to Candidate 2

**Phase 6C4C2.** Stage two of Candidate 2's two-stage formal validation. Still
sealed at access count 0, still never read.

## Rebind, not replace

Phase 6C4C1's compatibility audit disposed the set
`POLICY_COMPATIBLE_REBIND_REQUIRED`. Phase 6C4C2 verifies that disposition
against the artifacts rather than trusting the label:

| Property | State |
|---|---|
| membership | preservable — Candidate 2 changed no card, coach, era or position rule |
| metric definitions | unchanged — `assistedRate` is still assists over made field goals; `refPppVsTeam` is still opponent points per possession |
| guardrail meanings | unchanged across all audited guardrails |
| competition definitions | unchanged |
| result schema | unchanged |
| replay schema | unchanged — the fingerprint gains no field |
| runner interface | compatible |

The audit's own rule: a replacement V3 is required **only** if a metric or
guardrail changed **meaning**. None did. Candidate 2 changed the values these
metrics take, which is precisely what the holdout exists to measure.

Replacing the set would discard an unread holdout to avoid re-deriving four
numbers. The set is rebound instead.

## What the rebind changed

The compatibility audit named four items. All four are addressed:

**1. Identity binding.** The Candidate 1 formal policy records core
`de57e1a9…`, calibration 1.1.0 and lock revision 2. The binding artifact records
Candidate 2's core `3733b648…`, parameter set and calibration 1.2.0. The
Candidate 1 policy is read for its candidate-independent parts and is **not
edited**. The command's preflight fails if the bound core differs from the loaded
one or matches Candidate 1's.

**2. Policy candidate block.** Superseded for a Candidate 2 run by the binding
artifact, which records what it supersedes and states that it did not overwrite
it.

**3. Derived thresholds re-derived under Candidate 2.** The four
development-calibrated thresholds — `minCombinedScoreSd` (variance floor),
`constructionWinRateFloor`, `constructionExistentialBar` and
`talentWinRateFloor` — are re-derived by running the 14
`SYNTHETIC_DEVELOPMENT_V2` fixtures and the role-matched upgrade ladder through
the frozen surfaces at the frozen volumes under Candidate 2, then calling **the
same `derive()`** the Candidate 1 policy used.

The derivation rule is shared; only the evidence differs. Candidate 2's evidence
hash is `4f44f3e7…` against Candidate 1's `b8188a7d…`, and its ladder hash
`39d77022…` against `cd5e391c…`. A gate fails if either matches, because a
silently re-read Candidate 1 number and a genuine re-derivation are otherwise
indistinguishable in the artifact.

All four landed on the **same values** Candidate 1 got. That is a finding, not a
copy: the derivation rounds to steps of 0.5, 0.005 and 0.05, and Candidate 2's
slightly different control spread is absorbed by that rounding.

The three acceptance-policy thresholds (`maxSingleActionFamilyShare`,
`maxSingleShellWinRate`, `minSingleShellWinRate`) are candidate-independent and
carried unchanged.

Practical margins are properties of the metric and its measurement noise. They
are re-derived from Candidate 2 control spread by the same rule —
`max(3 × largest observed standard error, domain floor)`.

**4. The stage-one gate.** This is the substantive change.

## The stage-one gate names Historical V6

The Candidate 1 command required a passing **Historical V5**. V5 is consumed and
returned FAIL, so a gate still naming it could never clear — and worse, a gate
requiring merely "a historical stage to have run" would have been satisfied by a
failure.

`scripts/validation/synthetic-candidate2.mjs` requires, in code, before the seal
is touched:

1. a Historical V6 results artifact exists;
2. its outcome is PASS;
3. it ran the **same** core and parameter set as the loaded candidate.

Otherwise the command exits `SYNTHETIC_ACCESS_REFUSED` and the access counter is
unchanged. A synthetic stress pass says nothing about a candidate that failed the
historical stage, and opening this set after a historical failure would consume a
one-shot resource for no evidence.

During Phase 6C4C2 the preflight refuses on exactly those three checks and passes
every rebind check. That is the correct state for a preparation phase.

## Modes

`npm run validation:synthetic-candidate2`

`--help` and `--preflight` cannot reach the seal. `--run` requires
`--unlock-holdout`, `--unlock-synthetic-stress-holdout-v2`, `--operator` and
`--reason`. An unknown flag is refused outright.

## What the rebind did not do

- Synthetic V2 was not opened
- no Synthetic V2 fixture was simulated
- no Synthetic V2 output was read or produced
- Historical V6 was not opened

Access count: 0.

## Related

- `historical-holdout-v6.md` — stage one
- `candidate2-formal-execution-package.md` — how the two stages are bound together
- `data/validation/6c4c1/synthetic-v2-candidate2-compatibility.json` — the audit
- `data/validation/6c4c2/synthetic-v2-candidate2-binding.json` — the rebind
