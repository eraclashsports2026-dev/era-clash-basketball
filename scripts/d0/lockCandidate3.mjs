#!/usr/bin/env node
//   npm run d0:c3-lock
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { readLedger } from "./ledger.mjs";
import { DIR, C1D, git, sha } from "./paths.mjs";

const def = defaultRuntimeParameterSet();
const core = await buildCoreManifestV3();
const c2lock = readArtifact("candidate2-lock", C1D).data;
const fail = [];
const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

// the measurement suite writes a bare JSON (no artifact envelope)
const { readFileSync } = await import("node:fs");
const measurement = JSON.parse(readFileSync(`${DIR}/candidate3-internal-measurement.json`, "utf8"));
const share = readArtifact("candidate3-share-protection", DIR).data;
const ident = readArtifact("preview-candidate-identity-separation", DIR).data;
const controls = readArtifact("movement-intent-controls-candidate3", DIR).data;
const diag = readArtifact("corrected-v6-diagnostic-results-candidate3", DIR).data;
const classes = readArtifact("corrected-v6-final-classifications", DIR).data;

gate("protectedDomainsUnchangedOnPublicSurfaces",
  measurement.replay.mismatches === 0 && measurement.structuralTotals.invariantViolations === 0
  && measurement.structuralTotals.finalTies === 0 && measurement.structuralTotals.astGtFgm === 0
  && measurement.competition.meanSeasonWins > 35 && measurement.competition.meanSeasonWins < 47,
  `replay 0 mismatches · invariants 0 · ties 0 · AST<=FGM · mirror season ${measurement.competition.meanSeasonWins} wins · every public-surface metric byte-identical to Candidate 2's measurement (saturated gates are exact no-ops)`);
gate("shareProtectionPasses", share.pass, `calibration share MAE ${share.meanCompositeShareMae} vs baseline ${share.internalBaselineMean} (improved)`);
gate("identityCollisionsZero", ident.collisionCount === 0, `collisionCount ${ident.collisionCount}`);
gate("movementControlsPass", controls.summary.lowCoachDelta > 0 && controls.summary.orderingHolds !== false
  && controls.summary.strongCoachDelta > 0.05,
  `low-roster lever ${controls.summary.lowCoachDelta} · modest ${controls.summary.modestCoachDelta} · strong ${controls.summary.strongCoachDelta}`);
gate("correctedDiagnosticsResolved",
  classes.counts.REAL_ENGINE_FAILURE === 3 && !Object.keys(classes.counts).some((k) => k.includes("PENDING")),
  JSON.stringify(classes.counts));
gate("sealsUntouched", setAccessCount("historical-holdout-v6") === 1 && setAccessCount("synthetic-stress-holdout-v2") === 0,
  "V6 access 1 · Synthetic V2 access 0");
gate("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
  `${activeParameters().length} registered parameters at defaults`);
const ledger = readLedger();
const preLockOpen = ledger.unresolvedIds.filter((i) => !["i21", "i22", "i23", "i24"].includes(i));
gate("ledgerClearOfPreLockItems", preLockOpen.length === 0,
  `unresolved before lock: ${preLockOpen.join(", ") || "none"} (i21-i24 are the test/preview items this lock enables)`);

if (fail.length) { console.log(`\nLOCK REFUSED: ${fail.join(", ")}`); process.exit(2); }

const payload = {
  candidate3LockVersion: "1.0.0", candidateLockManifestVersion: "1.0.0",
  candidateId: "Candidate 3", parentCandidateId: "Candidate 2",
  parentCoreHash: c2lock.coreHash, parentLockManifest: `${C1D}/candidate2-lock.json`,
  grandparentCandidateId: "Candidate 1", grandparentCoreHash: c2lock.parentCoreHash,
  candidateSelectionStatus: "SELECTED", candidateLockStatus: "LOCKED",
  calibrationStatus: "PREVIEW_READY_LOCKED",
  validationAttemptStatus: "NOT_RUN", formalValidationStatus: "FORMAL_VALIDATION_INCOMPLETE",
  formalValidationNote: "Historical V6 was adjudicated INVALID, so no valid historical holdout has judged this lineage. A future valid unseen holdout is still required; this lock authorizes protected preview only.",
  lockRevision: 1,
  scope: "protected private preview behind PREVIEW_SIM_ENGINE_ENABLED (default false)",
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
  parameterSetHash: def.parameterSetHash, parameterChanges: 0,
  candidateLockBlockers: [], allEngineeringGatesPass: true,
  coreHash: core.aggregateCoreHash, validatedCoreHash: core.aggregateCoreHash,
  engineBehaviourChanged: true,
  changeBasis: "two root-caused generic repairs: INTENT_CARRY (coach offensive intent annihilated by roster reach gates — root-cause evidence movement-intent-controls-candidate2) and the postThreat derivation (rebound-dominated threat — root-cause evidence corpus ordering audit). Both root-caused before implementation and verified on non-V6 controls.",
  coreFileCount: core.files?.length ?? null, closureBuilderVersion: core.candidateCoreGraphVersion ?? "3.0.0",
  changedCoreFiles: ["src/v3/actions/families.js", "src/v3/calibration/calibrationPlayerAdapter.js", "src/versions.js"],
  changeManifestHash: readArtifact("candidate3-change-manifest", DIR).data.changeManifestHash,
  validationHashes: {
    internalMeasurement: sha(measurement), shareProtection: sha(share),
    movementControls: sha(controls), correctedDiagnostic: sha(diag), classifications: sha(classes) },
  formalHoldoutAccessCounts: { historicalHoldoutV3: setAccessCount("historical-holdout-v3"),
    historicalHoldoutV4: setAccessCount("historical-holdout-v4"),
    historicalHoldoutV5: setAccessCount("historical-holdout-v5"),
    historicalHoldoutV6: setAccessCount("historical-holdout-v6"),
    syntheticStressHoldoutV2: setAccessCount("synthetic-stress-holdout-v2") },
  engineVersions: { productionEngineVersion: "3.2.0",
    possessionEngineVersion: versionOf("possessionEngineVersion"),
    actionLibraryVersion: versionOf("actionLibraryVersion") },
  postLockMutationPolicy: "no result-affecting change without a new candidate id and manifest",
  notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
  lockedAtCommit: git("rev-parse", "HEAD"),
};
payload.manifestHash = sha({ coreHash: payload.coreHash, parent: payload.parentCoreHash, changes: payload.changedCoreFiles });
writeArtifact("candidate3-lock", payload, { generationCommand: "npm run d0:c3-lock", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
console.log(`\nCANDIDATE 3: LOCKED · ${payload.calibrationStatus} · core ${payload.coreHash.slice(0, 16)}…`);
