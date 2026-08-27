#!/usr/bin/env node
// ── WS3: the Synthetic V2 practical margins and derived thresholds ──────────
//   npm run syn:margins
//
// A significance test at 2,048 games will call almost any difference real, so
// every gate here is DUAL: a frozen or derived threshold, and a practical
// margin the observation must clear before it decides anything. Phase 6C4A
// established why — four of Historical V4's twelve hard failures were
// sub-margin artifacts, and the margin policy is what withdrew them.
//
// Every number below is DERIVED by a rule stated before the numbers, from
// non-holdout evidence only: the 14 development fixtures run through the exact
// formal surfaces at the frozen volumes, plus the role-matched upgrade ladder.
// No Synthetic V2 observation exists yet and none is used.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { CONTROL_TARGETS } from "./surfaces.mjs";
import { DIR } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const floorTo = (step, x) => Math.floor(x / step) * step;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** Rule 1: the practical margin. Stated before any number is computed. */
export const MARGIN_RULE = "margin = max(3 x the largest standard error observed for that metric on the development surfaces, a predeclared domain floor). The three-sigma term keeps sampling noise from deciding a verdict; the domain floor keeps a very precise measurement from making a trivially small difference decisive.";
/** Rule 2: a derived floor. */
export const FLOOR_RULE = "floor = the largest step-multiple at or below (smallest development observation - 3 x largest standard error - the practical margin). So the weakest legitimate construction observed on a non-holdout fixture still clears the floor by the full margin, and a FAIL requires a genuine collapse rather than an unlucky sample.";
/** Predeclared domain floors: the smallest difference that means anything. */
export const DOMAIN_FLOORS = Object.freeze({
  maxActionFamilyShare: 0.01,          // one percentage point of possession share
  shellSideWinRate: 0.02,              // two percentage points of win rate
  combinedScoreSd: 0.5,                // half a point of combined-score spread
  coherentLowerControlWinRate: 0.02,
  roleMatchedUpgradeWinRate: 0.02,
});

