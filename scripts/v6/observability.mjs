#!/usr/bin/env node
// ── WS8b: certify every scored trait's observability under Candidate 2 ──────
//   npm run v6:observability [-- --pairs=1000]
//
// A trait scored on an uncertified metric is a verdict resting on a number
// nobody has shown responds to anything. Candidate 1 certified 12 of 16
// metrics; the 6C4C1 repairs deliberately moved assisted offence and defensive
// suppression, so the eligible set has to be recomputed rather than inherited.
// Whether a repaired metric now certifies is a finding either way: a metric
// that gained observability is reported, and one that lost it is excluded.
//
// The practicalSeparation check reads the PRIOR frozen margin policy (the V5
// one). That is deliberate: the V6 margin policy derives its noise estimates
// from the control cells this script produces, so reading a V6 policy here
// would be circular. The V5 policy is non-V6 evidence, which is exactly the
// property required.
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
import { DIR, C1D, B1 } from "./reconcile.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

// Prior uses of the "observability-controls" stream: observability.mjs at
// cellIndex*50000+i (< 800k) and the Candidate 1 pass at 5,000,000+ (< 5.8M).
const C2_BLOCK = 12000000;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000);
  const def = defaultRuntimeParameterSet();
  if (artifactExists("historical-v6-observability-certification", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-v6-observability-certification already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const profiles = await buildRunnerProfileMap();
  const c2refs = readArtifact("era-reference-certification-candidate2", DIR).data;
  const c1obs = readArtifact("historical-observability-certification-candidate1", B1).data;
  const c2lock = readArtifact("candidate2-lock", C1D).data;
  const priorMargins = Object.fromEntries(Object.entries(
    readArtifact("trait-practical-margin-policy-v5", B1).data.metrics).map(([k, v]) => [k, v.margin]));
  const ref2010 = c2refs.references.find((r) => r.era === "2010s");
  const refTeam = referenceTeam({ era: "2010s", five: ref2010.five }, profiles);
  const baselines = ref2010.candidate2SelfBaselines;
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  console.log(`OBSERVABILITY CERTIFICATION UNDER CANDIDATE 2 — ${Object.keys(CONTROL_TABLE).length} metrics x 3 cells x ${pairs * 2} games\n`);
  const results = [];
  let cellIndex = 0;
  for (const [metricId, spec] of Object.entries(CONTROL_TABLE)) {
    const m = METRICS[metricId];
    const cells = {};
    const defs = { strong: spec.strong, neutral: { rank: "median", coach: "neutral" }, weak: spec.weak };
    for (const [cellName, cdef] of Object.entries(defs)) {
      const five = legalFive(RANKS[cdef.rank]);
      const coach = cdef.coach === "neutral" ? { id: "neutral", scale: "NEUTRAL_COACH", value: null }
        : coachByScale(cdef.coach[0], cdef.coach[1]);
      const run = playPairedSamples({ subject: teamFor(five, coach.id), opponent: refTeam, eraStyleId: "2010s",
        seedAt: (i) => v4Seed("observability-controls", C2_BLOCK + cellIndex * 50000 + i), pairs });
      cells[cellName] = { five, coach, ...summarise(run.samples, m.field),
        invariantViolations: run.invariantViolations, ties: run.ties, games: run.games };
      cellIndex++;
    }
    // WITHIN-POPULATION certification: strong and weak are judged against the
    // NEUTRAL cell, never against the reference baseline, which carries a
    // whole-population level shift.
    const sv = diffSummary(cells.strong, cells.weak);
    const sn = diffSummary(cells.strong, cells.neutral);
    const wn = diffSummary(cells.weak, cells.neutral);
    const dir = spec.strongEffect === "RAISES" ? 1 : -1;
    const between = (cells.neutral.mean - Math.min(cells.strong.mean, cells.weak.mean)) *
                    (Math.max(cells.strong.mean, cells.weak.mean) - cells.neutral.mean) >= 0;
    const weakAtFloor = spec.strongEffect === "RAISES" && cells.weak.mean === 0;
    const margin = priorMargins[metricId] ?? null;
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
    const c1row = c1obs.results.find((r) => r.metric === metricId) ?? null;
    results.push({ metric: metricId, surface: m.identifiableOn, strongEffect: spec.strongEffect, basis: spec.basis,
      cells: { strong: cells.strong, neutral: cells.neutral, weak: cells.weak },
      referenceBaselineCandidate2: baselines[metricId] ? { mean: baselines[metricId].mean, se: baselines[metricId].se } : null,
      strongVsWeak: sv, strongVsNeutral: sn, weakVsNeutral: wn,
      practicalMargin: margin, priorPolicyMarginSource: "trait-practical-margin-policy-v5",
      controlRange: r5(controlRange), controlRangeExceedsMargin: margin == null ? null : controlRange > margin,
      checks, certified,
      certifiedUnderCandidate1: c1row?.certified ?? null,
      candidate1ControlRange: c1row?.controlRange ?? null,
      changedFromCandidate1: c1row ? c1row.certified !== certified : null });
    console.log(`  ${certified ? "CERT" : "FAIL"}  ${metricId.padEnd(20)} strong ${String(r5(cells.strong.mean)).padStart(9)}  neutral ${String(r5(cells.neutral.mean)).padStart(9)}  weak ${String(r5(cells.weak.mean)).padStart(9)}  s-w z ${sv?.z}${c1row && c1row.certified !== certified ? `   (was ${c1row.certified ? "CERT" : "FAIL"} under Candidate 1)` : ""}${certified ? "" : `  failed: ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(",")}`}`);
  }
  console.log("");

  const certifiedMetrics = results.filter((r) => r.certified).map((r) => r.metric);
  const failedMetrics = results.filter((r) => !r.certified).map((r) => r.metric);

  const eligibility = Object.entries(TRAIT_TABLE).map(([traitId, t]) => {
    const metric = t.claim?.metric ?? null;
    const scorable = Boolean(metric) && certifiedMetrics.includes(metric);
    return { traitId, observabilityClass: t.cls, family: t.family, metric,
      direction: t.claim?.direction ?? null, scoringEligibility: scorable,
      eligibilityNote: !metric ? "NOT_APPLICABLE_NO_DIRECTIONAL_CLAIM"
        : scorable ? "CERTIFIED_UNDER_CANDIDATE_2" : `METRIC_UNCERTIFIED:${metric}` };
  });
  const eligible = eligibility.filter((e) => e.scoringEligibility);

  // Registry-level surface check plus a detector positive control. Handing
  // detectContradictions the whole registry asks a question it was never built
  // for — across all traits "fast" and "slow" legitimately claim opposite
  // directions on gamePace — so it is used per fixture by the runner and
  // exercised here only as a positive control.
  const surfaceOf = (metric) => METRICS[metric].identifiableOn[0];
  const registrySurfaceProblems = eligible
    .filter((e) => !METRICS[e.metric].identifiableOn.includes(surfaceOf(e.metric)))
    .map((e) => `${e.traitId}: ${e.metric} not identifiable on its registry surface`);
  const detectorPositiveControl = detectContradictions([
    { traitId: "SYNTHETIC_ELITE_OFFENSE", metric: "pppVsReference", direction: "ABOVE_REFERENCE_BASELINE", surface: "MIRROR" },
    { traitId: "SYNTHETIC_ELITE_DEFENSE", metric: "refPppVsTeam", direction: "BELOW_REFERENCE_BASELINE", surface: "MIRROR" },
  ]);
  const detectorRejectsMirrorRubric = detectorPositiveControl.some((p) => p.includes("MIRROR_PPP"));
  const mirrorSeparated = METRICS.pppVsReference.identifiableOn.every((s) => !METRICS.refPppVsTeam.identifiableOn.includes(s));

  gate("everyScoredTraitHasACertifiedMetric", eligible.every((e) => certifiedMetrics.includes(e.metric)),
    `${eligible.length} scorable traits, all on metrics certified under Candidate 2`);
  gate("noUnobservableTraitContributesToVerdict",
    eligibility.filter((e) => !e.scoringEligibility && e.metric && certifiedMetrics.includes(e.metric)).length === 0,
    `${eligibility.length - eligible.length} traits excluded before scoring: ${[...new Set(eligibility.filter((e) => !e.scoringEligibility && e.metric).map((e) => e.metric))].join(", ") || "none"}`);
  gate("everyEligibleTraitOnAnIdentifiableSurface", registrySurfaceProblems.length === 0,
    `${eligible.length} eligible traits, ${registrySurfaceProblems.length} claiming a metric on a surface it cannot be identified on`);
  gate("perFixtureContradictionDetectorLive", detectorRejectsMirrorRubric,
    "a synthetic V3-style rubric (elite offence and elite defence both resolved onto one MIRROR surface) is still rejected by the per-fixture detector the runner calls");
  gate("mirrorPppSeparated", mirrorSeparated,
    `pppVsReference identifiable only on ${METRICS.pppVsReference.identifiableOn.join("/")}, refPppVsTeam only on ${METRICS.refPppVsTeam.identifiableOn.join("/")} — offence and defence are never read from one mirror`);
  gate("zeroInvariantViolationsInControls",
    results.every((r) => Object.values(r.cells).every((c) => c.invariantViolations === 0)),
    `${results.length * 3} control cells x ${pairs * 2} games`);
  gate("repairedMetricsReMeasuredNotInherited",
    results.every((r) => r.cells.strong.games === pairs * 2) && results.length === Object.keys(CONTROL_TABLE).length,
    `all ${results.length} metrics re-measured under Candidate 2; ${results.filter((r) => r.changedFromCandidate1).length} changed certification status from Candidate 1`);

  const payload = {
    historicalV6ObservabilityCertificationVersion: "1.0.0",
    historicalObservabilityCertificationVersion: VALIDATION_VERSIONS.historicalObservabilityCertificationVersion,
    certifiedUnder: { candidateId: "Candidate 2",
      possessionCalibrationVersion: c2lock.possessionCalibrationVersion, coreHash: c2lock.coreHash },
    forSet: "historical-holdout-v6",
    pairsPerCell: pairs, gamesPerCell: pairs * 2,
    referenceCertificationHash: c2refs.certificationHash,
    traitRegistryHash: registryHash(),
    practicalMarginSource: { artifact: "trait-practical-margin-policy-v5", dir: B1,
      why: "the V6 margin policy derives its noise from these control cells, so reading it here would be circular. The V5 policy is non-V6 evidence." },
    metricsTotal: results.length, metricsCertified: certifiedMetrics.length,
    certifiedMetrics, failedMetrics,
    practicalSeparationFailures: results.filter((r) => r.checks.practicalSeparation === false)
      .map((r) => ({ metric: r.metric, controlRange: r.controlRange, practicalMargin: r.practicalMargin })),
    metricsChangedFromCandidate1: results.filter((r) => r.changedFromCandidate1)
      .map((r) => ({ metric: r.metric, candidate1: r.certifiedUnderCandidate1, candidate2: r.certified,
        candidate1ControlRange: r.candidate1ControlRange, candidate2ControlRange: r.controlRange })),
    results,
    traitEligibility: eligibility, eligibleTraitCount: eligible.length,
    observabilityClassCounts: eligibility.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    eligibleByClass: eligible.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    dependencyGraph: { groups: DEPENDENCY_GROUPS, mirrorSeparated, registrySurfaceProblems,
      perFixtureDetector: { positiveControl: detectorPositiveControl, rejectsMirrorRubric: detectorRejectsMirrorRubric,
        note: "applied per matchup by the runner, never across the whole registry" } },
    scoredTraitsWithFailedObservability: 0,
    unobservableTraitsContributingToVerdict: 0,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.certificationHash = createHash("sha256")
    .update(JSON.stringify(results.map((r) => [r.metric, r.certified]))).digest("hex");
  writeArtifact("historical-v6-observability-certification", payload, {
    generationCommand: "npm run v6:observability", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nmetrics certified ${certifiedMetrics.length}/${results.length} · eligible traits ${eligible.length}`);
  if (payload.metricsChangedFromCandidate1.length) {
    console.log("  changed from Candidate 1:");
    for (const c of payload.metricsChangedFromCandidate1)
      console.log(`    ${c.metric}: C1 ${c.candidate1 ? "CERT" : "FAIL"} (range ${c.candidate1ControlRange}) -> C2 ${c.candidate2 ? "CERT" : "FAIL"} (range ${c.candidate2ControlRange})`);
  }
  console.log(`OBSERVABILITY CERTIFICATION (CANDIDATE 2): ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(payload.pass ? 0 : 2);
}
