#!/usr/bin/env node
// ── Bounded targeted calibration search ─────────────────────────────────────
// Deterministic one-at-a-time scan over the eligible parameters, judged against
// authorized historical Tier C player-share targets on leak-free folds.
//
//   npm run calibration:c5:search
//
// Candidate 0 is the wired default set, and it competes. A changed candidate
// wins only by beating it on the tuning folds WITHOUT degrading the validation
// folds beyond the frozen tolerance. "No change accepted" is a real result, not
// a failure to try.
//
// The objective is historical: mean absolute error between the engine's realised
// player scoring shares and the Tier C season-share proxies, over the selected
// five, on historical calibration v3 fixtures. Tier C is the one authorized
// numeric target this corpus actually carries — 132 share maps across 30
// fixtures — so it is the only thing here that can adjudicate a parameter value
// against history rather than against the engine's own behaviour.
//
// No holdout fixture is used.
import { readFileSync } from "node:fs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { compileRuntimeParameterSet, defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";
import { loadPlayers } from "./build-players-v3.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS } from "../../data/calibration/sets-v3.mjs";
import { writeArtifact, readArtifact, reconcile } from "../../src/v3/calibration/artifacts.js";
import { versionOf } from "../../src/versions.js";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const seedAt = (i) => domainSeed(MASTERS["actual-game"], "actual-game", 150000 + i);

// ── Frozen search policy ────────────────────────────────────────────────────
export const SEARCH_POLICY = Object.freeze({
  version: versionOf("targetedCalibrationPolicyVersion"),
  scanPointsPerParameter: 4,
  seedsPerFixture: 24,
  // A candidate must improve the tuning objective by at least this much to be
  // worth considering. Below it, the difference is noise dressed as progress.
  minTuningImprovement: 0.0005,
  // ...and must not degrade validation by more than this, relative.
  maxValidationDegradation: 0.01,
  // Movement beyond a parameter's readiness cap is rejected before it is run.
  regularizationWeight: 0.25,
  objective: "Tier C player scoring-share mean absolute error over the selected five, on historical calibration v3 fixtures",
  candidateZeroAlwaysCompetes: true,
});

const buildTeam = (fixture, byId) => {
  const profiles = fixture.players.map((p) => buildCalibrationPlayerProfile(byId.get(p.calibrationPlayerId)));
  const playerCards = profiles.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0, an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
  const positionAssignments = fixture.players.map((p) => p.assignedPosition);
  return { playerCards, playerIntelligence: profiles,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profiles, positionAssignments, ctx: {} }),
    coachId: fixture.coachId, coachIntelligence: buildCoachIntelligence(fixture.coachId), positionAssignments };
};

/**
 * Realised scoring shares over the selected five, matched to the Tier C target.
 *
 * The target is a SELECTED_FIVE_SEASON_SHARE_PROXY: shares normalised across the
 * five, not across a real roster. The realised shares are normalised the same
 * way, or the comparison would measure the normalisation rather than the engine.
 */
const shareError = (game, target, fixture) => {
  const ids = fixture.players.map((p) => p.calibrationPlayerId);
  const byCard = new Map(game.gold.players.map((p) => [p.cardId, p.pts]));
  const pts = ids.map((id) => byCard.get(id) ?? 0);
  const total = pts.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let err = 0; let n = 0;
  for (const [i, id] of ids.entries()) {
    const t = target[id];
    if (!Number.isFinite(t)) continue;
    err += Math.abs(pts[i] / total - t);
    n++;
  }
  return n ? err / n : null;
};

export const loadFixtures = () => {
  const corpus = loadCorpusV3();
  const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
  const byId = new Map(loadPlayers().profiles.map((p) => [p.calibrationPlayerId, p]));
  const folds = JSON.parse(readFileSync("data/calibration/internal-folds-v3.json", "utf8"));
  const targetById = new Map(targets.records.map((r) => [r.fixtureId, r.unitTargets?.playerScoringShares ?? null]));

  const out = [];
  for (const f of corpus.fixtures) {
    if (HISTORICAL_HOLDOUT_V3_IDS.includes(f.fixtureId)) continue;  // sealed
    const t = targetById.get(f.fixtureId);
    if (!t || !Object.keys(t).length) continue;
    const fold = folds.assignments[f.fixtureId];
    if (fold === undefined) continue;
    out.push({ fixture: f, target: t, fold, team: buildTeam(f, byId) });
  }
  return out;
};

