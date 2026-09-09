#!/usr/bin/env node
// ── WS3 evidence: the talent-gap calibration ladder ─────────────────────────
//   npm run syn:ladder
//
// requireExtremeTalentRemainsMeaningful maps to exactly one sealed fixture, and
// on the development set only one fixture produced a comparable
// CONTROL_IS_STRONG_SIDE observation. A margin derived from n=1 is not a margin.
//
// So this builds the observation directly: pairs of coherent non-holdout fives
// separated by the frozen 1.75x rating gap, at five rating levels in three
// eras, played side-balanced at the frozen volume. Nothing here touches the
// sealed set — the fives are built from the pool with every holdout person
// excluded.
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { deriveSeed } from "../../src/v3/seed.js";
import { person, CONTROL_TARGETS } from "./surfaces.mjs";
import { buildRoleMatchedUpgrade, fiveRating } from "./ratings.mjs";
import { SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { playPaired, winRateOf, structuralOf, varianceOf } from "./marginEvidence.mjs";
import { VOLUMES } from "./samplePlan.mjs";
import { DIR } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

export const LADDER_MASTER = 0x6c4b1b;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const scale = arg("scale", 1);
  const pairs = Math.max(8, Math.round(VOLUMES.VS_ROLE_MATCHED_UPGRADE * scale));
  // Output directory is a flag defaulting to DIR, so every earlier invocation
  // resolves byte-identically. Phase 6C4C2 re-derives these numbers under
  // Candidate 2 and must not overwrite Candidate 1's frozen derivation.
  const outDir = (process.argv.find((x) => x.startsWith("--dir=")) ?? `--dir=${DIR}`).split("=")[1];
  const def = defaultRuntimeParameterSet();
  const holdoutPersons = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.flatMap((f) => f.five.map(person)));
  const factor = CONTROL_TARGETS.upgradeFactor;

  console.log(`ROLE-MATCHED UPGRADE LADDER — ${SYNTHETIC_DEVELOPMENT_V2.length} non-holdout fixtures x ${pairs * 2} games\n`);
  console.log(`  per-slot upgrade factor ${factor}, position and functional role preserved, every holdout person excluded\n`);
  const rows = [];
  for (const [cell, f] of SYNTHETIC_DEVELOPMENT_V2.entries()) {
    const up = buildRoleMatchedUpgrade({ five: f.five, factor, exclude: holdoutPersons });
    const played = playPaired({ subjectFive: up.five, subjectCoach: "neutral",
      oppFive: f.five, oppCoach: "neutral", era: f.era,
      seedAt: (k) => deriveSeed(LADDER_MASTER, cell * 100000 + k), pairs });
    const w = winRateOf(played.games, (k) => played.subjectSide[k]);
    const st = structuralOf(played.games);
    rows.push({ devFixtureId: f.id, purpose: f.purpose, era: f.era,
      ratingBefore: up.ratingBefore, ratingAfter: up.ratingAfter, achievedRatio: up.achievedRatio,
      slotsUpgraded: up.slotsUpgraded, primaryRoleMatches: up.primaryRoleMatches,
      noSlotGotWorse: up.noSlotGotWorse, slots: up.slots,
      strongerSideWinRate: w.value, se: w.se, decidedGames: w.decided,
      variance: varianceOf(played.games), structural: st, games: played.games.length });
    console.log(`  ${f.id.padEnd(28)} ${String(up.ratingBefore).padStart(5)} -> ${String(up.ratingAfter).padStart(5)}  x${String(up.achievedRatio).padEnd(7)} ${String(up.slotsUpgraded)}/5 slots (${up.primaryRoleMatches} primary)  upgradedWin ${w.value.toFixed(4)} ±${w.se.toFixed(4)}  inv ${st.invariantViolationCount}`);
  }

  const wins = rows.map((r) => r.strongerSideWinRate);
  const ratios = rows.map((r) => r.achievedRatio);
  const summary = { n: rows.length, min: r5(Math.min(...wins)), max: r5(Math.max(...wins)),
    mean: r5(mean(wins)), sd: r5(sd(wins)), maxSe: r5(Math.max(...rows.map((r) => r.se))),
    upgradeRatio: { min: r5(Math.min(...ratios)), max: r5(Math.max(...ratios)), mean: r5(mean(ratios)) },
    everyUpgradeWonMoreThanHalf: wins.every((w) => w > 0.5),
    monotonicCheck: "an upgrade that preserves construction should raise the win rate above 0.5 on every fixture; any fixture where it does not is reported rather than smoothed away",
    belowHalf: rows.filter((r) => r.strongerSideWinRate <= 0.5).map((r) => ({ fixture: r.devFixtureId, winRate: r.strongerSideWinRate, ratio: r.achievedRatio })),
    noSlotGotWorseEverywhere: rows.every((r) => r.noSlotGotWorse),
    structuralTotals: rows.reduce((a, r) => { for (const [k, v] of Object.entries(r.structural)) a[k] = (a[k] ?? 0) + v; return a; }, {}),
  };
  console.log(`\n  upgraded-side win rate: n ${summary.n}  min ${summary.min}  max ${summary.max}  mean ${summary.mean}  sd ${summary.sd}  maxSe ${summary.maxSe}`);
  console.log(`  upgrade teamRating ratio: ${summary.upgradeRatio.min} - ${summary.upgradeRatio.max} (mean ${summary.upgradeRatio.mean})`);
  console.log(`  every upgrade won more than half: ${summary.everyUpgradeWonMoreThanHalf}`);
  if (summary.belowHalf.length) console.log(`  BELOW HALF: ${JSON.stringify(summary.belowHalf)}`);
  console.log(`  structural: ${JSON.stringify(summary.structuralTotals)}`);

  const payload = {
    basis: "the 14 SYNTHETIC_DEVELOPMENT_V2 fixtures, each played against its own role-matched upgrade. Every holdout person is excluded from the upgrade pool. No Synthetic V2 fixture was simulated and no Synthetic V2 output was read.",
    purpose: "requireExtremeTalentRemainsMeaningful maps to one sealed fixture, so its band cannot be derived from the holdout. This ladder derives it from 14 non-holdout fixtures on the exact surface the formal run will use, and doubles as the check that the surface is monotonic in talent at all.",
    upgradeFactor: factor, pairsPerFixture: pairs, ratingBasis: "src/rating.js teamRating and slotRating",
    seedMaster: LADDER_MASTER, cells: rows, summary,
  };
  payload.ladderHash = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.devFixtureId, r.achievedRatio, r.strongerSideWinRate]))).digest("hex");
  writeArtifact("synthetic-v2-talent-gap-ladder", payload, {
    generationCommand: "npm run syn:ladder", dir: outDir, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nladderHash ${payload.ladderHash.slice(0, 16)}...`);
}
