#!/usr/bin/env node
// ── Baseline candidate lock ─────────────────────────────────────────────────
//   npm run calibration:c6:lock -- --dry     evaluate gates, write nothing
//   npm run calibration:c6:lock              write the manifest
//
// The lock is a claim about readiness, so it is gated on evidence and refuses to
// emit a LOCKED status without it. Phase 6C2C5 published a LOCKED status
// alongside a null calibration version and a failing gate; the invariants here
// make that combination impossible to produce.
//
// Setting possessionCalibrationVersion is a DELIBERATE, SEPARATE step. This
// command will not edit the registry: it reports whether the lock is permitted,
// and then cross-checks that the registry agrees with the gates. A command that
// both decides a gate and writes the value the gate authorises can always be
// suspected of having done them in the wrong order.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readArtifact, writeArtifact, verifyArtifact, sha256File, ARTIFACT_DIR, ARTIFACT_DIR_C6 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { registryDefaultsHash } from "../../src/v3/calibration/parameters.js";
import { policyHash } from "../../src/v3/calibration/sideBiasPolicy.js";
import { evaluateStatus } from "./c6-status.mjs";
import { versionOf } from "../../src/versions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, manifestHash } from "../../data/calibration/sets-v3.mjs";

const hashOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes("--dry");
  const def = defaultRuntimeParameterSet();

  const gates = [];
  const gate = (name, pass, detail) => { gates.push({ name, pass, detail }); return pass; };

  // ── artifacts present and verifying (on the field that EXISTS) ────────────
  const c6Required = ["candidate-status-reconciliation", "probability-side-bias-policy-v2",
    "prior-failing-cell", "probability-orientation-audit", "probability-side-bias-validation-v2",
    "objective-visibility-resolution"];
  const c5Required = ["candidate-history", "candidate-comparison", "validation-summary",
    "targeted-fixture-coverage", "no-effect-triage", "calibration-scope", "confounding-resolution"];
  const missing = [...c6Required.filter((n) => !existsSync(`${ARTIFACT_DIR_C6}/${n}.json`)),
    ...c5Required.filter((n) => !existsSync(`${ARTIFACT_DIR}/${n}.json`))];
  gate("allRequiredArtifactsPresent", missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : `${c6Required.length} c6 + ${c5Required.length} c5 artifacts present`);
  if (missing.length) { console.error(`LOCK_BLOCKED: ${missing.join(", ")}`); process.exit(2); }

  const verifications = [...c6Required.map((n) => ({ dir: "c6", ...verifyArtifact(n, ARTIFACT_DIR_C6) })),
    ...c5Required.map((n) => ({ dir: "c5", ...verifyArtifact(n, ARTIFACT_DIR) }))];
  const invalid = verifications.filter((v) => !v.valid);
  gate("everyArtifactVerifies", invalid.length === 0,
    invalid.length ? `invalid: ${invalid.map((v) => v.artifact).join(", ")}`
      : `${verifications.length} artifacts, all with complete provenance and matching hashes (checked on \`valid\`, the field that exists — the 6C2C5 gate read \`ok\`, which does not)`);

  const status = readArtifact("candidate-status-reconciliation", ARTIFACT_DIR_C6);
  const policy = readArtifact("probability-side-bias-policy-v2", ARTIFACT_DIR_C6);
  const cell = readArtifact("prior-failing-cell", ARTIFACT_DIR_C6);
  const audit = readArtifact("probability-orientation-audit", ARTIFACT_DIR_C6);
  const sb = readArtifact("probability-side-bias-validation-v2", ARTIFACT_DIR_C6);
  const vis = readArtifact("objective-visibility-resolution", ARTIFACT_DIR_C6);
  const history = readArtifact("candidate-history");
  const comparison = readArtifact("candidate-comparison");
  const c5Validation = readArtifact("validation-summary");
  const coverage = readArtifact("targeted-fixture-coverage");

  // ── candidate selection and parameter identity ────────────────────────────
  gate("candidateStatusReconciled", status.data.currentStateCoherent === true && status.data.contradictionFound.detected === true,
    `The 6C2C5 contradiction is recorded (${status.data.contradictionFound.violations.length} invariant violations) and the current state is coherent.`);
  gate("candidateZeroSelected", history.data.winner === "C0" && history.data.outcome === "CANDIDATE_ZERO_WINS_NO_CHANGE_ACCEPTED",
    `Winner ${history.data.winner}; ${history.data.changedCandidates} on-grid candidates, ${history.data.familyDiagnostics.candidatesFamilyWiseSignificant} family-wise significant, ${history.data.acceptedCount} accepted.`);
  gate("zeroAcceptedParameterChanges", history.data.acceptedCount === 0, `acceptedCount ${history.data.acceptedCount}`);
  const drift = activeParameters().filter((p) => def.values[p.id] !== p.defaultValue);
  gate("everyValueIsTheRegistryDefault", drift.length === 0,
    drift.length ? `DRIFT: ${drift.map((p) => p.id).join(", ")}` : `all ${activeParameters().length} active parameters at their registry default, 0 overrides`);
  gate("contenderDidNotHoldUpOnFreshSeeds", comparison.data.contenderHoldsUpOnFreshSeeds === false,
    `Strongest contender retained ${comparison.data.gainRetainedOnFreshSeeds} of its gain on disjoint seeds; winner ${comparison.data.winner}.`);

  // ── policy ordering ──────────────────────────────────────────────────────
  gate("sideBiasPolicyFrozenBeforeResults", policy.data.frozenBeforeAnyFreshResult === true && policy.data.policyHash === policyHash(),
    `policyHash ${policy.data.policyHash.slice(0, 16)}... matches the frozen module; declared frozen before any fresh result.`);
  gate("sideBiasPolicyUsedByTheValidation", sb.data.policyHash === policy.data.policyHash && sb.data.policyFrozenBeforeThisRun === true,
    "The validation ran under the same policy hash that was frozen and committed before it.");
  gate("marginNotMovedAfterSeeingResults", policy.data.policy.supersedes.marginNotMovedInResponse === true
    && policy.data.policy.MARGINS.perCell === 0.05,
    `Per-cell margin is 0.05, the v1 value, against a v1 observation of ${policy.data.policy.supersedes.v1Observation}. Applied to the corrected paired scale, which is strictly stricter.`);
  gate("freshSeedsDisjointFromEveryPriorDomain", policy.data.seedManifest.totalOverlap === 0 && policy.data.seedManifest.allDistinct === true,
    `${policy.data.seedManifest.maximumPairs} pairs in domain side-bias-v2, ${policy.data.seedManifest.distinctSeeds} distinct, overlap ${JSON.stringify(policy.data.seedManifest.overlapWithPriorDomains)}.`);

  // ── the prior failing cell ───────────────────────────────────────────────
  gate("priorFailingCellIdentifiedFromArtifact", cell.data.cellId != null && cell.data.scaleVerified === true,
    `${cell.data.cellId}: v1 point estimate ${cell.data.v1PointEstimate}, corrected paired effect ${cell.data.correctedPairedEffect}, scale relationship verified.`);
  gate("orientationSemanticsAudited", audit.data.semanticChecks.length >= 12,
    `${audit.data.checksPassed} of ${audit.data.semanticChecks.length} semantic checks pass; ${audit.data.checksFailed} defects found: ${audit.data.harnessDefectsFound.join(", ") || "none"}.`);
  gate("auditClassificationDoesNotBlockLock", audit.data.blocksLock === false,
    `classification ${audit.data.classification}`);
  gate("actualGameControlEquivalent", audit.data.actualGameControlEquivalent === true,
    `${audit.data.actualGameControl.games} paired games on fresh seeds: delta ${audit.data.actualGameControl.winEffect.delta}, CI [${audit.data.actualGameControl.winEffect.waldInterval.lower}, ${audit.data.actualGameControl.winEffect.waldInterval.upper}].`);

  // ── the corrected side-bias gate ─────────────────────────────────────────
  gate("sideBiasV2GatePasses", sb.data.gatePasses === true,
    `${JSON.stringify(sb.data.classificationCounts)} over ${sb.data.familySize} cells, ${sb.data.totalGamesSimulated} games.`);
  gate("everyCellEquivalent", sb.data.gates.everyCellEquivalent === true, `classifications ${JSON.stringify(sb.data.classificationCounts)}`);
  gate("noCellMateriallyBiased", sb.data.gates.noneMateriallyBiased === true, `MATERIALLY_BIASED count ${sb.data.classificationCounts.MATERIALLY_BIASED ?? 0}`);
  gate("noCellInconclusive", sb.data.gates.noneInconclusive === true, `INCONCLUSIVE count ${sb.data.classificationCounts.INCONCLUSIVE ?? 0}`);
  gate("aggregateSideBiasWithinMargin", sb.data.gates.aggregateWithinMargin === true,
    `pooled delta ${sb.data.aggregate.pooledDelta}, CI [${sb.data.aggregate.pooledWald.lower}, ${sb.data.aggregate.pooledWald.upper}] against +/-${sb.data.aggregateMargin}.`);
  gate("noSystematicStratum", sb.data.gates.noSystematicStratum === true,
    sb.data.systematicStrata.length ? sb.data.systematicStrata.join(", ") : "no era, kind, coach or perspective stratum shows a systematic same-direction effect");
  gate("sideBiasCellsReconcile", sb.data.reconciliation.reconciles === true,
    `${JSON.stringify(sb.data.classificationCounts)} sums to ${sb.data.familySize}`);

  // ── objective visibility ─────────────────────────────────────────────────
  gate("objectiveInvisibleParametersResolved", vis.data.readinessReconciliation.reconciles === true && vis.data.allValuesAtRegistryDefault === true,
    `${vis.data.counts.unseenByPrimaryObjective} parameters unseen by the primary objective; ${vis.data.counts.mechanicallyConsistent} mechanically consistent; all frozen at default.`);
  gate("readinessAccountsForEveryParameterOnce", Object.values(vis.data.readinessV4).reduce((a, b) => a + b, 0) === activeParameters().length,
    `readiness v4 sums to ${Object.values(vis.data.readinessV4).reduce((a, b) => a + b, 0)} against ${activeParameters().length} active parameters`);
  gate("noNewParameterSearchWasRun", vis.data.noParameterSearchPerformed === true,
    vis.data.noParameterSearchNote);

  // ── internal validation carried forward ──────────────────────────────────
  gate("internalValidationPassed", c5Validation.data.gatesPassed === true && c5Validation.data.allInvariantsClean === true,
    `${c5Validation.data.totalGamesSimulated} games, invariants clean.`);
  gate("targetedActivationComplete", coverage.data.coverage.activationUnmet === 0,
    `${coverage.data.coverage.activationVerified}/${coverage.data.coverage.exerciseContracts} contracts over ${coverage.data.coverage.totalActivatedPossessions} activated possessions.`);
  gate("zeroInvariantViolationsInSideBiasRun", sb.data.invariantViolations === 0, `${sb.data.invariantViolations} violations`);
  gate("zeroTiesInSideBiasRun", sb.data.ties === 0, `${sb.data.ties} ties`);

  // ── external regression artifacts ────────────────────────────────────────
  const symPath = ".cache/calibration/side-symmetry-c6-baseline-lock.json";
  const sym = existsSync(symPath) ? JSON.parse(readFileSync(symPath, "utf8")) : null;
  gate("actualGameSideSymmetryPasses", sym?.passed === true,
    sym ? `${sym.aggregate.games} paired games, gold win rate ${sym.aggregate.goldWinRate}, advantage ${sym.aggregate.goldAdvantagePp}pp, all ${Object.keys(sym.gate).length} gates pass.`
        : `side-symmetry has not been run for this phase (${symPath} absent)`);
  gate("sideSymmetrySampleSufficient", (sym?.aggregate?.games ?? 0) >= 50000, `${sym?.aggregate?.games ?? 0} paired games against a 50,000 minimum`);

  const probPath = ".cache/calibration/probability-validation-v3.json";
  const prob = existsSync(probPath) ? JSON.parse(readFileSync(probPath, "utf8")) : null;
  const probFailing = prob ? Object.entries(prob.gate).filter(([, v]) => !v).map(([k]) => k) : ["artifact absent"];
  gate("probabilityReliabilitySuitePasses", probFailing.length === 0,
    prob ? (probFailing.length ? `FAILING: ${probFailing.join(", ")}` : `all ${Object.keys(prob.gate).length} gates pass; Brier ${prob.scores.outcomeScale.monteCarloBrier}, floor ${prob.scores.outcomeScale.irreducibleFloorBrier}, achievable-skill ${prob.scores.outcomeScale.fractionOfAchievableSkill}, ECE ${prob.scores.expectedCalibrationError}`) : "artifact absent");

  // ── holdout discipline ───────────────────────────────────────────────────
  const hold = c5Validation.data.sections.find((s) => s.name === "holdoutDiscipline");
  gate("bothFormalHoldoutsSealedUnread",
    hold.historicalHoldoutV3.accessCount === 0 && hold.syntheticStressHoldoutV2.accessCount === 0
    && hold.sealedMembersTouchedDuringValidation.length === 0,
    `historical holdout v3 (${HISTORICAL_HOLDOUT_V3_IDS.length} members) access 0; synthetic stress holdout v2 (${SYNTHETIC_STRESS_HOLDOUT_V2.length} members) access 0.`);
  const sealedIds = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const sbContam = sb.data.cells.filter((c) => sealedIds.has(c.teamA) || sealedIds.has(c.teamB));
  gate("noSealedFixtureInTheSideBiasFamily", sbContam.length === 0,
    sbContam.length ? sbContam.map((c) => c.id).join(", ") : `none of ${sb.data.familySize} cells touches a sealed fixture`);

  // ── production isolation ─────────────────────────────────────────────────
  gate("productionEngineUnchanged", versionOf("engineVersion") === "3.2.0", `engineVersion ${versionOf("engineVersion")}`);

  const allPass = gates.every((g) => g.pass);
  const registryVersion = versionOf("possessionCalibrationVersion");

  // The registry must agree with the gates. Both directions are errors.
  const versionAgrees = allPass ? registryVersion === "1.0.0" : registryVersion == null;

  console.log(`BASELINE CANDIDATE LOCK${dry ? " — DRY RUN" : ""}\n`);
  for (const g of gates) console.log(`  ${g.pass ? "PASS" : "FAIL"}  ${g.name}\n        ${g.detail}`);
  console.log(`\n  gates passing            ${gates.filter((g) => g.pass).length}/${gates.length}`);
  console.log(`  lock permitted           ${allPass}`);
  console.log(`  registry version         ${registryVersion}`);
  console.log(`  registry agrees w/ gates ${versionAgrees}`);

  if (!allPass) {
    console.log(`\n  FAILING GATES:`);
    for (const g of gates.filter((x) => !x.pass)) console.log(`    ${g.name}: ${g.detail}`);
  }
  if (allPass && registryVersion == null) {
    console.log(`\n  Every gate passes but possessionCalibrationVersion is still null.`);
    console.log(`  Set it to 1.0.0 in src/versions.js, then re-run this command.`);
  }
  if (dry) { console.log(`\n  dry run: nothing written`); process.exit(allPass ? 0 : 1); }
  if (!versionAgrees) {
    console.error(`\nLOCK_BLOCKED: the registry and the gates disagree. Gates ${allPass ? "pass" : "fail"} while possessionCalibrationVersion is ${registryVersion}.`);
    process.exit(2);
  }

  const statusSet = {
    candidateId: "Candidate 0",
    candidateSelectionStatus: allPass ? "SELECTED" : "SELECTED_PENDING_GATE",
    candidateLockStatus: allPass ? "LOCKED" : "UNLOCKED",
    calibrationStatus: allPass ? "DEVELOPMENT_LOCKED_BASELINE" : "NOT_LOCKED",
    possessionCalibrationVersion: registryVersion,
    parameterChanges: 0,
    candidateLockBlockers: allPass ? [] : gates.filter((g) => !g.pass).map((g) => g.name),
    lockManifestPresent: true,
  };
  const coherence = evaluateStatus(statusSet);
  if (!coherence.coherent) {
    console.error(`\nLOCK_BLOCKED: the status set is incoherent: ${coherence.violations.map((v) => v.problem).join("; ")}`);
    process.exit(2);
  }

  const manifest = {
    baselineCandidateLockManifestVersion: versionOf("baselineCandidateLockManifestVersion"),
    ...statusSet,
    parameterValues: def.values,
    parameterSetHash: def.parameterSetHash,
    parameterSetStatus: def.status,
    registryDefaultsHash: registryDefaultsHash(),
    activeParameterCount: activeParameters().length,

    registryVersion: versionOf("calibrationParameterRegistryVersion"),
    runtimeBindingVersion: versionOf("runtimeParameterBindingVersion"),
    engineVersions: {
      productionEngineVersion: versionOf("engineVersion"),
      possessionEngineVersion: versionOf("possessionEngineVersion"),
      actionLibraryVersion: versionOf("actionLibraryVersion"),
      defensiveMatchupVersion: versionOf("defensiveMatchupVersion"),
      zoneResolutionVersion: versionOf("zoneResolutionVersion"),
      coachAdjustmentVersion: versionOf("coachAdjustmentVersion"),
      opportunityAllocationVersion: versionOf("opportunityAllocationVersion"),
      monteCarloProbabilityVersion: versionOf("monteCarloProbabilityVersion"),
      actualGameSymmetryVersion: versionOf("actualGameSymmetryVersion"),
    },
    dataVersions: {
      historicalCorpusVersion: versionOf("historicalCorpusVersion"),
      historicalTargetSchemaVersion: versionOf("historicalTargetSchemaVersion"),
      historicalTargetDataVersion: versionOf("historicalTargetDataVersion"),
      tierBTargetDataVersion: versionOf("tierBTargetDataVersion"),
      calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
      playerDataVersion: versionOf("playerDataVersion"),
    },

    candidateHistoryHash: history.outputHash,
    candidateSearchPolicyHash: hashOf(history.data.policy),
    candidateComparisonHash: comparison.outputHash,
    candidateStatusReconciliationHash: status.outputHash,
    probabilitySideBiasPolicyVersion: versionOf("probabilitySideBiasPolicyVersion"),
    probabilitySideBiasPolicyHash: policy.data.policyHash,
    probabilitySideBiasSeedSetVersion: versionOf("probabilitySideBiasSeedSetVersion"),
    probabilitySideBiasSeedSetHash: policy.data.seedManifest.manifestHash,
    probabilitySideBiasValidationHash: sb.outputHash,
    priorFailingCellHash: cell.outputHash,
    orientationAuditHash: audit.outputHash,
    probabilityValidationHash: existsSync(probPath) ? sha256File(probPath) : null,
    sideSymmetryValidationHash: existsSync(symPath) ? sha256File(symPath) : null,
    internalValidationHash: c5Validation.outputHash,
    competitionValidationHash: c5Validation.outputHash,
    readinessHash: hashOf(vis.data.readinessV4),
    objectiveVisibilityResolutionHash: vis.outputHash,
    targetedFixtureCoverageHash: coverage.outputHash,
    supersededV1GateArtifactHash: existsSync("data/calibration/c6/preserved/probability-validation-v1-gate-FAILED.json")
      ? sha256File("data/calibration/c6/preserved/probability-validation-v1-gate-FAILED.json") : null,

    formalHoldoutHashes: {
      historicalHoldoutV3: manifestHash(HISTORICAL_HOLDOUT_V3_IDS, "historical-holdout-v3"),
      syntheticStressHoldoutV2: manifestHash(SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s), "synthetic-stress-holdout-v2"),
    },
    formalHoldoutAccessCounts: { historicalHoldoutV3: 0, syntheticStressHoldoutV2: 0 },
    formalHoldoutState: { historicalHoldoutV3: "SEALED_UNREAD", syntheticStressHoldoutV2: "SEALED_UNREAD" },

    unsupportedDomains: Object.entries(vis.data.readinessV4)
      .filter(([k]) => k === "DEFAULT_FROZEN_PENDING_EXTERNAL_DATA").map(([k, v]) => ({ class: k, count: v })),
    unadjudicatedFrozenParameters: vis.data.resolved.map((r) => ({
      id: r.id, defaultValue: r.defaultValue, finalLockClassification: r.finalLockClassification,
      visibilityClass: r.visibilityClass, mechanicallyConsistent: r.conditionalMechanicalTarget.mechanicallyConsistent,
    })),
    readinessV4: vis.data.readinessV4,

    scopeOfLock: {
      means: [
        "Candidate 0 is immutable at this parameter set hash.",
        "Candidate 0 is the strongest internally supported model: 84 on-grid alternatives were tested against an authorized historical target and none survived family-wise correction.",
        "Every runtime parameter's mechanic was exercised and its activation counted.",
        "Actual-game side symmetry passes at high power.",
        "The corrected Monte Carlo side-bias gate passes on fresh, disjoint seeds.",
        "Monte Carlo reliability is retained.",
      ],
      doesNotMean: [
        "NOT fully historically calibrated.",
        "NOT formal-holdout validated — both holdouts remain sealed and unread.",
        "NOT private-preview validated.",
        "NOT production ready and NOT active.",
        "NOT legally or licensing cleared.",
      ],
    },
    postLockMutationPolicy: "No parameter, policy, seed, candidate-history, validation, readiness, target or fixture change after this manifest. Any quantitative change requires a new possessionCalibrationVersion, a new parameterSetHash if parameters move, a new validation package, and a new holdout strategy if holdout evaluation has begun.",
    engineeringGates: gates,
    allEngineeringGatesPass: allPass,
    creationCommit: null,
    manifestHash: null,
  };
  manifest.creationCommit = (() => { try { return execSyncSafe(); } catch { return null; } })();
  function execSyncSafe() {
    // eslint-disable-next-line global-require
    const { execFileSync } = require("node:child_process");
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  }
  manifest.manifestHash = hashOf(manifest);

  const { path } = writeArtifact("baseline-candidate-lock", manifest, {
    generationCommand: "npm run calibration:c6:lock",
    sourceArtifacts: [
      `${ARTIFACT_DIR_C6}/candidate-status-reconciliation.json`,
      `${ARTIFACT_DIR_C6}/probability-side-bias-policy-v2.json`,
      `${ARTIFACT_DIR_C6}/probability-side-bias-validation-v2.json`,
      `${ARTIFACT_DIR_C6}/objective-visibility-resolution.json`,
      `${ARTIFACT_DIR}/candidate-history.json`,
    ],
    extra: { parameterSetHash: def.parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log(`\n  candidateSelectionStatus ${manifest.candidateSelectionStatus}`);
  console.log(`  candidateLockStatus      ${manifest.candidateLockStatus}`);
  console.log(`  calibrationStatus        ${manifest.calibrationStatus}`);
  console.log(`  parameterChanges         ${manifest.parameterChanges}`);
  console.log(`  parameterSetHash         ${manifest.parameterSetHash}`);
  console.log(`  manifestHash             ${manifest.manifestHash}`);
  console.log(`\nwrote ${path}`);
  process.exit(allPass ? 0 : 1);
}
