#!/usr/bin/env node
// ── WS1: the Historical V5 diagnostic register ──────────────────────────────
//   npm run c2:register
//
// Every failing trait instance, read from the fixture artifact rather than from
// prose, with its full measurement context. Then the three formal hard-fail
// labels are reconciled into independent evidence clusters, because two of them
// are the same observation reported under two trait names.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR, B2R, git } from "./preflight.mjs";

/** Every trait instance in the V5 run, flattened with its fixture context. */
export const allTraitInstances = () => {
  const f = readArtifact("historical-v5-fixture-results", B2R).data;
  const out = [];
  for (const m of f.fixtures) {
    for (const side of ["teamA", "teamB"]) {
      const s = m[side]; if (!s) continue;
      for (const [i, t] of (s.traits ?? []).entries()) {
        out.push({
          failureId: `${m.matchupId}:${side}:${t.traitId}:${t.metric}`,
          fixtureId: s.fixtureId, matchupId: m.matchupId, side,
          teamId: s.fixtureId, teamName: s.teamName, teamSeason: s.season,
          eraStyleId: m.eraStyleId,
          traitId: t.traitId, metricId: t.metric,
          measurementSurface: t.surface, expectedDirection: t.direction,
          observedValue: t.subjectMean, referenceValue: t.referenceMean,
          difference: t.diff, practicalMargin: t.practicalMargin, zScore: t.z, ci95: t.ci95,
          beyondPracticalMargin: t.beyondPracticalMargin,
          statisticallyOpposite: t.statisticallyOpposite,
          result: t.result, hardFail: Boolean(t.hardFail), reportedState: t.reportedState,
          traitIndex: i,
        });
      }
    }
  }
  return out;
};

/**
 * Two trait labels belong to one independent measurement when they share the
 * fixture, side, metric, surface, direction and observed value. The formal
 * labels are all preserved; only the EVIDENCE count collapses.
 */
