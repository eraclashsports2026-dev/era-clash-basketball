# Phase 6C2C6 limitations

What this phase established, what it did not, and what went wrong on the way.

## The headline

Candidate 0 — the wired default parameter set, all 53 active parameters at their
registry defaults — is locked as `DEVELOPMENT_LOCKED_BASELINE` with
`possessionCalibrationVersion = 1.0.0`, after 35 engineering gates passed.

No parameter value changed in this phase. None changed in the phase before it.
The lock records a calibration *result*: 84 on-grid alternatives were measured
against an authorized historical target and none survived family-wise
correction, so the defaults remain the best-supported values available.

## The status contradiction was real, and worse than reported

It was reported as prose disagreeing with the repository. It was in fact inside
a **single artifact**: `data/calibration/c5/candidate-lock.json` asserted
`status: DEVELOPMENT_LOCKED_BASELINE` while its own
`versions.possessionCalibrationVersion` was `null` and its own
`allEngineeringGatesPass` was `false`.

The cause was the status model. That artifact had no `candidateSelectionStatus`
and no `candidateLockStatus` field, so one `status` field carried two different
claims — "this is the selected candidate" and "this candidate is locked". With a
failing gate the honest values were SELECTED and UNLOCKED, and one field cannot
hold both, so the stronger word won.

## What was actually wrong with the v1 side-bias gate

Three separate defects, not one:

1. **Wrong scale.** Its statistic was `goldWinsOverall / n - 0.5`, which for this
   balanced paired design is algebraically *half* the paired orientation effect.
   Verified symbolically and numerically: −0.0781 reported, −0.1562 paired,
   ratio 2.0000. The 0.05 margin therefore permitted a paired effect of 0.10.
2. **Wrong variance.** It reported `sqrt(0.25/256)` = 0.03125, a
   single-proportion standard error assuming independence. The two orientations
   share a seed. On the failing cell 52 of 128 pairs were discordant, giving
   `sd(D)` = 0.6204 against the 0.7071 independence implies, so the true
   standard error on v1's own scale was 0.0274.
3. **No multiplicity control.** It took the maximum of 30 cells and compared it
   against an unadjusted fixed threshold.

**This corrects a claim I made in Phase 6C2C5.** I wrote there that the gate
"will exceed it in most runs by construction", computing the observation at 2.49
standard errors against a threshold at 1.60. That used v1's own understated
standard error. On the correct paired variance the observation sat at 2.85
standard errors and the threshold at 1.82 — the gate was less trigger-happy than
I claimed, and the observation more extreme. My analysis was directionally
right about the multiplicity problem and wrong in its arithmetic.

## The margin was not moved

The per-cell margin is still 0.05, v1's value, against a v1 observation of
0.0781. Applied to the corrected paired scale it is **twice as strict** as v1's
gate in effect. Equivalence must now be positively established rather than
merely undetected, which is a further tightening: v1 could pass a cell it had no
power to evaluate, and v2 cannot.

## What the corrected gate found

44 cells, 722,944 games, on a seed domain proven disjoint from all three prior
domains at 16,384 pairs. Every cell EQUIVALENT. Pooled paired effect −0.00185
with a 95% interval of [−0.00469, +0.00100] inside the ±0.01 aggregate margin.
No systematic stratum. Zero invariant violations, zero ties.

The previously failing cell, with nothing discarded:

| pairs | delta | simultaneous interval | class |
| --- | --- | --- | --- |
| 256 | −0.03125 | [−0.16469, +0.10219] | INCONCLUSIVE |
| 1024 | −0.00879 | [−0.07418, +0.05660] | INCONCLUSIVE |
| 4096 | **+0.00854** | [−0.02480, +0.04189] | **EQUIVALENT** |

At 32× the v1 sample, on seeds it was never selected on, the effect is +0.0085
and the sign has reversed. That is what the maximum of thirty noisy cells looks
like when you measure it again.

## Limitations of this result

- **Two era strata cannot be evaluated for systematicity.** The frozen family
  has one cell each for the 1970s and 1990s, so those strata report `null`
  rather than a verdict. The gate correctly declines to call a single cell
  systematic, but "no systematic era effect" is established for the 2010s (36
  cells), 1960s (3) and 2020s (3) only.
- **The cell family is synthetic.** All 44 cells are drawn from the synthetic
  development set. No historical fixture appears, and no holdout fixture could.
