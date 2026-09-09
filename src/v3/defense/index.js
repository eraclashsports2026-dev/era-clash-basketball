// ── Defensive Matchup Engine 1.0 — public surface ────────────────────────────
// DEVELOPMENT ONLY. defensiveMatchupVersion 1.0.0, DEVELOPMENT status, behind
// DEFENSIVE_MATCHUP_ENGINE_ENABLED (default false). No production route uses
// it; the production engine remains engineVersion 3.2.0.
//
// The engine changes possession CONDITIONS — shot quality, turnover pressure,
// rim access, help commitment, switch mismatches, foul pressure, recovery
// difficulty, rebound position. It never adds points, never picks a winner,
// and there is no "better assignment = +8" anywhere.
export { DEFENSIVE_MATCHUP_VERSION, buildDefensivePlan, buildDefensivePlans, HELP_ROLES } from "./plan.js";
export { buildThreatProfile, buildDefenderProfile, buildMatchupProfiles } from "./profiles.js";
export { buildMatchupMatrix, evaluatePairing } from "./matrix.js";
export { detectMismatches, MISMATCH_TYPES, SEVERITY, SEVERITY_COST, mismatchCost, band } from "./mismatch.js";
export {
  optimizeAssignments, greedyAssignments, permutations, scorePlan,
  severeBaselineViolations, SEVERE_BASELINE_PENALTY,
} from "./optimizer.js";
export {
  buildSchemePlan, eraLegality, coachToolkit, personnelCeiling, DEFENSIVE_ENVIRONMENTS,
} from "./scheme.js";
export {
  createDefensiveState, defenderFor, stateFor, applySwitch, recoverAssignments, canSwitch,
  considerAdjustment, applyAdjustment, recordExploitation,
  ASSIGNMENT_STATES, ADJUSTMENT_TRIGGERS, ADJUSTMENT_RESPONSES,
  ADJUSTMENT_MIN_EVENTS, ADJUSTMENT_MIN_QUALITY, ADJUSTMENT_COOLDOWN,
  SWITCH_DURATION_POSSESSIONS,
} from "./liveState.js";
export { selectCoverage, COVERAGES } from "./coverage.js";
