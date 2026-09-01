#!/usr/bin/env node
// ── Candidate 4 lock ────────────────────────────────────────────────────────
//   npm run d0:c4-lock
//
// Candidate 3's lock states its own succession rule:
//   postLockMutationPolicy: "no result-affecting change without a new candidate
//   id and manifest"
// The four Phase 8D repairs are result-affecting changes to that locked core,
// so this mints a NEW candidate rather than editing the old lock. The Candidate
// 3 artifact is left exactly as its phase wrote it.
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { git } from "./paths.mjs";

const DIR = "data/validation/8d";
const def = defaultRuntimeParameterSet();
const core = await buildCoreManifestV3();
const c3 = readArtifact("candidate3-lock", "data/validation/6c4d0").data;

const fail = [];
const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

gate("parentIsCandidate3AndLocked",
  c3.candidateId === "Candidate 3" && c3.candidateLockStatus === "LOCKED",
  `${c3.candidateId} · ${c3.candidateLockStatus}`);
gate("coreDiffersFromEveryAncestor",
  core.aggregateCoreHash !== c3.coreHash && core.aggregateCoreHash !== c3.parentCoreHash
  && core.aggregateCoreHash !== c3.grandparentCoreHash,
  `${core.aggregateCoreHash.slice(0, 16)}… vs C3 ${c3.coreHash.slice(0, 16)}…`);
gate("zeroParameterDrift",
  activeParameters().every((p) => def.values[p.id] === p.defaultValue),
  `${activeParameters().length} registered parameters at their defaults — these are CODE repairs, not tuning`);
gate("sealsUntouched",
  setAccessCount("historical-holdout-v6") === 1 && setAccessCount("synthetic-stress-holdout-v2") === 0,
  "V6 access 1 · Synthetic V2 access 0 — no holdout was opened for this candidate");
gate("coreFileCountStable", core.files.length === c3.coreFileCount,
  `${core.files.length} files, unchanged from Candidate 3`);

const CHANGED = [
  "src/v3/possession/game.js",
  "src/v3/possession/actions.js",
];

const data = {
  candidate4LockVersion: "1.0.0",
  candidateLockManifestVersion: c3.candidateLockManifestVersion,
  candidateId: "Candidate 4",
  parentCandidateId: "Candidate 3",
  parentCoreHash: c3.coreHash,
  parentLockManifest: "data/validation/6c4d0/candidate3-lock.json",
  grandparentCandidateId: c3.parentCandidateId,
  grandparentCoreHash: c3.parentCoreHash,
  candidateSelectionStatus: "SELECTED",
  candidateLockStatus: "LOCKED",
  calibrationStatus: "PREVIEW_READY_LOCKED",
  validationAttemptStatus: c3.validationAttemptStatus,
  // Inherited verbatim: no holdout was opened for this candidate, so nothing
  // about its formal standing has improved. Four repairs do not make a
  // candidate validated.
  formalValidationStatus: "FORMAL_VALIDATION_INCOMPLETE",
  formalValidationNote:
    "Candidate 4 inherits Candidate 3's formal standing unchanged: zero valid formal historical judgments. "
    + "No holdout was opened for it. The repairs below were found by a code audit, not by a holdout, and are "
    + "not evidence of generalisation.",
  lockRevision: 1,
  scope: c3.scope,
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
  parameterSetHash: c3.parameterSetHash,
  parameterChanges: 0,
  candidateLockBlockers: [],
  allEngineeringGatesPass: fail.length === 0,
  coreHash: core.aggregateCoreHash,
  validatedCoreHash: null,
  engineBehaviourChanged: true,
  changeBasis:
    "four defects root-caused by the whole-project audit of 2026-08-31, each traced to a specific line before "
    + "any change and each measured in isolation on a fixed 720-game probe. (1) game.js chooseShotCategory: the "
    + "era three-point scale is 0 in a pre-line era, and it was applied BEFORE the transfer to MIDRANGE, so the "
    + "documented 'the shot goes, the skill does not' transfer moved exactly zero weight in three of eight eras. "
    + "(2) actions.js selectAction: ZONE_ATTACK could be drawn on a man possession, where resolveAction has no "
    + "route for it and it fell through to the generic resolver; the ATTACK_ZONE_* coach adjustments bump exactly "
    + "that family into exactly that mix. (3) actions.js resolveTransition: a pulled-out break resolved through "
    + "resolveGenericHalfCourt without the allocator. The first fix passed alloc through and INVERTED the usage "
    + "hierarchy, because the transition draw had already recorded an attempt for a player who never shot; the "
    + "possession now decides whether it is still a break before drawing anyone, so one possession makes one draw "
    + "and one ledger record. (4) actions.js POST_UP kickout: `- x * -1 + x` applied the receiver's matchup "
    + "shot-quality modifier twice, one-sidedly, since the upper clamp ate the upside.",
  coreFileCount: core.files.length,
  closureBuilderVersion: c3.closureBuilderVersion,
  changedCoreFiles: CHANGED,
  changeManifestHash: null,
  validationHashes: c3.validationHashes,
  // Every consumed holdout, in the parent's shape. All four historical sets
  // were opened once under earlier candidates and none was opened for this one,
  // so these are inherited facts rather than new evidence.
  formalHoldoutAccessCounts: {
    historicalHoldoutV3: setAccessCount("historical-holdout-v3"),
    historicalHoldoutV4: setAccessCount("historical-holdout-v4"),
    historicalHoldoutV5: setAccessCount("historical-holdout-v5"),
    historicalHoldoutV6: setAccessCount("historical-holdout-v6"),
    syntheticStressHoldoutV2: setAccessCount("synthetic-stress-holdout-v2"),
  },
  engineVersions: c3.engineVersions,
  postLockMutationPolicy: "no result-affecting change without a new candidate id and manifest",
  notClaimed: [
    "NOT historically validated — no holdout was opened for Candidate 4.",
    "NOT a claim that the repaired behaviour is more accurate; it is a claim that the code now does what it "
      + "documents, which is a different and smaller claim.",
    "NOT a parameter change: all registered parameters remain at their registry defaults.",
  ],
  lockedAtCommit: git("rev-parse", "HEAD"),
};

console.log();
if (fail.length) {
  console.error(`REFUSED — ${fail.length} gate(s) failed: ${fail.join(", ")}`);
  process.exit(1);
}
writeArtifact("candidate4-lock", data, {
  generationCommand: "npm run d0:c4-lock",
  sourceArtifacts: ["data/validation/6c4d0/candidate3-lock.json"],
  extra: { parameterSetHash: c3.parameterSetHash },
  dir: DIR,
});
console.log(`Candidate 4 LOCKED at ${core.aggregateCoreHash}`);
console.log(`  parent  Candidate 3 ${c3.coreHash}`);
console.log(`  changed ${CHANGED.join(", ")}`);
