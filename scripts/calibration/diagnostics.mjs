#!/usr/bin/env node
// ── Controlled structural diagnostics ───────────────────────────────────────
// Every experiment here holds everything constant except the ONE thing under
// test. That is the whole point: Phase 6C1's zone conclusion came from a single
// uncontrolled matchup, and the sign turned out to depend on which side held
// the shell.
//
//   npm run calibration:zone-matrix
//   npm run calibration:shooting-all-eras
//   npm run calibration:three-point-decomposition
//   npm run calibration:coach-matrix
//   npm run calibration:fg-decomposition
//   npm run calibration:player-tails
import { writeFileSync, mkdirSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { teamMetrics, styleMetrics, quantiles } from "../../src/v3/calibration/metrics.js";
import { calibrationFixtures } from "../../data/calibration/split.mjs";
import { fixtureSeeds } from "../../data/calibration/seeds.mjs";
import { ERAS_COVERED } from "../../data/calibration/fixtures.mjs";
import ERA_DATA from "../../src/v3/data/eras.js";
import { PLAYERS } from "../../src/players.js";
import { shootingFor } from "../../src/v3/data/shooting.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import COACHES from "../../src/v3/data/coaches.js";
import { opponentFor } from "./freeze-structural.mjs";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildIntelligence } from "../../src/v3/intelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { findCard } from "../../src/players.js";

const OUT = ".cache/calibration";
const SIMS = Number(process.env.DIAG_SIMS ?? 1000);
const ids = (f) => f.roster.map((r) => r.playerCardId);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const eraRules = (id) => ERA_DATA.eras.find((e) => e.id === id)?.rules ?? {};
const eraEnv = (id) => ERA_DATA.eras.find((e) => e.id === id)?.environment ?? {};

