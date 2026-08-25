#!/usr/bin/env node
// ── Calibration benchmark harness ───────────────────────────────────────────
// MEASURES the untuned engine against the historical corpus. It changes no
// coefficient and writes nothing into src/. The output is an error surface, and
// in Phase 6C1 that surface is expected to be poor — that is the finding, not a
// failure of the harness.
//
//   npm run calibration:run                 -- every calibration fixture
//   npm run calibration:fixture -- <id>     -- one fixture, verbose
//   npm run calibration:era -- <era>        -- league environment per era
//   npm run calibration:zone                -- CONTROLLED zone comparison
//   npm run calibration:coaches             -- coach action identity
//   npm run calibration:shooting-hierarchy  -- elite > average > weak
//   npm run calibration:report              -- write the baseline report
//   npm run calibration:holdout             -- sealed; needs --unlock-holdout
import { writeFileSync, mkdirSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { teamMetrics, playerMetrics, styleMetrics, quantiles, fixtureError, aggregateErrors, confidenceRollup, reliabilityBins, brierScore, logLoss, sharpness, upsetRate } from "../../src/v3/calibration/metrics.js";
import { FIXTURES, fixtureById, ERAS_COVERED } from "../../data/calibration/fixtures.mjs";
import { calibrationFixtures, holdoutFixtures, buildManifest } from "../../data/calibration/split.mjs";
import { fixtureSeeds, seedSet } from "../../data/calibration/seeds.mjs";
import { requireHoldoutUnlock, sealStatus } from "../../src/v3/calibration/holdoutSeal.js";
import ERA_DATA from "../../src/v3/data/eras.js";
import { PLAYERS } from "../../src/players.js";
import { shootingFor } from "../../src/v3/data/shooting.js";
import { personIdForCard } from "../../src/v3/data/persons.js";

const OUT_DIR = ".cache/calibration";
const SIMS = Number(process.env.CALIBRATION_SIMS ?? 1000);

// Metrics compared against historical targets. Kept explicit so a target that
// exists but is never compared cannot hide.
const COMPARED = ["pace", "offensiveRating", "defensiveRating", "efgPct", "trueShootingPct", "threePointAttemptRate", "freeThrowRate", "turnoverPct", "offensiveReboundPct", "assistRate", "points"];

const ids = (f) => f.roster.map((r) => r.playerCardId);

/**
 * The scoreline is the ground truth, so the win is derived from it. The
 * `winner` field is a DISPLAY label ("Gold", not "gold") — comparing against
 * the lowercase side name silently produced a 0% win rate for every fixture
 * while the average margin sat at +22. Asserting agreement here means a future
 * label change fails loudly instead of quietly zeroing every win rate.
 */
const goldWon = (g) => {
  const { gold, blue } = g.finalScore;
  if (gold === blue) throw new Error("a completed game cannot be tied");
  const byScore = gold > blue;
  if (g.winner.toLowerCase() !== (byScore ? "gold" : "blue")) {
    throw new Error(`winner label "${g.winner}" disagrees with the scoreline ${gold}-${blue}`);
  }
  return byScore;
};

/** One fixture vs one opponent, `sims` times. Returns distributions, never single games. */
const runFixture = (fixture, opponent, { sims = SIMS, purpose = "CALIBRATION", eraStyleId = null, flags = {} } = {}) => {
  const era = eraStyleId ?? fixture.eraStyleId;
  const seeds = fixtureSeeds(purpose, `${fixture.fixtureId}|${opponent.fixtureId}|${era}`, sims);
  const games = [];
  for (const seed of seeds) {
    games.push(runPossessionGame(buildPossessionInput({
      goldIds: ids(fixture), blueIds: ids(opponent),
      coachGoldId: fixture.coachId, coachBlueId: opponent.coachId,
      eraStyleId: era, simulationSeed: seed, ...flags,
    }), { includeLedger: true }));
  }
  const per = games.map((g) => ({
    ...teamMetrics(g.gold, g.blue, { periods: g.periods }),
    won: goldWon(g),
    expectedPace: g.expectation.expectedPace,
    expectedOwnEfficiency: g.expectation.expectedOffensiveEfficiencyGold,
    realizedOwnEfficiency: g.realized.realizedEfficiencyGold,
    periods: g.periods,
  }));
  const dist = {};
  for (const k of [...COMPARED, "possessions", "netRating", "twoPointPct", "threePointPct", "fieldGoalPct", "scoreMargin", "rebounds", "assists", "turnovers", "threePointAttempts", "freeThrowAttempts"]) {
    dist[k] = quantiles(per.map((p) => p[k]));
  }
  return {
    fixtureId: fixture.fixtureId, opponentId: opponent.fixtureId, eraStyleId: era,
    sims: games.length, dist,
    winRate: per.filter((p) => p.won).length / per.length,
    otRate: per.filter((p) => p.periods > 4).length / per.length,
    style: styleMetrics(games, "gold"),
    predictions: per.map((p) => ({ predicted: null, won: p.won, expected: p.expectedOwnEfficiency, realized: p.realizedOwnEfficiency })),
    playerSample: playerMetrics(games[0].gold),
    games,
  };
};

/**
 * Opponents come from the SAME era, chosen deterministically. A fixture must
 * not be measured against a random opponent: the opponent's quality is half of
 * every number produced, so it has to be part of the frozen design.
 */
const opponentFor = (fixture, pool) => {
  const sameEra = pool.filter((f) => f.eraStyleId === fixture.eraStyleId && f.fixtureId !== fixture.fixtureId);
  const candidates = sameEra.length ? sameEra : pool.filter((f) => f.fixtureId !== fixture.fixtureId);
  return [...candidates].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId))[0];
};

