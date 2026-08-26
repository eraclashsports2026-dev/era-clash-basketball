// ── Formal holdout supported-scope policy ───────────────────────────────────
// Frozen BEFORE either holdout is opened. Its hash is asserted by a test.
//
// A holdout is only evidence about the things it can actually measure. The
// historical holdout's team-level target coverage is 24 of 240 cells: 196
// licence-blocked and 20 never recorded in their era. A validation that treated
// those 216 cells as zero error would report a near-perfect score that means
// nothing, and one that treated them as failures would reject a candidate for
// data it was never given.
//
// So every metric is classified, and the classification decides whether it can
// contribute to a verdict. Excluded metrics contribute NO error, NO pass credit
// and NO failure — and they are listed, because a reader who cannot see what was
// excluded cannot judge what the verdict is worth.
//
// This policy inspects only target AVAILABILITY, CONFIDENCE and COUNTS. It has
// not seen, and must not see, any candidate output on a holdout fixture.
import { createHash } from "node:crypto";
import { versionOf } from "../../versions.js";

export const HOLDOUT_SUPPORTED_SCOPE_VERSION = versionOf("holdoutSupportedScopeVersion");

export const SUPPORT_CLASSES = Object.freeze({
  SUPPORTED_NUMERIC: "A historically recorded value with accepted provenance, comparable to something the engine produces.",
  SUPPORTED_PROXY: "An explicitly labelled proxy — a derived season share over a documented five, not an observed possession-level quantity.",
  SUPPORTED_QUALITATIVE: "A documented identity or direction, judged against a predeclared rubric rather than a number.",
  STRUCTURAL_GUARDRAIL: "A property of the simulation itself: statistical invariants, deterministic replay, role hierarchy, era authority, side symmetry, basketball mechanics.",
  UNAVAILABLE: "No target exists. Either never recorded in the era, or blocked by the current source-licence position.",
  NOT_APPLICABLE: "A target exists and is authorized, but describes something this evaluation surface does not produce.",
});

/**
 * How a target-file availability marker maps onto a support class.
 *
 * `RECORDED_STATISTIC` earns SUPPORTED_NUMERIC only if the metric is also
 * comparable to an engine output; comparability is decided separately below,
 * because a real number the engine never produces is still not evidence.
 */
export const AVAILABILITY_MAP = Object.freeze({
  RECORDED_STATISTIC: "SUPPORTED_NUMERIC",
  DERIVED_FROM_AUTHORIZED_TOTALS: "SUPPORTED_NUMERIC",
  SELECTED_FIVE_SEASON_SHARE_PROXY: "SUPPORTED_PROXY",
  DOCUMENTED_STYLE: "SUPPORTED_QUALITATIVE",
  NOT_RECORDED_IN_ERA: "UNAVAILABLE",
  SOURCE_BLOCKED_LICENSING: "UNAVAILABLE",
});

/**
 * Team-season metrics that are recorded and authorized, but describe a SEASON
 * against a real 82-game schedule of real opponents. This evaluation simulates
 * one documented five against a mirror of itself, which produces no schedule and
 * no opponents, so a season win total has nothing to compare against.
 *
 * Listed explicitly rather than dropped: they are NOT_APPLICABLE, not missing.
 */
export const NOT_APPLICABLE_TEAM_METRICS = Object.freeze({
  games: "A season game count. The evaluation surface is a fixed number of simulated games, chosen by the frozen sample plan, not by the historical schedule.",
  wins: "A season win total against a real schedule of real opponents. No opponent targets exist for those opponents, and the fixture has no schedule, so there is nothing to compare a simulated win total to.",
  losses: "The complement of wins, and unavailable for the same reason.",
});

/**
 * The metrics this holdout CAN adjudicate, with the surface each is measured on.
 * Frozen before any holdout run.
 */
export const EVALUATION_SURFACES = Object.freeze({
  playerScoringShares: { class: "SUPPORTED_PROXY", surface: "share of the selected five's points", primary: true },
  playerReboundShares: { class: "SUPPORTED_PROXY", surface: "share of the selected five's rebounds", primary: true },
  playerAssistShares: { class: "SUPPORTED_PROXY", surface: "share of the selected five's assists", primary: true },
  playerStealShares: { class: "SUPPORTED_PROXY", surface: "share of the selected five's steals", primary: false },
  playerBlockShares: { class: "SUPPORTED_PROXY", surface: "share of the selected five's blocks", primary: false },
  identityTraits: { class: "SUPPORTED_QUALITATIVE", surface: "documented style traits against a directional rubric", primary: false },
  statisticalInvariants: { class: "STRUCTURAL_GUARDRAIL", surface: "player lines sum to team lines, AST <= FGM, STL <= opponent TO, OREB+DREB = REB", primary: true },
  deterministicReplay: { class: "STRUCTURAL_GUARDRAIL", surface: "identical input and seed reproduce an identical result", primary: true },
  finalTies: { class: "STRUCTURAL_GUARDRAIL", surface: "no game ends level", primary: true },
  impossibleStatistics: { class: "STRUCTURAL_GUARDRAIL", surface: "no player or team line outside physically possible bounds", primary: true },
  roleHierarchy: { class: "STRUCTURAL_GUARDRAIL", surface: "the documented lead scorer is not systematically outscored by the documented fifth option", primary: true },
  opportunityConcentration: { class: "STRUCTURAL_GUARDRAIL", surface: "top-option share of the five stays inside frozen bounds", primary: true },
  eraRuleAuthority: { class: "STRUCTURAL_GUARDRAIL", surface: "era rules bind: no three-point attempts in a pre-1979 era style", primary: true },
});

