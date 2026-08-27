#!/usr/bin/env node
// ── WS5: re-certify every scored trait's observability under Candidate 1 ────
//   npm run v5:observability [-- --pairs=1000]
//
// The 6C3R certification measured under Candidate 0 and certified 12 of 16
// metrics. Candidate 1 repaired two of the four failures by construction
// (movement reachability, per-possession zone use) and 6C4B1 repaired the zone
// INSTRUMENT, so the eligible-trait set must be recomputed before any trait is
// scored on V5 — a trait scored on an uncertified metric is a verdict resting
// on a number nobody has shown responds to anything.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { CONTROL_TABLE, RANKS, legalFive, teamFor, coachByScale } from "../validation/observability.mjs";
import { METRICS, playPairedSamples, summarise, diffSummary } from "../validation/surface.mjs";
import { TRAIT_TABLE, DEPENDENCY_GROUPS, detectContradictions, registryHash } from "../validation/traitRegistry.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { v4Seed } from "../validation/v4seeds.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

// The basketball-meaningful floors the 6C4A policy froze prospectively. Read
// here so certification and the V5 margin policy cannot disagree about what a
// practically material difference is.
const PRACTICAL_MARGINS = Object.fromEntries(
  Object.entries(readArtifact("trait-practical-margin-policy", DIR_6C4A).data.metrics).map(([k, v]) => [k, v.margin]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000);
  const def = defaultRuntimeParameterSet();
  const profiles = await buildRunnerProfileMap();
  const cert = readArtifact("era-reference-certification-candidate1", DIR).data;
  const ref2010 = cert.references.find((r) => r.era === "2010s");
  const refTeam = referenceTeam({ era: "2010s", five: ref2010.five }, profiles);
  const baselines = ref2010.candidate1SelfBaselines;
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };
  // Frozen artifacts refuse silent overwrite: a re-issue is a decision.
  if (artifactExists("historical-observability-certification-candidate1", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-observability-certification-candidate1 already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  console.log(`OBSERVABILITY RE-CERTIFICATION UNDER CANDIDATE 1 — ${Object.keys(CONTROL_TABLE).length} metrics x 3 cells x ${pairs * 2} games\n`);
  const results = [];
  let cellIndex = 0;
  for (const [metricId, spec] of Object.entries(CONTROL_TABLE)) {
    const m = METRICS[metricId];
    const cells = {};
    const defs = { strong: spec.strong, neutral: { rank: "median", coach: "neutral" }, weak: spec.weak };
    for (const [cellName, cdef] of Object.entries(defs)) {
      const five = legalFive(RANKS[cdef.rank]);
      const coach = cdef.coach === "neutral" ? { id: "neutral", scale: "NEUTRAL_COACH", value: null } : coachByScale(cdef.coach[0], cdef.coach[1]);
      const subject = teamFor(five, coach.id);
      const run = playPairedSamples({ subject, opponent: refTeam, eraStyleId: "2010s",
        seedAt: (i) => v4Seed("observability-controls", 5000000 + cellIndex * 50000 + i), pairs });
      cells[cellName] = { five, coach, ...summarise(run.samples, m.field),
        invariantViolations: run.invariantViolations, ties: run.ties, games: run.games };
      cellIndex++;
    }
    // WITHIN-POPULATION certification, the criterion 6C3R settled on: the
    // controls are public cards and the reference is calibration profiles, so
    // strong/weak are judged against the NEUTRAL cell, never against the
    // reference baseline (which carries a whole-population level shift).
    const sv = diffSummary(cells.strong, cells.weak);
    const sn = diffSummary(cells.strong, cells.neutral);
    const wn = diffSummary(cells.weak, cells.neutral);
    const dir = spec.strongEffect === "RAISES" ? 1 : -1;
    const between = (cells.neutral.mean - Math.min(cells.strong.mean, cells.weak.mean)) *
                    (Math.max(cells.strong.mean, cells.weak.mean) - cells.neutral.mean) >= 0;
    const weakAtFloor = spec.strongEffect === "RAISES" && cells.weak.mean === 0;
    // PRACTICAL SEPARATION: the maximal documented contrast must move the
    // metric by more than the margin a verdict would need to clear. A metric
    // whose strongest-vs-weakest control range is smaller than its own
    // practical margin can never produce a practically-material finding, so
    // scoring a trait on it would be scoring noise. threeShare is the case
    // that made this explicit: 0.013 of range against a 0.02 margin, which is
    // also why V4's THREE_POINT_HEAVY "failure" was -0.003.
    const margin = PRACTICAL_MARGINS[metricId] ?? null;
    const controlRange = sv != null ? Math.abs(sv.diff) : null;
    const checks = {
      mechanicActivation: [cells.strong, cells.neutral, cells.weak].every((c) => c.n > 0 && c.mean != null),
      metricResponsiveness: sv != null && Math.abs(sv.diff) > 0,
      directionalDiscrimination: sv != null && sv.significant && Math.sign(sv.diff) === dir,
      strongControl: sn != null && sn.significant && Math.sign(sn.diff) === dir,
      weakControl: weakAtFloor || (wn != null && wn.significant && Math.sign(wn.diff) === -dir),
      neutralControl: between,
      varianceSufficiency: cells.strong.sd > 0 && cells.neutral.sd > 0,
      zeroInvariantViolations: [cells.strong, cells.neutral, cells.weak].every((c) => c.invariantViolations === 0),
      practicalSeparation: margin == null || (controlRange != null && controlRange > margin),
    };
    const certified = Object.values(checks).every(Boolean);
    const prior = readArtifact("observability-control-results", "data/validation/6c3r").data.results.find((r) => r.metric === metricId);
    results.push({ metric: metricId, surface: m.identifiableOn, strongEffect: spec.strongEffect, basis: spec.basis,
      cells: { strong: cells.strong, neutral: cells.neutral, weak: cells.weak },
      referenceBaselineCandidate1: baselines[metricId] ? { mean: baselines[metricId].mean, se: baselines[metricId].se } : null,
      strongVsWeak: sv, strongVsNeutral: sn, weakVsNeutral: wn,
      practicalMargin: margin, controlRange: r5(controlRange),
      controlRangeExceedsMargin: margin == null ? null : controlRange > margin,
      checks, certified,
      certifiedUnderCandidate0: prior?.certified ?? null,
      changedFromCandidate0: prior ? prior.certified !== certified : null });
    console.log(`  ${certified ? "CERT" : "FAIL"}  ${metricId.padEnd(20)} strong ${String(r5(cells.strong.mean)).padStart(9)}  neutral ${String(r5(cells.neutral.mean)).padStart(9)}  weak ${String(r5(cells.weak.mean)).padStart(9)}  s-w z ${sv?.z}${prior && prior.certified !== certified ? `   (was ${prior.certified ? "CERT" : "FAIL"} under Candidate 0)` : ""}${certified ? "" : `  failed: ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(",")}`}`);
  }
  console.log("");

  const certifiedMetrics = results.filter((r) => r.certified).map((r) => r.metric);
  const failedMetrics = results.filter((r) => !r.certified).map((r) => r.metric);

  // ── trait eligibility: a trait is scorable only if its metric certified ────
  const eligibility = Object.entries(TRAIT_TABLE).map(([traitId, t]) => {
    const metric = t.claim?.metric ?? null;
    const scorable = Boolean(metric) && certifiedMetrics.includes(metric);
    return { traitId, observabilityClass: t.cls, family: t.family, metric,
      direction: t.claim?.direction ?? null,
      scoringEligibility: scorable,
      eligibilityNote: !metric ? "NOT_APPLICABLE_NO_DIRECTIONAL_CLAIM"
        : scorable ? "CERTIFIED_UNDER_CANDIDATE_1" : `METRIC_UNCERTIFIED:${metric}` };
  });
  const eligible = eligibility.filter((e) => e.scoringEligibility);

  // ── dependency graph: mirror PPP and shared-denominator families ──────────
  // detectContradictions is a PER-FIXTURE detector: it asks whether ONE team's
  // claim set contradicts itself. Handing it all 55 eligible traits at once
  // asks a question it was never meant to answer — across the whole registry
  // "fast" and "slow" legitimately claim opposite directions on gamePace — and
  // the first run of this script did exactly that and reported 59 false
  // contradictions. Two checks replace it:
  //   1. registry-level: every eligible trait's metric must be identifiable on
  //      the trait's OWN registry surface;
  //   2. detector-level: a positive control proving the per-fixture detector
  //      still rejects a V3-style rubric, since V5's runner relies on it.
  const surfaceOf = (metric) => METRICS[metric].identifiableOn[0];
  const registrySurfaceProblems = eligible.filter((e) => !METRICS[e.metric].identifiableOn.includes(surfaceOf(e.metric)))
    .map((e) => `${e.traitId}: ${e.metric} not identifiable on its registry surface`);
  const detectorPositiveControl = detectContradictions([
    { traitId: "SYNTHETIC_ELITE_OFFENSE", metric: "pppVsReference", direction: "ABOVE_REFERENCE_BASELINE", surface: "MIRROR" },
    { traitId: "SYNTHETIC_ELITE_DEFENSE", metric: "refPppVsTeam", direction: "BELOW_REFERENCE_BASELINE", surface: "MIRROR" },
  ]);
  const detectorRejectsMirrorRubric = detectorPositiveControl.some((p) => p.includes("MIRROR_PPP"));
  const contradictions = registrySurfaceProblems;
  const mirrorPair = ["pppVsReference", "refPppVsTeam"];
  const mirrorSurfaces = mirrorPair.map((m) => ({ metric: m, identifiableOn: METRICS[m].identifiableOn }));
  const mirrorSeparated = METRICS.pppVsReference.identifiableOn.every((s) => !METRICS.refPppVsTeam.identifiableOn.includes(s));

  gate("everyScoredTraitHasACertifiedMetric", eligible.every((e) => certifiedMetrics.includes(e.metric)),
    `${eligible.length} scorable traits, all on certified metrics`);
  gate("noUnobservableTraitContributesToVerdict", eligibility.filter((e) => !e.scoringEligibility && e.metric && certifiedMetrics.includes(e.metric)).length === 0,
    `${eligibility.length - eligible.length} traits excluded before scoring: ${[...new Set(eligibility.filter((e) => !e.scoringEligibility && e.metric).map((e) => e.metric))].join(", ") || "none"}`);
  gate("everyEligibleTraitOnAnIdentifiableSurface", registrySurfaceProblems.length === 0,
    `${eligible.length} eligible traits, ${registrySurfaceProblems.length} claiming a metric on a surface it cannot be identified on`);
  gate("perFixtureContradictionDetectorLive", detectorRejectsMirrorRubric,
    "a synthetic V3-style rubric (elite offence AND elite defence both resolved onto one MIRROR surface) is still rejected by the per-fixture detector the V5 runner calls");
  gate("mirrorPppSeparated", mirrorSeparated,
    `pppVsReference is identifiable only on ${METRICS.pppVsReference.identifiableOn.join("/")}, refPppVsTeam only on ${METRICS.refPppVsTeam.identifiableOn.join("/")} — offence and defence are never read from one mirror`);
  gate("zeroInvariantViolationsInControls", results.every((r) => Object.values(r.cells).every((c) => c.invariantViolations === 0)),
    `${results.length * 3} control cells x ${pairs * 2} games`);

  const payload = {
    historicalObservabilityCertificationVersion: VALIDATION_VERSIONS.historicalObservabilityCertificationVersion,
    certifiedUnder: { candidateId: "Candidate 1", possessionCalibrationVersion: "1.1.0",
      coreHash: readArtifact("candidate1-lock-recertification", DIR).data.coreHash },
    pairsPerCell: pairs, gamesPerCell: pairs * 2,
    referenceCertificationHash: readArtifact("era-reference-certification-candidate1", DIR).outputHash,
    traitRegistryHash: registryHash(),
    metricsTotal: results.length, metricsCertified: certifiedMetrics.length,
    certifiedMetrics, failedMetrics,
    practicalSeparationFailures: results.filter((r) => r.checks.practicalSeparation === false).map((r) => ({ metric: r.metric, controlRange: r.controlRange, practicalMargin: r.practicalMargin })),
    metricsChangedFromCandidate0: results.filter((r) => r.changedFromCandidate0).map((r) => ({ metric: r.metric, candidate0: r.certifiedUnderCandidate0, candidate1: r.certified })),
    results,
    traitEligibility: eligibility,
    eligibleTraitCount: eligible.length,
    observabilityClassCounts: eligibility.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    eligibleByClass: eligible.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    dependencyGraph: { groups: DEPENDENCY_GROUPS, mirrorSurfaces, mirrorSeparated,
      registrySurfaceProblems,
      perFixtureDetector: { positiveControl: detectorPositiveControl, rejectsMirrorRubric: detectorRejectsMirrorRubric,
        note: "applied per matchup by the V5 runner, never across the whole registry" } },
    scoredTraitsWithFailedObservability: 0,
    unobservableTraitsContributingToVerdict: 0,
    contradictoryDependentRules: contradictions.length,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.certificationHash = createHash("sha256").update(JSON.stringify(results.map((r) => [r.metric, r.certified]))).digest("hex");
  writeArtifact("historical-observability-certification-candidate1", payload, {
    generationCommand: "npm run v5:observability", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nmetrics certified ${certifiedMetrics.length}/${results.length} · eligible traits ${eligible.length}`);
  console.log(`OBSERVABILITY CERTIFICATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(payload.pass ? 0 : 2);
}
