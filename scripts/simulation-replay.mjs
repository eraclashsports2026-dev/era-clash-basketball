#!/usr/bin/env node
// ── Possession-engine replay ─────────────────────────────────────────────────
// INTERNAL DEVELOPMENT TOOL. Not exposed by any route.
//
// Reproduces a stored possession game from its fingerprint and canonical data.
// If a replay ever diverges, the engine is not deterministic and the whole
// reproducibility claim is void — so this compares the score, the winner, every
// player line, the possession count, the overtimes and the RNG step count, and
// reports the FIRST possession where two runs diverge rather than only that
// they did.
//
//   npm run simulation:replay -- --fingerprint=path/to/game.json
//   npm run simulation:replay -- --self-check
import { readFileSync } from "node:fs";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";

const arg = (n) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

/** Rebuild the input a stored game was produced from. */
export const inputFromRecord = (rec) => buildPossessionInput({
  goldIds: rec.goldIds, blueIds: rec.blueIds,
  coachGoldId: rec.coachGoldId ?? "neutral", coachBlueId: rec.coachBlueId ?? "neutral",
  eraStyleId: rec.eraStyleId, simulationSeed: rec.simulationSeed,
  simulationId: rec.simulationId ?? "replay", mode: rec.mode ?? "single",
});

const playerLine = (p) => `${p.cardId}|${p.pts},${p.fgm}/${p.fga},${p.tpm}/${p.tpa},${p.ftm}/${p.fta},${p.oreb}+${p.dreb},${p.ast},${p.stl},${p.blk},${p.to}`;

/** Compare two runs field by field, and locate the first divergent possession. */
export const compareGames = (a, b) => {
  const diffs = [];
  const eq = (label, x, y) => { if (x !== y) diffs.push(`${label}: ${x} != ${y}`); };
  eq("winner", a.winner, b.winner);
  eq("score.gold", a.finalScore.gold, b.finalScore.gold);
  eq("score.blue", a.finalScore.blue, b.finalScore.blue);
  eq("periods", a.periods, b.periods);
  eq("overtimes", a.overtimes, b.overtimes);
  eq("rngSteps", a.rngSteps, b.rngSteps);
  eq("possessions.gold", a.gold.totals.possessions, b.gold.totals.possessions);
  eq("possessions.blue", a.blue.totals.possessions, b.blue.totals.possessions);
  for (const side of ["gold", "blue"]) {
    a[side].players.forEach((p, i) => {
      const q = b[side].players[i];
      if (playerLine(p) !== playerLine(q)) diffs.push(`${side}[${i}] ${playerLine(p)} != ${playerLine(q)}`);
    });
  }
  const la = a.possessionLedger ?? [], lb = b.possessionLedger ?? [];
  if (la.length !== lb.length) diffs.push(`ledger length ${la.length} != ${lb.length}`);
  const firstDivergence = la.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(lb[i]));
  return { identical: diffs.length === 0 && firstDivergence === -1, diffs, firstDivergence };
};

export const replay = (rec) => {
  const original = runPossessionGame(inputFromRecord(rec), { assertInvariants: false });
  const again = runPossessionGame(inputFromRecord(rec), { assertInvariants: false });
  return { original, again, comparison: compareGames(original, again) };
};

const main = () => {
  const path = arg("fingerprint");
  const rec = path
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
      // --self-check: a fixed matchup, so the tool is exercisable with no file.
      goldIds: ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"],
      blueIds: ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"],
      coachGoldId: "phil-jackson", coachBlueId: "pat-riley",
      eraStyleId: "2010s", simulationSeed: 31337, mode: "single",
    };

  const { original, again, comparison } = replay(rec);
  console.log("── possession replay ───────────────────────────────────────────");
  console.log(`   matchup       ${rec.goldIds.join(",")}`);
  console.log(`                 vs ${rec.blueIds.join(",")}`);
  console.log(`   era / seed    ${rec.eraStyleId} / ${rec.simulationSeed}`);
  console.log(`   score         ${original.finalScore.gold}-${original.finalScore.blue}  (${original.winner})`);
  console.log(`   periods / OT  ${original.periods} / ${original.overtimes}`);
  console.log(`   possessions   ${original.gold.totals.possessions} / ${original.blue.totals.possessions}`);
  console.log(`   ledger        ${original.ledgerSize} possessions`);
  console.log(`   rng steps     ${original.rngSteps}`);
  console.log(`   fingerprint   pe${original.fingerprint.possessionEngineVersion} al${original.fingerprint.actionLibraryVersion} m${original.fingerprint.matchupFingerprint}`);
  const topScorer = [...original.gold.players, ...original.blue.players].sort((x, y) => y.pts - x.pts)[0];
  console.log(`   top scorer    ${topScorer.name} ${topScorer.pts}pts ${topScorer.reb}reb ${topScorer.ast}ast`);
  console.log("");
  if (comparison.identical) {
    console.log("   ✓ replay reproduced the game exactly");
  } else {
    console.log(`   ✗ replay DIVERGED (${comparison.diffs.length} field difference(s))`);
    if (comparison.firstDivergence >= 0) console.log(`     first divergent possession: #${comparison.firstDivergence}`);
    for (const d of comparison.diffs.slice(0, 10)) console.log(`     ${d}`);
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) main();
