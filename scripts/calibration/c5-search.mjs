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
  // Candidate values come from the registry's own declared step grid, anchored
  // at the default so the default is always on-grid. The first version of this
  // search generated interior points and ignored `step`, which produced 44 of 44
  // off-grid candidates and an "accepted" value of 7.8 for a parameter whose
  // step is 1 and whose unit is a count of evidence events.
  gridAnchoredAtDefault: true,
  seedsPerFixture: 24,
  // Practical floor: a gain smaller than this is not worth a parameter change
  // regardless of its significance.
  minTuningImprovement: 0.0005,
  // ...and must not degrade validation by more than this, relative.
  maxValidationDegradation: 0.01,
  // Family-wise control across the ENTIRE candidate family. Without it, picking
  // the best of N candidates and comparing it to a fixed threshold is the same
  // statistical error as the max|t| >= 2.0 rule this project already retired:
  // the rule cannot see that N comparisons happened. The paired unit is
  // (fixture, seed) — identical fixture, identical seed, one parameter changed —
  // so the difference isolates the parameter from both roster and variance.
  familyWiseMethod: "holm-bonferroni",
  familyWiseAlpha: 0.05,
  pairedUnit: "(fixture, seed)",
  objective: "Tier C player scoring-share mean absolute error over the selected five, on historical calibration v3 fixtures",
  candidateZeroAlwaysCompetes: true,
  acceptanceRequires: ["PRACTICAL_FLOOR", "FAMILY_WISE_SIGNIFICANT", "VALIDATION_NOT_DEGRADED"],
});

/** On-grid candidate values: default +/- k*step, clamped to the movement cap. */
export const gridPoints = ({ defaultValue, step, lo, hi }) => {
  if (!(step > 0)) throw new Error("gridPoints: a declared step is required");
  const out = [];
  const dp = Math.max(0, -Math.floor(Math.log10(step)) + 3);
  for (let k = 1; ; k++) {
    const up = Number((defaultValue + k * step).toFixed(dp));
    const down = Number((defaultValue - k * step).toFixed(dp));
    const okUp = up <= hi + 1e-9;
    const okDown = down >= lo - 1e-9;
    if (!okUp && !okDown) break;
    if (okUp) out.push(up);
    if (okDown) out.push(down);
    if (k > 1000) break;
  }
  return out.sort((a, b) => a - b);
};

/** Paired t over the (fixture, seed) differences, and its two-sided p-value. */
export const pairedTest = (diffs) => {
  const n = diffs.length;
  if (n < 3) return { n, t: null, p: 1, mean: null };
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const varr = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(varr / n);
  if (!(se > 0)) return { n, t: null, p: 1, mean: r5(mean) };
  const t = mean / se;
  return { n, t: r5(t), p: twoSidedP(t, n - 1), mean: r5(mean) };
};

/** Student-t two-sided tail via the regularised incomplete beta function. */
const betacf = (a, b, x) => {
  const FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
};
const lgamma = (z) => {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const betai = (a, b, x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
};
export const twoSidedP = (t, df) => betai(df / 2, 0.5, df / (df + t * t));

/** Holm-Bonferroni step-down over the candidate family. */
export const holmBonferroni = (pvals, alpha) => {
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const m = pvals.length;
  const reject = new Array(m).fill(false);
  const adjusted = new Array(m).fill(1);
  let running = 0;
  for (const [rank, o] of order.entries()) {
    const adj = Math.min(1, Math.max(running, (m - rank) * o.p));
    running = adj;
    adjusted[o.i] = adj;
    reject[o.i] = adj <= alpha;
  }
  // Step-down: once a hypothesis fails, every larger p-value fails too.
  let failed = false;
  for (const o of order) {
    if (failed) reject[o.i] = false;
    else if (!reject[o.i]) failed = true;
  }
  return { reject, adjusted };
};

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
 * Returns the per-(fixture, seed) errors as well as the mean, because the
 * acceptance test is PAIRED: the same fixture on the same seed with one
 * parameter changed. Comparing two means would throw away the pairing and leave
 * the test fighting seed variance it does not need to fight.
 *
 * A fixture plays a MIRROR of itself: the same five on both sides. That isolates
 * the offensive share structure from opponent quality, which is what the Tier C
 * target describes — a season's internal distribution, not a matchup outcome.
 */
export const objectiveOn = (fixtures, set, seeds) => {
  let sum = 0; let n = 0;
  const perFixture = [];
  const cells = new Map();
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
      if (Number.isFinite(e)) { fSum += e; fN++; cells.set(`${fixture.fixtureId}#${i}`, e); }
    }
    if (fN) { perFixture.push({ fixtureId: fixture.fixtureId, mae: r5(fSum / fN), n: fN }); sum += fSum / fN; n++; }
  }
  return { mae: n ? r5(sum / n) : null, fixtures: n, perFixture, cells };
};