/**
 * The directional rubric for qualitative identity traits.
 *
 * Predeclared, and deliberately weak: a documented style trait constrains a
 * DIRECTION, not a magnitude, so it can only ever falsify a candidate that
 * behaves opposite to the record. Passing it is not evidence of accuracy.
 */
export const IDENTITY_RUBRIC = Object.freeze({
  ELITE_DEFENSE: { metric: "opponentPointsPerPossession", direction: "BELOW_CORPUS_MEDIAN" },
  ELITE_OFFENSE: { metric: "pointsPerPossession", direction: "ABOVE_CORPUS_MEDIAN" },
  PACE_PUSHING: { metric: "possessions", direction: "ABOVE_CORPUS_MEDIAN" },
  SLOW_PACE: { metric: "possessions", direction: "BELOW_CORPUS_MEDIAN" },
  THREE_POINT_VOLUME: { metric: "threeShare", direction: "ABOVE_CORPUS_MEDIAN" },
  INTERIOR_DOMINANT: { metric: "rimShare", direction: "ABOVE_CORPUS_MEDIAN" },
  WEAK_OFFENSIVE_REBOUNDING: { metric: "offensiveReboundShare", direction: "BELOW_CORPUS_MEDIAN" },
  STRONG_REBOUNDING: { metric: "reboundsPerGame", direction: "ABOVE_CORPUS_MEDIAN" },
  unscoredTraits: "A trait with no entry here is recorded and NOT scored. Inventing a rubric for it after seeing the corpus would make the rubric a function of the result.",
});

export const OPPORTUNITY_BOUNDS = Object.freeze({
  minTopOptionShare: 0.18,
  maxTopOptionShare: 0.45,
  note: "An even split across five is 0.20. These bounds admit a genuine first option without admitting a one-man team, and were carried from the internal opportunity guardrails rather than chosen here.",
});

export const SCOPE_POLICY = Object.freeze({
  version: HOLDOUT_SUPPORTED_SCOPE_VERSION,
  phase: "6C3",
  frozenBeforeAnyHoldoutOpening: true,
  inspectedOnly: ["target availability", "target confidence", "metric counts", "fixture counts", "era coverage"],
  neverInspected: ["candidate holdout outputs", "candidate holdout errors", "candidate holdout win rates", "candidate holdout distributions"],
  SUPPORT_CLASSES, AVAILABILITY_MAP, NOT_APPLICABLE_TEAM_METRICS,
  EVALUATION_SURFACES, IDENTITY_RUBRIC, OPPORTUNITY_BOUNDS,
  exclusionRule: "An UNAVAILABLE or NOT_APPLICABLE metric contributes no error term, no pass credit and no failure. It is reported in the limitations of every artifact that would otherwise appear to have measured it.",
  zeroFillForbidden: true,
  zeroFillNote: "A missing target must never be read as an observed zero. 196 of 240 team-level cells are licence-blocked; zero-filling them would produce a near-perfect score that measures nothing.",
});

export const scopePolicyHash = () => createHash("sha256").update(JSON.stringify(SCOPE_POLICY)).digest("hex");

/** Classify one team-target field object from the target file. */
export const classifyTeamField = (id, field) => {
  if (NOT_APPLICABLE_TEAM_METRICS[id]) {
    return { id, supportClass: "NOT_APPLICABLE", availability: field?.availability ?? null,
      reason: NOT_APPLICABLE_TEAM_METRICS[id], evaluated: false };
  }
  const a = field?.availability ?? (field?.value == null ? "NULL_NO_REASON" : "RECORDED_STATISTIC");
  const cls = AVAILABILITY_MAP[a] ?? "UNAVAILABLE";
  return { id, supportClass: cls, availability: a, value: field?.value ?? null,
    evaluated: cls === "SUPPORTED_NUMERIC" && field?.value != null,
    reason: cls === "UNAVAILABLE"
      ? (a === "NOT_RECORDED_IN_ERA" ? "Never recorded in this era." : "Blocked by the current source-licence position.")
      : null };
};
