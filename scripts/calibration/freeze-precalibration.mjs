#!/usr/bin/env node
// ── Pre-calibration artifact freeze ─────────────────────────────────────────
// Content hashes of everything Phase 6C2C2 must not silently rewrite, taken
// before any 6C2C2 experiment ran.
//
// The point is not backup — git already does that. The point is that a later
// claim ("the corpus was always like this", "the holdout manifest is
// unchanged") becomes checkable rather than assertable.
//
//   npm run calibration:freeze -- [--verify]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { policyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { parameterSetHash } from "../../src/v3/calibration/parameters.js";

export const FREEZE_PATH = "data/calibration/phase-6c2c2-precalibration-freeze.json";

export const FROZEN_ARTIFACTS = Object.freeze([
  // Corpus and sets
  "data/calibration/historical-corpus-v3.json",
  "data/calibration/calibration-players-v3.json",
  "data/calibration/historical-targets-v3.json",
  "data/calibration/source-registry.json",
  "data/calibration/sets-v3.mjs",
  "data/calibration/corpus-v3-spec.mjs",
  "data/calibration/set-status.mjs",
  // Set manifests
  "data/calibration/historical-calibration-v3-manifest.json",
  "data/calibration/historical-holdout-v3-manifest.json",
  "data/calibration/synthetic-development-v2-manifest.json",
  "data/calibration/synthetic-stress-holdout-v2-manifest.json",
  // Seeds and probability
  "data/calibration/seeds.mjs",
  "src/v3/calibration/seedDomains.js",
  "src/v3/calibration/monteCarloProbability.js",
  "src/v3/calibration/probabilityValidation.js",
  // Parameters and objective, at defaults
  "src/v3/calibration/parameters.js",
  "src/v3/calibration/objective.js",
  "src/v3/calibration/folds.js",
  "src/v3/calibration/probability.js",
  // Seals
  "src/v3/calibration/holdoutSeal.js",
  // Prior-phase v1/v2 artefacts that must remain readable and unchanged
  "data/calibration/fixtures.mjs",
  "data/calibration/historical-corpus-v2.json",
  "data/calibration/historical-targets-v2.json",
  "data/calibration/sets-v2.mjs",
]);

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/**
 * Deliberate, reviewed changes to frozen artefacts.
 *
 * The freeze exists to make change VISIBLE, not to make it impossible. An
 * artefact that must be corrected can be — but the correction is named here,
 * with its reason, so it appears in the record instead of being absorbed
 * silently. An unlisted change still fails.
 */
