#!/usr/bin/env node
// ── Pre-wiring behaviour baseline ───────────────────────────────────────────
// The post-side-symmetry engine's exact output, captured BEFORE any parameter
// is wired.
//
// This is the reference that default parity is judged against. Phase 6C2C3 is
// plumbing: connecting the registry must change the engine's METADATA and
// nothing else. If a fixture drifts, the wiring is wrong — the fixture is not
// re-recorded.
//
//   npm run calibration:parameters:freeze
//   npm run calibration:parameters:parity      (compare against this)
//
// No holdout fixture appears here. The parity set is drawn from historical
// calibration v3, synthetic development v2, and controlled generated fixtures.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { PLAYERS, findCard } from "../../src/players.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_DEVELOPMENT_V2, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { versionOf } from "../../src/versions.js";

export const PRE_WIRING_DIR = "tests/fixtures/parameter-wiring/pre-wiring";
export const PRE_WIRING_PATH = `${PRE_WIRING_DIR}/behaviour-baseline.json`;

const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 16);

// ── Fixture construction ────────────────────────────────────────────────────
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const legalFive = (pool, rank) => {
  const used = new Set(); const out = new Array(5).fill(null);
  const eligible = (c, s) => (c.positions ?? [c.pos]).includes(s) || c.pos === s;
  const walk = (i) => {
    if (i === 5) return true;
    for (const c of pool.filter((x) => !used.has(x.id) && eligible(x, SLOTS[i])).sort((a, b) => rank(b) - rank(a))) {
      used.add(c.id); out[i] = c.id;
      if (walk(i + 1)) return true;
      used.delete(c.id); out[i] = null;
    }
    return false;
  };
  if (!walk(0)) throw new Error("no legal five");
  return out;
};
const ofDecade = (d) => PLAYERS.filter((p) => p.decade === d);
const without = (pool, ids) => pool.filter((p) => !ids.includes(p.id));
const scorer = (p) => (p.pts ?? 0) * 2 + (p.ast ?? 0) + (p.reb ?? 0) * 0.5;

const SHOOTERS = legalFive(ofDecade("2010s"), (p) => (p.pts ?? 0) + (p.an1 ?? 0) * 3 - (p.reb ?? 0) * 1.5);
const BIGS = legalFive(without(ofDecade("2010s"), SHOOTERS), (p) => (p.reb ?? 0) * 2 + (p.blk ?? 0) * 4 - (p.pts ?? 0) * 0.5);
const CREATORS = legalFive(ofDecade("2010s"), (p) => (p.pts ?? 0) * 2 + (p.ast ?? 0) * 2);
const BALANCED = legalFive(without(ofDecade("2010s"), CREATORS), (p) => (p.ast ?? 0) + (p.reb ?? 0) - Math.abs((p.pts ?? 0) - 18));
const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

/**
 * The parity corpus. Every Era Style, man and zone, several coach systems, a
 * mirror, side-swapped pairs, and both a single and a double overtime — because
 * the overtime path is otherwise untested and this phase touches the code that
 * decides who starts one.
 */
