#!/usr/bin/env node
// ── Phase 6C4B2 final summary ───────────────────────────────────────────────
//   npm run v6:summary
import { readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readArtifact, writeArtifact, verifyArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { DIR, DIR_B1 } from "./preflight6c4b2.mjs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
const R = (n) => readArtifact(n, DIR);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const artifacts = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const verifications = artifacts.map((f) => {
    const name = f.replace(/\.json$/, "");
    const v = verifyArtifact(name, DIR);
    return { artifact: name, valid: v.valid ?? v.ok ?? false };
  });
  const invalid = verifications.filter((v) => !v.valid);

  const pre = R("phase6c4b2-preflight").data;
  const attempts = R("formal-validation-attempts").data;
  const blocker = R("synthetic-v2-package-blocker").data;

  const payload = {
    phase: "6C4B2",
    title: "Historical Holdout V5 and Synthetic Stress Holdout V2 formal Candidate 1 revalidation",
    outcome: "BLOCKED_BEFORE_ACCESS_SECOND_STAGE_PACKAGE_INCOMPLETE",
    finalVerdict: "NO FORMAL RESULT — SECOND-STAGE PACKAGE INCOMPLETE, NEITHER HOLDOUT OPENED",
    artifactsWritten: artifacts.length, artifactsInvalid: invalid.length,

    whatWasVerified: {
      candidate1LockValid: pre.candidate1LockValid,
      candidate1CoreStable: pre.candidate1CoreStable,
      candidate1ReplayValid: pre.candidate1ReplayValid,
      candidate0Preserved: pre.candidate0Preserved,
      historicalV5PackageValid: pre.historicalV5PackageValid,
      historicalV3Preserved: pre.historicalV3Preserved,
      historicalV4Preserved: pre.historicalV4Preserved,
      note: "Candidate 1's identity and the entire Historical V5 package verified clean. The stop is not about either of them.",
    },
    whatBlocked: {
      blockerId: blocker.blockerId,
      present: Object.keys(blocker.frozenAndPresent),
      missing: Object.keys(blocker.missing),
      summary: blocker.summary,
      instructionFollowed: "Do not consume Historical V5 while the second-stage package is known to be unusable.",
    },

    candidate: pre.candidate,
    historicalV5: { state: pre.historicalV5.state, accessCount: setAccessCount("historical-holdout-v5"),
      accessLogExists: existsSync(SEALED_SETS["historical-holdout-v5"]),
      packageValid: pre.historicalV5PackageValid, hashMismatches: pre.historicalV5.hashMismatches.length,
      dryRunChecks: pre.historicalV5.dryRunChecks, formalVerdict: "NOT_OPENED" },
    syntheticV2: { state: "SEALED_UNREAD", accessCount: setAccessCount("synthetic-stress-holdout-v2"),
      accessLogExists: existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
      fixtureCount: pre.syntheticV2.fixtureCount, missingComponents: pre.syntheticV2.missingComponents,
      formalVerdict: "NOT_OPENED" },
    priorHoldouts: pre.priorHoldouts,
    allSeals: Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, { status: v.status, accessCount: v.accessCount }])),
    attemptRegistry: { version: attempts.formalValidationAttemptVersion, attempts: attempts.attemptCount,
      completed: attempts.completedAttempts, opened: attempts.openedHoldouts, notOpened: attempts.notOpenedHoldouts,
      registryHash: attempts.registryHash, priorVerdictsUnchanged: attempts.priorVerdictsUnchanged },

    notCreatedBecauseNoHoldoutOpened: [
      "historical-v5-access-event.json", "historical-v5-formal-run.json", "historical-v5-fixture-results.json",
      "historical-v5-formal-results.json", "historical-v5-formal-verdict.json",
      "synthetic-v2-access-event.json", "synthetic-v2-formal-run.json", "synthetic-v2-fixture-results.json",
      "synthetic-v2-formal-results.json", "synthetic-v2-formal-verdict.json",
      "candidate1-formal-holdout-verdict.json", "candidate1-formal-status.json",
      "candidate1-protected-preview-package.json",
    ],
    claimsNotMade: [
      "Candidate 1 generalises to unseen historical data",
      "Candidate 1 is robust under unseen structural stress",
      "Candidate 1 is HOLDOUT_VALIDATED",
      "Candidate 1 is ready for a protected private preview",
      "Historical V5 passed or failed",
      "Synthetic V2 passed or failed",
    ],
    commandsExecuted: { historicalV5: 0, syntheticV2: 0, formalVerdict: 0, previewDeployment: 0 },
    productionIsolation: { engineVersion: versionOf("engineVersion"), appVersion: versionOf("appVersion"),
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      main: git("rev-parse", "--short", "main"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      previewDeployed: false, productionDeployed: false },
    scopeRespected: {
      historicalV5NotOpened: setAccessCount("historical-holdout-v5") === 0,
      syntheticV2NotOpened: setAccessCount("synthetic-stress-holdout-v2") === 0,
      syntheticV2NotAltered: true,
      historicalV5NotAltered: pre.historicalV5.hashMismatches.length === 0,
      v3AndV4NotRescored: setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
      candidate1Unchanged: pre.candidate1CoreStable,
      noParameterChanges: true, noPolicyChanges: true, noMethodologyAuthored: true,
      mainNotMerged: git("rev-parse", "--short", "main") === "9cd95ff",
      noPreviewDeployment: true, noProductionDeployment: true,
    },
    limitations: [
      { id: "NO_FORMAL_CANDIDATE_1_RESULT", detail: "Candidate 1 has never been evaluated on an unseen holdout. Its trait-fidelity repairs are supported only by development evidence and by the V4 diagnostics it was built against, which cannot demonstrate generalisation for the candidate developed from them." },
      { id: "SECOND_STAGE_NEVER_PREPARED", detail: "Synthetic Stress Holdout V2 has had a frozen fixture manifest and guardrail policy since Phase 6C2C1, but no phase ever built its seed set, sample volumes, aggregation rule, runner or dry run — because Historical V3 and V4 both failed before the second stage was needed, and Phase 6C4B1 prepared V5 alone. Its readiness artifact tracked only that the set was still sealed." },
      { id: "B2_PACKAGE_NAMED_UNBUILT_COMMANDS", detail: "The Phase 6C4B1 validation package prepared 'npm run validation:synthetic-v2' and 'npm run validation:candidate1-formal-verdict'. Neither script existed. A prepared command should be verified resolvable at the moment it is prepared; that check is a recommendation for the next preparation phase." },
      { id: "HISTORICAL_V5_STILL_UNSPENT", detail: "This is a limitation of knowledge, not of the package: V5 is fully prepared and verified but tells us nothing yet. Its value is intact precisely because it was not spent." },
    ],
    recommendedNextPhase: blocker.recommendedNextPhase,
  };
  writeArtifact("phase6c4b2-final-summary", payload, { generationCommand: "npm run v6:summary", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`PHASE 6C4B2 — ${payload.outcome}\n`);
  console.log(`  ${payload.finalVerdict}\n`);
  console.log(`  artifacts ${payload.artifactsWritten} · invalid ${payload.artifactsInvalid}`);
  console.log(`  blocker ${payload.whatBlocked.blockerId}: present ${payload.whatBlocked.present.join(", ")} · missing ${payload.whatBlocked.missing.join(", ")}`);
  console.log(`  historical V5 ${payload.historicalV5.state} access ${payload.historicalV5.accessCount} · package valid ${payload.historicalV5.packageValid}`);
  console.log(`  synthetic V2 ${payload.syntheticV2.state} access ${payload.syntheticV2.accessCount}`);
  console.log(`  V3 access ${payload.priorHoldouts.historicalHoldoutV3.accessCount} FAIL · V4 access ${payload.priorHoldouts.historicalHoldoutV4.accessCount} FAIL`);
  console.log(`  commands executed: ${JSON.stringify(payload.commandsExecuted)}`);
  console.log(`  limitations ${payload.limitations.length}`);
  process.exit(invalid.length === 0 ? 0 : 2);
}
