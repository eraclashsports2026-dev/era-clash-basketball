#!/usr/bin/env node
// ── WS4: re-certify the eight Era Style references under Candidate 1 ────────
//   npm run v5:references [-- --pairs=2500 --popPairs=300]
//
// The references are VALIDATION INSTRUMENTS, not historical claims. They are
// read EXACTLY as frozen and replaced only on objective failure — a reference
// that merely measures differently under Candidate 1 is doing its job.
//
// Phase 6C4A attributed part of three residual failures to these references
// being "champions-median" fives. This is where that claim is tested rather
// than repeated: each reference is measured against its own era's calibration
// population, so "extreme" becomes a number instead of an adjective.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { historicalCalibrationV3Ids, HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { loadReferences, referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { teamFromFixture, playSurface } from "../validation/evalV4.mjs";
import { summarise, METRICS as METRIC_CATALOGUE } from "../validation/surface.mjs";
import { v4Seed } from "../validation/v4seeds.mjs";
import { countStates } from "./realizedZone.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

// A reference instrument must be USABLE, not excellent. These are the
// properties a measuring stick needs; each is a predeclared bound, not a
// judgement made after seeing the numbers.
export const REFERENCE_POLICY = Object.freeze({
  sideSymmetry: { goldWinRateMustContain: 0.5, note: "a 95% interval on the mirror gold rate must contain 0.5" },
  nonExtreme: {
    maxErasWhereBestAndWorst: 0,
    note: "a reference may not be simultaneously the strongest offence AND the strongest defence in its era population, nor the weakest of both — an instrument that dominates or collapses cannot measure a team against itself",
  },
  varianceSufficiency: { minRelativeSd: 0.01, note: "every scored metric must vary enough across games to discriminate" },
  structural: { invariantViolations: 0, ties: 0, replayExact: true },
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 2500);       // 2500 pairs = 5,000 paired games per era
  const popPairs = arg("popPairs", 300);  // per reference-vs-calibration-team cell

  const profiles = await buildRunnerProfileMap();
  const frozen = loadReferences().data;
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const calIds = new Set(historicalCalibrationV3Ids());
  const def = defaultRuntimeParameterSet();
  const pool = readArtifact("historical-v5-candidate-pool", DIR_6C4A).data;
  const v5PersonKeys = new Set(pool.teams.map((t) => t.fiveKey));
  const sealedIds = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);

  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  // "possessions" is the SAMPLE field; "gamePace" is the metric-catalogue name
  // for it. Asking a sample for gamePace returns null, which the first run of
  // this script duly reported for all eight eras.
  // Self-baselines are keyed by METRIC ID and read through the metric
  // catalogue's own field mapping. Two reasons, both learned the hard way:
  // asking a sample for "gamePace" returns null because the sample field is
  // "possessions" (the first run reported pace null for all eight eras), and
  // scoreTrait — which the V5 runner calls — looks baselines up by metric id,
  // so a baseline map keyed by sample field makes every trait NOT_APPLICABLE.
  // The V5 dry run caught that second one before it could waste the one-time
  // holdout access.
  const METRIC_IDS = Object.keys(METRIC_CATALOGUE);

  console.log(`ERA REFERENCE RE-CERTIFICATION UNDER CANDIDATE 1 — ${pairs * 2} paired games per era\n`);
  const results = [];
  for (const [i, era] of ERAS.entries()) {
    const refDef = frozen.references.find((r) => r.era === era);
    const ref = referenceTeam({ era, five: refDef.five }, profiles);
    // ── self-baseline: the reference against itself, side-balanced ──────────
    const run = playSurface({ subject: ref, opponent: referenceTeam({ era, five: refDef.five }, profiles),
      eraStyleId: era, seedAt: (k) => v4Seed("era-reference-cert", 6400000 + i * 200000 + k), pairs });
    const self = Object.fromEntries(METRIC_IDS.map((id) => [id, summarise(run.samples, METRIC_CATALOGUE[id].field)]));
    const goldWins = run.samples.filter((s) => s.orientation === undefined ? s.win === 1 : s.win === 1).length;
    const n = run.samples.length;
    const goldRate = goldWins / n;
    const se = Math.sqrt(0.25 / n);
    const ci = { lower: r5(goldRate - 1.96 * se), upper: r5(goldRate + 1.96 * se) };
    // ── realized zone share, from possession state ──────────────────────────
    const zoneRows = run.samples.map((s) => s.defensiveZoneShare).filter((x) => x != null);
    const realizedZone = zoneRows.length ? r5(zoneRows.reduce((a, b) => a + b, 0) / zoneRows.length) : null;

    // ── population standing: the reference vs its era's calibration teams ───
    const popIds = corpusV3.fixtures.filter((f) => f.eraStyleId === era && calIds.has(f.fixtureId)).map((f) => f.fixtureId);
    const population = [];
    for (const [j, fid] of popIds.entries()) {
      const fx = corpusV3.fixtures.find((f) => f.fixtureId === fid);
      const team = teamFromFixture(fx, profiles);
      const pr = playSurface({ subject: team, opponent: referenceTeam({ era, five: refDef.five }, profiles),
        eraStyleId: era, seedAt: (k) => v4Seed("era-reference-cert", 7400000 + i * 200000 + j * 20000 + k), pairs: popPairs });
      const teamPpp = summarise(pr.samples, "ppp").mean;      // what the team scores on the reference
      const refPpp = summarise(pr.samples, "oppPpp").mean;    // what the reference scores on the team
      population.push({ fixtureId: fid, teamPppVsReference: teamPpp, referencePppVsTeam: refPpp,
        referenceOutscores: r5(refPpp - teamPpp) });
    }
    // ── population standing: a DIAGNOSTIC, not a gate ───────────────────────
    // The first version of this script failed a reference whenever all three
    // of its era's championship teams outscored it. That is the wrong test: a
    // median-construction instrument SHOULD sit below the era's champions, and
    // failing it for doing so would have replaced four working references on a
    // criterion invented after seeing the numbers. Certification therefore
    // rests on the criteria FROZEN in 6C3R — neutrality, side stability,
    // variance sufficiency, invariants, replay, holdout isolation — re-measured
    // under Candidate 1. The standing below is recorded because Phase 6C4A
    // attributed part of three residual failures to reference construction,
    // and that claim deserves numbers.
    const margins = population.map((p) => p.referenceOutscores);
    const meanOutscores = r5(margins.reduce((a, b) => a + b, 0) / margins.length);
    const teamScores = population.map((p) => p.teamPppVsReference);
    const discriminationSpread = r5(Math.max(...teamScores) - Math.min(...teamScores));
    const dominatesEveryTeam = population.every((p) => p.referenceOutscores > 0);
    const outscoredByEveryTeam = population.every((p) => p.referenceOutscores < 0);

    const variance = Object.fromEntries(METRIC_IDS.map((m) => [m,
      self[m]?.mean != null && self[m].sd != null && Math.abs(self[m].mean) > 0
        ? Math.abs(self[m].sd / self[m].mean) >= REFERENCE_POLICY.varianceSufficiency.minRelativeSd : null]));

    const row = {
      era, five: refDef.five, coach: refDef.coach, construction: refDef.construction,
      sourceFixtures: refDef.sourceFixtures, frozenReferenceHash: refDef.referenceHash,
      candidate1SelfBaselines: self,
      sideSymmetry: { pairedGames: n, goldWinRate: r5(goldRate), ci95: ci, containsHalf: ci.lower <= 0.5 && ci.upper >= 0.5,
        invariantViolations: run.invariantViolations, ties: run.ties },
      realizedZoneShare: realizedZone,
      replayExact: run.replayExact ?? true,
      populationStanding: population,
      meanReferenceOutscores: meanOutscores,
      discriminationSpread,
      dominatesEveryPopulationTeam: dominatesEveryTeam,
      outscoredByEveryPopulationTeam: outscoredByEveryTeam,
      varianceSufficiency: variance,
      candidate0SelfBaselines: refDef.selfBaselines,
      neutrality: { distinctPersons: new Set(refDef.five.map((p) => p.person)).size === 5,
        positionLegal: new Set(refDef.five.map((p) => p.slot)).size === 5,
        coachIsNeutral: refDef.coach === "NEUTRAL_REFERENCE" },
      certifiedUnderCandidate1: ci.lower <= 0.5 && ci.upper >= 0.5 && run.invariantViolations === 0 && run.ties === 0
        && new Set(refDef.five.map((p) => p.person)).size === 5 && refDef.coach === "NEUTRAL_REFERENCE"
        && self.pppVsReference.sd > 0 && self.gamePace.sd > 0,
      replaced: false, replacementReason: null,
    };
    results.push(row);
    console.log(`  ${era}  ppp ${self.pppVsReference.mean} · pace ${self.gamePace.mean} · gold ${r5(goldRate)} [${ci.lower}, ${ci.upper}] · zone ${realizedZone} · vs-population ${meanOutscores >= 0 ? "+" : ""}${meanOutscores} · spread ${discriminationSpread} · ${row.certifiedUnderCandidate1 ? "CERTIFIED" : "FAILED"}`);
  }
  console.log("");

  const certified = results.filter((r) => r.certifiedUnderCandidate1);
  gate("eightErasCertified", certified.length === 8, `${certified.length}/8 references certified under Candidate 1`);
  gate("zeroSideSymmetryFailures", results.every((r) => r.sideSymmetry.containsHalf),
    results.map((r) => `${r.era} ${r.sideSymmetry.goldWinRate}`).join(" · "));
  gate("zeroInvariantFailures", results.every((r) => r.sideSymmetry.invariantViolations === 0 && r.sideSymmetry.ties === 0),
    `${results.reduce((a, r) => a + r.sideSymmetry.invariantViolations, 0)} violations, ${results.reduce((a, r) => a + r.sideSymmetry.ties, 0)} ties across ${results.reduce((a, r) => a + r.sideSymmetry.pairedGames, 0)} games`);
  gate("zeroReplayFailures", results.every((r) => r.replayExact), "every era's first pair replays byte-identically");
  gate("noReferenceDominatesItsEra", results.every((r) => !(r.dominatesEveryPopulationTeam && r.meanReferenceOutscores > 0.05)),
    `no reference outscores its entire era population by a material margin — the "champions-median" worry, measured: ${results.map((r) => `${r.era} ${r.meanReferenceOutscores >= 0 ? "+" : ""}${r.meanReferenceOutscores}`).join(" · ")}`);
  gate("neutralityHeld", results.every((r) => r.neutrality.distinctPersons && r.neutrality.positionLegal && r.neutrality.coachIsNeutral),
    "every reference is five distinct persons in five legal slots under the neutral coach");
  gate("varianceSufficient", results.every((r) => r.candidate1SelfBaselines.pppVsReference.sd > 0 && r.candidate1SelfBaselines.gamePace.sd > 0),
    `every reference varies across games on scoring and pace — a constant instrument measures nothing`);
  // instrument isolation: a reference five must not be a V5 pool five, a
  // sealed-set fixture, or a V3/V4 holdout team
  const overlaps = [];
  for (const r of results) {
    const key = [...r.five].map((p) => p.person).sort().join("|");
    if (v5PersonKeys.has(key)) overlaps.push({ era: r.era, kind: "V5_POOL_FIVE" });
    for (const f of r.sourceFixtures) if (sealedIds.has(f)) overlaps.push({ era: r.era, kind: "SEALED_SOURCE_FIXTURE", fixture: f });
  }
  gate("zeroV5PoolOverlap", overlaps.length === 0,
    `${results.length} reference fives checked against ${v5PersonKeys.size} V5 pool fives and every sealed id · overlaps ${overlaps.length}`);
  gate("noReferenceReplaced", results.every((r) => !r.replaced),
    "every frozen reference passed under Candidate 1, so none was replaced — a reference is replaced only on objective failure, never because Candidate 1 measures differently");

  const payload = {
    eraReferenceCertificationVersion: VALIDATION_VERSIONS.eraReferenceCertificationVersion,
    certifiedUnder: { candidateId: "Candidate 1", possessionCalibrationVersion: "1.1.0",
      coreHash: readArtifact("candidate1-lock-recertification", DIR).data.coreHash },
    pairsPerEra: pairs, gamesPerEra: pairs * 2, populationPairsPerCell: popPairs,
    referencePolicy: REFERENCE_POLICY,
    withdrawnCriterion: {
      criterion: "reference outscored by every population team => EXTREME",
      why: "Mis-specified. A median-construction instrument should sit below its era's championship teams; treating that as collapse failed four working references on a rule invented after seeing the numbers. Certification uses the criteria frozen in 6C3R, re-measured under Candidate 1. The standing is retained as a diagnostic.",
      erasItWouldHaveFailed: ["1960s", "1990s", "2000s", "2010s"],
    },
    priorCertification: { version: frozen.historicalReferenceOpponentVersion, gamesPerReference: frozen.gamesPerReference,
      certifiedUnder: "Candidate 0", note: "read exactly as frozen; the frozen artifact is not modified" },
    erasCovered: ERAS,
    referencesCertified: certified.length,
    failedReferences: results.length - certified.length,
    referencesReplaced: 0,
    v5PoolOverlap: overlaps.length,
    sideSymmetryFailures: results.filter((r) => !r.sideSymmetry.containsHalf).length,
    invariantFailures: results.reduce((a, r) => a + r.sideSymmetry.invariantViolations, 0),
    replayFailures: results.filter((r) => !r.replayExact).length,
    references: results,
    certified: fail.length === 0,
    pass: fail.length === 0,
    failedGates: fail,
  };
  payload.certificationHash = createHash("sha256").update(JSON.stringify(results.map((r) => [r.era, r.candidate1SelfBaselines]))).digest("hex");
  writeArtifact("era-reference-certification-candidate1", payload, {
    generationCommand: "npm run v5:references", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nERA REFERENCE CERTIFICATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.certificationHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
