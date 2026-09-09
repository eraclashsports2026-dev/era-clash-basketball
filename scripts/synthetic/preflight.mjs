#!/usr/bin/env node
// ── Phase 6C4B1S preflight ──────────────────────────────────────────────────
//   npm run syn:preflight
//
// Preparation-only. Verifies Candidate 1, the completed Historical V5 package
// and the Synthetic V2 MEMBERSHIP seal, and proves nothing has been opened.
// This phase builds the second stage's EXECUTION semantics; it must not touch
// either sealed set, and every gate below exists to prove it didn't.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { estimateWinProbability } from "../../src/v3/calibration/monteCarloProbability.js";
import { versionOf } from "../../src/versions.js";

export const DIR = "data/validation/6c4b1s";
export const DIR_B1 = "data/validation/6c4b1";
export const DIR_B2 = "data/validation/6c4b2";
export const DIR_6C4A = "data/validation/6c4a";
export const SYN_MANIFEST_PATH = "data/calibration/synthetic-stress-holdout-v2-manifest.json";
export const SET = "synthetic-stress-holdout-v2";
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

/** The frozen membership, read from the sealed manifest. Never rebuilt. */
export const syntheticMembership = () => {
  const m = JSON.parse(readFileSync(SYN_MANIFEST_PATH, "utf8"));
  return { manifest: m, fixtures: SYNTHETIC_STRESS_HOLDOUT_V2,
    membershipHash: m.manifestHash, fileSha256: sha(SYN_MANIFEST_PATH) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return !!pass; };

  const recert = readArtifact("candidate1-lock-recertification", DIR_B1).data;
  const lock1 = readArtifact("candidate1-lock", DIR_6C4A).data;
  const c0lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
  const preservation = readArtifact("candidate0-preservation", DIR_6C4A).data;
  const v5seal = readArtifact("historical-holdout-v5-seal", DIR_B1).data;
  const b2pre = readArtifact("phase6c4b2-preflight", DIR_B2).data;
  const blocker = readArtifact("synthetic-v2-package-blocker", DIR_B2);
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const mem = syntheticMembership();

  console.log("PHASE 6C4B1S PREFLIGHT\n\nPART 1 — CANDIDATE 1\n");
  const c1Valid =
    gate("candidate1Locked", recert.candidateLockStatus === "LOCKED" && recert.candidateSelectionStatus === "SELECTED"
      && recert.calibrationStatus === "DEVELOPMENT_LOCKED_SCOPED" && recert.validationAttemptStatus === "NOT_RUN",
      `${recert.candidateId} · ${recert.candidateSelectionStatus}/${recert.candidateLockStatus}/${recert.calibrationStatus} · attempt ${recert.validationAttemptStatus}`) &
    gate("lockRevisionMatchesV5Package", recert.lockRevision === v5seal.candidate.lockRevision,
      `lock revision ${recert.lockRevision} — the revision the V5 seal binds`) &
    gate("zeroLockBlockers", lock1.candidateLockBlockers.length === 0, `${lock1.candidateLockBlockers.length}`) &
    gate("calibrationVersion110", versionOf("possessionCalibrationVersion") === "1.1.0", versionOf("possessionCalibrationVersion"));
  const coreStable =
    gate("coreHashMatchesLock", core.aggregateCoreHash === recert.coreHash && core.aggregateCoreHash === v5seal.candidate.coreHash,
      `live ${core.aggregateCoreHash.slice(0, 16)}... == re-certified lock == V5 seal`) &
    gate("parameterHashMatchesLock", def.parameterSetHash === recert.parameterSetHash
      && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
      `${def.parameterSetHash.slice(0, 16)}..., zero drift`);

  const rc = { goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
    blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], eraStyleId: "2010s",
    coachGoldId: "steve-kerr", coachBlueId: "phil-jackson", simulationSeed: 4242 };
  const hx = (g) => createHash("sha256").update(JSON.stringify([g.finalScore, g.gold, g.blue, g.possessionLedger])).digest("hex");
  const rp = hx(runPossessionGame(buildPossessionInput(rc), { includeLedger: true }));
  const rp2 = hx(runPossessionGame(buildPossessionInput(rc), { includeLedger: true }));
  const pArgs = { teamA: { teamId: "A", playerIds: rc.goldIds, coachId: rc.coachGoldId },
    teamB: { teamId: "B", playerIds: rc.blueIds, coachId: rc.coachBlueId },
    eraStyleId: "2010s", sampleTier: "FAST", buildInput: buildPossessionInput, cache: false };
  const e1 = estimateWinProbability(pArgs); const e2 = estimateWinProbability(pArgs);
  const replayValid =
    gate("candidate1ReplayExact", rp === rp2, `${rp.slice(0, 16)}... both runs`) &
    gate("candidate1ProbabilityReplayExact", e1.goldWins === e2.goldWins && e1.goldWinProbability === e2.goldWinProbability,
      `${e1.goldWins}/${e1.sampleCount} both runs`) &
    gate("productionEngineByteIdentical", sha("src/engine.js") === preservation.candidate0.productionEngineSha256,
      "src/engine.js unchanged since Candidate 0's preservation snapshot");
  gate("candidate0Preserved", c0lock.candidateLockStatus === "LOCKED" && c0lock.possessionCalibrationVersion === "1.0.0"
    && sha(`${ARTIFACT_DIR_C6}/baseline-candidate-lock.json`) === preservation.candidate0.lockManifestSha256,
    "Candidate 0's lock manifest is byte-identical to its preservation hash");

  console.log("\nPART 2 — HISTORICAL V5 (preserved, untouched)\n");
  const v5Sealed =
    gate("historicalV5SealedUnread", v5seal.state === "SEALED_UNREAD" && setAccessCount("historical-holdout-v5") === 0,
      `${v5seal.state} · access ${setAccessCount("historical-holdout-v5")}`) &
    gate("historicalV5NoAccessEventOrOutput", !existsSync(SEALED_SETS["historical-holdout-v5"])
      && !artifactExists("historical-v5-formal-run", DIR_B2) && !artifactExists("historical-v5-access-event", DIR_B2)
      && !artifactExists("historical-holdout-v5-results", DIR_B1),
      "no access log, no access event, no formal run, no results") &
    gate("historicalV5PackageStillValid", b2pre.historicalV5PackageValid === true && b2pre.historicalV5.hashMismatches.length === 0,
      `${Object.keys(b2pre.historicalV5.boundHashes).length} hashes cross-checked in the 6C4B2 preflight, 0 mismatches`) &
    gate("historicalV5CommandResolves", existsSync("scripts/validation/historical-holdout-v5.mjs")
      && JSON.parse(readFileSync("package.json", "utf8")).scripts["validation:historical-v5"] != null,
      "runner module and npm script both present, semantics untouched by this phase");

  console.log("\nPART 3 — SYNTHETIC V2 MEMBERSHIP (sealed; execution semantics missing)\n");
  const guardrails = HOLDOUT.syntheticGuardrails;
  const synSealed =
    gate("syntheticV2SealedUnread", setAccessCount(SET) === 0 && !existsSync(SEALED_SETS[SET]),
      `access ${setAccessCount(SET)} · no access log`) &
    gate("syntheticV2NoFormalOutput", !artifactExists("synthetic-v2-formal-run", DIR_B2) && !artifactExists("synthetic-v2-access-event", DIR_B2)
      && !artifactExists("synthetic-v2-fixture-results", DIR) && !artifactExists("synthetic-v2-formal-run", DIR),
      "no access event, no fixture results, no formal run") &
    gate("membershipMatchesSealedManifest", mem.fixtures.length === mem.manifest.fixtureCount
      && mem.fixtures.every((f) => mem.manifest.fixtureIds.includes(f.id)),
      `${mem.fixtures.length} fixtures, every id present in the sealed manifest (hash ${mem.membershipHash.slice(0, 16)}...)`) &
    gate("membershipUnchangedByThisPhase", git("diff", "--name-only", "HEAD", "--", SYN_MANIFEST_PATH) === "",
      `${SYN_MANIFEST_PATH} is byte-unchanged in the working tree`);
  // no member id in any committed simulation output
  const OUTPUT_PATTERN = /(results|-run|verdict|dryrun|dry-run|summary|box|ledger|probability|attempts)\.json$|\.jsonl$/;
  const outputFiles = (git("ls-tree", "-r", "--name-only", "HEAD", "data/validation", "data/calibration", ".cache") ?? "")
    .split("\n").filter((f) => f && OUTPUT_PATTERN.test(f));
  const leaks = mem.fixtures.map((f) => f.id).filter((id) => git("grep", "-l", "-F", id, "HEAD", "--", ...outputFiles));
  gate("noMemberIdInSimulationOutput", leaks.length === 0,
    `${mem.fixtures.length} member ids checked against ${outputFiles.length} output-bearing artifacts · leaks ${leaks.length}`);
  gate("frozenGuardrailsReadable", Object.keys(guardrails).length > 0,
    `${Object.keys(guardrails).length} keys in HOLDOUT.syntheticGuardrails inside acceptance policy ${acceptancePolicyHash().slice(0, 16)}...`);

  console.log("\nPART 4 — WHAT THIS PHASE MUST BUILD (read from the 6C4B2 blocker)\n");
  const missing = Object.keys(blocker.data.missing);
  gate("blockerArtifactReadable", missing.length > 0, `${missing.length} missing components: ${missing.join(", ")}`);
  gate("noSyntheticFormalArtifactsYet",
    !artifactExists("synthetic-v2-formal-policy", DIR) && !artifactExists("synthetic-v2-seeds", DIR)
    && !existsSync("scripts/validation/synthetic-stress-holdout-v2.mjs"),
    "no formal policy, seeds or runner exists yet — this phase creates them");

  console.log("\nPART 5 — REPOSITORY\n");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  gate("onPhaseBranch", branch === "phase-6c4b1s-synthetic-v2-package", `branch ${branch}`);
  gate("mainAtProductionCommit", git("rev-parse", "--short", "main") === "9cd95ff", `main ${git("rev-parse", "--short", "main")}`);
  gate("productionUntouched", versionOf("engineVersion") === "3.2.0" && versionOf("appVersion") === "2.7.2",
    `engine ${versionOf("engineVersion")} · app ${versionOf("appVersion")}`);
  gate("priorHoldoutsPreserved", setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
    "V3 access 1 · V4 access 1");

  const flags = {
    candidate1Valid: !!c1Valid, candidate1CoreStable: !!coreStable, candidate1ReplayValid: !!replayValid,
    historicalV5StillSealed: !!v5Sealed, historicalV5AccessCount: setAccessCount("historical-holdout-v5"),
    syntheticV2StillSealed: !!synSealed, syntheticV2AccessCount: setAccessCount(SET),
    formalHoldoutCommandsExecuted: 0,
    syntheticPreparationMayBegin: fail.length === 0,
  };
  writeArtifact("phase6c4b1s-preflight", {
    ...flags, branch, gatesFailed: fail,
    candidate: { candidateId: recert.candidateId, candidateCommit: recert.recertifiedAtCommit, lockRevision: recert.lockRevision,
      coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      calibrationStatus: recert.calibrationStatus, formalValidationStatus: recert.validationAttemptStatus },
    historicalV5: { state: v5seal.state, accessCount: setAccessCount("historical-holdout-v5"),
      sealHash: v5seal.sealHash, packageValid: b2pre.historicalV5PackageValid, commandResolves: true },
    syntheticV2Membership: { fixtureCount: mem.fixtures.length, membershipHash: mem.membershipHash,
      manifestFileSha256: mem.fileSha256, setVersion: mem.manifest.setVersion, frozenAt: mem.manifest.frozenAt,
      fixtureIds: mem.fixtures.map((f) => f.id), purposes: mem.manifest.purposes,
      accessCount: setAccessCount(SET), state: "SEALED_UNREAD", changedByThisPhase: false },
    frozenGuardrailSource: { location: "HOLDOUT.syntheticGuardrails in src/v3/calibration/acceptancePolicy.js",
      acceptancePolicyHash: acceptancePolicyHash(), keyCount: Object.keys(guardrails).length, keys: Object.keys(guardrails) },
    missingComponentsFromBlocker: missing,
    blockerArtifactHash: blocker.outputHash,
    priorHoldouts: { historicalHoldoutV3: setAccessCount("historical-holdout-v3"), historicalHoldoutV4: setAccessCount("historical-holdout-v4") },
    allSeals: Object.fromEntries(Object.entries(allSealStatuses()).map(([k, v]) => [k, { status: v.status, accessCount: v.accessCount }])),
  }, { generationCommand: "npm run syn:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n${JSON.stringify(flags, null, 2)}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