export const derive = () => {
  const ev = readArtifact("synthetic-v2-margin-evidence", DIR).data;
  const ladderArt = readArtifact("synthetic-v2-talent-gap-ladder", DIR);
  const ladder = ladderArt.data;
  const g = HOLDOUT.syntheticGuardrails;

  const marginOf = (metric, maxSe) => r5(Math.max(3 * maxSe, DOMAIN_FLOORS[metric]));
  const seOf = (stat) => stat?.max ?? null;

  // ── margins ─────────────────────────────────────────────────────────────
  const margins = {
    maxActionFamilyShare: { maxObservedSe: seOf(ev.summary.maxActionFamilyShareSe),
      margin: marginOf("maxActionFamilyShare", seOf(ev.summary.maxActionFamilyShareSe)),
      binding: 3 * seOf(ev.summary.maxActionFamilyShareSe) > DOMAIN_FLOORS.maxActionFamilyShare ? "THREE_SIGMA" : "DOMAIN_FLOOR" },
    shellSideWinRate: { maxObservedSe: seOf(ev.summary.shellSideWinRateSe),
      margin: marginOf("shellSideWinRate", seOf(ev.summary.shellSideWinRateSe)),
      binding: 3 * seOf(ev.summary.shellSideWinRateSe) > DOMAIN_FLOORS.shellSideWinRate ? "THREE_SIGMA" : "DOMAIN_FLOOR" },
    combinedScoreSd: { maxObservedSe: seOf(ev.summary.combinedScoreSdSe),
      margin: marginOf("combinedScoreSd", seOf(ev.summary.combinedScoreSdSe)),
      binding: 3 * seOf(ev.summary.combinedScoreSdSe) > DOMAIN_FLOORS.combinedScoreSd ? "THREE_SIGMA" : "DOMAIN_FLOOR" },
    coherentLowerControlWinRate: { maxObservedSe: seOf(ev.summary.coherentLowerControlWinRateSe),
      margin: marginOf("coherentLowerControlWinRate", seOf(ev.summary.coherentLowerControlWinRateSe)),
      binding: 3 * seOf(ev.summary.coherentLowerControlWinRateSe) > DOMAIN_FLOORS.coherentLowerControlWinRate ? "THREE_SIGMA" : "DOMAIN_FLOOR" },
    roleMatchedUpgradeWinRate: { maxObservedSe: r5(ladder.summary.maxSe),
      margin: marginOf("roleMatchedUpgradeWinRate", ladder.summary.maxSe),
      binding: 3 * ladder.summary.maxSe > DOMAIN_FLOORS.roleMatchedUpgradeWinRate ? "THREE_SIGMA" : "DOMAIN_FLOOR" },
  };

  // ── derived thresholds ──────────────────────────────────────────────────
  // Variance floor. No frozen number exists for requireNewSeedVariance, so it
  // is derived. The distinct-scoreline ratio is deliberately NOT the adjudicated
  // metric: measured at 102 games it read 0.486 and at 2,048 games 0.356-0.399
  // on the same fixtures, so one frozen floor cannot serve both the mirror and
  // the tail-extension volumes. The combined-score standard deviation is a
  // property of the distribution rather than of the sample size.
  const sdMin = ev.summary.combinedScoreSd.min;
  const sdFloor = r5(Math.max(0, floorTo(0.5, sdMin - 3 * margins.combinedScoreSd.maxObservedSe - margins.combinedScoreSd.margin)));

  // Construction floor. Every development observation on the surface, excluding
  // any whose control failed the strictly-lower precondition.
  const ctlRates = ev.fixtures.map((f) => f.vsCoherentLowerControl)
    .filter((x) => x && x.controlWinRate != null && x.ratingRatio != null && x.ratingRatio < 1)
    .map((x) => x.controlWinRate);
  const ctlExcluded = ev.fixtures.filter((f) => f.vsCoherentLowerControl?.ratingRatio != null
    && f.vsCoherentLowerControl.ratingRatio >= 1)
    .map((f) => ({ fixture: f.devFixtureId, ratingRatio: f.vsCoherentLowerControl.ratingRatio,
      why: "its coherent control is not strictly lower-rated, so a win there is talent rather than construction" }));
  const ctlFloor = r5(Math.max(0, floorTo(0.005, Math.min(...ctlRates) - 3 * margins.coherentLowerControlWinRate.maxObservedSe - margins.coherentLowerControlWinRate.margin)));
  const ctlExistential = r5(floorTo(0.05, median(ctlRates)));

  // Talent floor. Only ladder cells that meet the frozen upgrade precondition
  // count: an upgrade too small to be a talent gap cannot calibrate one.
  const qualifying = ladder.cells.filter((c) => c.achievedRatio >= CONTROL_TARGETS.minUpgradeTeamRatingRatio);
  const disqualified = ladder.cells.filter((c) => c.achievedRatio < CONTROL_TARGETS.minUpgradeTeamRatingRatio)
    .map((c) => ({ fixture: c.devFixtureId, achievedRatio: c.achievedRatio, winRate: c.strongerSideWinRate,
      slotsUpgraded: c.slotsUpgraded,
      why: `its upgrade reaches only ${c.achievedRatio}x teamRating, below the ${CONTROL_TARGETS.minUpgradeTeamRatingRatio}x precondition, so it is not a talent gap` }));
  const qMin = Math.min(...qualifying.map((c) => c.strongerSideWinRate));
  const talentRaw = qMin - 3 * margins.roleMatchedUpgradeWinRate.maxObservedSe - margins.roleMatchedUpgradeWinRate.margin;
  const talentFloor = r5(Math.max(0.5, floorTo(0.005, talentRaw)));
  const talentClamped = talentRaw < 0.5;

  return {
    frozenThresholds: {
      maxSingleActionFamilyShare: g.maxSingleActionFamilyShare,
      maxSingleShellWinRate: g.maxSingleShellWinRate,
      minSingleShellWinRate: g.minSingleShellWinRate,
      minGamesPerHoldoutFixture: HOLDOUT.minGamesPerHoldoutFixture,
      source: "HOLDOUT.syntheticGuardrails — unchanged, and not derivable from evidence because they are frozen",
      acceptancePolicyHash: acceptancePolicyHash(),
    },
    derivedThresholds: {
      minCombinedScoreSd: { value: sdFloor, step: 0.5,
        evidence: { developmentMin: sdMin, developmentMax: ev.summary.combinedScoreSd.max,
          developmentMean: ev.summary.combinedScoreSd.mean, maxSe: margins.combinedScoreSd.maxObservedSe, n: ev.summary.combinedScoreSd.n },
        interpretation: `a FAIL needs the combined-score spread to fall to ${r5(sdFloor - margins.combinedScoreSd.margin)} or below, about ${Math.round((1 - (sdFloor - margins.combinedScoreSd.margin) / sdMin) * 100)}% below the weakest development observation — a collapse toward determinism, not an unlucky sample` },
      constructionWinRateFloor: { value: ctlFloor, step: 0.005,
        evidence: { n: ctlRates.length, min: r5(Math.min(...ctlRates)), max: r5(Math.max(...ctlRates)),
          median: r5(median(ctlRates)), maxSe: margins.coherentLowerControlWinRate.maxObservedSe },
        excludedObservations: ctlExcluded,
        interpretation: "a weak floor by construction. The evidence does not support a strong one: on non-holdout fixtures a coherent control at 80% of the fixture's teamRating won between the min and max above, a spread driven by WHICH construction it faced, which is the thing the guardrail is about. A floor high enough to be demanding would fail legitimate constructions.",
        whyWeakIsStillMeaningful: "the guardrail says construction CAN beat higher rating. The per-fixture floor establishes that construction is not literally irrelevant anywhere; the set-level existential bar below carries the substantive claim." },
      constructionExistentialBar: { value: ctlExistential, step: 0.05,
        rule: "the development median, rounded down to the nearest 0.05: half of non-holdout constructions clear it",
        appliesTo: "the SET, not a fixture. At least one applicable fixture must show the coherent lower-rated control winning at least this share, or requireConstructionCanBeatHigherOvr has not been demonstrated at all.",
        evidence: { developmentMedian: r5(median(ctlRates)), developmentAboveBar: ctlRates.filter((x) => x >= ctlExistential).length, n: ctlRates.length } },
      talentWinRateFloor: { value: talentFloor, step: 0.005, clampedAtOneHalf: talentClamped,
        rawDerivedValue: r5(talentRaw),
        evidence: { qualifyingCells: qualifying.length, min: r5(qMin),
          max: r5(Math.max(...qualifying.map((c) => c.strongerSideWinRate))),
          mean: r5(qualifying.reduce((a, c) => a + c.strongerSideWinRate, 0) / qualifying.length),
          maxSe: margins.roleMatchedUpgradeWinRate.maxObservedSe },
        disqualifiedCells: disqualified,
        interpretation: talentClamped
          ? `the rule derived ${r5(talentRaw)}, below one half, which would say a substantially upgraded five is allowed to LOSE. That is vacuous, so the floor is clamped to 0.5 and a FAIL requires the upgraded side to win ${r5(0.5 - margins.roleMatchedUpgradeWinRate.margin)} or less — talent inverted, not merely talent weak.`
          : `derived directly from the qualifying ladder cells`,
        noCeiling: "requireConstructionCanBeatHigherOvr is the guardrail that forbids talent from being absolute, and requireNewSeedVariance forbids a degenerate deterministic outcome. A ceiling here would double-count one failure." },
      distinctScorelineRatioFloorByGames: {
        note: "REPORTED, NEVER ADJUDICATED. Measured on the same fixtures the ratio read about 0.486 at 102 games and 0.356 to 0.399 at 2,048, so a single frozen floor is not comparable across the mirror and tail-extension volumes. Recorded per volume for diagnosis only.",
        [String(ev.volumes.MIRROR * 2)]: r5(floorTo(0.005, ev.summary.distinctScorelineRatio.min - 3 * ev.summary.distinctScorelineRatioSe.max)),
      },
    },
    margins,
    evidenceHashes: { marginEvidence: ev.evidenceHash, talentGapLadder: ladder.ladderHash },
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-practical-margins", DIR) && !process.argv.includes("--refreeze")) {
    console.log("margins already exist — pass --refreeze to re-issue them."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const d = derive();

  console.log("SYNTHETIC V2 PRACTICAL MARGINS AND DERIVED THRESHOLDS\n");
  console.log("  FROZEN (unchanged, from the acceptance policy):");
  for (const [k, v] of Object.entries(d.frozenThresholds)) {
    if (typeof v === "number") console.log(`    ${k.padEnd(32)} ${v}`);
  }
  console.log("\n  PRACTICAL MARGINS (rule: max(3 x largest observed SE, domain floor)):");
  for (const [k, v] of Object.entries(d.margins)) {
    console.log(`    ${k.padEnd(32)} ${String(v.margin).padEnd(9)} maxSE ${String(v.maxObservedSe).padEnd(9)} 3sigma ${String(r5(3 * v.maxObservedSe)).padEnd(9)} floor ${String(DOMAIN_FLOORS[k]).padEnd(6)} binding ${v.binding}`);
  }
  console.log("\n  DERIVED THRESHOLDS:");
  for (const [k, v] of Object.entries(d.derivedThresholds)) {
    if (v.value != null) console.log(`    ${k.padEnd(32)} ${v.value}${v.clampedAtOneHalf ? "  (clamped from " + v.rawDerivedValue + ")" : ""}`);
  }

  const m = d.margins; const t = d.derivedThresholds;
  gate("everyMarginIsPositiveAndRuleDerived",
    Object.values(m).every((x) => x.margin > 0 && x.maxObservedSe != null),
    `${Object.keys(m).length} margins, each the larger of three sigma and a predeclared domain floor`);
  gate("everyMarginCoversThreeSigma",
    Object.entries(m).every(([k, x]) => x.margin >= 3 * x.maxObservedSe - 1e-9),
    "no margin is smaller than three standard errors of its own metric");
  gate("noFrozenThresholdChanged",
    d.frozenThresholds.maxSingleActionFamilyShare === HOLDOUT.syntheticGuardrails.maxSingleActionFamilyShare
    && d.frozenThresholds.maxSingleShellWinRate === HOLDOUT.syntheticGuardrails.maxSingleShellWinRate
    && d.frozenThresholds.minSingleShellWinRate === HOLDOUT.syntheticGuardrails.minSingleShellWinRate,
    "the three frozen numeric thresholds are carried through unchanged; only the new thresholds are derived");
  gate("everyDerivedThresholdClearsTheWeakestDevelopmentObservation",
    t.minCombinedScoreSd.value + m.combinedScoreSd.margin < t.minCombinedScoreSd.evidence.developmentMin
    && t.constructionWinRateFloor.value + m.coherentLowerControlWinRate.margin < t.constructionWinRateFloor.evidence.min
    && t.talentWinRateFloor.value + m.roleMatchedUpgradeWinRate.margin < t.talentWinRateFloor.evidence.min,
    "on every derived threshold, the weakest legitimate development observation passes with the full margin to spare, so no gate would fail the current engine on non-holdout evidence");
  gate("actionShareCeilingHasRealHeadroom",
    d.frozenThresholds.maxSingleActionFamilyShare - m.maxActionFamilyShare.margin > 0.4,
    `frozen ceiling ${d.frozenThresholds.maxSingleActionFamilyShare}, largest development observation ${readArtifact("synthetic-v2-margin-evidence", DIR).data.summary.maxActionFamilyShare.max} — the gate is not near the operating point`);
  gate("shellBandHasRealHeadroom",
    (() => { const ev = readArtifact("synthetic-v2-margin-evidence", DIR).data.summary.shellSideWinRate;
      return ev.min > d.frozenThresholds.minSingleShellWinRate + m.shellSideWinRate.margin
        && ev.max < d.frozenThresholds.maxSingleShellWinRate - m.shellSideWinRate.margin; })(),
    `development shell win rates sit inside the frozen band with the margin to spare`);
  gate("theWeakFloorIsDeclaredWeak",
    t.constructionWinRateFloor.interpretation.includes("weak floor") && Boolean(t.constructionExistentialBar.value),
    "the construction floor is recorded as weak, with the reason and the set-level existential bar that carries the substantive claim");
  gate("theClampIsRecordedNotHidden",
    t.talentWinRateFloor.clampedAtOneHalf === (t.talentWinRateFloor.rawDerivedValue < 0.5),
    t.talentWinRateFloor.clampedAtOneHalf
      ? `the rule derived ${t.talentWinRateFloor.rawDerivedValue}; clamped to ${t.talentWinRateFloor.value} and both values recorded`
      : "no clamp was needed");
  gate("theVolumeDependentMetricDoesNotAdjudicate",
    t.distinctScorelineRatioFloorByGames.note.includes("NEVER ADJUDICATED"),
    "the distinct-scoreline ratio is reported per volume and excluded from every verdict");

  const payload = {
    syntheticPracticalMarginPolicyVersion: "1.0.0",
    frozenBeforeAnySyntheticObservation: true,
    marginRule: MARGIN_RULE, floorRule: FLOOR_RULE, domainFloors: DOMAIN_FLOORS,
    ...d,
    dualGate: "a cell is PASS or FAIL only when the observation clears its threshold by at least the practical margin. Inside the margin it is INDETERMINATE: no pass credit, no failure contribution. Phase 6C4A withdrew four of Historical V4's twelve hard failures as sub-margin artifacts, which is why no gate here is allowed to run without one.",
    countsHaveNoMargin: "requireZeroInvariantFailures, requireZeroImpossibleResults and requireSameSeedReplay compare exact counts against zero. A count has no sampling noise, so no margin applies and one violation is one failure.",
    pass: fail.length === 0, failedGates: fail,
  };
  payload.policyHash = createHash("sha256").update(JSON.stringify({
    frozen: d.frozenThresholds, derived: Object.fromEntries(Object.entries(d.derivedThresholds).map(([k, v]) => [k, v.value ?? null])),
    margins: Object.fromEntries(Object.entries(d.margins).map(([k, v]) => [k, v.margin])) })).digest("hex");
  writeArtifact("synthetic-v2-practical-margins", payload, {
    generationCommand: "npm run syn:margins", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nMARGIN POLICY: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · policyHash ${payload.policyHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
