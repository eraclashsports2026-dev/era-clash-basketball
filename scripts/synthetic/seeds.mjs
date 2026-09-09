#!/usr/bin/env node
// ── WS6: the Synthetic Stress Holdout V2 seed domain ────────────────────────
//   npm run syn:seeds
//
// The blocker's first missing component: "NO frozen synthetic-V2 seed manifest
// exists ... there is nothing to verify a seed hash against."
//
// Same construction as the V5 domain — sha256 stream master, splitmix32
// derivation — under a distinct phase master and namespace, with disjointness
// PROVEN at more seeds than the run will draw, against every prior population
// including this phase's own preparation streams. seedDomains.js is a Candidate
// 1 core file, so the domain is not registered there: doing so would mutate the
// core the holdout is about to hash.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { v4SeedSet, STREAMS as V4_STREAMS } from "../validation/v4seeds.mjs";
import { v5SeedSet, STREAMS as V5_STREAMS } from "../v5/seeds.mjs";
import { DIR } from "./preflight.mjs";

export const SYN_MASTER = 0x6c4b1e;
export const NAMESPACE = "eraclash-6c4b1s";

export const STREAMS = Object.freeze({
  "synthetic-stress-holdout-v2": "the one-time Synthetic V2 formal stress run",
  "synthetic-v2-dryrun": "the transactional runner dry run, on non-holdout mock fixtures",
});

/** Surface slots. Frozen: a slot number is part of the seed address. */
export const SURFACE_SLOTS = Object.freeze({
  MIRROR: 0, ZONE_ASYMMETRIC: 1, ZONE_ABLATION_TWIN: 2,
  VS_COHERENT_LOWER_CONTROL: 3, VS_ROLE_MATCHED_UPGRADE: 4,
  SERIES_BEST_OF_7: 5, SEASONS_OF_82: 6, TOURNAMENT: 7,
});
export const FIXTURE_STRIDE = 400000;
export const SURFACE_STRIDE = 40000;

const streamMaster = (stream) => {
  if (!(stream in STREAMS)) throw new Error(`synSeeds: unknown stream "${stream}"`);
  return createHash("sha256").update(`${NAMESPACE}:${stream}:${SYN_MASTER >>> 0}`).digest().readInt32BE(0);
};
export const synSeed = (stream, index) => deriveSeed(streamMaster(stream), index);
export const synSeedSet = (stream, count) => Array.from({ length: count }, (_, i) => synSeed(stream, i));

/**
 * The seed for one pair on one surface of one fixture. A pure function of the
 * three indices, so a resumed run re-derives exactly the same seeds.
 */
export const synSurfaceSeed = ({ stream = "synthetic-stress-holdout-v2", fixtureIndex, surfaceSlot, pairIndex }) => {
  if (!(surfaceSlot in SURFACE_SLOTS)) throw new Error(`synSeeds: unknown surface slot "${surfaceSlot}"`);
  if (pairIndex >= SURFACE_STRIDE) throw new Error(`synSeeds: pairIndex ${pairIndex} exceeds the frozen surface stride ${SURFACE_STRIDE}`);
  if (Object.keys(SURFACE_SLOTS).length * SURFACE_STRIDE > FIXTURE_STRIDE) throw new Error("synSeeds: surface slots overflow the fixture stride");
  return synSeed(stream, fixtureIndex * FIXTURE_STRIDE + SURFACE_SLOTS[surfaceSlot] * SURFACE_STRIDE + pairIndex);
};

/** Every prior seed population this domain must not touch. */
export const priorPopulations = (count) => {
  const out = {};
  for (const d of Object.keys(MASTERS)) out[d] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS[d], d, i));
  out["historical-holdout-v3-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", 6030000 + i));
  out["internal-reference-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["probability-validation"], "probability-validation", 900000 + i));
  out["candidate1-internal-validation-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", 6400000 + i));
  for (const [name, stream] of Object.entries({ movement: 1, offense: 2, defense: 3, oreb: 4 })) {
    out[`candidate1-diagnostic-${name}`] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4a02 + stream * 0x10000, i));
  }
  out["candidate1-behaviour-proof"] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4b01, i));
  out["realized-zone-controls"] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4b03, i));
  for (const s of Object.keys(V4_STREAMS)) out[`v4:${s}`] = v4SeedSet(s, count);
  for (const s of Object.keys(V5_STREAMS)) out[`v5:${s}`] = v5SeedSet(s, count);
  // This phase's own preparation streams. They ran before the formal domain
  // existed, so the formal domain must be proven clear of them too.
  for (const [name, master] of Object.entries({
    "6c4b1s-prep-dev-mirror": 0x6c4b15, "6c4b1s-prep-dev-vs-control": 0x6c4b16,
    "6c4b1s-prep-dev-zone": 0x6c4b17, "6c4b1s-prep-dev-twin": 0x6c4b18,
    "6c4b1s-prep-dev-lower": 0x6c4b19, "6c4b1s-prep-dev-gap": 0x6c4b1a,
  })) out[name] = Array.from({ length: count }, (_, i) => deriveSeed(master, i));
  return out;
};

