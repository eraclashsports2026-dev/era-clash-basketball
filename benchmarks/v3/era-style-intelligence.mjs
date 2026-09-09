#!/usr/bin/env node
// ── EraClash Labs: Era dominance benchmark ────────────────────────────────────
// Runs every canonical lineup through all eight Era Styles.
//
// The question is NOT "which era is best". It is "does any era behave as a
// universal power multiplier?" — because if one does, the model has a
// preference rather than an environment, and the fix is the logic, never an
// arbitrary anti-dominance penalty.
//
//   node benchmarks/v3/era-style-intelligence.mjs [--json]
import { COACHES } from "../../src/v3/coaches.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildEraStyleIntelligence, translatePlayer, buildCoachEraFit, ERA_STYLE_IDS } from "../../src/v3/eraStyleIntelligence.js";
import { buildIntelligence } from "../../src/v3/intelligence.js";
import { PLAYERS } from "../../src/players.js";
import { LINEUPS } from "./team-intelligence.mjs";

const r1 = (v) => Math.round(v * 10) / 10;

/** A lineup's aggregate EXPRESSED value in one era. Not a rating of the era —
 *  a reading of how much of this roster's skill the environment pays for. */
export const lineupInEra = (lineupName, eraId) => {
  const spec = LINEUPS[lineupName];
  const team = buildTeamIntelligence({ playerCards: spec.cards, positionAssignments: spec.slots });
  const profiles = spec.cards.map((id) => buildIntelligence(PLAYERS.find((p) => p.id === id)));
  const t = profiles.map((p) => translatePlayer(p, eraId));
  const mean = (f) => r1(t.reduce((a, x) => a + f(x), 0) / t.length);
  return {
    team,
    shootingValue: mean((x) => x.shooting.valueExpressed),
    spacingValue: mean((x) => x.spacing.valueExpressed),
    interiorValue: mean((x) => x.interior.postValueExpressed),
    perimeterDefValue: mean((x) => x.defense.perimeterValueExpressed),
    interiorDefValue: mean((x) => x.defense.interiorValueExpressed),
    paceValue: mean((x) => x.pace.valueExpressed),
  };
};

export const runEraBenchmark = () => {
  const grid = {};
  for (const name of Object.keys(LINEUPS)) {
    grid[name] = {};
    for (const eraId of ERA_STYLE_IDS) grid[name][eraId] = lineupInEra(name, eraId);
  }
  const coachEra = {};
  for (const eraId of ERA_STYLE_IDS) {
    coachEra[eraId] = COACHES.map((c) => buildCoachEraFit({ coach: c, eraStyleId: eraId }))
      .sort((a, b) => (b.band === a.band ? 0 : ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"].indexOf(b.band) - ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"].indexOf(a.band)));
  }
  return { grid, coachEra };
};

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 6) => String(v).padStart(n);

