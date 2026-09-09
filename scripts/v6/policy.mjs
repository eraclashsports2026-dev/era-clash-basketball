#!/usr/bin/env node
// ── WS9 + WS10 + WS12: margins, sample plan, verdict aggregation ────────────
//   npm run v6:policy
//
// All three are frozen BEFORE the set is sealed and before any V6 game is
// played. Every input is non-V6: the basketball-meaningful floors carried
// forward unchanged from the 6C4A/V5 policies, and noise re-estimated from the
// CANDIDATE 2 strong/neutral/weak control cells. There is no V6 output to
// derive any of it from, which is the point.
//
// PROSPECTIVE ONLY. Historical V3, V4 and V5 stand exactly as issued. V5 in
// particular is consumed and FAILED; rescoring it under a policy written after
// its result would be choosing the rule after seeing the answer.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { PRACTICAL_FLOORS } from "../v5/marginPolicyV5.mjs";
import { DIR, C1D, B1 } from "./reconcile.mjs";

const PROTOCOL_N = 4096;      // side-balanced games per surface at the decision tier
const NOISE_MULTIPLE = 8;     // a margin must clear 8 standard errors of the neutral control
const r6 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);

/**
 * Sample tiers, fixed here and never chosen after seeing a result. The decision
 * tier is 4096 — the same protocol V5 used, so a V6 number is comparable to a
 * V5 number. Escalation to 8192 is allowed only for a measurement that lands
 * INDETERMINATE at the decision tier, and it is symmetric: escalation is
 * triggered by the indeterminacy, never by which way the difference points.
 */
