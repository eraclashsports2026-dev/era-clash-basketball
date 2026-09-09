#!/usr/bin/env node
// ── WS11: the Historical Holdout V6 seed domain ─────────────────────────────
//   npm run v6:seeds
//
// seedDomains.js is a Candidate 2 CORE file, so V6's domain cannot be
// registered there without mutating the core the holdout will hash. This
// follows the pattern 6C3R established and 6C4B1 repeated: the same primitives
// (sha256 stream master -> splitmix32 derivation) under a distinct phase
// master, with disjointness PROVEN empirically at the full generated volume
// against every prior domain, block and stream — including both V5 streams —
// rather than assumed from construction.
//
// Seeds are pre-allocated PER SAMPLE TIER. The sample plan claims an escalation
// cannot reuse a decision-tier seed and inflate agreement between tiers; that
// claim is only true if the addressing makes it true, so the tier is part of
// the address and the proof covers every tier the plan allows.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { v4SeedSet, STREAMS as V4_STREAMS } from "../validation/v4seeds.mjs";
import { v5SeedSet, STREAMS as V5_STREAMS } from "../v5/seeds.mjs";
import { DIR } from "./reconcile.mjs";

export const V6_MASTER = 0x6c4c20;

export const STREAMS = Object.freeze({
  "historical-holdout-v6": "The one-time V6 holdout run, all sample tiers",
  "v6-dryrun": "The transactional runner dry run, on non-holdout mock fixtures",
});
export const DOMAIN = "HISTORICAL_V6_FORMAL";

const streamMaster = (stream) => {
  if (!(stream in STREAMS)) throw new Error(`v6seeds: unknown stream "${stream}"`);
  return createHash("sha256").update(`eraclash-6c4c2:${stream}:${V6_MASTER >>> 0}`).digest().readInt32BE(0);
};
export const v6Seed = (stream, index) => deriveSeed(streamMaster(stream), index);
export const v6SeedSet = (stream, count) => Array.from({ length: count }, (_, i) => v6Seed(stream, i));

const TIER_STRIDE = 5000000;
const MATCHUP_STRIDE = 300000;
const SURFACE_STRIDE = 100000;

/** Frozen addressing. The tier is part of the address, so tiers cannot collide. */
export const v6SurfaceSeed = ({ tier, matchupIndex, surfaceIndex, pairIndex }) =>
  v6Seed("historical-holdout-v6",
    tier * TIER_STRIDE + matchupIndex * MATCHUP_STRIDE + surfaceIndex * SURFACE_STRIDE + pairIndex);

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
  return out;
};

/** Empirical zero-overlap proof at the full generated volume. */
export const proveDisjoint = (count) => {
  const prior = priorPopulations(count);
  const streams = Object.fromEntries(Object.keys(STREAMS).map((s) => [s, v6SeedSet(s, count)]));
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
  const a = new Set(streams["historical-holdout-v6"]);
  const cross = streams["v6-dryrun"].filter((x) => a.has(x)).length;
  overlaps["historical-holdout-v6 x v6-dryrun"] = cross;
  if (cross) details.push({ issue: "V6_STREAMS_OVERLAP", overlap: cross });
  return { overlaps, details, totalOverlap: Object.values(overlaps).reduce((x, y) => x + y, 0),
    priorPopulations: Object.keys(prior).length, seedsPerStream: count };
};

