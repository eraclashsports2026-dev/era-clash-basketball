#!/usr/bin/env node
// ── Phase 6C3R preflight: preserve V3, classify the defect, gate the phase ──
//   npm run validation:6c3r:preflight
//
// Three jobs, none of which touches a V3 artifact:
//   1. Verify the V3 formal failure is intact and immutable, and hash it.
//   2. Classify the V3 failure from EXISTING artifacts only — Candidate 0 is
//      never re-run on a V3 fixture, and the FAIL verdict is never revised.
//   3. Establish the validation-attempt status model: candidate lock status and
//      validation-attempt status are different facts, and conflating them is
//      the exact status-model defect Phase 6C2C6 repaired.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { setAccessCount, allSealStatuses } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest, coreClosure } from "./preflight.mjs";
import { versionOf } from "../../src/versions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, manifestHash } from "../../data/calibration/sets-v3.mjs";

export const ARTIFACT_DIR_6C3R = "data/validation/6c3r";
const R = (n) => readArtifact(n, ARTIFACT_DIR_6C3);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "OK  " : "FAIL"}  ${name}\n        ${detail}`); return pass; };

  const hist = R("historical-holdout-results");
  const verd = R("formal-holdout-verdict");
  const core = R("candidate-core-manifest");
  const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6);
  const def = defaultRuntimeParameterSet();
  const live = buildCoreManifest();

  console.log("PHASE 6C3R PREFLIGHT\n");
  console.log("PART 1 — V3 FORMAL FAILURE INTACT\n");
  gate("v3OpenedExactlyOnce", setAccessCount("historical-holdout-v3") === 1 && hist.data.accessCountBefore === 0 && hist.data.accessCountAfter === 1,
    `access count ${setAccessCount("historical-holdout-v3")}, recorded 0 -> 1`);
  gate("v3VerdictIsFail", hist.data.verdict === "HISTORICAL_HOLDOUT_FAIL" && verd.data.combinedVerdict === "HISTORICAL_HOLDOUT_FAILED",
    `${hist.data.verdict} / ${verd.data.combinedVerdict} / calibrationStatus ${verd.data.calibrationStatusAfterVerdict}`);
  gate("v3RanTheCurrentCandidate",
    hist.data.identity.coreHash === live.aggregateCoreHash && hist.data.identity.parameterSetHash === def.parameterSetHash,
    `V3 ran core ${hist.data.identity.coreHash.slice(0, 16)}... and set ${hist.data.identity.parameterSetHash.slice(0, 16)}..., both equal to the live candidate`);
  gate("v3QuantitativeResultIntact",
    hist.data.internalBaseline.mean === 0.04338 && hist.data.holdoutComposite === 0.04339 && hist.data.holdoutToInternalRatio === 1.00026,
    `internal ${hist.data.internalBaseline.mean} -> holdout ${hist.data.holdoutComposite}, ratio ${hist.data.holdoutToInternalRatio}`);
  const failedFixtures = hist.data.perFixture.filter((f) => !f.pass).map((f) => f.fixtureId);
  gate("v3FailedOnIdentityOnly",
    JSON.stringify(Object.entries(hist.data.gates).filter(([, v]) => !v).map(([k]) => k)) === JSON.stringify(["identityDirectionallyPreserved", "everyFixturePasses"])
      && failedFixtures.length === 3,
    `failed gates: identityDirectionallyPreserved, everyFixturePasses · fixtures: ${failedFixtures.join(", ")}`);
  gate("v3FailuresAllMirrorAmbiguous",
    verd.data.diagnosis.traitsFailedOnMirrorAmbiguousMetrics === 3 && verd.data.diagnosis.traitsFailedOnValidMetrics === 0,
    `${verd.data.diagnosis.traitsFailedOnMirrorAmbiguousMetrics} mirror-ambiguous, ${verd.data.diagnosis.traitsFailedOnValidMetrics} on decidable metrics, max |PPP-oppPPP| ${verd.data.diagnosis.maxPointsPerPossessionGapAcrossFixtures}`);

  console.log("\nPART 2 — CANDIDATE IMMUTABILITY\n");
  gate("candidateStillLocked", lock.data.candidateLockStatus === "LOCKED" && lock.data.candidateSelectionStatus === "SELECTED",
    `${lock.data.candidateId} · ${lock.data.candidateSelectionStatus} · ${lock.data.candidateLockStatus}`);
  gate("calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === "1.0.0", versionOf("possessionCalibrationVersion"));
  gate("coreHashUnchanged", live.aggregateCoreHash === core.data.aggregateCoreHash,
    `${live.aggregateCoreHash} (${live.fileCount} files)`);
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  gate("zeroParameterDrift", drift.length === 0, `${activeParameters().length} active parameters, ${drift.length} drifted`);
  gate("validationVersionsOutsideCore", !coreClosure().files.includes("src/v3/calibration/validationVersions.js"),
    "the new validation-version registry is not in the candidate core closure, so registering it cannot mutate the core");

  console.log("\nPART 3 — SYNTHETIC V2 STILL SEALED\n");
  gate("syntheticV2Sealed", setAccessCount("synthetic-stress-holdout-v2") === 0,
    `access count ${setAccessCount("synthetic-stress-holdout-v2")}`);
  const sealedIds = [...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)];
  const leaks = [];
  for (const id of SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)) {
    for (const d of ["data/calibration/c5", "data/calibration/c6", ".cache/calibration", "data/validation"]) {
      const out = git("grep", "-l", "-F", id, "HEAD", "--", d);
      if (out) leaks.push(`${id} in ${out.replace(/\n/g, ", ")}`);
    }
  }
  gate("noSyntheticMemberInCommittedOutput", leaks.length === 0, leaks.length ? leaks.join("; ") : "0 of 16 members in any committed simulation output");
  gate("v4SealRegisteredAndUnread", setAccessCount("historical-holdout-v4") === 0, `historical-holdout-v4 access count ${setAccessCount("historical-holdout-v4")}`);

  // ── V3 preservation manifest ───────────────────────────────────────────────
  const preservation = {
    holdout: "historical-holdout-v3",
    state: "CONSUMED",
    accessCount: setAccessCount("historical-holdout-v3"),
    candidateCommit: hist.data.identity.candidateCommit,
    candidateCoreHash: hist.data.identity.coreHash,
    parameterSetHash: hist.data.identity.parameterSetHash,
    holdoutManifestHash: hist.data.identity.holdoutManifestHash,
    acceptancePolicyHash: hist.data.identity.acceptancePolicyHash,
    scopePolicyHash: hist.data.identity.scopePolicyHash,
    seedBlock: hist.data.identity.seedBlock,
    accessEvent: hist.data.accessEvent,
    runHash: hist.data.runHash,
    resultsFileSha256: sha("data/validation/6c3/historical-holdout-results.json"),
    verdictFileSha256: sha("data/validation/6c3/formal-holdout-verdict.json"),
    accessLogSha256: sha("data/calibration/historical-holdout-v3-access-log.jsonl"),
    formalVerdict: hist.data.verdict,
    combinedVerdict: verd.data.combinedVerdict,
    verdictHash: verd.data.verdictHash,
    failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE",
    neverRescored: true,
    mutationRule: "Any change to these hashes invalidates Phase 6C3R. The V3 FAIL is a permanent, valid record of a failed validation DESIGN, and erasing it would erase the reason V4 exists.",
  };

  // ── failure diagnosis, from existing artifacts only ────────────────────────
  const d = verd.data.diagnosis;
  const diagnosis = {
    formalVerdict: "HISTORICAL_HOLDOUT_FAIL",
    candidatePerformanceFailureEstablished: false,
    validationSurfaceFailureEstablished: true,
    failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE",
    replacementValidationRequired: true,
    evidenceBasis: "Existing Phase 6C3 artifacts only. Candidate 0 was not re-run on any V3 fixture, and no revised V3 verdict is computed.",
    surface: {
      design: "Every V3 fixture played a MIRROR of itself — correct for the Tier C share proxy, which describes a season's internal distribution with no opponent target, but fatal for opponent-relative identity claims.",
      algebraicDependence: "With both sides the same roster, pointsPerPossession and opponentPointsPerPossession are the same quantity up to seeded noise.",
      maxSeparationAcrossFixtures: d.maxPointsPerPossessionGapAcrossFixtures,
      contradiction: "ELITE_OFFENSE requires PPP above the reference median while ELITE_DEFENSE requires opponent PPP below it; on a mirror surface these are near-contradictory, and h3-2012-13-heat carried both tags, passing one and failing the other.",
    },
    traits: {
      scored: d.scoredTraits,
      failedOnMirrorAmbiguousMetrics: d.traitsFailedOnMirrorAmbiguousMetrics,
      failedOnObservableMetrics: d.traitsFailedOnValidMetrics,
      mirrorAmbiguousFailures: d.mirrorAmbiguousFailures,
      vocabularyCoverage: "7 of 58 identity traits had a rubric entry; 51 were recorded unscored.",
    },
    whatV3DidEstablish: {
      quantitative: `Internal composite share MAE ${hist.data.internalBaseline.mean}, holdout ${hist.data.holdoutComposite}, ratio ${hist.data.holdoutToInternalRatio} against a frozen gate of ${hist.data.ratioGate}. The calibration did not overfit its own folds.`,
      structural: "32,768 games: zero invariant failures, zero final ties, replay exact everywhere, zero impossible statistics, opportunity concentration in bounds, era rules authoritative, zero catastrophic fixtures.",
    },
    whyTheVerdictRemainsFail: "The frozen policy produced it from a frozen rubric. Re-scoring opened holdout data under a corrected rubric — or reclassifying the FAIL because the failing gate was badly designed — is post-hoc gate movement in the self-serving direction, and it stays refused.",
    whyCandidateZeroRemainsLocked: "The lock records the selection evidence: 84 on-grid alternatives, none surviving family-wise correction. A validation-surface failure is not evidence against the candidate, so it does not unlock it — and it is not evidence FOR it either, which is why a replacement holdout is required rather than a waiver.",
    whyAReplacementHoldoutIsRequired: "historical holdout v3 is consumed at access count 1. A holdout that has been seen cannot measure generalisation again, for this or any candidate, whatever the reason it was opened.",
  };

  // ── validation-attempt registry ────────────────────────────────────────────
  const attempts = {
    formalValidationAttemptRegistryVersion: VALIDATION_VERSIONS.formalValidationAttemptRegistryVersion,
    candidateStatus: {
      candidateId: "Candidate 0",
      candidateSelectionStatus: "SELECTED",
      candidateLockStatus: "LOCKED",
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      parameterChanges: 0,
      parameterSetHash: def.parameterSetHash,
      candidateCoreHash: live.aggregateCoreHash,
    },
    statusModel: "Candidate lock status and validation-attempt status are different facts. Candidate 0 stays LOCKED through a failed validation attempt, because the lock records selection evidence and the attempt records whether a particular measurement design validated it.",
    attempts: [
      {
        attemptId: "attempt-1-historical-v3",
        holdoutVersion: "3.0.0",
        candidateId: "Candidate 0",
        candidateCommit: hist.data.identity.candidateCommit,
        candidateCoreHash: hist.data.identity.coreHash,
        parameterSetHash: hist.data.identity.parameterSetHash,
        policyHash: hist.data.identity.acceptancePolicyHash,
        scopePolicyHash: hist.data.identity.scopePolicyHash,
        seedVersion: hist.data.identity.seedBlock,
        accessEvent: hist.data.accessEvent,
        formalVerdict: "HISTORICAL_HOLDOUT_FAIL",
        failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE",
        createdAt: "phase-6c3",
        completedAt: "phase-6c3",
        supersededBy: "attempt-2-historical-v4 (pending) — supersession as the valid revalidation attempt, never as an erasure of this record",
        immutable: true,
      },
    ],
    replacementValidationStatus: "PENDING",
    syntheticHoldoutV2Status: "SEALED_UNREAD",
  };

  const mayBegin = fail.length === 0;
  const dir = ARTIFACT_DIR_6C3R;
  const common = { generationCommand: "npm run validation:6c3r:preflight", extra: { parameterSetHash: def.parameterSetHash }, dir };
  const w1 = writeArtifact("historical-v3-preservation-manifest", preservation, { ...common, sourceArtifacts: ["data/validation/6c3/historical-holdout-results.json", "data/validation/6c3/formal-holdout-verdict.json"] });
  const w2 = writeArtifact("historical-v3-failure-diagnosis", diagnosis, { ...common, sourceArtifacts: ["data/validation/6c3/formal-holdout-verdict.json"] });
  const w3 = writeArtifact("formal-validation-attempts", attempts, { ...common, sourceArtifacts: ["data/validation/6c3/historical-holdout-results.json"] });
  const w4 = writeArtifact("phase6c3r-preflight", {
    candidateLockValid: !fail.some((f) => /candidate|calibration|parameter|core/i.test(f)),
    candidateCoreUnchanged: live.aggregateCoreHash === core.data.aggregateCoreHash,
    historicalV3Preserved: !fail.some((f) => f.startsWith("v3")),
    syntheticV2StillSealed: setAccessCount("synthetic-stress-holdout-v2") === 0,
    replacementValidationMayBegin: mayBegin,
    failedGates: fail,
    seals: allSealStatuses(),
    validationVersions: VALIDATION_VERSIONS,
    versionRegistryNote: "Validation-attempt version keys live in src/v3/calibration/validationVersions.js, OUTSIDE the candidate core, because src/versions.js is one of the 52 frozen core files and adding keys there would mutate the candidate core that both holdout verdicts hash.",
  }, { ...common, sourceArtifacts: [] });

  console.log(`\n  replacementValidationMayBegin: ${mayBegin}`);
  if (!mayBegin) console.log(`  FAILED: ${fail.join(", ")}`);
  for (const w of [w1, w2, w3, w4]) console.log(`  wrote ${w.path}`);
  process.exit(mayBegin ? 0 : 2);
}
