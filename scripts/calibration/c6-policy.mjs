#!/usr/bin/env node
// ── Freeze probability side-bias policy v2 and its cell family ──────────────
//   npm run calibration:c6:policy
//
// Runs BEFORE any fresh seed is simulated, and its hash is asserted by a test.
// The ordering is the point: a margin chosen after seeing an interval is not a
// margin, and a cell family chosen after seeing which cells behave is not a
// family.
import { createHash } from "node:crypto";
import { writeArtifact, ARTIFACT_DIR_C6, reconcile } from "../../src/v3/calibration/artifacts.js";
import { POLICY, policyHash, SAMPLE_LADDER } from "../../src/v3/calibration/sideBiasPolicy.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_DEVELOPMENT_V2, HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { MASTERS, DOMAINS, allOverlaps, overlapBetween, seedSetFor } from "../../src/v3/calibration/seedDomains.js";
import { versionOf } from "../../src/versions.js";

/**
 * The frozen cell family.
 *
 * The Phase 6C2C5 family was the 30 same-era pairs of the synthetic development
 * set, and 28 of those 30 were 2010s. A gate that claims "no systematic era
 * bias" cannot be evaluated on one cell per era, so MIRROR cells are added: a
 * fixture against itself, which spans all five eras present in the set.
 *
 * Mirrors are also the purest side probe available. Identical rosters mean there
 * is no team-quality component at all, so any deviation from 0.5 is the slot.
 */
