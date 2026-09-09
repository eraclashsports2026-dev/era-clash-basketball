#!/usr/bin/env node
// ── WS2: formalize the frozen Synthetic V2 stress guardrails ─────────────────
//   npm run syn:guardrails
//
// The guardrails already exist, frozen since Phase 6C2C1 inside the acceptance
// policy. This module does not invent, merge, split or reinterpret them: it
// reads every key exactly once and attaches the machine-readable detail a
// formal run needs — metric, surface, fixtures, verdict class.
//
// Note on the count. HOLDOUT.syntheticGuardrails carries ELEVEN keys: eight
// boolean requirements and three numeric thresholds that parameterise two of
// them. Prose in earlier phases has said "ten". Rather than merge the
// thresholds into their parents (which would be a silent reinterpretation) or
// adopt a number no artifact supports, all eleven keys are registered and the
// three thresholds are classified as THRESHOLD_PARAMETER bound to their parent.
import { createHash } from "node:crypto";
import { writeArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT, policyHash as acceptancePolicyHash } from "../../src/v3/calibration/acceptancePolicy.js";
import { SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { DIR, syntheticMembership } from "./preflight.mjs";

export const GUARDRAIL_CLASSES = Object.freeze(["STRUCTURAL_INVARIANT", "HARD_CATASTROPHIC",
  "PER_FIXTURE_REQUIRED", "AGGREGATE_REQUIRED", "DIRECTIONAL_GUARDRAIL", "TAIL_GUARDRAIL",
  "COMPETITION_MODE_GUARDRAIL", "THRESHOLD_PARAMETER"]);

/** The two surfaces a synthetic fixture is played on. Frozen here. */
export const SURFACES = Object.freeze({
  MIRROR: "the fixture five against ITSELF, same coach both sides, side-balanced. The construction is the only variable, so an action-mix or shell result cannot be an artifact of the opponent.",
  VS_BALANCED_CONTROL: "the fixture five against a frozen non-holdout balanced control five under the neutral coach. This is the only surface on which a construction-versus-talent claim is decidable, because it needs two DIFFERENT constructions.",
});

const purposeOf = (id) => SYNTHETIC_STRESS_HOLDOUT_V2.find((f) => f.id === id)?.purpose ?? null;
const byPurpose = (...purposes) => SYNTHETIC_STRESS_HOLDOUT_V2.filter((f) => purposes.includes(f.purpose)).map((f) => f.id);
const ALL = SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id);