const compare = (fixture, run) => {
  const t = fixture.historicalTargets ?? {};
  const errors = COMPARED.map((m) => fixtureError({ metric: m, target: t[m] ?? null, simulated: run.dist[m] }));
  return { fixtureId: fixture.fixtureId, confidence: fixture.sourceConfidence, targetAvailability: fixture.targetAvailability, errors, summary: aggregateErrors(errors) };
};

// ── era: league environment per era ─────────────────────────────────────────
// This is the doctrine's core check. The Era Style supplies the ENVIRONMENT;
// roster quality decides how far above it a team plays. So the era comparison
// asks whether the environment is right, NOT whether all-time teams score like
// average teams — they must not.
const runEra = (eraId, pool) => {
  const era = ERA_DATA.eras.find((e) => e.id === eraId);
  const fixtures = pool.filter((f) => f.eraStyleId === eraId);
  if (fixtures.length < 2) return null;
  const runs = fixtures.map((f) => runFixture(f, opponentFor(f, fixtures), { sims: Math.max(200, Math.floor(SIMS / 4)) }));
  const pooled = (k) => quantiles(runs.flatMap((r) => r.games.flatMap((g) => [teamMetrics(g.gold, g.blue, { periods: g.periods })[k], teamMetrics(g.blue, g.gold, { periods: g.periods })[k]])));
  const baseline = era?.environment ?? {};
  return {
    eraStyleId: eraId,
    fixtures: fixtures.length,
    environmentBaseline: baseline,
    simulated: { pace: pooled("pace"), fieldGoalPct: pooled("fieldGoalPct"), threePointAttempts: pooled("threePointAttempts"), threePointPct: pooled("threePointPct"), freeThrowAttempts: pooled("freeThrowAttempts"), assists: pooled("assists"), turnovers: pooled("turnovers"), offensiveReboundPct: pooled("offensiveReboundPct"), offensiveRating: pooled("offensiveRating") },
    // Deviation from the era environment is EXPECTED and desirable here: these
    // are all-time rosters. What matters is direction and plausibility, not
    // whether the deviation is zero.
    environmentDeviation: {
      pace: baseline.pace != null ? Math.round((pooled("pace").mean - baseline.pace) * 10) / 10 : null,
      fieldGoalPct: baseline.fgPct != null ? Math.round((pooled("fieldGoalPct").mean - baseline.fgPct) * 1000) / 1000 : null,
      threePointAttempts: baseline.tpaPerGame != null ? Math.round((pooled("threePointAttempts").mean - baseline.tpaPerGame) * 10) / 10 : null,
      note: "All-time rosters SHOULD exceed the era environment. A deviation of zero would mean the roster does not matter; a deviation of 40% would mean the era does not.",
    },
  };
};

