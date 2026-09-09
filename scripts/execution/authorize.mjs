#!/usr/bin/env node
// ── WS0 PART 4: the formal-execution authorization ──────────────────────────
//   npm run exec:authorize
//
// A narrow grant. It permits exactly three things — open Historical V5, open
// Synthetic V2 after V5 passes, and generate the compound verdict — and it
// permits no change to any candidate, policy, seed, target or threshold.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../../src/versions.js";
import { DIR, B1, B1S, git } from "./preflight6c4b2r.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const stamp = arg("at", null);
  if (!stamp) { console.error("REFUSED: --at=<ISO timestamp> is required so the record is not machine-clock dependent."); process.exit(2); }
  const def = defaultRuntimeParameterSet();
  const pf = readArtifact("phase6c4b2r-preflight", DIR).data;
  if (pf.pass !== true) { console.error("REFUSED: the preflight did not pass. FORMAL_EXECUTION_PACKAGE_INVALID."); process.exit(2); }
  const pkg = readArtifact("compound-formal-validation-package-v2", B1S).data;

  const stage1 = pkg.stages.find((s) => s.stage === 1);
  const stage2 = pkg.stages.find((s) => s.stage === 2);

  const payload = {
    formalExecutionAuthorizationVersion: "1.0.0",
    operator: pf.authorization.operator,
    reason: pf.authorization.reason,
    authorizationTimestamp: stamp,

    candidateId: pf.candidate.id,
    candidateCommit: pf.candidate.recertifiedAtCommit,
    candidateCoreHash: pf.candidate.coreHash,
    parameterSetHash: pf.candidate.parameterSetHash,
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    lockRevision: pf.candidate.lockRevision,

    compoundPackageHash: pkg.packageHash,
    compoundPackageVersion: pkg.compoundFormalValidationPackageVersion,
    historicalV5StageHashes: stage1.hashes,
    syntheticV2StageHashes: stage2.hashes,
    preflightHash: pf.preflightHash,

    permits: [
      "open historical-holdout-v5 exactly once, with one access event, under this candidate identity",
      "open synthetic-stress-holdout-v2 exactly once, and only after historical-holdout-v5 returns PASS on this same candidate core and parameter set",
      "generate the compound Candidate 1 formal verdict from completed formal artifacts",
    ],
    doesNotPermit: [
      "any change to Candidate 1 source, core, parameters, data, coaches, eras, versions, fingerprint semantics, cache semantics, seed logic or behaviour",
      "any change to either holdout's membership, policy, margins, sample plan, seeds, runner semantics, verdict schema or seal",
      "any change to the compound package's stage ordering, required-pass relationship, hashes or verdict semantics",
      "any tuning after either holdout opens",
      "a second independent run of either set",
      "any preview or production deployment, any production flag change, or any merge into main",
    ],
    executionOrder: [
      "1. this authorization and the preflight are committed and pushed",
      "2. historical-holdout-v5 opens once",
      "3. historical-holdout-v5 receives an immutable verdict",
      "4. if that verdict is not PASS, stop; synthetic-stress-holdout-v2 stays sealed",
      "5. synthetic-stress-holdout-v2 opens once",
      "6. synthetic-stress-holdout-v2 receives an immutable verdict",
      "7. the compound verdict is issued from the two completed artifacts",
    ],
    irreversibility: "each set can be opened once. An access event, once written, is not deleted or reset, and a runner crash does not restore unread status: the set has been seen whether or not the process finished. An interruption is resumed under the same access event or the run is classified INVALID_RUN.",
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  };
  payload.authorizationHash = createHash("sha256").update(JSON.stringify({
    candidateCoreHash: payload.candidateCoreHash, parameterSetHash: payload.parameterSetHash,
    compoundPackageHash: payload.compoundPackageHash, preflightHash: payload.preflightHash,
    operator: payload.operator, authorizationTimestamp: stamp })).digest("hex");
  writeArtifact("formal-execution-authorization", payload, {
    generationCommand: "npm run exec:authorize", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("FORMAL EXECUTION AUTHORIZATION\n");
  console.log(`  operator   ${payload.operator}`);
  console.log(`  candidate  ${payload.candidateId} @ ${payload.candidateCommit.slice(0, 12)} core ${payload.candidateCoreHash.slice(0, 16)}...`);
  console.log(`  package    v${payload.compoundPackageVersion} ${payload.compoundPackageHash.slice(0, 16)}...`);
  console.log(`  preflight  ${payload.preflightHash.slice(0, 16)}...`);
  console.log(`  stage 1    ${Object.keys(payload.historicalV5StageHashes).length} hashes`);
  console.log(`  stage 2    ${Object.keys(payload.syntheticV2StageHashes).length} hashes`);
  console.log(`\n  permits ${payload.permits.length} actions, forbids ${payload.doesNotPermit.length} classes of change`);
  console.log(`  authorizationHash ${payload.authorizationHash.slice(0, 16)}...`);
}