export const PARITY_FIXTURES = (() => {
  const f = [];
  const add = (o) => f.push({ zone: true, coachGoldId: "steve-kerr", coachBlueId: "tom-thibodeau", ...o });

  // Every Era Style, so an era-parameter wiring error cannot hide.
  for (const era of ERAS) {
    add({ id: `era-${era}`, era, gold: SHOOTERS, blue: BIGS, seed: 1000 + ERAS.indexOf(era) });
  }
  // Man vs zone in a zone-legal era, same seed, so the shell is the only change.
  //
  // NOTE: steve-kerr and tom-thibodeau never reach the zone gate, so these two
  // fixtures are byte-identical and prove nothing about zone. They are KEPT
  // because they were in the frozen baseline and still pass, and because a
  // flag-toggle that changes nothing is itself worth pinning. The fixtures that
  // actually exercise zone follow below.
  add({ id: "man-2010s", era: "2010s", gold: SHOOTERS, blue: BIGS, seed: 2001, zone: false });
  add({ id: "zone-2010s", era: "2010s", gold: SHOOTERS, blue: BIGS, seed: 2001, zone: true });
  // Real zone. Only four coaches in the pool reach the zone gate; measured, not
  // assumed. Each of these produces 56-75 zone actions per game and a live
  // shell, which is what the zone gap parameters need in order to be observed.
  for (const [i, coach] of ["nick-nurse", "erik-spoelstra", "rick-carlisle", "don-nelson"].entries()) {
    add({ id: `real-zone-${coach}`, era: "2010s", gold: SHOOTERS, blue: BIGS,
      coachGoldId: "steve-kerr", coachBlueId: coach, seed: 2100 + i, zone: true });
  }
  // Coach systems.
  for (const [i, [cg, cb]] of [["phil-jackson", "gregg-popovich"], ["red-auerbach", "pat-riley"],
    ["mike-dantoni", "jerry-sloan"], ["neutral", "neutral"]].entries()) {
    add({ id: `coach-${cg}-vs-${cb}`, era: "2010s", gold: BALANCED, blue: CREATORS, coachGoldId: cg, coachBlueId: cb, seed: 3000 + i });
  }
  // Construction contrasts, which exercise opportunity allocation hardest.
  add({ id: "balanced-vs-creators", era: "2010s", gold: BALANCED, blue: CREATORS, seed: 4001 });
  add({ id: "shooters-vs-bigs", era: "1990s", gold: SHOOTERS, blue: BIGS, seed: 4002 });
  // Mirror: identical rosters and coach, so any asymmetry is structural.
  add({ id: "mirror-2010s", era: "2010s", gold: SHOOTERS, blue: SHOOTERS, coachBlueId: "steve-kerr", seed: 5001 });
  // Side-swapped pair on one seed.
  add({ id: "swap-a", era: "2010s", gold: SHOOTERS, blue: BIGS, seed: 6001 });
  add({ id: "swap-b", era: "2010s", gold: BIGS, blue: SHOOTERS, coachGoldId: "tom-thibodeau", coachBlueId: "steve-kerr", seed: 6001 });
  // Flags off, so the pre-6B1 path is covered too.
  add({ id: "flags-off", era: "1990s", gold: SHOOTERS, blue: BIGS, seed: 7001,
    zone: false, expandedActions: false, offensiveAdjustments: false, opportunityAllocation: false });
  // Overtime, single and double. These seeds were found by SEARCH, not guessed:
  // the first attempt used round numbers and both fixtures came back OT0, so
  // two fixtures named "overtime" contained no overtime at all. The overtime
  // path is the one this phase's parent branch changed (seeded jump ball), so a
  // parity corpus without it would miss exactly the regression most likely to
  // occur. A test asserts both remain overtime games.
  add({ id: "overtime-single", era: "2020s", gold: SHOOTERS, blue: BIGS, seed: 13 });
  add({ id: "overtime-double", era: "2020s", gold: SHOOTERS, blue: BIGS, seed: 252 });
  // Synthetic development fixtures, which development is permitted to inspect.
  for (const [i, s] of SYNTHETIC_DEVELOPMENT_V2.slice(0, 6).entries()) {
    add({ id: `synthdev-${s.id}`, era: s.era, gold: s.five, blue: SYNTHETIC_DEVELOPMENT_V2[(i + 1) % 6].five,
      coachGoldId: s.coach, coachBlueId: SYNTHETIC_DEVELOPMENT_V2[(i + 1) % 6].coach, seed: 9000 + i });
  }
  return f;
})();

/** Refuses a holdout fixture by construction, not by convention. */
export const assertNoHoldout = (fixtures) => {
  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id)]);
  const bad = fixtures.filter((f) => sealed.has(f.id) || [...sealed].some((s) => f.id.includes(s)));
  if (bad.length) throw new Error(`parity set contains sealed holdout fixtures: ${bad.map((b) => b.id).join(", ")}`);
  const sealedFives = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => JSON.stringify([...f.five].sort())));
  for (const f of fixtures) {
    for (const five of [f.gold, f.blue]) {
      if (sealedFives.has(JSON.stringify([...five].sort()))) {
        throw new Error(`parity fixture ${f.id} reuses a sealed holdout lineup`);
      }
    }
  }
  return true;
};

