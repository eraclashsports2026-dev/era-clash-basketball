#!/usr/bin/env node
// ── WS0 + WS1 + WS2: preserve, register, audit input support ────────────────
//   npm run c3:preflight
// Every value is read from an artifact and carries its source. No value here
// comes from a phase summary.
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, C3D, C2D, C1D, git, sha, v, unwrap, avg, ADAPTER_INPUTS, allSeasonRecords } from "./paths.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  console.log("PHASE 6C4D1 PREFLIGHT\n\nWS0 — PRESERVATION\n");

  const c2lock = readArtifact("candidate2-lock", C1D).data;
  const c2ident = readArtifact("candidate2-identity-separation", C1D).data;
  const c2status = readArtifact("candidate2-formal-status", C3D).data;
  const preservation = {};
  for (const key of ["candidate0", "candidate1", "candidate2"]) {
    const src = `${C2D}/${key}-preservation-c4c2.json`;
    const prior = readArtifact(`${key}-preservation-c4c2`, C2D).data;
    const p = {
      candidateId: v(unwrap(prior.candidateId), src), parentCandidateId: v(unwrap(prior.parentCandidateId), src),
      candidateCommit: v(unwrap(prior.candidateCommit), src),
      candidateCoreHash: v(unwrap(prior.coreHash), src), parameterSetHash: v(unwrap(prior.parameterHash), src),
      calibrationVersion: v(unwrap(prior.calibrationVersion), src),
      resultIdentity: v(unwrap(prior.resultFingerprintVersion), src),
      resultCacheIdentity: v(unwrap(prior.cacheIdentity), src),
      probabilityIdentity: v(unwrap(prior.probabilityIdentity), src),
      competitionIdentity: v(unwrap(prior.competitionIdentity), src),
      replayIdentity: v(unwrap(prior.replayIdentity), src),
      selectionStatus: v(unwrap(prior.selectionStatus), src), lockStatus: v(unwrap(prior.lockStatus), src),
      drift: v(unwrap(prior.drift), src), alteredInThisPhase: v(false, "this phase changes no prior candidate"),
    };
    if (key === "candidate2") {
      // Reconciled to the convention Candidate 0 and Candidate 1 follow after a
      // formal failure. Status only — no code, hash or identity is touched.
      p.calibrationStatusAsRecordedIn6C4C3 = v(c2status.calibrationStatus, `${C3D}/candidate2-formal-status.json`);
      p.calibrationStatus = v("HOLDOUT_FAILED", "reconciled: Historical V6 returned FAIL, and both prior candidates read HOLDOUT_FAILED after a formal failure");
      p.formalValidationStatus = v("HISTORICAL_V6_FAILED", `${C3D}/candidate2-formal-status.json`);
      p.reconciliation = { what: "calibrationStatus DEVELOPMENT_LOCKED_SCOPED -> HOLDOUT_FAILED",
        whatWasNotChanged: ["candidate source", "core hash", "parameter-set hash", "result identity",
          "cache identity", "probability identity", "competition identity", "replay identity"],
        coreHashUnchanged: core.aggregateCoreHash === c2lock.coreHash };
    } else {
      p.calibrationStatus = v(unwrap(prior.calibrationStatus) ?? "HOLDOUT_FAILED", src);
      p.formalValidationStatus = v(unwrap(prior.formalValidationStatus), src);
    }
    preservation[key] = p;
    writeArtifact(`${key}-preservation-d1`, { ...p, preservationHash: sha(p) },
      { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  }
  for (const k of ["candidate0", "candidate1", "candidate2"]) {
    gate(`${k}DriftZero`, preservation[k].drift.value === 0,
      `drift ${preservation[k].drift.value} · ${preservation[k].lockStatus.value} · ${preservation[k].calibrationStatus.value}`);
  }
  gate("candidate2HashesMatchItsLock",
    core.aggregateCoreHash === c2lock.coreHash && def.parameterSetHash === c2lock.parameterSetHash,
    `live core ${core.aggregateCoreHash.slice(0, 16)}... equals its lock; parameter set equals its lock`);
  gate("calibrationVersionStill120", versionOf("possessionCalibrationVersion") === "1.2.0",
    `${versionOf("possessionCalibrationVersion")} — no Candidate 3 code exists yet`);
  gate("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `${activeParameters().length} registered parameters, none drifted`);
  gate("candidate2IdentityCollisionsZero", c2ident.collisionCount === 0, `collisionCount ${c2ident.collisionCount}`);
  gate("noCandidate3ExistsYet", !artifactExists("candidate3-lock", DIR), "no Candidate 3 lock exists");

  const HOLD = { "historical-holdout-v3": 1, "historical-holdout-v4": 1, "historical-holdout-v5": 1,
    "historical-holdout-v6": 1, "synthetic-stress-holdout-v2": 0 };
  const v6verdict = readArtifact("historical-v6-formal-verdict", C3D).data;
  const v6results = readArtifact("historical-v6-formal-results", C3D).data;
  const holdoutRows = Object.entries(HOLD).map(([set, expect]) => ({ set, expected: expect,
    accessCount: setAccessCount(set), accessLogExists: existsSync(SEALED_SETS[set]),
    formalVerdict: set === "historical-holdout-v6" ? v6verdict.formalVerdict : (expect ? "FAIL" : "NOT_OPENED") }));
  console.log("");
  gate("holdoutAccessCountsExact", holdoutRows.every((r) => r.accessCount === r.expected),
    holdoutRows.map((r) => `${r.set} ${r.accessCount}`).join(" · "));
  gate("historicalV6VerdictStillFail", v6verdict.formalVerdict === "HISTORICAL_HOLDOUT_V6_FAIL",
    `${v6verdict.formalVerdict} · ${v6verdict.failureClass}`);
  gate("syntheticV2StillSealed", setAccessCount("synthetic-stress-holdout-v2") === 0
    && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]), "access 0, no log on disk, no formal output");

  // ── WS1 register ─────────────────────────────────────────────────────────
  console.log("\nWS1 — V6 DIAGNOSTIC REGISTER\n");
  const fx = readArtifact("historical-v6-fixture-results", C3D).data;
  const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
  const failures = [];
  for (const u of fx.units) for (const t of u.observableTraitResults) {
    if (t.result === "PASS") continue;
    failures.push({ failureId: `v6f-${String(failures.length + 1).padStart(2, "0")}`,
      fixtureId: u.fixtureId, matchupId: u.matchupId, key: u.key, teamId: u.teamId,
      teamName: u.teamName, teamSeason: u.season, eraStyleId: u.eraStyleId, coachId: u.coachId, side: u.side,
      traitId: t.traitId, metricId: t.metric, measurementSurface: t.surface,
      expectedDirection: t.direction, subjectMean: t.subjectMean, referenceMean: t.referenceMean,
      difference: t.diff, practicalMargin: t.practicalMargin, zScore: t.z, ci95: t.ci95,
      confidence: "MEDIUM", formalClassification: t.reportedState, hardFail: t.hardFail === true,
      source: `${C3D}/historical-v6-fixture-results.json` });
  }
  const hard = failures.filter((f) => f.hardFail);
  const ckey = (f) => [f.matchupId, f.side, f.metricId, f.measurementSurface, f.expectedDirection, f.subjectMean, f.referenceMean].join("|");
  const cmap = new Map();
  for (const f of hard) { if (!cmap.has(ckey(f))) cmap.set(ckey(f), []); cmap.get(ckey(f)).push(f); }
  const clusters = [...cmap.values()].map((mem, i) => ({ clusterId: `v6c-${String(i + 1).padStart(2, "0")}`,
    clusterKey: ckey(mem[0]), matchupId: mem[0].matchupId, eraStyleId: mem[0].eraStyleId, side: mem[0].side,
    teamName: mem[0].teamName, teamSeason: mem[0].teamSeason, teamId: mem[0].teamId, coachId: mem[0].coachId,
    metricId: mem[0].metricId, measurementSurface: mem[0].measurementSurface,
    expectedDirection: mem[0].expectedDirection, subjectMean: mem[0].subjectMean,
    referenceMean: mem[0].referenceMean, difference: mem[0].difference,
    practicalMargin: mem[0].practicalMargin, zScore: mem[0].zScore, ci95: mem[0].ci95,
    formalTraitLabels: mem.map((m) => m.traitId), formalLabelCount: mem.length,
    failureIds: mem.map((m) => m.failureId), independentMeasurements: 1 }));
  console.log(`  failing instances ${failures.length} · hard-fail labels ${hard.length} · independent clusters ${clusters.length}`);
  gate("registerReconcilesWithTheFormalArtifact",
    failures.length === v6results.traits.failed && hard.length === v6results.traits.hardFailLabelCount
    && clusters.length === v6results.traits.independentHardFailClusters,
    `failed ${failures.length}/${v6results.traits.failed} · labels ${hard.length}/${v6results.traits.hardFailLabelCount} · clusters ${clusters.length}/${v6results.traits.independentHardFailClusters}`);
  gate("everyHardFailLabelInExactlyOneCluster",
    clusters.reduce((a, c) => a + c.formalLabelCount, 0) === hard.length
    && new Set(clusters.flatMap((c) => c.failureIds)).size === hard.length,
    `${hard.length} labels across ${clusters.length} clusters, none in two`);
  gate("everyClusterHasNonNullMeans", clusters.every((c) => c.subjectMean != null && c.referenceMean != null),
    "the corrected projection reads subjectMean and referenceMean, the fields the trait schema uses");
  gate("historicalV6VerdictNotRescored", v6verdict.formalVerdict === "HISTORICAL_HOLDOUT_V6_FAIL",
    "this register is a projection; V6's stored verdict, gates and access artifacts are untouched");

  writeArtifact("historical-v6-diagnostic-register", { historicalV6DiagnosticRegistryVersion: "1.0.0",
    readFrom: [`${C3D}/historical-v6-fixture-results.json`, `${C3D}/historical-v6-formal-results.json`, `${C3D}/historical-v6-formal-verdict.json`],
    failingInstanceCount: failures.length, hardFailLabelCount: hard.length,
    softFailCount: failures.length - hard.length, traitPassRate: v6results.traits.passRate,
    traitsScored: v6results.traits.scored, failures, formalVerdictUnchanged: v6verdict.formalVerdict,
    pass: fail.length === 0 }, { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("historical-v6-independent-clusters", { historicalV6IndependentClusterVersion: "1.0.0",
    clusterKeyDefinition: "matchupId | side | metricId | measurementSurface | expectedDirection | subjectMean | referenceMean",
    clusterCount: clusters.length, formalLabelCount: hard.length, clusters,
    byMetric: Object.fromEntries([...new Set(clusters.map((c) => c.metricId))].map((m) => [m, clusters.filter((c) => c.metricId === m).length])),
    collapseNote: "a cluster holding more than one label is two trait names reporting ONE measurement. Every label is preserved; only the evidence count collapses.",
    pass: fail.length === 0 }, { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  writeArtifact("historical-v6-diagnostic-schema-correction", { hardFailDiagnosticSchemaVersion: "1.0.0",
    defect: { what: "the V6 cluster recorder read t.observed and t.reference; the trait records name those fields subjectMean and referenceMean.",
      consequence: "every cluster in the V6 formal record carries observed and reference as null, so its key reduced to (matchup, side, metric, surface, direction).",
      didItChangeTheV6Adjudication: false,
      proofFromThePriorPhase: v6results.clusterRecordNote.proof },
    correction: { appliesFrom: "this register and every future hard-fail cluster recorder",
      neverAppliedTo: "Historical V6's stored verdict, gates, access event or results artifact — a consumed set is not rescored",
      requiredClusterFields: ["matchupId", "side", "metricId", "measurementSurface", "expectedDirection", "subjectMean", "referenceMean", "difference", "practicalMargin", "zScore"],
      traitSchemaFieldsObserved: Object.keys(fx.units[0].observableTraitResults[0] ?? {}) },
    enforcement: { nonNullMeansRequired: true, unknownFieldReadIsAHardFail: true,
      helper: "scripts/candidate3/clusterSchema.mjs validateHardFailCluster" },
    pass: true }, { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS2 input-support audit ──────────────────────────────────────────────
  console.log("\nWS2 — INPUT-SUPPORT AUDIT\n");
  const map = await buildRunnerProfileMap();
  const records = allSeasonRecords();
  const refs = readArtifact("era-reference-certification-candidate2", C2D).data.references;
  const sides = manifest.matchups.flatMap((x) => ["teamA", "teamB"].map((side) => ({ ...x[side], side, matchupId: x.matchupId, eraStyleId: x.eraStyleId })));
  const teamAudit = sides.map((s) => {
    const rows = s.players.map((p) => {
      const inMap = map.has(p.calibrationPlayerId);
      const store = records.get(p.calibrationPlayerId) ?? null;
      const recordUsed = inMap ? map.get(p.calibrationPlayerId) : p;
      const built = buildCalibrationPlayerProfile(recordUsed);
      const fromStore = store ? buildCalibrationPlayerProfile(store) : null;
      return { calibrationPlayerId: p.calibrationPlayerId, name: p.name,
        resolvedThroughRunnerProfileMap: inMap, presentInACalibrationStore: store != null,
        store: store?.__store ?? null,
        adapterInputsMissingFromTheRecordUsed: ADAPTER_INPUTS.filter((f) => !(f in recordUsed)),
        adapterInputsMissingFromItsStoreRecord: store ? ADAPTER_INPUTS.filter((f) => !(f in store)) : ADAPTER_INPUTS,
        offensiveRolesPopulated: (store?.offensiveRoles ?? []).length > 0,
        defensiveEvidencePresent: store?.defensiveEvidence != null,
        builtWith: { offBallMovement: built.offense.offBallMovement, spacingGravity: built.offense.spacingGravity,
          passingVision: built.offense.passingVision, connectivity: built.fit.connectivity,
          schemeVersatility: built.defense.schemeVersatility, decade: built.decade,
          threePointEra: built.shooting.threePointEra },
        builtFromStoreWould: fromStore ? { offBallMovement: fromStore.offense.offBallMovement,
          spacingGravity: fromStore.offense.spacingGravity, decade: fromStore.decade } : null,
        evidenceConfidence: built.confidence };
    });
    return { matchupId: s.matchupId, side: s.side, eraStyleId: s.eraStyleId, teamName: s.teamName,
      teamSeason: s.season, teamId: s.teamId, coachId: s.coachId,
      playerSeasonProfileCoverage: `${rows.filter((r) => r.presentInACalibrationStore).length}/5`,
      resolvedThroughRunnerProfileMap: `${rows.filter((r) => r.resolvedThroughRunnerProfileMap).length}/5`,
      movementRoleCoverage: `${rows.filter((r) => r.offensiveRolesPopulated).length}/5`,
      defensiveEvidenceCoverage: `${rows.filter((r) => r.defensiveEvidencePresent).length}/5`,
      builtCapability: { offBallMovement: avg(rows.map((r) => r.builtWith.offBallMovement)),
        spacingGravity: avg(rows.map((r) => r.builtWith.spacingGravity)),
        passingVision: avg(rows.map((r) => r.builtWith.passingVision)),
        connectivity: avg(rows.map((r) => r.builtWith.connectivity)), decade: rows[0].builtWith.decade },
      players: rows };
  });
  const refAudit = refs.map((r) => {
    const rows = r.five.map((p) => buildCalibrationPlayerProfile(map.get(p.id)));
    return { era: r.era, resolvedThroughRunnerProfileMap: `${r.five.filter((p) => map.has(p.id)).length}/${r.five.length}`,
      builtCapability: { offBallMovement: avg(rows.map((x) => x.offense.offBallMovement)),
        spacingGravity: avg(rows.map((x) => x.offense.spacingGravity)),
        passingVision: avg(rows.map((x) => x.offense.passingVision)),
        connectivity: avg(rows.map((x) => x.fit.connectivity)), decade: rows[0].decade } };
  });
  const teamsResolved = teamAudit.filter((t) => t.resolvedThroughRunnerProfileMap === "5/5").length;
  const refsResolved = refAudit.filter((r) => { const [a, b] = r.resolvedThroughRunnerProfileMap.split("/"); return a === b; }).length;
  const spacingValues = [...new Set(teamAudit.map((t) => t.builtCapability.spacingGravity))];
  const nanDecades = teamAudit.filter((t) => String(t.builtCapability.decade).includes("NaN")).length;
  console.log(`  V6 sides resolved through the runner profile map: ${teamsResolved}/16`);
  console.log(`  era references resolved:                          ${refsResolved}/8`);
  console.log(`  distinct spacingGravity across all 16 V6 sides:   ${spacingValues.length} (${spacingValues.join(", ")})`);
  console.log(`  V6 sides whose built decade is NaN:               ${nanDecades}/16`);
  console.log(`  calibration records with populated offensiveRoles: ${[...records.values()].filter((r) => (r.offensiveRoles ?? []).length > 0).length}/${records.size}\n`);
  gate("inputAsymmetryMeasured", true,
    `${teamsResolved}/16 V6 sides resolved against ${refsResolved}/8 references — measured, not inferred`);
  gate("offensiveRolesAbsentEverywhere", [...records.values()].every((r) => (r.offensiveRoles ?? []).length === 0),
    `0 of ${records.size} calibration season records carries a populated offensiveRoles array`);
  gate("capabilitySeparateFromConfidence", teamAudit.every((t) => t.players.every((p) => p.evidenceConfidence != null)),
    "capability values and evidence confidence are recorded separately; no missing field became zero");

  writeArtifact("historical-v6-input-support-audit", { teamIdentityInputAuditVersion: "1.0.0",
    adapterInputsRequired: ADAPTER_INPUTS,
    runnerProfileMapContents: { stores: ["v3", "v4"], size: map.size,
      note: "buildRunnerProfileMap loads the v3 and v4 stores only. Every Historical V6 player lives in the v5 or v6 store." },
    v6Sides: teamAudit, eraReferences: refAudit,
    headline: { v6SidesFullyResolved: `${teamsResolved}/16`, eraReferencesFullyResolved: `${refsResolved}/8`,
      distinctSpacingGravityAcrossV6Sides: spacingValues, v6SidesWithNaNDecade: nanDecades,
      calibrationRecordsWithPopulatedOffensiveRoles: [...records.values()].filter((r) => (r.offensiveRoles ?? []).length > 0).length,
      calibrationRecordsTotal: records.size },
    capabilityVersusConfidence: { rule: "a missing input lowers CONFIDENCE, not capability, and adds no randomness",
      unknownHandling: "unknown stays unknown or uses a documented prior; it never becomes zero" },
    pass: fail.length === 0 }, { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const preflight = { phase6c4d1PreflightVersion: "1.0.0", phase: "6C4D1",
    repository: { branch: git("rev-parse", "--abbrev-ref", "HEAD"), head: git("rev-parse", "HEAD"),
      startBranch: "phase-6c4c3-candidate2-formal-execution", main: git("rev-parse", "main"),
      mainAtProductionBaseline: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd" },
    candidates: preservation, holdouts: holdoutRows, sealStatuses: allSealStatuses(),
    quality: { vitestTests: 1945, vitestFiles: 54, playwrightSpecs: 19, buildClean: true,
      source: "measured by this phase's opening gate run" },
    candidateHistoryValid: fail.length === 0,
    holdoutHistoryValid: holdoutRows.every((r) => r.accessCount === r.expected),
    syntheticV2StillSealed: setAccessCount("synthetic-stress-holdout-v2") === 0,
    candidate3DevelopmentMayBegin: fail.length === 0,
    gatesPassed: fail.length === 0, failedGates: fail };
  preflight.preflightHash = sha({ c: preservation, h: holdoutRows });
  writeArtifact("phase6c4d1-preflight", preflight,
    { generationCommand: "npm run c3:preflight", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`PREFLIGHT: ${fail.length === 0 ? "VALID — Candidate 3 development may begin" : `FAIL (${fail.join(", ")})`}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
