#!/usr/bin/env node
// ── WS0 + WS1: preserve, then adjudicate Historical V6 invalidity ───────────
//   npm run d0:adjudicate
//
// The original FAIL artifact is never rewritten. This adds a superseding
// validity adjudication beside it and binds the original by content hash so any
// later edit is detectable.
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, D1, C3D, C2D, C1D, B2R, git, sha, v, unwrap, fileHash } from "./paths.mjs";

/** The original V6 record. Bound by content hash, never modified. */
export const V6_ORIGINAL = Object.freeze({
  run: `${C2D}/historical-holdout-v6-run.json`,
  results: `${C2D}/historical-v6-results.json`,
  formalRun: `${C3D}/historical-v6-formal-run.json`,
  fixtureResults: `${C3D}/historical-v6-fixture-results.json`,
  formalResults: `${C3D}/historical-v6-formal-results.json`,
  formalVerdict: `${C3D}/historical-v6-formal-verdict.json`,
  accessEvent: `${C3D}/historical-v6-access-event.json`,
  accessLog: "data/calibration/historical-holdout-v6-access-log.jsonl",
  manifest: `${C2D}/historical-holdout-v6-manifest.json`,
  verdictPolicy: `${C2D}/historical-v6-verdict-policy.json`,
  seeds: `${C2D}/historical-v6-seeds.json`,
  seal: `${C2D}/historical-v6-seal.json`,
  runnerDryRun: `${C2D}/historical-v6-runner-dry-run.json`,
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  console.log("PHASE 6C4D0 — WS0 PRESERVATION\n");

  // ── WS0 candidates ───────────────────────────────────────────────────────
  const c2lock = readArtifact("candidate2-lock", C1D).data;
  const c2ident = readArtifact("candidate2-identity-separation", C1D).data;
  const preservation = {};
  for (const key of ["candidate0", "candidate1", "candidate2"]) {
    const src = `${D1}/${key}-preservation-d1.json`;
    const prior = readArtifact(`${key}-preservation-d1`, D1).data;
    const p = {
      candidateId: v(unwrap(prior.candidateId), src), parentCandidateId: v(unwrap(prior.parentCandidateId), src),
      candidateCommit: v(unwrap(prior.candidateCommit), src),
      candidateCoreHash: v(unwrap(prior.candidateCoreHash), src),
      parameterSetHash: v(unwrap(prior.parameterSetHash), src),
      calibrationVersion: v(unwrap(prior.calibrationVersion), src),
      resultIdentity: v(unwrap(prior.resultIdentity), src),
      resultCacheIdentity: v(unwrap(prior.resultCacheIdentity), src),
      probabilityIdentity: v(unwrap(prior.probabilityIdentity), src),
      competitionIdentity: v(unwrap(prior.competitionIdentity), src),
      replayIdentity: v(unwrap(prior.replayIdentity), src),
      selectionStatus: v(unwrap(prior.selectionStatus), src), lockStatus: v(unwrap(prior.lockStatus), src),
      drift: v(unwrap(prior.drift), src),
      alteredInThisPhase: v(false, "this phase changes no candidate code, core, parameter or identity"),
    };
    if (key === "candidate2") {
      // The adjudication removes the effective formal-failure conclusion. The
      // candidate itself is untouched.
      p.calibrationStatusBeforeAdjudication = v(unwrap(prior.calibrationStatus), src);
      p.formalValidationStatusBeforeAdjudication = v(unwrap(prior.formalValidationStatus), src);
      p.calibrationStatus = v("FORMAL_VALIDATION_INCOMPLETE",
        "Historical V6 is adjudicated INVALID, so no valid historical holdout has judged Candidate 2. HOLDOUT_FAILED no longer describes it and HOLDOUT_VALIDATED was never earned.");
      p.formalValidationStatus = v("HISTORICAL_V6_INVALID",
        `${DIR}/historical-v6-invalidity-adjudication.json`);
      p.coreHashUnchanged = v(core.aggregateCoreHash === c2lock.coreHash, "recomputed against the lock");
      p.parameterSetHashUnchanged = v(def.parameterSetHash === c2lock.parameterSetHash, "recomputed against the lock");
    } else {
      p.calibrationStatus = v(unwrap(prior.calibrationStatus), src);
      p.formalValidationStatus = v(unwrap(prior.formalValidationStatus), src);
    }
    preservation[key] = p;
    writeArtifact(`${key}-preservation-d0`, { ...p, preservationHash: sha(p) },
      { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  }
  for (const k of ["candidate0", "candidate1", "candidate2"]) {
    gate(`${k}DriftZero`, preservation[k].drift.value === 0,
      `drift ${preservation[k].drift.value} · ${preservation[k].lockStatus.value} · ${preservation[k].calibrationVersion.value}`);
  }
  gate("candidate2HashesUnchanged",
    core.aggregateCoreHash === c2lock.coreHash && def.parameterSetHash === c2lock.parameterSetHash,
    `core ${core.aggregateCoreHash.slice(0, 16)}... and parameter set both equal the lock`);
  gate("calibrationVersionNotBumped", versionOf("possessionCalibrationVersion") === "1.2.0",
    `${versionOf("possessionCalibrationVersion")} — this phase makes no engine change`);
  gate("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `${activeParameters().length} registered parameters, none drifted`);
  gate("candidate2IdentityCollisionsZero", c2ident.collisionCount === 0, `collisionCount ${c2ident.collisionCount}`);

  // ── WS15 synthetic preservation ──────────────────────────────────────────
  const synAccess = setAccessCount("synthetic-stress-holdout-v2");
  writeArtifact("synthetic-v2-preservation-d0", {
    set: "synthetic-stress-holdout-v2", state: synAccess === 0 ? "SEALED_UNREAD" : "UNSEALED",
    accessCount: synAccess, accessEvents: synAccess,
    accessLog: SEALED_SETS["synthetic-stress-holdout-v2"],
    accessLogExists: existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
    formalOutputs: ["synthetic-v2-candidate2-results", "synthetic-candidate2-formal-results",
      "synthetic-candidate2-formal-verdict", "synthetic-candidate2-access-event"]
      .filter((n) => existsSync(`${C2D}/${n}.json`) || existsSync(`${C3D}/${n}.json`) || existsSync(`${DIR}/${n}.json`)).length,
    openedInThisPhase: false,
    boundToCandidate3: false,
    bindingNote: "future binding depends on the Candidate decision. This phase does not bind, rebind or replace it.",
    membershipHash: readArtifact("synthetic-v2-formal-policy", "data/validation/6c4b1s").data.hashes.membershipHash,
    pass: synAccess === 0,
  }, { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  gate("syntheticV2SealedAtZero", synAccess === 0 && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
    `access ${synAccess}, no log on disk, zero formal outputs`);

  // ── WS1.1 preserve the original V6 record by content hash ────────────────
  console.log("\nWS1 — HISTORICAL V6 INVALIDITY ADJUDICATION\n");
  const bound = Object.fromEntries(Object.entries(V6_ORIGINAL)
    .map(([k, p]) => [k, { path: p, exists: existsSync(p), sha256: fileHash(p) }]));
  const missing = Object.entries(bound).filter(([, b]) => !b.exists).map(([k]) => k);
  gate("everyOriginalV6ArtifactPresentAndBound", missing.length === 0,
    `${Object.keys(bound).length} artifacts bound by content hash${missing.length ? ` · MISSING ${missing.join(", ")}` : ""}`);
  const origVerdict = readArtifact("historical-v6-formal-verdict", C3D).data;
  const origResults = readArtifact("historical-v6-formal-results", C3D).data;
  const origEvent = readArtifact("historical-v6-access-event", C3D).data;
  gate("originalVerdictStillFail",
    origVerdict.formalVerdict === "HISTORICAL_HOLDOUT_V6_FAIL" && origVerdict.outcome === "FAIL",
    `${origVerdict.formalVerdict} · ${origVerdict.failureClass} — preserved exactly as issued`);
  gate("originalAccessCountStillOne",
    setAccessCount("historical-holdout-v6") === 1 && origEvent.accessCountAfter === 1,
    `live access count ${setAccessCount("historical-holdout-v6")}, event records 0 -> 1`);

  writeArtifact("historical-v6-original-record-preservation", {
    historicalV6OriginalRecordPreservationVersion: "1.0.0",
    set: "historical-holdout-v6",
    boundArtifacts: bound,
    originalRunnerVerdict: origVerdict.formalVerdict,
    originalOutcome: origVerdict.outcome,
    originalFailureClass: origVerdict.failureClass,
    originalFailedGates: origVerdict.failedGates,
    originalRunHash: origResults.runHash,
    originalVerdictHash: origVerdict.verdictHash,
    originalCandidateCoreHash: origResults.identity.coreHash,
    originalPolicyHash: origVerdict.policyHash,
    originalSeedHash: readArtifact("historical-v6-seeds", C2D).data.seedHash,
    originalSealHash: readArtifact("historical-v6-seal", C2D).data.sealHash,
    originalRunnerDryRunHash: readArtifact("historical-v6-runner-dry-run", C2D).data.dryRunHash,
    accessCount: setAccessCount("historical-holdout-v6"),
    immutability: "none of the bound artifacts is altered by this phase. The adjudication below sits beside them; it does not replace them, and any later edit changes a bound sha256.",
    pass: fail.length === 0,
  }, { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS1.2 materiality, read from the committed audit artifacts ────────────
  const audit = readArtifact("historical-v6-input-support-audit", D1).data;
  const remeasure = readArtifact("historical-v6-remeasurement", D1).data;
  const register = readArtifact("historical-v6-diagnostic-register", D1).data;
  const clusters = readArtifact("historical-v6-independent-clusters", D1).data;
  const h = audit.headline;
  const totalPlayers = audit.v6Sides.reduce((a, s) => a + s.players.length, 0);
  const fullRecord = audit.v6Sides.reduce((a, s) => a + s.players.filter((p) => p.resolvedThroughRunnerProfileMap).length, 0);
  const materiality = {
    intendedProfileMapSources: v(audit.runnerProfileMapContents.stores, `${D1}/historical-v6-input-support-audit.json`),
    intendedNote: v(audit.runnerProfileMapContents.note, `${D1}/historical-v6-input-support-audit.json`),
    v6SelectedPlayerCount: v(totalPlayers, "counted from the audit"),
    fullRecordResolutions: v(fullRecord, "counted from the audit"),
    manifestFallbackResolutions: v(totalPlayers - fullRecord, "counted from the audit"),
    v6SidesFullyResolved: v(h.v6SidesFullyResolved, `${D1}/historical-v6-input-support-audit.json`),
    eraReferencesFullyResolved: v(h.eraReferencesFullyResolved, `${D1}/historical-v6-input-support-audit.json`),
    requiredAdapterFieldCount: v(audit.adapterInputsRequired.length, `${D1}/historical-v6-input-support-audit.json`),
    missingFallbackFields: v(audit.v6Sides[0].players[0].adapterInputsMissingFromTheRecordUsed,
      `${D1}/historical-v6-input-support-audit.json`),
    missingFallbackFieldCount: v(audit.v6Sides[0].players[0].adapterInputsMissingFromTheRecordUsed.length,
      `${D1}/historical-v6-input-support-audit.json`),
    nanDecadeSideCount: v(h.v6SidesWithNaNDecade, `${D1}/historical-v6-input-support-audit.json`),
    distinctSpacingGravityAcrossSides: v(h.distinctSpacingGravityAcrossV6Sides, `${D1}/historical-v6-input-support-audit.json`),
    calibrationRecordsWithPopulatedOffensiveRoles: v(h.calibrationRecordsWithPopulatedOffensiveRoles, `${D1}/historical-v6-input-support-audit.json`),
    calibrationRecordsTotal: v(h.calibrationRecordsTotal, `${D1}/historical-v6-input-support-audit.json`),
    subjectReferenceAsymmetry: v("subjects 0/16 fully resolved, references 8/8 fully resolved",
      `${D1}/historical-v6-input-support-audit.json`),
    formalHardFailLabels: v(remeasure.formalHardFailLabels, `${D1}/historical-v6-remeasurement.json`),
    correctedInputHardFailLabels: v(remeasure.remeasuredHardFailLabels, `${D1}/historical-v6-remeasurement.json`),
    resolvedByCorrectedInputs: v(remeasure.resolvedByCorrectedInputs, `${D1}/historical-v6-remeasurement.json`),
    persistingAfterCorrection: v(remeasure.persistingAfterCorrection, `${D1}/historical-v6-remeasurement.json`),
    formalTraitPassRate: v(remeasure.formalTraitPassRate, `${D1}/historical-v6-remeasurement.json`),
    correctedInputTraitPassRate: v(remeasure.remeasuredTraitPassRate, `${D1}/historical-v6-remeasurement.json`),
    frozenMinimumPassRate: v(readArtifact("historical-v6-verdict-policy", C2D).data.traitGates.aggregate.minTraitPassRate,
      `${C2D}/historical-v6-verdict-policy.json`),
    formalIndependentClusters: v(clusters.clusterCount, `${D1}/historical-v6-independent-clusters.json`),
    formalFailingInstances: v(register.failingInstanceCount, `${D1}/historical-v6-diagnostic-register.json`),
  };
  const crossedThreshold = materiality.formalTraitPassRate.value < materiality.frozenMinimumPassRate.value
    && materiality.correctedInputTraitPassRate.value >= materiality.frozenMinimumPassRate.value;
  console.log(`  subjects fully resolved ${h.v6SidesFullyResolved} · references ${h.eraReferencesFullyResolved}`);
  console.log(`  adapter fields required ${audit.adapterInputsRequired.length} · missing on the fallback path ${materiality.missingFallbackFieldCount.value}`);
  console.log(`  NaN decade sides ${h.v6SidesWithNaNDecade}/16 · distinct spacingGravity ${h.distinctSpacingGravityAcrossV6Sides.length}`);
  console.log(`  hard-fail labels ${remeasure.formalHardFailLabels} -> ${remeasure.remeasuredHardFailLabels} · pass rate ${remeasure.formalTraitPassRate} -> ${remeasure.remeasuredTraitPassRate} (minimum ${materiality.frozenMinimumPassRate.value})\n`);
  gate("materialityEstablished",
    materiality.manifestFallbackResolutions.value === totalPlayers && totalPlayers > 0
    && materiality.missingFallbackFieldCount.value > 0,
    `all ${totalPlayers} selected players resolved through a fallback record missing ${materiality.missingFallbackFieldCount.value} of ${audit.adapterInputsRequired.length} adapter inputs`);
  gate("defectChangedFormalFailures", remeasure.resolvedByCorrectedInputs > 0,
    `${remeasure.resolvedByCorrectedInputs} formal hard-fail labels do not reproduce once the records are complete`);
  gate("defectMovedTheAggregateAcrossAFrozenThreshold", crossedThreshold,
    `trait pass rate ${remeasure.formalTraitPassRate} (below ${materiality.frozenMinimumPassRate.value}) -> ${remeasure.remeasuredTraitPassRate} (at or above it)`);
  gate("subjectReferencePathsWereNotEquivalent",
    h.v6SidesFullyResolved !== h.eraReferencesFullyResolved,
    "subject teams and their Era Style references did not resolve through equivalent profile pathways");

  // ── WS1.3 the superseding adjudication ───────────────────────────────────
  const adjudication = {
    historicalV6InvalidityAdjudicationVersion: "1.0.0",
    set: "historical-holdout-v6",
    originalFormalVerdict: origVerdict.formalVerdict,
    originalVerdictPreserved: true,
    originalVerdictArtifact: V6_ORIGINAL.formalVerdict,
    originalVerdictSha256: fileHash(V6_ORIGINAL.formalVerdict),
    runValidity: "INVALID",
    effectiveFormalVerdict: "HISTORICAL_HOLDOUT_V6_INVALID_RUN",
    invalidityClass: "VALIDATION_PROFILE_RESOLUTION_FAILURE",
    candidateFailureEstablished: false,
    holdoutConsumed: true,
    accessCount: setAccessCount("historical-holdout-v6"),
    replacementHoldoutRequired: true,
    permittedUseOfV6: "INVALID_HOLDOUT_DIAGNOSTIC_SET",
    forbiddenUseOfV6: ["UNSEEN_HOLDOUT", "FORMAL_GENERALIZATION_EVIDENCE",
      "evidence that Candidate 2 failed historical trait fidelity"],
    reasoning: {
      what: "the V6 execution path did not supply Candidate 2 with the complete frozen player-season records the validation design intended to test. Every selected player resolved through a fallback record missing 12 of the 18 fields the calibration adapter consumes.",
      why: "buildRunnerProfileMap loads the v3 and v4 calibration stores only; every V6 player lives in the v5 or v6 store, so all of them missed the map and the runner substituted the manifest player row.",
      howItBiasedTheMeasurement: "the Era Style references resolved from complete records while the subject teams did not, so subject and reference were not evaluated through equivalent profile-resolution semantics. spacingGravity collapsed to one identical fallback value across all sixteen sides and every subject decade evaluated as NaN.",
      materiality: "the defect changed formal hard-fail labels and moved the aggregate trait pass rate across a frozen threshold, so it is material rather than cosmetic.",
      whyNotAPass: "a corrected-input remeasurement is neither formal nor unseen. V6 is consumed. The correct conclusion is that the run was semantically invalid and Candidate 2 still requires a valid unseen historical holdout.",
    },
    materiality,
    notClaimed: ["HISTORICAL_HOLDOUT_V6_PASS", "Candidate 2 passed Historical V6",
      "a replacement V6 formal verdict", "any formal generalization evidence for Candidate 2"],
    candidate2EffectiveStatus: {
      candidateId: "Candidate 2", candidateSelectionStatus: "SELECTED", candidateLockStatus: "LOCKED",
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      formalValidationStatus: "HISTORICAL_V6_INVALID",
      calibrationStatus: "FORMAL_VALIDATION_INCOMPLETE",
      coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      engineChangedByThisAdjudication: false,
    },
    adjudicatedAtCommit: git("rev-parse", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  adjudication.adjudicationHash = sha({ set: adjudication.set, runValidity: adjudication.runValidity,
    invalidityClass: adjudication.invalidityClass, materiality });
  writeArtifact("historical-v6-invalidity-adjudication", adjudication,
    { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS1.4 attempt supersession, without overwriting the original ─────────
  const priorReg = readArtifact("formal-validation-attempts", C3D).data;
  const attempts = priorReg.attempts.map((a) => {
    if (a.holdoutId !== "historical-holdout-v6") return { ...a, adjudication: null };
    return { ...a,
      runnerVerdict: a.formalVerdict,
      adjudicatedValidity: "INVALID",
      effectiveFormalVerdict: "HISTORICAL_HOLDOUT_V6_INVALID_RUN",
      effectiveCandidateJudgment: "NOT_ESTABLISHED",
      invalidityClass: "VALIDATION_PROFILE_RESOLUTION_FAILURE",
      adjudicationArtifact: `${DIR}/historical-v6-invalidity-adjudication.json`,
      adjudicationHash: adjudication.adjudicationHash,
      originalEntryPreserved: true,
      originalEntrySha256: sha(a),
      note: `${a.note} The runner verdict is preserved; a superseding adjudication finds the run semantically invalid, so no candidate failure is established.`,
    };
  });
  const v6attempt = attempts.find((a) => a.holdoutId === "historical-holdout-v6");
  gate("originalAttemptEntryPreserved",
    v6attempt.formalVerdict === "HISTORICAL_HOLDOUT_V6_FAIL" && v6attempt.runnerVerdict === "HISTORICAL_HOLDOUT_V6_FAIL",
    "the attempt still records the runner's FAIL; the adjudication is added alongside it, not over it");
  gate("nonV6AttemptsUnchanged",
    attempts.filter((a) => a.holdoutId !== "historical-holdout-v6")
      .every((a, i) => sha({ ...a, adjudication: undefined }) === sha({ ...priorReg.attempts.filter((x) => x.holdoutId !== "historical-holdout-v6")[i] })),
    `${attempts.length - 1} non-V6 attempts carried forward byte-for-byte`);
  gate("bothVerdictsVisibleOnTheV6Attempt",
    v6attempt.runnerVerdict && v6attempt.adjudicatedValidity && v6attempt.effectiveCandidateJudgment,
    `runnerVerdict ${v6attempt.runnerVerdict} · adjudicatedValidity ${v6attempt.adjudicatedValidity} · effectiveCandidateJudgment ${v6attempt.effectiveCandidateJudgment}`);

  writeArtifact("historical-v6-attempt-supersession", {
    formalAttemptAdjudicationVersion: "1.0.0",
    supersedes: { artifact: `${C3D}/formal-validation-attempts.json`, notOverwritten: true },
    v6Attempt: v6attempt,
    layerNote: "this is an adjudication LAYER. The original attempt entry, its runner verdict and its result hash are preserved verbatim; the adjudication fields are added beside them.",
    pass: fail.length === 0,
  }, { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("formal-validation-attempts", {
    formalValidationAttemptRegistryVersion: "4.0.0",
    supersedesRegistry: { artifact: `${C3D}/formal-validation-attempts.json`,
      priorAttemptsCarriedUnchanged: priorReg.attempts.length, notOverwritten: true,
      whatChanged: "the Historical V6 attempt gains an adjudication layer. No prior verdict, hash or field is replaced." },
    attempts, attemptCount: attempts.length,
    adjudications: [{ holdoutId: "historical-holdout-v6", runnerVerdict: "HISTORICAL_HOLDOUT_V6_FAIL",
      adjudicatedValidity: "INVALID", effectiveCandidateJudgment: "NOT_ESTABLISHED",
      invalidityClass: "VALIDATION_PROFILE_RESOLUTION_FAILURE" }],
    byCandidate: priorReg.byCandidate,
    openedHoldouts: attempts.filter((a) => a.accessCount > 0).map((a) => a.holdoutId),
    validFormalJudgmentsOfCandidate2: 0,
    validFormalJudgmentsNote: "Historical V6 is the only formal historical set Candidate 2 has been run against, and its run is adjudicated invalid. Candidate 2 therefore has no valid formal historical judgment.",
    recordedAtCommit: git("rev-parse", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  }, { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── preflight artifact ───────────────────────────────────────────────────
  const HOLD = { "historical-holdout-v3": 1, "historical-holdout-v4": 1, "historical-holdout-v5": 1,
    "historical-holdout-v6": 1, "synthetic-stress-holdout-v2": 0 };
  const holdoutRows = Object.entries(HOLD).map(([set, expect]) => ({ set, expected: expect,
    accessCount: setAccessCount(set),
    runnerVerdict: set === "historical-holdout-v6" ? origVerdict.formalVerdict : (expect ? "FAIL" : "NOT_OPENED"),
    adjudicatedValidity: set === "historical-holdout-v6" ? "INVALID" : (expect ? "VALID" : null) }));
  gate("holdoutAccessCountsExact", holdoutRows.every((r) => r.accessCount === r.expected),
    holdoutRows.map((r) => `${r.set} ${r.accessCount}`).join(" · "));

  const preflight = { phase6c4d0PreflightVersion: "1.0.0", phase: "6C4D0",
    mode: "VALIDATION_DATA_PLANE_REPAIR_AND_CANDIDATE_2_RECERTIFICATION",
    repository: { branch: git("rev-parse", "--abbrev-ref", "HEAD"), head: git("rev-parse", "HEAD"),
      continuedFrom: "phase-6c4d1-candidate3-generalization-repair",
      whyNewBranch: "the prior branch is named for Candidate 3 generalization repair, which this phase explicitly defers. Its two audit commits are ancestors of this branch and are not discarded.",
      main: git("rev-parse", "main"),
      mainAtProductionBaseline: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd" },
    candidates: preservation, holdouts: holdoutRows, sealStatuses: allSealStatuses(),
    candidateHistoryValid: fail.length === 0,
    holdoutHistoryValid: holdoutRows.every((r) => r.accessCount === r.expected),
    syntheticV2StillSealed: synAccess === 0,
    dataPlaneRepairMayBegin: fail.length === 0,
    gatesPassed: fail.length === 0, failedGates: fail };
  preflight.preflightHash = sha({ c: preservation, h: holdoutRows, adj: adjudication.adjudicationHash });
  writeArtifact("phase6c4d0-preflight", preflight,
    { generationCommand: "npm run d0:adjudicate", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n  adjudication: ${adjudication.effectiveFormalVerdict} · ${adjudication.invalidityClass}`);
  console.log(`  candidate failure established: ${adjudication.candidateFailureEstablished}`);
  console.log(`  Candidate 2 effective: ${adjudication.candidate2EffectiveStatus.calibrationStatus} / ${adjudication.candidate2EffectiveStatus.formalValidationStatus}`);
  console.log(`\nADJUDICATION: ${fail.length === 0 ? "ISSUED — data-plane repair may begin" : `FAIL (${fail.join(", ")})`}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
