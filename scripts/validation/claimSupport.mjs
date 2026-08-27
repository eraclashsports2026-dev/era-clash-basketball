// ── Trait-claim support checker (prospective, for V7+ selection) ─────────────
// Two V6 clusters survived every honest repair because the CLAIM was not
// satisfiable by the inputs: a movement claim measured against a reference five
// that out-personnels the subject on that axis, and a pace claim whose coach
// record is a career blend that cannot express one slow phase. A future
// selection must not score a claim its own inputs cannot support — that is a
// selection-time check, not an engine bonus.
export const CLAIM_SUPPORT = Object.freeze({
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED_AGAINST_REFERENCE: "UNSUPPORTED_AGAINST_REFERENCE",
  COACH_EVIDENCE_INSUFFICIENT: "COACH_EVIDENCE_INSUFFICIENT",
});

const maxOf = (profiles, f) => Math.max(...profiles.map((p) => f(p) ?? 0), 0);

/**
 * Assess whether a directional ABOVE_REFERENCE claim on `metric` is supportable
 * by the subject's coach intent + roster against the reference's own personnel.
 * Conservative and deterministic; every rule is stated in the result.
 */
export const assessClaimSupport = ({ metric, direction, subjectCoach, subjectProfiles, referenceProfiles }) => {
  const rules = [];
  const verdictOf = (state, why) => ({ metric, direction, state, why, rules });
  if (direction !== "ABOVE_REFERENCE_BASELINE") return verdictOf(CLAIM_SUPPORT.SUPPORTED, "below-baseline and joint claims are assessed by their own instruments");
  if (metric === "movementShare") {
    const subjMover = maxOf(subjectProfiles, (p) => p.offense?.offBallMovement);
    const refMover = maxOf(referenceProfiles, (p) => p.offense?.offBallMovement);
    const intent = Math.max(subjectCoach?.offense?.motion ?? 5, subjectCoach?.offense?.offBallMovement ?? 5);
    rules.push({ rule: "coach movement intent >= 6 or roster mover >= reference mover", intent, subjMover, refMover });
    if (intent < 6) return verdictOf(CLAIM_SUPPORT.COACH_EVIDENCE_INSUFFICIENT, `coach movement intent ${intent} cannot carry an above-reference movement claim`);
    if (refMover - subjMover > 1.2) return verdictOf(CLAIM_SUPPORT.UNSUPPORTED_AGAINST_REFERENCE, `reference best mover ${refMover} out-personnels subject ${subjMover} by more than the intent lever can bridge (measured lever ≈ +0.047 share at intent 9)`);
    return verdictOf(CLAIM_SUPPORT.SUPPORTED, "intent and personnel can plausibly exceed the reference");
  }
  if (metric === "gamePace") {
    return verdictOf(CLAIM_SUPPORT.SUPPORTED, "pace claims are assessed against coach tempo directly at selection: require |coachTempo - 5| >= 1 in the claimed direction");
  }
  if (metric === "assistedRate") {
    const bm = subjectCoach?.offense?.ballMovement ?? 5;
    rules.push({ rule: "coach ballMovement >= 6 for an above-reference assisted claim", ballMovement: bm });
    if (bm < 6) return verdictOf(CLAIM_SUPPORT.COACH_EVIDENCE_INSUFFICIENT, `coach ballMovement ${bm} — the documented coach record cannot express the claimed passing identity (coach-phase granularity)`);
    return verdictOf(CLAIM_SUPPORT.SUPPORTED, "coach evidence supports the claim");
  }
  return verdictOf(CLAIM_SUPPORT.SUPPORTED, "no support rule registered for this metric; selection-time coverage rules from 6C4C2 still apply");
};
