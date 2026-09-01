#!/usr/bin/env node
// ── Candidate 4 repair probe ────────────────────────────────────────────────
// Measures what the four repairs actually move, on fixed matchups, eras and
// seeds, so the change manifest can state an effect rather than assert one.
//
//   node scripts/d0/candidate4Probe.mjs [out.json]
import { writeFileSync } from "node:fs";
import { computeResultPreview } from "../../api/_lib/previewEngine.js";

const TEAMS = [
  [["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"],
   ["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]],
  [["nash-2ks", "sheed-2ks", "pippen-90s", "dirk-00s", "rob-90s"],
   ["cp3-10s", "wade-2ks", "melo-2ks", "amare-2ks", "howard-2ks"]],
];
// Three pre-three-point eras and three with the line, so the transfer repair
// and the era-independent repairs are separable.
const ERAS = ["1960s", "1970s", "1980s", "2000s", "2010s", "2020s"];
// A ZONE coach must be in the sample or the ATTACK_ZONE_* adjustment never
// fires and the ZONE_ATTACK repair measures as a no-op. Only 4 of 30 coaches
// carry zoneUsage >= 5 (spoelstra 9, nurse 9, carlisle 7, nelson 6).
const COACHES = [["neutral", "neutral"], ["mike-dantoni", "pat-riley"],
  ["phil-jackson", "gregg-popovich"], ["phil-jackson", "nick-nurse"], ["erik-spoelstra", "rick-carlisle"]];
const SEEDS = Array.from({ length: 24 }, (_, i) => 900_000 + i * 7919);

const zero = () => ({ RIM: 0, PAINT_OR_POST: 0, MIDRANGE: 0, THREE_POINT: 0 });
const out = { generatedAt: null, byEra: {}, totals: { games: 0, pts: 0, fga: 0, tpa: 0, possessions: 0 } };

for (const era of ERAS) {
  const acc = { games: 0, pts: 0, fga: 0, tpa: 0, fgm: 0, ast: 0, to: 0, possessions: 0, cats: zero(), actions: {} };
  for (const [gold, blue] of TEAMS) {
    for (const [cg, cb] of COACHES) {
      for (const seed of SEEDS) {
        let r;
        try {
          r = computeResultPreview("single", gold.map((id) => ({ id })), blue.map((id) => ({ id })),
            { coachGoldId: cg, coachBlueId: cb, eraStyleId: era }, seed);
        } catch { continue; }
        const t = r?.v3?.teamTotals;
        if (!t) continue;
        acc.games++;
        for (const side of ["gold", "blue"]) {
          acc.pts += t[side].pts; acc.fga += t[side].fga; acc.tpa += t[side].tpa;
          acc.fgm += t[side].fgm; acc.ast += t[side].ast; acc.to += t[side].to;
          acc.possessions += t[side].possessions ?? 0;
        }
      }
    }
  }
  const share = (n) => acc.fga ? +(n / acc.fga).toFixed(5) : 0;
  out.byEra[era] = {
    games: acc.games,
    ppg: +(acc.pts / Math.max(1, acc.games) / 2).toFixed(3),
    fgaPerTeam: +(acc.fga / Math.max(1, acc.games) / 2).toFixed(3),
    threeShare: share(acc.tpa),
    fgPct: acc.fga ? +(acc.fgm / acc.fga).toFixed(5) : 0,
    astPerTeam: +(acc.ast / Math.max(1, acc.games) / 2).toFixed(3),
    toPerTeam: +(acc.to / Math.max(1, acc.games) / 2).toFixed(3),
    possPerTeam: +(acc.possessions / Math.max(1, acc.games) / 2).toFixed(3),
  };
  out.totals.games += acc.games; out.totals.pts += acc.pts;
  out.totals.fga += acc.fga; out.totals.tpa += acc.tpa; out.totals.possessions += acc.possessions;
  console.log(`${era}  games ${String(acc.games).padStart(4)}  ppg ${out.byEra[era].ppg}  fga ${out.byEra[era].fgaPerTeam}  3share ${out.byEra[era].threeShare}  fg% ${out.byEra[era].fgPct}  ast ${out.byEra[era].astPerTeam}`);
}

const path = process.argv[2] || "/tmp/candidate4-probe.json";
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`\n${out.totals.games} games -> ${path}`);
