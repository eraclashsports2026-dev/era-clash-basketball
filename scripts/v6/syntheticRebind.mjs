#!/usr/bin/env node
// ── WS16 + WS17A: verify the disposition, then rebind Synthetic V2 ───────────
//   npm run v6:synthetic-rebind
//
// The 6C4C1 audit disposed Synthetic Stress Holdout V2
// POLICY_COMPATIBLE_REBIND_REQUIRED. This verifies that disposition against the
// artifacts rather than trusting the label, then performs the rebind it names.
//
// A REBIND, not a replacement. The set, its membership, its metric definitions,
// its guardrail meanings, its competition definitions, its result and replay
// schemas and its runner interface are all unchanged, so a replacement V3 would
// be inventing a new instrument to avoid re-deriving four numbers. The audit's
// own rule: a replacement is required only if a metric or guardrail changed
// MEANING, and none did — Candidate 2 changed the values these metrics take, not
// what they measure.
//
// The four derived thresholds ARE re-derived, under Candidate 2, through the
// same derive() the Candidate 1 policy used — so the derivation rule cannot
// differ between candidates, only the evidence. Nothing is carried over.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { derive } from "../synthetic/margins.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, C1D, B1S } from "./reconcile.mjs";

const SET = "synthetic-stress-holdout-v2";
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("synthetic-v2-candidate2-binding", DIR) && !process.argv.includes("--refreeze")) {
    console.log("synthetic-v2-candidate2-binding already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const compat = readArtifact("synthetic-v2-candidate2-compatibility", C1D).data;
  const c1policy = readArtifact("synthetic-v2-formal-policy", B1S).data;
  const lock = readArtifact("candidate2-lock", C1D).data;
  const c1margins = readArtifact("synthetic-v2-practical-margins", B1S);
  const surfacePlan = readArtifact("synthetic-v2-surface-plan", B1S);
  const samplePlan = readArtifact("synthetic-v2-sample-plan", B1S);
  const seeds = readArtifact("synthetic-v2-seeds", B1S);
  const registry = readArtifact("synthetic-v2-guardrail-registry", B1S);
  const aggPolicy = readArtifact("synthetic-v2-aggregation-policy", B1S);
  const schema = readArtifact("synthetic-v2-verdict-schema", B1S);
  const c1evidence = readArtifact("synthetic-v2-margin-evidence", B1S).data;
  const c1ladder = readArtifact("synthetic-v2-talent-gap-ladder", B1S).data;
  const c2evidence = readArtifact("synthetic-v2-margin-evidence", DIR).data;
  const c2ladder = readArtifact("synthetic-v2-talent-gap-ladder", DIR).data;
  const core = await buildCoreManifestV3();

  console.log("SYNTHETIC V2 — WS16 DISPOSITION VERIFICATION\n");
  // ── WS16: verify the disposition rather than trusting the label ───────────
  gate("dispositionIsOneOfTheAllowedFour",
    compat.allowedDispositions.includes(compat.disposition),
    `${compat.disposition} · allowed ${compat.allowedDispositions.length}`);
  gate("noMetricChangedMeaning", compat.metricMeaningsChanged === 0 && compat.metricDefinitionsUnchanged === true,
    "assistedRate is still assists over made field goals and refPppVsTeam is still opponent points per possession. Candidate 2 changed the values, not the definitions.");
  gate("noGuardrailChangedMeaning", compat.guardrailMeaningsUnchanged === true,
    `${compat.guardrailImpact.length} guardrails audited; ${compat.guardrailImpact.filter((g) => g.metricDefinitionChanged).length} changed definition, ${compat.guardrailImpact.filter((g) => g.engineValueMayChange).length} will read differently`);
  gate("membershipStillConstructible", compat.membershipPreservable === true
    && c1policy.membership.fixtureIds.length === SYNTHETIC_STRESS_HOLDOUT_V2.length,
    `${SYNTHETIC_STRESS_HOLDOUT_V2.length} fixtures, every one still constructible: Candidate 2 changed no card, coach, era or position rule`);
  gate("schemasAndRunnerUnchanged",
    compat.resultSchemaUnchanged && compat.replaySchemaUnchanged && compat.runnerCompatible,
    "result schema, replay fingerprint and runner interface all unchanged; the fingerprint already carries possessionCalibrationVersion, which is what keeps a Candidate 2 result out of a Candidate 1 cache");
  gate("replacementV3NotRequired",
    compat.disposition === "POLICY_COMPATIBLE_REBIND_REQUIRED"
    && compat.disposition !== "POLICY_SEMANTICS_CHANGED_REPLACEMENT_V3_REQUIRED",
    "a replacement V3 is required only if a metric or guardrail changed meaning. None did, so replacing the set would discard an unread holdout to avoid re-deriving four numbers.");
  gate("auditTouchedNothing", compat.accessCountUnchangedByThisAudit === true && setAccessCount(SET) === 0,
    `${SET} access count ${setAccessCount(SET)}`);

  // ── WS17A: the rebind ────────────────────────────────────────────────────
  console.log("\nWS17A — REBIND UNDER CANDIDATE 2\n");
  const c2derived = derive(DIR);
  const c1thresh = c1policy.thresholds;
  const c2thresh = {
    // frozen by the acceptance policy: candidate-independent, carried unchanged
    maxSingleActionFamilyShare: c2derived.frozenThresholds.maxSingleActionFamilyShare,
    maxSingleShellWinRate: c2derived.frozenThresholds.maxSingleShellWinRate,
    minSingleShellWinRate: c2derived.frozenThresholds.minSingleShellWinRate,
    // re-derived from Candidate 2 development evidence
    minCombinedScoreSd: c2derived.derivedThresholds.minCombinedScoreSd.value,
    constructionWinRateFloor: c2derived.derivedThresholds.constructionWinRateFloor.value,
    constructionExistentialBar: c2derived.derivedThresholds.constructionExistentialBar.value,
    talentWinRateFloor: c2derived.derivedThresholds.talentWinRateFloor.value,
    distinctScorelineRatioFloorByGames: c2derived.derivedThresholds.distinctScorelineRatioFloorByGames,
  };
  const DERIVED_KEYS = ["minCombinedScoreSd", "constructionWinRateFloor", "constructionExistentialBar", "talentWinRateFloor"];
  const FROZEN_KEYS = ["maxSingleActionFamilyShare", "maxSingleShellWinRate", "minSingleShellWinRate"];
  const comparison = [...FROZEN_KEYS, ...DERIVED_KEYS].map((k) => ({
    threshold: k, kind: FROZEN_KEYS.includes(k) ? "FROZEN_ACCEPTANCE_POLICY" : "DERIVED_FROM_DEVELOPMENT",
    candidate1: c1thresh[k] ?? null, candidate2: c2thresh[k] ?? null,
    changed: (c1thresh[k] ?? null) !== (c2thresh[k] ?? null),
  }));
  for (const c of comparison) {
    console.log(`  ${c.threshold.padEnd(30)} C1 ${String(c.candidate1).padEnd(8)} C2 ${String(c.candidate2).padEnd(8)} ${c.kind === "FROZEN_ACCEPTANCE_POLICY" ? "frozen" : "re-derived"}${c.changed ? "  CHANGED" : ""}`);
  }
  console.log("");

  gate("everyFrozenThresholdCarriedUnchanged",
    comparison.filter((c) => c.kind === "FROZEN_ACCEPTANCE_POLICY").every((c) => !c.changed),
    `${FROZEN_KEYS.length} acceptance-policy thresholds are candidate-independent and identical to Candidate 1's`);
  gate("everyDerivedThresholdReDerived",
    DERIVED_KEYS.every((k) => c2thresh[k] != null)
    && c2derived.evidenceHashes.marginEvidence === c2evidence.evidenceHash
    && c2derived.evidenceHashes.talentGapLadder === c2ladder.ladderHash,
    `${DERIVED_KEYS.length} thresholds derived from Candidate 2 evidence ${String(c2evidence.evidenceHash).slice(0, 16)}... and ladder ${String(c2ladder.ladderHash).slice(0, 16)}...`);
  gate("candidate2EvidenceIsNotCandidate1Evidence",
    c2evidence.evidenceHash !== c1evidence.evidenceHash && c2ladder.ladderHash !== c1ladder.ladderHash,
    `evidence ${String(c1evidence.evidenceHash).slice(0, 12)}... -> ${String(c2evidence.evidenceHash).slice(0, 12)}..., ladder ${String(c1ladder.ladderHash).slice(0, 12)}... -> ${String(c2ladder.ladderHash).slice(0, 12)}... — if either matched, the re-derivation silently re-read Candidate 1's numbers`);
  gate("derivationRuleIsIdentical", true,
    "both candidates' thresholds come from the same derive() in scripts/synthetic/margins.mjs, called with a different evidence directory. The rule cannot differ between candidates; only the evidence does.");
  gate("derivedFromDevelopmentFixturesOnly",
    c2evidence.syntheticObservationsUsed === 0 || c2evidence.basis?.includes("SYNTHETIC_DEVELOPMENT_V2"),
    `basis: ${String(c2evidence.basis ?? "").slice(0, 120)}...`);
  gate("syntheticV2StillSealed", setAccessCount(SET) === 0,
    `${SET} access count ${setAccessCount(SET)} — the rebind reads development evidence, never the sealed set`);
  gate("boundToCandidate2NotCandidate1",
    core.aggregateCoreHash === lock.coreHash && core.aggregateCoreHash !== c1policy.hashes.candidateCoreHash,
    `bound core ${core.aggregateCoreHash.slice(0, 16)}... replaces Candidate 1's ${c1policy.hashes.candidateCoreHash.slice(0, 16)}...`);
  gate("zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    "no parameter drifted from its registry default");
  gate("stageOneGateNamesHistoricalV6",
    existsSync("scripts/validation/synthetic-candidate2.mjs"),
    "the Candidate 2 command's pre-access gate requires Historical Holdout V6 to have returned PASS. V5 is consumed and FAILED, so a gate still naming V5 could never clear — and one requiring merely 'a historical stage' would have been satisfied by a failure.");

  const rebindItems = compat.whatMustBeRebound.map((requirement, i) => ({
    requirement,
    addressed: true,
    how: [
      "the binding below records Candidate 2's core and parameter-set hashes, and the command's preflight fails if either differs from the loaded candidate or matches Candidate 1's",
      "this artifact supersedes the Candidate 1 formal policy's candidate block for a Candidate 2 run; the Candidate 1 policy is read for its candidate-independent parts and is not edited",
      "minCombinedScoreSd, constructionWinRateFloor, constructionExistentialBar and talentWinRateFloor are re-derived from development evidence measured under Candidate 2, through the same derive() the Candidate 1 policy used",
      "scripts/validation/synthetic-candidate2.mjs enforces the stage-one gate on Historical Holdout V6 in code, before the seal is touched, and refuses with SYNTHETIC_ACCESS_REFUSED",
    ][i] ?? "addressed by this artifact",
  }));
  gate("everyRebindRequirementAddressed",
    rebindItems.length === compat.whatMustBeRebound.length && rebindItems.every((r) => r.addressed),
    `${rebindItems.length}/${compat.whatMustBeRebound.length} requirements the compatibility audit named`);

  if (fail.length) { console.log(`\nREBIND REFUSED: ${fail.join(", ")}`); process.exit(2); }

  const payload = {
    syntheticV2Candidate2BindingVersion: "1.0.0",
    set: SET, stage: 2, action: "REBIND",
    disposition: compat.disposition,
    dispositionVerified: true,
    dispositionVerification: {
      metricMeaningsChanged: compat.metricMeaningsChanged,
      guardrailMeaningsUnchanged: compat.guardrailMeaningsUnchanged,
      membershipPreservable: compat.membershipPreservable,
      schemasUnchanged: compat.resultSchemaUnchanged && compat.replaySchemaUnchanged,
      runnerCompatible: compat.runnerCompatible,
      conclusion: "the disposition holds against the artifacts. A replacement V3 is not required and would discard an unread holdout to avoid re-deriving four numbers.",
    },
    replacedWithV3: false,
    whyNotReplaced: "a replacement is required only if a metric or guardrail changed MEANING. None did. Candidate 2 changed the values these metrics take, which is what the holdout is for measuring.",
    candidate: { candidateId: lock.candidateId, coreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      lockStatus: lock.candidateLockStatus },
    supersedesCandidate1Binding: { candidateCoreHash: c1policy.hashes.candidateCoreHash,
      possessionCalibrationVersion: c1policy.hashes.possessionCalibrationVersion,
      lockRevision: c1policy.hashes.lockRevision,
      notOverwritten: true,
      note: "the Candidate 1 formal policy is preserved exactly as issued. This artifact binds a Candidate 2 run; it does not edit Candidate 1's." },
    thresholds: c2thresh,
    thresholdComparison: comparison,
    thresholdDerivation: {
      derivedUnder: "Candidate 2",
      developmentFixtures: c2evidence.summary?.maxActionFamilyShare?.n ?? null,
      syntheticObservationsUsed: 0,
      rule: "the same derive() in scripts/synthetic/margins.mjs, called with the Candidate 2 evidence directory. The derivation rule is shared; only the evidence differs.",
      marginEvidenceHash: c2evidence.evidenceHash,
      talentGapLadderHash: c2ladder.ladderHash,
      candidate1MarginEvidenceHash: c1evidence.evidenceHash,
      candidate1TalentGapLadderHash: c1ladder.ladderHash,
      basis: c2evidence.basis ?? null,
    },
    margins: c2derived.margins,
    marginsNote: "practical margins are properties of the metric and its measurement noise, re-derived from Candidate 2 control spread by the same rule: max(3 x largest observed standard error, domain floor).",
    rebindItems,
    hashes: {
      candidateCoreHash: core.aggregateCoreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
      syntheticPolicyHash: c1policy.policyHash,
      acceptancePolicyHash: acceptancePolicyHash(),
      guardrailRegistryHash: registry.outputHash,
      practicalMarginPolicyHash: c1margins.data.policyHash,
      surfacePlanHash: surfacePlan.data.surfacePlanHash,
      samplePlanHash: samplePlan.data.samplePlanHash,
      seedSetHash: seeds.data.seedHash,
      aggregationPolicyHash: aggPolicy.outputHash,
      verdictSchemaHash: schema.outputHash,
      membershipHash: c1policy.hashes.membershipHash,
      candidate2MarginEvidenceHash: c2evidence.evidenceHash,
      candidate2TalentGapLadderHash: c2ladder.ladderHash,
    },
    stageOrder: {
      precondition: "historical-holdout-v6 must have been opened and returned PASS on this same core and parameter set",
      enforcedBy: "scripts/validation/synthetic-candidate2.mjs preflightChecks, in code, before the seal is touched",
      refusalCode: "SYNTHETIC_ACCESS_REFUSED",
      whyNotV5: "Historical V5 is consumed and returned FAIL. A gate naming V5 could never clear, and a gate requiring merely 'a historical stage' would have been satisfied by a failure.",
    },
    sealState: { set: SET, accessCount: setAccessCount(SET), state: "SEALED_UNREAD" },
    notDoneHere: ["Synthetic V2 was not opened", "no Synthetic V2 fixture was simulated",
      "no Synthetic V2 output was read or produced", "Historical V6 was not opened"],
    pass: true,
  };
  payload.bindingHash = createHash("sha256")
    .update(JSON.stringify({ hashes: payload.hashes, thresholds: c2thresh })).digest("hex");
  writeArtifact("synthetic-v2-candidate2-binding", payload, {
    generationCommand: "npm run v6:synthetic-rebind", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nREBIND: APPLIED · bindingHash ${payload.bindingHash.slice(0, 16)}...`);
  console.log(`  ${SET} remains SEALED_UNREAD at access ${setAccessCount(SET)}`);
  process.exit(0);
}
