#!/usr/bin/env node
// ── WS6: the Historical V5 practical-margin and acceptance policy ───────────
//   npm run v5:policy
//
// Frozen BEFORE any V5 fixture is selected or simulated, and derived only from
// non-holdout evidence: the Candidate 1 era-reference certification, the
// Candidate 1 strong/neutral/weak trait controls, and measured paired-seed
// variance. No V5 output exists to derive it from, which is the point.
//
// PROSPECTIVE ONLY. Historical V3 and V4 stand as issued; a policy that
// rescored a consumed set would be choosing the rule after seeing the answer.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { METRICS } from "../validation/surface.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

// Basketball-meaningful floors, carried forward from the 6C4A policy (which was
// itself frozen prospectively and never applied retroactively). A floor changes
// only with a version bump and a stated reason; none changed here.
const PRACTICAL_FLOORS = {
  gamePace: { floor: 1.0, unit: "possessions per game", family: "PACE",
    basis: "one possession per game is the smallest pace gap discussed as real" },
  pppVsReference: { floor: 0.02, unit: "points per possession", family: "OFFENSIVE_QUALITY",
    basis: "2 points per 100 possessions separates adjacent offensive tiers" },
  refPppVsTeam: { floor: 0.02, unit: "points per possession allowed", family: "DEFENSIVE_QUALITY",
    basis: "2 points per 100 possessions separates adjacent defensive tiers" },
  threeShare: { floor: 0.02, unit: "share of attempts", family: "SHOT_PROFILE",
    basis: "2% of a shot diet; below this two profiles are the same profile" },
  interiorShotShare: { floor: 0.02, unit: "share of attempts", family: "SHOT_PROFILE",
    basis: "2% of the shot diet, the same floor threeShare uses: interior and perimeter share one denominator, so a difference too small to matter in one is too small to matter in the other" },
  orebRate: { floor: 0.02, unit: "offensive rebound rate", family: "REBOUNDING",
    basis: "2% of available offensive boards separates crash tiers" },
  orebRateAgainst: { floor: 0.02, unit: "offensive rebound rate allowed", family: "REBOUNDING",
    basis: "the same 2% of available offensive boards as orebRate, measured from the other side: allowing 2% more second chances is the same size of basketball difference as taking them" },
  assistedRate: { floor: 0.02, unit: "share of made baskets assisted", family: "BALL_MOVEMENT",
    basis: "2% of makes; below this ball-movement identities are indistinguishable" },
  transitionShare: { floor: 0.03, unit: "share of possessions", family: "ACTION_MIX",
    basis: "action-mix shares are noisier constructs; 3% is the smallest identity-bearing gap" },
  pnrShare: { floor: 0.03, unit: "share of possessions", family: "ACTION_MIX",
    basis: "3% of possessions, roughly three plays a game: below that two pick-and-roll identities are not distinguishable by watching" },
  postUpShare: { floor: 0.03, unit: "share of possessions", family: "ACTION_MIX",
    basis: "3% of possessions, roughly three post entries a game: the smallest gap that separates a post-centred offence from one that posts occasionally" },
  isolationShare: { floor: 0.03, unit: "share of possessions", family: "ACTION_MIX",
    basis: "3% of possessions, roughly three isolations a game: below that a team is not meaningfully more isolation-heavy than another" },
  movementShare: { floor: 0.03, unit: "share of possessions", family: "ACTION_MIX",
    basis: "3% of possessions across the off-ball screen, cut and handoff family: the smallest share difference that reads as a motion identity rather than a few extra actions" },
  stealRateForced: { floor: 0.01, unit: "steals per opponent possession", family: "DEFENSIVE_EVENTS",
    basis: "1 steal per 100 possessions" },
  rimShareAgainst: { floor: 0.02, unit: "share of opponent attempts at rim", family: "DEFENSIVE_PROFILE",
    basis: "2% of the opponent's shot diet, the shot-profile floor applied to what a defence concedes: pushing 2% of attempts off the rim is the smallest rim-protection difference that shows up in a shot chart" },
  defensiveZoneShare: { floor: 0.05, unit: "share of defensive possessions", family: "SCHEME",
    basis: "zone usage below 5% is not a scheme identity" },
};
const PROTOCOL_N = 4096;         // side-balanced games per surface, frozen below
const NOISE_MULTIPLE = 8;        // margin must clear 8 standard errors of the neutral control

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const obs = readArtifact("historical-observability-certification-candidate1", DIR);
  const refs = readArtifact("era-reference-certification-candidate1", DIR);
  const recertData = readArtifact("candidate1-lock-recertification", DIR).data;
  const prior = readArtifact("trait-practical-margin-policy", DIR_6C4A).data;
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };
  // Frozen artifacts refuse silent overwrite: a re-issue is a decision.
  if (artifactExists("historical-holdout-v5-policy", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-holdout-v5-policy already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  if (artifactExists("historical-v5-selection", DIR)) {
    throw new Error("REFUSED: a V5 selection already exists. The policy must be frozen BEFORE selection, not after.");
  }

  console.log("HISTORICAL V5 PRACTICAL-MARGIN POLICY\n");
  const metrics = {};
  for (const [metric, spec] of Object.entries(PRACTICAL_FLOORS)) {
    const row = obs.data.results.find((r) => r.metric === metric);
    const neutral = row?.cells?.neutral ?? null;
    // Between-run standard error at protocol n, from the MEASURED per-game sd
    // of the Candidate 1 neutral control cell.
    const seAtProtocolN = neutral?.sd != null ? neutral.sd / Math.sqrt(PROTOCOL_N) : null;
    const noise = seAtProtocolN != null ? NOISE_MULTIPLE * seAtProtocolN : null;
    const margin = Math.round(Math.max(spec.floor, noise ?? 0) * 1e6) / 1e6;
    const priorMargin = prior.metrics[metric]?.margin ?? null;
    metrics[metric] = {
      margin, practicalFloor: spec.floor, unit: spec.unit, traitFamily: spec.family,
      practicalRationale: spec.basis,
      confidenceMethod: "95% Wald interval on the difference of two independent per-game sample means",
      sourceControls: `Candidate 1 neutral control cell (${obs.data.gamesPerCell} games) from historical-observability-certification-candidate1.json`,
      noiseEstimate: { neutralCellSd: neutral?.sd ?? null, standardErrorAtProtocolN: seAtProtocolN != null ? Math.round(seAtProtocolN * 1e6) / 1e6 : null,
        noiseComponent: noise != null ? Math.round(noise * 1e6) / 1e6 : null, multiple: NOISE_MULTIPLE },
      sampleRequirement: { gamesPerSurface: PROTOCOL_N, sideBalanced: true },
      binding: noise != null && noise > spec.floor ? "NOISE" : "PRACTICAL_FLOOR",
      metricCertifiedUnderCandidate1: obs.data.certifiedMetrics.includes(metric),
      changedFromPriorPolicy: priorMargin != null && priorMargin !== margin,
      priorPolicyMargin: priorMargin,
    };
    console.log(`  ${metric.padEnd(20)} margin ${String(margin).padEnd(9)} ${metrics[metric].binding === "NOISE" ? "noise-bound" : "floor-bound"} · 8xSE ${metrics[metric].noiseEstimate.noiseComponent ?? "n/a"} · metric certified ${metrics[metric].metricCertifiedUnderCandidate1}`);
  }
  console.log("");

  const rule = {
    hardFail: "direction opposite to the claim AND the 95% interval excludes zero AND |difference| > margin[metric]",
    directionalSoftFail: "direction opposite to the claim AND (interval includes zero OR |difference| <= margin[metric]) — reported, never verdict-driving",
    pass: "direction matches the claim",
    reportingStates: ["PASS", "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT", "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED", "INCONCLUSIVE", "NOT_OBSERVABLE", "NOT_APPLICABLE"],
    dualGate: "Both gates must fire. Statistical significance alone is not a failure at 4,096 games, and a large difference inside noise is not evidence.",
  };
  gate("everyMarginDominatesItsMeasuredNoise",
    Object.values(metrics).every((m) => m.noiseEstimate.noiseComponent == null || m.margin >= m.noiseEstimate.noiseComponent),
    `${Object.keys(metrics).length} metrics; every margin is at least its 8-standard-error noise component`);
  gate("everyMarginHasAPracticalRationale", Object.values(metrics).every((m) => m.practicalRationale.length > 20 && m.unit),
    "each margin states a value, a unit, a confidence method, its source controls, a noise estimate, a practical rationale and a sample requirement");
  gate("marginsAreMetricSpecific", new Set(Object.values(metrics).map((m) => m.margin)).size > 1,
    `${new Set(Object.values(metrics).map((m) => m.margin)).size} distinct margins across ${new Set(Object.values(metrics).map((m) => m.traitFamily)).size} trait families — no single universal margin`);
  gate("derivedWithoutV5Output", !artifactExists("historical-v5-selection", DIR),
    "no V5 selection or result exists; every input is a non-holdout control or a Candidate 1 reference certification");
  gate("prospectiveOnly", true,
    "applies from Historical Holdout V5 forward; Historical V3 and V4 verdicts stand exactly as issued and are not rescored");

  const marginPayload = {
    historicalTraitPracticalMarginPolicyVersion: VALIDATION_VERSIONS.historicalTraitPracticalMarginPolicyVersion,
    supersedes: { version: prior.traitPracticalMarginPolicyVersion, policyHash: prior.policyHash,
      whatChanged: "Noise estimates are re-derived from CANDIDATE 1 control cells; the basketball-meaningful floors are unchanged. The prior policy is preserved, not edited." },
    appliesFrom: "Historical Holdout V5 and every later formal validation",
    neverAppliesTo: "Historical Holdout V3 and V4 — consumed sets whose verdicts stand as issued",
    rule, metrics,
    noiseBasis: `Candidate 1 neutral control cells, ${DIR}/historical-observability-certification-candidate1.json`,
    frozenBeforeSelection: true,
  };
  const marginHash = createHash("sha256").update(JSON.stringify(marginPayload)).digest("hex");
  writeArtifact("trait-practical-margin-policy-v5", { ...marginPayload, policyHash: marginHash, frozen: true },
    { generationCommand: "npm run v5:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── the V5 acceptance policy ─────────────────────────────────────────────
  const priorPolicy = readArtifact("historical-holdout-v4-policy", "data/validation/6c3r").data;
  const acceptance = {
    historicalHoldoutAcceptancePolicyVersion: VALIDATION_VERSIONS.historicalHoldoutV5AcceptancePolicyVersion,
    holdoutSet: "historical-holdout-v5",
    frozenBeforeAnyV5Output: true,
    frozenBeforeSelection: true,
    basedOnly: ["non-holdout development controls", "Candidate 1 era-reference certification",
      "Candidate 1 strong/neutral/weak trait controls", "measured paired-seed variance"],
    protocol: {
      surfacesPerMatchup: ["TEAM_A_VS_TEAM_B", "TEAM_A_VS_ERA_REFERENCE", "TEAM_B_VS_ERA_REFERENCE"],
      sideBalanced: true, pairsPerSurface: PROTOCOL_N / 2, gamesPerSurface: PROTOCOL_N,
      gamesPerMatchup: PROTOCOL_N * 3, matchups: 8, totalGames: PROTOCOL_N * 3 * 8,
      seedStream: "historical-holdout-v5",
      note: "Offence is read only from a team's own side of team-vs-reference games and defence only from the reference's output in those games. Nothing offence/defence is ever read from a mirror — the defect that consumed V3.",
    },
    numericGates: {
      compositeShareMae: {
        measuredOn: "each team's five-share distribution in its TEAM_VS_ERA_REFERENCE games, against the Tier C season-share proxy",
        internalBaselineMean: priorPolicy.numericGates.compositeShareMae.internalBaselineMean,
        maxHoldoutToInternalRatio: priorPolicy.numericGates.compositeShareMae.maxHoldoutToInternalRatio,
        catastrophicThreshold: priorPolicy.numericGates.compositeShareMae.catastrophicThreshold,
        maxCatastrophicTeams: 0,
        ratioNote: "Carried forward unchanged from the V4 policy. It was not weakened because V4 passed it, and it is not tightened because V4 failed elsewhere.",
      },
      shareComponents: ["playerScoringShares", "playerReboundShares", "playerAssistShares", "playerStealShares", "playerBlockShares"],
      unavailableMetrics: "A null target (pre-1974 steals and blocks, or any unrecorded field) contributes no error, no pass credit and no failure. It is never zero-filled.",
    },
    traitGates: {
      scoredTraits: "Only traits certified in historical-observability-certification-candidate1.json, on their registry surface, against the CANDIDATE 1 era-reference self-baselines.",
      perTrait: rule,
      practicalMarginPolicyHash: marginHash,
      confidenceHandling: {
        HIGH: "a hard fail on a high-confidence identity is a verdict failure on its own",
        MEDIUM: "hard fails count toward the aggregate gates; V4's identities were all MEDIUM",
        LOW: "reported, never verdict-driving",
      },
      aggregate: { minTraitPassRate: 0.75, maxHardFails: 0, perFixtureRule: "no matchup may fail a majority of its scored traits",
        perEraRule: "no era style may fail every scored trait of its matchup" },
      reporting: rule.reportingStates,
    },
    structuralGates: {
      zeroInvariantFailures: true, zeroFinalTies: true, replayExactPerSurface: true,
      zeroImpossibleScores: true, zeroPreThreeEraThreePointAttempts: true,
      candidateIdentityStated: "every result must state candidateId, core hash, parameter-set hash and calibration version",
      coreHashMustEqual: recertData.coreHash,
      parameterSetHashMustEqual: def.parameterSetHash,
      calibrationVersionMustEqual: "1.1.0",
    },
    outcomes: { pass: "HISTORICAL_HOLDOUT_V5_PASS", fail: "HISTORICAL_HOLDOUT_V5_FAIL", invalid: "HISTORICAL_HOLDOUT_V5_INVALID_RUN" },
    failureSemantics: "FAIL preserves every artifact, forbids tuning against V5, keeps Synthetic V2 sealed, and ends formal validation for Candidate 1. INVALID_RUN resumes under the SAME access event only.",
    immutability: "After this artifact is committed no threshold, margin, trait, confidence rule, reference or target may change. Any change before V5 access requires a new policy version, a new policy hash and a new readiness package; any change after V5 access invalidates V5.",
    hashes: {
      candidateCoreHash: recertData.coreHash,
      parameterSetHash: def.parameterSetHash,
      possessionCalibrationVersion: "1.1.0",
      eraReferenceCertificationHash: refs.outputHash,
      observabilityCertificationHash: obs.outputHash,
      practicalMarginPolicyHash: marginHash,
      priorV4PolicyHash: priorPolicy.policyHash,
    },
  };
  const policyHash = createHash("sha256").update(JSON.stringify(acceptance)).digest("hex");
  writeArtifact("historical-holdout-v5-policy", { ...acceptance, policyHash, frozen: true, pass: fail.length === 0 },
    { generationCommand: "npm run v5:policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`margin policy hash ${marginHash.slice(0, 16)}...`);
  console.log(`V5 acceptance policy hash ${policyHash.slice(0, 16)}...`);
  console.log(`\nPOLICY FREEZE: ${fail.length === 0 ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
