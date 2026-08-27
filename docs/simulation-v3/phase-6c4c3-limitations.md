# Phase 6C4C3 — limitations and scope of claims

Rendered from the phase artifacts.

## What this phase established

- Historical Holdout V6 was opened exactly once, on locked Candidate 2, under a
  package frozen and pushed before access. Verdict **HISTORICAL_HOLDOUT_V6_FAIL**.
- 172,032 games across 8 matchups and
  8 Era Styles, with zero invariant violations, zero final
  ties, zero impossible scores, zero pre-three-era three-point attempts, and exact
  replay on every surface.
- The numeric share proxy passed: composite 0.0345 against an
  internal baseline of 0.0431, ratio 0.80054
  against a gate of 1.5. Zero catastrophic teams.
- Observable historical trait fidelity **failed**: pass rate 0.67391
  against a minimum of 0.75, and
  8 independent hard-fail clusters against a
  gate of 0.

## What this phase did NOT establish

- Nothing about the Synthetic Stress Holdout under Candidate 2. It was not
  opened and holds no result. Its access count is
  0.
- Nothing about Candidate 2 in a preview or production setting.
- No claim of `HOLDOUT_VALIDATED`, `PRIVATE_PREVIEW_VALIDATED`,
  `PRODUCTION_READY` or `ACTIVE`.

## Scope separation

| Scope | Status |
| --- | --- |
| historical numeric validation | PASSED — share proxy within policy, zero catastrophic teams |
| historical proxy validation | PASSED — Tier C season-share proxy on all 16 sides |
| historical trait validation | **FAILED** — trait pass rate and independent hard-fail clusters |
| synthetic structural validation | NOT ATTEMPTED — set never opened |
| replay validation | PASSED — exact on every surface |
| invariant validation | PASSED — zero violations |
| preview status | NOT_PREPARED |
| production status | UNCHANGED |

## Unavailable scope

27 team
metrics are unscoreable and were excluded from the verdict entirely; they can
neither pass nor fail. An unscoreable metric is excluded from the verdict entirely. It cannot be reached by any gate, so it can neither pass nor fail, and its absence is not evidence either way. The verdict rests only on the scoreable set.

5 of 16 observability
metrics did not certify under Candidate 2 and no trait was scored on them.

## Legal scope

Wikipedia (CC BY-SA 4.0) is the only authorized source; only extracted numeric
facts are committed. basketball-reference.com is
`PROHIBITED_FOR_MODEL_CALIBRATION`, which is why
`SOURCE_BLOCKED_LICENSING` cells exist as nulls rather than being filled.

## Known recording defect

the formal cluster record in historical-v6-results.json carries observed and reference as null, because clusterHardFails read t.observed and t.reference while the trait records name those fields subjectMean and referenceMean.

It did not change the adjudication: 12 hard-fail labels · 8 clusters under the as-run key · 8 under the intended key with the real means · the gate requires 0. It was not
fixed because the runner's semantics are frozen and the set is consumed. Changing the cluster key after access would make the run INVALID rather than correct it. A coarser key can only merge labels, never split them, so the recorded count is a lower bound and the verdict is identical under both keys.

## A prior-phase artifact was briefly overwritten

Running `npm run v5:certify-core` during this phase's quality gates rewrote
`data/validation/6c4b1/candidate-core-graph-certification.json`, a
Candidate-1-scoped record pinned to Candidate 1's locked core. It was restored
from git to its committed state and no other prior-phase artifact was touched.
Core-graph verification for this phase comes instead from the live core
recomputation compared against the Candidate 2 lock, which the preflight
performs.
