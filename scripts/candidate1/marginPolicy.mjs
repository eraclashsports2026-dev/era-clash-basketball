#!/usr/bin/env node
// ── Phase 6C4A WS2: the prospective trait practical-margin policy ────────────
//   npm run c1:margin-policy
//
// The frozen V4 hard-fail rule was sign + 95% CI excluding zero. At n = 4096
// games per surface that CI is so tight that a 0.003 three-point-share deficit
// — a rounding error in basketball terms — scored as a hard engine failure.
// Four of V4's twelve hard fails were exactly this artifact.
//
// This policy is PROSPECTIVE. It is frozen here, before any V5 selection or
// run, and it never rescores V4: the V4 verdict stands as issued under the
// rule V4 froze. From V5 onward a trait hard-fails only when BOTH hold:
//   statistical:  wrong direction AND 95% CI excludes zero (the V4 rule), and
//   practical:    |difference| exceeds the metric's practical margin.
// Wrong-direction results inside the margin are DIRECTIONAL_SOFT_FAILs:
// reported, never verdict-driving.
//
// Margins are justified from measured control noise, not taste: each margin is
// max(basketball-meaningful floor, 8 x the between-run SE of the neutral
// control cell at protocol n), so a hard fail is simultaneously too large to
// be noise and large enough to matter on a basketball court.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { DIR } from "./failureRegister.mjs";

const PROTOCOL_N = 4096; // side-balanced games per surface, from the V4 protocol

// Basketball-meaningful floors: the smallest difference a basketball reader
// would accept as a real stylistic or quality difference, per metric unit.
const PRACTICAL_FLOORS = {
  pppVsReference: { floor: 0.02, unit: "points per possession", basis: "2 points per 100 possessions separates adjacent offensive tiers" },
  refPppVsTeam: { floor: 0.02, unit: "points per possession allowed", basis: "2 points per 100 possessions separates adjacent defensive tiers" },
  gamePace: { floor: 1.0, unit: "possessions per game", basis: "one possession per game is the smallest pace gap discussed as real" },
  threeShare: { floor: 0.02, unit: "share of attempts", basis: "2% of a shot diet; below this two profiles are the same profile" },
  interiorShotShare: { floor: 0.02, unit: "share of attempts", basis: "same attempt-mix floor as threeShare" },
  orebRate: { floor: 0.02, unit: "offensive rebound rate", basis: "2% of available offensive boards separates crash tiers" },
  orebRateAgainst: { floor: 0.02, unit: "offensive rebound rate allowed", basis: "mirror of orebRate" },
  assistedRate: { floor: 0.02, unit: "share of made baskets assisted", basis: "2% of makes; below this ball-movement identities are indistinguishable" },
  transitionShare: { floor: 0.03, unit: "share of possessions", basis: "action-mix shares are noisier constructs; 3% is the smallest identity-bearing gap" },
  pnrShare: { floor: 0.03, unit: "share of possessions", basis: "action-mix floor" },
  postUpShare: { floor: 0.03, unit: "share of possessions", basis: "action-mix floor" },
  isolationShare: { floor: 0.03, unit: "share of possessions", basis: "action-mix floor" },
  movementShare: { floor: 0.03, unit: "share of possessions", basis: "action-mix floor" },
  stealRateForced: { floor: 0.01, unit: "steals per opponent possession", basis: "1 steal per 100 possessions" },
  rimShareAgainst: { floor: 0.02, unit: "share of opponent attempts at rim", basis: "attempt-mix floor" },
  defensiveZoneShare: { floor: 0.05, unit: "share of defensive possessions", basis: "zone usage below 5% is not a scheme identity" },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const controls = readArtifact("observability-control-results", "data/validation/6c3r");
  const metrics = {};
  for (const [metric, spec] of Object.entries(PRACTICAL_FLOORS)) {
    const row = controls.data.results.find((r) => r.metric === metric);
    const neutral = row?.cells?.neutral;
    // between-run SE at protocol n, from the measured neutral-cell per-game sd
    const seAtProtocolN = neutral ? neutral.sd / Math.sqrt(PROTOCOL_N) : null;
    const noiseComponent = seAtProtocolN != null ? 8 * seAtProtocolN : null;
    const margin = Math.max(spec.floor, noiseComponent ?? 0);
    metrics[metric] = {
      practicalFloor: spec.floor, unit: spec.unit, basis: spec.basis,
      neutralCellSd: neutral?.sd ?? null, seAtProtocolN: seAtProtocolN != null ? Math.round(seAtProtocolN * 1e6) / 1e6 : null,
      noiseComponent: noiseComponent != null ? Math.round(noiseComponent * 1e6) / 1e6 : null,
      margin: Math.round(margin * 1e6) / 1e6,
      binding: noiseComponent != null && noiseComponent > spec.floor ? "NOISE" : "PRACTICAL_FLOOR",
    };
  }

  const rule = {
    hardFail: "direction opposite to the claim AND 95% CI excludes zero AND |difference| > margin[metric]",
    directionalSoftFail: "direction opposite to the claim AND (CI includes zero OR |difference| <= margin[metric]); reported, never verdict-driving",
    pass: "direction matches the claim",
    protocolGamesPerSurface: PROTOCOL_N,
  };
  const payload = {
    traitPracticalMarginPolicyVersion: VALIDATION_VERSIONS.traitPracticalMarginPolicyVersion,
    appliesFrom: "Historical Holdout V5 and every later formal validation",
    neverAppliesTo: "Historical Holdout V4 and V3 — failed verdicts stand as issued and are never rescored",
    rule, metrics,
    noiseBasis: "neutral control cells, data/validation/6c3r/observability-control-results.json (2000 games per cell, 2010s reference surface)",
  };
  const policyHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  writeArtifact("trait-practical-margin-policy", { ...payload, policyHash, frozen: true }, {
    generationCommand: "npm run c1:margin-policy", dir: DIR,
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash } });

  console.log("TRAIT PRACTICAL-MARGIN POLICY — frozen prospectively\n");
  for (const [m, v] of Object.entries(metrics))
    console.log(`  ${m.padEnd(20)} margin ${String(v.margin).padEnd(9)} (${v.binding === "NOISE" ? "noise-bound" : "practical floor"}; 8xSE ${v.noiseComponent ?? "n/a"})`);
  console.log(`\npolicyHash ${policyHash}`);
}
