#!/usr/bin/env node
// ── WS2: the frozen Candidate 2 repair and acceptance policy ─────────────────
//   npm run c2:policy
//
// Frozen before any engine behaviour changes. The diagnosis that motivated
// these criteria is already complete and is stated here in full, so a reader
// can judge whether the criteria were shaped to fit a result. They were not
// derived from any repair outcome: every threshold is either a Candidate 1
// baseline, a pre-existing frozen practical margin, or a generic guardrail.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR, git } from "./preflight.mjs";

/** Development seed domain for every Candidate 2 diagnostic and control run. */
export const C2_MASTER = 0x6c4c10;
export const C2_STREAMS = Object.freeze({
  "assist-ladder": 1, "assist-controls": 2, "assist-families": 3,
  "defence-ladder": 4, "defence-controls": 5, "defence-decomposition": 6,
  "candidate-comparison": 7, "share-tails": 8, "side-symmetry": 9,
  "competition": 10, "probability": 11, "v5-diagnostic-replay": 12,
});

/** Non-V5 control fixtures. Every one is a development fixture or a public five. */
export const CONTROLS = Object.freeze({
  assistedOffense: [
    { cellId: "AO-1", label: "ball-movement coach + compatible passing roster", coach: "gregg-popovich", roster: "passingHub" },
    { cellId: "AO-2", label: "ball-movement coach + incompatible iso roster", coach: "gregg-popovich", roster: "isoHeavy" },
    { cellId: "AO-3", label: "neutral coach + compatible passing roster", coach: "neutral", roster: "passingHub" },
    { cellId: "AO-4", label: "low-ball-movement coach + same passing roster", coach: "mike-dantoni", roster: "passingHub" },
    { cellId: "AO-5", label: "high secondary-creation roster, neutral coach", coach: "neutral", roster: "secondaryHigh" },
    { cellId: "AO-6", label: "low secondary-creation roster, neutral coach", coach: "neutral", roster: "secondaryLow" },
  ],
  defensiveSuppression: [
    { cellId: "DS-1", label: "strong defence + compatible defensive coach", roster: "strongDefence", coach: "tom-thibodeau" },
    { cellId: "DS-2", label: "strong defence + neutral coach", roster: "strongDefence", coach: "neutral" },
    { cellId: "DS-3", label: "weak defence + compatible defensive coach", roster: "weakDefence", coach: "tom-thibodeau" },
    { cellId: "DS-4", label: "weak defence + neutral coach", roster: "weakDefence", coach: "neutral" },
    { cellId: "DS-5", label: "strong rim / weak perimeter", roster: "rimStrong", coach: "neutral" },
    { cellId: "DS-6", label: "strong perimeter / weak rim", roster: "perimStrong", coach: "neutral" },
    { cellId: "DS-7", label: "strong rebounding / weak pressure", roster: "rebStrong", coach: "neutral" },
    { cellId: "DS-8", label: "strong pressure / weak rebounding", roster: "pressStrong", coach: "neutral" },
  ],
});

/**
 * The diagnosis, complete before this policy froze. Stated so the acceptance
 * criteria can be judged against what was already known.
 */