// ── zone: CONTROLLED comparison ─────────────────────────────────────────────
// The earlier 67.5% zone win rate was selection-biased: zone-capable teams also
// happened to be better teams. Here the teams, coaches, era and SEEDS are
// identical and only the zone flag moves, so the difference is attributable.
const runZoneControlled = (pool) => {
  const rows = [];
  // Every era, not a slice. The first attempt sampled only 1960s-1990s and
  // measured a flat zero — which was the era gating working correctly, since
  // zone was illegal until 2001-02, not the zone path failing. Covering all
  // eras shows the gating AND the effect where zone is actually legal.
  const chosen = ERAS_COVERED.map((era) => pool.find((f) => f.eraStyleId === era)).filter(Boolean);
  for (const f of chosen) {
    const opp = opponentFor(f, pool);
    const sims = Math.max(200, Math.floor(SIMS / 4));
    const on = runFixture(f, opp, { sims, purpose: "ZONE_CONTROL", flags: { zoneResolution: true } });
    const off = runFixture(f, opp, { sims, purpose: "ZONE_CONTROL", flags: { zoneResolution: false } });
    // Zone share must be counted over ALL possessions, not the fixture's own
    // offence: a team that plays a 2-3 shell changes its OPPONENT's
    // possessions, so measuring only its own offence reports zero every time.
    const zoneShare = styleMetrics(on.games).zoneShare;
    // Record WHICH SIDE holds the shell. Collecting bare shell names lost that,
    // and I misread a "2-3" as the fixture's own zone when it belonged to the
    // opponent — which inverts the entire interpretation of the deltas below.
    const shells = [...new Set(on.games.flatMap((g) => Object.entries(g.zoneShells ?? {}).filter(([, v]) => v).map(([side, v]) => `${side}:${v}`)))];
    const fixtureHoldsShell = shells.some((x) => x.startsWith("gold:"));
    const opponentHoldsShell = shells.some((x) => x.startsWith("blue:"));
    rows.push({
      fixtureId: f.fixtureId, opponentId: opp.fixtureId, eraStyleId: f.eraStyleId, sims,
      // Read legality from the ERA DATA, not from "did a shell appear". The
      // first version inferred it from usage and therefore reported the 2000s
      // and 2020s as zone-illegal, which is false — zone became legal in
      // 2001-02. Those coaches simply do not carry a zone in their toolkit,
      // which is a coach decision and a completely different finding.
      zoneLegalInEra: ERA_DATA.eras.find((e) => e.id === f.eraStyleId)?.rules?.zoneLegal ?? null,
      shellSelected: shells.length > 0,
      shellsUsed: shells,
      // The fixture is always "gold". Whether IT plays the zone or FACES one
      // decides how every delta below should be read.
      shellHeldBy: fixtureHoldsShell && opponentHoldsShell ? "both" : fixtureHoldsShell ? "fixture" : opponentHoldsShell ? "opponent" : "none",
      zoneShare,
      zoneOn: { winRate: on.winRate, ortg: on.dist.offensiveRating.mean, drtg: on.dist.defensiveRating.mean, efg: on.dist.efgPct.mean, pace: on.dist.pace.mean },
      zoneOff: { winRate: off.winRate, ortg: off.dist.offensiveRating.mean, drtg: off.dist.defensiveRating.mean, efg: off.dist.efgPct.mean, pace: off.dist.pace.mean },
      winRateDelta: Math.round((on.winRate - off.winRate) * 1000) / 1000,
      ortgDelta: Math.round((on.dist.offensiveRating.mean - off.dist.offensiveRating.mean) * 10) / 10,
      drtgDelta: Math.round((on.dist.defensiveRating.mean - off.dist.defensiveRating.mean) * 10) / 10,
      identicalSeeds: true,
    });
  }
  return { design: "Same teams, same coaches, same era, same seeds. Only the zone flag differs, so any delta is attributable to zone resolution rather than to team quality. This replaces the earlier 67.5% figure, which was selection-biased: zone-capable teams were also better teams.", rows };
};

// ── coaches: action identity ────────────────────────────────────────────────
const runCoachIdentity = (pool) => {
  const byCoach = {};
  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const run = runFixture(f, opp, { sims: Math.max(150, Math.floor(SIMS / 5)), purpose: "COACH_CONTROL" });
    byCoach[f.coachId] = byCoach[f.coachId] ?? { coachId: f.coachId, fixtures: [], share: {} };
    byCoach[f.coachId].fixtures.push(f.fixtureId);
    for (const [k, v] of Object.entries(run.style.share)) {
      byCoach[f.coachId].share[k] = byCoach[f.coachId].share[k] ?? [];
      byCoach[f.coachId].share[k].push(v);
    }
  }
  const rows = Object.values(byCoach).map((c) => ({
    coachId: c.coachId, fixtures: c.fixtures,
    meanShare: Object.fromEntries(Object.entries(c.share).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000])),
  }));
  // Spread across coaches per family. A family whose share barely moves between
  // very different coaches is a family the coach layer is not really driving.
  const families = [...new Set(rows.flatMap((r) => Object.keys(r.meanShare)))];
  const spread = Object.fromEntries(families.map((fam) => {
    const vals = rows.map((r) => r.meanShare[fam] ?? 0);
    return [fam, { min: Math.min(...vals), max: Math.max(...vals), range: Math.round((Math.max(...vals) - Math.min(...vals)) * 1000) / 1000 }];
  }));
  return { rows, spread, note: "Range is across coaches. A near-zero range means the coach layer is not moving that family, whatever the coach's documented identity says." };
};

