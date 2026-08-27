#!/usr/bin/env node
// ── WS3: the frozen Synthetic V2 formal stress policy ───────────────────────
//   npm run syn:policy
//
// One document binding what is measured, where, at what volume, against which
// threshold, with which margin, and how the cells become a verdict. Everything
// it references is already frozen and hashed; this artifact records the hashes
// so the runner can refuse if any of them moves.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { CONTROL_TARGETS, SURFACE_DEFS } from "./surfaces.mjs";
import { DIR, DIR_B1, syntheticMembership } from "./preflight.mjs";

export const buildPolicy = async () => {
  const margins = readArtifact("synthetic-v2-practical-margins", DIR);
  const registry = readArtifact("synthetic-v2-guardrail-registry", DIR);
  const surfacePlan = readArtifact("synthetic-v2-surface-plan", DIR);
  const samplePlan = readArtifact("synthetic-v2-sample-plan", DIR);
  const seeds = readArtifact("synthetic-v2-seeds", DIR);
  const aggPolicy = readArtifact("synthetic-v2-aggregation-policy", DIR);
  const schema = readArtifact("synthetic-v2-verdict-schema", DIR);
  const recert = readArtifact("candidate1-lock-recertification", DIR_B1).data;
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const mem = syntheticMembership();
  const m = margins.data;

  // Every threshold the evaluator compares against, in one flat block so a
  // reader can see exactly which numbers decide the verdict.
  const thresholds = {
    maxSingleActionFamilyShare: m.frozenThresholds.maxSingleActionFamilyShare,
    maxSingleShellWinRate: m.frozenThresholds.maxSingleShellWinRate,
    minSingleShellWinRate: m.frozenThresholds.minSingleShellWinRate,
    minCombinedScoreSd: m.derivedThresholds.minCombinedScoreSd.value,
    constructionWinRateFloor: m.derivedThresholds.constructionWinRateFloor.value,
    constructionExistentialBar: m.derivedThresholds.constructionExistentialBar.value,
    talentWinRateFloor: m.derivedThresholds.talentWinRateFloor.value,
    distinctScorelineRatioFloorByGames: m.derivedThresholds.distinctScorelineRatioFloorByGames,
  };
  const marginValues = Object.fromEntries(Object.entries(m.margins).map(([k, v]) => [k, v.margin]));

  return {
    syntheticStressPolicyVersion: "1.0.0",
    set: "synthetic-stress-holdout-v2",
    stage: { number: 2, of: 2, stageOne: "historical-holdout-v5",
      order: "this set may not be opened unless Historical Holdout V5 has been opened and returned PASS. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening this set would consume a one-shot resource for no evidence. The runner enforces it as SYNTHETIC_ACCESS_REFUSED before the seal is touched." },
    frozenBeforeAnySyntheticObservation: true,
    candidate: { id: recert.candidateId, lockRevision: recert.lockRevision,
      calibrationVersion: versionOf("possessionCalibrationVersion"), commit: recert.recertifiedAtCommit },
    membership: { fixtureCount: mem.fixtures.length, membershipHash: mem.membershipHash,
      fixtureIds: SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id),
      purposes: Object.fromEntries(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => [f.id, f.purpose])),
      unchangedSincePhase: mem.manifest.frozenAt },
    guardrails: { frozenKeyCount: Object.keys(HOLDOUT.syntheticGuardrails).length,
      adjudicableCount: registry.data.adjudicableGuardrailCount,
      thresholdParameterCount: registry.data.thresholdParameterCount,
      countReconciliation: registry.data.countReconciliation.discrepancy },
    surfaces: Object.fromEntries(Object.entries(SURFACE_DEFS).map(([k, v]) => [k, v.definition])),
    controlTargets: CONTROL_TARGETS,
    thresholds, margins: marginValues,
    marginRule: m.marginRule, floorRule: m.floorRule, dualGate: m.dualGate,
    countsHaveNoMargin: m.countsHaveNoMargin,
    protocol: {
      volumes: samplePlan.data.volumes, competitionModes: samplePlan.data.competitionModes,
      totalGames: samplePlan.data.totalGames,
      minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
      seedStream: "synthetic-stress-holdout-v2",
      seedAddressing: seeds.data.surfaceAddressing.formula,
    },
    outcomes: {
      pass: "SYNTHETIC_HOLDOUT_V2_PASS", fail: "SYNTHETIC_HOLDOUT_V2_FAIL",
      invalid: "SYNTHETIC_HOLDOUT_V2_INVALID_RUN",
      whatAPassDoesNotAuthorize: "A pass here is the second of two formal stages. It does not by itself make Candidate 1 HOLDOUT_VALIDATED, PRIVATE_PREVIEW_VALIDATED, PRODUCTION_READY or ACTIVE, and it authorizes no deployment. Those statuses belong to the phase that earns them, and production activation requires an explicit CEO GO LIVE.",
    },
    aggregationRule: aggPolicy.data.rule,
    hashes: {
      candidateCoreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      lockRevision: recert.lockRevision,
      acceptancePolicyHash: acceptancePolicyHash(),
      guardrailRegistryHash: registry.outputHash,
      practicalMarginPolicyHash: m.policyHash,
      surfacePlanHash: surfacePlan.data.surfacePlanHash,
      samplePlanHash: samplePlan.data.samplePlanHash,
      seedSetHash: seeds.data.seedHash,
      aggregationPolicyHash: aggPolicy.outputHash,
      verdictSchemaHash: schema.outputHash,
      membershipHash: mem.membershipHash,
    },
    evidenceBasis: {
      whereTheDerivedNumbersCameFrom: "the 14 SYNTHETIC_DEVELOPMENT_V2 fixtures run through the exact formal surfaces at the frozen volumes, plus a role-matched upgrade ladder over the same 14. Non-holdout throughout: every control excludes every person appearing in any sealed fixture.",
      marginEvidenceHash: m.evidenceHashes.marginEvidence,
      talentGapLadderHash: m.evidenceHashes.talentGapLadder,
      syntheticObservationsUsed: 0,
    },
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-formal-policy", DIR) && !process.argv.includes("--refreeze")) {
    console.log("formal policy already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const policy = await buildPolicy();

  console.log("SYNTHETIC V2 FORMAL STRESS POLICY\n");
  console.log("  thresholds that decide the verdict:");
  for (const [k, v] of Object.entries(policy.thresholds)) {
    if (typeof v === "number") console.log(`    ${k.padEnd(34)} ${v}   margin ${policy.margins[({
      maxSingleActionFamilyShare: "maxActionFamilyShare", maxSingleShellWinRate: "shellSideWinRate",
      minSingleShellWinRate: "shellSideWinRate", minCombinedScoreSd: "combinedScoreSd",
      constructionWinRateFloor: "coherentLowerControlWinRate", constructionExistentialBar: "coherentLowerControlWinRate",
      talentWinRateFloor: "roleMatchedUpgradeWinRate" })[k]] ?? "n/a"}`);
  }
  console.log(`\n  ${policy.protocol.totalGames.toLocaleString()} planned games across ${policy.membership.fixtureCount} fixtures`);
  console.log(`  stage ${policy.stage.number} of ${policy.stage.of}, after ${policy.stage.stageOne}\n`);

  // The block mixes true hashes with two identity fields the runner also
  // pins (the calibration version and the lock revision). Check each for what
  // it actually is rather than applying a hash-shaped test to all of them.
  const hashEntries = Object.entries(policy.hashes).filter(([k]) => k.endsWith("Hash"));
  const identityEntries = Object.entries(policy.hashes).filter(([k]) => !k.endsWith("Hash"));
  const badHashes = hashEntries.filter(([, v]) => typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v));
  const badIdentity = identityEntries.filter(([, v]) => v == null || v === "");
  gate("everyReferencedArtifactIsHashed",
    badHashes.length === 0 && badIdentity.length === 0,
    badHashes.length || badIdentity.length
      ? `not hash-shaped: ${badHashes.map(([k]) => k).join(", ")}${badIdentity.length ? `; empty identity: ${badIdentity.map(([k]) => k).join(", ")}` : ""}`
      : `${hashEntries.length} sha256 hashes plus ${identityEntries.length} pinned identity fields (${identityEntries.map(([k, v]) => `${k} ${v}`).join(", ")}), so the runner can refuse if any input moves`);
  gate("everyThresholdHasAMargin",
    ["maxSingleActionFamilyShare", "maxSingleShellWinRate", "minSingleShellWinRate", "minCombinedScoreSd",
      "constructionWinRateFloor", "talentWinRateFloor"].every((k) => policy.thresholds[k] != null)
    && Object.keys(policy.margins).length === 5,
    "six adjudicating thresholds, five margins (the shell band's two edges share one margin)");
  gate("frozenGuardrailsCarriedThroughUnchanged",
    policy.thresholds.maxSingleActionFamilyShare === HOLDOUT.syntheticGuardrails.maxSingleActionFamilyShare
    && policy.thresholds.maxSingleShellWinRate === HOLDOUT.syntheticGuardrails.maxSingleShellWinRate
    && policy.thresholds.minSingleShellWinRate === HOLDOUT.syntheticGuardrails.minSingleShellWinRate
    && policy.hashes.acceptancePolicyHash === acceptancePolicyHash(),
    "the three frozen numbers and the acceptance policy hash match the frozen source exactly");
  gate("membershipUnchanged",
    policy.membership.fixtureCount === 16
    && policy.membership.membershipHash === syntheticMembership().membershipHash,
    `16 fixtures, membershipHash ${policy.membership.membershipHash.slice(0, 16)}...`);
  gate("stageOrderEnforced",
    policy.stage.number === 2 && policy.stage.order.includes("SYNTHETIC_ACCESS_REFUSED"),
    "the policy records that this set may not open unless Historical V5 returned PASS, and names the refusal code");
  gate("noSyntheticObservationInformedThePolicy",
    policy.evidenceBasis.syntheticObservationsUsed === 0,
    "every derived number came from the development set and the upgrade ladder, both non-holdout");
  gate("passDoesNotAuthorizeDeployment",
    policy.outcomes.whatAPassDoesNotAuthorize.includes("GO LIVE"),
    "the policy states in terms that a pass grants no status and no deployment");
  gate("volumeFrozenBeforeSelection",
    policy.frozenBeforeAnySyntheticObservation === true
    && policy.protocol.totalGames >= 16 * HOLDOUT.minGamesPerHoldoutFixture,
    `${policy.protocol.totalGames.toLocaleString()} games against a floor of ${(16 * HOLDOUT.minGamesPerHoldoutFixture).toLocaleString()}`);

  const payload = { ...policy, pass: fail.length === 0, failedGates: fail };
  payload.policyHash = createHash("sha256").update(JSON.stringify({
    thresholds: policy.thresholds, margins: policy.margins, hashes: policy.hashes,
    membership: policy.membership.fixtureIds, protocol: policy.protocol })).digest("hex");
  writeArtifact("synthetic-v2-formal-policy", payload, {
    generationCommand: "npm run syn:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nFORMAL POLICY: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · policyHash ${payload.policyHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
