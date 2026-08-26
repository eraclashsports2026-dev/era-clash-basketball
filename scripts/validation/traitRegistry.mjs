// ── Historical trait observability registry ─────────────────────────────────
// Every trait string in the historical identity vocabulary, classified for the
// opponent-paired + era-reference surface. The registry is written from trait
// SEMANTICS and metric IDENTIFIABILITY only — no Candidate 0 output, on any
// fixture, was consulted. A test freezes its hash before V4 selection.
//
// The V3 failure happened because a rubric was built from the trait vocabulary
// without asking whether the surface could measure each trait. This registry
// asks that question first, for all of them, and answers UNOBSERVABLE without
// embarrassment where the answer is no: an unobservable trait excluded before
// the holdout is a scope limitation; the same trait scored inside it is a false
// verdict.
import { createHash } from "node:crypto";
import { METRICS, SURFACES } from "./surface.mjs";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

export const OBSERVABILITY_CLASSES = Object.freeze([
  "DIRECTLY_OBSERVABLE", "PROXY_OBSERVABLE", "STRUCTURALLY_OBSERVABLE", "UNOBSERVABLE_ON_THIS_SURFACE",
]);

const ABOVE = "ABOVE_REFERENCE_BASELINE";
const BELOW = "BELOW_REFERENCE_BASELINE";

// Shorthand row builders. `claim` names the canonical metric and direction the
// trait asserts; a null claim is an honest "this surface cannot distinguish it".
const T = (family, cls, claim, definition, ctx = []) => ({ family, cls, claim, definition, ctx });
const off = (metric, definition) => T("ACTION_IDENTITY", "STRUCTURALLY_OBSERVABLE", { metric, direction: ABOVE }, definition);
const unobs = (family, definition) => T(family, "UNOBSERVABLE_ON_THIS_SURFACE", null, definition);

/**
 * The complete mapping, keyed by the trait's value string.
 * Families follow the repository vocabulary where one exists.
 */
