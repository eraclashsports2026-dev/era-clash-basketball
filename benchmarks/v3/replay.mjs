#!/usr/bin/env node
// ── EraClash Labs: RESULT REPRODUCIBILITY (Addendum 29/30) ─────────────────────
// Takes a stored simulation fingerprint and reproduces the exact game. Every
// stored V3 result carries { seed, engine, possessionModel, ... } plus the
// input ids — that is sufficient to replay it bit-for-bit ON THE SAME ENGINE
// VERSION. Old results are never recomputed with newer engines; if the
// fingerprint's engine version differs from the running code, we say so
// instead of pretending the replay is authoritative.
//
//   node benchmarks/v3/replay.mjs '{"goldIds":[...],"blueIds":[...],"coachGoldId":"phil-jackson","coachBlueId":"pat-riley","eraStyleId":"1990s","seed":123456,"expect":{"gold":101,"blue":96}}'
//   (internal/dev tool — never exposed publicly)
import { PLAYERS } from "../../src/players.js";
import { simulateGameV3, resolveCoach, resolveEra, V3_VERSIONS } from "../../src/v3/engine.js";

const input = JSON.parse(process.argv[2] || "{}");
if (!input.goldIds || !input.blueIds || input.seed == null) {
  console.error("usage: node benchmarks/v3/replay.mjs '{\"goldIds\":[...5 ids],\"blueIds\":[...5 ids],\"coachGoldId\":\"...\",\"coachBlueId\":\"...\",\"eraStyleId\":\"...\",\"seed\":N,\"expect\":{\"gold\":N,\"blue\":N}}'");
  process.exit(2);
}
const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const team = (ids) => ids.map((id) => { const p = byId.get(id); if (!p) throw new Error(`unknown id ${id}`); return p; });

if (input.fingerprint?.engine && input.fingerprint.engine !== V3_VERSIONS.engine) {
  console.log(`⚠ fingerprint engine ${input.fingerprint.engine} ≠ running engine ${V3_VERSIONS.engine}`);
  console.log("  This replay uses CURRENT code and may differ from the stored result — historical results keep their original fingerprint and are never recomputed.");
}

const g = simulateGameV3(
  team(input.goldIds), team(input.blueIds),
  resolveCoach(input.coachGoldId || "neutral"), resolveCoach(input.coachBlueId || "neutral"),
  resolveEra(input.eraStyleId || "2020s"), Number(input.seed),
);

console.log(`engine ${V3_VERSIONS.engine} · seed ${input.seed} · era ${input.eraStyleId || "2020s"}`);
console.log(`winner ${g.winner} · ${g.finalScore.gold}-${g.finalScore.blue} · ${g.possessions} possessions${g.overtimes ? ` · ${g.overtimes} OT` : ""} · MVP ${g.mvp.name}`);
for (const [label, side] of [["GOLD", g.gold], ["BLUE", g.blue]]) {
  console.log(label + " " + side.lines.map((l) => `${l.name} ${l.pts}p/${l.oreb + l.dreb}r/${l.ast}a`).join(" · "));
}
if (input.expect) {
  const match = g.finalScore.gold === input.expect.gold && g.finalScore.blue === input.expect.blue;
  console.log(match ? "✓ REPRODUCED: exact score match" : `✗ MISMATCH: expected ${input.expect.gold}-${input.expect.blue}`);
  process.exit(match ? 0 : 1);
}
