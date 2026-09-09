#!/usr/bin/env node
// ── Mirror side symmetry, at power ──────────────────────────────────────────
//   node scripts/candidate2/symmetry.mjs --out=<path> [--games=8000]
//
// Standalone so it runs unchanged in a worktree at the parent commit. The
// in-harness cells were 1,600 games, where one standard error is 0.0125 and a
// single 2-SE cell out of five is ordinary sampling behaviour rather than a
// signal. This measures the claim at a volume that can actually support it.
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const FIVE = ["cp3-10s", "klay-10s", "butler-10s", "jokic-10s", "dwight-10s"];
const CELLS = [
  ["2010s", "tom-thibodeau", "high-help coach"], ["2010s", "steve-kerr", "high-ball-movement coach"],
  ["2010s", "neutral", "neutral"], ["1960s", "red-auerbach", "restricted era"],
  ["2020s", "doc-rivers", "modern high-help"], ["1990s", "george-karl", "pressure coach"],
  ["1950s", "john-kundla", "earliest era"], ["2000s", "gregg-popovich", "modern man"],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const out = arg("out", null); const games = Number(arg("games", 8000));
  if (!out) { console.error("--out required"); process.exit(2); }

  const cells = CELLS.map(([era, coach, label], ci) => {
    let gold = 0, decided = 0, ties = 0, inv = 0;
    for (let i = 0; i < games; i += 1) {
      const g = runPossessionGame(buildPossessionInput({ goldIds: FIVE, blueIds: FIVE,
        coachGoldId: coach, coachBlueId: coach, eraStyleId: era,
        simulationSeed: deriveSeed(0x6c4c19, ci * 200000 + i) }), { includeLedger: false, assertInvariants: false });
      inv += (g.invariantViolations ?? []).length;
      if (g.finalScore.gold === g.finalScore.blue) { ties += 1; continue; }
      decided += 1; if (g.finalScore.gold > g.finalScore.blue) gold += 1;
    }
    const p = gold / decided; const se = Math.sqrt(p * (1 - p) / decided);
    return { era, coach, label, games, decided, ties, invariantViolations: inv,
      goldWinRate: r5(p), standardError: r5(se),
      ci95: { lower: r5(p - 1.96 * se), upper: r5(p + 1.96 * se) },
      containsHalf: p - 1.96 * se <= 0.5 && p + 1.96 * se >= 0.5,
      deviation: r5(Math.abs(p - 0.5)), sigmaFromHalf: r5(Math.abs(p - 0.5) / se) };
  });
  // side-swap on an ASYMMETRIC matchup: the repairs differ per side there, so
  // this is where a genuine side bias could hide
  const OPP = ["bibby-00s", "monroe-70s", "cooper-80s", "mcHale-80s", "elvin-70s"];
  let aWinsAsGold = 0, aWinsAsBlue = 0, dg = 0, db = 0;
  for (let i = 0; i < games; i += 1) {
    const seed = deriveSeed(0x6c4c1a, i);
    const g1 = runPossessionGame(buildPossessionInput({ goldIds: FIVE, blueIds: OPP,
      coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau", eraStyleId: "2010s", simulationSeed: seed }),
      { includeLedger: false, assertInvariants: false });
    const g2 = runPossessionGame(buildPossessionInput({ goldIds: OPP, blueIds: FIVE,
      coachGoldId: "tom-thibodeau", coachBlueId: "steve-kerr", eraStyleId: "2010s", simulationSeed: seed }),
      { includeLedger: false, assertInvariants: false });
    if (g1.finalScore.gold !== g1.finalScore.blue) { dg += 1; if (g1.finalScore.gold > g1.finalScore.blue) aWinsAsGold += 1; }
    if (g2.finalScore.gold !== g2.finalScore.blue) { db += 1; if (g2.finalScore.blue > g2.finalScore.gold) aWinsAsBlue += 1; }
  }
  const pg = aWinsAsGold / dg, pb = aWinsAsBlue / db;
  const seDiff = Math.sqrt(pg * (1 - pg) / dg + pb * (1 - pb) / db);
  const swap = { asGold: r5(pg), asBlue: r5(pb), difference: r5(pg - pb),
    standardError: r5(seDiff), sigmaFromZero: r5(Math.abs(pg - pb) / seDiff),
    consistentWithZero: Math.abs(pg - pb) <= 1.96 * seDiff, games: games * 2 };

  // overtime and competition-mode symmetry
  let otSeen = 0;
  for (let i = 0; i < 400; i += 1) {
    const g = runPossessionGame(buildPossessionInput({ goldIds: FIVE, blueIds: FIVE,
      coachGoldId: "neutral", coachBlueId: "neutral", eraStyleId: "2010s",
      simulationSeed: deriveSeed(0x6c4c1b, i) }), { includeLedger: false, assertInvariants: false });
    if ((g.periods ?? []).length > 4 || (g.overtimePeriods ?? 0) > 0) otSeen += 1;
  }
  let seasonGold = 0, seasonGames = 0;
  for (let s = 0; s < 60; s += 1) {
    const gs = runPossessionSeries(buildPossessionInput({ goldIds: FIVE, blueIds: FIVE,
      coachGoldId: "neutral", coachBlueId: "neutral", eraStyleId: "2010s",
      simulationSeed: deriveSeed(0x6c4c1c, s), mode: "82" }), { games: 82, opts: { assertInvariants: false, includeLedger: false } });
    for (const g of gs) { seasonGames += 1; if (g.finalScore.gold > g.finalScore.blue) seasonGold += 1; }
  }

  const payload = {
    candidate2SideSymmetryVersion: "1.0.0",
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    gamesPerCell: games, cells,
    allContainHalf: cells.every((c) => c.containsHalf),
    cellsContainingHalf: cells.filter((c) => c.containsHalf).length,
    largestDeviation: r5(Math.max(...cells.map((c) => c.deviation))),
    largestSigma: r5(Math.max(...cells.map((c) => c.sigmaFromHalf))),
    totalMirrorGames: cells.reduce((a, c) => a + c.games, 0),
    totalTies: cells.reduce((a, c) => a + c.ties, 0),
    totalInvariantViolations: cells.reduce((a, c) => a + c.invariantViolations, 0),
    asymmetricSideSwap: swap,
    overtimeGamesObserved: otSeen,
    mirrorSeason: { seasons: 60, games: seasonGames, goldWinRate: r5(seasonGold / seasonGames),
      meanGoldWins: r5(seasonGold / 60),
      nearFortyOne: Math.abs(seasonGold / 60 - 41) <= 2.5 },
    note: "a mirror gives both sides the same five, the same coach and therefore the same assist multiplier and the same scheme differential, so neither Candidate 2 repair can express a side bias through one. The asymmetric side swap is where a genuine bias could hide, so it is measured too.",
  };
  payload.symmetryHash = createHash("sha256").update(JSON.stringify(cells.map((c) => [c.era, c.coach, c.goldWinRate]))).digest("hex");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`  calibration ${payload.calibrationVersion}: ${payload.cellsContainingHalf}/${cells.length} cells contain 0.5, largest deviation ${payload.largestDeviation} (${payload.largestSigma} sigma)`);
  console.log(`  asymmetric side swap difference ${swap.difference} (${swap.sigmaFromZero} sigma), consistent with zero: ${swap.consistentWithZero}`);
  console.log(`  mirror season mean gold wins ${payload.mirrorSeason.meanGoldWins} over ${payload.mirrorSeason.games} games`);
}