export const APPROVED_CORRECTIONS = Object.freeze([
  {
    path: "data/calibration/calibration-players-v3.json",
    reason: "Phase 6C4A shooting backfill: two Sam Jones season profiles carried null FG%/FT% because their membership route was a team-season page whose statistics table has no shooting columns. The values were read from the player's own career table (Wikipedia, 'Sam Jones (basketball, born 1933)', team-verified season rows) through the existing authorized pipeline, filling ONLY null fields; every recorded value is byte-unchanged, and no volume field was invented. Root-caused consequence being repaired: null shooting collapsed shotSelection to the population default, so data completeness itself acted as team quality (v4f-02 decomposition, candidate1-offense-repair.json). Five other null-shooting profiles stay null: their articles carry no career table, and the limitation is recorded rather than estimated around.",
    approvedIn: "phase-6c4a-workstream-5",
    changesClassification: false,
  },
  {
    path: "data/calibration/source-registry.json",
    reason: "The prohibited-source entry asserted that the publisher's terms contain an AI/model-use clause. That was written from the policy's own wording rather than from the source's terms. A Phase 6C2C2 review found that NBA.com and Kaggle — both excluded — contain no AI clause at all; their exclusions rest on commercial-use and comprehensive-database clauses. Asserting a clause that may not exist would not survive legal review, so the entry now records the standing instruction and explicitly declines to characterise the contractual grounds.",
    approvedIn: "phase-6c2c2-workstream-3",
    changesClassification: false,
  },
  {
    path: "src/v3/calibration/seedDomains.js",
    reason: "Phase 6C2C6 added a fourth seed domain, side-bias-v2, with its own master. The Monte Carlo cell that failed the v1 side-bias gate had to be retested, and retesting it on any existing domain would have re-measured the selection instead of the effect: that cell was chosen as the maximum of 30 cells measured on the prediction domain. The three pre-existing domains and their masters are BYTE-UNCHANGED, so every prior seed, fingerprint and replay is unaffected; the addition is proven disjoint from all three at 16,384 seeds with all seeds distinct. No existing measurement moves.",
    approvedIn: "phase-6c2c6-workstream-2",
    changesClassification: false,
  },
  {
    path: "src/v3/calibration/monteCarloProbability.js",
    reason: "Phase 6C2C6 fixed two harness defects the orientation audit found. complement() flipped a probability while returning the ORIGINAL team as its perspective, because its guard tested `=== \"first\"` and never matched a real team id; 13 of the 30 v1 cells took that path. And the estimator published a side-bias statistic without the uncertainty appropriate to its paired design, so it now returns pairedEffect, pairedSd, pairedStandardError, pairedZ and discordantPairs alongside the half-scale quantity v1 published. Neither fix changes any probability, any win count, or any game result: the half-scale `difference` field is unchanged and still present, and complement's numeric output is identical. monteCarloProbabilityVersion moved 1.0.0 -> 1.1.0, which tags the probability cache key, so v1.0.0 estimates remain replayable under their own tag rather than being silently reinterpreted.",
    approvedIn: "phase-6c2c6-workstream-5",
    changesClassification: false,
  },
  {
    path: "src/v3/calibration/probabilityValidation.js",
    reason: "Phase 6C2C6 REMOVED a gate from this suite, which needs the strictest justification of the three corrections here. sideBiasPerCellWithinTolerance compared a per-cell POINT ESTIMATE against a fixed 0.05, and it was invalid three ways: the statistic is algebraically HALF the paired orientation effect, so the margin meant twice what it appeared to; the reported standard error was sqrt(0.25/n), a single-proportion formula assuming independence, for a design paired on a shared seed; and taking the MAXIMUM over 30 cells and comparing it to an unadjusted threshold cannot see that 30 comparisons happened. The gate was not weakened or waived: it MOVED to side-bias policy v2, which tests the paired effect on the corrected scale at the SAME 0.05 margin, requires equivalence to be positively established rather than merely undetected, escalates to 16,384 paired seeds per cell against this suite's 128, and applies Holm correction across a 44-cell family. That is strictly stronger in every dimension. It had to move because at 128 paired seeds a true null CANNOT be shown equivalent to +/-0.05, so any gate at this sample size would be either powerless or wrong. The systematic-bias gate, which is a mean rather than a maximum and does not need per-cell precision, stays here. probabilityValidationVersion moved 2.0.0 -> 3.0.0 and the supersession is recorded in the acceptance-policy ledger.",
    approvedIn: "phase-6c2c6-workstream-2",
    changesClassification: false,
    gateRemoved: "sideBiasPerCellWithinTolerance",
    gateMovedTo: "probabilitySideBiasPolicyVersion 2.0.0 / probability-side-bias-validation-v2.json",
    strictlyStronger: true,
  },
  {
    path: "src/v3/calibration/holdoutSeal.js",
    reason: "Phase 6C3R registered a new sealed set, historical-holdout-v4, with its own access log and its own entry in allSealStatuses. historical-holdout-v3 was opened once in Phase 6C3 and returned a formal FAIL caused by a non-identifiable measurement surface (mirror fixtures cannot separate offence from defence); a consumed holdout cannot validate any candidate again, so a replacement set needs a replacement seal. Every EXISTING seal, log path and access record is byte-unchanged: the v3 access log still holds exactly one event, the synthetic-stress-holdout-v2 log still does not exist, and this file is not in the candidate core closure, so the candidate core hash asserted by both holdout runs is untouched.",
    approvedIn: "phase-6c3r-workstream-0",
    changesClassification: false,
  },
]);

