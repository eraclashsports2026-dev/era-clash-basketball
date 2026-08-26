// ── V4 matchup evaluation ───────────────────────────────────────────────────
// One implementation shared by the internal baseline, the dry run and the V4
// holdout runner. Protocol per matchup: A vs B, A vs era-reference, B vs
// era-reference — side-balanced paired orientations on every surface. Offence
// is read from the team's own side of team-vs-reference games; defence from the
// reference's output in the same games; nothing offence/defence is ever read
// from a mirror, which is the defect that consumed V3.
import { readFileSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { playPairedSamples, summarise, diffSummary, METRICS } from "./surface.mjs";
import { referenceTeam } from "./eraReferences.mjs";
import { TRAIT_TABLE } from "./traitRegistry.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
export const SHARE_METRICS = Object.freeze({
  playerScoringShares: (p) => p.pts, playerReboundShares: (p) => p.reb,
  playerAssistShares: (p) => p.ast, playerStealShares: (p) => p.stl, playerBlockShares: (p) => p.blk,
});
const PRE_THREE = new Set(["1950s", "1960s", "1970s"]);

export const teamFromFixture = (fixture, profiles) => {
  const profs = fixture.players.map((p) => buildCalibrationPlayerProfile(profiles.get(p.calibrationPlayerId)));
  const playerCards = profs.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0, an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
  const positionAssignments = fixture.players.map((p) => p.assignedPosition);
  return { playerCards, playerIntelligence: profs,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profs, positionAssignments, ctx: {} }),
    coachId: fixture.coachId, coachIntelligence: buildCoachIntelligence(fixture.coachId), positionAssignments };
};

/** Five-share MAE for one team over its team-vs-reference games. */
export const shareMae = ({ fixture, target, profiles, games }) => {
  const ids = fixture.players.map((p) => p.calibrationPlayerId);
  const totals = Object.fromEntries(Object.keys(SHARE_METRICS).map((k) => [k, ids.map(() => 0)]));
  for (const g of games) {
    const byCard = new Map(g.players.map((p) => [p.cardId, p]));
    for (const [metric, pick] of Object.entries(SHARE_METRICS)) {
      for (const [k, id] of ids.entries()) totals[metric][k] += pick(byCard.get(id) ?? {}) ?? 0;
    }
  }
  const out = {}; const maes = [];
  for (const metric of Object.keys(SHARE_METRICS)) {
    const t = target?.unitTargets?.[metric];
    if (!t || !Object.keys(t).length) { out[metric] = { supported: false, reason: "no target map", mae: null }; continue; }
    const sum = totals[metric].reduce((a, b) => a + b, 0);
    if (!(sum > 0)) { out[metric] = { supported: false, reason: "engine produced none of this statistic", mae: null }; continue; }
    let err = 0; let n = 0; const per = [];
    for (const [k, id] of ids.entries()) {
      const tv = t[id];
      if (!Number.isFinite(tv)) { per.push({ id, target: null, excluded: true }); continue; }
      const rv = totals[metric][k] / sum;
      per.push({ id, target: r5(tv), realised: r5(rv), absoluteError: r5(Math.abs(rv - tv)) });
      err += Math.abs(rv - tv); n++;
    }
    out[metric] = { supported: n > 0, playersScored: n, mae: n ? r5(err / n) : null, perPlayer: per };
    if (n) maes.push(err / n);
  }
  return { shareResults: out, compositeMae: maes.length ? r5(maes.reduce((a, b) => a + b, 0) / maes.length) : null,
    supportedShareMetrics: Object.entries(out).filter(([, s]) => s.supported).map(([k]) => k) };
};

/**
 * Play one surface, returning per-game metric samples for the SUBJECT plus the
 * subject-side box lines needed for share targets, plus a replay check.
 */
export const playSurface = ({ subject, opponent, eraStyleId, seedAt, pairs }) => {
  const samples = []; const subjectBoxes = [];
  let violations = 0; let ties = 0; let impossible = 0; let preThreeAttempts = 0;
  const record = (g, side) => {
    const s = gameSampleFrom(g, side);
    samples.push(s);
    violations += s.invariantViolations; ties += s.tie;
    for (const v of [g.finalScore.gold, g.finalScore.blue]) if (v < 20 || v > 220) impossible++;
    if (PRE_THREE.has(eraStyleId)) preThreeAttempts += g[side].totals.tpa;
    subjectBoxes.push({ players: g[side].players });
  };
  for (let i = 0; i < pairs; i++) {
    const seed = seedAt(i);
    const base = { simulationId: "v4-eval", simulationSeed: seed, mode: "single", eraStyleId,
      parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
      offensiveAdjustments: true, opportunityAllocation: true };
    record(runPossessionGame({ ...base, gold: subject, blue: opponent }, { includeLedger: true, assertInvariants: false }), "gold");
    record(runPossessionGame({ ...base, gold: opponent, blue: subject }, { includeLedger: true, assertInvariants: false }), "blue");
  }
  // deterministic replay: repeat the first pair and require byte identity
  const g1 = runPossessionGame({ simulationId: "v4-eval", simulationSeed: seedAt(0), mode: "single", eraStyleId,
    parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
    offensiveAdjustments: true, opportunityAllocation: true, gold: subject, blue: opponent }, { includeLedger: false, assertInvariants: true });
  const g2 = runPossessionGame({ simulationId: "v4-eval", simulationSeed: seedAt(0), mode: "single", eraStyleId,
    parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
    offensiveAdjustments: true, opportunityAllocation: true, gold: subject, blue: opponent }, { includeLedger: false, assertInvariants: true });
  const replayExact = g1.finalScore.gold === g2.finalScore.gold && g1.finalScore.blue === g2.finalScore.blue
    && JSON.stringify(g1.gold.players) === JSON.stringify(g2.gold.players);
  return { samples, subjectBoxes, invariantViolations: violations, ties, impossible, preThreeAttempts, replayExact, games: samples.length };
};

import { gameSample as gameSampleFrom } from "./surface.mjs";

/** Score one trait for one team from the frozen registry and reference baselines. */
export const scoreTrait = ({ traitId, vsRefSamples, refBaselines, eraStyleId }) => {
  const t = TRAIT_TABLE[traitId];
  if (!t || !t.claim) return { traitId, result: "NOT_APPLICABLE", reason: "no directional claim" };
  const metric = METRICS[t.claim.metric];
  if (PRE_THREE.has(eraStyleId) && (t.ctx ?? []).includes("ERA_HAS_THREE_POINT_LINE")) {
    return { traitId, result: "NOT_APPLICABLE", reason: "era has no three-point line" };
  }
  const subject = summarise(vsRefSamples, metric.field);
  const baseline = refBaselines[t.claim.metric];
  const d = diffSummary(subject, baseline);
  if (!d) return { traitId, result: "NOT_APPLICABLE", reason: "metric unavailable" };
  const dir = t.claim.direction === "ABOVE_REFERENCE_BASELINE" ? 1 : -1;
  const pass = Math.sign(d.diff) === dir;
  const hardFail = !pass && d.significant;
  return { traitId, metric: t.claim.metric, direction: t.claim.direction,
    surface: metric.identifiableOn[0],
    subjectMean: subject.mean, referenceMean: baseline.mean,
    diff: d.diff, z: d.z, ci95: d.ci95,
    result: pass ? "PASS" : "FAIL", hardFail };
};
