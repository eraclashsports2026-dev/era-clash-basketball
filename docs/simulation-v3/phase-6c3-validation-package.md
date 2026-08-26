# Phase 6C3 validation package — PREPARED, NOT RUN

This describes what a later phase would execute. **Nothing here has been run.**
Both holdout sets remain sealed at access count 0, and running any part of this
package is a decision for Phase 6C3, not a consequence of this document.

## Preconditions, all of which must hold first

| Precondition | Current state |
| --- | --- |
| A candidate is locked and immutable | **met** — Candidate 0, `DEVELOPMENT_LOCKED_BASELINE` |
| All candidate-lock engineering gates pass | **met** — 14 of 14 |
| Monte Carlo probability suite passes | **NOT met** — `sideBiasPerCellWithinTolerance` fails |
| An authorized independent second source exists | **NOT met** — no source reaches "permitted" without purchase |
| Tier B target coverage is adequate | **NOT met** — 2 of 384 fields |
| `src/v3/data/eras.js` no longer cites the excluded publisher | **NOT met** |

Three of six are unmet, and two of those are external-data blockers that
engineering cannot resolve. A holdout opened against a model whose targets are
2/384 covered would consume the holdout without being able to learn much from
it — the holdout can only be opened once.

## Why the probability gate must be resolved before, not during

Opening a holdout is irreversible. If the probability suite is still failing when
the holdout is opened, a failed holdout cannot be attributed: it could be the
parameter set, or it could be the estimator defect that was already known. The
gate should either pass, or be revised with a justification written **before**
the holdout is seen.

## The package, in order

1. **Re-verify the lock.** Recompute every hash in `candidate-lock.json`. Any
   mismatch voids the package before anything is opened.
2. **Resolve the probability gate.** Either fix the per-cell side bias, or revise
   the gate with a multiplicity correction whose justification is recorded and
   dated before step 4.
3. **External data clearance.** Owner-managed. Until an authorized independent
   second source exists, the 9 parameters frozen pending external data stay
   frozen and no target-driven calibration of them is possible.
4. **Open historical holdout v3 exactly once.** 8 fixtures. Record the access,
   the timestamp, the parameter set hash, and the result — pass or fail — before
   any interpretation.
5. **Open synthetic stress holdout v2 exactly once.** 16 members.
6. **Report the holdout result without adjustment.** If it fails, the phase
   records `HOLDOUT_FAILED` and produces a replacement-holdout recommendation. A
   failed holdout must not be re-run, re-scored, or re-scoped.
7. **Private preview** only if the holdout passes.
8. **Production activation** only on explicit CEO approval (`GO LIVE`). Inferred
   approval and self-approval are forbidden, and no instruction to complete a
   phase substitutes for it.

## What must be true of the holdout run

- Simulated once, with the locked parameter set hash recorded alongside.
- No parameter may be changed after the holdout is opened. A change after that
  point invalidates the holdout permanently.
- Thresholds must already be frozen. This phase's own history is the argument:
  the first search accepted a candidate under a threshold that had no
  multiplicity control, and a stricter method turned that acceptance into a
  rejection. A threshold chosen after seeing holdout data is worth nothing.

## Accidental access

If any sealed member is accessed before Phase 6C3 authorises it: stop, record
the exact access and what was observed, do not conceal it, do not claim the
holdout remains valid, and produce a replacement-holdout recommendation. The
access count in `validation-summary.json` is the field of record.
