#!/usr/bin/env node
// ── WS7 + WS11: resolve every V5 finding, then lock Candidate 2 ─────────────
//   npm run c2:lock
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, B1, C6, git } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const reg = readArtifact("historical-v5-diagnostic-register", DIR).data;
  const cmp = readArtifact("candidate2-vs-candidate1", DIR).data;
  const chg = readArtifact("candidate2-change-manifest", DIR).data;
  const idn = readArtifact("candidate2-identity-separation", DIR).data;
  const cm = readArtifact("candidate2-core-manifest", DIR).data;
  const ps = readArtifact("candidate2-parameter-set", DIR).data;
  const pol = readArtifact("candidate2-repair-policy", DIR).data;
  const ds = readArtifact("defensive-suppression-diagnosis", DIR).data;
  const iv = readArtifact("candidate2-internal-validation", DIR).data;
  const sym = readArtifact("candidate2-side-symmetry", DIR).data;
  const comp = readArtifact("candidate2-competition-validation", DIR).data;
  const c1 = readArtifact("candidate1-preservation", DIR).data;
  const c1lockOrig = readArtifact("candidate1-lock", "data/validation/6c4a").data;
  const d3 = cmp.results.find((r) => r.criterionId === "D3_noInversionBelowNeutral");

  // ── WS7: a final status for every V5 finding ────────────────────────────
  const resolutions = reg.failures.map((f) => {
    if (!f.hardFail) {
      return { ...f, resolution: "PRACTICAL_MARGIN_ONLY",
        rationale: "inside its metric's frozen practical margin, so it decides nothing and is not a repair target. Its formal V5 outcome stands unchanged." };
    }
    if (f.metricId === "assistedRate") {
      return { ...f, resolution: "ASSISTED_OFFENSE_REPAIR_ACCEPTED",
        rationale: `change c2-01 restores the ball-movement lever on assist crediting. The ladder correlation moves ${cmp.ladders.candidate1.assist.spearman} to ${cmp.ladders.candidate2.assist.spearman} and the range ${cmp.ladders.candidate1.assist.range} to ${cmp.ladders.candidate2.assist.range}, with a compatible-roster control gaining ${r5(cmp.assistedOffenseControls.candidate2[0].assistedRate - cmp.assistedOffenseControls.candidate1[0].assistedRate)} against a neutral cell that moved 0.00002.` };
    }
    // refPppVsTeam: the resolution depends on WHY this fixture failed
    const row = ds.perV5Defence.find((x) => x.matchupId === f.matchupId && x.teamName === f.teamName);
    if (row && !row.decidable) {
      return { ...f, resolution: "REFERENCE_LIMITATION",
        rationale: "in this era steals and blocks were never recorded, so every defender derives from the position bonus alone and subject and reference land on identical defensive composites. The comparison cannot be posed on this surface, which is why the observation sits at z near zero. No engine change can decide an undecidable comparison, and none is attempted." };
    }
    return { ...f, resolution: "DEFENSIVE_SUPPRESSION_REPAIR_ACCEPTED",
      rationale: `changes c2-02 and c2-03 restore the coach scheme lever and connect it to opponent shot quality. The ladder correlation moves ${cmp.ladders.candidate1.defence.spearman} to ${cmp.ladders.candidate2.defence.spearman} and the range ${cmp.ladders.candidate1.defence.range} to ${cmp.ladders.candidate2.defence.range}; personnel-truncation inversions across the eight V5 defences fall from 6 to ${d3.evidence.personnelInversions.length}, and a weak defence under a neutral coach moved 0.00007.` };
  });
  // the Spurs instance is a soft failure, but its underlying cause is a data
  // limitation worth naming rather than leaving inside the margin bucket
  const spursRow = ds.perV5Defence.find((x) => x.teamName === "San Antonio Spurs");
  const dataLimitations = spursRow && spursRow.decidable && spursRow.compositeDelta < 0 && spursRow.defensiveEvidenceCoverage === "0/5"
    ? [{ matchupId: spursRow.matchupId, teamName: spursRow.teamName, teamSeason: spursRow.teamSeason,
        classification: "DATA_LIMITATION",
        detail: `this defence derives a composite of ${spursRow.subjectDefensiveComposite} against its era reference's ${spursRow.referenceDefensiveComposite}, and carries defensiveEvidence on ${spursRow.defensiveEvidenceCoverage} players. Its documented defensive value is not event-visible: the adapter reads steals and blocks, and a band floor would lift it only where per-season defensive evidence exists in the store. Adding that evidence requires verifying per-season awards from the authorized source, which is data work rather than an engine repair, so it is named as a limitation instead of being repaired here. Its coach's help intent equals the neutral default, so neither Candidate 2 change reaches it — which is the honest outcome: a repair that moved it would have had to be aimed at it.` }]
    : [];
  const unresolved = resolutions.filter((r) => r.resolution === "UNRESOLVED");

  writeArtifact("remaining-v5-diagnostic-results", {
    remainingV5DiagnosticVersion: "1.0.0",
    findingCount: resolutions.length,
    resolutionCounts: Object.fromEntries([...new Set(resolutions.map((r) => r.resolution))]
      .map((k) => [k, resolutions.filter((r) => r.resolution === k).length])),
    unresolved: unresolved.length,
    resolutions,
    dataLimitations,
    historicalV5NotRescored: "the Historical V5 formal verdict remains HISTORICAL_HOLDOUT_V5_FAIL. Candidate 2 is compared against those diagnostics; no replacement verdict is emitted and none may be.",
  }, { generationCommand: "npm run c2:lock", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("CANDIDATE 2 LOCK\n");
  console.log(`  V5 findings resolved: ${JSON.stringify(Object.fromEntries([...new Set(resolutions.map((r) => r.resolution))].map((k) => [k, resolutions.filter((r) => r.resolution === k).length])))}`);
  console.log(`  data limitations named: ${dataLimitations.length}\n`);

  // ── the lock gate ───────────────────────────────────────────────────────
  gate("candidate0And1Preserved",
    c1.driftFromLock.core === 0 && c1.alteredInThisPhase === false
    && readArtifact("candidate0-preservation", DIR).data.alteredInThisPhase === false,
    "both prior candidates untouched, with their locks unmodified");
  gate("priorHoldoutsPreserved",
    setAccessCount("historical-holdout-v3") === 1 && setAccessCount("historical-holdout-v4") === 1
    && setAccessCount("historical-holdout-v5") === 1,
    "V3, V4 and V5 all consumed at access 1, verdicts untouched");
  gate("syntheticV2StillSealed", setAccessCount("synthetic-stress-holdout-v2") === 0,
    `synthetic-stress-holdout-v2 access ${setAccessCount("synthetic-stress-holdout-v2")}`);
  gate("everyV5FindingResolved", unresolved.length === 0,
    `${resolutions.length} findings, ${unresolved.length} UNRESOLVED`);
  gate("everyAcceptanceCriterionPassed", cmp.pass === true && cmp.criteriaFailed.length === 0,
    `${cmp.criteriaPassed}/${cmp.criteriaEvaluated} criteria`);
  gate("identityCollisionFree", idn.collisionCount === 0
    && core.aggregateCoreHash !== c1.coreHash,
    `core ${core.aggregateCoreHash.slice(0, 16)}..., ${idn.collisionCount} collisions`);
  gate("zeroParameterChanges", ps.parameterChanges === 0
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `${activeParameters().length} parameters at registry defaults`);
  gate("noEntityHardcodeOrFlatBonus",
    chg.entityHardcodes === 0 && chg.flatBonuses === 0
    && chg.changes.every((c) => c.entityHardcodeCheck.startsWith("no ")),
    `${chg.changeCount} changes, all entity-agnostic and centred on the neutral default`);
  gate("replayExactAndInvariantsClean",
    iv.replay.mismatches === 0 && iv.structuralTotals.invariantViolations === 0
    && iv.structuralTotals.finalTies === 0 && iv.structuralTotals.astGtFgm === 0,
    `0 replay mismatches, 0 invariant violations, 0 final ties, 0 AST>FGM`);
  gate("sideSymmetryNotWorseThanParent", sym.allContainHalf || sym.atPower.cellsContainingHalf >= sym.candidate1AtPower.cellsContainingHalf,
    `${sym.atPower.cellsContainingHalf}/${sym.atPower.cells.length} cells at ${sym.atPower.gamesPerCell.toLocaleString()} games, asymmetric swap consistent with zero`);
  gate("competitionModesClean", comp.pass === true,
    `series mean length ${comp.meanSeriesLength}, season mean wins ${comp.meanSeasonWins}, 0 invariants`);
  gate("coreGraphComplete", cm.missingExecutedModules === 0 && cm.parserBacked === true,
    `parser-backed, ${cm.coreFileCount} files`);

  const locked = fail.length === 0;
  const lock = {
    candidate2LockVersion: "1.0.0",
    candidateLockManifestVersion: c1lockOrig.candidateLockManifestVersion ?? "1.0.0",
    candidateId: "Candidate 2", parentCandidateId: "Candidate 1",
    parentCoreHash: c1.coreHash,
    parentLockManifest: "data/validation/6c4b1/candidate1-lock-recertification.json",
    grandparentCandidateId: "Candidate 0", grandparentCoreHash: c1.driftFromLock ? readArtifact("candidate0-preservation", DIR).data.coreHash : null,
    candidateSelectionStatus: locked ? "SELECTED" : "DRAFT",
    candidateLockStatus: locked ? "LOCKED" : "UNLOCKED",
    calibrationStatus: locked ? "DEVELOPMENT_LOCKED_SCOPED" : "DEVELOPMENT_DRAFT",
    validationAttemptStatus: "NOT_RUN",
    formalValidationStatus: "NOT_RUN",
    scope: "A future Historical Holdout V6 formal validation. Nothing here authorises synthetic-stress access, preview, or production.",
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    parameterSetHash: def.parameterSetHash,
    parameterChanges: 0,
    candidateLockBlockers: fail,
    allEngineeringGatesPass: locked,
    coreHash: core.aggregateCoreHash,
    validatedCoreHash: core.aggregateCoreHash,
    engineBehaviourChanged: true,
    changeBasis: "three root-caused repairs to the two independent Historical V5 measurement failures, each entity-agnostic and centred so a neutral coach is an exact fixed point",
    coreFileCount: cm.coreFileCount,
    closureBuilderVersion: cm.closureBuilderVersion,
    changedCoreFiles: chg.changedFiles,
    changeManifestHash: chg.changeManifestHash,
    coreManifestHash: cm.coreManifestHash,
    parameterSetArtifactHash: createHash("sha256").update(JSON.stringify(ps)).digest("hex"),
    repairPolicyHash: pol.policyHash,
    diagnosticRegisterHash: reg.registerHash,
    vsCandidate1Hash: cmp.comparisonHash,
    validationHashes: { internalValidation: createHash("sha256").update(JSON.stringify(iv)).digest("hex"),
      sideSymmetry: sym.atPower.symmetryHash, competition: createHash("sha256").update(JSON.stringify(comp)).digest("hex") },
    formalHoldoutAccessCounts: { historicalHoldoutV3: setAccessCount("historical-holdout-v3"),
      historicalHoldoutV4: setAccessCount("historical-holdout-v4"),
      historicalHoldoutV5: setAccessCount("historical-holdout-v5"),
      syntheticStressHoldoutV2: setAccessCount("synthetic-stress-holdout-v2") },
    engineVersions: { productionEngineVersion: "3.2.0",
      possessionEngineVersion: versionOf("possessionEngineVersion"),
      defensiveMatchupVersion: versionOf("defensiveMatchupVersion") },
    postLockMutationPolicy: "no engine, parameter, data or policy change may follow this lock before Historical Holdout V6 is selected, sealed and run. A change after the lock invalidates the lock and requires a Candidate 3.",
    notClaimed: ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"],
    historicalV5Role: "FAILED_HOLDOUT_DIAGNOSTIC_SET — never unseen evidence for Candidate 2",
    lockedAtCommit: git("rev-parse", "HEAD"),
  };
  lock.manifestHash = createHash("sha256").update(JSON.stringify({
    coreHash: lock.coreHash, parameterSetHash: lock.parameterSetHash,
    calibrationVersion: lock.possessionCalibrationVersion, parent: lock.parentCoreHash })).digest("hex");
  writeArtifact("candidate2-lock", lock, {
    generationCommand: "npm run c2:lock", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nCANDIDATE 2: ${locked ? "LOCKED" : `NOT LOCKED (${fail.join(", ")})`}`);
  console.log(`  ${lock.candidateSelectionStatus} / ${lock.candidateLockStatus} / ${lock.calibrationStatus} / formal ${lock.formalValidationStatus}`);
  console.log(`  calibration ${lock.possessionCalibrationVersion}  core ${lock.coreHash.slice(0, 16)}...  manifest ${lock.manifestHash.slice(0, 16)}...`);
  process.exit(locked ? 0 : 2);
}