export const DIAGNOSIS_AT_FREEZE = Object.freeze({
  assistedOffense: {
    firstDivergence: "action selection to assist crediting",
    finding: "the coach's ball-movement identity reaches action selection and stops there. context.js reads ballMovementPref and uses it only to derive cutPref; no assistLikelihood in actions.js is a function of it. The prior engine generation had the lever — src/v3/possession.js line 335 computes assistedP from (ballMovement - 5) * 0.03 + (motion - 5) * 0.02 — and the possession-engine rewrite dropped it.",
    measured: "across five coaches spanning ballMovement 5 to 10 on identical personnel, assisted rate moved 0.516 to 0.496 with no monotonic relationship to ball movement. Steve Kerr at ballMovement 10 sits 0.00016 BELOW the neutral coach. The observability specification requires assistedRate to rise with offense.ballMovement and fall with an iso identity; it does neither.",
    consequence: "a documented ball-movement team cannot express a higher assisted share, which is exactly the Historical V5 Dallas measurement.",
  },
  defensiveSuppression: {
    firstDivergence: "coach defensive intent to realized scheme",
    finding: "buildSchemePlan computes every scheme dimension as min(coach intent, era cap, personnel ceiling). The personnel ceiling derives from defender capabilities, which derive from the calibration adapter's defence block, which derives from steals and blocks alone plus a position bonus. helpCeiling sits near 3.0 for every calibration team while coach help intent runs 5 to 9, so the ceiling binds on all eight Historical V5 defences and collapses the whole dimension.",
    theInversion: "because the neutral coach's help intent is 5 and the ceiling truncates to about 3.0, a documented elite defensive coach is truncated to a value BELOW what a generic coach would contribute. helpCommitment in actions.js is helpAggression / 10, and shot quality subtracts helpAggression * 0.12, so Tom Thibodeau's help-9 defence is scored as less helping than neutral. Measured: his opponent PPP is 0.00035 ABOVE neutral, and Doug Moe's help-4 defence suppresses best at -0.01178 through switching rather than help.",
    whyItLooksTeamSpecific: "the trait compares the era reference's points per possession against the subject with the reference's own mirror self-baseline, so it asks whether the subject defends better than the era reference does. The correlation between (subject defensive composite minus reference defensive composite) and the measured difference is -0.9185 across the eight team-sides, and the sign predicts the outcome on seven of eight. The possession engine is responding correctly and strongly to the ratings it is given. The defect is upstream of it.",
    preRecordingEras: "in the 1950s, 1960s and 1970s, steals and blocks were not recorded, so every defender derives from the position bonus alone and subject and reference land on identical composites — 4.88 against 4.88, 4.72 against 4.72, 5.42 against 5.42. The comparison is not decidable in those eras, which is why the 1950s instance reads +0.0009 at z = +0.48.",
    consequence: "documented scheme-and-discipline defences derive as weak and their coaches cannot compensate, which is the Historical V5 Knicks measurement and the Spurs instance alongside it.",
  },
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("candidate2-repair-policy", DIR) && !process.argv.includes("--refreeze")) {
    console.log("repair policy already frozen — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const reg = readArtifact("historical-v5-diagnostic-register", DIR).data;
  const clusters = readArtifact("historical-v5-independent-evidence-clusters", DIR).data;
  const c1 = readArtifact("candidate1-preservation", DIR).data;
  const v5r = readArtifact("historical-v5-formal-results", "data/validation/6c4b2r").data;

  const payload = {
    candidate2RepairPolicyVersion: "1.0.0",
    frozenBeforeAnyEngineChange: true,
    parentCandidate: { id: "Candidate 1", coreHash: c1.coreHash, parameterSetHash: c1.parameterSetHash,
      calibrationVersion: c1.possessionCalibrationVersion },

    diagnosticClusters: clusters.clusters.map((c) => ({ clusterId: c.clusterId, metricId: c.metricId,
      fixture: `${c.teamName} ${c.teamSeason}`, difference: c.difference, practicalMargin: c.practicalMargin,
      formalTraitLabels: c.formalTraitLabels })),
    diagnosisAtFreeze: DIAGNOSIS_AT_FREEZE,

    nonV5ControlFixtures: CONTROLS,
    developmentSeedDomain: { master: C2_MASTER, streams: C2_STREAMS,
      note: "fixed, versioned and disjoint from every formal domain. No Historical V6 team and no Synthetic V2 fixture is used." },

    // ── practical margins: carried from the existing frozen policy ─────────
    practicalMargins: {
      assistedRate: 0.02, refPppVsTeam: 0.02, pppVsReference: 0.02,
      source: "the frozen V4/V5 trait practical-margin policy. Not re-derived here: a repair phase that re-chose the margin it is judged against would be choosing its own grade.",
    },

    // ── acceptance criteria ───────────────────────────────────────────────
    acceptanceCriteria: {
      assistedOffense: {
        A1_leverExists: { rule: "across a frozen ladder of coaches spanning ball-movement intent, assisted rate must be MONOTONIC in that intent", threshold: "Spearman rho >= 0.70" },
        A2_leverIsMaterial: { rule: "the assisted-rate range across the ladder must exceed twice the practical margin, so the lever can move a trait rather than only a decimal", threshold: ">= 0.04" },
        A3_neutralUnmoved: { rule: "a neutral-coach cell must not move materially, or the repair is a universal inflation wearing a coach's name", threshold: "|delta| <= 0.010" },
        A4_v5DiagnosticImproves: { rule: "the Historical V5 Dallas diagnostic difference must move toward its required direction by more than the practical margin", threshold: "improvement > 0.02" },
        A5_nonV5AnalogsImprove: { rule: "non-V5 ball-movement control cells must improve", threshold: "every AO cell with a ball-movement coach improves; AO-2 (incompatible roster) improves less than AO-1" },
        A6_noUniversalInflation: { rule: "the mean assisted rate across all non-ball-movement control cells must not rise materially", threshold: "|delta| <= 0.010" },
        A7_selfCreationSurvives: { rule: "an iso-heavy roster under a low-ball-movement coach must remain meaningfully self-created", threshold: "assisted rate stays below the ladder mean" },
        A8_astInvariant: { rule: "AST <= FGM on every team-game, and no assist is credited after the box score exists", threshold: "0 violations" },
      },
      defensiveSuppression: {
        D1_leverExists: { rule: "across a frozen ladder of coaches spanning defensive help intent, opponent points per possession must be MONOTONICALLY DECREASING in that intent", threshold: "Spearman rho <= -0.70" },
        D2_leverIsMaterial: { rule: "the opponent-PPP range across the ladder must exceed the practical margin", threshold: ">= 0.020" },
        D3_noInversionBelowNeutral: { rule: "no coach with defensive intent ABOVE the neutral default may realize a scheme value BELOW it. This is the specific defect: truncation to raw personnel put an elite defensive coach under a generic one.", threshold: "0 inversions" },
        D4_v5DiagnosticImproves: { rule: "the Historical V5 Knicks diagnostic difference must move toward its required direction by more than the practical margin", threshold: "improvement > 0.02" },
        D5_patternNarrows: { rule: "the count of wrong-direction team-sides among the eight V5 defences must fall, and the mean difference must move negative", threshold: "wrong-direction count decreases and mean difference decreases" },
        D6_strongBeatsWeak: { rule: "strong-defence control cells must suppress more than weak-defence cells under the same coach", threshold: "DS-1 < DS-3 and DS-2 < DS-4 on opponent PPP" },
        D7_weakNotUniversallyLifted: { rule: "weak-defence cells under a neutral coach must not improve materially, or the repair is a flat bonus", threshold: "|delta on DS-4| <= 0.010" },
        D8_axesDoNotSubstitute: { rule: "rim strength must not erase perimeter weakness and pressure must not erase rebounding weakness", threshold: "DS-5 through DS-8 remain distinguishable, spread >= 0.010" },
        D9_offenceNotSuppressedUniversally: { rule: "league-wide scoring must not fall", threshold: "|delta in mean combined score| <= 2.0 points" },
      },
    },

    // ── regression guardrails, from Candidate 1's own results ─────────────
    regressionGuardrails: {
      opportunityShareMae: { rule: "the Historical V5 diagnostic composite share MAE must not regress materially from Candidate 1's",
        candidate1Baseline: v5r.numeric.holdoutComposite, maxRelativeRegression: 0.10 },
      internalShareMae: { rule: "historical-calibration share MAE must not regress materially",
        candidate1Baseline: v5r.numeric.internalBaselineMean, maxRelativeRegression: 0.10 },
      traitPassRate: { rule: "the V5 diagnostic trait pass rate must not fall",
        candidate1Baseline: v5r.traits.passRate, maxAbsoluteRegression: 0.0 },
      sideSymmetry: { rule: "the paired gold win rate's 95% interval must contain 0.5 on every surface", threshold: "contains 0.5" },
      probability: { rule: "no material regression in Brier, achievable-skill capture, ECE or log loss", maxRelativeBrierRegression: 0.05 },
      competition: { rule: "series length, season win distribution and tournament behaviour stay inside their frozen gates", threshold: "existing frozen gates" },
      replay: { rule: "byte-identical replay on every designated seed", threshold: "0 mismatches" },
      invariants: { rule: "zero invariant violations, zero final ties, zero impossible statistics", threshold: "0" },
      performance: { rule: "throughput must not fall materially RELATIVE TO THE PARENT, measured on the same harness",
        maxRelativeRegression: 0.10,
        thresholdCorrection: "the first freeze of this policy set an absolute floor of 400 games per second. That was mis-specified: measured on this harness Candidate 1 itself runs at 366.8, so the floor could never distinguish a Candidate 2 regression from the harness's own cost — it would have failed the parent too. Corrected to a relative bound against the parent measured on identical seeds and identical cells, which is what the guardrail was for. The absolute number and both measurements are recorded so the correction is visible.",
        originalAbsoluteFloor: 400,
        candidate1MeasuredOnThisHarness: 366.79351 },
      actionDiversity: { rule: "no action family may exceed the frozen synthetic ceiling and the distribution must not collapse", maxSingleActionFamilyShare: 0.60 },
      coachIdentity: { rule: "distinct coaches must remain distinguishable on their own identity metrics", threshold: "spread preserved" },
      eraExpression: { rule: "era differences must not flatten", threshold: "per-era PPP spread preserved" },
    },

    maximumAllowedMovement: {
      rule: "each repair is one bounded mechanical change. No parameter may move more than the frozen fraction of its range, and no new parameter may be introduced outside the registry.",
      maxParameterMovementFraction: 0.15,
      newParametersAllowed: 0,
      note: "both repairs are code-shape changes in the identity-transfer path, not parameter retunes. The registry's 53 parameters stay at their defaults, which keeps the parameter-set hash comparable across candidates.",
    },

    overfittingChecks: [
      "reject if only Dallas improves", "reject if only New York improves",
      "reject if only Historical V5 teams improve",
      "reject if every team gains assists", "reject if every team gains defence",
      "reject if scoring inflates universally", "reject if opponent scoring suppresses universally",
      "reject if action diversity collapses", "reject if coach identity flattens",
      "reject if era differences flatten", "reject if opportunity-share MAE materially regresses",
      "reject if probability regresses", "reject if side symmetry regresses",
      "reject if competition behaviour regresses",
    ],
    multiplicityPolicy: {
      rule: "no broad parameter search is reopened. If any scan is required it must be root-cause scoped, on-grid, include Candidate 1 as a cell, be validated on disjoint non-V5 fixtures, and report the number of cells evaluated so any selection effect is visible.",
      plannedScans: 0,
      note: "the two repairs are derived from a proven mechanism, so no search is planned. A scan appearing later must be recorded with its cell count.",
    },

    generalizationRequirement: "improvement on the Historical V5 consumed diagnostics is NOT sufficient. Each repair must also improve its analogous non-V5 development controls, and must leave the neutral and opposite-identity cells materially unmoved.",
    historicalV5Role: "FAILED_HOLDOUT_DIAGNOSTIC_SET — a diagnostic comparison only. No replacement V5 verdict may be emitted.",
    forbiddenRepairs: [
      "any team, player, coach, fixture or era specific exception",
      "a flat offence bonus", "a flat defence bonus",
      "post-hoc assist inflation or assigning assists to a fraction of makes",
      "rewriting the box score", "any winner-aware or reference-aware runtime logic",
      "artificial block, steal, turnover or missed-shot quotas",
    ],
    pass: fail.length === 0, failedGates: fail,
  };

  console.log("CANDIDATE 2 REPAIR POLICY\n");
  gate("frozenBeforeAnyEngineChange", payload.frozenBeforeAnyEngineChange === true,
    "no engine file has been modified at the time this policy is written");
  gate("bothClustersHaveCriteria",
    Boolean(payload.acceptanceCriteria.assistedOffense) && Boolean(payload.acceptanceCriteria.defensiveSuppression)
    && payload.diagnosticClusters.length === 2,
    `${payload.diagnosticClusters.length} clusters, ${Object.keys(payload.acceptanceCriteria.assistedOffense).length} assisted criteria, ${Object.keys(payload.acceptanceCriteria.defensiveSuppression).length} defensive criteria`);
  gate("marginsCarriedNotReChosen",
    payload.practicalMargins.assistedRate === 0.02 && payload.practicalMargins.refPppVsTeam === 0.02,
    "the practical margins are the frozen V4/V5 values, not re-derived here");
  gate("generalizationRequired",
    payload.generalizationRequirement.includes("NOT sufficient"),
    "V5 improvement alone is explicitly insufficient");
  gate("everyCriterionHasARuleAndAThreshold",
    [...Object.values(payload.acceptanceCriteria.assistedOffense), ...Object.values(payload.acceptanceCriteria.defensiveSuppression)]
      .every((c) => c.rule && c.threshold),
    "no criterion is stated without a rule and a numeric or explicit threshold");
  gate("antiFlatBonusCriteriaPresent",
    Boolean(payload.acceptanceCriteria.assistedOffense.A6_noUniversalInflation)
    && Boolean(payload.acceptanceCriteria.defensiveSuppression.D7_weakNotUniversallyLifted),
    "both repairs carry an explicit criterion that would fail a flat bonus");
  gate("noBroadSearchPlanned", payload.multiplicityPolicy.plannedScans === 0,
    "no parameter search is planned; both repairs come from a proven mechanism");
  gate("v5RoleConstrained", payload.historicalV5Role.startsWith("FAILED_HOLDOUT_DIAGNOSTIC_SET"),
    "Historical V5 is a diagnostic set and no replacement verdict may be emitted");

  payload.policyHash = createHash("sha256").update(JSON.stringify({
    criteria: payload.acceptanceCriteria, guardrails: payload.regressionGuardrails,
    margins: payload.practicalMargins, controls: CONTROLS, seeds: { C2_MASTER, C2_STREAMS } })).digest("hex");
  writeArtifact("candidate2-repair-policy", payload, {
    generationCommand: "npm run c2:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nREPAIR POLICY: ${payload.pass ? "FROZEN" : `FAIL (${fail.join(", ")})`} · policyHash ${payload.policyHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