export const measurementKey = (t) =>
  `${t.matchupId}|${t.side}|${t.metricId}|${t.measurementSurface}|${t.expectedDirection}|${t.observedValue}|${t.referenceValue}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const v5r = readArtifact("historical-v5-formal-results", B2R).data;
  const all = allTraitInstances();
  const failing = all.filter((t) => t.result === "FAIL");
  const hard = failing.filter((t) => t.hardFail);
  const soft = failing.filter((t) => !t.hardFail);

  // ── classify each failing instance ──────────────────────────────────────
  const classified = failing.map((t) => ({
    ...t,
    traitFamily: t.metricId === "refPppVsTeam" ? "DEFENSIVE_SUPPRESSION"
      : t.metricId === "assistedRate" ? "ASSISTED_OFFENSE_EXPRESSION"
      : `OTHER:${t.metricId}`,
    formalClassification: t.hardFail ? "FORMAL_HARD_FAIL" : "PRACTICAL_MARGIN_CONTAINED",
    engineChangeRequired: t.hardFail,
    confidence: t.statisticallyOpposite
      ? (t.beyondPracticalMargin ? "STATISTICALLY_OPPOSITE_AND_PRACTICALLY_MATERIAL"
        : "STATISTICALLY_OPPOSITE_BUT_SUB_MARGIN")
      : "NOT_STATISTICALLY_DISTINGUISHABLE_FROM_ZERO",
  }));

  // ── independent evidence clusters ───────────────────────────────────────
  const byMeasurement = new Map();
  for (const t of hard) {
    const k = measurementKey(t);
    if (!byMeasurement.has(k)) byMeasurement.set(k, []);
    byMeasurement.get(k).push(t);
  }
  const clusters = [...byMeasurement.entries()].map(([key, members], i) => {
    const m = members[0];
    const clusterId = m.metricId === "assistedRate" ? "ASSISTED_OFFENSE_EXPRESSION"
      : m.metricId === "refPppVsTeam" ? "DEFENSIVE_SUPPRESSION"
      : `CLUSTER_${i + 1}`;
    return { clusterId, measurementKey: key,
      formalTraitLabels: members.map((x) => x.traitId),
      formalLabelCount: members.length,
      independentMeasurements: 1,
      fixtureId: m.fixtureId, matchupId: m.matchupId, side: m.side,
      teamName: m.teamName, teamSeason: m.teamSeason, eraStyleId: m.eraStyleId,
      metricId: m.metricId, measurementSurface: m.measurementSurface,
      expectedDirection: m.expectedDirection,
      observedValue: m.observedValue, referenceValue: m.referenceValue,
      difference: m.difference, practicalMargin: m.practicalMargin, zScore: m.zScore, ci95: m.ci95,
      underlyingMechanic: m.metricId === "assistedRate"
        ? "the chain from action selection through pass-created opportunity to assist crediting"
        : "the chain from team defensive personnel and scheme through opponent shot quality to realized opponent points per possession",
      duplicateLabelNote: members.length > 1
        ? `${members.length} formal trait labels (${members.map((x) => `"${x.traitId}"`).join(", ")}) report ONE observation: identical fixture, side, metric, surface, direction, observed and reference values. Both labels are preserved in the register; the evidence count is 1.`
        : null };
  });

  // ── the wider defensive picture, not just the failing instances ──────────
  const defAll = all.filter((t) => t.metricId === "refPppVsTeam");
  const defByTeamSide = [...new Map(defAll.map((t) => [`${t.matchupId}|${t.side}`, t])).values()];
  const defWrong = defByTeamSide.filter((t) => t.difference > 0);
  const defWrongSig = defWrong.filter((t) => t.statisticallyOpposite);
  const defRight = defByTeamSide.filter((t) => t.difference <= 0);

  console.log("HISTORICAL V5 DIAGNOSTIC REGISTER\n");
  console.log(`  ${all.length} trait instances scored, ${failing.length} failing (${hard.length} hard, ${soft.length} practical-margin contained)`);
  console.log(`  ${clusters.length} independent evidence clusters from ${hard.length} formal hard-fail labels\n`);
  for (const c of clusters) {
    console.log(`  ${c.clusterId}`);
    console.log(`    ${c.teamName} ${c.teamSeason} (${c.matchupId}, ${c.eraStyleId}, ${c.side})`);
    console.log(`    ${c.metricId} on ${c.measurementSurface}, required ${c.expectedDirection}`);
    console.log(`    observed ${c.observedValue} vs reference ${c.referenceValue} = ${c.difference} (margin ${c.practicalMargin}, z ${c.zScore})`);
    console.log(`    formal labels: ${c.formalTraitLabels.join(", ")}`);
  }
  console.log(`\n  DEFENSIVE SUPPRESSION, every team-side that carries the metric:`);
  for (const t of defByTeamSide.sort((a, b) => a.matchupId.localeCompare(b.matchupId))) {
    console.log(`    ${t.matchupId} ${t.eraStyleId} ${String(t.teamName).slice(0, 22).padEnd(22)} ${String(t.difference).padStart(9)}  z ${String(t.zScore).padStart(9)}  ${t.difference > 0 ? "WRONG" : "right"} ${t.statisticallyOpposite ? "(significant)" : ""}`);
  }

  gate("everyFailingInstanceRegisteredExactlyOnce",
    classified.length === failing.length
    && new Set(classified.map((t) => t.failureId)).size === classified.length,
    `${classified.length} failing instances, ${new Set(classified.map((t) => t.failureId)).size} distinct failureIds`);
  gate("registerCountsMatchTheFormalArtifact",
    failing.length === v5r.traits.failed && hard.length === v5r.hardFailureCount
    && soft.length === v5r.softFailureCount,
    `failing ${failing.length} = ${v5r.traits.failed}, hard ${hard.length} = ${v5r.hardFailureCount}, soft ${soft.length} = ${v5r.softFailureCount}`);
  gate("everyHardFailureAssignedToOneCluster",
    hard.every((t) => clusters.filter((c) => c.formalTraitLabels.includes(t.traitId)
      && c.matchupId === t.matchupId && c.side === t.side).length === 1),
    `each of ${hard.length} hard labels belongs to exactly one cluster`);
  gate("independentEvidenceCountMatchesTheArtifact",
    clusters.length === v5r.distinctHardFailMeasurements,
    `${clusters.length} clusters = ${v5r.distinctHardFailMeasurements} distinct measurements recorded by the formal run`);
  gate("expectedClustersPresent",
    clusters.some((c) => c.clusterId === "ASSISTED_OFFENSE_EXPRESSION")
    && clusters.some((c) => c.clusterId === "DEFENSIVE_SUPPRESSION"),
    clusters.map((c) => c.clusterId).join(", "));
  gate("everyPracticalMarginItemExcludedFromRepair",
    classified.filter((t) => t.formalClassification === "PRACTICAL_MARGIN_CONTAINED")
      .every((t) => t.engineChangeRequired === false),
    `all ${soft.length} contained failures carry engineChangeRequired = false`);
  gate("noDuplicateIndependentEvidence",
    new Set(clusters.map((c) => c.measurementKey)).size === clusters.length,
    "no two clusters share a measurement key");
  gate("formalLabelsPreserved",
    clusters.reduce((a, c) => a + c.formalLabelCount, 0) === hard.length,
    `${clusters.reduce((a, c) => a + c.formalLabelCount, 0)} formal labels preserved across ${clusters.length} clusters`);

  const payload = {
    historicalV5DiagnosticRegistryVersion: "1.0.0",
    source: { fixtureResults: `${B2R}/historical-v5-fixture-results.json`,
      formalResults: `${B2R}/historical-v5-formal-results.json`,
      formalVerdict: `${B2R}/historical-v5-formal-verdict.json`,
      readFromArtifactsNotProse: true },
    historicalV5Role: "FAILED_HOLDOUT_DIAGNOSTIC_SET",
    traitInstancesScored: all.length,
    nominalFailingInstances: failing.length,
    formalHardFailInstances: hard.length,
    practicalMarginContainedInstances: soft.length,
    independentEvidenceClusters: clusters.length,
    failures: classified,
    defensiveSuppressionSurvey: {
      note: "the full picture, not only the failing instances. This is what the pattern claim has to be judged against.",
      instances: defAll.length,
      matchupsCarryingMetric: new Set(defAll.map((t) => t.matchupId)).size,
      distinctTeamSides: defByTeamSide.length,
      wrongDirectionTeamSides: defWrong.length,
      wrongDirectionAndStatisticallyOpposite: defWrongSig.length,
      correctDirectionTeamSides: defRight.length,
      teamSides: defByTeamSide.map((t) => ({ matchupId: t.matchupId, eraStyleId: t.eraStyleId,
        teamName: t.teamName, teamSeason: t.teamSeason, difference: t.difference, zScore: t.zScore,
        statisticallyOpposite: t.statisticallyOpposite, result: t.result, hardFail: t.hardFail })),
      meanDifference: Math.round(defByTeamSide.reduce((a, t) => a + t.difference, 0) / defByTeamSide.length * 100000) / 100000,
      patternCharacterisation: `${defWrong.length} of ${defByTeamSide.length} team-sides are in the wrong direction and ${defWrongSig.length} significantly so, against ${defRight.length} correctly suppressing. The mean difference across all team-sides is near zero, so this is NOT a uniform downward bias on team defence — it is heterogeneous, and the diagnosis has to explain which defences fail rather than assume all do.`,
    },
    reconciliation: {
      handoffClaim: "the defensive metric failed in the same direction on 5 of 8 matchups",
      artifactTruth: `${defWrong.length} of ${new Set(defAll.map((t) => t.matchupId)).size} matchups carrying the metric are wrong-direction; ${defWrongSig.length} team-sides are significantly so`,
      correction: "the prior phase's prose stated five while enumerating four. Four is the wrong-direction matchup count. Three is the count that is also statistically opposite.",
    },
    engineChangeRequiredCount: classified.filter((t) => t.engineChangeRequired).length,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.registerHash = createHash("sha256").update(JSON.stringify(
    classified.map((t) => [t.failureId, t.formalClassification, t.engineChangeRequired]))).digest("hex");
  writeArtifact("historical-v5-diagnostic-register", payload, {
    generationCommand: "npm run c2:register", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("historical-v5-independent-evidence-clusters", {
    historicalV5IndependentEvidenceVersion: "1.0.0",
    formalHardFailLabels: hard.length,
    independentEvidenceClusters: clusters.length,
    collapseRule: "two formal trait labels are one independent measurement when they share fixture, side, metric, surface, expected direction, observed value and reference value. Every formal label is preserved; only the evidence count collapses.",
    clusters,
    whyThisMatters: "the verdict is identical either way, because the gate is zero hard failures. But a repair phase that believes it has three independent signals will look for three causes, and one of them does not exist.",
    pass: fail.length === 0,
  }, { generationCommand: "npm run c2:register", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nREGISTER: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.registerHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
