// ── Fixed benchmark seed sets ───────────────────────────────────────────────
// Generated REPRODUCIBLY from a named root, never chosen. Selecting favourable
// seeds is the easiest way to fake a calibration result, so the seeds are
// derived from a documented constant and the derivation is in the repo.
import { deriveSeed } from "../../src/v3/possession/rng.js";
import { versionOf } from "../../src/versions.js";

export const BENCHMARK_SEED_SET_VERSION = versionOf("benchmarkSeedSetVersion");

// One root per PURPOSE, so a change to one experiment's seeds cannot silently
// shift another's. The values are arbitrary but fixed and documented.
// One root per PURPOSE, so a change to one experiment's seeds cannot silently
// shift another's. The values are arbitrary but FIXED and documented, which is
// the point: a reader can confirm no seed was hand-picked after seeing a result.
export const SEED_ROOTS = Object.freeze({
  CALIBRATION: 0x6c1ca1,
  HOLDOUT: 0x6c11d0,
  ZONE_CONTROL: 0x6c120e,
  COACH_CONTROL: 0x6c1c0a,
  SHOOTING_HIERARCHY: 0x6c1500,
  PROBABILITY: 0x6c19b0,
});

/** `count` deterministic seeds for a purpose. Same inputs → same seeds, always. */
export const seedSet = (purpose, count) => {
  const root = SEED_ROOTS[purpose];
  if (root === undefined) throw new Error(`seedSet: unknown purpose "${purpose}"`);
  return Array.from({ length: count }, (_, i) => deriveSeed(root | 0, i));
};

/** Per-fixture seeds, so two fixtures never share a seed stream by accident. */
export const fixtureSeeds = (purpose, fixtureId, count) => {
  const root = SEED_ROOTS[purpose];
  if (root === undefined) throw new Error(`fixtureSeeds: unknown purpose "${purpose}"`);
  let h = root | 0;
  for (let i = 0; i < fixtureId.length; i++) h = (Math.imul(h, 31) + fixtureId.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, i) => deriveSeed(h, i));
};
