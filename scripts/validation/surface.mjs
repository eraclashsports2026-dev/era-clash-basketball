// ── The V4 measurement surface ──────────────────────────────────────────────
// One metric-extraction implementation shared by the observability controls,
// the era-reference certification and the V4 holdout runner. If those used
// different extraction code, a control certifying a metric would certify a
// different quantity than the holdout scores.
//
// The V3 lesson is encoded here as a hard property of every metric: each metric
// declares which surfaces can identify it, and offence/defence quantities are
// NEVER identifiable on a MIRROR surface, where both sides are the same roster
// and points-scored equals points-conceded up to seeded noise.
import { runPossessionGame } from "../../src/v3/possession/index.js";

export const SURFACES = Object.freeze({
  MIRROR: "MIRROR",                       // team vs itself — internal distribution only
  TEAM_VS_TEAM: "TEAM_VS_TEAM",           // A vs B — interaction, jointly determined
  VS_ERA_REFERENCE: "VS_ERA_REFERENCE",   // subject offence vs a frozen independent defence
  REFERENCE_VS_TEAM: "REFERENCE_VS_TEAM", // frozen independent offence vs subject defence
});

const ZONE = (schemeId) => String(schemeId ?? "").startsWith("ZONE");
const MOVEMENT_ACTIONS = new Set(["OFF_BALL_SCREEN", "CUT", "HANDOFF"]);
const INTERIOR_SHOTS = new Set(["RIM", "PAINT_OR_POST"]);

/**
 * Per-game metric samples for one subject side.
 *
 * Everything here is a within-game quantity, so a set of games yields a sample
 * per game and the statistics downstream are over games, never over possessions
 * pooled across games (which would understate variance).
 */
export const gameSample = (g, side) => {
  const opp = side === "gold" ? "blue" : "gold";
  const t = g[side].totals; const o = g[opp].totals;
  const off = (g.possessionLedger ?? []).filter((r) => r.offense === side);
  const def = (g.possessionLedger ?? []).filter((r) => r.offense === opp);
  const act = {}; for (const r of off) act[r.action] = (act[r.action] ?? 0) + 1;
  const shots = off.filter((r) => typeof r.shot === "string");
  const interior = shots.filter((r) => INTERIOR_SHOTS.has(r.shot)).length;
  const oShots = def.filter((r) => typeof r.shot === "string");
  const oInterior = oShots.filter((r) => INTERIOR_SHOTS.has(r.shot)).length;
  const missO = off.filter((r) => r.outcome === "MISS_OREB").length;
  const missD = off.filter((r) => r.outcome === "MISS_DREB").length;
  const oMissO = def.filter((r) => r.outcome === "MISS_OREB").length;
  const oMissD = def.filter((r) => r.outcome === "MISS_DREB").length;
  const share = (n) => (off.length ? n / off.length : null);
  const pts = g.finalScore[side]; const oPts = g.finalScore[opp];
  const five = g[side].players.map((p) => p.pts);
  const fiveSum = five.reduce((a, b) => a + b, 0);
  return {
    possessions: t.possessions,
    ppp: t.possessions ? pts / t.possessions : null,
    oppPpp: o.possessions ? oPts / o.possessions : null,
    transitionShare: share(act.TRANSITION ?? 0),
    pnrShare: share(act.PICK_AND_ROLL ?? 0),
    postUpShare: share(act.POST_UP ?? 0),
    isolationShare: share(act.ISOLATION ?? 0),
    movementShare: share([...MOVEMENT_ACTIONS].reduce((a, k) => a + (act[k] ?? 0), 0)),
    threeShare: t.fga ? t.tpa / t.fga : null,
    interiorShotShare: shots.length ? interior / shots.length : null,
    orebRate: missO + missD ? missO / (missO + missD) : null,
    orebRateAgainst: oMissO + oMissD ? oMissO / (oMissO + oMissD) : null,
    assistedRate: t.fgm ? t.ast / t.fgm : null,
    stealRateForced: def.length ? def.filter((r) => r.outcome === "TURNOVER_STOLEN").length / def.length : null,
    blockRateForced: def.length && t.blk != null ? t.blk / def.length : null,
    rimShareAgainst: oShots.length ? oInterior / oShots.length : null,
    defensiveZoneShare: def.length ? def.filter((r) => ZONE(r.schemeId)).length / def.length : null,
    topScoringShare: fiveSum > 0 ? Math.max(...five) / fiveSum : null,
    win: pts > oPts ? 1 : 0,
    tie: pts === oPts ? 1 : 0,
    invariantViolations: (g.invariantViolations ?? []).length,
  };
};

/**
 * The metric catalogue. `identifiableOn` is the V3 lesson made structural: a
 * claim on a metric may only be scored on a surface that can identify it.
 */