/** Everything a formal run needs per guardrail, keyed by the FROZEN key name. */
const DETAIL = {
  requireZeroInvariantFailures: {
    displayName: "Zero statistical-invariant failures",
    stressCategory: "STRUCTURAL", formalClass: "STRUCTURAL_INVARIANT",
    fixtureIds: ALL, surfaces: ["MIRROR", "VS_BALANCED_CONTROL"],
    mechanicUnderTest: "the possession engine's own conservation checks — points reconcile with made shots, possessions reconcile with the ledger, no box-score line contradicts the game",
    primaryMetrics: ["invariantViolationCount"], secondaryMetrics: [],
    structuralChecks: ["engine invariant checker on every game"],
    expectedBehavior: "exactly zero violations across every game of every fixture",
    candidateFailureMeaning: "the engine produced a game that cannot be true. Nothing else measured in the run can be trusted.",
    adjudication: { rule: "invariantViolationCount === 0", scope: "PER_GAME", catastrophic: true },
  },
  requireZeroImpossibleResults: {
    displayName: "Zero impossible results",
    stressCategory: "STRUCTURAL", formalClass: "STRUCTURAL_INVARIANT",
    fixtureIds: ALL, surfaces: ["MIRROR", "VS_BALANCED_CONTROL"],
    mechanicUnderTest: "the outer plausibility envelope: a basketball score, a finite number, a decided game",
    primaryMetrics: ["impossibleScoreCount", "nonFiniteStatCount", "negativeStatCount", "finalTieCount"],
    secondaryMetrics: [],
    structuralChecks: ["score within [20, 220]", "no NaN or Infinity in any box-score field", "no negative statistic", "no final tie"],
    expectedBehavior: "zero of each, in every game",
    candidateFailureMeaning: "the engine emitted a result outside basketball's physical envelope.",
    adjudication: { rule: "impossibleScoreCount + nonFiniteStatCount + negativeStatCount + finalTieCount === 0", scope: "PER_GAME", catastrophic: true },
  },
  forbidUniversalActionDominance: {
    displayName: "No action family universally dominates",
    stressCategory: "ACTION_MIX", formalClass: "AGGREGATE_REQUIRED",
    fixtureIds: ALL, surfaces: ["MIRROR"],
    mechanicUnderTest: "the offensive action-mix layer: even a deliberately warped roster must not collapse into one action",
    primaryMetrics: ["maxActionFamilyShare"], secondaryMetrics: ["actionFamilyShareDistribution"],
    structuralChecks: [],
    expectedBehavior: "on every fixture, the largest single action-family share of possessions stays at or below the frozen threshold",
    candidateFailureMeaning: "one action swallowed the offence, so the action layer is not really choosing.",
    adjudication: { rule: "maxActionFamilyShare <= maxSingleActionFamilyShare", scope: "PER_FIXTURE_THEN_AGGREGATE",
      thresholdKey: "maxSingleActionFamilyShare", catastrophic: false,
      note: "Evaluated per fixture and then aggregated: a single fixture above the threshold is a fixture failure; the aggregate rule decides whether the set fails." },
  },
  maxSingleActionFamilyShare: {
    displayName: "Action-family share ceiling",
    stressCategory: "ACTION_MIX", formalClass: "THRESHOLD_PARAMETER",
    parameterOf: "forbidUniversalActionDominance",
    fixtureIds: ALL, surfaces: ["MIRROR"],
    mechanicUnderTest: "n/a — this key is the numeric ceiling its parent guardrail compares against",
    primaryMetrics: ["maxActionFamilyShare"], secondaryMetrics: [], structuralChecks: [],
    expectedBehavior: "carried forward from the frozen policy unchanged",
    candidateFailureMeaning: "n/a — a threshold cannot fail",
    adjudication: { rule: "n/a", scope: "PARAMETER", catastrophic: false },
  },
  forbidUniversalShellDominance: {
    displayName: "No zone shell universally dominates",
    stressCategory: "ZONE_SCHEME", formalClass: "DIRECTIONAL_GUARDRAIL",
    // Every fixture, not only the two labelled ZONE_EDGE_CASE. A purpose label
    // says what a fixture was designed to stress; a guardrail applies wherever
    // its claim is decidable, and "universally" cannot be judged from one
    // fixture. Era legality narrows this to the nine zone-legal fixtures.
    fixtureIds: ALL, surfaces: ["ZONE_ASYMMETRIC"],
    mechanicUnderTest: "zone resolution: a shell must be a trade-off, not a free win or a free loss",
    primaryMetrics: ["shellSideWinRate"], secondaryMetrics: ["realizedZoneShare", "zoneAttackShare"],
    structuralChecks: ["a shell counted only when possession state actually selected it (realized zone, not toolkit availability)",
      "on a zone-illegal era the fixture is held instead to realized zone possessions === 0"],
    expectedBehavior: "where one side zones and the other does not, the zoning side's win rate stays inside the frozen band",
    candidateFailureMeaning: "the zone is either an automatic advantage or an automatic handicap, so scheme choice is decorative.",
    adjudication: { rule: "minSingleShellWinRate <= shellSideWinRate <= maxSingleShellWinRate", scope: "PER_FIXTURE",
      thresholdKeys: ["maxSingleShellWinRate", "minSingleShellWinRate"], catastrophic: false,
      unavailable: "In a zone-illegal era no zone possession can be realized, so no shell win rate exists and the guardrail is NOT_APPLICABLE for that fixture — never a pass and never a failure. Those fixtures are held to the structural expectation of zero realized zone instead.",
      confoundHandling: "the surface substitutes a matched coach pair, so a breach is checked against the zone-ablation twin before it is called a failure; a breach the twin explains is INDETERMINATE, not FAIL." },
  },
  maxSingleShellWinRate: {
    displayName: "Shell win-rate ceiling", stressCategory: "ZONE_SCHEME", formalClass: "THRESHOLD_PARAMETER",
    parameterOf: "forbidUniversalShellDominance",
    fixtureIds: ALL, surfaces: ["ZONE_ASYMMETRIC"],
    mechanicUnderTest: "n/a", primaryMetrics: ["shellSideWinRate"], secondaryMetrics: [], structuralChecks: [],
    expectedBehavior: "carried forward unchanged", candidateFailureMeaning: "n/a",
    adjudication: { rule: "n/a", scope: "PARAMETER", catastrophic: false },
  },
  minSingleShellWinRate: {
    displayName: "Shell win-rate floor", stressCategory: "ZONE_SCHEME", formalClass: "THRESHOLD_PARAMETER",
    parameterOf: "forbidUniversalShellDominance",
    fixtureIds: ALL, surfaces: ["ZONE_ASYMMETRIC"],
    mechanicUnderTest: "n/a", primaryMetrics: ["shellSideWinRate"], secondaryMetrics: [], structuralChecks: [],
    expectedBehavior: "carried forward unchanged", candidateFailureMeaning: "n/a",
    adjudication: { rule: "n/a", scope: "PARAMETER", catastrophic: false },
  },
  requireSameSeedReplay: {
    displayName: "Same seed replays exactly",
    stressCategory: "DETERMINISM", formalClass: "HARD_CATASTROPHIC",
    fixtureIds: ALL, surfaces: ["MIRROR", "VS_BALANCED_CONTROL"],
    mechanicUnderTest: "determinism: one seed, one game, forever",
    primaryMetrics: ["replayMismatchCount"], secondaryMetrics: [],
    structuralChecks: ["designated replay seeds re-run and compared byte-for-byte on score, box score and ledger"],
    expectedBehavior: "every replay seed reproduces its game exactly",
    candidateFailureMeaning: "results are not reproducible, so no other measurement in the run means anything.",
    adjudication: { rule: "replayMismatchCount === 0", scope: "PER_FIXTURE", catastrophic: true },
  },
  requireNewSeedVariance: {
    displayName: "New seeds produce new games",
    stressCategory: "DETERMINISM", formalClass: "TAIL_GUARDRAIL",
    fixtureIds: ALL, surfaces: ["MIRROR"],
    mechanicUnderTest: "stochasticity: the same matchup on different seeds must vary like basketball, not repeat like a fixture list",
    primaryMetrics: ["distinctScorelineRatio", "combinedScoreSd"], secondaryMetrics: ["marginSd"],
    structuralChecks: [],
    expectedBehavior: "scorelines vary across seeds, with a standard deviation above the frozen floor and a high ratio of distinct scorelines",
    candidateFailureMeaning: "the engine is effectively deterministic across seeds, so variance-based validation elsewhere is meaningless.",
    adjudication: { rule: "combinedScoreSd >= floor AND distinctScorelineRatio >= floor", scope: "PER_FIXTURE", catastrophic: false },
  },
  requireConstructionCanBeatHigherOvr: {
    displayName: "Better construction can beat higher talent",
    stressCategory: "CONSTRUCTION_VS_TALENT", formalClass: "PER_FIXTURE_REQUIRED",
    fixtureIds: byPurpose("EXPLOIT_ROLE_OVERLAP", "DUPLICATE_ROLE_OVERLOAD", "IMPOSSIBLE_SPACING"),
    surfaces: ["VS_BALANCED_CONTROL"],
    mechanicUnderTest: "whether role overlap and missing spacing actually cost a team, rather than being papered over by raw card quality",
    primaryMetrics: ["balancedControlWinRate"], secondaryMetrics: ["controlPointsPerPossession", "fixturePointsPerPossession"],
    structuralChecks: ["the control five's summed card rating must be LOWER than the fixture five's, verified before the run"],
    expectedBehavior: "the lower-rated but coherently built control five wins a meaningful share of games against the warped stack",
    candidateFailureMeaning: "construction does not matter: talent alone decides, and every roster-building decision in the product is cosmetic.",
    adjudication: { rule: "balancedControlWinRate >= constructionFloor", scope: "PER_FIXTURE", catastrophic: false,
      note: "A floor, never a requirement that the weaker roster WIN the matchup. The claim is that construction is capable of beating talent, not that it usually does." },
  },
  requireExtremeTalentRemainsMeaningful: {
    displayName: "Extreme talent still decides games",
    stressCategory: "CONSTRUCTION_VS_TALENT", formalClass: "PER_FIXTURE_REQUIRED",
    fixtureIds: byPurpose("EXTREME_STRENGTH_GAP"), surfaces: ["VS_BALANCED_CONTROL"],
    mechanicUnderTest: "the other end of the same axis: a large talent gap must still show up in the win rate",
    primaryMetrics: ["strongerSideWinRate"], secondaryMetrics: ["meanMargin"],
    structuralChecks: ["the fixture five's summed card rating must exceed the control five's by the frozen gap, verified before the run"],
    expectedBehavior: "the much stronger five wins clearly more often than a coin flip, without winning everything",
    candidateFailureMeaning: "talent has been flattened — the opposite failure to the guardrail above, and just as fatal to the product.",
    adjudication: { rule: "talentFloor <= strongerSideWinRate <= talentCeiling", scope: "PER_FIXTURE", catastrophic: false },
  },
};

