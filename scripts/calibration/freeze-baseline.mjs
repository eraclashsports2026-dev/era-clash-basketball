#!/usr/bin/env node
// ── Baseline engine freeze ───────────────────────────────────────────────────
// Captures the EXACT current behaviour of the Phase 6B2 engine so framework
// work in Phase 6C1 cannot silently change it.
//
// This is a REGRESSION fixture, not a correctness claim. Nothing in it asserts
// the engine is historically right — only that it has not moved. A deliberate,
// approved data correction is EXPECTED to change specific hashes, and each such
// change must be reviewed and explained.
//
//   npm run calibration:freeze-baseline             # verify
//   npm run calibration:freeze-baseline -- --write  # regenerate
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { REGISTRY } from "../../src/versions.js";

// The original lives under baseline-engine/ and is FROZEN as a Phase 6C2A
// artefact — prior reports were computed against it, so rewriting it would
// silently invalidate them. Phase 6C2C2 deliberately changed engine behaviour
// (seeded opening possession), so the live baseline moves to its own
// phase-scoped path, exactly as the structural baselines did across 6C2A.
// Phase 6C4A: Candidate 1 deliberately changed engine behaviour (movement
// eligibility, adapter movement inputs, per-possession zone use), so the live
// baseline moves to a candidate-scoped path — the post-6c2c2 record stays
// frozen as Candidate 0's, exactly as the 6C2A originals did.
const OUT = new URL("../../tests/fixtures/calibration-framework/candidate1/engine-baseline.json", import.meta.url);

// Deliberately spans teams, coaches, eras, man and zone defence, and the
// flag-off Phase 6B1 path.
export const BASELINE_CASES = [
  { id: "showtime-vs-splash-1990s-man", goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"], blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"], eraStyleId: "1990s", coachGoldId: "pat-riley", coachBlueId: "phil-jackson", simulationSeed: 777 },
  { id: "stoppers-vs-splash-2020s-zone", goldIds: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"], blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"], eraStyleId: "2020s", coachGoldId: "nick-nurse", coachBlueId: "steve-kerr", simulationSeed: 4242 },
  { id: "size-vs-small-2010s", goldIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], blueIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"], eraStyleId: "2010s", coachGoldId: "jerry-sloan", coachBlueId: "steve-kerr", simulationSeed: 31337 },
  { id: "pre-three-point-1960s", goldIds: ["oscar-60s", "jerry-60s", "elgin-60s", "nate-60s", "wilt-60s"], blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"], eraStyleId: "1960s", coachGoldId: "red-auerbach", coachBlueId: "phil-jackson", simulationSeed: 1960 },
  // This is the corpus's ONLY overtime case, and the seed has now moved three
  // times (2020 -> 39 -> 13 -> 36) because each behaviour change shifted the
  // scoreline out of overtime. When a deliberate rewrite drops OT coverage,
  // find a new seed rather than relaxing the assertion that an overtime case
  // exists — the OT path is otherwise untested. Phase 6C2C2's seeded opening
  // possession moved it again; 36 was chosen because it reaches DOUBLE
  // overtime, which also exercises the repeat loop and the second overtime's
  // independent jump ball.
  // Candidate 1 moved the OT seed a fourth time (36 -> 1016, double overtime, re-searched after the full WS4-WS7 repair set),
  // found by search per the rule above. Candidate 2 moved it a fifth time
  // (1016 -> 11) after the assist-crediting and defensive-scheme repairs
  // shifted the scoreline out of overtime again. 11 reaches TRIPLE overtime,
  // which exercises the repeat loop and each overtime's independent jump ball.
  { id: "dantoni-pace-2020s", goldIds: ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"], blueIds: ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"], eraStyleId: "2020s", coachGoldId: "mike-dantoni", coachBlueId: "tom-thibodeau", simulationSeed: 11 },
  { id: "flag-off-6b1-path", goldIds: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"], blueIds: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"], eraStyleId: "1990s", coachGoldId: "pat-riley", coachBlueId: "phil-jackson", simulationSeed: 777, expandedActions: false, zoneResolution: false, offensiveAdjustments: false, opportunityAllocation: false },
];

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 16);

const actionSummary = (ledger) => {
  const c = {};
  for (const r of ledger ?? []) c[r.action] = (c[r.action] || 0) + 1;
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
};

