#!/usr/bin/env node
// ── Internal reference baseline, from NON-HOLDOUT fixtures only ─────────────
//   npm run validation:reference
//
// Two things the holdout gate needs, and both must exist BEFORE a holdout is
// opened or they become functions of the result:
//
//   1. The internal composite share error, so "holdout error / internal error"
//      has a denominator. Computed by the SAME evaluation code the holdout will
//      use, on historical calibration v3, which has already been seen.
//
//   2. Corpus reference medians for the identity rubric. "ABOVE_CORPUS_MEDIAN"
//      needs a median, and taking it from the holdout would let each fixture
//      grade itself against its own cohort.
//
// This command refuses to touch a sealed fixture, and asserts it.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, ARTIFACT_DIR_6C3 } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { evaluateFixture, median, SHARE_METRICS } from "./holdoutEval.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
// A distinct seed block: the reference must not share seeds with the holdout run.
const refSeed = (i) => domainSeed(MASTERS["probability-validation"], "probability-validation", 900000 + i);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const seeds = arg("seeds", 512);

  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const tm = new Map(targets.records.map((r) => [r.fixtureId, r]));
  const byId = new Map(loadPlayers().profiles.map((p) => [p.calibrationPlayerId, p]));

  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const calibIds = historicalCalibrationV3Ids();
  const contaminated = calibIds.filter((id) => sealed.has(id));
  if (contaminated.length) { console.error(`REFERENCE_FAILED: sealed fixtures in the calibration set: ${contaminated.join(", ")}`); process.exit(2); }

  const fixtures = corpus.fixtures.filter((f) => calibIds.includes(f.fixtureId));
  console.log("INTERNAL REFERENCE BASELINE — non-holdout fixtures only\n");
  console.log(`  fixtures      ${fixtures.length} (historical calibration v3)`);
  console.log(`  sealed used   0  (asserted: ${contaminated.length} contaminated)`);
  console.log(`  seeds/fixture ${seeds}`);
  console.log(`  seed block    probability-validation @ 900000+, disjoint from the holdout block\n`);

  const results = [];
  for (const f of fixtures) {
    if (sealed.has(f.fixtureId)) throw new Error(`refusing to evaluate sealed fixture ${f.fixtureId}`);
    const r = evaluateFixture({ fixture: f, target: tm.get(f.fixtureId), byId, seeds, seedAt: refSeed });
    results.push(r);
    process.stdout.write(`\r  evaluated ${results.length}/${fixtures.length}`);
  }
  console.log("");

  const composites = results.map((r) => r.compositeMae).filter((x) => x != null);
  const perMetric = {};
  for (const m of Object.keys(SHARE_METRICS)) {
    const xs = results.map((r) => r.shareResults[m]?.mae).filter((x) => x != null);
    perMetric[m] = { fixtures: xs.length, mean: xs.length ? r5(xs.reduce((a, b) => a + b, 0) / xs.length) : null, median: r5(median(xs)) };
  }
  const structuralKeys = ["pointsPerPossession", "opponentPointsPerPossession", "possessions", "threeShare",
    "rimShare", "offensiveReboundShare", "reboundsPerGame", "meanTopOptionShare"];
  const referenceMedians = {};
  for (const k of structuralKeys) {
    const src = k === "possessions" ? results.map((r) => r.structural.meanPossessions) : results.map((r) => r.structural[k]);
    referenceMedians[k] = r5(median(src));
  }

  const baseline = {
    internalCompositeMean: r5(composites.reduce((a, b) => a + b, 0) / Math.max(1, composites.length)),
    internalCompositeMedian: r5(median(composites)),
    internalCompositeMin: r5(Math.min(...composites)),
    internalCompositeMax: r5(Math.max(...composites)),
    fixturesContributing: composites.length,
    fixturesTotal: fixtures.length,
    perMetric,
  };

  console.log(`  internal composite MAE  mean ${baseline.internalCompositeMean} · median ${baseline.internalCompositeMedian} · range ${baseline.internalCompositeMin}–${baseline.internalCompositeMax}`);
  console.log(`  contributing fixtures   ${baseline.fixturesContributing}/${baseline.fixturesTotal}`);
  console.log("\n  reference medians for the identity rubric:");
  for (const [k, v] of Object.entries(referenceMedians)) console.log(`    ${k.padEnd(30)} ${v}`);

  const payload = {
    purpose: "The denominator for the holdout ratio gate, and the medians the identity rubric compares against. Both frozen before any holdout opened.",
    computedFrom: "historical calibration v3 (already-seen fixtures)",
    sealedFixturesUsed: 0,
    seedBlock: "probability-validation @ 900000+, disjoint from the holdout seed block",
    seedsPerFixture: seeds,
    parameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
    possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
    baseline, referenceMedians,
    perFixture: results.map((r) => ({
      fixtureId: r.fixtureId, eraStyleId: r.eraStyleId, compositeMae: r.compositeMae,
      supportedShareMetrics: r.supportedShareMetrics, structural: r.structural,
    })),
  };
  payload.referenceHash = createHash("sha256").update(JSON.stringify({ baseline, referenceMedians })).digest("hex");

  const { path } = writeArtifact("internal-reference-baseline", payload, {
    generationCommand: "npm run validation:reference",
    sourceArtifacts: ["data/calibration/historical-corpus-v3.json", "data/calibration/historical-targets-v3.json"],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: ARTIFACT_DIR_6C3,
  });
  console.log(`\n  referenceHash ${payload.referenceHash}`);
  console.log(`\nwrote ${path}`);
}
