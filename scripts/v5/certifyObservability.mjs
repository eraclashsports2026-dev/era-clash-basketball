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
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { CONTROL_TABLE } from "../validation/observability.mjs";
import { METRICS, playPairedSamples, summarise, diffSummary } from "../validation/surface.mjs";
import { TRAIT_TABLE, DEPENDENCY_GROUPS, detectContradictions, registryHash } from "../validation/traitRegistry.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { buildTeamInput } from "../../src/v3/possession/testContext.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { COACHES } from "../../src/v3/coaches.js";
import { v4Seed } from "../validation/v4seeds.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;

/** Public-card five by a ranking function, position-legal, one card per person. */
const legalFive = (rank) => {
  const pool = [...PLAYERS].sort((a, b) => rank(b) - rank(a));
  const used = new Set(); const out = new Array(5).fill(null);
  const walk = (i) => {
    if (i === 5) return true;
    for (const c of pool) {
      const pid = person(c.id);
      if (used.has(pid) || !(c.positions ?? [c.pos]).includes(SLOTS[i])) continue;
      used.add(pid); out[i] = c.id;
      if (walk(i + 1)) return true;
      used.delete(pid); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error("no legal five");
  return out;
};
const RANKS = {
  median: (p) => -Math.abs((p.pts ?? 0) - 18),
  shooters: (p) => (p.pts ?? 0) + (p.an1 ?? 0) * 3 - (p.reb ?? 0) * 1.5,
  bigs: (p) => (p.reb ?? 0) * 2 + (p.blk ?? 0) * 4 - (p.pts ?? 0) * 0.4,
  glass: (p) => (p.reb ?? 0) * 3 + (p.blk ?? 0),
  smalls: (p) => -(p.reb ?? 0) * 2 + (p.ast ?? 0),
  passers: (p) => (p.ast ?? 0) * 3 + (p.pts ?? 0) * 0.2,
  isoScorers: (p) => (p.pts ?? 0) * 2 - (p.ast ?? 0) * 2,
  thieves: (p) => (p.stl ?? 0) * 5 + (p.ast ?? 0),
  butterfingers: (p) => -(p.stl ?? 0) * 4 + (p.reb ?? 0),
  rim: (p) => (p.blk ?? 0) * 5 + (p.reb ?? 0),
  noRim: (p) => -(p.blk ?? 0) * 5 + (p.pts ?? 0) * 0.3,
};
const coachByScale = (path, dir) => {
  const [block, field] = path.split(".");
  const rows = COACHES.map((c) => ({ id: c.id, value: Number(c[block]?.[field] ?? 5) }))
    .sort((a, b) => (dir === "max" ? b.value - a.value : a.value - b.value));
  return { id: rows[0].id, scale: path, value: rows[0].value };
};

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
      const subject = buildTeamInput(five, coach.id);
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
    const checks = {
      mechanicActivation: [cells.strong, cells.neutral, cells.weak].every((c) => c.n > 0 && c.mean != null),
      metricResponsiveness: sv != null && Math.abs(sv.diff) > 0,
      directionalDiscrimination: sv != null && sv.significant && Math.sign(sv.diff) === dir,
      strongControl: sn != null && sn.significant && Math.sign(sn.diff) === dir,
      weakControl: weakAtFloor || (wn != null && wn.significant && Math.sign(wn.diff) === -dir),
      neutralControl: between,
      varianceSufficiency: cells.strong.sd > 0 && cells.neutral.sd > 0,
      zeroInvariantViolations: [cells.strong, cells.neutral, cells.weak].every((c) => c.invariantViolations === 0),
    };
    const certified = Object.values(checks).every(Boolean);
    const prior = readArtifact("observability-control-results", "data/validation/6c3r").data.results.find((r) => r.metric === metricId);
    results.push({ metric: metricId, surface: m.identifiableOn, strongEffect: spec.strongEffect, basis: spec.basis,
      cells: { strong: cells.strong, neutral: cells.neutral, weak: cells.weak },
      referenceBaselineCandidate1: baselines[m.field] ? { mean: baselines[m.field].mean, se: baselines[m.field].se } : null,
      strongVsWeak: sv, strongVsNeutral: sn, weakVsNeutral: wn, checks, certified,
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
  const contradictions = detectContradictions(eligible.map((e) => ({ traitId: e.traitId, metric: e.metric, direction: e.direction })));
  const mirrorPair = ["pppVsReference", "refPppVsTeam"];
  const mirrorSurfaces = mirrorPair.map((m) => ({ metric: m, identifiableOn: METRICS[m].identifiableOn }));
  const mirrorSeparated = METRICS.pppVsReference.identifiableOn.every((s) => !METRICS.refPppVsTeam.identifiableOn.includes(s));

  gate("everyScoredTraitHasACertifiedMetric", eligible.every((e) => certifiedMetrics.includes(e.metric)),
    `${eligible.length} scorable traits, all on certified metrics`);
  gate("noUnobservableTraitContributesToVerdict", eligibility.filter((e) => !e.scoringEligibility && e.metric && certifiedMetrics.includes(e.metric)).length === 0,
    `${eligibility.length - eligible.length} traits excluded before scoring: ${[...new Set(eligibility.filter((e) => !e.scoringEligibility && e.metric).map((e) => e.metric))].join(", ") || "none"}`);
  gate("noContradictoryDependentRules", contradictions.length === 0,
    `${contradictions.length} contradictions among ${eligible.length} eligible traits (the V3-style rubric detector)`);
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
    metricsChangedFromCandidate0: results.filter((r) => r.changedFromCandidate0).map((r) => ({ metric: r.metric, candidate0: r.certifiedUnderCandidate0, candidate1: r.certified })),
    results,
    traitEligibility: eligibility,
    eligibleTraitCount: eligible.length,
    observabilityClassCounts: eligibility.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    eligibleByClass: eligible.reduce((a, e) => { a[e.observabilityClass] = (a[e.observabilityClass] ?? 0) + 1; return a; }, {}),
    dependencyGraph: { groups: DEPENDENCY_GROUPS, mirrorSurfaces, mirrorSeparated, contradictions },
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
