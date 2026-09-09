#!/usr/bin/env node
// ── Behaviour-only capture, for proving an identity fix changes no result ────
//   node scripts/v5/behaviourProof.mjs <out.json>
//
// Captures every field that describes WHAT HAPPENED and deliberately excludes
// every field that describes WHICH VERSIONS produced it. An identity repair
// must leave this file byte-identical; anything else is a behaviour change
// wearing an identity repair's clothes.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runPossessionGame, runPossessionSeries } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { estimateWinProbability } from "../../src/v3/calibration/monteCarloProbability.js";
import { PARITY_FIXTURES } from "../calibration/freeze-pre-wiring.mjs";
import { BASELINE_CASES, captureCase } from "../calibration/freeze-baseline.mjs";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { deriveSeed } from "../../src/v3/seed.js";

const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;
const legalFive = (rotate) => {
  const pool = PLAYERS.map((c, i) => ({ c, order: (i + rotate * 37) % PLAYERS.length }))
    .sort((a, b) => a.order - b.order).map((x) => x.c);
  const used = new Set(); const out = new Array(5).fill(null);
  const walk = (i) => {
    if (i === 5) return true;
    for (const c of pool) {
      const pid = person(c.id);
      if (used.has(pid) || !(c.positions ?? [c.pos]).includes(SLOTS[i])) continue;
      used.add(pid); out[i] = c.id;
      if (walk(i + 1)) return true;
      used.delete(pid); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error(`no legal five at ${rotate}`);
  return out;
};
const COACHES = ["red-auerbach", "pat-riley", "phil-jackson", "gregg-popovich", "steve-kerr", "erik-spoelstra", "nick-nurse", "mike-dantoni"];
const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
/** Behaviour of one game: scores, box, ledger, rng draws — never versions. */
const behaviour = (g) => ({
  finalScore: g.finalScore, winner: g.winner, periods: g.periods, overtimes: g.overtimes,
  periodScores: g.periodScores, rngSteps: g.rngSteps, ledgerSize: g.ledgerSize,
  goldTotals: g.gold.totals, blueTotals: g.blue.totals,
  goldPlayers: sha(g.gold.players), bluePlayers: sha(g.blue.players),
  ledger: sha(g.possessionLedger ?? null),
  offense: sha(g.offense ?? null), defense: sha(g.defense ?? null),
  zoneShells: g.zoneShells ?? null, invariantViolations: (g.invariantViolations ?? []).length,
});

const out = { capturedFor: "identity-repair behaviour proof", cases: [] };

// 1. the pre-wiring parity corpus, exactly as its own harness builds it
for (const f of PARITY_FIXTURES) {
  const g = runPossessionGame(buildPossessionInput({
    goldIds: f.gold, blueIds: f.blue, coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId,
    eraStyleId: f.era, simulationSeed: f.seed, zoneResolution: f.zone !== false,
    expandedActions: f.expandedActions !== false, offensiveAdjustments: f.offensiveAdjustments !== false,
    opportunityAllocation: f.opportunityAllocation !== false,
  }), { includeLedger: true, assertInvariants: false });
  out.cases.push({ id: `parity:${f.id}`, ...behaviour(g) });
}
// 2. the 6C1 baseline cases
for (const c of BASELINE_CASES) {
  const g = runPossessionGame(buildPossessionInput(c), { includeLedger: true, assertInvariants: false });
  out.cases.push({ id: `baseline:${c.id}`, ...behaviour(g) });
}
// 3. a broad era x coach sweep
for (let i = 0; i < 400; i++) {
  const g = runPossessionGame(buildPossessionInput({
    goldIds: legalFive(i), blueIds: legalFive(i + 7), coachGoldId: COACHES[i % 8],
    coachBlueId: COACHES[(i + 3) % 8], eraStyleId: ERAS[i % 8], simulationSeed: deriveSeed(0x6c4b01, i),
  }), { includeLedger: true, assertInvariants: false });
  out.cases.push({ id: `sweep:${i}`, ...behaviour(g) });
}
// 4. series and season behaviour
for (const [i, games] of [7, 82].entries()) {
  const gs = runPossessionSeries(buildPossessionInput({
    goldIds: legalFive(3), blueIds: legalFive(11), coachGoldId: "phil-jackson", coachBlueId: "pat-riley",
    eraStyleId: "1990s", simulationSeed: deriveSeed(0x6c4b02, i), mode: games === 7 ? "best7" : "82",
  }), { games, opts: { includeLedger: false, assertInvariants: false } });
  out.cases.push({ id: `series:${games}`, seriesHash: sha(gs.map(behaviour)), games: gs.length });
}
// 5. probability estimate behaviour (win counts, not cache keys)
const T = (ids) => ({ playerIds: ids, coachId: "neutral" });
const est = estimateWinProbability({
  teamA: T(legalFive(5)), teamB: T(legalFive(13)), eraStyleId: "2010s",
  sampleTier: "STANDARD", buildInput: buildPossessionInput, cache: false,
});
out.cases.push({ id: "probability", goldWins: est.goldWins, blueWins: est.blueWins,
  sampleCount: est.sampleCount, goldWinProbability: est.goldWinProbability, sideBias: est.sideBias.difference });

out.behaviourHash = sha(out.cases);
writeFileSync(process.argv[2], `${JSON.stringify(out, null, 2)}\n`);
console.log(`${out.cases.length} behaviour cases · behaviourHash ${out.behaviourHash}`);