/**
 * Objective on one fold group.
 *
 * A fixture plays a MIRROR of itself: the same five on both sides. That isolates
 * the offensive share structure from opponent quality, which is what the Tier C
 * target describes — a season's internal distribution, not a matchup outcome.
 */
export const objectiveOn = (fixtures, set, seeds) => {
  let sum = 0; let n = 0;
  const perFixture = [];
  for (const { fixture, target, team } of fixtures) {
    let fSum = 0; let fN = 0;
    for (let i = 0; i < seeds; i++) {
      const g = runPossessionGame({
        simulationId: "c5-search", simulationSeed: seedAt(i), mode: "single",
        eraStyleId: fixture.eraStyleId, parameterSet: set,
        defensiveMatchups: true, zoneResolution: true, expandedActions: true,
        offensiveAdjustments: true, opportunityAllocation: true,
        gold: team, blue: team,
      }, { includeLedger: false, assertInvariants: false });
      const e = shareError(g, target, fixture);
      if (Number.isFinite(e)) { fSum += e; fN++; }
    }
    if (fN) { perFixture.push({ fixtureId: fixture.fixtureId, mae: r5(fSum / fN), n: fN }); sum += fSum / fN; n++; }
  }
  return { mae: n ? r5(sum / n) : null, fixtures: n, perFixture };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("seeds", SEARCH_POLICY.seedsPerFixture));

  const triage = readArtifact("no-effect-triage");
  const eligible = triage.data.parameters.filter((p) => p.eligibleForSearch);
  const all = loadFixtures();
  // Folds 0 and 2 tune; 1 and 3 validate. Fixed, not chosen by result.
  const tuning = all.filter((f) => f.fold === 0 || f.fold === 2);
  const validation = all.filter((f) => f.fold === 1 || f.fold === 3);

  console.log(`BOUNDED TARGETED SEARCH — ${eligible.length} eligible parameters`);
  console.log(`  objective: ${SEARCH_POLICY.objective}`);
  console.log(`  ${tuning.length} tuning fixtures (folds 0,2) · ${validation.length} validation fixtures (folds 1,3) · ${seeds} seeds each`);
  console.log(`  Candidate 0 (wired defaults) competes\n`);

  const def = defaultRuntimeParameterSet();
  const c0Train = objectiveOn(tuning, null, seeds);
  const c0Val = objectiveOn(validation, null, seeds);
  console.log(`  Candidate 0    tuning MAE ${c0Train.mae}   validation MAE ${c0Val.mae}\n`);

  const history = [{
    candidateId: "C0", label: "wired defaults", changes: [],
    parameterSetHash: def.parameterSetHash,
    tuningMae: c0Train.mae, validationMae: c0Val.mae,
    accepted: true, reason: "Candidate 0 is the incumbent and always competes.",
  }];

  let best = { candidateId: "C0", tuningMae: c0Train.mae, validationMae: c0Val.mae, changes: [], hash: def.parameterSetHash };
  let nextId = 1;

  for (const p of eligible) {
    const { lo, hi } = p.searchBounds;
    const points = Array.from({ length: SEARCH_POLICY.scanPointsPerParameter }, (_, i) =>
      lo + ((hi - lo) * (i + 1)) / (SEARCH_POLICY.scanPointsPerParameter + 1))
      .filter((v) => Math.abs(v - p.defaultValue) > 1e-12);
    for (const v of points) {
      const set = compileRuntimeParameterSet({ overrides: { [p.id]: v }, label: `C${nextId}` });
      const tr = objectiveOn(tuning, set, seeds);
      const va = objectiveOn(validation, set, seeds);
      const tuningGain = (c0Train.mae ?? 0) - (tr.mae ?? 0);
      const valDelta = (va.mae ?? 0) - (c0Val.mae ?? 0);
      const valRelative = c0Val.mae > 0 ? valDelta / c0Val.mae : 0;
      const improves = tuningGain >= SEARCH_POLICY.minTuningImprovement;
      const validates = valRelative <= SEARCH_POLICY.maxValidationDegradation;
      const accepted = improves && validates;
      history.push({
        candidateId: `C${nextId}`, label: `${p.id}=${r5(v)}`,
        changes: [{ id: p.id, from: p.defaultValue, to: r5(v), readiness: p.readinessV3, capFraction: p.movementCapFractionOfRange }],
        parameterSetHash: set.parameterSetHash,
        tuningMae: tr.mae, validationMae: va.mae,
        tuningGain: r5(tuningGain), validationRelativeDelta: r5(valRelative),
        accepted,
        reason: accepted
          ? `Tuning MAE improves by ${r5(tuningGain)} and validation degrades by ${r5(valRelative)} relative, within the ${SEARCH_POLICY.maxValidationDegradation} tolerance.`
          : !improves
            ? `Tuning MAE gain ${r5(tuningGain)} is below the ${SEARCH_POLICY.minTuningImprovement} minimum — noise, not progress.`
            : `Tuning improves by ${r5(tuningGain)} but validation degrades by ${r5(valRelative)} relative, beyond the ${SEARCH_POLICY.maxValidationDegradation} tolerance. Overfit to the tuning folds.`,
      });
      if (accepted && (tr.mae ?? Infinity) < (best.tuningMae ?? Infinity)) {
        best = { candidateId: `C${nextId}`, tuningMae: tr.mae, validationMae: va.mae,
          changes: [{ id: p.id, from: p.defaultValue, to: r5(v) }], hash: set.parameterSetHash };
      }
      nextId++;
    }
    process.stdout.write(`\r  scanned ${eligible.indexOf(p) + 1}/${eligible.length} parameters, ${history.length - 1} candidates`);
  }

  const accepted = history.filter((h) => h.accepted && h.candidateId !== "C0");
  const winner = best.candidateId;
  const rec = reconcile({
    label: "candidate-history",
    counts: { accepted: accepted.length, rejected: history.length - 1 - accepted.length },
    expectedTotal: history.length - 1,
  });

  const { path } = writeArtifact("candidate-history", {
    policy: SEARCH_POLICY,
    tuningFixtures: tuning.map((f) => f.fixture.fixtureId),
    validationFixtures: validation.map((f) => f.fixture.fixtureId),
    seedsPerFixture: seeds,
    candidateZero: { tuningMae: c0Train.mae, validationMae: c0Val.mae, perFixtureTuning: c0Train.perFixture },
    candidateCount: history.length,
    changedCandidates: history.length - 1,
    acceptedCount: accepted.length,
    rejectedCount: history.length - 1 - accepted.length,
    winner, winnerChanges: best.changes,
    reconciliation: rec,
    history,
  }, {
    generationCommand: "npm run calibration:c5:search",
    sourceArtifacts: ["data/calibration/c5/no-effect-triage.json", "data/calibration/internal-folds-v3.json"],
    extra: { parameterSetHash: def.parameterSetHash, targetedCalibrationPolicyVersion: SEARCH_POLICY.version },
  });

  console.log(`\n\n  candidates evaluated   ${history.length - 1} changed + Candidate 0`);
  console.log(`  accepted               ${accepted.length}`);
  console.log(`  rejected               ${history.length - 1 - accepted.length}`);
  console.log(`\n  WINNER: ${winner}${winner === "C0" ? "  (wired defaults — no supported change beat them)" : ""}`);
  if (winner !== "C0") for (const c of best.changes) console.log(`    ${c.id}: ${c.from} -> ${c.to}`);
  console.log(`\n  reconciles: ${rec.reconciles}`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles ? 0 : 2);
}