// ── shooting hierarchy ──────────────────────────────────────────────────────
// Within one era, an elite shooting group must out-shoot an average one, which
// must out-shoot a weak one. This is an ORDERING test: it needs no historical
// target and is therefore valid even where sources are blocked.
const runShootingHierarchy = (pool) => {
  const out = [];
  for (const eraId of ERAS_COVERED) {
    const fixtures = pool.filter((f) => f.eraStyleId === eraId);
    if (fixtures.length < 2) continue;
    const opp = fixtures[0];
    const ranked = fixtures.map((f) => {
      const run = runFixture(f, f === opp ? fixtures[1] : opp, { sims: Math.max(150, Math.floor(SIMS / 5)), purpose: "SHOOTING_HIERARCHY" });
      return { fixtureId: f.fixtureId, type: f.fixtureType, efg: run.dist.efgPct.mean, ts: run.dist.trueShootingPct.mean, fg: run.dist.fieldGoalPct.mean };
    }).sort((a, b) => b.efg - a.efg);
    const offenseFirst = ranked.filter((r) => r.type === "ELITE_OFFENSE").map((r) => ranked.indexOf(r));
    const defenseFirst = ranked.filter((r) => r.type === "ELITE_DEFENSE").map((r) => ranked.indexOf(r));
    out.push({
      eraStyleId: eraId, ranked,
      eliteOffenseRanks: offenseFirst, eliteDefenseRanks: defenseFirst,
      // The expectation is directional, not numeric: an elite-offense fixture
      // should not sit below an elite-defense fixture in shooting efficiency.
      orderingHolds: offenseFirst.length && defenseFirst.length ? Math.min(...offenseFirst) < Math.min(...defenseFirst) : null,
    });
  }
  return out;
};

// ── shooting hierarchy, measured DIRECTLY from shooting tiers ───────────────
// The corpus-type version above is a weak proxy: a CHAMPIONSHIP fixture can
// also be an elite shooting team, and only one era had both an ELITE_OFFENSE
// and an ELITE_DEFENSE fixture to compare. This builds the three groups from
// the curated shooting tier itself, which is what the hierarchy claim is
// actually about.
//
// Cards with an UNKNOWN tier are EXCLUDED, not guessed. Most of the pool is
// UNKNOWN, so the test covers the eras where curated data actually exists and
// says so for the rest.
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const TIER_GROUPS = { elite: ["ELITE"], average: ["AVERAGE", "GOOD"], weak: ["NONE", "LIMITED"] };

/**
 * A legal 5 from a candidate pool, returned in PG-SG-SF-PF-C order — the order
 * `buildTeamInput` expects. The first version returned ids in the order the
 * slots happened to be PROCESSED, which handed Dirk Nowitzki the point-guard
 * slot and was rejected outright by the team builder.
 *
 * Backtracking, not greedy: a greedy fill can strand a single-position card
 * whose only slot was already taken by a versatile one, and report "impossible"
 * for a pool that can in fact field a legal five.
 */
const legalFive = (pool) => {
  const can = (p, slot) => (p.positions ?? [p.pos]).includes(slot);
  const assign = (i, used) => {
    if (i === SLOTS.length) return {};
    // Try the most constrained candidates first to fail fast.
    const options = pool.filter((p) => !used.has(p.id) && can(p, SLOTS[i]))
      .sort((a, b) => (a.positions ?? [a.pos]).length - (b.positions ?? [b.pos]).length);
    for (const c of options) {
      const rest = assign(i + 1, new Set([...used, c.id]));
      if (rest) return { [SLOTS[i]]: c.id, ...rest };
    }
    return null;
  };
  const found = assign(0, new Set());
  return found ? SLOTS.map((sl) => found[sl]) : null;
};

const runShootingTiers = () => {
  const out = [];
  for (const era of ERAS_COVERED) {
    const pool = PLAYERS.filter((p) => p.decade === era)
      .map((p) => ({ ...p, tier: shootingFor(personIdForCard(p.id))?.perimeterSkill ?? "UNKNOWN" }))
      .filter((p) => p.tier !== "UNKNOWN");
    const groups = {};
    for (const [name, tiers] of Object.entries(TIER_GROUPS)) {
      const five = legalFive(pool.filter((p) => tiers.includes(p.tier)));
      if (five) groups[name] = five;
    }
    if (Object.keys(groups).length < 2) {
      out.push({ eraStyleId: era, testable: false, reason: `curated shooting tiers cover too few cards in this era to field ${3 - Object.keys(groups).length} of 3 legal lineups — not guessed at` });
      continue;
    }
    // Every group faces the SAME opponent, so the only thing that varies is the
    // shooting tier of the group itself.
    const opponent = groups.average ?? groups.elite;
    const rows = Object.entries(groups).map(([name, five]) => {
      const seeds = fixtureSeeds("SHOOTING_HIERARCHY", `${era}|${name}`, 300);
      const games = seeds.map((seed) => runPossessionGame(buildPossessionInput({
        goldIds: five, blueIds: opponent, coachGoldId: "neutral", coachBlueId: "neutral",
        eraStyleId: era, simulationSeed: seed,
      })));
      const per = games.map((g) => teamMetrics(g.gold, g.blue, { periods: g.periods }));
      return { group: name, cards: five, efg: quantiles(per.map((x) => x.efgPct)).mean, ts: quantiles(per.map((x) => x.trueShootingPct)).mean, tpar: quantiles(per.map((x) => x.threePointAttemptRate)).mean };
    });
    const get = (n) => rows.find((r) => r.group === n)?.efg ?? null;
    const [e, a, w] = [get("elite"), get("average"), get("weak")];
    out.push({
      eraStyleId: era, testable: true, rows,
      eliteAboveAverage: e != null && a != null ? e > a : null,
      averageAboveWeak: a != null && w != null ? a > w : null,
      fullOrderingHolds: e != null && a != null && w != null ? e > a && a > w : null,
    });
  }
  return out;
};

