#!/usr/bin/env node
// ── Player-draft hold QA ─────────────────────────────────────────────────────
// Exercises the corrected draft state machine directly against the run state,
// covering every hold combination the owner test exposed.
import fs from "node:fs";
import { POSITIONS, PLAYERS } from "../../src/players.js";
import { startRun, submitHolds, publicView } from "../../src/chaos/runState.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));
const hydrate = (arr) => Object.fromEntries(POSITIONS.map((s, i) => [s, byId.get(arr[i]) || null]));
const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

const run1 = startRun({ runId: "h".repeat(10), seedId: "hold-qa-1", createdAt: 0 });
ok("a started run reveals Roll 1 for both sides",
  run1.currentRoll === 1 && run1.goldRoster.filter(Boolean).length === 5 && run1.blueRoster.filter(Boolean).length === 5);
ok("the era is hidden at Roll 1", run1.revealedEraStyleId === null);

// Every hold cardinality is accepted.
for (const n of [0, 1, 2, 3, 4, 5]) {
  const r = startRun({ runId: "h".repeat(10), seedId: `card-${n}`, createdAt: 0 });
  const slots = POSITIONS.slice(0, n);
  const res = submitHolds(r, { holdSlots: slots, hydrate });
  const kept = POSITIONS.filter((s, i) => slots.includes(s) && r.goldRoster[i]);
  ok(`holding ${n} of five is accepted`, res.ok && r.currentRoll === 2);
  if (n > 0) {
    // Each held slot kept its card; each released slot was replaced.
    const before = startRun({ runId: "h".repeat(10), seedId: `card-${n}`, createdAt: 0 });
    const same = slots.every((s) => r.goldRoster[POSITIONS.indexOf(s)] === before.goldRoster[POSITIONS.indexOf(s)]);
    const replaced = POSITIONS.filter((s) => !slots.includes(s))
      .every((s) => r.goldRoster[POSITIONS.indexOf(s)] !== before.goldRoster[POSITIONS.indexOf(s)]);
    ok(`  holding ${n} keeps exactly those cards and rerolls the rest`, same && replaced);
  }
}

// Malformed submissions are refused rather than coerced.
{
  const r = startRun({ runId: "h".repeat(10), seedId: "bad", createdAt: 0 });
  ok("a duplicate slot is refused", submitHolds(r, { holdSlots: ["PG", "PG"], hydrate }).code === "DUPLICATE_SLOT");
  ok("an unknown slot is refused", submitHolds(r, { holdSlots: ["ZZ"], hydrate }).code === "UNKNOWN_SLOT");
  ok("a non-array is refused", submitHolds(r, { holdSlots: "PG", hydrate }).code === "VALIDATION_FAILURE");
  ok("the run is untouched by a refused submission", r.currentRoll === 1);
}

// Roll 2: kept cards come back pre-selected, and can be released.
{
  const r = startRun({ runId: "h".repeat(10), seedId: "roll2", createdAt: 0 });
  submitHolds(r, { holdSlots: ["PG", "C"], hydrate });
  const v = publicView(r, { hydrate });
  ok("the era is revealed with Roll 2", !!v.era?.eraId, v.era?.eraId);
  ok("the era banner is present from Roll 2 onward", !!v.eraContext);
  ok("cards kept through Roll 1 are still held at Roll 2",
    v.gold.heldSlots.includes("PG") && v.gold.heldSlots.includes("C"), v.gold.heldSlots.join(","));
  // Release one previously held card and keep a new one.
  const before = [...r.goldRoster];
  submitHolds(r, { holdSlots: ["SG"], hydrate });
  ok("a previously held card can be released and is replaced",
    r.goldRoster[POSITIONS.indexOf("PG")] !== before[POSITIONS.indexOf("PG")]);
  ok("a newly held card survives the final roll",
    r.goldRoster[POSITIONS.indexOf("SG")] === before[POSITIONS.indexOf("SG")]);
  ok("the roster locks after three rolls", r.currentRoll === 3);
  ok("a fourth roll is refused", submitHolds(r, { holdSlots: [], hydrate }).ok === false);
  const locked = publicView(r, { hydrate });
  ok("the view reports the roster locked", locked.rostersLocked === true);
}

// Burned cards never return; one person never appears twice.
{
  const r = startRun({ runId: "h".repeat(10), seedId: "burn", createdAt: 0 });
  const seen = new Set([...r.goldRoster, ...r.blueRoster]);
  submitHolds(r, { holdSlots: [], hydrate });
  submitHolds(r, { holdSlots: [], hydrate });
  const burned = new Set(r.burnedPersonIds);
  const returned = [...r.goldRoster, ...r.blueRoster].filter((id) => burned.has(id));
  ok("no burned card returned", returned.length === 0, returned.join(","));
  const names = [...r.goldRoster, ...r.blueRoster].filter(Boolean).map((id) => byId.get(id)?.name);
  ok("one canonical person appears at most once", new Set(names).size === names.length);
}

const passed = checks.filter((c) => c.pass).length;
fs.mkdirSync("data/validation/8b", { recursive: true });
fs.writeFileSync("data/validation/8b/player-hold-interaction-qa.json", JSON.stringify({
  artifact: "player-hold-interaction-qa", phase: "8B", checks: checks.length, passed, results: checks,
}, null, 2) + "\n");
console.log(`\n${passed}/${checks.length} hold checks passed`);
process.exit(passed === checks.length ? 0 : 1);