const write = (name, payload) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/${name}.json`);
};

/**
 * One controlled cell. `label` names what varies; everything else is fixed by
 * the caller, and the SEEDS are always identical across cells.
 */
const cell = ({ gold, blue, eraStyleId, coachGoldId, coachBlueId, seeds, flags = {} }) => {
  const games = seeds.map((seed) => runPossessionGame(buildPossessionInput({
    goldIds: gold, blueIds: blue, coachGoldId, coachBlueId, eraStyleId, simulationSeed: seed, ...flags,
  })));
  const G = games.map((g) => teamMetrics(g.gold, g.blue, { periods: g.periods }));
  const B = games.map((g) => teamMetrics(g.blue, g.gold, { periods: g.periods }));
  const q = (arr, k) => quantiles(arr.map((x) => x[k]));
  return {
    games,
    gold: { ortg: q(G, "offensiveRating").mean, efg: q(G, "efgPct").mean, ts: q(G, "trueShootingPct").mean,
            tpar: q(G, "threePointAttemptRate").mean, orbPct: q(G, "offensiveReboundPct").mean,
            tovPct: q(G, "turnoverPct").mean, ftr: q(G, "freeThrowRate").mean, pace: q(G, "pace").mean,
            orb: q(G, "rebounds").mean },
    blue: { ortg: q(B, "offensiveRating").mean, efg: q(B, "efgPct").mean, ts: q(B, "trueShootingPct").mean,
            tpar: q(B, "threePointAttemptRate").mean, orbPct: q(B, "offensiveReboundPct").mean,
            tovPct: q(B, "turnoverPct").mean, ftr: q(B, "freeThrowRate").mean, pace: q(B, "pace").mean },
    goldWinRate: r3(games.filter((g) => g.finalScore.gold > g.finalScore.blue).length / games.length),
    style: styleMetrics(games),
    shells: [...new Set(games.flatMap((g) => Object.entries(g.zoneShells ?? {}).filter(([, v]) => v).map(([side, v]) => `${side}:${v}`)))],
  };
};

// ── 1. Zone shell matrix ────────────────────────────────────────────────────
//
// The Phase 6C1 zone finding rested on ONE matchup, and the deltas were
// initially read against the wrong side. Every row here names the defending
// team and the attacking team explicitly, and an assertion checks that the side
// holding the shell is the side that is defending.
const zoneMatrix = () => {
  const pool = calibrationFixtures();
  const rows = [];
  const violations = [];

  // Zone is legal from 2001-02, so only these eras can produce a shell at all.
  const legalEras = ERAS_COVERED.filter((e) => eraRules(e).zoneLegal);

  for (const era of legalEras) {
    const inEra = pool.filter((f) => f.eraStyleId === era);
    if (inEra.length < 2) continue;
    for (const attacker of inEra) {
      const defender = opponentFor(attacker, inEra);
      const seeds = fixtureSeeds("ZONE_CONTROL", `${attacker.fixtureId}|${defender.fixtureId}|${era}`, Math.max(250, Math.floor(SIMS / 4)));
      // Gold ATTACKS, blue DEFENDS. Fixed, so the labels below cannot invert.
      for (const [label, flags] of [["MAN", { zoneResolution: false }], ["ZONE_ALLOWED", { zoneResolution: true }]]) {
        const c = cell({ gold: ids(attacker), blue: ids(defender), eraStyleId: era,
          coachGoldId: attacker.coachId, coachBlueId: defender.coachId, seeds, flags });

        // Both teams attack AND defend inside a game, so naming one row's team
        // "the offence" is not enough. What must hold is that ZONE_ATTACK
        // possessions belong to the side FACING a shell, never the side
        // holding one. That is the attribution error Phase 6C1 made, and this
        // is the assertion that makes it impossible to repeat.
        const shellHolders = c.shells.map((x) => x.split(":")[0]);
        const zoneAttackBySide = { gold: 0, blue: 0 };
        for (const g of c.games) {
          for (const rec of g.possessionLedger ?? []) {
            if (rec.action === "ZONE_ATTACK") zoneAttackBySide[rec.offense]++;
          }
        }
        for (const side of ["gold", "blue"]) {
          const other = side === "gold" ? "blue" : "gold";
          if (zoneAttackBySide[side] > 0 && !shellHolders.includes(other)) {
            violations.push(`${era} ${attacker.fixtureId} vs ${defender.fixtureId} [${label}]: ${side} attacked a zone but ${other} holds no shell`);
          }
          if (shellHolders.includes(side) && zoneAttackBySide[other] === 0 && label === "ZONE_ALLOWED") {
            violations.push(`${era} ${attacker.fixtureId} vs ${defender.fixtureId} [${label}]: ${side} holds a shell but ${other} never attacked one`);
          }
        }

        const shellOn = (side) => c.shells.filter((x) => x.startsWith(`${side}:`)).map((x) => x.split(":")[1]).join("/") || "MAN";
        rows.push({
          eraStyleId: era,
          teamA: attacker.fixtureId,
          teamB: defender.fixtureId,
          condition: label,
          zoneLegalInEra: true,
          sims: seeds.length,
          // Explicit per side. No "zone team ORtg" without naming who has the
          // ball and who is defending.
          teamA_defensiveShell: shellOn("gold"),
          teamB_defensiveShell: shellOn("blue"),
          teamA_attackingAZone: zoneAttackBySide.gold > 0,
          teamB_attackingAZone: zoneAttackBySide.blue > 0,
          teamA_offensiveRating: c.gold.ortg,
          teamA_efg: c.gold.efg,
          teamA_3PAr: c.gold.tpar,
          teamA_offensiveReboundPct: c.gold.orbPct,
          teamA_turnoverPct: c.gold.tovPct,
          teamA_freeThrowRate: c.gold.ftr,
          teamB_offensiveRating: c.blue.ortg,
          teamB_efg: c.blue.efg,
          teamB_offensiveReboundPct: c.blue.orbPct,
          teamB_turnoverPct: c.blue.tovPct,
          teamA_winRate: c.goldWinRate,
          zoneAttackShareOverall: c.style.share.ZONE_ATTACK ?? 0,
        });
      }
    }
  }

  // Illegal-era control: the shell must be refused, and the delta exactly zero.
  const illegalControl = [];
  for (const era of ERAS_COVERED.filter((e) => !eraRules(e).zoneLegal)) {
    const inEra = pool.filter((f) => f.eraStyleId === era);
    if (inEra.length < 2) continue;
    const a = inEra[0];
    const d = opponentFor(a, inEra);
    const seeds = fixtureSeeds("ZONE_CONTROL", `${a.fixtureId}|${d.fixtureId}|${era}`, 250);
    const on = cell({ gold: ids(a), blue: ids(d), eraStyleId: era, coachGoldId: a.coachId, coachBlueId: d.coachId, seeds, flags: { zoneResolution: true } });
    const off = cell({ gold: ids(a), blue: ids(d), eraStyleId: era, coachGoldId: a.coachId, coachBlueId: d.coachId, seeds, flags: { zoneResolution: false } });
    illegalControl.push({
      eraStyleId: era, offensiveTeam: a.fixtureId, defensiveTeam: d.fixtureId,
      shellsSelected: on.shells.length,
      deltaWinRate: r3(on.goldWinRate - off.goldWinRate),
      deltaORtg: r1(on.gold.ortg - off.gold.ortg),
    });
  }

  return { design: "Both teams attack and defend, so every metric is reported PER NAMED SIDE and the shell is recorded per side. Seeds are identical across conditions; only the zone flag varies. The guard asserts that ZONE_ATTACK possessions belong to the side FACING a shell, never the side holding one — which is the attribution error made in Phase 6C1.", rows, illegalControl, violations };
};

// ── 2. Shooting hierarchy, all eras, two methods ────────────────────────────
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
const TIERS = { elite: ["ELITE"], average: ["GOOD", "AVERAGE"], weak: ["LIMITED", "NONE"] };

/** A legal five, in PG-C order, by backtracking. Null if the pool cannot fill it. */
const legalFive = (pool) => {
  const can = (p, slot) => (p.positions ?? [p.pos]).includes(slot);
  const assign = (i, used) => {
    if (i === SLOTS.length) return {};
    const options = pool.filter((p) => !used.has(p.id) && can(p, SLOTS[i]))
      .sort((a, b) => (a.positions ?? [a.pos]).length - (b.positions ?? [b.pos]).length);
    for (const c of options) {
      const rest = assign(i + 1, new Set([...used, c.id]));
      if (rest) return { [SLOTS[i]]: c.id, ...rest };
    }
    return null;
  };
  const found = assign(0, new Set());
  return found ? SLOTS.map((s) => found[s]) : null;
};

/**
 * A team whose five cards all carry one overridden perimeter-shooting tier.
 *
 * Only the shooting attribute moves; height, defence, rebounding, passing and
 * usage are untouched. That is what makes this a controlled experiment rather
 * than a comparison of two different rosters.
 */
const teamWithShooting = (cardIds, tier, coachId) => {
  const playerCards = cardIds.map((id) => findCard(id));
  const playerIntelligence = playerCards.map((c) => {
    const p = buildIntelligence(c, {});
    return { ...p, shooting: { ...(p.shooting ?? {}), perimeterSkill: tier, source: "CONTROLLED_EXPERIMENT_OVERRIDE" } };
  });
  const positionAssignments = ["PG", "SG", "SF", "PF", "C"];
  return {
    playerCards, playerIntelligence,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence, positionAssignments, ctx: {} }),
    coachId, coachIntelligence: buildCoachIntelligence(coachId === "neutral" ? "neutral" : coachId),
    positionAssignments,
  };
};

const shootingHierarchy = () => {
  const out = [];
  for (const era of ERAS_COVERED) {
    const pool = PLAYERS.filter((p) => p.decade === era)
      .map((p) => ({ ...p, tier: shootingFor(personIdForCard(p.id))?.perimeterSkill ?? "UNKNOWN" }));
    const graded = pool.filter((p) => p.tier !== "UNKNOWN");

    // ── Method A: real rosters, graded by curated tier ──
    const groups = {};
    for (const [name, tiers] of Object.entries(TIERS)) {
      const five = legalFive(graded.filter((p) => tiers.includes(p.tier)));
      if (five) groups[name] = five;
    }
    // Every group faces the SAME opponent, so only the group's shooting varies.
    const opponent = groups.average ?? groups.elite ?? groups.weak;
    const realRoster = Object.entries(groups).map(([name, five]) => {
      const seeds = fixtureSeeds("SHOOTING_HIERARCHY", `${era}|real|${name}`, Math.max(300, Math.floor(SIMS / 3)));
      const c = cell({ gold: five, blue: opponent, eraStyleId: era, coachGoldId: "neutral", coachBlueId: "neutral", seeds });
      return { group: name, cards: five, efg: c.gold.efg, ts: c.gold.ts, tpar: c.gold.tpar, ortg: c.gold.ortg };
    });

    // ── Method B: controlled profiles ──
    // The SAME five cards in every arm; only the curated perimeter tier is
    // overridden. This isolates the shooting model, which the real-roster
    // method cannot do — an "elite shooting" five is usually also a better
    // five, so that comparison confounds shooting with overall quality.
    //
    // The override is applied at the intelligence layer in this harness, not
    // through an engine flag: a test-only input path into the engine would be a
    // permanent affordance for faking a result.
    const base = legalFive(pool);
    const controlled = base ? ["ELITE", "AVERAGE", "LIMITED"].map((tier) => {
      const seeds = fixtureSeeds("SHOOTING_HIERARCHY", `${era}|ctrl|${tier}`, Math.max(300, Math.floor(SIMS / 3)));
      const goldTeam = teamWithShooting(base, tier, "neutral");
      const blueTeam = teamWithShooting(base, "AVERAGE", "neutral");
      const games = seeds.map((seed) => runPossessionGame({
        simulationId: "diag", simulationSeed: seed, mode: "single", eraStyleId: era,
        defensiveMatchups: true, zoneResolution: true, expandedActions: true,
        offensiveAdjustments: true, opportunityAllocation: true,
        gold: goldTeam, blue: blueTeam,
      }));
      const G = games.map((g) => teamMetrics(g.gold, g.blue, { periods: g.periods }));
      const q = (k) => quantiles(G.map((x) => x[k])).mean;
      return { tier, efg: q("efgPct"), ts: q("trueShootingPct"), tpar: q("threePointAttemptRate"), ortg: q("offensiveRating") };
    }) : null;

    const get = (n) => realRoster.find((r) => r.group === n)?.efg ?? null;
    const [e, a, w] = [get("elite"), get("average"), get("weak")];
    const cGet = (t) => controlled?.find((r) => r.tier === t)?.efg ?? null;
    const [ce, ca, cw] = [cGet("ELITE"), cGet("AVERAGE"), cGet("LIMITED")];
    out.push({
      eraStyleId: era,
      threePointLegal: Boolean(eraRules(era).threePoint),
      gradedCards: graded.length,
      realRoster,
      controlled,
      // The controlled arm needs no curated tiers, so it covers every era. The
      // real-roster arm needs enough graded cards and often does not have them.
      controlledOrderingHolds: ce != null && ca != null && cw != null ? ce > ca && ca > cw : null,
      realEliteAboveAverage: e != null && a != null ? e > a : null,
      realAverageAboveWeak: a != null && w != null ? a > w : null,
      realOrderingHolds: e != null && a != null && w != null ? e > a && a > w : null,
      realRosterUntestableReason: Object.keys(groups).length < 3
        ? `curated shooting tiers cover ${graded.length} cards in this era, not enough to field all three legal lineups — not guessed at`
        : null,
    });
  }
  return out;
};

// ── 3. 2020s three-point decomposition ──────────────────────────────────────
//
// Phase 6C1 measured an 18% shortfall against the era environment. A single
// global multiplier would hide the cause, so this splits the gap by the things
// that could produce it.
const threePointDecomposition = (era = "2020s") => {
  const pool = calibrationFixtures().filter((f) => f.eraStyleId === era);
  const env = eraEnv(era);
  const byAction = {};
  const byShooterTier = {};
  const byCoach = {};
  let totalShots = 0;
  let totalThrees = 0;
  const perTeam = [];

  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const seeds = fixtureSeeds("CALIBRATION", `${f.fixtureId}|${opp.fixtureId}|${era}`, Math.max(300, Math.floor(SIMS / 3)));
    const games = seeds.map((s) => runPossessionGame(buildPossessionInput({
      goldIds: ids(f), blueIds: ids(opp), coachGoldId: f.coachId, coachBlueId: opp.coachId, eraStyleId: era, simulationSeed: s,
    })));
    const tiersOf = new Map(f.roster.map((r) => [r.playerCardId, shootingFor(personIdForCard(r.playerCardId))?.perimeterSkill ?? "UNKNOWN"]));
    for (const g of games) {
      for (const rec of g.possessionLedger) {
        if (rec.offense !== "gold" || !rec.shot) continue;
        totalShots++;
        const three = rec.shot === "THREE_POINT";
        if (three) totalThrees++;
        const a = (byAction[rec.action] = byAction[rec.action] ?? { shots: 0, threes: 0 });
        a.shots++; if (three) a.threes++;
        const tier = tiersOf.get(rec.primary) ?? "UNKNOWN";
        const t = (byShooterTier[tier] = byShooterTier[tier] ?? { shots: 0, threes: 0 });
        t.shots++; if (three) t.threes++;
      }
    }
    const tpa = quantiles(games.map((g) => g.gold.totals.tpa)).mean;
    const c = (byCoach[f.coachId] = byCoach[f.coachId] ?? []);
    c.push(tpa);
    perTeam.push({ fixtureId: f.fixtureId, coachId: f.coachId, simulated3PA: tpa, envTarget: env.tpaPerGame ?? null,
      gap: env.tpaPerGame != null ? r1(tpa - env.tpaPerGame) : null,
      actionMix: styleMetrics(games, "gold").share });
  }

  const rate = (o) => (o.shots ? r3(o.threes / o.shots) : null);
  return {
    era,
    environmentTarget3PA: env.tpaPerGame ?? null,
    simulated3PA: r1(perTeam.reduce((a, t) => a + t.simulated3PA, 0) / perTeam.length),
    overallThreeRate: r3(totalThrees / totalShots),
    perTeam,
    byAction: Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, { shots: v.shots, share: r3(v.shots / totalShots), threeRate: rate(v) }])
      .sort((a, b) => b[1].shots - a[1].shots)),
    byShooterTier: Object.fromEntries(Object.entries(byShooterTier).map(([k, v]) => [k, { shots: v.shots, share: r3(v.shots / totalShots), threeRate: rate(v) }])),
    byCoach: Object.fromEntries(Object.entries(byCoach).map(([k, v]) => [k, r1(v.reduce((a, b) => a + b, 0) / v.length)])),
  };
};

// ── 4. Coach identity matrix ────────────────────────────────────────────────
const coachMatrix = () => {
  const pool = calibrationFixtures();
  // Same roster, different coaches. Everything else fixed.
  const anchor = pool.find((f) => f.fixtureId === "2010s-clippers-pnr") ?? pool[0];
  const opp = opponentFor(anchor, pool);
  const eraCoaches = (COACHES.coaches ?? []).filter((c) => c.id);
  const seeds = fixtureSeeds("COACH_CONTROL", `matrix|${anchor.fixtureId}`, Math.max(250, Math.floor(SIMS / 4)));

  const sameRoster = [];
  for (const coach of eraCoaches.slice(0, 12)) {
    try {
      const c = cell({ gold: ids(anchor), blue: ids(opp), eraStyleId: anchor.eraStyleId,
        coachGoldId: coach.id, coachBlueId: opp.coachId, seeds });
      const own = styleMetrics(c.games, "gold");
      sameRoster.push({
        coachId: coach.id, roster: anchor.fixtureId,
        // Separated deliberately: a team's ZONE_ATTACK share is a response to
        // the OPPONENT's shell, not a statement about this coach's offence.
        offensiveActionMix: Object.fromEntries(Object.entries(own.share).filter(([k]) => k !== "ZONE_ATTACK")),
        zoneAttackShareAgainstOpponentZone: own.share.ZONE_ATTACK ?? 0,
        defensiveZoneUsage: c.shells.filter((s) => s.startsWith("gold:")).length > 0,
        pace: c.gold.pace, ortg: c.gold.ortg,
      });
    } catch { /* a coach whose era gating rejects this matchup is skipped, not faked */ }
  }

  // Same coach, different rosters.
  const sameCoach = [];
  const coachId = anchor.coachId;
  for (const f of pool.filter((x) => x.eraStyleId === anchor.eraStyleId || x.fixtureId === anchor.fixtureId).slice(0, 6)) {
    const o = opponentFor(f, pool);
    const s2 = fixtureSeeds("COACH_CONTROL", `roster|${f.fixtureId}`, Math.max(250, Math.floor(SIMS / 4)));
    const c = cell({ gold: ids(f), blue: ids(o), eraStyleId: f.eraStyleId, coachGoldId: coachId, coachBlueId: o.coachId, seeds: s2 });
    const own = styleMetrics(c.games, "gold");
    sameCoach.push({ coachId, roster: f.fixtureId,
      offensiveActionMix: Object.fromEntries(Object.entries(own.share).filter(([k]) => k !== "ZONE_ATTACK")),
      zoneAttackShareAgainstOpponentZone: own.share.ZONE_ATTACK ?? 0, pace: c.gold.pace });
  }

  const spreadOf = (rows) => {
    const fams = [...new Set(rows.flatMap((r) => Object.keys(r.offensiveActionMix)))];
    return Object.fromEntries(fams.map((fam) => {
      const vals = rows.map((r) => r.offensiveActionMix[fam] ?? 0);
      return [fam, { min: r3(Math.min(...vals)), max: r3(Math.max(...vals)), range: r3(Math.max(...vals) - Math.min(...vals)) }];
    }));
  };

  return {
    design: "Same roster with different coaches, then the same coach with different rosters. ZONE_ATTACK is reported separately because it is a response to the OPPONENT'S shell, not this coach's offensive philosophy.",
    sameRosterDifferentCoaches: sameRoster,
    sameCoachDifferentRosters: sameCoach,
    coachSpread: spreadOf(sameRoster),
    rosterSpread: spreadOf(sameCoach),
  };
};

// ── 5. FG% decomposition ────────────────────────────────────────────────────
const fgDecomposition = () => {
  const pool = calibrationFixtures();
  const byAction = {};
  const byShotCategory = {};
  let mismatchShots = 0;
  let totalShots = 0;
  let made = 0;
  const perEra = {};

  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const seeds = fixtureSeeds("CALIBRATION", `${f.fixtureId}|${opp.fixtureId}|${f.eraStyleId}`, Math.max(200, Math.floor(SIMS / 5)));
    const games = seeds.map((s) => runPossessionGame(buildPossessionInput({
      goldIds: ids(f), blueIds: ids(opp), coachGoldId: f.coachId, coachBlueId: opp.coachId, eraStyleId: f.eraStyleId, simulationSeed: s,
    })));
    const e = (perEra[f.eraStyleId] = perEra[f.eraStyleId] ?? { fgm: 0, fga: 0, envFgPct: eraEnv(f.eraStyleId).fgPct ?? null });
    for (const g of games) {
      e.fgm += g.gold.totals.fgm; e.fga += g.gold.totals.fga;
      for (const rec of g.possessionLedger) {
        if (rec.offense !== "gold" || !rec.shot) continue;
        totalShots++;
        const hit = rec.outcome === "MADE_FG";
        if (hit) made++;
        if (rec.targetedMismatch) mismatchShots++;
        const a = (byAction[rec.action] = byAction[rec.action] ?? { n: 0, made: 0, expected: 0 });
        a.n++; if (hit) a.made++; a.expected += rec.expectedMake ?? 0;
        const s = (byShotCategory[rec.shot] = byShotCategory[rec.shot] ?? { n: 0, made: 0, expected: 0 });
        s.n++; if (hit) s.made++; s.expected += rec.expectedMake ?? 0;
      }
    }
  }
  const summarise = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, {
    attempts: v.n, share: r3(v.n / totalShots),
    realizedMakePct: r3(v.made / v.n),
    expectedMakePct: r3(v.expected / v.n),
    // A gap between expected and realized means the shot-quality model and the
    // resolution disagree, which is a different defect from either being wrong.
    expectedVsRealized: r3(v.made / v.n - v.expected / v.n),
  }]).sort((a, b) => b[1].attempts - a[1].attempts));

  return {
    totalShots,
    overallRealizedMakePct: r3(made / totalShots),
    mismatchTargetedShare: r3(mismatchShots / totalShots),
    byAction: summarise(byAction),
    byShotCategory: summarise(byShotCategory),
    byEra: Object.fromEntries(Object.entries(perEra).map(([k, v]) => [k, {
      simulatedFgPct: r3(v.fgm / v.fga),
      environmentFgPct: v.envFgPct,
      gap: v.envFgPct != null ? r3(v.fgm / v.fga - v.envFgPct) : null,
    }])),
  };
};

// ── 6. Player tails ─────────────────────────────────────────────────────────
const playerTails = () => {
  const pool = calibrationFixtures();
  const byCard = {};
  for (const f of pool) {
    const opp = opponentFor(f, pool);
    const seeds = fixtureSeeds("CALIBRATION", `${f.fixtureId}|${opp.fixtureId}|${f.eraStyleId}`, Math.max(300, Math.floor(SIMS / 3)));
    for (const s of seeds) {
      const g = runPossessionGame(buildPossessionInput({
        goldIds: ids(f), blueIds: ids(opp), coachGoldId: f.coachId, coachBlueId: opp.coachId, eraStyleId: f.eraStyleId, simulationSeed: s,
      }));
      for (const side of ["gold", "blue"]) {
        const t = g[side].totals;
        for (const p of g[side].players) {
          const r = (byCard[p.cardId] = byCard[p.cardId] ?? { name: p.name, n: 0, pts: [], fga: [], tpa: [], fta: [], reb: [], ast: [], stl: [], blk: [], to: [], share: [] });
          r.n++;
          r.pts.push(p.pts); r.fga.push(p.fga); r.tpa.push(p.tpa); r.fta.push(p.fta);
          r.reb.push(p.reb); r.ast.push(p.ast); r.stl.push(p.stl); r.blk.push(p.blk); r.to.push(p.to);
          if (t.fga) r.share.push(p.fga / t.fga);
        }
      }
    }
  }
  return Object.entries(byCard).map(([cardId, r]) => ({
    cardId, name: r.name, appearances: r.n,
    pts: quantiles(r.pts), fga: quantiles(r.fga), tpa: quantiles(r.tpa), fta: quantiles(r.fta),
    reb: quantiles(r.reb), ast: quantiles(r.ast), stl: quantiles(r.stl), blk: quantiles(r.blk), to: quantiles(r.to),
    shotShare: quantiles(r.share),
  })).sort((a, b) => b.pts.mean - a.pts.mean);
};

// ── CLI ─────────────────────────────────────────────────────────────────────
// Guarded: importing this module for a helper must never run a command.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === "zone-matrix") {
    const z = zoneMatrix();
    console.log(`ZONE SHELL MATRIX — ${z.design}\n`);
    console.log("era     teamA                          teamB                          cond          A-shell B-shell  A-ORtg  A-eFG  A-ORB%  B-ORtg  B-ORB%  A-win");
    for (const r of z.rows) {
      console.log(`${r.eraStyleId}  ${r.teamA.padEnd(30)} ${r.teamB.padEnd(30)} ${r.condition.padEnd(13)} ${r.teamA_defensiveShell.padEnd(7)} ${r.teamB_defensiveShell.padEnd(7)} ${String(r.teamA_offensiveRating).padStart(6)} ${String(r.teamA_efg).padStart(6)} ${String(r.teamA_offensiveReboundPct).padStart(7)} ${String(r.teamB_offensiveRating).padStart(7)} ${String(r.teamB_offensiveReboundPct).padStart(7)} ${String(r.teamA_winRate).padStart(6)}`);
    }
    console.log(`\nzone-illegal era control (delta must be exactly 0):`);
    for (const c of z.illegalControl) console.log(`  ${c.eraStyleId}  shells ${c.shellsSelected}  Δwin ${c.deltaWinRate}  ΔORtg ${c.deltaORtg}`);
    console.log(`\nside-attribution violations: ${z.violations.length}${z.violations.length ? "\n  " + z.violations.join("\n  ") : " — every zone attack faced a shell held by the OTHER side"}`);
    write("zone-matrix", z);
  } else if (cmd === "shooting-all-eras") {
    const h = shootingHierarchy();
    console.log("SHOOTING HIERARCHY — all eight Era Styles\n");
    for (const e of h) {
      console.log(`${e.eraStyleId}  (3PT ${e.threePointLegal ? "legal" : "does not exist"}, ${e.gradedCards} graded cards)`);
      // Controlled first: it is the arm that isolates the shooting model, and it
      // covers every era.
      if (e.controlled) {
        for (const r of e.controlled) {
          console.log(`   ctrl  ${r.tier.padEnd(8)} eFG ${String(r.efg).padStart(6)}  TS ${String(r.ts).padStart(6)}  3PAr ${String(r.tpar).padStart(6)}  ORtg ${String(r.ortg).padStart(6)}`);
        }
        console.log(`   controlled ordering ELITE > AVERAGE > LIMITED: ${e.controlledOrderingHolds}`);
      }
      if (e.realRosterUntestableReason) {
        console.log(`   real rosters NOT TESTABLE — ${e.realRosterUntestableReason}\n`);
        continue;
      }
      for (const r of [...e.realRoster].sort((a, b) => b.efg - a.efg)) {
        console.log(`   real  ${r.group.padEnd(8)} eFG ${String(r.efg).padStart(6)}  TS ${String(r.ts).padStart(6)}  3PAr ${String(r.tpar).padStart(6)}  ORtg ${String(r.ortg).padStart(6)}`);
      }
      console.log(`   real ordering: elite>average ${e.realEliteAboveAverage}  average>weak ${e.realAverageAboveWeak}  full ${e.realOrderingHolds}\n`);
    }
    const ctrl = h.filter((x) => x.controlledOrderingHolds != null);
    const real = h.filter((x) => !x.realRosterUntestableReason);
    console.log(`controlled arm: ${ctrl.length}/8 eras testable, ordering holds in ${ctrl.filter((x) => x.controlledOrderingHolds).length}`);
    console.log(`real-roster arm: ${real.length}/8 eras testable, ordering holds in ${real.filter((x) => x.realOrderingHolds).length}`);
    write("shooting-all-eras", { eras: h });
  } else if (cmd === "three-point-decomposition") {
    const d = threePointDecomposition(process.argv[3] ?? "2020s");
    console.log(`THREE-POINT DECOMPOSITION — ${d.era}\n`);
    console.log(`  environment target 3PA/game : ${d.environmentTarget3PA}`);
    console.log(`  simulated 3PA/game          : ${d.simulated3PA}   gap ${r1(d.simulated3PA - d.environmentTarget3PA)}`);
    console.log(`  overall three rate          : ${d.overallThreeRate}\n`);
    console.log(`  by action family (share of shots, and how often that action produces a three):`);
    for (const [k, v] of Object.entries(d.byAction)) console.log(`    ${k.padEnd(22)} share ${String(v.share).padStart(6)}  threeRate ${String(v.threeRate).padStart(6)}`);
    console.log(`\n  by shooter's curated tier:`);
    for (const [k, v] of Object.entries(d.byShooterTier)) console.log(`    ${k.padEnd(22)} share ${String(v.share).padStart(6)}  threeRate ${String(v.threeRate).padStart(6)}`);
    console.log(`\n  by coach (simulated 3PA/game):`);
    for (const [k, v] of Object.entries(d.byCoach)) console.log(`    ${k.padEnd(22)} ${v}`);
    console.log(`\n  by team:`);
    for (const t of d.perTeam) console.log(`    ${t.fixtureId.padEnd(30)} 3PA ${String(t.simulated3PA).padStart(5)}  gap ${t.gap}`);
    write("three-point-decomposition", d);
  } else if (cmd === "coach-matrix") {
    const m = coachMatrix();
    console.log(`COACH IDENTITY MATRIX — ${m.design}\n`);
    console.log("SAME ROSTER, DIFFERENT COACHES");
    for (const r of m.sameRosterDifferentCoaches) {
      const top = Object.entries(r.offensiveActionMix).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join("  ");
      console.log(`  ${r.coachId.padEnd(20)} pace ${String(r.pace).padStart(5)}  zoneAttackVsOpponentZone ${String(r.zoneAttackShareAgainstOpponentZone).padStart(6)}  | ${top}`);
    }
    console.log("\n  spread across coaches (range = max - min):");
    for (const [f, s] of Object.entries(m.coachSpread).sort((a, b) => b[1].range - a[1].range)) console.log(`    ${f.padEnd(22)} min ${String(s.min).padStart(6)}  max ${String(s.max).padStart(6)}  range ${s.range}`);
    console.log("\nSAME COACH, DIFFERENT ROSTERS");
    for (const r of m.sameCoachDifferentRosters) {
      const top = Object.entries(r.offensiveActionMix).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join("  ");
      console.log(`  ${r.roster.padEnd(30)} pace ${String(r.pace).padStart(5)}  | ${top}`);
    }
    console.log("\n  spread across rosters:");
    for (const [f, s] of Object.entries(m.rosterSpread).sort((a, b) => b[1].range - a[1].range).slice(0, 6)) console.log(`    ${f.padEnd(22)} range ${s.range}`);
    write("coach-matrix", m);
  } else if (cmd === "fg-decomposition") {
    const d = fgDecomposition();
    console.log(`FIELD-GOAL DECOMPOSITION — ${d.totalShots} shots\n`);
    console.log(`  overall realized make%      : ${d.overallRealizedMakePct}`);
    console.log(`  mismatch-targeted share     : ${d.mismatchTargetedShare}\n`);
    console.log(`  by action family:`);
    console.log(`    ${"family".padEnd(22)} ${"share".padStart(6)} ${"expected".padStart(9)} ${"realized".padStart(9)} ${"diff".padStart(7)}`);
    for (const [k, v] of Object.entries(d.byAction)) console.log(`    ${k.padEnd(22)} ${String(v.share).padStart(6)} ${String(v.expectedMakePct).padStart(9)} ${String(v.realizedMakePct).padStart(9)} ${String(v.expectedVsRealized).padStart(7)}`);
    console.log(`\n  by shot category:`);
    for (const [k, v] of Object.entries(d.byShotCategory)) console.log(`    ${k.padEnd(22)} ${String(v.share).padStart(6)} ${String(v.expectedMakePct).padStart(9)} ${String(v.realizedMakePct).padStart(9)} ${String(v.expectedVsRealized).padStart(7)}`);
    console.log(`\n  by era (simulated vs the era environment):`);
    for (const [k, v] of Object.entries(d.byEra)) console.log(`    ${k.padEnd(8)} sim ${String(v.simulatedFgPct).padStart(6)}  env ${String(v.environmentFgPct).padStart(6)}  gap ${v.gap}`);
    write("fg-decomposition", d);
  } else if (cmd === "player-tails") {
    const t = playerTails();
    console.log(`PLAYER TAILS — ${t.length} cards\n`);
    console.log(`  highest scoring means:`);
    console.log(`    ${"player".padEnd(24)} ${"mean".padStart(6)} ${"p95".padStart(5)} ${"p99".padStart(5)} ${"max".padStart(5)} ${"shotShare".padStart(10)}`);
    for (const r of t.slice(0, 12)) console.log(`    ${r.name.padEnd(24)} ${String(r.pts.mean).padStart(6)} ${String(r.pts.p95).padStart(5)} ${String(r.pts.max).padStart(5)} ${String(r.pts.max).padStart(5)} ${String(r.shotShare.mean).padStart(10)}`);
    console.log(`\n  highest shot shares:`);
    for (const r of [...t].sort((a, b) => b.shotShare.mean - a.shotShare.mean).slice(0, 8)) console.log(`    ${r.name.padEnd(24)} share mean ${String(r.shotShare.mean).padStart(6)}  p95 ${String(r.shotShare.p95).padStart(6)}  max ${String(r.shotShare.max).padStart(6)}`);
    console.log(`\n  rebound and assist ceilings:`);
    for (const r of [...t].sort((a, b) => b.reb.max - a.reb.max).slice(0, 5)) console.log(`    ${r.name.padEnd(24)} reb mean ${String(r.reb.mean).padStart(5)} max ${String(r.reb.max).padStart(4)}`);
    for (const r of [...t].sort((a, b) => b.ast.max - a.ast.max).slice(0, 5)) console.log(`    ${r.name.padEnd(24)} ast mean ${String(r.ast.mean).padStart(5)} max ${String(r.ast.max).padStart(4)}`);
    write("player-tails", { players: t });
  } else {
    console.error(`unknown diagnostic "${cmd}"`);
    process.exit(1);
  }
}
