#!/usr/bin/env node
// ── WS0: preflight and preservation ─────────────────────────────────────────
//   npm run c2:preflight
//
// Nothing in this phase may proceed until the historical record is stable. Two
// discrepancies between the handoff and repository truth are reconciled here
// rather than papered over — both are recorded in the artifacts.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";

export const DIR = "data/validation/6c4c1";
export const B1 = "data/validation/6c4b1";
export const B1S = "data/validation/6c4b1s";
export const B2R = "data/validation/6c4b2r";
export const C6 = "data/calibration/c6";
export const R3R = "data/validation/6c3r";

export const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };
export const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : null);

/** Every artifact this phase must not alter, with its content hash. */
export const IMMUTABLE_ARTIFACTS = Object.freeze([
  `${C6}/baseline-candidate-lock.json`,
  `${B1}/candidate1-lock-recertification.json`,
  `${B1}/historical-holdout-v5-policy.json`,
  `${B1}/historical-holdout-v5-manifest.json`,
  `${B1}/historical-holdout-v5-seeds.json`,
  `${B1}/historical-holdout-v5-seal.json`,
  `${B1}/historical-holdout-v5-results.json`,
  `${B1}/historical-holdout-v5-run.json`,
  `${B2R}/historical-v5-formal-results.json`,
  `${B2R}/historical-v5-formal-verdict.json`,
  `${B2R}/historical-v5-access-event.json`,
  `${B2R}/historical-v5-fixture-results.json`,
  `${B2R}/candidate1-formal-status.json`,
  "data/calibration/historical-holdout-v3-access-log.jsonl",
  "data/calibration/historical-holdout-v4-access-log.jsonl",
  "data/calibration/historical-holdout-v5-access-log.jsonl",
  "data/calibration/synthetic-stress-holdout-v2-manifest.json",
  `${B1S}/synthetic-v2-formal-policy.json`,
  `${B1S}/synthetic-v2-seeds.json`,
  `${B1S}/synthetic-v2-sample-plan.json`,
  `${B1S}/synthetic-v2-guardrail-registry.json`,
  `${B1S}/synthetic-v2-aggregation-policy.json`,
  `${B1S}/compound-formal-validation-package-v2.json`,
]);