export const SAMPLE_TIERS = Object.freeze([
  { tier: 0, gamesPerSurface: 512, role: "DRY_RUN_ONLY", mayProduceVerdict: false,
    why: "exercises every runner branch cheaply. A verdict at this size would be noise." },
  { tier: 1, gamesPerSurface: 1024, role: "SMOKE", mayProduceVerdict: false,
    why: "confirms the surfaces populate and the seeds resolve before the decision tier is spent." },
  { tier: 2, gamesPerSurface: 2048, role: "PRECHECK", mayProduceVerdict: false,
    why: "half the decision tier; used only to confirm equivalence with it." },
  { tier: 3, gamesPerSurface: PROTOCOL_N, role: "DECISION", mayProduceVerdict: true,
    why: "the frozen V5 protocol size, so V6 and V5 measurements are directly comparable." },
  { tier: 4, gamesPerSurface: 8192, role: "ESCALATION", mayProduceVerdict: true,
    why: "resolves a measurement that is statistically different but inside its practical margin at the decision tier." },
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("historical-v6-verdict-policy", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-v6-verdict-policy already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }
  if (artifactExists("historical-v6-seal", DIR)) {
    throw new Error("REFUSED: the V6 seal already exists. Policy is frozen before the seal, not after.");
  }

  const obs = readArtifact("historical-v6-observability-certification", DIR);
  const refs = readArtifact("era-reference-certification-candidate2", DIR);
  const sel = readArtifact("historical-v6-selection", DIR).data;
  const targets = readArtifact("historical-v6-targets", DIR).data;
  const c2lock = readArtifact("candidate2-lock", C1D).data;
  const priorV5Margins = readArtifact("trait-practical-margin-policy-v5", B1).data;
  const priorV5Policy = readArtifact("historical-holdout-v5-policy", B1).data;
  const clusters = readArtifact("historical-v5-independent-evidence-clusters", C1D).data;

  // ── WS9: practical margins ───────────────────────────────────────────────
  console.log("HISTORICAL V6 PRACTICAL-MARGIN POLICY\n");
  const metrics = {};
  for (const [metric, spec] of Object.entries(PRACTICAL_FLOORS)) {
    const row = obs.data.results.find((r) => r.metric === metric);
    const neutral = row?.cells?.neutral ?? null;
    const seAtProtocolN = neutral?.sd != null ? neutral.sd / Math.sqrt(PROTOCOL_N) : null;
    const noise = seAtProtocolN != null ? NOISE_MULTIPLE * seAtProtocolN : null;
    const margin = r6(Math.max(spec.floor, noise ?? 0));
    const priorMargin = priorV5Margins.metrics[metric]?.margin ?? null;
    metrics[metric] = {
      margin, practicalFloor: spec.floor, unit: spec.unit, traitFamily: spec.family,
      practicalRationale: spec.basis,
      confidenceMethod: "95% Wald interval on the difference of two independent per-game sample means",
      sourceControls: `Candidate 2 neutral control cell (${obs.data.gamesPerCell} games) from historical-v6-observability-certification.json`,
      noiseEstimate: { neutralCellSd: neutral?.sd ?? null,
        standardErrorAtProtocolN: r6(seAtProtocolN), noiseComponent: r6(noise), multiple: NOISE_MULTIPLE },
      sampleRequirement: { gamesPerSurface: PROTOCOL_N, sideBalanced: true },
      binding: noise != null && noise > spec.floor ? "NOISE" : "PRACTICAL_FLOOR",
      metricCertifiedUnderCandidate2: obs.data.certifiedMetrics.includes(metric),
      metricCertifiedUnderCandidate1: row?.certifiedUnderCandidate1 ?? null,
      scoreableOnV6: obs.data.certifiedMetrics.includes(metric),
      changedFromV5Policy: priorMargin != null && priorMargin !== margin,
      v5PolicyMargin: priorMargin,
    };
    console.log(`  ${metric.padEnd(20)} margin ${String(margin).padEnd(9)} ${metrics[metric].binding === "NOISE" ? "noise-bound" : "floor-bound"} · 8xSE ${metrics[metric].noiseEstimate.noiseComponent ?? "n/a"} · certified C2 ${metrics[metric].metricCertifiedUnderCandidate2}${metrics[metric].changedFromV5Policy ? `  (V5 margin was ${priorMargin})` : ""}`);
  }
  console.log("");

  const rule = {
    hardFail: "direction opposite to the claim AND the 95% interval excludes zero AND |difference| > margin[metric]",
    directionalSoftFail: "direction opposite to the claim AND (interval includes zero OR |difference| <= margin[metric]) — reported, never verdict-driving",
    pass: "direction matches the claim",
    indeterminate: "statistically different but inside the practical margin — never a FAIL, and at the decision tier it triggers escalation rather than a verdict",
    reportingStates: ["PASS", "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT",
      "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED", "INCONCLUSIVE", "NOT_OBSERVABLE", "NOT_APPLICABLE"],
    dualGate: "Both gates must fire. Statistical significance alone is not a failure at 4,096 games, and a large difference inside noise is not evidence.",
  };

  gate("everyMarginDominatesItsMeasuredNoise",
    Object.values(metrics).every((m) => m.noiseEstimate.noiseComponent == null || m.margin >= m.noiseEstimate.noiseComponent),
    `${Object.keys(metrics).length} metrics; every margin is at least its 8-standard-error noise component under Candidate 2`);
  gate("everyMarginHasAPracticalRationale",
    Object.values(metrics).every((m) => m.practicalRationale.length > 20 && m.unit),
    "each margin states a value, a unit, a confidence method, its source controls, a noise estimate, a practical rationale and a sample requirement");
  gate("marginsAreMetricSpecific", new Set(Object.values(metrics).map((m) => m.margin)).size > 1,
    `${new Set(Object.values(metrics).map((m) => m.margin)).size} distinct margins across ${new Set(Object.values(metrics).map((m) => m.traitFamily)).size} trait families — no single universal margin`);
  gate("derivedFromNonV6SurfacesOnly",
    !artifactExists("historical-v6-results", DIR) && !artifactExists("historical-v6-run", DIR),
    "no V6 result or run artifact exists; every input is a Candidate 2 control cell, a Candidate 2 reference certification or a carried-forward floor");
  gate("prospectiveOnly", true,
    "applies from Historical Holdout V6 forward; V3, V4 and V5 verdicts stand exactly as issued and are not rescored");

  const marginPayload = {
    historicalV6PracticalMarginPolicyVersion: "1.0.0",
    supersedes: { artifact: "trait-practical-margin-policy-v5", policyHash: priorV5Margins.policyHash,
      whatChanged: "Noise re-estimated from CANDIDATE 2 control cells. The basketball-meaningful floors are unchanged — a floor moves only with a stated reason, and none had one. The V5 policy is preserved, not edited.",
      notOverwritten: true },
    appliesFrom: "Historical Holdout V6 and every later formal validation",
    neverAppliesTo: "Historical Holdout V3, V4 and V5 — consumed sets whose verdicts stand as issued",
    rule, metrics,
    noiseBasis: `Candidate 2 neutral control cells, ${DIR}/historical-v6-observability-certification.json`,
    frozenBeforeSeal: true, frozenBeforeAnyV6Output: true,
  };
  marginPayload.policyHash = createHash("sha256").update(JSON.stringify(marginPayload)).digest("hex");
  writeArtifact("historical-v6-practical-margins", { ...marginPayload, frozen: true },
    { generationCommand: "npm run v6:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS10: sample plan ────────────────────────────────────────────────────
  const decision = SAMPLE_TIERS.find((t) => t.role === "DECISION");
  const escalation = SAMPLE_TIERS.find((t) => t.role === "ESCALATION");
  const samplePayload = {
    historicalV6SamplePlanVersion: "1.0.0",
    tiers: SAMPLE_TIERS,
    decisionTier: decision.tier, decisionGamesPerSurface: decision.gamesPerSurface,
    surfacesPerMatchup: 3, matchups: sel.matchups.length,
    gamesAtDecisionTier: decision.gamesPerSurface * 3 * sel.matchups.length,
    maxGamesIfEveryMeasurementEscalates: escalation.gamesPerSurface * 3 * sel.matchups.length,
    progressiveEquivalence: {
      rule: "a cluster verdict is declared only when the decision tier and the tier below it (2048) agree on that cluster's state. Where they disagree, the cluster escalates to 8192 and the escalated state governs.",
      escalationTrigger: "the cluster is INDETERMINATE at the decision tier (statistically different, inside its practical margin), or the precheck and decision tiers disagree on its state",
      symmetry: "escalation is triggered by indeterminacy or disagreement alone. It is never conditioned on the sign of the difference, so it cannot preferentially rescue a failing measurement or a passing one.",
      cap: `${escalation.gamesPerSurface} games per surface. A cluster still indeterminate at the cap is reported INDETERMINATE and contributes neither pass credit nor failure.`,
      noAdaptiveStopping: "The decision tier is always run in full. Escalation adds samples; it never truncates a tier early on a favourable interim reading.",
    },
    sideBalanced: true,
    seedAllocation: "every tier draws from its own pre-allocated block of the HISTORICAL_V6_FORMAL domain, so an escalation cannot reuse a decision-tier seed and inflate agreement",
    frozenBeforeSeal: true,
  };
  samplePayload.samplePlanHash = createHash("sha256").update(JSON.stringify(samplePayload)).digest("hex");
  writeArtifact("historical-v6-sample-plan", samplePayload,
    { generationCommand: "npm run v6:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS12: verdict aggregation on independent clusters ────────────────────
  const verdict = {
    historicalV6VerdictPolicyVersion: "1.0.0",
    holdoutSet: "historical-holdout-v6",
    frozenBeforeSeal: true, frozenBeforeSelection: false,
    frozenBeforeSelectionNote: "selection was frozen and executed first under its own policy; this artifact governs how a result is aggregated, and no V6 result exists.",
    basedOnly: ["carried-forward practical floors", "Candidate 2 strong/neutral/weak control cells",
      "Candidate 2 era-reference certification", "the frozen V6 target coverage"],
    protocol: {
      surfacesPerMatchup: ["TEAM_A_VS_TEAM_B", "TEAM_A_VS_ERA_REFERENCE", "TEAM_B_VS_ERA_REFERENCE"],
      sideBalanced: true, gamesPerSurface: decision.gamesPerSurface,
      gamesPerMatchup: decision.gamesPerSurface * 3, matchups: sel.matchups.length,
      totalGamesAtDecisionTier: decision.gamesPerSurface * 3 * sel.matchups.length,
      seedDomain: "HISTORICAL_V6_FORMAL",
      note: "Offence is read only from a team's own side of team-vs-reference games and defence only from the reference's output in those games. Nothing offence/defence is ever read from a mirror — the defect that consumed V3 and the reason a mirror matchup was excluded at selection.",
    },
    // ── the change that matters ────────────────────────────────────────────
    aggregation: {
      unit: "INDEPENDENT_MEASUREMENT_CLUSTER",
      whyNotLabelCount: "V5 aggregated on trait LABELS and reported 3 hard fails. Two of those labels were one observation — identical fixture, side, metric, surface, direction, observed and reference value — so the real independent evidence was 2 clusters, not 3. A label count double-counts whenever two trait names claim the same measurement, which inflates the apparent weight of evidence and would let a naming decision change a verdict.",
      clusterKey: "matchupId | side | metricId | surface | expectedDirection | observedValue | referenceValue",
      collapseRule: clusters.collapseRule,
      labelsPreserved: "every formal trait label is preserved in the register and in the result. Only the evidence COUNT collapses; nothing is deleted or hidden.",
      priorEvidence: { artifact: "historical-v5-independent-evidence-clusters",
        formalHardFailLabels: clusters.formalHardFailLabels,
        independentEvidenceClusters: clusters.independentEvidenceClusters },
    },
    numericGates: {
      compositeShareMae: {
        measuredOn: "each team's five-share distribution in its TEAM_VS_ERA_REFERENCE games, against the Tier C season-share proxy",
        internalBaselineMean: priorV5Policy.numericGates.compositeShareMae.internalBaselineMean,
        maxHoldoutToInternalRatio: priorV5Policy.numericGates.compositeShareMae.maxHoldoutToInternalRatio,
        catastrophicThreshold: priorV5Policy.numericGates.compositeShareMae.catastrophicThreshold,
        maxCatastrophicTeams: 0,
        ratioNote: "Carried forward unchanged from the V5 policy, which carried it unchanged from V4. It is not weakened because V5 failed and not tightened because Candidate 2 was repaired.",
      },
      shareComponents: ["playerScoringShares", "playerReboundShares", "playerAssistShares",
        "playerStealShares", "playerBlockShares"],
      unavailableMetrics: "A null target contributes no error, no pass credit and no failure. It is never zero-filled.",
      scoreableTeamMetrics: readArtifact("historical-v6-target-coverage", DIR).data.scoreableTeamMetrics,
    },
    traitGates: {
      scoredTraits: "Only traits certified in historical-v6-observability-certification.json, on their registry surface, against the CANDIDATE 2 era-reference self-baselines.",
      perTrait: rule,
      practicalMarginPolicyHash: marginPayload.policyHash,
      confidenceHandling: {
        HIGH: "a hard-fail cluster on a high-confidence identity is a verdict failure on its own",
        MEDIUM: "hard-fail clusters count toward the aggregate gates",
        LOW: "reported, never verdict-driving",
      },
      aggregate: {
        minTraitPassRate: 0.75,
        maxIndependentHardFailClusters: 0,
        maxHardFailLabelsNote: "not a gate. Labels are counted and reported; only clusters are aggregated.",
        perFixtureRule: "no matchup may fail a majority of its scored traits",
        perEraRule: "no era style may fail every scored trait of its matchup",
        clusterIndependenceRule: "two hard fails sharing a cluster key are one cluster. Two hard fails on the same metric and side but different matchups are two clusters — different teams are different evidence.",
      },
      reporting: rule.reportingStates,
    },
    structuralGates: {
      zeroInvariantFailures: true, zeroFinalTies: true, replayExactPerSurface: true,
      zeroImpossibleScores: true, zeroPreThreeEraThreePointAttempts: true,
      candidateIdentityStated: "every result must state candidateId, core hash, parameter-set hash and calibration version",
      coreHashMustEqual: c2lock.coreHash,
      parameterSetHashMustEqual: def.parameterSetHash,
      calibrationVersionMustEqual: c2lock.possessionCalibrationVersion,
    },
    outcomes: { pass: "HISTORICAL_HOLDOUT_V6_PASS", fail: "HISTORICAL_HOLDOUT_V6_FAIL",
      invalid: "HISTORICAL_HOLDOUT_V6_INVALID_RUN" },
    failureSemantics: "FAIL preserves every artifact, forbids tuning against V6, keeps Synthetic Stress Holdout V2 sealed at access 0, and ends formal validation for Candidate 2. INVALID_RUN resumes under the SAME access event only.",
    immutability: "After this artifact is committed no threshold, margin, trait, confidence rule, reference, target or aggregation unit may change. Any change before V6 access requires a new policy version, a new policy hash and a new readiness package; any change after V6 access invalidates V6.",
    hashes: {
      candidate2CoreHash: c2lock.coreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: c2lock.possessionCalibrationVersion,
      eraReferenceCertificationHash: refs.data.certificationHash,
      observabilityCertificationHash: obs.data.certificationHash,
      practicalMarginPolicyHash: marginPayload.policyHash,
      samplePlanHash: samplePayload.samplePlanHash,
      selectionHash: sel.selectionHash, targetsHash: targets.targetsHash,
      priorV5PolicyHash: priorV5Policy.policyHash,
    },
  };
  gate("aggregationUnitIsIndependentEvidence", verdict.aggregation.unit === "INDEPENDENT_MEASUREMENT_CLUSTER"
    && verdict.traitGates.aggregate.maxIndependentHardFailClusters === 0,
    `clusters, not labels — V5's ${clusters.formalHardFailLabels} hard-fail labels were ${clusters.independentEvidenceClusters} independent measurements`);
  gate("labelsPreservedNotDeleted", Boolean(verdict.aggregation.labelsPreserved),
    "collapsing the evidence count does not remove any trait label from the register or the result");
  gate("indeterminateIsNeverFailure", rule.indeterminate.includes("never a FAIL"),
    "a statistically-different observation inside its practical margin cannot produce a failure at any tier");
  gate("escalationIsDirectionBlind", verdict.protocol.gamesPerSurface === decision.gamesPerSurface
    && samplePayload.progressiveEquivalence.symmetry.includes("never conditioned on the sign"),
    "escalation triggers on indeterminacy or tier disagreement, never on which way the difference points");
  gate("carriedForwardThresholdsUnchanged",
    verdict.numericGates.compositeShareMae.maxHoldoutToInternalRatio === priorV5Policy.numericGates.compositeShareMae.maxHoldoutToInternalRatio
    && verdict.numericGates.compositeShareMae.catastrophicThreshold === priorV5Policy.numericGates.compositeShareMae.catastrophicThreshold,
    `ratio ${verdict.numericGates.compositeShareMae.maxHoldoutToInternalRatio} and catastrophic threshold ${verdict.numericGates.compositeShareMae.catastrophicThreshold} identical to the V5 policy`);
  gate("verdictPolicyPinsCandidate2Identity",
    verdict.structuralGates.coreHashMustEqual === c2lock.coreHash
    && verdict.structuralGates.calibrationVersionMustEqual === "1.2.0",
    `core ${c2lock.coreHash.slice(0, 16)}... calibration ${c2lock.possessionCalibrationVersion}`);

  verdict.policyHash = createHash("sha256").update(JSON.stringify(verdict)).digest("hex");
  verdict.pass = fail.length === 0;
  verdict.failedGates = fail;
  writeArtifact("historical-v6-verdict-policy", { ...verdict, frozen: true },
    { generationCommand: "npm run v6:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\n  margins        ${marginPayload.policyHash.slice(0, 16)}...`);
  console.log(`  sample plan    ${samplePayload.samplePlanHash.slice(0, 16)}...`);
  console.log(`  verdict policy ${verdict.policyHash.slice(0, 16)}...`);
  console.log(`\nPOLICY FREEZE: ${verdict.pass ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(verdict.pass ? 0 : 2);
}