export const buildCellFamily = () => {
  const devs = SYNTHETIC_DEVELOPMENT_V2;
  const cells = [];
  for (const d of devs) {
    cells.push({ id: `mirror:${d.id}`, kind: "MIRROR", era: d.era,
      teamA: d.id, teamB: d.id, coachA: d.coach, coachB: d.coach,
      perspectiveTeam: d.id,
      note: "Identical rosters and identical coach. No team-quality component; delta measures the slot directly." });
  }
  for (let i = 0; i < devs.length; i++) {
    for (let j = i + 1; j < devs.length; j++) {
      if (devs[i].era !== devs[j].era) continue;
      cells.push({ id: `pair:${devs[i].id}|${devs[j].id}`, kind: "NON_MIRROR", era: devs[i].era,
        teamA: devs[i].id, teamB: devs[j].id, coachA: devs[i].coach, coachB: devs[j].coach,
        perspectiveTeam: devs[i].id });
    }
  }
  return cells;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const cells = buildCellFamily();
  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const contaminated = cells.filter((c) => sealed.has(c.teamA) || sealed.has(c.teamB));
  if (contaminated.length) {
    console.error(`POLICY_FAILED: sealed holdout members appear in the cell family: ${contaminated.map((c) => c.id).join(", ")}`);
    process.exit(2);
  }

  const byKind = {}; const byEra = {}; const byCoach = {};
  for (const c of cells) {
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    byEra[c.era] = (byEra[c.era] ?? 0) + 1;
    byCoach[c.coachA] = (byCoach[c.coachA] ?? 0) + 1;
  }
  const rec = reconcile({ label: "cell-family", counts: byKind, expectedTotal: cells.length });

  // Prove the seed block is disjoint from every prior domain, at the maximum
  // sample this policy can ever draw.
  const maxPairs = SAMPLE_LADDER.maximumPairs;
  const overlaps = {};
  for (const d of DOMAINS) {
    if (d === "side-bias-v2") continue;
    overlaps[`side-bias-v2|${d}`] = overlapBetween("side-bias-v2", d, maxPairs).length;
  }
  const seeds = seedSetFor("side-bias-v2", maxPairs);
  const distinct = new Set(seeds).size;
  const totalOverlap = Object.values(overlaps).reduce((a, b) => a + b, 0);
  if (totalOverlap !== 0) { console.error(`POLICY_FAILED: seed overlap ${totalOverlap}`); process.exit(2); }

  const seedManifest = {
    probabilitySideBiasSeedSetVersion: versionOf("probabilitySideBiasSeedSetVersion"),
    domain: "side-bias-v2",
    master: MASTERS["side-bias-v2"],
    masterCommitment: createHash("sha256").update(`eraclash:side-bias-v2:${MASTERS["side-bias-v2"] >>> 0}`).digest("hex").slice(0, 32),
    generationAlgorithm: "domainSeed(master, domain, index) = splitmix32(hash(domain) ^ master, index); cumulative index 0..maximumPairs-1",
    maximumPairs: maxPairs,
    pairCountByStage: SAMPLE_LADDER.stages.map((s) => ({ stage: s.stage, cumulativePairs: s.cumulativePairs })),
    distinctSeeds: distinct,
    allDistinct: distinct === maxPairs,
    overlapWithPriorDomains: overlaps,
    totalOverlap,
    allPairwiseOverlaps: allOverlaps(4096),
    seedsChosenBeforeResults: true,
    manifestHash: null,
  };
  seedManifest.manifestHash = createHash("sha256").update(JSON.stringify(seedManifest)).digest("hex");

  const ph = policyHash();
  const { path } = writeArtifact("probability-side-bias-policy-v2", {
    policy: POLICY,
    policyHash: ph,
    frozenBeforeAnyFreshResult: true,
    seedManifest,
    cellFamily: {
      frozenBeforeResults: true,
      count: cells.length,
      byKind, byEra, byCoach,
      reconciliation: rec,
      holdoutContamination: "PASS",
      eraCoverageNote: `Phase 6C2C5's family was ${Object.values(byKind).length ? byKind.NON_MIRROR : 0} non-mirror cells, of which 28 of 30 were 2010s. Mirror cells add the remaining eras, so the era stratum of the aggregate gate can actually be evaluated.`,
      cells,
    },
    coverageAgainstBriefRequirements: {
      exactMirrors: byKind.MIRROR ?? 0,
      nonMirrorPairs: byKind.NON_MIRROR ?? 0,
      zoneCapable: cells.filter((c) => /zone/.test(c.teamA) || /zone/.test(c.teamB)).length,
      shootingAdvantage: cells.filter((c) => /shooting|shooter/.test(c.teamA) || /shooting|shooter/.test(c.teamB)).length,
      sizeAdvantage: cells.filter((c) => /size|bigs/.test(c.teamA) || /size|bigs/.test(c.teamB)).length,
      defensiveAdvantage: cells.filter((c) => /defender|rim-protection/.test(c.teamA) || /defender|rim-protection/.test(c.teamB)).length,
      balancedVersusHigherOvr: cells.filter((c) => /balanced-lower-ovr/.test(c.teamA) || /balanced-lower-ovr/.test(c.teamB)).length,
      distinctEras: Object.keys(byEra).length,
      note: "Counted from the frozen family, not asserted. Cells are drawn only from the synthetic DEVELOPMENT set; no holdout fixture appears.",
    },
  }, {
    generationCommand: "npm run calibration:c6:policy",
    sourceArtifacts: [],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: ARTIFACT_DIR_C6,
  });

  console.log("PROBABILITY SIDE-BIAS POLICY v2 — FROZEN\n");
  console.log(`  effect            ${POLICY.EFFECT.estimator}`);
  console.log(`  supersedes v1     ${POLICY.EFFECT.supersedesV1Statistic}`);
  console.log(`  per-cell margin   +/-${POLICY.MARGINS.perCell}   (on the CORRECTED scale: strictly stricter than v1)`);
  console.log(`  aggregate margin  +/-${POLICY.MARGINS.aggregate}`);
  console.log(`  alpha             ${POLICY.ALPHA}   family-wise ${POLICY.FAMILY_WISE.method}`);
  console.log(`  intervals         ${POLICY.CONFIDENCE.primary} + bootstrap, agreement required`);
  console.log(`  ladder            ${SAMPLE_LADDER.stages.map((s) => s.cumulativePairs).join(" -> ")} pairs (cumulative)`);
  console.log(`\n  CELL FAMILY  ${cells.length} cells`);
  console.log(`    by kind   ${JSON.stringify(byKind)}`);
  console.log(`    by era    ${JSON.stringify(byEra)}`);
  console.log(`    reconciles ${rec.reconciles} · holdout contamination PASS`);
  console.log(`\n  SEED MANIFEST  domain side-bias-v2, ${maxPairs} pairs`);
  console.log(`    distinct seeds        ${distinct}/${maxPairs}`);
  console.log(`    overlap with priors   ${JSON.stringify(overlaps)}`);
  console.log(`    manifestHash          ${seedManifest.manifestHash}`);
  console.log(`\n  policyHash  ${ph}`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles && totalOverlap === 0 ? 0 : 2);
}