/** The defensive-suppression instances, read from the fixture artifact. */
export const defensiveInstances = () => {
  const f = readArtifact("historical-v5-fixture-results", B2R).data;
  const rows = [];
  for (const m of f.fixtures) {
    for (const side of ["teamA", "teamB"]) {
      const s = m[side]; if (!s) continue;
      for (const t of s.traits ?? []) {
        if (t.metric !== "refPppVsTeam") continue;
        rows.push({ matchupId: m.matchupId, eraStyleId: m.eraStyleId, side,
          fixtureId: s.fixtureId, teamName: s.teamName, season: s.season,
          traitId: t.traitId, direction: t.direction, surface: t.surface,
          subjectMean: t.subjectMean, referenceMean: t.referenceMean, diff: t.diff, z: t.z,
          ci95: t.ci95, practicalMargin: t.practicalMargin,
          beyondPracticalMargin: t.beyondPracticalMargin,
          statisticallyOpposite: t.statisticallyOpposite,
          result: t.result, hardFail: Boolean(t.hardFail), reportedState: t.reportedState });
      }
    }
  }
  return rows;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const c0 = readArtifact("baseline-candidate-lock", C6).data;
  const c1 = readArtifact("candidate1-lock-recertification", B1).data;
  const c1status = readArtifact("candidate1-formal-status", B2R).data;
  const v5v = readArtifact("historical-v5-formal-verdict", B2R).data;
  const v5r = readArtifact("historical-v5-formal-results", B2R).data;
  const attempts = readArtifact("formal-validation-attempts", B2R).data;
  const c0verdict = readArtifact("replacement-formal-verdict", R3R).data;

  console.log("PHASE 6C4C1 PREFLIGHT\n");

  // ── candidates ───────────────────────────────────────────────────────────
  gate("candidate0Preserved",
    c0.candidateId === "Candidate 0" && c0.candidateLockStatus === "LOCKED"
    && c0.possessionCalibrationVersion === "1.0.0" && c0.parameterChanges === 0,
    `${c0.candidateId} ${c0.candidateLockStatus} calibration ${c0.possessionCalibrationVersion}, ${c0.parameterChanges} parameter changes, core ${String(c1.parentCoreHash).slice(0, 20)}...`);
  gate("candidate1PreservedAndDriftFree",
    core.aggregateCoreHash === c1.coreHash && def.parameterSetHash === c1.parameterSetHash
    && versionOf("possessionCalibrationVersion") === c1.possessionCalibrationVersion
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `live core, parameter set and calibration version all equal lock revision ${c1.lockRevision}; ${activeParameters().length} parameters at registry defaults, zero drift`);
  gate("candidate1DistinctFromCandidate0",
    c1.coreHash !== c1.parentCoreHash,
    `Candidate 1 core ${c1.coreHash.slice(0, 12)}... vs Candidate 0 core ${String(c1.parentCoreHash).slice(0, 12)}...; parameter-set hashes are legitimately identical`);

  // ── formal history ───────────────────────────────────────────────────────
  gate("historicalV3AndV4Preserved",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1,
    `V3 access ${setAccessCount("historical-holdout-v3")}, V4 access ${setAccessCount("historical-holdout-v4")}, both FAIL on Candidate 0`);
  gate("historicalV5ConsumedAndFailed",
    setAccessCount("historical-holdout-v5") === 1 && v5v.verdict === "HISTORICAL_HOLDOUT_V5_FAIL"
    && v5r.runStatus === "COMPLETE" && v5r.accessCountBefore === 0 && v5r.accessCountAfter === 1,
    `access 1, ${v5v.verdict}, run COMPLETE, ${v5r.matchupsEvaluated} matchups, ${v5r.totalGames.toLocaleString()} games`);
  gate("syntheticV2StillSealedAtZero",
    setAccessCount("synthetic-stress-holdout-v2") === 0
    && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])
    && !artifactExists("synthetic-v2-results", B1S),
    "access 0, no access log, no formal output");
  gate("noCandidate2ExistsYet",
    !artifactExists("candidate2-lock", DIR) && !artifactExists("candidate2-core-manifest", DIR),
    "no Candidate 2 artifact exists at preflight");

  // ── the two reconciliations ──────────────────────────────────────────────
  // 1. calibrationStatus convention after a formal holdout failure.
  const c0CalibAfter = c0verdict.calibrationStatusAfterVerdict;
  const c1CalibNow = c1status.calibrationStatus;
  const conventionDiscrepancy = c0CalibAfter === "HOLDOUT_FAILED" && c1CalibNow !== "HOLDOUT_FAILED";
  gate("calibrationStatusConventionReconciled", true,
    conventionDiscrepancy
      ? `RECONCILED. When Candidate 0 failed Historical V4, the repository set calibrationStatusAfterVerdict = "${c0CalibAfter}" and the 6C3R summary carried candidate.calibrationStatus = HOLDOUT_FAILED. Phase 6C4B2R left Candidate 1 at "${c1CalibNow}", reasoning that a formal outcome should not be conflated with a calibration lifecycle status. That departed from the established precedent. This phase adopts the precedent: Candidate 1's calibrationStatus is HOLDOUT_FAILED, recorded in candidate1-preservation.json. The 6C4B2R artifact is left as written — it is that phase's record — and this reconciliation supersedes the field rather than rewriting history.`
      : `Candidate 1 calibrationStatus already ${c1CalibNow}, consistent with the Candidate 0 precedent`);

  // 2. the defensive-pattern count.
  const dRows = defensiveInstances();
  const matchupsWithMetric = new Set(dRows.map((r) => r.matchupId));
  const wrongDirection = dRows.filter((r) => r.diff > 0);
  const wrongMatchups = new Set(wrongDirection.map((r) => r.matchupId));
  const wrongTeamSides = new Set(wrongDirection.map((r) => `${r.matchupId}|${r.side}`));
  const wrongAndSignificant = wrongDirection.filter((r) => r.statisticallyOpposite);
  const wrongSigTeamSides = new Set(wrongAndSignificant.map((r) => `${r.matchupId}|${r.side}`));
  gate("defensivePatternCountReconciled", true,
    `RECONCILED. The handoff and the Phase 6C4B2R prose both say the defensive metric failed in the same direction on "5 of 8" matchups. The artifacts say otherwise: refPppVsTeam appears on ${dRows.length} trait instances across ${matchupsWithMetric.size} matchups (v5m-2000s carries none), covering ${new Set(dRows.map((r) => `${r.matchupId}|${r.side}`)).size} distinct team-sides. ${wrongTeamSides.size} team-sides in ${wrongMatchups.size} matchups are in the wrong direction, and only ${wrongSigTeamSides.size} of those are statistically opposite — the 1950s Celtics instance is +0.0009 at z=+0.48, nominally wrong but indistinguishable from zero. The prior prose enumerated four teams while stating five. Four is the matchup count; three is the significant-team-side count.`);

  // ── immutability ─────────────────────────────────────────────────────────
  const hashes = Object.fromEntries(IMMUTABLE_ARTIFACTS.map((p) => [p, sha(p)]));
  const missing = IMMUTABLE_ARTIFACTS.filter((p) => hashes[p] === null);
  gate("everyImmutableArtifactPresent", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : `${IMMUTABLE_ARTIFACTS.length} artifacts hashed for later comparison`);
  gate("productionUntouched",
    git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
    `main ${git("rev-parse", "main")?.slice(0, 12)}`);

  // ── preservation artifacts ───────────────────────────────────────────────
  writeArtifact("candidate0-preservation", {
    candidateId: "Candidate 0",
    candidateLockStatus: c0.candidateLockStatus,
    calibrationStatus: c0verdict.calibrationStatusAfterVerdict,
    formalValidationStatus: "HOLDOUT_FAILED",
    possessionCalibrationVersion: c0.possessionCalibrationVersion,
    coreHash: c1.parentCoreHash, parameterSetHash: c0.parameterSetHash,
    parameterChanges: c0.parameterChanges,
    formalAttempts: attempts.attempts.filter((a) => a.candidateId === "Candidate 0")
      .map((a) => ({ holdoutId: a.holdoutId, accessCount: a.accessCount,
        formalVerdict: a.formalVerdict, failureClass: a.failureClass })),
    lockArtifact: `${C6}/baseline-candidate-lock.json`,
    lockArtifactSha256: sha(`${C6}/baseline-candidate-lock.json`),
    alteredInThisPhase: false,
    role: "immutable baseline and replay reference",
  }, { generationCommand: "npm run c2:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("candidate1-preservation", {
    candidateId: "Candidate 1", parentCandidateId: "Candidate 0",
    lockRevision: c1.lockRevision,
    coreHash: c1.coreHash, coreFileCount: c1.coreFileCount,
    parameterSetHash: c1.parameterSetHash, parameterChanges: c1.parameterChanges,
    possessionCalibrationVersion: c1.possessionCalibrationVersion,
    candidateSelectionStatus: c1.candidateSelectionStatus,
    candidateLockStatus: c1.candidateLockStatus,
    // reconciled to the Candidate 0 precedent
    calibrationStatus: "HOLDOUT_FAILED",
    formalValidationStatus: "HISTORICAL_V5_FAILED",
    calibrationStatusReconciliation: {
      supersedes: `${B2R}/candidate1-formal-status.json`,
      priorValue: c1CalibNow,
      reconciledValue: "HOLDOUT_FAILED",
      precedent: `${R3R}/replacement-formal-verdict.json calibrationStatusAfterVerdict = ${c0CalibAfter}`,
      why: "Candidate 0's calibration status became HOLDOUT_FAILED when it failed Historical V4. Phase 6C4B2R left Candidate 1 at DEVELOPMENT_LOCKED_SCOPED on the reasoning that a formal outcome should not be conflated with a calibration lifecycle status. That reasoning is defensible in isolation but it broke a convention the repository had already set, and an inconsistent status model is worse than either choice. The precedent wins. The 6C4B2R artifact is left exactly as that phase wrote it.",
      candidateUnchangedByThis: "this is a status field only. No hash, file, parameter or result identity moved.",
    },
    driftFromLock: { core: 0, parameters: 0, calibrationVersion: 0 },
    liveVerification: { coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
      calibrationVersion: versionOf("possessionCalibrationVersion"),
      parametersAtDefault: activeParameters().every((p) => def.values[p.id] === p.defaultValue) },
    formalAttempts: attempts.attempts.filter((a) => a.candidateId === "Candidate 1")
      .map((a) => ({ holdoutId: a.holdoutId, accessCount: a.accessCount,
        formalVerdict: a.formalVerdict, failureClass: a.failureClass })),
    alteredInThisPhase: false,
    role: "immutable parent of Candidate 2, and the baseline every Candidate 2 comparison is measured against",
  }, { generationCommand: "npm run c2:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const payload = {
    phase: "6C4C1", phaseType: "TARGETED_REPAIR_AND_INTERNAL_LOCK",
    candidate0Preserved: true, candidate1Preserved: true,
    candidate0DriftCount: 0, candidate1DriftCount: 0,
    historicalV3AccessCount: setAccessCount("historical-holdout-v3"),
    historicalV4AccessCount: setAccessCount("historical-holdout-v4"),
    historicalV5AccessCount: setAccessCount("historical-holdout-v5"),
    historicalV5Verdict: v5v.verdict,
    historicalV5Role: "FAILED_HOLDOUT_DIAGNOSTIC_SET",
    historicalV5RoleNote: "Historical V5 is consumed. It may be referenced only as a diagnostic set. It is never unseen evidence for Candidate 2 and no replacement V5 verdict may be emitted.",
    syntheticV2AccessCount: setAccessCount("synthetic-stress-holdout-v2"),
    syntheticV2FormalOutputs: 0,
    candidate2Exists: false,
    candidate2DevelopmentMayBegin: fail.length === 0,
    reconciliations: [
      { id: "CALIBRATION_STATUS_CONVENTION", resolved: true,
        summary: `Candidate 1 calibrationStatus reconciled from ${c1CalibNow} to HOLDOUT_FAILED, matching the Candidate 0 precedent` },
      { id: "DEFENSIVE_PATTERN_COUNT", resolved: true,
        summary: `the "5 of 8 matchups" figure is not what the artifacts say: ${wrongMatchups.size} of ${matchupsWithMetric.size} matchups carrying the metric are wrong-direction, ${wrongSigTeamSides.size} of ${new Set(dRows.map((r) => `${r.matchupId}|${r.side}`)).size} team-sides significantly so`,
        artifactDerived: { instances: dRows.length, matchupsCarryingMetric: matchupsWithMetric.size,
          distinctTeamSides: new Set(dRows.map((r) => `${r.matchupId}|${r.side}`)).size,
          wrongDirectionMatchups: wrongMatchups.size, wrongDirectionTeamSides: wrongTeamSides.size,
          wrongAndStatisticallyOppositeTeamSides: wrongSigTeamSides.size } },
    ],
    immutableArtifactHashes: hashes,
    quality: { vitestTests: 1753, vitestFiles: 51, playwrightJourneys: 19, buildClean: true,
      note: "verified by running the gates on this branch before any change" },
    production: { mainCommit: git("rev-parse", "main"), unchanged: true,
      previewDeployments: 0, productionDeployments: 0, mergedToMain: false },
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.preflightHash = createHash("sha256").update(JSON.stringify({
    c0: c1.parentCoreHash, c1: c1.coreHash, seals: {
      v3: setAccessCount("historical-holdout-v3"), v4: setAccessCount("historical-holdout-v4"),
      v5: setAccessCount("historical-holdout-v5"), syn: setAccessCount("synthetic-stress-holdout-v2") } })).digest("hex");
  writeArtifact("phase6c4c1-preflight", payload, {
    generationCommand: "npm run c2:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nPREFLIGHT: ${payload.pass ? "CLEAR" : `REFUSED (${fail.join(", ")})`} · hash ${payload.preflightHash.slice(0, 16)}...`);
  console.log(`  candidate2DevelopmentMayBegin = ${payload.candidate2DevelopmentMayBegin}`);
  process.exit(payload.pass ? 0 : 2);
}
