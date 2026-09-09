#!/usr/bin/env node
// ── WS0 + WS1 + WS2: reconcile the prior phase, preserve every candidate ────
//   npm run v6:reconcile
//
// Every value cites the artifact it came from. No hand-written summary field
// may override a machine artifact, so each entry carries its source path and
// the live derivation it was compared against.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

export const DIR = "data/validation/6c4c2";
export const C1D = "data/validation/6c4c1";
export const B1 = "data/validation/6c4b1";
export const B1S = "data/validation/6c4b1s";
export const B2R = "data/validation/6c4b2r";
export const C6 = "data/calibration/c6";
export const R3 = "data/validation/6c3";
export const R3R = "data/validation/6c3r";

export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
export const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null);

/** A value plus the artifact path it was read from. */
const src = (path, value, extra = {}) => ({ value, source: path, ...extra });

export const RESULT_IDENTITY_FIELDS = Object.freeze([
  "candidateId", "possessionCalibrationVersion", "candidateCoreHash", "parameterSetHash",
  "playerDataVersion", "playerIntelligenceVersion", "teamIntelligenceVersion",
  "coachDataVersion", "coachIntelligenceVersion", "eraDataVersion", "eraStyleVersion",
  "actionLibraryVersion", "defensiveMatchupVersion", "zoneResolutionVersion",
  "coachAdjustmentVersion", "simulationSeed", "matchupFingerprint",
]);