/** Paired differences over the cells the two runs share. */
export const pairedDiffs = (candidate, baseline) => {
  const out = [];
  for (const [k, v] of candidate.cells) {
    const b = baseline.cells.get(k);
    if (Number.isFinite(b)) out.push(v - b);
  }
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const seeds = Number(arg("seeds", SEARCH_POLICY.seedsPerFixture));

  const scope = readArtifact("calibration-scope").data;
  const eligible = scope.eligibleParameters;
  const reg = new Map(activeParameters().map((p) => [p.id, p]));
  const all = loadFixtures();
  const tuning = all.filter((f) => scope.folds.tuningFolds.includes(f.fold));
  const validation = all.filter((f) => scope.folds.validationFolds.includes(f.fold));

  console.log(`BOUNDED TARGETED SEARCH — ${eligible.length} eligible parameters`);
  console.log(`  objective: ${SEARCH_POLICY.objective}`);
  console.log(`  ${tuning.length} tuning fixtures (folds ${scope.folds.tuningFolds.join(",")}) · ${validation.length} validation fixtures (folds ${scope.folds.validationFolds.join(",")}) · ${seeds} seeds each`);
  console.log(`  acceptance: ${SEARCH_POLICY.acceptanceRequires.join(" AND ")}`);
  console.log(`  family-wise: ${SEARCH_POLICY.familyWiseMethod} at alpha ${SEARCH_POLICY.familyWiseAlpha}, paired on ${SEARCH_POLICY.pairedUnit}`);
  console.log(`  Candidate 0 (wired defaults) competes\n`);

  const def = defaultRuntimeParameterSet();
  const c0Train = objectiveOn(tuning, null, seeds);
  const c0Val = objectiveOn(validation, null, seeds);
  console.log(`  Candidate 0    tuning MAE ${c0Train.mae}   validation MAE ${c0Val.mae}   (${c0Train.cells.size} paired cells)\n`);

  // ── adjudicability probe ──────────────────────────────────────────────────
  // Before scanning, establish whether the objective can SEE each parameter at
  // all, by running its full registry range — deliberately far wider than the
  // movement cap the search itself is allowed to use. A parameter whose min and
  // max produce bit-identical objective cells cannot be adjudicated by this
  // objective, and reporting it as "tested and not significant" would be false:
  // it was not tested, it was invisible. This probe is diagnostic only; it never
  // proposes a candidate, because those values lie outside the frozen cap.
  console.log("  adjudicability probe (full registry range, diagnostic only):");
  const adjudicable = new Map();
  for (const p of eligible) {
    const r = reg.get(p.id);
    const lo = objectiveOn(tuning, compileRuntimeParameterSet({ overrides: { [p.id]: r.min }, label: "probe-lo" }), seeds);
    const hi = objectiveOn(tuning, compileRuntimeParameterSet({ overrides: { [p.id]: r.max }, label: "probe-hi" }), seeds);
    const diffs = pairedDiffs(hi, lo);
    const differing = diffs.filter((d) => Math.abs(d) > 1e-12).length;
    adjudicable.set(p.id, {
      registryMin: r.min, registryMax: r.max,
      cellsDiffering: differing, cellsTotal: diffs.length,
      maeAtMin: lo.mae, maeAtMax: hi.mae,
      objectiveAdjudicable: differing > 0,
    });
    console.log(`    ${p.id.padEnd(38)} ${differing}/${diffs.length} cells differ${differing === 0 ? "   <-- NOT ADJUDICABLE BY THIS OBJECTIVE" : ""}`);
  }
  const blind = [...adjudicable.entries()].filter(([, v]) => !v.objectiveAdjudicable).map(([k]) => k);
  console.log(`  ${eligible.length - blind.length} of ${eligible.length} parameters are visible to the objective\n`);

  // ── evaluate every on-grid candidate ──────────────────────────────────────
  const evaluated = [];
  for (const p of eligible) {
    const r = reg.get(p.id);
    const pts = gridPoints({ defaultValue: p.defaultValue, step: r.step, lo: p.searchBounds.lo, hi: p.searchBounds.hi });
    for (const v of pts) {
      const set = compileRuntimeParameterSet({ overrides: { [p.id]: v }, label: `cand` });
      const tr = objectiveOn(tuning, set, seeds);
      const va = objectiveOn(validation, set, seeds);
      const diffs = pairedDiffs(tr, c0Train);
      evaluated.push({
        param: p, value: v, step: r.step, set, tr, va,
        test: pairedTest(diffs),
        tuningGain: r5((c0Train.mae ?? 0) - (tr.mae ?? 0)),
        validationRelativeDelta: r5(c0Val.mae > 0 ? ((va.mae ?? 0) - (c0Val.mae ?? 0)) / c0Val.mae : 0),
      });
    }
    process.stdout.write(`\r  scanned ${eligible.indexOf(p) + 1}/${eligible.length} parameters, ${evaluated.length} on-grid candidates`);
  }

  // ── family-wise control across the WHOLE family ───────────────────────────
  // Every candidate that was looked at enters the family, including the ones
  // that got worse. Restricting the family to the promising ones is how a
  // multiplicity correction gets quietly defeated.
  const { reject, adjusted } = holmBonferroni(evaluated.map((e) => e.test.p), SEARCH_POLICY.familyWiseAlpha);

  const history = [{
    candidateId: "C0", label: "wired defaults", changes: [],
    parameterSetHash: def.parameterSetHash,
    tuningMae: c0Train.mae, validationMae: c0Val.mae,
    pairedCells: c0Train.cells.size,
    accepted: true, reason: "Candidate 0 is the incumbent and always competes.",
  }];

  let best = null;
  for (const [i, e] of evaluated.entries()) {
    // The paired test is two-sided; a significant result in the WRONG direction
    // is a significant worsening, not a pass.
    const improvesDirection = (e.test.mean ?? 0) < 0;
    const practical = e.tuningGain >= SEARCH_POLICY.minTuningImprovement;
    const significant = reject[i] && improvesDirection;
    const validates = e.validationRelativeDelta <= SEARCH_POLICY.maxValidationDegradation;
    const accepted = practical && significant && validates;
    const fails = [];
    if (!practical) fails.push(`practical floor (gain ${e.tuningGain} < ${SEARCH_POLICY.minTuningImprovement})`);
    if (!significant) fails.push(improvesDirection
      ? `family-wise significance (Holm-adjusted p ${r5(adjusted[i])} > ${SEARCH_POLICY.familyWiseAlpha} over a family of ${evaluated.length})`
      : `direction (the paired mean difference is ${e.test.mean}, a worsening)`);
    if (!validates) fails.push(`validation guard (relative delta ${e.validationRelativeDelta} > ${SEARCH_POLICY.maxValidationDegradation})`);

    history.push({
      candidateId: `C${i + 1}`, label: `${e.param.id}=${e.value}`,
      changes: [{ id: e.param.id, from: e.param.defaultValue, to: e.value, step: e.step,
        readiness: e.param.readiness, capFraction: e.param.movementCapFractionOfRange, onGrid: true }],
      parameterSetHash: e.set.parameterSetHash,
      tuningMae: e.tr.mae, validationMae: e.va.mae,
      tuningGain: e.tuningGain, validationRelativeDelta: e.validationRelativeDelta,
      pairedN: e.test.n, pairedMeanDiff: e.test.mean, t: e.test.t,
      rawP: e.test.p, holmAdjustedP: r5(adjusted[i]),
      practicalFloorMet: practical, familyWiseSignificant: significant, validationSafe: validates,
      objectiveAdjudicable: adjudicable.get(e.param.id).objectiveAdjudicable,
      accepted,
      reason: accepted
        ? `Gain ${e.tuningGain} clears the practical floor, Holm-adjusted p ${r5(adjusted[i])} clears alpha ${SEARCH_POLICY.familyWiseAlpha} over a family of ${evaluated.length}, and validation moved ${e.validationRelativeDelta} relative.`
        : `Rejected on ${fails.join("; ")}.`,
    });
    if (accepted && (best === null || e.tr.mae < best.tuningMae)) {
      best = { candidateId: `C${i + 1}`, tuningMae: e.tr.mae, validationMae: e.va.mae,
        changes: [{ id: e.param.id, from: e.param.defaultValue, to: e.value }], hash: e.set.parameterSetHash };
    }
  }

  const accepted = history.filter((h) => h.accepted && h.candidateId !== "C0");
  const winner = best ? best.candidateId : "C0";
  const rec = reconcile({
    label: "candidate-history",
    counts: { accepted: accepted.length, rejected: history.length - 1 - accepted.length },
    expectedTotal: history.length - 1,
  });

  // Diagnostics on the family, so the report can state how close anything came.
  const gains = evaluated.map((e) => e.tuningGain).sort((a, b) => b - a);
  const minAdjP = Math.min(...adjusted);

  const { path } = writeArtifact("candidate-history", {
    policy: SEARCH_POLICY,
    calibrationScopePayloadHash: readArtifact("calibration-scope").outputHash,
    supersedes: {
      artifact: "candidate-history-v1-superseded.json",
      reason: "The first run scanned off-grid values and applied no multiplicity correction. Both defects are recorded in that artifact. The correction is strictly stricter and was made after that result was seen.",
    },
    tuningFixtures: tuning.map((f) => f.fixture.fixtureId),
    validationFixtures: validation.map((f) => f.fixture.fixtureId),
    seedsPerFixture: seeds,
    candidateZero: { tuningMae: c0Train.mae, validationMae: c0Val.mae, pairedCells: c0Train.cells.size, perFixtureTuning: c0Train.perFixture },
    candidateCount: history.length,
    changedCandidates: history.length - 1,
    familySize: evaluated.length,
    acceptedCount: accepted.length,
    rejectedCount: history.length - 1 - accepted.length,
    familyDiagnostics: {
      bestRawGain: gains[0], worstRawGain: gains[gains.length - 1],
      bestHolmAdjustedP: r5(minAdjP),
      candidatesClearingPracticalFloor: evaluated.filter((e) => e.tuningGain >= SEARCH_POLICY.minTuningImprovement).length,
      candidatesFamilyWiseSignificant: reject.filter(Boolean).length,
    },
    adjudicability: {
      note: "Measured at the FULL registry range, wider than the search's own movement cap, so a zero here is not an artifact of a tight bound.",
      visibleToObjective: eligible.length - blind.length,
      blindToObjective: blind.length,
      blindParameters: blind,
      blindConsequence: "These parameters were NOT adjudicated by the search. They are locked at their defaults because no available authorized target can distinguish their values, not because a change was tested and rejected.",
      perParameter: Object.fromEntries(adjudicable),
    },
    winner, winnerChanges: best ? best.changes : [],
    outcome: winner === "C0" ? "CANDIDATE_ZERO_WINS_NO_CHANGE_ACCEPTED" : "CHANGED_CANDIDATE_ACCEPTED",
    reconciliation: rec,
    history,
  }, {
    generationCommand: "npm run calibration:c5:search",
    sourceArtifacts: ["data/calibration/c5/calibration-scope.json", "data/calibration/c5/no-effect-triage.json", "data/calibration/internal-folds-v3.json"],
    extra: { parameterSetHash: def.parameterSetHash, targetedCalibrationPolicyVersion: SEARCH_POLICY.version },
  });

  console.log(`\n\n  on-grid candidates     ${history.length - 1} + Candidate 0`);
  console.log(`  clearing practical     ${evaluated.filter((e) => e.tuningGain >= SEARCH_POLICY.minTuningImprovement).length}`);
  console.log(`  family-wise significant ${reject.filter(Boolean).length}`);
  console.log(`  accepted               ${accepted.length}`);
  console.log(`  rejected               ${history.length - 1 - accepted.length}`);
  console.log(`  best Holm-adjusted p   ${r5(minAdjP)} (alpha ${SEARCH_POLICY.familyWiseAlpha}, family of ${evaluated.length})`);
  console.log(`\n  WINNER: ${winner}${winner === "C0" ? "  (wired defaults — no on-grid change cleared all three gates)" : ""}`);
  if (winner !== "C0") for (const c of best.changes) console.log(`    ${c.id}: ${c.from} -> ${c.to}`);
  console.log(`  adjudicated            ${eligible.length - blind.length} of ${eligible.length} eligible parameters`);
  if (blind.length) console.log(`  NOT adjudicable        ${blind.join(", ")}`);
  console.log(`\n  reconciles: ${rec.reconciles}`);
  console.log(`\nwrote ${path}`);
  process.exit(rec.reconciles ? 0 : 2);
}
