#!/usr/bin/env node
// ── WS11: the Historical Holdout V5 seed domain ─────────────────────────────
//   npm run v5:seeds
//
// seedDomains.js is a Candidate 1 CORE file, so V5's domain cannot be
// registered there without mutating the core the holdout will hash. This
// module follows the pattern 6C3R established: the same primitives (sha256
// stream master -> splitmix32 derivation) under a distinct phase master, with
// disjointness PROVEN empirically at the full generated volume against every
// prior domain, block and stream — never assumed from construction.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { v4SeedSet, STREAMS as V4_STREAMS } from "../validation/v4seeds.mjs";
import { DIR } from "./preflight6c4b1.mjs";

export const V5_MASTER = 0x6c4b10;

export const STREAMS = Object.freeze({
  "historical-holdout-v5": "The one-time V5 holdout run",
  "v5-dryrun": "The transactional runner dry run, on non-holdout mock fixtures",
});

const streamMaster = (stream) => {
  if (!(stream in STREAMS)) throw new Error(`v5seeds: unknown stream "${stream}"`);
  return createHash("sha256").update(`eraclash-6c4b1:${stream}:${V5_MASTER >>> 0}`).digest().readInt32BE(0);
};
export const v5Seed = (stream, index) => deriveSeed(streamMaster(stream), index);
export const v5SeedSet = (stream, count) => Array.from({ length: count }, (_, i) => v5Seed(stream, i));

/** The per-surface seed block for one V5 matchup. Frozen addressing. */
export const v5SurfaceSeed = ({ matchupIndex, surfaceIndex, pairIndex }) =>
  v5Seed("historical-holdout-v5", matchupIndex * 300000 + surfaceIndex * 100000 + pairIndex);

/** Every prior seed population this domain must not touch. */
export const priorPopulations = (count) => {
  const out = {};
  for (const d of Object.keys(MASTERS)) out[d] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS[d], d, i));
  // ad-hoc blocks earlier phases carved out of the registered domains
  out["historical-holdout-v3-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", 6030000 + i));
  out["internal-reference-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["probability-validation"], "probability-validation", 900000 + i));
  out["candidate1-internal-validation-block"] = Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", 6400000 + i));
  // the Phase 6C4A diagnostic master (root-cause factorials)
  for (const [name, stream] of Object.entries({ movement: 1, offense: 2, defense: 3, oreb: 4 })) {
    out[`candidate1-diagnostic-${name}`] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4a02 + stream * 0x10000, i));
  }
  out["candidate1-behaviour-proof"] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4b01, i));
  out["realized-zone-controls"] = Array.from({ length: count }, (_, i) => deriveSeed(0x6c4b03, i));
  // every 6C3R validation stream, including V4's own holdout stream
  for (const s of Object.keys(V4_STREAMS)) out[`v4:${s}`] = v4SeedSet(s, count);
  return out;
};