- **Mirror cells are the strongest evidence here, and they are artificial.**
  Identical rosters remove team quality entirely, which is exactly what makes
  them a clean side probe and also what makes them unlike any real matchup.
- **Equivalence at ±0.05 is not equality.** A true paired effect of 0.03 would
  pass this gate. The aggregate gate at ±0.01 is what bounds the systematic case.
- **The pooled bootstrap is expensive and approximate.** 10,000 resamples over
  ~720,000 pairs dominated the run's tail. It agreed with the Wald interval
  everywhere, which is the check that matters.

## What the lock does not mean

- NOT fully historically calibrated. 9 parameters remain
  `DEFAULT_FROZEN_PENDING_EXTERNAL_DATA`, and Tier B coverage is 2 of 384 fields.
- NOT formal-holdout validated. Both holdouts remain `SEALED_UNREAD` at access
  count 0, and the Phase 6C3 package has 3 of 7 preconditions unmet.
- NOT private-preview validated, NOT production ready, NOT active.
- NOT legally or licensing cleared.
- `1.0.0` does not mean "tuned". It names a specific parameter set — the
  defaults — so later phases can refer to exactly this one.

## Three parameters remain unadjudicated

`opportunity.mismatch.severe`, `zone.highPostVulnerability` and
`zone.cornerVulnerability` produce bit-identical values of the scoring-share
objective across their full registry ranges. Their mechanics were confirmed to
respond in their predeclared directions, monotonically, with no guardrail
breaches — but direction and monotonicity constrain *sign*, not *magnitude*.
They are frozen at their defaults and classified
`DEFAULT_FROZEN_UNADJUDICATED`, which is a statement that no available target
can rank their values, not that the default was shown to be best.

## Errors made in this phase

1. `reconcile()` takes a class→ids map; I passed a flat array, so it iterated the
   characters of each id string and reported a false failure.
2. `writeArtifact` returns `{path, payload}`; I destructured `artifact`.
3. The roster-reversal control reversed the array **without** preserving
   position assignments, which assigns a centre to point guard. The engine
   rightly refused it.
4. I labelled that control's result `orderIndependent: false` on the strength of
   400/400 differing games. That conflated "same result" with "same
   distribution". `teamIntelligence` is byte-identical under reorder, and the
   distribution is unchanged; only the RNG realization differs.
5. A `sameParameterSetBothOrientations` check compared `registryDefaultsHash()`
   against a compiled `parameterSetHash` — two different functions over
   different populations. This is the *same* conflation that produced an
   unfailable gate in 6C2C5.
6. A diagnostic read `r.mismatch` where the field is `r.mismatchSeverity`,
   reporting 0 SEVERE possessions where there are 212. It was caught only
   because it contradicted a non-zero effect already measured.
7. A parameter-read trace reported "NEVER READ" for every parameter, because
   `noteParameterRead` is instrumented on only two paths. Trusting it would have
   produced the conclusion that three wired parameters were unwired.
8. I registered `phase6C3ValidationPackageVersion` as PLANNED with a non-null
   value, breaking the guard that requires PLANNED domains to refuse to key a
   cache.
9. A test asserted `toBeCloseTo(0.05/44, 6)` against an artifact field rounded to
   5 decimal places.
10. A test contained a meaningless ternary on `expect(...).toBeLessThan`, which
    is a function reference and therefore always truthy.

Also found, in Phase 6C2C5's committed code: its `artifactsVerify` gate tested
`verifyArtifact(n).ok !== false`, and `verifyArtifact` returns `valid`, never
`ok` — so `undefined !== false` made that gate unfailable. That is the second
unfailable gate found in that phase's lock, after the `|| true` one it disclosed
itself.

### What caught them

Not review. Items 1, 2, 3 and 8 were caught by a command or a test failing
immediately. Items 5 and 6 were caught by two of my own measurements
disagreeing. Item 4 was caught by asking whether a difference was in the
statistic or in the distribution, which required a second measurement rather
than a second reading. Item 7 was caught by preferring a behavioural test that
depends on no instrumentation — the same mitigation that worked in the two
previous phases.

The pattern named in Phase 6C2C5's limitations still holds: my first instinct is
to assert coverage rather than verify it, and the fix that works is a direct
test at extreme values rather than a number handed over by a pipeline.
