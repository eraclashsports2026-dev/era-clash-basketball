// ── Phase 6C3R seed streams ─────────────────────────────────────────────────
// seedDomains.js is one of the 52 frozen candidate-core files, so V4's seed
// domain cannot be registered there without mutating the core the holdout
// verdicts hash. These streams therefore live in validation-only code, built on
// the SAME primitives (sha256 stream master → splitmix32 derivation) with a
// distinct phase master, and disjointness from every prior domain and block is
// PROVEN empirically below rather than assumed from construction.
import { createHash } from "node:crypto";
import { deriveSeed } from "../../src/v3/seed.js";
import { domainSeed, MASTERS, DOMAINS } from "../../src/v3/calibration/seedDomains.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

export const V4_MASTER = 0x6c3401;

export const STREAMS = Object.freeze({
  "era-reference-cert": "Reference-team certification and self-baselines",
  "observability-controls": "Strong/neutral/weak trait controls",
  "v4-dryrun": "Construct-validity and runner dry run on non-holdout fixtures",
  "historical-holdout-v4": "The one-time V4 holdout run",
});

const streamMaster = (stream) => {
  if (!(stream in STREAMS)) throw new Error(`v4seeds: unknown stream "${stream}"`);
  return createHash("sha256").update(`eraclash-6c3r:${stream}:${V4_MASTER >>> 0}`).digest().readInt32BE(0);
};

export const v4Seed = (stream, index) => deriveSeed(streamMaster(stream), index);
export const v4SeedSet = (stream, count) => Array.from({ length: count }, (_, i) => v4Seed(stream, i));

/**
 * Prior seed populations this phase must not overlap: the four registered
 * domains, plus the two ad-hoc blocks earlier phases carved out of them.
 */
export const priorPopulations = (count) => ({
  "actual-game": Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", i)),
  prediction: Array.from({ length: count }, (_, i) => domainSeed(MASTERS.prediction, "prediction", i)),
  "probability-validation": Array.from({ length: count }, (_, i) => domainSeed(MASTERS["probability-validation"], "probability-validation", i)),
  "side-bias-v2": Array.from({ length: count }, (_, i) => domainSeed(MASTERS["side-bias-v2"], "side-bias-v2", i)),
  "historical-holdout-v3-block": Array.from({ length: count }, (_, i) => domainSeed(MASTERS["actual-game"], "actual-game", 6030000 + i)),
  "internal-reference-block": Array.from({ length: count }, (_, i) => domainSeed(MASTERS["probability-validation"], "probability-validation", 900000 + i)),
});

/** Zero-overlap proof across every stream and every prior population. */
export const proveDisjoint = (count = 16384) => {
  const prior = priorPopulations(count);
  const streams = Object.fromEntries(Object.keys(STREAMS).map((s) => [s, v4SeedSet(s, count)]));
  const overlaps = {};
  for (const [sName, sSeeds] of Object.entries(streams)) {
    const set = new Set(sSeeds);
    for (const [pName, pSeeds] of Object.entries(prior)) {
      overlaps[`${sName}|${pName}`] = pSeeds.filter((x) => set.has(x)).length;
    }
    for (const [oName, oSeeds] of Object.entries(streams)) {
      if (oName === sName) continue;
      overlaps[`${sName}|${oName}`] = oSeeds.filter((x) => set.has(x)).length;
    }
    overlaps[`${sName}|distinct`] = new Set(sSeeds).size === count ? 0 : count - new Set(sSeeds).size;
  }
  return { count, overlaps, totalOverlap: Object.values(overlaps).reduce((a, b) => a + b, 0) };
};

export const seedManifest = (count = 16384) => {
  const proof = proveDisjoint(count);
  const m = {
    historicalHoldoutSeedSetVersion: VALIDATION_VERSIONS.historicalHoldoutSeedSetVersion,
    master: V4_MASTER,
    masterCommitment: createHash("sha256").update(`eraclash-6c3r:${V4_MASTER >>> 0}`).digest("hex").slice(0, 32),
    generationAlgorithm: "streamMaster = sha256('eraclash-6c3r:'+stream+':'+master).int32BE(0); seed_i = splitmix32-derive(streamMaster, i); cumulative index 0..n-1",
    streams: STREAMS,
    disjointnessProof: proof,
    seedsChosenBeforeResults: true,
  };
  m.manifestHash = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  return m;
};