export const captureCase = (c) => {
  const g = runPossessionGame(buildPossessionInput(c), { assertInvariants: true, includeLedger: true });
  return {
    id: c.id,
    inputFingerprint: sha({ goldIds: c.goldIds, blueIds: c.blueIds, eraStyleId: c.eraStyleId, coachGoldId: c.coachGoldId, coachBlueId: c.coachBlueId, expandedActions: c.expandedActions ?? true, zoneResolution: c.zoneResolution ?? true, offensiveAdjustments: c.offensiveAdjustments ?? true }),
    simulationSeed: c.simulationSeed,
    matchupFingerprint: g.fingerprint.matchupFingerprint,
    moduleVersions: g.fingerprint,
    finalScore: g.finalScore,
    winner: g.winner,
    periods: g.periods,
    overtimes: g.overtimes,
    rngSteps: g.rngSteps,
    possessions: { gold: g.gold.totals.possessions, blue: g.blue.totals.possessions },
    // Hashes rather than full box scores: a diff points at WHICH case moved,
    // and the case can then be re-run to see how.
    goldBoxHash: sha(g.gold),
    blueBoxHash: sha(g.blue),
    ledgerHash: sha(g.possessionLedger),
    defenseHash: g.defense ? sha(g.defense) : null,
    offenseHash: g.offense ? sha(g.offense) : null,
    actionDistribution: actionSummary(g.possessionLedger),
    zoneShells: g.zoneShells ?? null,
    replayStable: (() => {
      const again = runPossessionGame(buildPossessionInput(c), { assertInvariants: false, includeLedger: true });
      return sha(again.gold) === sha(g.gold) && sha(again.possessionLedger) === sha(g.possessionLedger);
    })(),
  };
};

export const captureBaseline = () => ({
  capturedFor: "phase-6c4a-candidate1",
  purpose: "Regression fixture. Detects accidental engine change during framework work. NOT a claim of historical correctness.",
  moduleVersions: Object.fromEntries(Object.entries(REGISTRY).map(([k, v]) => [k, v.value])),
  cases: BASELINE_CASES.map(captureCase),
});

export const loadBaseline = () => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null);

/** Compare a fresh capture against the stored one. Returns changed case ids. */
export const diffBaseline = (fresh = captureBaseline(), stored = loadBaseline()) => {
  if (!stored) return { missing: true, changed: [] };
  const FIELDS = ["finalScore", "winner", "periods", "overtimes", "rngSteps", "goldBoxHash", "blueBoxHash", "ledgerHash", "defenseHash", "offenseHash"];
  const changed = [];
  for (const f of fresh.cases) {
    const s = stored.cases.find((x) => x.id === f.id);
    if (!s) { changed.push({ id: f.id, fields: ["NEW_CASE"] }); continue; }
    const fields = FIELDS.filter((k) => JSON.stringify(f[k]) !== JSON.stringify(s[k]));
    if (fields.length) changed.push({ id: f.id, fields });
  }
  return { missing: false, changed };
};

const main = () => {
  const fresh = captureBaseline();
  if (process.argv.includes("--write")) {
    writeFileSync(OUT, `${JSON.stringify(fresh, null, 2)}\n`);
    console.log(`wrote ${fresh.cases.length} baseline cases`);
    for (const c of fresh.cases) console.log(`   ${c.id.padEnd(32)} ${c.finalScore.gold}-${c.finalScore.blue} ${c.winner.padEnd(5)} OT${c.overtimes} box=${c.goldBoxHash} replay=${c.replayStable ? "stable" : "UNSTABLE"}`);
    return;
  }
  const d = diffBaseline(fresh);
  if (d.missing) { console.error("no stored baseline — run with --write"); process.exitCode = 1; return; }
  for (const c of fresh.cases) {
    const ch = d.changed.find((x) => x.id === c.id);
    console.log(ch ? `   CHANGED  ${c.id.padEnd(32)} ${ch.fields.join(", ")}` : `   same     ${c.id}`);
  }
  console.log(d.changed.length === 0 ? "\n✓ engine behaviour unchanged" : `\n⚠ ${d.changed.length} case(s) changed — each must be reviewed and explained`);
  if (d.changed.length) process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]}`) main();