export const METRICS = Object.freeze({
  gamePace: { field: "possessions", identifiableOn: ["VS_ERA_REFERENCE"], group: "PACE_JOINT",
    note: "Pace is a joint game quantity. It is attributed to the subject only against the frozen reference, compared with the reference's own self-baseline." },
  pppVsReference: { field: "ppp", identifiableOn: ["VS_ERA_REFERENCE"], group: "MIRROR_PPP",
    note: "Offence quality: subject points per possession against the frozen reference defence." },
  refPppVsTeam: { field: "oppPpp", identifiableOn: ["REFERENCE_VS_TEAM"], group: "MIRROR_PPP",
    note: "Defence quality: the frozen reference offence's points per possession against the subject, read from the subject's defensive side." },
  transitionShare: { field: "transitionShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "ACTION_SHARES" },
  pnrShare: { field: "pnrShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "ACTION_SHARES" },
  postUpShare: { field: "postUpShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "ACTION_SHARES" },
  isolationShare: { field: "isolationShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "ACTION_SHARES" },
  movementShare: { field: "movementShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "ACTION_SHARES" },
  threeShare: { field: "threeShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "SHOT_MIX" },
  interiorShotShare: { field: "interiorShotShare", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "SHOT_MIX" },
  orebRate: { field: "orebRate", identifiableOn: ["VS_ERA_REFERENCE"], group: "REBOUND_RATE",
    note: "Offensive-rebound rate is a contest against the OPPONENT's defensive rebounding, so it needs the independent reference on the other side." },
  orebRateAgainst: { field: "orebRateAgainst", identifiableOn: ["REFERENCE_VS_TEAM"], group: "REBOUND_RATE" },
  assistedRate: { field: "assistedRate", identifiableOn: ["VS_ERA_REFERENCE", "MIRROR"], group: "PLAYMAKING" },
  stealRateForced: { field: "stealRateForced", identifiableOn: ["REFERENCE_VS_TEAM"], group: "DEFENSE_EVENTS",
    note: "Forced-steal rate depends on the opponent's ball security, so it is measured against the frozen reference offence." },
  rimShareAgainst: { field: "rimShareAgainst", identifiableOn: ["REFERENCE_VS_TEAM"], group: "SHOT_MIX",
    note: "Rim deterrence: how much of the frozen reference offence's shot mix the subject defence pushes away from the rim." },
  defensiveZoneShare: { field: "defensiveZoneShare", identifiableOn: ["REFERENCE_VS_TEAM", "MIRROR"], group: "SCHEME" },
  topScoringShare: { field: "topScoringShare", identifiableOn: ["MIRROR", "VS_ERA_REFERENCE"], group: "CONCENTRATION",
    note: "Reported, not scored: algebraically entangled with scoring entropy, and no eligible trait claims it." },
});

/** Side-balanced paired play: each seed runs both orientations. */
export const playPairedSamples = ({ subject, opponent, eraStyleId, seedAt, pairs, subjectLabel = "subject" }) => {
  const samples = [];
  let violations = 0; let ties = 0;
  for (let i = 0; i < pairs; i++) {
    const seed = seedAt(i);
    const g1 = runPossessionGame({
      simulationId: "v4-surface", simulationSeed: seed, mode: "single", eraStyleId,
      parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
      offensiveAdjustments: true, opportunityAllocation: true, gold: subject, blue: opponent,
    }, { includeLedger: true, assertInvariants: false });
    const g2 = runPossessionGame({
      simulationId: "v4-surface", simulationSeed: seed, mode: "single", eraStyleId,
      parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
      offensiveAdjustments: true, opportunityAllocation: true, gold: opponent, blue: subject,
    }, { includeLedger: true, assertInvariants: false });
    const s1 = gameSample(g1, "gold"); const s2 = gameSample(g2, "blue");
    samples.push({ ...s1, orientation: "GOLD" }, { ...s2, orientation: "BLUE" });
    violations += s1.invariantViolations + s2.invariantViolations;
    ties += s1.tie + s2.tie;
  }
  return { subjectLabel, games: samples.length, samples, invariantViolations: violations, ties };
};

/** Mean, sd, se and a 95% Wald interval over per-game samples of one field. */
export const summarise = (samples, field) => {
  const xs = samples.map((s) => s[field]).filter((x) => Number.isFinite(x));
  const n = xs.length;
  if (n < 2) return { n, mean: null, sd: null, se: null, ci95: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const r5 = (x) => Math.round(x * 100000) / 100000;
  return { n, mean: r5(mean), sd: r5(sd), se: r5(se), ci95: { lower: r5(mean - 1.96 * se), upper: r5(mean + 1.96 * se) } };
};

/** Difference of two independent game-sample means, with a 95% interval. */
export const diffSummary = (a, b) => {
  if (!a?.mean == null || b?.mean == null || a.se == null || b.se == null) return null;
  const se = Math.sqrt(a.se ** 2 + b.se ** 2);
  const d = a.mean - b.mean;
  const r5 = (x) => Math.round(x * 100000) / 100000;
  return { diff: r5(d), se: r5(se), z: se > 0 ? r5(d / se) : null,
    ci95: { lower: r5(d - 1.96 * se), upper: r5(d + 1.96 * se) },
    significant: se > 0 && Math.abs(d / se) > 1.96 };
};
