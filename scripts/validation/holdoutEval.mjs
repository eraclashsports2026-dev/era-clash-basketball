// ── Fixture evaluation, shared by the reference, the dry run and both holdouts ──
//
// One evaluation function used for calibration fixtures AND holdout fixtures, so
// the internal baseline and the holdout result are computed by identical code.
// If they were computed by different code the ratio gate between them would be
// comparing two methods rather than two datasets.
//
// Nothing here reads a seal or opens anything. It evaluates whatever fixtures it
// is handed.
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { OPPORTUNITY_BOUNDS, IDENTITY_RUBRIC } from "../../src/v3/calibration/holdoutScopePolicy.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
export const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** The five share surfaces the Tier C proxies can adjudicate. */
export const SHARE_METRICS = Object.freeze({
  playerScoringShares: (p) => p.pts,
  playerReboundShares: (p) => p.reb,
  playerAssistShares: (p) => p.ast,
  playerStealShares: (p) => p.stl,
  playerBlockShares: (p) => p.blk,
});

export const buildTeam = (fixture, byId) => {
  const profiles = fixture.players.map((p) => buildCalibrationPlayerProfile(byId.get(p.calibrationPlayerId)));
  const playerCards = profiles.map((p) => ({
    id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0,
    an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0,
  }));
  const positionAssignments = fixture.players.map((p) => p.assignedPosition);
  return {
    playerCards, playerIntelligence: profiles,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profiles, positionAssignments, ctx: {} }),
    coachId: fixture.coachId, coachIntelligence: buildCoachIntelligence(fixture.coachId), positionAssignments,
  };
};

/**
 * Simulate one fixture and return everything a verdict could need.
 *
 * Each fixture plays a MIRROR of itself. That isolates the internal
 * distribution the Tier C season-share proxy describes from opponent quality,
 * which no target exists for. It also means no result here speaks to
 * cross-team matchups, and the artifacts say so.
 */
export const evaluateFixture = ({ fixture, target, byId, seeds, seedAt, parameterSet = null, ledgerEvery = 16 }) => {
  const team = buildTeam(fixture, byId);
  const ids = fixture.players.map((p) => p.calibrationPlayerId);

  const totals = Object.fromEntries(Object.keys(SHARE_METRICS).map((k) => [k, ids.map(() => 0)]));
  let invariantViolations = 0; let ties = 0; let impossible = 0; let games = 0;
  const possessions = []; const pts = []; const oppPts = [];
  let threeAttempts = 0; let fga = 0; let rimish = 0; let oreb = 0; let reb = 0;
  const topShares = []; const leadIsLead = [];

  for (let i = 0; i < seeds; i++) {
    const withLedger = i % ledgerEvery === 0;
    const g = runPossessionGame({
      simulationId: "holdout-eval", simulationSeed: seedAt(i), mode: "single",
      eraStyleId: fixture.eraStyleId, parameterSet,
      defensiveMatchups: true, zoneResolution: true, expandedActions: true,
      offensiveAdjustments: true, opportunityAllocation: true,
      gold: team, blue: team,
    }, { includeLedger: withLedger, assertInvariants: false });

    games++;
    invariantViolations += (g.invariantViolations ?? []).length;
    if (g.finalScore.gold === g.finalScore.blue) ties++;
    for (const s of [g.finalScore.gold, g.finalScore.blue]) if (s < 20 || s > 220) impossible++;
    possessions.push(g.gold.totals.possessions);
    pts.push(g.finalScore.gold); oppPts.push(g.finalScore.blue);

    const byCard = new Map(g.gold.players.map((p) => [p.cardId, p]));
    for (const [metric, pick] of Object.entries(SHARE_METRICS)) {
      for (const [k, id] of ids.entries()) totals[metric][k] += pick(byCard.get(id) ?? {}) ?? 0;
    }
    for (const p of g.gold.players) {
      if (p.pts < 0 || p.fgm > p.fga || p.ast > g.gold.totals.fgm || p.oreb + p.dreb !== p.reb) impossible++;
      threeAttempts += p.tpa; fga += p.fga; oreb += p.oreb; reb += p.reb;
    }
    const gp = g.gold.players.map((p) => p.pts);
    const tot = gp.reduce((a, b) => a + b, 0);
    if (tot > 0) topShares.push(Math.max(...gp) / tot);
    if (withLedger) {
      for (const r of g.possessionLedger ?? []) if (typeof r.shot === "string" && /RIM|POST|PAINT/.test(r.shot)) rimish++;
    }
  }

  // ── Tier C proxy error, computed only where a target exists ──────────────
  const shareResults = {};
  for (const metric of Object.keys(SHARE_METRICS)) {
    const t = target?.unitTargets?.[metric];
    if (!t || !Object.keys(t).length) { shareResults[metric] = { supported: false, reason: "no target map", mae: null, perPlayer: null }; continue; }
    const sum = totals[metric].reduce((a, b) => a + b, 0);
    if (!(sum > 0)) { shareResults[metric] = { supported: false, reason: "engine produced none of this statistic", mae: null, perPlayer: null }; continue; }
    const per = []; let err = 0; let n = 0;
    for (const [k, id] of ids.entries()) {
      const tv = t[id];
      if (!Number.isFinite(tv)) { per.push({ id, target: null, realised: r5(totals[metric][k] / sum), excluded: "no target for this player" }); continue; }
      const rv = totals[metric][k] / sum;
      per.push({ id, target: r5(tv), realised: r5(rv), absoluteError: r5(Math.abs(rv - tv)) });
      err += Math.abs(rv - tv); n++;
    }
    shareResults[metric] = { supported: n > 0, playersScored: n, mae: n ? r5(err / n) : null, perPlayer: per };
  }
  const supportedMaes = Object.values(shareResults).filter((s) => s.supported && s.mae != null).map((s) => s.mae);

  // ── structural measures ─────────────────────────────────────────────────
  const meanPoss = possessions.reduce((a, b) => a + b, 0) / Math.max(1, possessions.length);
  const meanPts = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
  const meanOpp = oppPts.reduce((a, b) => a + b, 0) / Math.max(1, oppPts.length);

  return {
    fixtureId: fixture.fixtureId, teamName: fixture.teamName, season: fixture.season,
    eraStyleId: fixture.eraStyleId, coachId: fixture.coachId,
    games, seeds,
    shareResults,
    compositeMae: supportedMaes.length ? r5(supportedMaes.reduce((a, b) => a + b, 0) / supportedMaes.length) : null,
    supportedShareMetrics: Object.entries(shareResults).filter(([, s]) => s.supported).map(([k]) => k),
    unsupportedShareMetrics: Object.entries(shareResults).filter(([, s]) => !s.supported).map(([k, s]) => ({ metric: k, reason: s.reason })),
    structural: {
      invariantViolations, finalTies: ties, impossibleStatistics: impossible,
      meanPossessions: r5(meanPoss), meanPoints: r5(meanPts), meanOpponentPoints: r5(meanOpp),
      pointsPerPossession: r5(meanPts / Math.max(1, meanPoss)),
      opponentPointsPerPossession: r5(meanOpp / Math.max(1, meanPoss)),
      threeShare: r5(fga > 0 ? threeAttempts / fga : 0),
      rimShare: r5(fga > 0 ? rimish / fga : null),
      offensiveReboundShare: r5(reb > 0 ? oreb / reb : null),
      reboundsPerGame: r5(reb / Math.max(1, games)),
      meanTopOptionShare: r5(topShares.reduce((a, b) => a + b, 0) / Math.max(1, topShares.length)),
      topOptionShareWithinBounds: (() => {
        const m = topShares.reduce((a, b) => a + b, 0) / Math.max(1, topShares.length);
        return m >= OPPORTUNITY_BOUNDS.minTopOptionShare && m <= OPPORTUNITY_BOUNDS.maxTopOptionShare;
      })(),
      threePointAttemptsInPreThreeEra: ["1950s", "1960s", "1970s"].includes(fixture.eraStyleId) ? threeAttempts : null,
    },
  };
};

