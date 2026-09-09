#!/usr/bin/env node
// ── Historical V4 failure register ──────────────────────────────────────────
//   npm run c1:register
//
// Every V4 hard failure, read from historical-holdout-v4-results.json — never
// from prose — carried with its full identity and classified exactly once.
// Classification uses the frozen V4 policy's margins plus the practical margins
// the replacement verdict computed, so the register's substantive/marginal
// split reconciles with the verdict's by construction.
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { TRAIT_TABLE } from "../validation/traitRegistry.mjs";

const V6C3R = "data/validation/6c3r";
export const DIR = "data/validation/6c4a";

// The mechanic chain each metric flows through, for root-cause navigation.
const MECHANIC_PATH = {
  pppVsReference: "player intelligence -> team intelligence -> opportunity allocation -> action selection -> possession resolution -> points per possession",
  refPppVsTeam: "player defensive intelligence -> defensive assignments -> matchup resolution -> possession defence -> opponent points per possession",
  movementShare: "coach action-mix deployment -> family weights -> normalization -> action-family reachability -> ledger action share",
  orebRate: "player rebounding inputs -> box-out/crash resolution -> MISS_OREB vs MISS_DREB outcome",
  orebRateAgainst: "defensive rebounding inputs -> opponent second-chance suppression",
  assistedRate: "creation/passing intelligence -> assisted-make attribution",
  threeShare: "shot-profile weights -> era scaling -> attempt mix",
  gamePace: "era pace -> coach tempo -> possession count",
};

export const buildRegister = () => {
  const v4 = readArtifact("historical-holdout-v4-results", V6C3R);
  const verdict = readArtifact("replacement-formal-verdict", V6C3R);
  const manifest = readArtifact("historical-holdout-v4-manifest", V6C3R).data;
  const corpus = JSON.parse(readFileSync(`${V6C3R}/historical-corpus-v4.json`, "utf8"));
  const marginalIds = new Set(verdict.data.diagnosis.marginalHardFails.map((t) => `${t.matchupId}|${t.team}|${t.traitId}`));

  const failures = [];
  let n = 0;
  for (const r of v4.data.results) {
    for (const team of [r.teamA, r.teamB]) {
      const fixture = corpus.fixtures.find((f) => f.fixtureId === team.fixtureId);
      for (const t of team.traits.filter((x) => x.hardFail)) {
        n += 1;
        const key = `${r.matchupId}|${team.teamName} ${team.season}|${t.traitId}`;
        const isMarginal = marginalIds.has(key);
        const reg = TRAIT_TABLE[t.traitId];
        // category assignment: exactly one
        let category;
        if (isMarginal) category = "PRACTICAL_MARGIN_ONLY";
        else if (t.metric === "movementShare" && t.subjectMean === 0) category = "COACH_DEPLOYMENT_SATURATION";
        else if (t.metric === "pppVsReference") category = "OFFENSIVE_IDENTITY_FAILURE";
        else if (t.metric === "refPppVsTeam") category = "DEFENSIVE_IDENTITY_FAILURE";
        else if (t.metric === "orebRate") category = "OFFENSIVE_IDENTITY_FAILURE";
        else category = "OTHER_SUBSTANTIVE_ENGINE_FAILURE";
        failures.push({
          failureId: `v4f-${String(n).padStart(2, "0")}`,
          matchupId: r.matchupId, teamId: fixture.teamId, fixtureId: team.fixtureId,
          teamSeason: `${team.teamName} ${team.season}`, eraStyleId: r.eraStyleId, coachId: fixture.coachId,
          traitId: t.traitId, traitFamily: reg.family, observabilityClass: reg.cls,
          metricId: t.metric, referenceSurface: t.surface,
          expectedDirection: t.direction, observedValue: t.subjectMean, referenceValue: t.referenceMean,
          difference: t.diff, z: t.z, confidence: "MEDIUM",
          policyThreshold: "sign + 95% CI excluding zero (frozen V4 policy: no practical margin)",
          practicalMargin: verdictMargin(t.metric),
          formalResult: "HARD_FAIL",
          category,
          candidateMechanicPath: MECHANIC_PATH[t.metric] ?? "unmapped",
        });
      }
    }
  }
  return { failures, hardFailCount: v4.data.traits.hardFails.length };
};

const verdictMargin = (metric) =>
  ({ pppVsReference: 0.02, refPppVsTeam: 0.02, gamePace: 1.0, threeShare: 0.02, orebRate: 0.02,
     orebRateAgainst: 0.02, assistedRate: 0.02, movementShare: 0.03 }[metric] ?? 0.02);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures, hardFailCount } = buildRegister();
  const byCategory = {};
  for (const f of failures) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  const substantive = failures.filter((f) => f.category !== "PRACTICAL_MARGIN_ONLY");

  // Per-substantive-failure repair scaffolding (Part 7)
  const registerDetail = substantive.map((f) => ({
    ...f,
    engineChangeRequired: true,
    suspectedMechanic: f.category === "COACH_DEPLOYMENT_SATURATION"
      ? "coach action-mix deployment starving a family to zero weight after normalization"
      : f.metricId === "orebRate"
        ? "offensive-rebound resolution inputs: career-table profiles carry total rebounds only, offensiveRebounds null"
        : f.metricId === "pppVsReference"
          ? "elite-offence compression between season-stat profiles and possession conversion"
          : "elite-defence compression between season-stat profiles and possession defence",
    firstDiagnosticFixture: f.fixtureId,
    requiredConditionalMetrics: [f.metricId],
    candidateAcceptanceCriteria: `direction corrected beyond the ${verdictMargin(f.metricId)} practical margin on the same surface, via the intended mechanic`,
    regressionGuardrails: ["share-proxy composite within frozen regression bound", "no universal quality shift on calibration fixtures", "side symmetry intact", "replay exact"],
  }));

  const payload = {
    historicalV4DiagnosticRegistryVersion: "1.0.0",
    source: "data/validation/6c3r/historical-holdout-v4-results.json (consumed FAILED_HOLDOUT_DIAGNOSTIC_SET)",
    hardFailuresInVerdict: hardFailCount,
    failuresRegistered: failures.length,
    reconciles: failures.length === hardFailCount,
    byCategory,
    marginArtifacts: failures.filter((f) => f.category === "PRACTICAL_MARGIN_ONLY").map((f) => ({
      failureId: f.failureId, traitId: f.traitId, teamSeason: f.teamSeason, difference: f.difference,
      directionCheck: "wrong side of the reference, magnitude below the prospectively justified practical margin",
      ENGINE_CHANGE_REQUIRED: false, POLICY_V3_CHANGE_REQUIRED: true,
    })),
    substantiveCount: substantive.length,
    failures, registerDetail,
  };
  const { path } = writeArtifact("historical-v4-failure-register", payload, {
    generationCommand: "npm run c1:register",
    sourceArtifacts: [`${V6C3R}/historical-holdout-v4-results.json`, `${V6C3R}/replacement-formal-verdict.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR });

  console.log(`hard failures in verdict ${hardFailCount} · registered ${failures.length} · reconciles ${payload.reconciles}`);
  console.log("by category:", JSON.stringify(byCategory, null, 1));
  for (const f of failures) console.log(`  ${f.failureId}  ${f.category.padEnd(32)} ${f.teamSeason.padEnd(32)} ${f.traitId.padEnd(28)} ${f.metricId.padEnd(16)} diff ${f.difference}`);
  console.log(`wrote ${path}`);
  process.exit(payload.reconciles ? 0 : 2);
}