/** Everything about a result that the wiring must not change. */
export const captureFixture = (f) => {
  const g = runPossessionGame(buildPossessionInput({
    goldIds: f.gold, blueIds: f.blue, coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId,
    eraStyleId: f.era, simulationSeed: f.seed,
    zoneResolution: f.zone !== false,
    expandedActions: f.expandedActions !== false,
    offensiveAdjustments: f.offensiveAdjustments !== false,
    opportunityAllocation: f.opportunityAllocation !== false,
  }), { includeLedger: true });

  const actionMix = {};
  const locationMix = {};
  for (const p of g.possessionLedger ?? []) {
    actionMix[p.action] = (actionMix[p.action] ?? 0) + 1;
    if (p.shot?.location) locationMix[p.shot.location] = (locationMix[p.shot.location] ?? 0) + 1;
  }
  const playerLine = (box) => box.players.map((p) => `${p.cardId}:${p.pts}/${p.fga}/${p.fgm}/${p.tpa}/${p.tpm}/${p.fta}/${p.ftm}/${p.oreb}/${p.dreb}/${p.ast}/${p.stl}/${p.blk}/${p.to}`).join("|");

  return {
    id: f.id,
    seed: f.seed, era: f.era,
    finalScore: g.finalScore,
    winner: g.winner,
    periods: g.periods,
    overtimes: g.overtimes,
    periodScores: g.periodScores,
    // Counted RNG draws. The single most sensitive parity signal: a parameter
    // lookup that consumes randomness moves this even when the score does not.
    rngSteps: g.rngSteps,
    ledgerSize: g.ledgerSize,
    goldTotals: g.gold.totals,
    blueTotals: g.blue.totals,
    goldPlayersHash: sha(playerLine(g.gold)),
    bluePlayersHash: sha(playerLine(g.blue)),
    ledgerHash: sha(g.possessionLedger),
    actionMix, locationMix,
    zoneShells: g.zoneShells ?? null,
    offenseHash: sha(g.offense ?? null),
    defenseHash: sha(g.defense ?? null),
    firstOffense: g.possessionLedger?.[0]?.offense ?? null,
    invariantViolations: (g.invariantViolations ?? []).length,
    fingerprint: g.fingerprint,
  };
};

/** A fixture that claims to exercise zone must actually produce zone actions. */
export const assertZoneCoverage = (cases) => {
  const zoneCases = cases.filter((c) => c.id.startsWith("real-zone-"));
  if (!zoneCases.length) throw new Error("no real-zone fixture present");
  for (const c of zoneCases) {
    const shells = JSON.stringify(c.zoneShells ?? {});
    if (!/2-3|3-2|MATCHUP|BOX|TRIANGLE/.test(shells)) {
      throw new Error(`${c.id} produced no zone shell (${shells}) — find a coach who reaches the zone gate rather than renaming the fixture`);
    }
  }
  return true;
};

/** A fixture that claims to be an overtime game must actually be one. */
export const assertOvertimeCoverage = (cases) => {
  const single = cases.find((c) => c.id === "overtime-single");
  const dbl = cases.find((c) => c.id === "overtime-double");
  if (!single || single.overtimes < 1) throw new Error(`overtime-single reached OT${single?.overtimes ?? "?"} — find a new seed rather than renaming the fixture`);
  if (!dbl || dbl.overtimes < 2) throw new Error(`overtime-double reached OT${dbl?.overtimes ?? "?"} — find a new seed rather than relaxing the requirement`);
  return true;
};

export const captureBaseline = () => {
  assertNoHoldout(PARITY_FIXTURES);
  const cases = PARITY_FIXTURES.map(captureFixture);
  assertOvertimeCoverage(cases);
  assertZoneCoverage(cases);
  return {
    defaultParityFixtureVersion: versionOf("defaultParityFixtureVersion"),
    purpose: "Exact post-side-symmetry engine behaviour, captured before any parameter was wired. Default parity is judged against this. If a fixture drifts, the wiring is wrong — this file is not re-recorded.",
    capturedFor: "phase-6c2c3-pre-wiring",
    moduleVersions: Object.fromEntries(["engineVersion", "possessionEngineVersion", "actionLibraryVersion",
      "defensiveMatchupVersion", "zoneResolutionVersion", "coachAdjustmentVersion", "opportunityAllocationVersion",
      "actualGameSymmetryVersion", "playerDataVersion", "eraStyleVersion", "possessionCalibrationVersion",
    ].map((k) => [k, versionOf(k)])),
    fixtureCount: cases.length,
    cases,
  };
};