const main = () => {
  const { grid, coachEra } = runEraBenchmark();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ eras: ERA_STYLE_IDS, lineups: Object.keys(grid) }, null, 2));
    return;
  }

  console.log("\nEra dominance benchmark — expressed value BY DIMENSION\n");

  // ── NO AGGREGATE. ────────────────────────────────────────────────────────────
  // An earlier version of this benchmark summed four dimensions into an
  // "expressedTotal" and promptly reported the 1990s as best for 5 of 8
  // lineups. That was not a finding about the 1990s — it was the aggregate
  // stacking three unrelated positives (some three-point value, illegal-defense
  // post freedom, and legal hand-checking) that no real possession collects at
  // once. The dimensions were correct; the sum was the bug. The fix was to
  // delete the sum, not to penalise a decade.
  const DIMS = [
    ["shooting", (x) => x.shootingValue],
    ["spacing", (x) => x.spacingValue],
    ["interior", (x) => x.interiorValue],
    ["perimeterD", (x) => x.perimeterDefValue],
    ["interiorD", (x) => x.interiorDefValue],
    ["pace", (x) => x.paceValue],
  ];

  for (const [dimName, get] of DIMS) {
    console.log(`── ${dimName} ──`);
    console.log(pad("lineup", 22) + ERA_STYLE_IDS.map((e) => num(e, 8)).join(""));
    for (const [name, byEra] of Object.entries(grid)) {
      console.log(pad(name, 22) + ERA_STYLE_IDS.map((e) => num(get(byEra[e]), 8)).join(""));
    }
    console.log("");
  }

  console.log("── dominance checks ──");
  // Does any single era lead EVERY dimension? That is the real question.
  const leadersByDim = {};
  for (const [dimName, get] of DIMS) {
    const totals = ERA_STYLE_IDS.map((e) => ({ e, v: Object.values(grid).reduce((a, byEra) => a + get(byEra[e]), 0) }));
    leadersByDim[dimName] = totals.sort((a, b) => b.v - a.v)[0].e;
  }
  console.log("   dimension leaders:");
  for (const [d, e] of Object.entries(leadersByDim)) console.log(`      ${pad(d, 12)} ${e}`);
  const distinctLeaders = new Set(Object.values(leadersByDim));
  console.log(`   distinct leading eras across ${DIMS.length} dimensions: ${distinctLeaders.size}`);
  console.log(distinctLeaders.size <= 2
    ? "   ⚠ one or two eras lead nearly every dimension — investigate the model, do NOT add a penalty"
    : "   ✓ no era leads every dimension — each era pays for different things");

  // archetype check: spacing and interior rosters must peak in different eras
  const spacing = grid["elite-spacing"], interior = grid["interior-heavy"];
  const peak = (g, get) => ERA_STYLE_IDS.reduce((a, e) => (get(g[e]) > get(g[a]) ? e : a), ERA_STYLE_IDS[0]);
  const spacingPeak = peak(spacing, (x) => x.spacingValue);
  const interiorPeak = peak(interior, (x) => x.interiorValue);
  console.log(`   spacing roster's spacing peaks in ${spacingPeak}; interior roster's post play peaks in ${interiorPeak}`);
  console.log(spacingPeak !== interiorPeak
    ? "   ✓ archetypes peak in DIFFERENT eras — the environment is doing real work"
    : "   ⚠ both peak in the same era — spacing and interior are not priced differently");

  // no era may zero out a roster
  const anyZero = Object.entries(grid).some(([, byEra]) => ERA_STYLE_IDS.some((e) => byEra[e].perimeterDefValue === 0 && byEra[e].interiorValue === 0));
  console.log(anyZero ? "   ⚠ some era zeroes a roster's whole profile" : "   ✓ no era erases a roster — skill is transported, only value is repriced");

  console.log("\n── native-era bias check ──");
  let nativeWins = 0, tested = 0;
  const bandRank = (b) => ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"].indexOf(b);
  for (const c of COACHES) {
    const own = (c.eras ?? []).filter((e) => ERA_STYLE_IDS.includes(e));
    if (!own.length) continue;
    tested++;
    const fits = ERA_STYLE_IDS.map((e) => ({ e, r: bandRank(buildCoachEraFit({ coach: c, eraStyleId: e }).band) }));
    const best = Math.max(...fits.map((f) => f.r));
    if (fits.filter((f) => f.r === best).every((f) => own.includes(f.e))) nativeWins++;
  }
  console.log(`   coaches whose ONLY best-fit era is their own decade: ${nativeWins}/${tested}`);
  console.log(nativeWins / Math.max(1, tested) > 0.5
    ? "   ⚠ native-era bias detected — a coach should not be rewarded for matching a decade"
    : "   ✓ no systematic native-era bias");

  console.log("\n── coach-era fit spread (per era, top band counts) ──");
  for (const eraId of ERA_STYLE_IDS) {
    const bands = {};
    for (const f of coachEra[eraId]) bands[f.band] = (bands[f.band] || 0) + 1;
    console.log(`   ${pad(eraId, 8)} ${Object.entries(bands).map(([b, n]) => `${b}:${n}`).join("  ")}`);
  }
  console.log("");
};

if (import.meta.url === `file://${process.argv[1]}`) main();
