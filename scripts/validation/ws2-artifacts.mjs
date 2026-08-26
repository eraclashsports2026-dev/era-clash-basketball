#!/usr/bin/env node
// ── Emit WS2 artifacts: trait registry, dependency graph, observability map ──
//   npm run validation:6c3r:traits
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { buildRegistry, registryHash, DEPENDENCY_GROUPS, detectContradictions, TRAIT_TABLE } from "./traitRegistry.mjs";
import { METRICS } from "./surface.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";

if (import.meta.url === `file://${process.argv[1]}`) {
  const reg = buildRegistry();
  const common = { generationCommand: "npm run validation:6c3r:traits", extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash }, dir: DIR };

  const w1 = writeArtifact("historical-trait-registry", { ...reg, registryHash: registryHash(),
    builtFrom: "Trait semantics and metric identifiability only. No Candidate 0 output on any fixture was consulted, and no holdout artifact was read.",
  }, { ...common, sourceArtifacts: ["data/calibration/historical-targets-v3.json"] });

  // The V3 rubric, run through the detector, as permanent evidence the machine
  // rejects the defect that consumed V3.
  const v3rubric = [
    { traitId: "ELITE_OFFENSE", metric: "pppVsReference", direction: "ABOVE_REFERENCE_BASELINE", surface: "MIRROR" },
    { traitId: "ELITE_DEFENSE", metric: "refPppVsTeam", direction: "BELOW_REFERENCE_BASELINE", surface: "MIRROR" },
  ];
  const w2 = writeArtifact("metric-dependency-graph", {
    historicalMeasurementSurfaceVersion: VALIDATION_VERSIONS.historicalMeasurementSurfaceVersion,
    metrics: Object.entries(METRICS).map(([id, m]) => ({ id, identifiableOn: m.identifiableOn, group: m.group, note: m.note ?? null })),
    dependencyGroups: DEPENDENCY_GROUPS,
    v3RubricRejection: { rubric: v3rubric, problems: detectContradictions(v3rubric) },
    contradictionsInRubric: [],
    mirrorRule: "On a MIRROR surface both sides are the same roster, so pointsPerPossession and opponentPointsPerPossession are one quantity (V3 measured max separation 0.00348). The metric catalogue makes this structural: pppVsReference is identifiable only on VS_ERA_REFERENCE, refPppVsTeam only on REFERENCE_VS_TEAM, and the detector hard-fails any rubric that scores either on a mirror.",
  }, { ...common, sourceArtifacts: [] });

  // per-trait observability rows for the report and the policy
  const w3 = writeArtifact("trait-metric-observability", {
    observabilityCertificationVersion: VALIDATION_VERSIONS.observabilityCertificationVersion,
    stage: "PRE_CERTIFICATION",
    note: "scoringEligibility here is the registry's pre-certification view. Final eligibility is granted only by observability-control-results.json: a trait whose metric fails its strong/neutral/weak controls loses eligibility whatever this file says.",
    rows: reg.traits.map((t) => ({ traitId: t.traitId, observabilityClass: t.observabilityClass,
      primaryMetric: t.primaryMetrics[0] ?? null, expectedDirection: t.expectedDirection,
      requiredMeasurementSurface: t.requiredMeasurementSurface, contextDependencies: t.contextDependencies,
      scoringEligibility: t.scoringEligibility, eligibilityNote: t.eligibilityNote })),
    counts: reg.counts,
  }, { ...common, sourceArtifacts: [`${DIR}/historical-trait-registry.json`] });

  console.log(`traits ${reg.counts.total} · eligible(pre-cert) ${reg.counts.scoringEligible} · unobservable ${reg.counts.byClass.UNOBSERVABLE_ON_THIS_SURFACE}`);
  for (const w of [w1, w2, w3]) console.log(`wrote ${w.path}`);
}