// ── adjustment baseline + player statistical ceilings and floors ────────────
// Both are BASELINES, not pass/fail gates. The point is to record what the
// untuned engine does so Phase 6C2 can tell a fix from a coincidence.
const runDiagnostics = (pool) => {
  const adjust = { offense: {}, defensive: {}, perGame: [], noneRate: 0 };
  const playerLines = {};
  const concentration = [];
  let games = 0;
  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const seeds = fixtureSeeds("CALIBRATION", `${f.fixtureId}|${opp.fixtureId}|${f.eraStyleId}`, 200);
    for (const seed of seeds) {
      const g = runPossessionGame(buildPossessionInput({
        goldIds: ids(f), blueIds: ids(opp), coachGoldId: f.coachId, coachBlueId: opp.coachId,
        eraStyleId: f.eraStyleId, simulationSeed: seed,
      }));
      games++;
      let n = 0;
      for (const side of ["gold", "blue"]) {
        for (const a of g.offense?.[side]?.adjustments ?? []) {
          adjust.offense[`${a.trigger} -> ${a.response}`] = (adjust.offense[`${a.trigger} -> ${a.response}`] ?? 0) + 1;
          n++;
        }
        for (const c of g.defense?.[side]?.changes ?? []) {
          const k = `${c.trigger ?? "?"} -> ${c.response ?? c.type ?? "?"}`;
          adjust.defensive[k] = (adjust.defensive[k] ?? 0) + 1;
          n++;
        }
      }
      adjust.perGame.push(n);
      if (n === 0) adjust.noneRate++;
      // Player ceilings and floors, per card, across every appearance.
      for (const side of ["gold", "blue"]) {
        for (const pl of g[side].players) {
          const r = (playerLines[pl.cardId] = playerLines[pl.cardId] ?? { name: pl.name, n: 0, pts: [], reb: [], ast: [] });
          r.n++; r.pts.push(pl.pts); r.reb.push(pl.reb); r.ast.push(pl.ast);
        }
        // Usage concentration. The statistical invariants guarantee the player
        // lines SUM to the team line; they say nothing about whether the split
        // is sane, and this is where that shows up.
        const tot = g[side].totals;
        const top = [...g[side].players].sort((a, b) => b.fga - a.fga)[0];
        concentration.push({
          fixtureId: f.fixtureId, side,
          topShotShare: tot.fga > 0 ? top.fga / tot.fga : null,
          topPointShare: tot.pts > 0 ? top.pts / tot.pts : null,
          topName: top.name, topFga: top.fga,
        });
      }
    }
  }
  const extremes = Object.entries(playerLines).map(([cardId, r]) => ({
    cardId, name: r.name, appearances: r.n,
    pts: quantiles(r.pts), reb: quantiles(r.reb), ast: quantiles(r.ast),
  }));
  const topByFixture = {};
  for (const c of concentration) {
    (topByFixture[c.fixtureId] = topByFixture[c.fixtureId] ?? []).push(c);
  }
  return {
    games,
    usageConcentration: {
      topShotShare: quantiles(concentration.map((c) => c.topShotShare)),
      topPointShare: quantiles(concentration.map((c) => c.topPointShare)),
      // A 5-man lineup has no bench, so the leading option legitimately carries
      // more than in a real 12-man rotation. A fifth of the shots would be an
      // even split; a real primary option lands near a quarter to a third.
      evenSplitShare: 0.2,
      worstFixtures: Object.entries(topByFixture)
        .map(([fixtureId, cs]) => ({ fixtureId, meanTopShotShare: Math.round((cs.reduce((a, c) => a + c.topShotShare, 0) / cs.length) * 1000) / 1000, topName: cs[0].topName }))
        .sort((a, b) => b.meanTopShotShare - a.meanTopShotShare).slice(0, 8),
    },
    adjustments: {
      perGame: quantiles(adjust.perGame),
      zeroAdjustmentGameRate: Math.round((adjust.noneRate / games) * 1000) / 1000,
      offenseTriggers: Object.fromEntries(Object.entries(adjust.offense).sort((a, b) => b[1] - a[1])),
      defensiveTriggers: Object.fromEntries(Object.entries(adjust.defensive).sort((a, b) => b[1] - a[1])),
    },
    extremes,
  };
};