/** Deterministic replay: the same fixture, seed and set must reproduce exactly. */
export const replayCheck = ({ fixture, byId, seedAt, parameterSet = null, trials = 3 }) => {
  const team = buildTeam(fixture, byId);
  const run = (i) => runPossessionGame({
    simulationId: "holdout-replay", simulationSeed: seedAt(i), mode: "single",
    eraStyleId: fixture.eraStyleId, parameterSet,
    defensiveMatchups: true, zoneResolution: true, expandedActions: true,
    offensiveAdjustments: true, opportunityAllocation: true, gold: team, blue: team,
  }, { includeLedger: false, assertInvariants: true });
  for (let i = 0; i < trials; i++) {
    const a = run(i); const b = run(i);
    if (a.finalScore.gold !== b.finalScore.gold || a.finalScore.blue !== b.finalScore.blue
      || JSON.stringify(a.gold.players) !== JSON.stringify(b.gold.players)) {
      return { exact: false, trials, failedAt: i };
    }
  }
  return { exact: true, trials };
};

/**
 * Identity traits, scored against a reference median computed from NON-holdout
 * fixtures and frozen before any holdout opened.
 *
 * A trait with no rubric entry is recorded and NOT scored. Inventing a rubric
 * after seeing the corpus would make the rubric a function of the result.
 */
export const scoreIdentity = ({ identityTargets, structural, reference }) => {
  const traits = (identityTargets ?? []).map((t) => {
    const rule = IDENTITY_RUBRIC[t.value];
    if (!rule || typeof rule !== "object") {
      return { trait: t.value, kind: t.kind, confidence: t.confidence, scored: false, reason: "no predeclared rubric entry" };
    }
    const observed = structural[rule.metric];
    const ref = reference?.[rule.metric];
    if (observed == null || ref == null) {
      return { trait: t.value, kind: t.kind, scored: false, reason: `metric ${rule.metric} unavailable (observed ${observed}, reference ${ref})` };
    }
    const pass = rule.direction === "ABOVE_CORPUS_MEDIAN" ? observed > ref : observed < ref;
    return { trait: t.value, kind: t.kind, confidence: t.confidence, scored: true,
      metric: rule.metric, direction: rule.direction, observed: r5(observed), referenceMedian: r5(ref), pass };
  });
  const scored = traits.filter((t) => t.scored);
  return {
    traits, traitsTotal: traits.length, traitsScored: scored.length,
    traitsUnscored: traits.length - scored.length,
    traitsPassed: scored.filter((t) => t.pass).length,
    allScoredPass: scored.every((t) => t.pass),
  };
};