export const buildFreeze = () => {
  const artefacts = {};
  const missing = [];
  for (const p of FROZEN_ARTIFACTS) {
    if (!existsSync(p)) { missing.push(p); continue; }
    artefacts[p] = sha(p);
  }
  return {
    phase: "6C2C2",
    purpose: "Content hashes taken before any Phase 6C2C2 experiment ran, so that a later claim of 'unchanged' is checkable rather than assertable.",
    frozenAt: "phase-6c2c2-workstream-0",
    acceptancePolicyHash: policyHash(),
    defaultParameterSetHash: parameterSetHash(),
    artefactCount: Object.keys(artefacts).length,
    missing,
    artefacts,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const verify = process.argv.includes("--verify");
  const current = buildFreeze();

  if (verify) {
    if (!existsSync(FREEZE_PATH)) { console.error("no freeze recorded"); process.exit(1); }
    const frozen = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    const drift = [];
    for (const [p, h] of Object.entries(frozen.artefacts)) {
      if (!existsSync(p)) { drift.push({ path: p, change: "DELETED" }); continue; }
      const now = sha(p);
      if (now !== h) drift.push({ path: p, change: "MODIFIED", was: h.slice(0, 12), now: now.slice(0, 12) });
    }
    const policyMoved = frozen.acceptancePolicyHash !== current.acceptancePolicyHash;
    const paramsMoved = frozen.defaultParameterSetHash !== current.defaultParameterSetHash;

    console.log(`PRE-CALIBRATION FREEZE VERIFY — ${Object.keys(frozen.artefacts).length} artefacts\n`);
    if (policyMoved) console.log(`  ACCEPTANCE POLICY CHANGED  ${frozen.acceptancePolicyHash.slice(0, 16)} -> ${current.acceptancePolicyHash.slice(0, 16)}`);
    if (paramsMoved) console.log(`  PARAMETER SET CHANGED      ${frozen.defaultParameterSetHash.slice(0, 16)} -> ${current.defaultParameterSetHash.slice(0, 16)}`);
    if (!drift.length) console.log(`  no artefact drift`);
    for (const d of drift) console.log(`  ${d.change.padEnd(9)} ${d.path}${d.was ? `  ${d.was} -> ${d.now}` : ""}`);
    // Parameter movement is EXPECTED once calibration runs; artefact drift in
    // corpus, sets or seals is not. They are reported separately for that reason.
    const approved = new Set(APPROVED_CORRECTIONS.map((c) => c.path));
    const structuralDrift = drift.filter((d) => !d.path.includes("parameters.js") && !approved.has(d.path));
    const approvedDrift = drift.filter((d) => approved.has(d.path));
    if (approvedDrift.length) {
      console.log(`\n  approved corrections (${approvedDrift.length}):`);
      for (const d of approvedDrift) {
        const c = APPROVED_CORRECTIONS.find((x) => x.path === d.path);
        console.log(`    ${d.path}  ${d.was} -> ${d.now}`);
        console.log(`      ${c.reason.slice(0, 140)}...`);
      }
    }
    console.log(`\n  structural drift: ${structuralDrift.length}  ·  policy drift: ${policyMoved ? "YES" : "no"}`);
    process.exit(structuralDrift.length || policyMoved ? 2 : 0);
  }

  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(FREEZE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`PRE-CALIBRATION FREEZE — ${current.artefactCount} artefacts\n`);
  console.log(`  acceptance policy hash  ${current.acceptancePolicyHash.slice(0, 32)}`);
  console.log(`  default parameter hash  ${current.defaultParameterSetHash.slice(0, 32)}`);
  if (current.missing.length) {
    console.log(`\n  MISSING (${current.missing.length}):`);
    for (const m of current.missing) console.log(`    ${m}`);
  }
  console.log(`\nwrote ${FREEZE_PATH}`);
}