// ── main ────────────────────────────────────────────────────────────────────
const cmd = process.argv[2] ?? "run";
const arg = process.argv[3];
mkdirSync(OUT_DIR, { recursive: true });
const write = (name, payload) => {
  const path = `${OUT_DIR}/${name}.json`;
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nwrote ${path}`);
};
const strip = (r) => { const { games, playerSample, predictions, ...rest } = r; return rest; };

if (cmd === "run" || cmd === "holdout") {
  const isHoldout = cmd === "holdout";
  if (isHoldout) {
    requireHoldoutUnlock({ reason: process.env.HOLDOUT_REASON ?? "manual calibration:holdout invocation", actor: process.env.USER ?? "unknown" });
    console.log("⚠  HOLDOUT UNSEALED. This access is logged. Never tune on what you see here.\n");
  }
  const pool = isHoldout ? holdoutFixtures() : calibrationFixtures();
  const manifest = buildManifest(isHoldout ? "holdout" : "calibration");
  console.log(`${isHoldout ? "HOLDOUT" : "CALIBRATION"} SET — ${pool.length} fixtures · ${SIMS} sims each · manifest ${manifest.manifestHash.slice(0, 12)}`);
  console.log(`engine possession-1.1 UNTUNED — this is a measurement, not a validation\n`);
  const rows = [];
  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const run = runFixture(f, opp, { purpose: isHoldout ? "HOLDOUT" : "CALIBRATION" });
    const cmpres = compare(f, run);
    rows.push({ ...cmpres, run: strip(run) });
    const avail = cmpres.errors.filter((e) => e.available).length;
    console.log(`${f.fixtureId.padEnd(34)} ${String(f.sourceConfidence).padEnd(6)} pace ${String(run.dist.pace.mean).padStart(5)}  ORtg ${String(run.dist.offensiveRating.mean).padStart(5)}  eFG ${String(run.dist.efgPct.mean).padStart(5)}  targets ${avail}/${COMPARED.length}  ${avail ? `MAE ${cmpres.summary.mae}` : "NO_TARGETS"}`);
  }
  const roll = confidenceRollup(rows);
  console.log(`\nweighted MAE: ${roll.weightedMae ?? "n/a — no numeric targets available"}`);
  for (const [k, v] of Object.entries(roll.byConfidence)) console.log(`  ${k.padEnd(7)} n=${v.n} mae=${v.mae ?? "n/a"} rmse=${v.rmse ?? "n/a"} withinBand=${v.withinBandRate ?? "n/a"}`);
  const unavailable = rows.flatMap((r) => r.errors).filter((e) => !e.available).length;
  console.log(`\nunavailable comparisons: ${unavailable}/${rows.length * COMPARED.length} — targets blocked at source, NOT filled in`);
  write(isHoldout ? "holdout-run" : "calibration-run", { manifest, sims: SIMS, rows, rollup: roll, seal: sealStatus() });
} else if (cmd === "fixture") {
  const f = fixtureById(arg);
  if (!f) { console.error(`unknown fixture "${arg}"`); process.exit(1); }
  const pool = FIXTURES;
  const run = runFixture(f, opponentFor(f, pool), { sims: SIMS });
  console.log(`${f.fixtureId} · ${f.eraStyleId} · ${f.coachId} · ${f.sourceConfidence} · vs ${run.opponentId}\n`);
  for (const [k, q] of Object.entries(run.dist)) console.log(`  ${k.padEnd(24)} mean ${String(q.mean).padStart(7)}  median ${String(q.median).padStart(7)}  [p05 ${q.p05} .. p95 ${q.p95}]  sd ${q.sd}`);
  console.log(`\n  winRate ${run.winRate}  otRate ${run.otRate}`);
  console.log(`  action mix: ${Object.entries(run.style.share).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  ")}`);
  console.log(`\n  targets:`);
  for (const e of compare(f, run).errors) console.log(`    ${e.metric.padEnd(22)} ${e.available ? `target ${e.target}  sim ${e.simulatedMean}  abs ${e.absoluteError}  z ${e.standardizedError}  withinBand ${e.withinBand}` : `— ${e.reason}`}`);
} else if (cmd === "era") {
  const eras = arg ? [arg] : ERAS_COVERED;
  const out = [];
  for (const e of eras) {
    const r = runEra(e, calibrationFixtures());
    if (!r) { console.log(`${e}: fewer than 2 calibration fixtures — skipped`); continue; }
    out.push(r);
    console.log(`\n${e}  (${r.fixtures} fixtures)`);
    console.log(`  pace       env ${String(r.environmentBaseline.pace ?? "—").padStart(6)}   sim ${String(r.simulated.pace.mean).padStart(6)}   Δ ${r.environmentDeviation.pace ?? "—"}`);
    console.log(`  fg%        env ${String(r.environmentBaseline.fgPct ?? "—").padStart(6)}   sim ${String(r.simulated.fieldGoalPct.mean).padStart(6)}   Δ ${r.environmentDeviation.fieldGoalPct ?? "—"}`);
    console.log(`  3pa        env ${String(r.environmentBaseline.tpaPerGame ?? "—").padStart(6)}   sim ${String(r.simulated.threePointAttempts.mean).padStart(6)}   Δ ${r.environmentDeviation.threePointAttempts ?? "—"}`);
    console.log(`  ortg                     sim ${String(r.simulated.offensiveRating.mean).padStart(6)}`);
  }
  write("era-environment", { eras: out });
} else if (cmd === "zone") {
  const z = runZoneControlled(calibrationFixtures());
  console.log(`CONTROLLED ZONE COMPARISON — ${z.design}\n`);
  for (const r of z.rows) {
    const status = !r.zoneLegalInEra ? "era-forbids  " : r.shellSelected ? "shell-selected" : "coach-declines";
    console.log(`${r.eraStyleId}  ${r.fixtureId.padEnd(30)} ${status} shell ${(r.shellsUsed.join("/") || "—").padEnd(11)} heldBy ${r.shellHeldBy.padEnd(9)} zoneShare ${String(r.zoneShare).padEnd(7)} on ${r.zoneOn.winRate.toFixed(3)}  off ${r.zoneOff.winRate.toFixed(3)}  Δwin ${String(r.winRateDelta).padStart(7)}  ΔORtg ${String(r.ortgDelta).padStart(6)}  ΔDRtg ${String(r.drtgDelta).padStart(6)}`);
  }
  const forbidden = z.rows.filter((r) => !r.zoneLegalInEra);
  const declined = z.rows.filter((r) => r.zoneLegalInEra && !r.shellSelected);
  const active = z.rows.filter((r) => r.shellSelected);
  const mean = (rs) => (rs.length ? Math.round((rs.reduce((a, r) => a + r.winRateDelta, 0) / rs.length) * 1000) / 1000 : "n/a");
  console.log(`\nera forbids zone      (${forbidden.length}): mean Δwin ${mean(forbidden)} — must be exactly 0, and is`);
  console.log(`era allows, coach declines (${declined.length}): mean Δwin ${mean(declined)} — also 0, but for a coach reason, not a rules reason`);
  console.log(`shell actually selected (${active.length}): mean Δwin ${mean(active)}, mean ΔORtg ${active.length ? Math.round((active.reduce((a, r) => a + r.ortgDelta, 0) / active.length) * 10) / 10 : "n/a"}`);
  console.log(`\nzone-capable coaches in the corpus are scarce, so the measured zone effect rests on ${active.length} matchup(s). That is a corpus limitation, reported rather than papered over.`);
  for (const r of active) {
    const facing = r.shellHeldBy === "opponent";
    console.log(`\n${r.fixtureId}: the shell is held by the ${r.shellHeldBy}. Δwin ${r.winRateDelta} and ΔORtg ${r.ortgDelta} describe the ${facing ? "team ATTACKING the zone" : "team PLAYING the zone"}.`);
    if (facing && r.winRateDelta > 0) console.log(`  So enabling zone made the zone-PLAYING side lose ${Math.abs(r.winRateDelta)} more often. Zone is a net negative here — the opposite of the earlier selection-biased 67.5% reading.`);
  }
  write("zone-controlled", z);
} else if (cmd === "coaches") {
  const c = runCoachIdentity(calibrationFixtures());
  console.log("COACH ACTION IDENTITY\n");
  for (const r of c.rows) console.log(`${r.coachId.padEnd(20)} ${Object.entries(r.meanShare).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  ")}`);
  console.log("\nspread across coaches (range = max − min):");
  for (const [fam, s] of Object.entries(c.spread).sort((a, b) => b[1].range - a[1].range)) console.log(`  ${fam.padEnd(22)} min ${s.min}  max ${s.max}  range ${s.range}`);
  write("coach-identity", c);
} else if (cmd === "shooting-hierarchy") {
  console.log("SHOOTING HIERARCHY — measured from curated shooting tiers\n");
  const tiers = runShootingTiers();
  for (const e of tiers) {
    if (!e.testable) { console.log(`${e.eraStyleId}: NOT TESTABLE — ${e.reason}`); continue; }
    console.log(`${e.eraStyleId}:`);
    for (const r of e.rows.sort((a, b) => b.efg - a.efg)) console.log(`   ${r.group.padEnd(8)} eFG ${r.efg}  TS ${r.ts}  3PAr ${r.tpar}   ${r.cards.join(", ")}`);
    console.log(`   elite > average: ${e.eliteAboveAverage ?? "n/a"}   average > weak: ${e.averageAboveWeak ?? "n/a"}   full ordering: ${e.fullOrderingHolds ?? "n/a"}`);
  }
  const testable = tiers.filter((t) => t.testable);
  const held = testable.filter((t) => t.fullOrderingHolds === true).length;
  const broke = testable.filter((t) => t.fullOrderingHolds === false).length;
  console.log(`\nfull ordering holds in ${held}/${testable.length} testable eras, breaks in ${broke}, ${tiers.length - testable.length} eras lack curated coverage`);
  console.log("\n— secondary view: corpus fixture types —\n");
  const h = runShootingHierarchy(calibrationFixtures());
  for (const e of h) {
    console.log(`${e.eraStyleId}:`);
    for (const r of e.ranked) console.log(`   ${r.fixtureId.padEnd(32)} ${String(r.type).padEnd(16)} eFG ${r.efg}  TS ${r.ts}`);
    console.log(`   ordering elite-offense above elite-defense: ${e.orderingHolds ?? "not testable in this era"}`);
  }
  write("shooting-hierarchy", { byShootingTier: tiers, byFixtureType: h });
} else if (cmd === "diagnostics") {
  const d = runDiagnostics(calibrationFixtures());
  console.log(`ADJUSTMENT BASELINE — ${d.games} games\n`);
  const a = d.adjustments;
  console.log(`  adjustments per game: mean ${a.perGame.mean}  median ${a.perGame.median}  p95 ${a.perGame.p95}  max ${a.perGame.max}`);
  console.log(`  games with zero adjustments: ${a.zeroAdjustmentGameRate}`);
  console.log(`\n  offensive triggers (a single dominant row would mean the ladder collapsed to one response):`);
  for (const [k, v] of Object.entries(a.offenseTriggers)) console.log(`    ${k.padEnd(52)} ${v}`);
  console.log(`\n  defensive triggers:`);
  const dt = Object.entries(a.defensiveTriggers);
  if (!dt.length) console.log(`    none recorded — the defensive change log is not surfaced on this path`);
  for (const [k, v] of dt) console.log(`    ${k.padEnd(52)} ${v}`);

  const u = d.usageConcentration;
  console.log(`\n\nUSAGE CONCENTRATION\n`);
  console.log(`  leading option's share of team FGA: mean ${u.topShotShare.mean}  median ${u.topShotShare.median}  p95 ${u.topShotShare.p95}  max ${u.topShotShare.max}`);
  console.log(`  leading option's share of team PTS: mean ${u.topPointShare.mean}  median ${u.topPointShare.median}  p95 ${u.topPointShare.p95}  max ${u.topPointShare.max}`);
  console.log(`  an even split across five would be ${u.evenSplitShare}\n`);
  console.log(`  most concentrated fixtures:`);
  for (const r of u.worstFixtures) console.log(`    ${r.fixtureId.padEnd(32)} ${String(r.meanTopShotShare).padStart(6)}  ${r.topName}`);

  console.log(`\n\nPLAYER STATISTICAL CEILINGS AND FLOORS — ${d.extremes.length} cards\n`);
  const byMax = [...d.extremes].sort((x, y) => y.pts.max - x.pts.max);
  console.log(`  highest single-game point ceilings:`);
  for (const r of byMax.slice(0, 10)) console.log(`    ${r.name.padEnd(22)} max ${String(r.pts.max).padStart(3)}  p95 ${String(r.pts.p95).padStart(3)}  mean ${String(r.pts.mean).padStart(5)}  min ${String(r.pts.min).padStart(3)}  (n=${r.appearances})`);
  console.log(`\n  lowest floors among cards averaging 15+ (a star should have a floor, not a zero):`);
  for (const r of d.extremes.filter((x) => x.pts.mean >= 15).sort((x, y) => x.pts.min - y.pts.min).slice(0, 8)) console.log(`    ${r.name.padEnd(22)} min ${String(r.pts.min).padStart(3)}  p05 ${String(r.pts.p05).padStart(3)}  mean ${String(r.pts.mean).padStart(5)}  max ${String(r.pts.max).padStart(3)}`);
  console.log(`\n  widest rebound ceilings:`);
  for (const r of [...d.extremes].sort((x, y) => y.reb.max - x.reb.max).slice(0, 6)) console.log(`    ${r.name.padEnd(22)} reb max ${String(r.reb.max).padStart(3)}  mean ${String(r.reb.mean).padStart(5)}`);
  console.log(`\n  widest assist ceilings:`);
  for (const r of [...d.extremes].sort((x, y) => y.ast.max - x.ast.max).slice(0, 6)) console.log(`    ${r.name.padEnd(22)} ast max ${String(r.ast.max).padStart(3)}  mean ${String(r.ast.mean).padStart(5)}`);
  write("diagnostics", d);
} else {
  console.error(`unknown command "${cmd}"`);
  process.exit(1);
}
