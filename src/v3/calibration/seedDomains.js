// ── Separated randomness domains ────────────────────────────────────────────
// Three domains that must never overlap:
//
//   ACTUAL_GAME           the seed a real simulated game runs on
//   PREDICTION            the seeds a probability is ESTIMATED from
//   PROBABILITY_VALIDATION the seeds a probability is MEASURED against
//
// Prediction and validation must be disjoint or a probability would be
// validated against the very games that produced it, which measures nothing.
// And neither may collide with an actual game seed, or a prediction would be
// reading the outcome it is supposed to precede.
import { createHash } from "node:crypto";
import { deriveSeed } from "../possession/rng.js";
import { versionOf } from "../../versions.js";

export const PREDICTION_SEED_SET_VERSION = versionOf("predictionSeedSetVersion");
export const PROBABILITY_VALIDATION_SEED_SET_VERSION = versionOf("probabilityValidationSeedSetVersion");

// A fourth domain for Phase 6C2C6. A cell that failed on one seed block cannot
// be retested on that same block: the retest would re-measure the selection
// rather than the effect. Its master is distinct so overlap can be PROVEN
// rather than assumed.
export const DOMAINS = Object.freeze(["actual-game", "prediction", "probability-validation", "side-bias-v2"]);

/**
 * A domain-separated master. Hashing the domain NAME into the master means two
 * domains cannot produce the same stream even from the same index — separation
 * by construction rather than by hoping the ranges do not meet.
 */
const domainMaster = (master, domain) => {
  if (!DOMAINS.includes(domain)) throw new Error(`seedDomains: unknown domain "${domain}"`);
  const h = createHash("sha256").update(`eraclash:${domain}:${master >>> 0}`).digest();
  return h.readInt32BE(0);
};

export const domainSeed = (master, domain, index) => deriveSeed(domainMaster(master, domain), index);

// One documented master per domain. Arbitrary but fixed, and in the repository,
// so nobody can select favourable seeds after seeing a result.
export const MASTERS = Object.freeze({
  "actual-game": 0x6c2c1a,
  prediction: 0x6c2c1b,
  "probability-validation": 0x6c2c1c,
  "side-bias-v2": 0x6c2c6a,
});

export const seedSetFor = (domain, count) =>
  Array.from({ length: count }, (_, i) => domainSeed(MASTERS[domain], domain, i));

/** Fixed sample tiers, frozen before any probability result was seen. */
export const SAMPLE_TIERS = Object.freeze({
  FAST: 128,
  STANDARD: 256,
  DEEP: 512,
  INTERNAL_VALIDATION: 4096,
});

/**
 * Every tier is EVEN because the estimator runs paired orientations: each
 * prediction seed is simulated once with A as gold and once with B as gold, and
 * an odd total could not be balanced.
 */
export const tierSize = (tier) => {
  const n = SAMPLE_TIERS[tier];
  if (n == null) throw new Error(`seedDomains: unknown sample tier "${tier}"`);
  return n;
};

export const manifest = (domain, count) => {
  const seeds = seedSetFor(domain, count);
  return {
    domain,
    version: domain === "prediction" ? PREDICTION_SEED_SET_VERSION
      : domain === "probability-validation" ? PROBABILITY_VALIDATION_SEED_SET_VERSION : null,
    algorithm: "deriveSeed(sha256('eraclash:<domain>:<master>')[0..4), index)",
    master: MASTERS[domain],
    masterCommitment: createHash("sha256").update(`eraclash:${domain}:${MASTERS[domain] >>> 0}`).digest("hex").slice(0, 32),
    seedCount: count,
    manifestHash: createHash("sha256").update(JSON.stringify(seeds)).digest("hex"),
  };
};

/** Overlap between any two domains at the given depth. Must always be empty. */
export const overlapBetween = (a, b, count = SAMPLE_TIERS.INTERNAL_VALIDATION) => {
  const A = new Set(seedSetFor(a, count));
  return seedSetFor(b, count).filter((s) => A.has(s));
};

export const allOverlaps = (count = SAMPLE_TIERS.INTERNAL_VALIDATION) => {
  const out = {};
  for (let i = 0; i < DOMAINS.length; i++) {
    for (let j = i + 1; j < DOMAINS.length; j++) {
      out[`${DOMAINS[i]}|${DOMAINS[j]}`] = overlapBetween(DOMAINS[i], DOMAINS[j], count).length;
    }
  }
  return out;
};