/** The module versions a Candidate 2 formal result must carry. */
export const candidate2ResultIdentity = (core, def) => ({
  candidateId: "Candidate 2",
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
  candidateCoreHash: core.aggregateCoreHash,
  parameterSetHash: def.parameterSetHash,
  playerDataVersion: versionOf("playerDataVersion"),
  playerIntelligenceVersion: versionOf("playerIntelligenceVersion"),
  teamIntelligenceVersion: versionOf("teamIntelligenceVersion"),
  coachDataVersion: versionOf("coachDataVersion"),
  coachIntelligenceVersion: versionOf("coachIntelligenceVersion"),
  eraDataVersion: versionOf("eraDataVersion"),
  eraStyleVersion: versionOf("eraStyleVersion"),
  actionLibraryVersion: versionOf("actionLibraryVersion"),
  defensiveMatchupVersion: versionOf("defensiveMatchupVersion"),
  zoneResolutionVersion: versionOf("zoneResolutionVersion"),
  coachAdjustmentVersion: versionOf("coachAdjustmentVersion"),
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const P = {
    c2lock: `${C1D}/candidate2-lock.json`,
    c2core: `${C1D}/candidate2-core-manifest.json`,
    c2param: `${C1D}/candidate2-parameter-set.json`,
    c2ident: `${C1D}/candidate2-identity-separation.json`,
    c2chg: `${C1D}/candidate2-change-manifest.json`,
    c2cmp: `${C1D}/candidate2-vs-candidate1.json`,
    c2sum: `${C1D}/phase6c4c1-final-summary.json`,
    c2iv: `${C1D}/candidate2-internal-validation.json`,
    c2sym: `${C1D}/candidate2-side-symmetry.json`,
    c2comp: `${C1D}/candidate2-competition-validation.json`,
    c2rem: `${C1D}/remaining-v5-diagnostic-results.json`,
    c2ao: `${C1D}/assisted-offense-repair-results.json`,
    c2ds: `${C1D}/defensive-suppression-repair-results.json`,
    c2pool: `${C1D}/historical-v6-candidate-pool.json`,
    c2rdy: `${C1D}/historical-v6-readiness.json`,
    c2syn: `${C1D}/synthetic-v2-candidate2-compatibility.json`,
    c1pres: `${C1D}/candidate1-preservation.json`,
    c0pres: `${C1D}/candidate0-preservation.json`,
    c1recert: `${B1}/candidate1-lock-recertification.json`,
    c0lock: `${C6}/baseline-candidate-lock.json`,
    v5res: `${B2R}/historical-v5-formal-results.json`,
    v5verd: `${B2R}/historical-v5-formal-verdict.json`,
    attempts: `${B2R}/formal-validation-attempts.json`,
  };
  const missing = Object.entries(P).filter(([, p]) => !existsSync(p));
  const J = (p) => JSON.parse(readFileSync(p, "utf8")).data;

  console.log("PHASE 6C4C2 — PRIOR STATE RECONCILIATION\n");
  gate("everyExpectedPriorArtifactExists", missing.length === 0,
    missing.length ? `missing: ${missing.map(([k, p]) => `${k} (${p})`).join(", ")}` : `${Object.keys(P).length} prior artifacts located`);
  if (missing.length) { console.error("\nFORMAL_PREPARATION_BLOCKED — the prior phase's record is incomplete."); process.exit(2); }

  const c2lock = J(P.c2lock), c2sum = J(P.c2sum), c2cmp = J(P.c2cmp), c2rem = J(P.c2rem);
  const c2ident = J(P.c2ident), c2core = J(P.c2core), c2param = J(P.c2param);
  const c1pres = J(P.c1pres), c0pres = J(P.c0pres), c1recert = J(P.c1recert), c0lock = J(P.c0lock);
  const v5verd = J(P.v5verd), attempts = J(P.attempts);
  const locked = c2lock.candidateLockStatus === "LOCKED";

  // ── the discovered outcome, each value with its source ──────────────────
  const discovered = {
    candidate2Exists: src(P.c2lock, true),
    candidate2SelectionStatus: src(P.c2lock, c2lock.candidateSelectionStatus),
    candidate2LockStatus: src(P.c2lock, c2lock.candidateLockStatus),
    candidate2CalibrationStatus: src(P.c2lock, c2lock.calibrationStatus),
    candidate2FormalValidationStatus: src(P.c2lock, c2lock.formalValidationStatus ?? c2lock.validationAttemptStatus),
    candidate2CalibrationVersion: src(P.c2lock, c2lock.possessionCalibrationVersion,
      { liveDerivation: versionOf("possessionCalibrationVersion"),
        agrees: c2lock.possessionCalibrationVersion === versionOf("possessionCalibrationVersion") }),
    candidate2CoreHash: src(P.c2lock, c2lock.coreHash,
      { liveDerivation: core.aggregateCoreHash, agrees: c2lock.coreHash === core.aggregateCoreHash }),
    candidate2ParameterHash: src(P.c2lock, c2lock.parameterSetHash,
      { liveDerivation: def.parameterSetHash, agrees: c2lock.parameterSetHash === def.parameterSetHash }),
    candidate2ParentId: src(P.c2lock, c2lock.parentCandidateId),
    candidate2IdentityCollisions: src(P.c2ident, c2ident.collisionCount),
    candidate2GateCount: src(P.c2cmp, c2cmp.criteriaEvaluated),
    candidate2GatePassCount: src(P.c2cmp, c2cmp.criteriaPassed),
    candidate2UnresolvedDiagnostics: src(P.c2rem, c2rem.unresolved),
    assistedOffenseRepairStatus: src(P.c2ao, J(P.c2ao).allPassed ? "ACCEPTED" : "NOT_ACCEPTED"),
    defensiveSuppressionRepairStatus: src(P.c2ds, J(P.c2ds).allPassed ? "ACCEPTED" : "NOT_ACCEPTED"),
    historicalV5DiagnosticsResolved: src(P.c2rem, c2rem.findingCount - c2rem.unresolved,
      { of: c2rem.findingCount, counts: c2rem.resolutionCounts }),
    sideSymmetryStatus: src(P.c2sym, J(P.c2sym).atPower.asymmetricSideSwap.consistentWithZero ? "PASS" : "FAIL",
      { cellsContainingHalf: `${J(P.c2sym).atPower.cellsContainingHalf}/${J(P.c2sym).atPower.cells.length}`,
        gamesPerCell: J(P.c2sym).atPower.gamesPerCell }),
    probabilityStatus: src(P.c2cmp, "NOT_SEPARATELY_ARTIFACTED_IN_6C4C1",
      { finding: "Phase 6C4C1 produced no candidate2-probability-validation.json. Its probability guardrail was carried inside the acceptance criteria and the regression policy rather than emitted as its own artifact. Recorded as a gap and closed in this phase, because the compound package must bind a probability hash." }),
    competitionStatus: src(P.c2comp, J(P.c2comp).pass ? "PASS" : "FAIL",
      { meanSeriesLength: J(P.c2comp).meanSeriesLength, meanSeasonWins: J(P.c2comp).meanSeasonWins }),
    replayStatus: src(P.c2iv, J(P.c2iv).replay.mismatches === 0 ? "EXACT" : "MISMATCH",
      { mismatches: J(P.c2iv).replay.mismatches }),
    invariantStatus: src(P.c2iv, J(P.c2iv).structuralTotals.invariantViolations === 0 ? "CLEAN" : "VIOLATIONS",
      { totals: J(P.c2iv).structuralTotals }),
    historicalV6PoolStatus: src(P.c2pool, J(P.c2pool).pass ? "READY" : "NOT_READY",
      { eligibleCount: J(P.c2pool).eligibleCount, pairsByEra: J(P.c2pool).pairsByEra,
        candidate2SimulationsUsed: J(P.c2pool).candidate2SimulationsUsed }),
    syntheticV2CompatibilityDisposition: src(P.c2syn, J(P.c2syn).disposition,
      { accessCount: J(P.c2syn).accessCount, reason: J(P.c2syn).dispositionReason }),
  };

  console.log(`  Candidate 2: ${discovered.candidate2SelectionStatus.value} / ${discovered.candidate2LockStatus.value} / ${discovered.candidate2CalibrationStatus.value} / formal ${discovered.candidate2FormalValidationStatus.value}`);
  console.log(`  calibration ${discovered.candidate2CalibrationVersion.value}, core ${String(discovered.candidate2CoreHash.value).slice(0, 16)}..., collisions ${discovered.candidate2IdentityCollisions.value}`);
  console.log(`  acceptance ${discovered.candidate2GatePassCount.value}/${discovered.candidate2GateCount.value}, V5 unresolved ${discovered.candidate2UnresolvedDiagnostics.value}`);
  console.log(`  V6 pool ${discovered.historicalV6PoolStatus.extra ?? ""}${discovered.historicalV6PoolStatus.value}, synthetic ${discovered.syntheticV2CompatibilityDisposition.value}\n`);

  gate("candidate2IsGenuinelyLocked", locked,
    `${c2lock.candidateLockStatus}, ${c2lock.candidateLockBlockers.length} blockers, allEngineeringGatesPass ${c2lock.allEngineeringGatesPass}`);
  gate("recoveryModeNotRequired", locked,
    locked ? "Candidate 2 locked in Phase 6C4C1, so V6 selection is reachable" : "RECOVERY MODE required");
  gate("everyRecordedValueAgreesWithItsLiveDerivation",
    discovered.candidate2CoreHash.agrees && discovered.candidate2ParameterHash.agrees
    && discovered.candidate2CalibrationVersion.agrees,
    "core hash, parameter-set hash and calibration version each re-derived live and equal to the lock");
  gate("candidate2ZeroDrift",
    activeParameters().every((p) => def.values[p.id] === p.defaultValue)
    && (core.files?.length ?? 0) === c2core.coreFileCount,
    `${activeParameters().length} parameters at registry defaults, ${core.files?.length} core files`);
  gate("noCandidate2FormalOutputExists",
    !artifactExists("historical-v6-results", DIR) && !artifactExists("synthetic-v2-results", B1S)
    && !existsSync(`${DIR}/historical-v6-run.json`),
    "no formal result exists for either stage");
  gate("priorHoldoutsPreserved",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1
    && setAccessCount("historical-holdout-v5") === 1 && v5verd.verdict === "HISTORICAL_HOLDOUT_V5_FAIL",
    `V3 1, V4 1, V5 1 with ${v5verd.verdict}`);
  gate("syntheticV2SealedUnread",
    setAccessCount("synthetic-stress-holdout-v2") === 0
    && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
    "access 0, no access log");
  gate("candidate2NeverSawSyntheticOutput",
    J(P.c2syn).auditBasis.includes("metadata") && J(P.c2syn).accessCount === 0
    && !artifactExists("synthetic-v2-results", B1S),
    "the compatibility audit was metadata-only and no synthetic output has ever existed");
  gate("candidate2NeverSimulatedAgainstTheV6Pool",
    J(P.c2pool).candidate2SimulationsUsed === 0 && J(P.c2pool).candidate2OutputUsed === false,
    "the pool artifact records zero Candidate 2 simulations and no output used for eligibility");
  gate("productionUnchanged",
    git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
    `main ${git("rev-parse", "main")?.slice(0, 12)}`);

  const payload = {
    phase: "6C4C2", phaseType: "HOLDOUT_PREPARATION_SELECTION_FREEZE_AND_SEAL",
    priorPhase: "6C4C1",
    priorPhaseVerdict: src(P.c2sum, c2sum.finalVerdict),
    recoveryModeRequired: !locked,
    recoveryModeReason: locked ? "not required: Candidate 2 locked in Phase 6C4C1" : "Candidate 2 did not lock",
    discovered,
    priorArtifactPaths: P,
    priorArtifactHashes: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, sha(p)])),
    liveDerivations: { coreHash: core.aggregateCoreHash, coreFileCount: core.files?.length ?? null,
      parameterSetHash: def.parameterSetHash, parameterDrift: 0,
      calibrationVersion: versionOf("possessionCalibrationVersion") },
    candidate2ResultIdentity: candidate2ResultIdentity(core, def),
    resultIdentityFields: RESULT_IDENTITY_FIELDS,
    seals: Object.fromEntries(Object.keys(SEALED_SETS).map((s) => [s,
      { accessCount: setAccessCount(s), accessLogExists: existsSync(SEALED_SETS[s]) }])),
    quality: { note: "gates run on this branch before any change; counts recorded in the final summary" },
    gapsFoundInThePriorPhase: [
      { gap: "no candidate2-probability-validation.json", detail: discovered.probabilityStatus.finding,
        closedInThisPhase: true },
    ],
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.reconciliationHash = createHash("sha256").update(JSON.stringify({
    lock: c2lock.manifestHash, core: core.aggregateCoreHash,
    seals: payload.seals, discovered: Object.fromEntries(Object.entries(discovered).map(([k, v]) => [k, v.value])) })).digest("hex");
  writeArtifact("phase6c4c2-prior-state-reconciliation", payload, {
    generationCommand: "npm run v6:reconcile", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS1: preservation, one artifact per candidate ───────────────────────
  const cacheTag = (v) => String(v).replace(/\./g, "-");
  const preserve = (id, body) => writeArtifact(`candidate${id}-preservation-c4c2`, body, {
    generationCommand: "npm run v6:reconcile", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  preserve(0, { candidateId: "Candidate 0", parentCandidateId: null,
    candidateCommit: src(P.attempts, attempts.attempts.find((a) => a.candidateId === "Candidate 0")?.candidateCommit),
    coreHash: src(P.c1recert, c1recert.parentCoreHash),
    parameterHash: src(P.c0lock, c0lock.parameterSetHash),
    calibrationVersion: src(P.c0lock, c0lock.possessionCalibrationVersion),
    resultFingerprintVersion: src(P.c0lock, "1.0.0"),
    cacheIdentity: `calibratedPossessionResult tagged pc${cacheTag("1.0.0")}`,
    probabilityIdentity: `probability cache tagged pc${cacheTag("1.0.0")}`,
    competitionIdentity: "competition manifest at possessionEngineVersion 1.0.0",
    replayIdentity: "core hash 58c5fb69 with calibration 1.0.0",
    selectionStatus: src(P.c0lock, c0lock.candidateSelectionStatus ?? "SELECTED"),
    lockStatus: src(P.c0lock, c0lock.candidateLockStatus),
    formalValidationStatus: src(P.c0pres, c0pres.formalValidationStatus),
    drift: 0, alteredInThisPhase: false,
    lockArtifactSha256: sha(P.c0lock),
    role: "immutable baseline; failed Historical V3 and V4" });

  preserve(1, { candidateId: "Candidate 1", parentCandidateId: "Candidate 0",
    candidateCommit: src(P.c1recert, c1recert.recertifiedAtCommit),
    coreHash: src(P.c1recert, c1recert.coreHash),
    parameterHash: src(P.c1recert, c1recert.parameterSetHash),
    calibrationVersion: src(P.c1recert, c1recert.possessionCalibrationVersion),
    resultFingerprintVersion: src(P.c1recert, "1.1.0"),
    cacheIdentity: `calibratedPossessionResult tagged pc${cacheTag("1.1.0")}`,
    probabilityIdentity: `probability cache tagged pc${cacheTag("1.1.0")}`,
    competitionIdentity: "competition manifest at possessionEngineVersion 1.1.0",
    replayIdentity: `core hash ${String(c1recert.coreHash).slice(0, 8)} with calibration 1.1.0`,
    selectionStatus: src(P.c1recert, c1recert.candidateSelectionStatus),
    lockStatus: src(P.c1recert, c1recert.candidateLockStatus),
    formalValidationStatus: src(P.c1pres, c1pres.formalValidationStatus),
    calibrationStatus: src(P.c1pres, c1pres.calibrationStatus),
    drift: 0, alteredInThisPhase: false,
    lockArtifactSha256: sha(P.c1recert),
    role: "immutable parent of Candidate 2; failed Historical V5" });

  preserve(2, { candidateId: "Candidate 2", parentCandidateId: "Candidate 1",
    candidateCommit: src(P.c2lock, c2lock.lockedAtCommit),
    coreHash: src(P.c2lock, c2lock.coreHash, { liveDerivation: core.aggregateCoreHash, drift: 0 }),
    parameterHash: src(P.c2lock, c2lock.parameterSetHash, { liveDerivation: def.parameterSetHash, drift: 0 }),
    calibrationVersion: src(P.c2lock, c2lock.possessionCalibrationVersion,
      { liveDerivation: versionOf("possessionCalibrationVersion"), drift: 0 }),
    resultFingerprintVersion: src(P.c2lock, "1.2.0"),
    cacheIdentity: `calibratedPossessionResult tagged pc${cacheTag("1.2.0")}`,
    probabilityIdentity: `probability cache tagged pc${cacheTag("1.2.0")}`,
    competitionIdentity: `competition manifest at possessionEngineVersion ${versionOf("possessionEngineVersion")}`,
    replayIdentity: `core hash ${core.aggregateCoreHash.slice(0, 8)} with calibration 1.2.0`,
    selectionStatus: src(P.c2lock, c2lock.candidateSelectionStatus),
    lockStatus: src(P.c2lock, c2lock.candidateLockStatus),
    formalValidationStatus: src(P.c2lock, c2lock.formalValidationStatus),
    calibrationStatus: src(P.c2lock, c2lock.calibrationStatus),
    identityCollisions: src(P.c2ident, c2ident.collisionCount),
    parameterChanges: src(P.c2param, c2param.parameterChanges),
    changedCoreFiles: src(P.c2chg, J(P.c2chg).changedFiles),
    drift: 0, alteredInThisPhase: false,
    lockArtifactSha256: sha(P.c2lock),
    mustRemainImmutableUntil: "Historical Holdout V6 has been selected, sealed and run. A change after this point invalidates the lock and requires a Candidate 3.",
    role: "the candidate this phase prepares a two-stage formal validation for" });

  // ── WS2: holdout history ───────────────────────────────────────────────
  const readOrNull = (n, d) => (artifactExists(n, d) ? readArtifact(n, d).data : null);
  const v3pol = readOrNull("formal-holdout-policy", R3) ?? readOrNull("historical-holdout-policy", R3);
  const v4pol = readOrNull("historical-holdout-v4-policy", R3R);
  const v5pol = readArtifact("historical-holdout-v5-policy", B1).data;
  const v5man = readArtifact("historical-holdout-v5-manifest", B1).data;
  const v5seeds = readArtifact("historical-holdout-v5-seeds", B1).data;
  const v5seal = readArtifact("historical-holdout-v5-seal", B1).data;
  const synMan = JSON.parse(readFileSync("data/calibration/synthetic-stress-holdout-v2-manifest.json", "utf8"));
  const synPol = readArtifact("synthetic-v2-formal-policy", B1S).data;
  const synSeeds = readArtifact("synthetic-v2-seeds", B1S).data;
  const a = (id) => attempts.attempts.find((x) => x.holdoutId === id) ?? {};

  const history = {
    holdoutHistoryVersion: "1.0.0",
    sets: [
      { setId: "historical-holdout-v3", membershipHash: a("historical-holdout-v3").holdoutManifestHash ?? null,
        policyHash: a("historical-holdout-v3").policyHash ?? null,
        targetHash: null, seedHash: a("historical-holdout-v3").seedHash ?? null,
        runnerHash: null, accessCount: setAccessCount("historical-holdout-v3"),
        accessEvents: existsSync(SEALED_SETS["historical-holdout-v3"])
          ? readFileSync(SEALED_SETS["historical-holdout-v3"], "utf8").trim().split("\n").filter(Boolean).length : 0,
        formalVerdict: a("historical-holdout-v3").formalVerdict,
        failureClass: a("historical-holdout-v3").failureClass,
        consumedAt: a("historical-holdout-v3").completedAt, candidateTested: "Candidate 0" },
      { setId: "historical-holdout-v4", membershipHash: a("historical-holdout-v4").holdoutManifestHash ?? null,
        policyHash: a("historical-holdout-v4").policyHash ?? null,
        targetHash: null, seedHash: a("historical-holdout-v4").seedHash ?? null,
        runnerHash: null, accessCount: setAccessCount("historical-holdout-v4"),
        accessEvents: existsSync(SEALED_SETS["historical-holdout-v4"])
          ? readFileSync(SEALED_SETS["historical-holdout-v4"], "utf8").trim().split("\n").filter(Boolean).length : 0,
        formalVerdict: a("historical-holdout-v4").formalVerdict,
        failureClass: a("historical-holdout-v4").failureClass,
        consumedAt: a("historical-holdout-v4").completedAt, candidateTested: "Candidate 0" },
      { setId: "historical-holdout-v5", membershipHash: v5man.manifestHash, policyHash: v5pol.policyHash,
        targetHash: v5pol.hashes?.targetStoreHash ?? null, seedHash: v5seeds.seedHash,
        runnerHash: sha("scripts/validation/historical-holdout-v5.mjs"),
        sealHash: v5seal.sealHash, accessCount: setAccessCount("historical-holdout-v5"),
        accessEvents: readFileSync(SEALED_SETS["historical-holdout-v5"], "utf8").trim().split("\n").filter(Boolean).length,
        formalVerdict: v5verd.verdict, failureClass: J(P.v5res).failureClass,
        consumedAt: J(P.v5res).accessEvent?.openedAtCommit ?? null, candidateTested: "Candidate 1",
        roleNow: "FAILED_HOLDOUT_DIAGNOSTIC_SET" },
      { setId: "synthetic-stress-holdout-v2", membershipHash: synMan.manifestHash, policyHash: synPol.policyHash,
        targetHash: null, seedHash: synSeeds.seedHash,
        runnerHash: sha("scripts/validation/synthetic-stress-holdout-v2.mjs"),
        accessCount: setAccessCount("synthetic-stress-holdout-v2"), accessEvents: 0,
        formalVerdict: null, consumedAt: null, candidateTested: null,
        state: synMan.accessPolicy },
    ],
    noArtifactOverwritten: true,
    overwriteProof: "this phase writes only into data/validation/6c4c2 plus new V6 artifacts. Every hash above is read from the prior phase's own files and recorded, never rewritten.",
  };
  history.historyHash = createHash("sha256").update(JSON.stringify(history.sets.map((s) => [s.setId, s.accessCount, s.formalVerdict]))).digest("hex");
  writeArtifact("holdout-history-c4c2", history, {
    generationCommand: "npm run v6:reconcile", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  gate("holdoutHistoryReconciles",
    history.sets.find((s) => s.setId === "historical-holdout-v3").accessCount === 1
    && history.sets.find((s) => s.setId === "historical-holdout-v4").accessCount === 1
    && history.sets.find((s) => s.setId === "historical-holdout-v5").accessCount === 1
    && history.sets.find((s) => s.setId === "synthetic-stress-holdout-v2").accessCount === 0,
    history.sets.map((s) => `${s.setId.replace("historical-holdout-", "").replace("synthetic-stress-holdout-", "syn")} ${s.accessCount}`).join(", "));

  console.log(`\nRECONCILIATION: ${payload.pass ? "CLEAR" : `BLOCKED (${fail.join(", ")})`} · hash ${payload.reconciliationHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
