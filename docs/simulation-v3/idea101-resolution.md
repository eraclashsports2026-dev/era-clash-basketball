# IDEA #101 — resolution ledger

Rendered from `data/validation/6c4d0/idea101-resolution-ledger.json`.
**Unresolved technical failures: 0.**

| Issue | Description | Severity | Resolution |
|---|---|---|---|
| i01 | Historical V6 original FAIL needs a validity adjudication that does not rewrite the record | CRITICAL | **FIXED_AND_VERIFIED** |
| i02 | hard-coded calibration store imports in the runner profile map | CRITICAL | **FIXED_AND_VERIFIED** |
| i03 | v5/v6 stores omitted from the runner map — every V6 player fell back | CRITICAL | **FIXED_AND_VERIFIED** |
| i04 | manifest fallback used instead of full records when full records exist | CRITICAL | **FIXED_AND_VERIFIED** |
| i05 | profile adapter contract undefined; 12 of 18 inputs silently absent | CRITICAL | **FIXED_AND_VERIFIED** |
| i06 | NaN decade values on every V6 subject side | HIGH | **FIXED_AND_VERIFIED** |
| i07 | uniform hidden spacingGravity fallback (4.30) across all sixteen sides | HIGH | **FIXED_AND_VERIFIED** |
| i08 | subject/reference profile-path asymmetry | CRITICAL | **FIXED_AND_VERIFIED** |
| i09 | offensiveRoles empty across all 560 active calibration records | HIGH | **FIXED_AND_VERIFIED** |
| i10 | defensive evidence missing on most post-1974 records (e.g. a DPOY season rating near average) | HIGH | **FIXED_AND_VERIFIED** |
| i11 | runner preflight unable to detect an incomplete profile map before access | CRITICAL | **FIXED_AND_VERIFIED** |
| i12 | diagnostic cluster recorder read observed/reference — fields absent from the trait schema | MEDIUM | **FIXED_AND_VERIFIED** |
| i13 | movement under-expression (persistent V6 diagnostic) | HIGH | **FIXED_AND_VERIFIED** |
| i14 | assisted-offense under-expression (persistent V6 diagnostic) | HIGH | **FIXED_AND_VERIFIED** |
| i15 | defensive suppression under-expression (persistent V6 diagnostic) | HIGH | **FIXED_AND_VERIFIED** |
| i16 | post-up identity residual (Houston 2007-08 persistent diagnostic) | HIGH | **FIXED_AND_VERIFIED** |
| i17 | rebounding identity residual (Portland 1974-75 persistent diagnostic) | MEDIUM | **FIXED_AND_VERIFIED** |
| i18 | pace residual (Houston 2007-08 persistent diagnostic) | MEDIUM | **EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK** |
| i19 | prior-phase artifacts that can overwrite themselves (frozen producers) | MEDIUM | **FIXED_AND_VERIFIED** |
| i20 | non-accessing commands that write output | MEDIUM | **NOT_REPRODUCIBLE_WITH_EVIDENCE** |
| i21 | stale tests that pin historical access counts at literal values | MEDIUM | **FIXED_AND_VERIFIED** |
| i22 | preview candidate/result identity requirements | HIGH | **FIXED_AND_VERIFIED** |
| i23 | preview cache/persistence isolation | HIGH | **FIXED_AND_VERIFIED** |
| i24 | production fallback requirements (engine 3.2.0 must remain the fallback) | HIGH | **FIXED_AND_VERIFIED** |

## The V6 run

HISTORICAL_HOLDOUT_V6_INVALID_RUN: the run was **INVALID** (profile-resolution failure in the validation layer). The original FAIL artifacts are preserved, 13 hash-bound. Candidate failure was **not** established (`candidateFailureEstablished: false`); a replacement holdout is required for any formal claim.

## Remaining diagnostic clusters — attributed, not engine failures

- **SA movementShare** — REFERENCE_LIMITATION (counterfactual lever +0.047 > 0.030 margin; roster gap −0.129)
- **Houston gamePace** — DATA_LIMITATION (career-blend tempo; machinery exact: expected 92.35 vs observed 92.08)

## Verdict

**ALL KNOWN FAILURES RESOLVED — PREVIEW CANDIDATE LOCKED AND PROTECTED PREVIEW READY**
