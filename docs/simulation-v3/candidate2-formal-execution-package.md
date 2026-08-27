# Candidate 2 formal execution package

**Phase 6C4C2.** Everything an operator needs to run Candidate 2's two formal
stages in order. Built, not executed.

## The three stages

| Stage | Set | Command |
|---|---|---|
| 1 | `historical-holdout-v6` | `npm run validation:historical-v6 -- --run` |
| 2 | `synthetic-stress-holdout-v2` | `npm run validation:synthetic-candidate2 -- --run` |
| 3 | — | `npm run validation:candidate2-formal-verdict -- --issue` |

Both sets stand at access count 0.

## Operator sequence

```
1. npm run validation:historical-v6 -- --preflight
2. npm run validation:historical-v6 -- --run --unlock-holdout \
     --unlock-historical-holdout-v6 --operator="<email>" --reason="<why>"
3. npm run validation:synthetic-candidate2 -- --preflight
4. npm run validation:synthetic-candidate2 -- --run --unlock-holdout \
     --unlock-synthetic-stress-holdout-v2 --operator="<email>" --reason="<why>"
5. npm run validation:candidate2-formal-verdict -- --preflight
6. npm run validation:candidate2-formal-verdict -- --issue
```

Step 4 refuses with `SYNTHETIC_ACCESS_REFUSED` unless step 2 returned PASS on the
same core and parameter set. The order cannot be got wrong by accident.

## Hash namespacing

40 bound entries across four namespaces: `candidate.*`, `historicalV6.*`,
`synthetic.*`, `compound.*`.

This is load-bearing, not cosmetic. **Eight key names genuinely collide** across
the two stages:

`candidateCoreHash`, `parameterSetHash`, `possessionCalibrationVersion`,
`policyHash`, `practicalMarginPolicyHash`, `samplePlanHash`, `seedSetHash`,
`dryRunArtifactHash`

Phase 6C4B1S's first compound package merged the two stages' hash maps flat.
Stage two's values were bound under stage one's names and stage one's four were
left **unbound, silently** — the exact class of gap a binding package exists to
close.

Two gates protect it: one proves the merged count equals the sum of the parts
(`6 + 15 + 17 + 2 = 40`), and one proves the collisions are real, so the
namespacing cannot decay into decoration.

## Compound verdict vocabulary

Each value names the stage that **decided**, so a reader cannot mistake a
decisive failure for unfinished work. Phase 6C4B2R's first version collapsed a
decisive stage-one failure into `INCOMPLETE`, which reads as "we have not
finished" when the truth was "stage one failed and stage two must never be
opened".

| Verdict | Meaning |
|---|---|
| `CANDIDATE2_HOLDOUT_VALIDATED` | both stages PASS on the same locked candidate |
| `CANDIDATE2_HISTORICAL_V6_FAILED` | stage one FAILED; stage two correctly never opened |
| `CANDIDATE2_HISTORICAL_V6_INVALID` | stage one could not produce a result; stage two correctly never opened |
| `CANDIDATE2_SYNTHETIC_V2_FAILED` | stage one passed, stage two FAILED |
| `CANDIDATE2_SYNTHETIC_V2_INVALID` | stage one passed, stage two could not produce a result |
| `CANDIDATE2_IDENTITY_SPLIT` | the two stages scored different cores or parameter sets |
| `CANDIDATE2_STAGE_ORDER_VIOLATED` | stage two was opened without a passing stage one; the synthetic result is not evidence |
| `CANDIDATE2_NOT_YET_DETERMINED` | no stage has produced a formal result |

`CANDIDATE2_STAGE_ORDER_VIOLATED` is new. A synthetic result obtained without a
passing stage one is not evidence whatever it says, and saying so is more
informative than reporting it as a stage-two outcome.

## The command surfaces are certified by measurement

19 invocations across the three commands, each actually executed with both access
logs read before and after. A command that says it opens nothing is certified by
the counter, not by its own comment.

The destructive modes are certified by their **refusals**: six `--run`
invocations without unlock flags, every one refused with the counter unchanged.
Every command refuses an unrecognised flag and requires an explicit mode, so a
bare or mistyped invocation cannot reach a seal.

Both counters read 0 before and 0 after.

## Readiness

`candidate2-formal-execution-readiness.json` sets
`mayExecutePhase6C4C3 = true` against thirteen measured requirements.

**Phase 6C4C3 may:** open Historical V6 once; if and only if it passes, open
Synthetic V2 once; issue the compound verdict.

**Phase 6C4C3 may not:** change any bound hash, threshold, margin, trait,
target, reference, seed or policy; re-select, re-seal or re-derive anything; tune
Candidate 2 against a V6 or Synthetic V2 observation; open Synthetic V2 without a
passing Historical V6; build or deploy a preview, deploy production, activate a
production flag, or merge to main; claim `HOLDOUT_VALIDATED`,
`PRIVATE_PREVIEW_VALIDATED`, `PRODUCTION_READY` or `ACTIVE`.

Production activation requires an explicit CEO GO LIVE. Nothing in this package
authorizes any deployment.

## Related

- `historical-holdout-v6.md`
- `synthetic-v2-candidate2-rebinding.md`
- `historical-v6-verdict-aggregation.md`
