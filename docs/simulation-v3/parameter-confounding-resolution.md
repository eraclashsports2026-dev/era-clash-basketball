# Parameter confounding resolution

**State: MEASURED and RESOLVED. 7 pairs, every one mechanically explicable.**

Measured over **full response signatures** (all 32 metrics), pooled across
interior perturbations, cosine threshold 0.90.

| A | B | cosine | Resolution |
|---|---|---|---|
| `opportunity.form.low` | `opportunity.form.high` | −0.945 | `FREEZE_ALL_PENDING_DATA` |
| `fitBand.TRANSITION.lo` | `fitBand.TRANSITION.hi` | −0.934 | `FREEZE_ALL_PENDING_DATA` |
| `fitBand.GENERIC_HALF_COURT.lo` | `.hi` | −0.919 | `FREEZE_ALL_PENDING_DATA` |
| `shotLocation.rimWeight` | `shotLocation.rimBiasMultiplier` | +0.935 | `FREEZE_ONE_TUNE_ONE` (prefer `rimWeight`) |
| `shotLocation.threeWeight` | `shotLocation.perimeterBiasMultiplier` | +0.936 | `FREEZE_ONE_TUNE_ONE` (prefer `threeWeight`) |
| `coach.actionMixInfluence` | `coach.rosterSensitivity` | +0.912 | see below — **collapse candidate** |
| `coach.offensiveAdjustmentMinEvents` | `coach.offensiveAdjustmentCooldown` | +0.959 | `FREEZE_ONE_TUNE_ONE` (prefer cooldown) |

**Negative cosines are the same finding as positive ones.** The two ends of one
band move a metric in opposite directions by construction; that they are
anti-parallel means one degree of freedom, not two.

Response-matrix approximate condition number: **3.83** against a declared cap of
1000. Phase 6C2C3 declared that cap and then reported only pairwise cosine; the
conditioning is computed here, by power iteration on AᵀA with the remaining
eigenvalues summarised by trace. It is an approximation and is reported as one.

## A correction to how this was measured

Phase 6C2C4's first attempt computed signatures over each parameter's **declared
primary family only**, padding the rest with zeros. That reported **42** pairs, of
which 14 shared an *identical* declared family.

That measures family membership, not confounding. Two parameters declared against
the same three metrics get near-parallel sparse vectors almost by construction.
Confounding is a claim about the whole response pattern, so the whole 32-metric
vector is the correct basis — which gives 7.

Phase 6C2C3 reported 3 pairs on the full basis. The rise to 7 comes from v2's
inverse-variance pooling across perturbations, which is more sensitive than v1's
single-widest-perturbation signature. Both used the same basis; the newer number
has more power behind it.

## The coach parameter decision

`coach.actionMixInfluence` and `coach.rosterSensitivity` were tested explicitly,
as required.

**Definitions.** `actionMixInfluence` is how strongly a coach's documented system
shifts action frequencies away from a neutral roster-derived baseline.
`rosterSensitivity` is how strongly the coach adapts that system toward the
actual roster.

**Measured.** Cosine +0.912. Both peak on `pnrShare` with full-range effects of
0.039 and 0.031 respectively — the same metric, the same direction, similar
magnitude.

**Why.** They are wired as scalars on the two addends of the *same six family
weights*: `actionMixInfluence` on the coach-preference term, `rosterSensitivity`
on the roster-response term. `(coachPost/10)*0.16*A + (best/10)*0.12*B`. Since
both terms feed one normalised mix, scaling either moves the mix the same way.

**Resolution: `COLLAPSE_DUPLICATES` is recommended, and not executed here.**
Separating them requires a fixture where coach preference and roster strength
point in *opposite* directions — a post-oriented coach with no post personnel,
against a post-averse coach with a dominant post player. The synthetic
development set contains no such controlled pair, and constructing one is a
fixture-design task, not a calibration task.

Both are frozen at defaults, so no behaviour depends on the question being
settled. Recommending a collapse without the fixture that would prove it would
be asserting rather than measuring — the error this phase exists to stop
repeating.

## Rules carried forward

- Two unresolved confounded parameters are never tuned together.
- `FREEZE_ONE_TUNE_ONE` preferences: `rimWeight` over `rimBiasMultiplier` and
  `threeWeight` over `perimeterBiasMultiplier`, because the shooter-profile
  coefficient has the cleaner basketball meaning and the bias multiplier is an
  action-level modifier on top of it. Cooldown over min-events, because the
  cooldown's runtime value has a recorded empirical justification.
- In this phase all 7 are frozen regardless, because none of them clears the
  support gate either — see `calibration-readiness-v2.md`.