export const buildRegistry = () => {
  const frozen = HOLDOUT.syntheticGuardrails;
  const mem = syntheticMembership();
  const undetailed = Object.keys(frozen).filter((k) => !DETAIL[k]);
  if (undetailed.length) throw new Error(`frozen guardrail keys with no formal detail: ${undetailed.join(", ")}`);
  const invented = Object.keys(DETAIL).filter((k) => !(k in frozen));
  if (invented.length) throw new Error(`formal detail for keys that are NOT in the frozen policy: ${invented.join(", ")}`);

  const guardrails = Object.entries(frozen).map(([key, value]) => ({
    guardrailId: key,
    originalDefinition: { key, value, source: "HOLDOUT.syntheticGuardrails", acceptancePolicyHash: acceptancePolicyHash() },
    ...DETAIL[key],
    measurementSurface: DETAIL[key].surfaces.map((s) => ({ surface: s, definition: SURFACES[s] })),
    sourceArtifact: "src/v3/calibration/acceptancePolicy.js (frozen, covered by the pre-calibration artifact freeze)",
  }));

  const adjudicable = guardrails.filter((g) => g.formalClass !== "THRESHOLD_PARAMETER");
  const fixturesWithMapping = new Set(guardrails.flatMap((g) => g.fixtureIds));
  const unmappedFixtures = mem.fixtures.map((f) => f.id).filter((id) => !fixturesWithMapping.has(id));
  const unmappedGuardrails = adjudicable.filter((g) => g.fixtureIds.length === 0).map((g) => g.guardrailId);

  return { guardrails, adjudicable, unmappedFixtures, unmappedGuardrails, frozenKeyCount: Object.keys(frozen).length, mem };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("synthetic-v2-guardrail-registry", DIR) && !process.argv.includes("--refreeze")) {
    console.log("registry already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };
  const { guardrails, adjudicable, unmappedFixtures, unmappedGuardrails, frozenKeyCount, mem } = buildRegistry();

  console.log("SYNTHETIC V2 GUARDRAIL REGISTRY\n");
  for (const g of guardrails) {
    console.log(`  ${g.guardrailId.padEnd(38)} ${g.formalClass.padEnd(22)} ${String(g.fixtureIds.length).padStart(2)} fixtures  ${g.surfaces.join("+")}`);
  }
  console.log("");

  gate("everyFrozenKeyRegisteredExactlyOnce",
    guardrails.length === frozenKeyCount && new Set(guardrails.map((g) => g.guardrailId)).size === frozenKeyCount,
    `${frozenKeyCount} frozen keys, ${guardrails.length} registered, ${new Set(guardrails.map((g) => g.guardrailId)).size} distinct`);
  gate("noGuardrailInvented", guardrails.every((g) => g.guardrailId in HOLDOUT.syntheticGuardrails),
    "every registered id is a key of the frozen policy object");
  gate("everyGuardrailHasOneAuthoritativeClass",
    guardrails.every((g) => GUARDRAIL_CLASSES.includes(g.formalClass)),
    `${adjudicable.length} adjudicable guardrails + ${guardrails.length - adjudicable.length} threshold parameters`);
  gate("everyThresholdBoundToItsParent",
    guardrails.filter((g) => g.formalClass === "THRESHOLD_PARAMETER").every((g) => g.parameterOf && guardrails.some((x) => x.guardrailId === g.parameterOf)),
    "each numeric key names the boolean guardrail it parameterises");
  gate("everyAdjudicableGuardrailMapsToFixtures", unmappedGuardrails.length === 0,
    unmappedGuardrails.length ? unmappedGuardrails.join(", ") : "every adjudicable guardrail names at least one fixture");
  gate("everyFixtureCoveredByAGuardrail", unmappedFixtures.length === 0,
    unmappedFixtures.length ? unmappedFixtures.join(", ") : `all ${mem.fixtures.length} fixtures are covered`);
  // The meaning requirement applies to ADJUDICABLE guardrails. A threshold
  // parameter has no failure meaning because a threshold cannot fail; it is
  // held to naming its parent and its metric instead, checked above.
  gate("everyAdjudicableGuardrailHasMetricSurfaceAndMeaning",
    adjudicable.every((g) => g.primaryMetrics.length > 0 && g.measurementSurface.length > 0
      && g.expectedBehavior.length > 20 && g.candidateFailureMeaning.length > 30 && g.adjudication?.rule),
    `all ${adjudicable.length} adjudicable guardrails carry a metric, a surface, expected behaviour, a failure meaning and an adjudication rule`);
  gate("everyThresholdCarriesItsMetric",
    guardrails.filter((g) => g.formalClass === "THRESHOLD_PARAMETER").every((g) => g.primaryMetrics.length > 0),
    "each threshold names the metric it bounds");

  const payload = {
    syntheticStressGuardrailRegistryVersion: "1.0.0",
    source: { location: "HOLDOUT.syntheticGuardrails in src/v3/calibration/acceptancePolicy.js",
      acceptancePolicyHash: acceptancePolicyHash(), frozenKeyCount },
    membership: { fixtureCount: mem.fixtures.length, membershipHash: mem.membershipHash, changed: false },
    surfaces: SURFACES,
    guardrailClasses: GUARDRAIL_CLASSES,
    guardrailCount: guardrails.length,
    adjudicableGuardrailCount: adjudicable.length,
    thresholdParameterCount: guardrails.length - adjudicable.length,
    countReconciliation: {
      frozenKeys: frozenKeyCount,
      registered: guardrails.length,
      booleanRequirements: adjudicable.length,
      numericThresholds: guardrails.length - adjudicable.length,
      priorProseSaid: 10,
      discrepancy: "Phase prose has referred to 'ten conceptual guardrails'. The frozen object holds eleven keys: eight boolean requirements plus three numeric thresholds parameterising two of them. Both prior artifacts (the 6C4B2 preflight and blocker) recorded eleven. All eleven are registered here; the thresholds are classified as THRESHOLD_PARAMETER rather than merged into their parents, so nothing is reinterpreted and the count reconciles with the frozen source rather than with the prose.",
    },
    fixtureCoverage: Object.fromEntries(mem.fixtures.map((f) => [f.id, {
      purpose: f.purpose, era: f.era, coach: f.coach,
      guardrails: guardrails.filter((g) => g.formalClass !== "THRESHOLD_PARAMETER" && g.fixtureIds.includes(f.id)).map((g) => g.guardrailId),
    }])),
    unmappedFixtures, unmappedGuardrails,
    guardrails,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.registryHash = createHash("sha256").update(JSON.stringify(guardrails.map((g) => [g.guardrailId, g.formalClass, g.fixtureIds]))).digest("hex");
  writeArtifact("synthetic-v2-guardrail-registry", payload, {
    generationCommand: "npm run syn:guardrails", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nREGISTRY: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.registryHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