export const TRAIT_TABLE = Object.freeze({
  // ── pace values ────────────────────────────────────────────────────────────
  "very fast": T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: ABOVE }, "Documented very fast pace: game pace against the frozen era reference sits above the reference's self-baseline."),
  "fast": T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: ABOVE }, "Documented fast pace."),
  "moderate": T("PACE", "DIRECTLY_OBSERVABLE", null, "Documented moderate pace: no direction is claimed, so nothing is scored. NOT_APPLICABLE at scoring time."),
  "slow": T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: BELOW }, "Documented slow pace."),
  "very slow": T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: BELOW }, "Documented very slow pace."),

  // ── tags ───────────────────────────────────────────────────────────────────
  ELITE_OFFENSE: T("OFFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "pppVsReference", direction: ABOVE },
    "Documented elite offence: scores on the frozen era-reference defence above the reference's own self-baseline. Requires the VS_ERA_REFERENCE surface; unobservable on a mirror, which is the exact V3 defect."),
  ELITE_DEFENSE: T("DEFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "refPppVsTeam", direction: BELOW },
    "Documented elite defence: holds the frozen era-reference offence below its self-baseline. Requires the REFERENCE_VS_TEAM surface."),
  PACE_EXTREME: T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: ABOVE }, "Documented extreme pace; every historical use of this tag accompanies a fast identity."),
  SLOW_HALF_COURT: T("PACE", "DIRECTLY_OBSERVABLE", { metric: "gamePace", direction: BELOW }, "Documented slow, half-court identity."),
  THREE_POINT_HEAVY: T("SHOT_PROFILE", "DIRECTLY_OBSERVABLE", { metric: "threeShare", direction: ABOVE }, "Documented three-point volume above the era norm.", ["ERA_HAS_THREE_POINT_LINE"]),
  LOW_THREE_POINT: T("SHOT_PROFILE", "DIRECTLY_OBSERVABLE", { metric: "threeShare", direction: BELOW }, "Documented low three-point volume for its era.", ["ERA_HAS_THREE_POINT_LINE"]),
  POST_HEAVY: off("postUpShare", "Documented post-centred offence."),
  ISOLATION_HEAVY: off("isolationShare", "Documented isolation-centred offence."),
  PICK_AND_ROLL: off("pnrShare", "Documented pick-and-roll-centred offence."),
  MOTION: off("movementShare", "Documented motion offence: off-ball screens, cuts and handoffs."),
  TRANSITION: off("transitionShare", "Documented transition offence."),
  SMALL_BALL: T("SHOT_PROFILE", "STRUCTURALLY_OBSERVABLE", { metric: "interiorShotShare", direction: BELOW }, "Documented small-ball identity: the shot mix moves away from the interior."),
  SIZE_HEAVY: T("ROSTER_BALANCE", "STRUCTURALLY_OBSERVABLE", { metric: "interiorShotShare", direction: ABOVE }, "Documented size-heavy identity: the shot mix concentrates inside."),
  STRONG_OFFENSIVE_REBOUNDING: T("REBOUNDING", "STRUCTURALLY_OBSERVABLE", { metric: "orebRate", direction: ABOVE }, "Documented offensive-rebounding strength, measured against the frozen reference's defensive rebounding."),
  WEAK_OFFENSIVE_REBOUNDING: T("REBOUNDING", "STRUCTURALLY_OBSERVABLE", { metric: "orebRate", direction: BELOW }, "Documented offensive-rebounding weakness."),
  PASSING_HUB: T("PLAYMAKING", "STRUCTURALLY_OBSERVABLE", { metric: "assistedRate", direction: ABOVE }, "Documented hub passing identity: a higher share of makes are assisted."),
  ZONE_CAPABLE: T("ZONE_IDENTITY", "STRUCTURALLY_OBSERVABLE", { metric: "defensiveZoneShare", direction: ABOVE }, "Documented zone usage where the era allows it.", ["ERA_ALLOWS_ZONE"]),
  BALANCED_CHAMPION: unobs("ERA_EXPRESSION", "A championship-season identity. A title is a property of an 82-game season and a bracket, not of a fixed-sample fixture simulation; no surface here observes it."),
  NON_CHAMPION: unobs("ERA_EXPRESSION", "The complement of a championship identity, unobservable for the same reason."),

  // ── offense free text ──────────────────────────────────────────────────────
  "Showtime transition and early offence": off("transitionShare", "Documented running offence."),
  "fast break and early offence": off("transitionShare", "Documented running offence."),
  "fast break from defensive rebounding": off("transitionShare", "Documented running offence."),
  "fast break, balanced scoring": off("transitionShare", "Documented running offence; the balance clause is carried by concentration metrics, which no eligible trait claims."),
  "fast break, depth scoring": off("transitionShare", "Documented running offence."),
  "fast break, early offence": off("transitionShare", "Documented running offence."),
  "running game, off-ball movement": off("transitionShare", "Documented running offence."),
  "transition and post scoring": off("transitionShare", "Documented running offence with a post component; transition is the primary claim."),
  "the canonical pick-and-roll": off("pnrShare", "Documented pick-and-roll offence."),
  "pick-and-roll around a lead guard": off("pnrShare", "Documented pick-and-roll offence."),
  "seven seconds or less: pick-and-roll and spacing": off("pnrShare", "Documented spread pick-and-roll offence."),
  "post and pick-and-roll, disciplined": off("postUpShare", "Documented post-first offence."),
  "post entry to a dominant centre": off("postUpShare", "Documented post-centred offence."),
  "post-centred, interior scoring": off("postUpShare", "Documented post-centred offence."),
  "post-up and isolation, low volume": off("postUpShare", "Documented post-first offence."),
  "post-up and pick-and-roll around an MVP centre": off("postUpShare", "Documented post-first offence."),
  "post-up centre with perimeter spacing": off("postUpShare", "Documented post-centred offence."),
  "triangle around a dominant post centre": off("postUpShare", "Documented triangle offence through the post."),
  "triangle: post reads, cuts, spacing": off("postUpShare", "Documented triangle offence through the post."),
  "isolation and post-up in the half court": off("isolationShare", "Documented isolation-first half-court offence."),
  "motion and cutting": off("movementShare", "Documented motion offence."),
  "motion, ball movement, high-post passing": off("movementShare", "Documented motion offence."),
  "movement shooting and handoffs": off("movementShare", "Documented movement-shooting offence."),
  "movement shooting off screens": off("movementShare", "Documented movement-shooting offence."),
  "movement shooting, off-ball screens, handoffs": off("movementShare", "Documented movement-shooting offence."),
  "spacing around a point-forward, cutting": off("movementShare", "Documented cutting offence around a hub."),
  "half-court motion and passing": off("movementShare", "Documented half-court motion offence."),
  "ball movement, drive and kick, corner threes": T("PLAYMAKING", "STRUCTURALLY_OBSERVABLE", { metric: "assistedRate", direction: ABOVE }, "Documented ball-movement offence: assisted share of makes."),
  "half-court execution, elite passing front line": T("PLAYMAKING", "STRUCTURALLY_OBSERVABLE", { metric: "assistedRate", direction: ABOVE }, "Documented passing-driven offence."),
  "passing-hub centre, cutting and movement": T("PLAYMAKING", "STRUCTURALLY_OBSERVABLE", { metric: "assistedRate", direction: ABOVE }, "Documented hub passing offence."),
  "size-driven drives and offensive rebounding": T("REBOUNDING", "STRUCTURALLY_OBSERVABLE", { metric: "orebRate", direction: ABOVE }, "Documented crash-the-glass offence."),

  // ── defense free text ──────────────────────────────────────────────────────
  "elite physical man": T("DEFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "refPppVsTeam", direction: BELOW }, "Documented elite man defence."),
  "elite scheme-driven man": T("DEFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "refPppVsTeam", direction: BELOW }, "Documented elite man defence."),
  "elite team man defence": T("DEFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "refPppVsTeam", direction: BELOW }, "Documented elite man defence."),
  "elite team man": T("DEFENSE_QUALITY", "PROXY_OBSERVABLE", { metric: "refPppVsTeam", direction: BELOW }, "Documented elite man defence."),
  "elite man with rim protection": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented rim-protecting defence: the reference offence's shot mix is pushed off the rim."),
  "rim-anchored man": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented rim-anchored defence."),
  "rim-protected man": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented rim-protected defence."),
  "drop coverage with a rim anchor": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented drop-coverage defence behind a rim anchor."),
  "switching with a rim anchor": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented switching defence with a rim anchor."),
  "size-heavy man": T("RIM_PROTECTION", "STRUCTURALLY_OBSERVABLE", { metric: "rimShareAgainst", direction: BELOW }, "Documented size-heavy man defence."),
  "pressure man": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented pressure defence: forces steals from the reference offence."),
  "pressure man with help": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented pressure defence."),
  "switching pressure man": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented pressure defence."),
  "switching, aggressive man": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented aggressive switching defence."),
  "physical, trapping man": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented trapping defence."),
  "aggressive switching and trapping": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented trapping defence."),
  "gambling man defence": T("PRESSURE_DEFENSE", "STRUCTURALLY_OBSERVABLE", { metric: "stealRateForced", direction: ABOVE }, "Documented gambling defence."),
  "man with a dominant rebounder": T("REBOUNDING", "STRUCTURALLY_OBSERVABLE", { metric: "orebRateAgainst", direction: BELOW }, "Documented defensive-rebounding strength: the reference offence's second chances are suppressed."),
  "zone-capable, long switching": T("ZONE_IDENTITY", "STRUCTURALLY_OBSERVABLE", { metric: "defensiveZoneShare", direction: ABOVE }, "Documented zone usage.", ["ERA_ALLOWS_ZONE"]),
  "zone-capable, scheme-heavy": T("ZONE_IDENTITY", "STRUCTURALLY_OBSERVABLE", { metric: "defensiveZoneShare", direction: ABOVE }, "Documented zone usage.", ["ERA_ALLOWS_ZONE"]),
  "disciplined man": unobs("DEFENSE_QUALITY", "Discipline names a process quality with no distinguishing observable on this surface: no metric here separates disciplined man defence from ordinary man defence."),
  "disciplined team man": unobs("DEFENSE_QUALITY", "As for disciplined man: no distinguishing observable."),
  "help-heavy man": unobs("DEFENSE_QUALITY", "Help frequency is driven by the coach model's coverage selection and has no certified team-level observable; scoring it would grade the coach model against itself."),
  "man with help": unobs("DEFENSE_QUALITY", "As for help-heavy man."),
  "physical man": unobs("DEFENSE_QUALITY", "Physicality has no observable on this surface: the engine does not simulate fouls-as-style or bodily contact intensity."),
  "switching small-ball": unobs("DEFENSE_QUALITY", "Switch rate appears only in rare coverage records driven by the coach model; too sparse to certify, so it is not scored."),
});

export const buildRegistry = () => {
  const rows = Object.entries(TRAIT_TABLE).map(([traitId, t]) => {
    const metric = t.claim ? METRICS[t.claim.metric] : null;
    if (t.claim && !metric) throw new Error(`trait "${traitId}" claims unknown metric ${t.claim.metric}`);
    return {
      traitId,
      displayName: traitId,
      traitFamily: t.family,
      definition: t.definition,
      sourceEvidenceTypes: ["DOCUMENTED_STYLE"],
      observabilityClass: t.cls,
      requiredMeasurementSurface: metric ? metric.identifiableOn[0] : "NONE",
      primaryMetrics: t.claim ? [t.claim.metric] : [],
      secondaryMetrics: [],
      guardrails: ["invariantViolations=0", "ties=0"],
      expectedDirection: t.claim ? t.claim.direction : "NONE",
      contextDependencies: t.ctx,
      confidenceRules: "Trait confidence is inherited from the fixture's styleIdentityConfidence.",
      scoringEligibility: t.cls !== "UNOBSERVABLE_ON_THIS_SURFACE" && t.claim !== null,
      eligibilityNote: t.cls === "UNOBSERVABLE_ON_THIS_SURFACE" ? "NOT_SCORED_UNOBSERVABLE"
        : t.claim === null ? "NOT_APPLICABLE_NO_DIRECTIONAL_CLAIM"
        : "PENDING_CONTROL_CERTIFICATION",
    };
  });
  const byClass = {}; const byFamily = {};
  for (const r of rows) { byClass[r.observabilityClass] = (byClass[r.observabilityClass] ?? 0) + 1; byFamily[r.traitFamily] = (byFamily[r.traitFamily] ?? 0) + 1; }
  return {
    historicalTraitRegistryVersion: VALIDATION_VERSIONS.historicalTraitRegistryVersion,
    traits: rows,
    counts: { total: rows.length, byClass, byFamily, scoringEligible: rows.filter((r) => r.scoringEligibility).length },
  };
};

export const registryHash = () => createHash("sha256").update(JSON.stringify(TRAIT_TABLE)).digest("hex");

// ── Dependency graph ─────────────────────────────────────────────────────────
export const DEPENDENCY_GROUPS = Object.freeze([
  { id: "MIRROR_PPP", members: ["pppVsReference", "refPppVsTeam"], kind: "ALGEBRAIC_IDENTITY_ON_MIRROR",
    restriction: "On a MIRROR surface, points-per-possession and opponent points-per-possession are the same quantity up to seeded noise (measured max separation in V3: 0.00348). Offence and defence claims must therefore be scored on VS_ERA_REFERENCE and REFERENCE_VS_TEAM respectively — different games, independent counterparties." },
  { id: "ACTION_SHARES", members: ["transitionShare", "pnrShare", "postUpShare", "isolationShare", "movementShare"], kind: "COMPOSITIONAL_SHARED_DENOMINATOR",
    restriction: "Shares of one possession total. A fixture may claim ABOVE on at most three of these simultaneously; more is compositionally self-defeating." },
  { id: "SHOT_MIX", members: ["threeShare", "interiorShotShare", "rimShareAgainst"], kind: "NEAR_COMPLEMENTARY",
    restriction: "Three-point and interior shares trade off against each other (midrange takes the remainder). A fixture may not claim ABOVE on both threeShare and interiorShotShare." },
  { id: "PACE_JOINT", members: ["gamePace"], kind: "JOINTLY_DETERMINED_GAME_QUANTITY",
    restriction: "Both teams in a game share its pace. Pace is attributed to the subject only against the frozen reference, compared with the reference's self-baseline; A-vs-B pace attributes to neither side." },
  { id: "REBOUND_RATE", members: ["orebRate", "orebRateAgainst"], kind: "OPPONENT_CONTESTED",
    restriction: "Rebound rates are contests, so each needs the frozen reference on the other side of the contest." },
  { id: "CONCENTRATION", members: ["topScoringShare"], kind: "ENTROPY_LINKED",
    restriction: "Top-share and share entropy are functions of the same distribution; only topScoringShare exists in the catalogue, and no eligible trait claims it." },
]);

/**
 * Hard-fail detector: given the scored claims for ONE fixture and the surface
 * each would run on, find contradictory or non-identifiable rules.
 * This is the machine that would have rejected the V3 rubric.
 */
export const detectContradictions = (claims) => {
  const problems = [];
  for (const c of claims) {
    const m = METRICS[c.metric];
    if (!m) { problems.push(`unknown metric ${c.metric}`); continue; }
    if (!m.identifiableOn.includes(c.surface)) {
      problems.push(`${c.traitId}: metric ${c.metric} is not identifiable on ${c.surface} (allowed: ${m.identifiableOn.join(", ")})`);
    }
  }
  // same metric claimed in both directions
  const byMetric = {};
  for (const c of claims) (byMetric[c.metric] ??= new Set()).add(c.direction);
  for (const [metric, dirs] of Object.entries(byMetric)) {
    if (dirs.size > 1) problems.push(`metric ${metric} is claimed in contradictory directions on one fixture`);
  }
  // mirror identity group: offence + defence claims resolved onto ONE mirror surface
  const mirrorPpp = claims.filter((c) => DEPENDENCY_GROUPS[0].members.includes(c.metric) && c.surface === "MIRROR");
  if (mirrorPpp.length > 0) problems.push(`MIRROR_PPP group scored on a MIRROR surface: ${mirrorPpp.map((c) => c.traitId).join(", ")} — the exact V3 defect`);
  // compositional overload
  const actionAbove = claims.filter((c) => DEPENDENCY_GROUPS[1].members.includes(c.metric) && c.direction === ABOVE);
  if (actionAbove.length > 3) problems.push(`more than three ACTION_SHARES claimed ABOVE at once (${actionAbove.length})`);
  // shot-mix contradiction
  const three = claims.find((c) => c.metric === "threeShare" && c.direction === ABOVE);
  const interior = claims.find((c) => c.metric === "interiorShotShare" && c.direction === ABOVE);
  if (three && interior) problems.push("threeShare ABOVE and interiorShotShare ABOVE claimed together: near-complementary shot-mix metrics");
  return problems;
};
