#!/usr/bin/env node
// ── Chaos Draft replay determinism ───────────────────────────────────────────
// Same seed + same decisions → an identical complete draft path.
// Same seed + different decisions → a different but reproducible branch.
import fs from "node:fs";
import { POSITIONS, PLAYERS } from "../../src/players.js";
import { startRun, revealEra, submitRollDecisions } from "../../src/chaos/runState.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr[i]) || null]));
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

/** Walk a whole draft under a fixed decision sequence and fingerprint the path. */
const walk = (seedId, decisions) => {
  const run = startRun({ runId: "r".repeat(10), seedId, createdAt: 0 });
  const path = [run.goldRoster.join(","), run.blueRoster.join(",")];
  for (const d of decisions) {
    submitRollDecisions(run, { holdSlots: d, holdRoles: [], hydrate });
    path.push(run.goldRoster.join(","), run.blueRoster.join(","), run.burnedPersonIds.slice().sort().join(","));
  }
  path.push(run.revealedEraStyleId, (run.coachOffers?.gold || []).map((o) => o.coachId).join(","));
  return path.join("|");
};

const A = walk("seed-alpha-1", [["PG", "C"], ["PG"]]);
const B = walk("seed-alpha-1", [["PG", "C"], ["PG"]]);
ok("same seed + same decisions reproduce an identical path", A === B);

const C = walk("seed-alpha-1", [["SG"], ["SF"]]);
ok("same seed + different decisions branch to a different path", A !== C);
const C2 = walk("seed-alpha-1", [["SG"], ["SF"]]);
ok("that branch is itself reproducible", C === C2);

const D = walk("seed-beta-2", [["PG", "C"], ["PG"]]);
ok("a different seed produces a different run", A !== D);

ok("the era is a function of the seed alone", revealEra("seed-alpha-1") === revealEra("seed-alpha-1"));
ok("different seeds can produce different eras",
  new Set(Array.from({ length: 40 }, (_, i) => revealEra(`e${i}`))).size > 1);

// Exactly three rolls.
const run = startRun({ runId: "x".repeat(10), seedId: "roll-count", createdAt: 0 });
submitRollDecisions(run, { holdSlots: [], holdRoles: [], hydrate });
submitRollDecisions(run, { holdSlots: [], holdRoles: [], hydrate });
const fourth = submitRollDecisions(run, { holdSlots: [], holdRoles: [], hydrate });
ok("a fourth roll is refused", fourth.ok === false && run.currentRoll === 3);

// Burned people never return, across the whole run.
const r2 = startRun({ runId: "y".repeat(10), seedId: "burn-check", createdAt: 0 });
const seen1 = new Set([...r2.goldRoster, ...r2.blueRoster]);
submitRollDecisions(r2, { holdSlots: [], holdRoles: [], hydrate });
submitRollDecisions(r2, { holdSlots: [], holdRoles: [], hydrate });
const burned = new Set(r2.burnedPersonIds);
const returned = [...r2.goldRoster, ...r2.blueRoster].filter((id) => burned.has(id));
ok("no burned person returned", returned.length === 0, returned.join(","));

// One canonical person per matchup.
const names = [...r2.goldRoster, ...r2.blueRoster].filter(Boolean).map((id) => byId.get(id)?.name);
ok("one canonical person appears at most once in a matchup", new Set(names).size === names.length);

const passed = checks.filter((c) => c.pass).length;
fs.writeFileSync("data/validation/8a/chaos-replay.json", JSON.stringify({
  artifact: "chaos-replay", phase: "8A", checks: checks.length, passed, results: checks,
}, null, 2) + "\n");
console.log(`\n${passed}/${checks.length} replay checks passed`);
process.exit(passed === checks.length ? 0 : 1);