export const loadBaseline = () => (existsSync(PRE_WIRING_PATH) ? JSON.parse(readFileSync(PRE_WIRING_PATH, "utf8")) : null);

const COMPARED = ["finalScore", "winner", "periods", "overtimes", "periodScores", "rngSteps", "ledgerSize",
  "goldTotals", "blueTotals", "goldPlayersHash", "bluePlayersHash", "ledgerHash", "actionMix", "locationMix",
  "zoneShells", "offenseHash", "defenseHash", "firstOffense", "invariantViolations"];

export const diffBaseline = (fresh = captureBaseline(), stored = loadBaseline()) => {
  if (!stored) return { missing: true, changed: [] };
  const changed = [];
  for (const f of fresh.cases) {
    const s = stored.cases.find((x) => x.id === f.id);
    if (!s) { changed.push({ id: f.id, fields: ["NEW_CASE"] }); continue; }
    const fields = COMPARED.filter((k) => JSON.stringify(f[k]) !== JSON.stringify(s[k]));
    if (fields.length) changed.push({ id: f.id, fields });
  }
  const dropped = stored.cases.filter((s) => !fresh.cases.some((f) => f.id === s.id)).map((s) => s.id);
  return { missing: false, changed, dropped };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  const fresh = captureBaseline();

  if (write) {
    if (existsSync(PRE_WIRING_PATH) && !process.argv.includes("--force")) {
      console.error(`${PRE_WIRING_PATH} already exists.`);
      console.error(`This baseline is the reference default parity is judged against. Re-recording it`);
      console.error(`would make any wiring bug pass. Pass --force ONLY if the engine's behaviour changed`);
      console.error(`for a reason unrelated to parameter wiring, and say why in the commit.`);
      process.exit(1);
    }
    mkdirSync(PRE_WIRING_DIR, { recursive: true });
    writeFileSync(PRE_WIRING_PATH, `${JSON.stringify(fresh, null, 2)}\n`);
    console.log(`PRE-WIRING BASELINE — ${fresh.fixtureCount} fixtures\n`);
    for (const c of fresh.cases) {
      console.log(`  ${c.id.padEnd(30)} ${String(c.finalScore.gold).padStart(3)}-${String(c.finalScore.blue).padEnd(3)} ${c.winner.padEnd(5)} OT${c.overtimes} rng=${String(c.rngSteps).padStart(5)} first=${c.firstOffense} inv=${c.invariantViolations}`);
    }
    const ot = fresh.cases.filter((c) => c.overtimes > 0);
    console.log(`\n  overtime fixtures: ${ot.length} (${ot.map((c) => `${c.id}:OT${c.overtimes}`).join(", ") || "NONE"})`);
    console.log(`  eras covered: ${new Set(fresh.cases.map((c) => c.era)).size}`);
    console.log(`  total invariant violations: ${fresh.cases.reduce((a, c) => a + c.invariantViolations, 0)}`);
    console.log(`\nwrote ${PRE_WIRING_PATH}`);
    process.exit(0);
  }

  const d = diffBaseline(fresh);
  if (d.missing) { console.error(`no baseline recorded — run with --write`); process.exit(1); }
  console.log(`DEFAULT PARITY — ${fresh.fixtureCount} fixtures against the pre-wiring baseline\n`);
  for (const c of fresh.cases) {
    const ch = d.changed.find((x) => x.id === c.id);
    console.log(ch ? `  DRIFT    ${c.id.padEnd(30)} ${ch.fields.join(", ")}` : `  exact    ${c.id}`);
  }
  if (d.dropped.length) console.log(`\n  MISSING FROM RUN: ${d.dropped.join(", ")}`);
  console.log(`\n  exact ${fresh.cases.length - d.changed.length}/${fresh.cases.length}  ·  drifted ${d.changed.length}`);
  console.log(`\n  PARITY: ${d.changed.length === 0 && !d.dropped.length ? "PASS" : "FAIL"}`);
  process.exit(d.changed.length || d.dropped.length ? 2 : 0);
}