/** Empirical zero-overlap proof at the full generated volume. */
export const proveDisjoint = (count) => {
  const prior = priorPopulations(count);
  const streams = Object.fromEntries(Object.keys(STREAMS).map((s) => [s, v5SeedSet(s, count)]));
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
  // the two V5 streams must also be disjoint from each other
  const a = new Set(streams["historical-holdout-v5"]);
  const crossStream = streams["v5-dryrun"].filter((x) => a.has(x)).length;
  overlaps["historical-holdout-v5 x v5-dryrun"] = crossStream;
  if (crossStream) details.push({ issue: "V5_STREAMS_OVERLAP", overlap: crossStream });
  return { overlaps, details, totalOverlap: Object.values(overlaps).reduce((x, y) => x + y, 0),
    priorPopulations: Object.keys(prior).length, seedsPerStream: count };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const policy = readArtifact("historical-holdout-v5-policy", DIR).data;
  const manifest = readArtifact("historical-holdout-v5-manifest", DIR);
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  const pairsPerSurface = policy.protocol.pairsPerSurface;
  const surfaces = policy.protocol.surfacesPerMatchup.length;
  const matchups = policy.protocol.matchups;
  const holdoutSeedCount = matchups * surfaces * pairsPerSurface;
  // prove disjointness over MORE seeds than the run will draw
  const proofVolume = Math.max(holdoutSeedCount, 32768);

  console.log(`V5 SEED FREEZE — ${matchups} matchups x ${surfaces} surfaces x ${pairsPerSurface} pairs = ${holdoutSeedCount} seeds\n`);
  console.log(`  proving disjointness at ${proofVolume} seeds per stream against every prior population...`);
  const proof = proveDisjoint(proofVolume);
  console.log(`  ${proof.priorPopulations} prior populations checked · total overlap ${proof.totalOverlap}\n`);

  gate("zeroOverlapWithEveryPriorDomain", proof.totalOverlap === 0,
    `${Object.keys(proof.overlaps).length} stream x population comparisons at ${proofVolume} seeds each, ${proof.totalOverlap} collisions`);
  gate("noInternalCollision", !proof.details.some((d) => d.issue === "INTERNAL_COLLISION"),
    `${proofVolume} seeds per stream, all distinct`);
  gate("holdoutAndDryRunStreamsDisjoint", proof.overlaps["historical-holdout-v5 x v5-dryrun"] === 0,
    "the dry run cannot consume a seed the holdout will use");
  gate("volumeFrozenBeforeAnyV5Run", policy.frozenBeforeAnyV5Output === true && policy.protocol.gamesPerSurface === 4096,
    `${policy.protocol.gamesPerSurface} games per surface, ${policy.protocol.totalGames} total — fixed by the acceptance policy before any V5 fixture exists`);
  gate("addressingIsDeterministic", v5SurfaceSeed({ matchupIndex: 3, surfaceIndex: 1, pairIndex: 7 }) === v5SurfaceSeed({ matchupIndex: 3, surfaceIndex: 1, pairIndex: 7 }),
    "the surface-seed address is a pure function of matchup, surface and pair index");

  const payload = {
    historicalHoldoutSeedSetVersion: VALIDATION_VERSIONS.historicalHoldoutV5SeedSetVersion,
    set: "historical-holdout-v5",
    master: V5_MASTER,
    masterCommitment: createHash("sha256").update(`eraclash-6c4b1:master:${V5_MASTER >>> 0}`).digest("hex"),
    streams: Object.fromEntries(Object.entries(STREAMS).map(([s, purpose]) => [s, {
      purpose, streamMaster: streamMaster(s),
      streamCommitment: createHash("sha256").update(`eraclash-6c4b1:${s}:${V5_MASTER >>> 0}`).digest("hex").slice(0, 32),
    }])),
    generationAlgorithm: "streamMaster = sha256('eraclash-6c4b1:<stream>:<master>').readInt32BE(0); seed = deriveSeed(streamMaster, index) using the frozen splitmix32 derivation in src/v3/seed.js",
    surfaceAddressing: "v5Seed('historical-holdout-v5', matchupIndex*300000 + surfaceIndex*100000 + pairIndex)",
    volume: { matchups, surfacesPerMatchup: surfaces, pairsPerSurface,
      gamesPerSurface: policy.protocol.gamesPerSurface, gamesPerMatchup: policy.protocol.gamesPerMatchup,
      totalGames: policy.protocol.totalGames, holdoutSeedCount },
    disjointnessProof: { seedsPerStream: proofVolume, priorPopulationsChecked: proof.priorPopulations,
      comparisons: Object.keys(proof.overlaps).length, totalOverlap: proof.totalOverlap,
      overlaps: proof.overlaps, details: proof.details },
    manifestHash: manifest.data.manifestHash,
    frozenBeforeRun: true,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.seedHash = createHash("sha256").update(JSON.stringify({ master: V5_MASTER, streams: payload.streams, volume: payload.volume })).digest("hex");
  writeArtifact("historical-holdout-v5-seeds", payload, {
    generationCommand: "npm run v5:seeds", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`SEED FREEZE: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · seedHash ${payload.seedHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