/** Empirical zero-overlap proof at the full generated volume. */
export const proveDisjoint = (count) => {
  const prior = priorPopulations(count);
  const streams = Object.fromEntries(Object.keys(STREAMS).map((s) => [s, synSeedSet(s, count)]));
  const overlaps = {}; const details = [];
  for (const [sName, sSeeds] of Object.entries(streams)) {
    const set = new Set(sSeeds);
    if (set.size !== sSeeds.length) details.push({ stream: sName, issue: "INTERNAL_COLLISION", distinct: set.size, generated: sSeeds.length });
    for (const [pName, pSeeds] of Object.entries(prior)) {
      const hits = pSeeds.filter((x) => set.has(x)).length;
      overlaps[`${sName} x ${pName}`] = hits;
      if (hits) details.push({ stream: sName, prior: pName, overlap: hits });
    }
  }
  const a = new Set(streams["synthetic-stress-holdout-v2"]);
  const cross = streams["synthetic-v2-dryrun"].filter((x) => a.has(x)).length;
  overlaps["synthetic-stress-holdout-v2 x synthetic-v2-dryrun"] = cross;
  if (cross) details.push({ issue: "SYNTHETIC_STREAMS_OVERLAP", overlap: cross });
  return { overlaps, details, totalOverlap: Object.values(overlaps).reduce((x, y) => x + y, 0),
    priorPopulationsChecked: Object.keys(prior).length, comparisons: Object.keys(overlaps).length, seedsPerStream: count };
};

