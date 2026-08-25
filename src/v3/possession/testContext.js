// ── Prepared-context builder for development, tests and benchmarks ────────────
// A LATER server adapter will build the prepared context from canonical
// server-side data for real requests. This helper exists so tests and
// benchmarks can construct a valid context without one, and it lives beside the
// engine so the two cannot drift.
import { PLAYERS, findCard } from "../../players.js";
import { buildIntelligence } from "../intelligence.js";
import { buildTeamIntelligence } from "../teamIntelligence.js";
import { buildCoachIntelligence } from "../coachIntelligence.js";
import { NEUTRAL_COACH } from "../coaches.js";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export const buildTeamInput = (ids, coachId) => {
  const playerCards = ids.map((id) => {
    const c = findCard(id);
    if (!c) throw new Error(`unknown card "${id}"`);
    return c;
  });
  const playerIntelligence = playerCards.map((c) => buildIntelligence(c, {}));
  const teamIntelligence = buildTeamIntelligence({
    playerCards, playerIntelligence, positionAssignments: POSITIONS, ctx: {},
  });
  return {
    playerCards, playerIntelligence, teamIntelligence,
    coachId,
    coachIntelligence: buildCoachIntelligence(coachId === "neutral" ? NEUTRAL_COACH : coachId),
    positionAssignments: POSITIONS,
  };
};

export const buildPossessionInput = ({
  goldIds, blueIds, coachGoldId = "neutral", coachBlueId = "neutral",
  eraStyleId = "2010s", simulationSeed = 12345, simulationId = "dev", mode = "single",
  defensiveMatchups = true, zoneResolution = true, expandedActions = true, offensiveAdjustments = true,
  // Independently switchable, like the Phase 6B2 modules, because the
  // before/after comparison for this phase depends on being able to run the
  // same seeds with allocation off.
  opportunityAllocation = true,
}) => ({
  simulationId, simulationSeed, mode, eraStyleId, defensiveMatchups, zoneResolution, expandedActions, offensiveAdjustments,
  opportunityAllocation,
  gold: buildTeamInput(goldIds, coachGoldId),
  blue: buildTeamInput(blueIds, coachBlueId),
});
