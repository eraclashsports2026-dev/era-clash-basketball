// ── Pairwise matchup matrix ──────────────────────────────────────────────────
// 5 defenders × 5 offensive players = 25 pairings, each retaining its component
// dimensions. The matrix deliberately does NOT collapse a pairing into one
// opaque number and throw the reasoning away: a bounded cost exists for the
// optimizer, but every dimension that produced it stays inspectable, because
// "why is Pippen on Curry" has to be answerable afterwards.
import { detectMismatches, mismatchCost } from "./mismatch.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

// Each dimension is "how well does this defender handle this specific problem",
// 0-10, and is weighted by HOW MUCH the threat actually presents that problem.
// A defender's poor post defence is irrelevant against a player who never
// posts, and weighting by threat magnitude is what stops the matrix from
// rewarding generic size.
const dimension = (capability, threatMagnitude) => ({
  fit: r1(clamp(capability, 0, 10)),
  demand: r1(clamp(threatMagnitude, 0, 10)),
  // Shortfall is the part that matters: capability below demand, scaled by how
  // much demand there is. Surplus capability is not a bonus.
  shortfall: r1(clamp(threatMagnitude - capability, 0, 10) * clamp(threatMagnitude / 10, 0, 1)),
});

/** One pairing, fully decomposed. */
export const evaluatePairing = ({ threat, defender, eff, era, scheme }) => {
  const c = defender.capabilities;
  const t = threat.threats;

  const dims = {
    creationContainment: dimension(c.pointOfAttack * 0.6 + c.wingContainment * 0.4, t.primaryCreation),
    sizeCompatibility: dimension(
      // Size compatibility is symmetric-ish: too small against a post threat is
      // a problem, and so is too big against a mover. Bigger is not better.
      defender.physical.heightIn != null && threat.threatHeightIn != null
        ? clamp(10 - Math.max(0, threat.threatHeightIn - defender.physical.heightIn) * 1.1, 0, 10)
        : c.postDefense * 0.5 + c.interiorDefense * 0.5,
      t.postScoring,
    ),
    speedCompatibility: dimension(c.pointOfAttack * 0.5 + defender.physical.speed * 0.5, Math.max(t.primaryCreation, t.rimPressure)),
    postResistance: dimension(c.postDefense, t.postScoring),
    pullUpDefense: dimension(c.pointOfAttack * 0.55 + c.wingContainment * 0.45, t.pullUpShooting),
    movementChase: dimension(c.movementChasing, t.movementShooting),
    screenNavigation: dimension(c.screenNavigation, t.screening * 0.4 + t.movementShooting * 0.6),
    rimAccessPrevention: dimension(c.interiorDefense * 0.5 + c.rimProtection * 0.3 + c.pointOfAttack * 0.2, t.rimPressure),
    spotUpClosing: dimension(c.wingContainment * 0.5 + defender.physical.speed * 0.5, t.spotUpShooting),
    reboundingPosition: dimension(c.defensiveRebounding, t.offensiveRebounding),
    foulRiskExposure: dimension(c.foulDiscipline, t.foulPressure),
    schemeCompatibility: dimension(
      // How well this defender fits the scheme the team intends to play.
      scheme
        ? c.switchability * (scheme.switchingFrequency / 10) * 0.5
          + c.helpDefense * (scheme.helpAggression / 10) * 0.3
          + c.pointOfAttack * (scheme.pressureLevel / 10) * 0.2
          + 4
        : 5,
      5,
    ),
  };

  const mismatches = detectMismatches({ threat, defender, eff, era, usageShare: threat.usageShare });

  // The optimizer's cost. Weighted by usage, because a problem against a 25%
  // usage creator costs far more than the same problem against a 12% usage
  // spot-up shooter — the offence chooses who to involve.
  const usageWeight = clamp(0.35 + threat.usageShare * 3.2, 0.4, 1.5);
  const shortfallCost = Object.values(dims).reduce((a, d) => a + d.shortfall, 0);

  return {
    offensivePlayerId: threat.playerCardId,
    offensivePlayerName: threat.name,
    defenderId: defender.playerCardId,
    defenderName: defender.name,
    dimensions: dims,
    mismatches,
    usageWeight: r1(usageWeight),
    // Two separate costs, kept separate on purpose: dimensional shortfall is
    // the smooth signal the optimizer needs, mismatch cost is the named-problem
    // signal a coach would actually talk about.
    shortfallCost: r1(shortfallCost),
    mismatchCost: r1(mismatchCost(mismatches)),
    cost: r1(shortfallCost * usageWeight + mismatchCost(mismatches) * usageWeight * 0.8),
    severeCount: mismatches.filter((m) => m.severity === "SEVERE").length,
    majorCount: mismatches.filter((m) => m.severity === "MAJOR").length,
    isHide: mismatches.some((m) => m.type === "LOW_USAGE_HIDE_ASSIGNMENT"),
    confidence: defender.confidence.physicalCoverage === "COMPLETE" && threat.threatHeightIn != null
      ? "HIGH" : defender.physical.heightIn != null || threat.threatHeightIn != null ? "MEDIUM" : "LOW",
  };
};

/**
 * The full 25-cell matrix. Rows are defenders, columns are offensive players,
 * both in a CANONICAL order (sorted by card id) so the matrix — and therefore
 * every downstream assignment — cannot depend on array order.
 */
export const buildMatchupMatrix = ({ defenders, threats, eff, era, scheme }) => {
  const d = [...defenders].sort((a, b) => a.playerCardId.localeCompare(b.playerCardId));
  const t = [...threats].sort((a, b) => a.playerCardId.localeCompare(b.playerCardId));
  return {
    defenders: d, threats: t,
    cells: d.map((def) => t.map((thr) => evaluatePairing({ threat: thr, defender: def, eff, era, scheme }))),
  };
};