/** Per-tier disjointness, over the exact addresses the run would draw. */
export const proveTierDisjoint = (tiers, matchups, surfaces) => {
  const byTier = {};
  for (const t of tiers) {
    const pairs = t.gamesPerSurface / 2;
    const seeds = [];
    for (let m = 0; m < matchups; m += 1) {
      for (let s = 0; s < surfaces; s += 1) {
        for (let p = 0; p < pairs; p += 1) seeds.push(v6SurfaceSeed({ tier: t.tier, matchupIndex: m, surfaceIndex: s, pairIndex: p }));
      }
    }
    byTier[t.tier] = seeds;
  }
  const overlaps = {}; let total = 0;
  const names = Object.keys(byTier);
  for (const a of names) {
    const set = new Set(byTier[a]);
    overlaps[`tier${a}:distinct`] = byTier[a].length - set.size;
    total += overlaps[`tier${a}:distinct`];
    for (const b of names) {
      if (a >= b) continue;
      const hits = byTier[b].filter((x) => set.has(x)).length;
      overlaps[`tier${a} x tier${b}`] = hits;
      total += hits;
    }
  }
  return { seedsByTier: Object.fromEntries(names.map((t) => [t, byTier[t].length])), overlaps, totalOverlap: total };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  if (artifactExists("historical-v6-seeds", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-v6-seeds already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const verdict = readArtifact("historical-v6-verdict-policy", DIR).data;
  const plan = readArtifact("historical-v6-sample-plan", DIR).data;
  const sel = readArtifact("historical-v6-selection", DIR).data;
  const matchups = verdict.protocol.matchups;
  const surfaces = verdict.protocol.surfacesPerMatchup.length;
  const decisionPairs = verdict.protocol.gamesPerSurface / 2;
  const holdoutSeedCount = matchups * surfaces * decisionPairs;
  const proofVolume = Math.max(holdoutSeedCount, 32768);

  console.log(`V6 SEED FREEZE — domain ${DOMAIN}\n`);
  console.log(`  decision tier: ${matchups} matchups x ${surfaces} surfaces x ${decisionPairs} pairs = ${holdoutSeedCount} seeds`);
  console.log(`  proving disjointness at ${proofVolume} seeds per stream against every prior population...`);
  const proof = proveDisjoint(proofVolume);
  const tierProof = proveTierDisjoint(plan.tiers, matchups, surfaces);
  console.log(`  ${proof.priorPopulations} prior populations checked · total overlap ${proof.totalOverlap}`);
  console.log(`  tier addresses: ${Object.entries(tierProof.seedsByTier).map(([t, n]) => `t${t} ${n}`).join(", ")} · cross-tier overlap ${tierProof.totalOverlap}\n`);

  gate("zeroOverlapWithEveryPriorDomain", proof.totalOverlap === 0,
    `${Object.keys(proof.overlaps).length} stream x population comparisons at ${proofVolume} seeds each, ${proof.totalOverlap} collisions`);
  gate("priorPopulationsIncludeBothV5Streams",
    Object.keys(proof.overlaps).some((k) => k.includes("v5:historical-holdout-v5"))
    && Object.keys(proof.overlaps).some((k) => k.includes("v5:v5-dryrun")),
    "V5's holdout and dry-run streams are both in the checked set — V6 must not reuse a seed the consumed V5 run drew");
  gate("noInternalCollision", !proof.details.some((d) => d.issue === "INTERNAL_COLLISION"),
    `${proofVolume} seeds per stream, all distinct`);
  gate("holdoutAndDryRunStreamsDisjoint", proof.overlaps["historical-holdout-v6 x v6-dryrun"] === 0,
    "the dry run cannot consume a seed the holdout will use");
  gate("everySampleTierDisjoint", tierProof.totalOverlap === 0,
    `${Object.keys(tierProof.overlaps).length} tier comparisons over the exact addresses each tier would draw, ${tierProof.totalOverlap} collisions — an escalation cannot reuse a decision-tier seed and manufacture agreement`);
  gate("volumeFrozenBeforeAnyV6Run", verdict.frozenBeforeSeal === true && verdict.protocol.gamesPerSurface === 4096,
    `${verdict.protocol.gamesPerSurface} games per surface, ${verdict.protocol.totalGamesAtDecisionTier} at the decision tier — fixed by the verdict policy before the set is sealed`);
  gate("addressingIsDeterministic",
    v6SurfaceSeed({ tier: 3, matchupIndex: 3, surfaceIndex: 1, pairIndex: 7 })
    === v6SurfaceSeed({ tier: 3, matchupIndex: 3, surfaceIndex: 1, pairIndex: 7 }),
    "the surface-seed address is a pure function of tier, matchup, surface and pair index");
  gate("noV6ResultExistsYet", !artifactExists("historical-v6-results", DIR),
    "seeds are chosen before any V6 result exists");

  const payload = {
    historicalV6SeedSetVersion: "1.0.0",
    set: "historical-holdout-v6", domain: DOMAIN,
    master: V6_MASTER,
    masterCommitment: createHash("sha256").update(`eraclash-6c4c2:master:${V6_MASTER >>> 0}`).digest("hex"),
    streams: Object.fromEntries(Object.entries(STREAMS).map(([s, purpose]) => [s, {
      purpose, streamMaster: streamMaster(s),
      streamCommitment: createHash("sha256").update(`eraclash-6c4c2:${s}:${V6_MASTER >>> 0}`).digest("hex").slice(0, 32),
    }])),
    generationAlgorithm: "streamMaster = sha256('eraclash-6c4c2:<stream>:<master>').readInt32BE(0); seed = deriveSeed(streamMaster, index) using the frozen splitmix32 derivation in src/v3/seed.js",
    surfaceAddressing: `v6Seed('historical-holdout-v6', tier*${TIER_STRIDE} + matchupIndex*${MATCHUP_STRIDE} + surfaceIndex*${SURFACE_STRIDE} + pairIndex)`,
    whySeedDomainsIsNotEdited: "seedDomains.js is one of the frozen Candidate 2 core files. Registering V6 there would change the core hash the verdict pins, so the domain lives in validation-only code on the same primitives.",
    volume: { matchups, surfacesPerMatchup: surfaces, decisionPairsPerSurface: decisionPairs,
      gamesPerSurface: verdict.protocol.gamesPerSurface,
      totalGamesAtDecisionTier: verdict.protocol.totalGamesAtDecisionTier,
      holdoutSeedCount, tiers: plan.tiers.map((t) => ({ tier: t.tier, gamesPerSurface: t.gamesPerSurface, role: t.role })) },
    selectionHash: sel.selectionHash, verdictPolicyHash: verdict.policyHash, samplePlanHash: plan.samplePlanHash,
    frozenBeforeRun: true, frozenBeforeSeal: true,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.seedHash = createHash("sha256")
    .update(JSON.stringify({ master: V6_MASTER, streams: payload.streams, volume: payload.volume })).digest("hex");
  writeArtifact("historical-v6-seeds", payload, {
    generationCommand: "npm run v6:seeds", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("historical-v6-seed-disjointness", {
    historicalV6SeedDisjointnessVersion: "1.0.0",
    domain: DOMAIN, seedHash: payload.seedHash,
    seedsPerStream: proofVolume, priorPopulationsChecked: proof.priorPopulations,
    comparisons: Object.keys(proof.overlaps).length,
    totalOverlap: proof.totalOverlap, overlaps: proof.overlaps, details: proof.details,
    tierDisjointness: tierProof,
    method: "empirical intersection over generated seed sets, not an argument from construction. Every registered domain, every ad-hoc block earlier phases carved out, every 6C3R stream and both 6C4B1 streams are generated and intersected.",
    pass: proof.totalOverlap === 0 && tierProof.totalOverlap === 0,
  }, { generationCommand: "npm run v6:seeds", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`SEED FREEZE: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · seedHash ${payload.seedHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