/** Every seed the formal run will actually draw, from the frozen sample plan. */
export const plannedSeedAddresses = (samplePlan) => {
  const out = [];
  for (const [fi, f] of samplePlan.fixtures.entries()) {
    for (const [slot, s] of Object.entries(f.surfaces)) {
      for (let k = 0; k < (s.pairs ?? 0); k++) out.push({ fixtureIndex: fi, surfaceSlot: slot, pairIndex: k });
    }
    if (f.modes.SERIES_BEST_OF_7.series > 0) {
      for (let k = 0; k < f.modes.SERIES_BEST_OF_7.series; k++) out.push({ fixtureIndex: fi, surfaceSlot: "SERIES_BEST_OF_7", pairIndex: k });
    }
    if (f.modes.SEASONS_OF_82.seasons > 0) {
      for (let k = 0; k < f.modes.SEASONS_OF_82.seasons; k++) out.push({ fixtureIndex: fi, surfaceSlot: "SEASONS_OF_82", pairIndex: k });
    }
  }
  for (let b = 0; b < samplePlan.tournament.brackets; b++) out.push({ fixtureIndex: 0, surfaceSlot: "TOURNAMENT", pairIndex: b });
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-seeds", DIR) && !process.argv.includes("--refreeze")) {
    console.log("synthetic-v2-seeds already exists — pass --refreeze to deliberately re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const samplePlan = readArtifact("synthetic-v2-sample-plan", DIR).data;
  const planned = plannedSeedAddresses(samplePlan);
  const drawn = planned.map((a) => synSurfaceSeed(a));
  const proofVolume = Math.max(65536, drawn.length);

  console.log(`SYNTHETIC V2 SEED FREEZE — ${planned.length.toLocaleString()} addressed seeds across 16 fixtures\n`);
  console.log(`  proving disjointness at ${proofVolume.toLocaleString()} seeds per stream against every prior population...`);
  const proof = proveDisjoint(proofVolume);
  console.log(`  ${proof.priorPopulationsChecked} prior populations · ${proof.comparisons} comparisons · total overlap ${proof.totalOverlap}\n`);

  gate("zeroOverlapWithEveryPriorPopulation", proof.totalOverlap === 0,
    `${proof.comparisons} stream x population comparisons at ${proofVolume.toLocaleString()} seeds each, ${proof.totalOverlap} collisions`);
  gate("noInternalCollision", !proof.details.some((d) => d.issue === "INTERNAL_COLLISION"),
    `${proofVolume.toLocaleString()} seeds per stream, all distinct`);
  gate("holdoutAndDryRunStreamsDisjoint",
    proof.overlaps["synthetic-stress-holdout-v2 x synthetic-v2-dryrun"] === 0,
    "the dry run cannot consume a seed the formal run will use");
  gate("everyPlannedAddressIsDistinct", new Set(drawn).size === drawn.length,
    `${drawn.length.toLocaleString()} planned addresses produce ${new Set(drawn).size.toLocaleString()} distinct seeds`);
  gate("addressingIsPureAndDeterministic",
    synSurfaceSeed({ fixtureIndex: 5, surfaceSlot: "ZONE_ASYMMETRIC", pairIndex: 11 })
      === synSurfaceSeed({ fixtureIndex: 5, surfaceSlot: "ZONE_ASYMMETRIC", pairIndex: 11 })
    && synSurfaceSeed({ fixtureIndex: 5, surfaceSlot: "ZONE_ASYMMETRIC", pairIndex: 11 })
      !== synSurfaceSeed({ fixtureIndex: 5, surfaceSlot: "MIRROR", pairIndex: 11 }),
    "the address is a pure function of fixture, surface slot and pair index, and different slots give different seeds");
  gate("surfaceSlotsFitTheFrozenStride",
    Object.keys(SURFACE_SLOTS).length * SURFACE_STRIDE <= FIXTURE_STRIDE
      && samplePlan.fixtures.every((f) => Object.values(f.surfaces).every((s) => (s.pairs ?? 0) < SURFACE_STRIDE)),
    `${Object.keys(SURFACE_SLOTS).length} slots x stride ${SURFACE_STRIDE.toLocaleString()} <= fixture stride ${FIXTURE_STRIDE.toLocaleString()}; largest planned volume ${Math.max(...samplePlan.fixtures.flatMap((f) => Object.values(f.surfaces).map((s) => s.pairs ?? 0))).toLocaleString()} pairs`);
  gate("domainNotRegisteredInCore", !Object.keys(MASTERS).includes("synthetic-stress-holdout-v2"),
    "seedDomains.js is a Candidate 1 core file; registering this domain there would mutate the core the holdout is about to hash");
  gate("volumeFrozenBeforeAnySyntheticOutput", samplePlan.frozenBeforeAnyResult === true,
    `the sample plan this domain addresses was frozen first, hash ${samplePlan.samplePlanHash.slice(0, 16)}...`);

  const payload = {
    syntheticHoldoutSeedSetVersion: "1.0.0",
    set: "synthetic-stress-holdout-v2",
    master: SYN_MASTER, namespace: NAMESPACE,
    masterCommitment: createHash("sha256").update(`${NAMESPACE}:master:${SYN_MASTER >>> 0}`).digest("hex"),
    streams: Object.fromEntries(Object.entries(STREAMS).map(([s, purpose]) => [s, {
      purpose, master: streamMaster(s),
      commitment: createHash("sha256").update(`${NAMESPACE}:${s}:${SYN_MASTER >>> 0}`).digest("hex") }])),
    generationAlgorithm: "streamMaster = int32BE(sha256(`${NAMESPACE}:${stream}:${master}`)); seed = deriveSeed(streamMaster, index) via splitmix32 — the same primitives as every prior domain, under a distinct master and namespace",
    surfaceAddressing: { formula: "fixtureIndex * FIXTURE_STRIDE + SURFACE_SLOTS[slot] * SURFACE_STRIDE + pairIndex",
      fixtureStride: FIXTURE_STRIDE, surfaceStride: SURFACE_STRIDE, slots: SURFACE_SLOTS },
    volume: { plannedAddresses: planned.length, distinctSeeds: new Set(drawn).size, proofVolume },
    disjointnessProof: proof,
    samplePlanHash: samplePlan.samplePlanHash,
    frozenBeforeRun: true,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.seedHash = createHash("sha256").update(JSON.stringify({ master: SYN_MASTER, namespace: NAMESPACE,
    slots: SURFACE_SLOTS, strides: [FIXTURE_STRIDE, SURFACE_STRIDE],
    firstSeeds: synSeedSet("synthetic-stress-holdout-v2", 64) })).digest("hex");
  writeArtifact("synthetic-v2-seeds", payload, {
    generationCommand: "npm run syn:seeds", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nSEED FREEZE: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · seedHash ${payload.seedHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
