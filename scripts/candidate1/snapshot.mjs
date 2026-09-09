#!/usr/bin/env node
// ── Candidate behaviour snapshot ────────────────────────────────────────────
//   npm run c1:snapshot -- --label=candidate0
//
// Records seeded game results under the CURRENT engine so that, after Candidate
// 1's changes land, "what changed" is a diff of recorded facts rather than a
// memory. Taken across eras, coaches, public rosters and the V4 diagnostic
// teams. Also records a production-engine (3.2.0) sample, which must remain
// byte-identical through this whole phase.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";

import { teamFromFixture } from "../validation/evalV4.mjs";
import { loadCorpusV4 } from "../validation/buildCorpusV4.mjs";
import { loadPlayersV4 } from "../validation/buildPlayersV4.mjs";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { deriveSeed } from "../../src/v3/seed.js";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const person = (id) => personIdForCard(id) ?? id;
const legalFive = (rot) => {
  const pool = PLAYERS.map((c, i) => ({ c, o: (i + rot * 37) % PLAYERS.length })).sort((a, b) => a.o - b.o).map((x) => x.c);
  const u = new Set(); const out = new Array(5).fill(null);
  const walk = (i) => { if (i === 5) return true;
    for (const c of pool) { const p = person(c.id); if (u.has(p) || !(c.positions ?? [c.pos]).includes(SLOTS[i])) continue;
      u.add(p); out[i] = c.id; if (walk(i + 1)) return true; u.delete(p); out[i] = null; } return false; };
  walk(0); return out;
};
const snapSeed = (i) => deriveSeed(0x6c4a01, i);

export const takeSnapshot = () => {
  const games = [];
  // public-card games across eras and coaches
  const coaches = ["red-auerbach", "pat-riley", "phil-jackson", "gregg-popovich", "steve-kerr", "erik-spoelstra", "doug-moe", "tom-thibodeau"];
  const eras = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
  for (let i = 0; i < 24; i++) {
    const g = runPossessionGame(buildPossessionInput({
      goldIds: legalFive(i), blueIds: legalFive(i + 9),
      coachGoldId: coaches[i % 8], coachBlueId: coaches[(i + 3) % 8],
      eraStyleId: eras[i % 8], simulationSeed: snapSeed(i),
    }), { includeLedger: false, assertInvariants: true });
    games.push({ kind: "public", i, era: eras[i % 8], gold: g.finalScore.gold, blue: g.finalScore.blue,
      boxHash: createHash("sha256").update(JSON.stringify([g.gold.players, g.blue.players])).digest("hex").slice(0, 16) });
  }
  // V4 diagnostic teams (consumed set — legitimate development data now)
  const corpus = loadCorpusV4();
  const v3p = loadPlayers(); const v4p = loadPlayersV4();
  const profiles = new Map([...v3p.profiles, ...v4p.profiles].map((p) => [p.calibrationPlayerId, p]));
  const picks = ["v4-1991-92-bulls", "v4-1977-78-spurs", "v4-1978-79-supersonics", "v4-1989-90-pistons", "v4-2021-22-heat", "v4-1969-70-supersonics"];
  for (const [k, id] of picks.entries()) {
    const f = corpus.fixtures.find((x) => x.fixtureId === id);
    const team = teamFromFixture(f, profiles);
    const g = runPossessionGame({
      simulationId: "snap", simulationSeed: snapSeed(100 + k), mode: "single", eraStyleId: f.eraStyleId,
      parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
      offensiveAdjustments: true, opportunityAllocation: true, gold: team, blue: team,
    }, { includeLedger: false, assertInvariants: true });
    games.push({ kind: "v4-diagnostic", fixtureId: id, gold: g.finalScore.gold, blue: g.finalScore.blue,
      boxHash: createHash("sha256").update(JSON.stringify([g.gold.players, g.blue.players])).digest("hex").slice(0, 16) });
  }
  // production 3.2.0: the engine source itself must stay byte-identical through
  // the phase. Its behaviour is already covered by the existing production
  // replay tests; the hash here makes any drift a recorded fact.
  const prod = { productionEngineSha256: createHash("sha256").update(readFileSync("src/engine.js")).digest("hex") };
  return { games, production: prod,
    snapshotHash: createHash("sha256").update(JSON.stringify({ games, prod })).digest("hex") };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const label = (process.argv.find((a) => a.startsWith("--label=")) ?? "--label=snapshot").split("=")[1];
  const snap = takeSnapshot();
  mkdirSync("data/validation/6c4a", { recursive: true });
  writeFileSync(`data/validation/6c4a/behaviour-snapshot-${label}.json`, `${JSON.stringify(snap, null, 2)}\n`);
  console.log(`games ${snap.games.length} · production samples ${snap.production.length} · snapshotHash ${snap.snapshotHash.slice(0, 20)}...`);
  console.log(`wrote data/validation/6c4a/behaviour-snapshot-${label}.json`);
}
