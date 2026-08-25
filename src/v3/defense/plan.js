// ── The defensive plan ───────────────────────────────────────────────────────
// Deterministic. No game randomness anywhere: the same teams, positions,
// coaches, era and module versions must produce the same baseline plan and the
// same scheme. Temporary switches and in-game changes happen later, driven by
// deterministic possession events from the simulation seed — never by a
// separate random assignment roll.
import { versionOf } from "../../versions.js";
import { strategicEffects } from "../eraStyleIntelligence.js";
import { buildMatchupProfiles } from "./profiles.js";
import { buildMatchupMatrix } from "./matrix.js";
import { buildSchemePlan, eraLegality } from "./scheme.js";
import { optimizeAssignments } from "./optimizer.js";

const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const DEFENSIVE_MATCHUP_VERSION = versionOf("defensiveMatchupVersion");

// ── Help responsibilities (PART 13) ──────────────────────────────────────────
// Separate from the primary assignment. Which of these exist at all is decided
// by era legality: an illegal-defense era cannot post a weak-side helper in
// open space, so that role is simply unavailable rather than being applied at
// reduced strength.
export const HELP_ROLES = [
  "NAIL_HELPER", "LOW_MAN", "RIM_HELPER", "STRONG_SIDE_DENY",
  "WEAK_SIDE_ROTATION", "REBOUND_FINISHER", "SCRAMBLE_RECOVERY",
];

const assignHelpResponsibilities = ({ pairs, scheme, legal }) => {
  const byRim = [...pairs].sort((a, b) => b.defender.capabilities.rimProtection - a.defender.capabilities.rimProtection);
  const byHelp = [...pairs].sort((a, b) => b.defender.capabilities.helpDefense - a.defender.capabilities.helpDefense);
  const byReb = [...pairs].sort((a, b) => b.defender.capabilities.defensiveRebounding - a.defender.capabilities.defensiveRebounding);
  const bySpeed = [...pairs].sort((a, b) => b.defender.physical.speed - a.defender.physical.speed);

  const available = new Set(HELP_ROLES);
  if (legal.illegalDefenseRestrictions) {
    // Off-ball defenders may not stand in non-assignment help positions, so
    // free-roaming weak-side help and nail help are not available structures.
    available.delete("WEAK_SIDE_ROTATION");
    available.delete("NAIL_HELPER");
  }

  const out = [];
  const add = (role, pair, reason) => {
    if (!available.has(role) || !pair) return;
    out.push({ role, defenderId: pair.defender.playerCardId, defenderName: pair.defender.name, reason });
  };

  add("RIM_HELPER", byRim[0], `highest rim protection (${byRim[0].defender.capabilities.rimProtection})`);
  add("LOW_MAN", byRim[1], `second interior presence (${byRim[1].defender.capabilities.rimProtection})`);
  add("NAIL_HELPER", byHelp.find((p) => p.defender.capabilities.helpDefense >= 6), "best help instincts with help positioning legal");
  add("WEAK_SIDE_ROTATION", byHelp[1], "second-best help defender rotates behind the ball");
  add("REBOUND_FINISHER", byReb[0], `best defensive rebounder (${byReb[0].defender.capabilities.defensiveRebounding})`);
  add("SCRAMBLE_RECOVERY", bySpeed[0], "fastest recovery after a scramble");
  if (scheme.pressureLevel >= 6) add("STRONG_SIDE_DENY", bySpeed[1], `pressure scheme (${scheme.pressureLevel}) denies the strong side`);

  return { responsibilities: out, availableRoles: [...available], unavailableRoles: HELP_ROLES.filter((r) => !available.has(r)) };
};

/**
 * Build one team's defensive plan against a specific opponent.
 *
 * @param defendingTeam prepared team (the defence)
 * @param offensiveTeam prepared team (the offence being planned against)
 */
export const buildDefensivePlan = ({ defendingTeam, offensiveTeam, era, eff }) => {
  const effects = eff ?? strategicEffects(era);
  const legal = eraLegality(era);

  const defProfiles = buildMatchupProfiles({ team: defendingTeam, eff: effects, era });
  const offProfiles = buildMatchupProfiles({ team: offensiveTeam, eff: effects, era });

  const scheme = buildSchemePlan({
    coach: defendingTeam.coach, defenders: defProfiles.defenders,
    opponentThreats: offProfiles.threats, era, eff: effects,
  });

  const matrix = buildMatchupMatrix({
    defenders: defProfiles.defenders, threats: offProfiles.threats,
    eff: effects, era, scheme,
  });

  const best = optimizeAssignments({ matrix, scheme });
  const help = assignHelpResponsibilities({ pairs: best.pairs, scheme, legal });

  // Baseline assignments, with the reason retained per pairing so any assignment
  // can be explained afterwards.
  const baselineAssignments = best.pairs.map(({ defender, threat, cell }) => {
    const worst = [...cell.mismatches].sort((a, b) =>
      ({ SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[b.severity] - { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }[a.severity]))[0];
    const strongest = Object.entries(cell.dimensions)
      .filter(([, d]) => d.demand >= 4)
      .sort((a, b) => (b[1].fit - b[1].demand) - (a[1].fit - a[1].demand))[0];
    return {
      offensivePlayerId: threat.playerCardId,
      offensivePlayerName: threat.name,
      offensivePosition: threat.nominalPosition,
      offensiveRole: threat.primaryRole,
      usageShare: threat.usageShare,
      defenderId: defender.playerCardId,
      defenderName: defender.name,
      defenderPosition: defender.nominalPosition,
      // Cross-match is a FACT about the plan, recorded rather than inferred.
      crossMatched: threat.nominalPosition !== defender.nominalPosition,
      isHide: cell.isHide,
      cost: cell.cost,
      severeCount: cell.severeCount,
      majorCount: cell.majorCount,
      mismatches: cell.mismatches,
      confidence: cell.confidence,
      reason: {
        code: cell.isHide ? "HIDE_WEAK_DEFENDER"
          : threat.usageShare >= 0.24 ? "CONTAIN_PRIMARY_THREAT"
          : defender.roleAvailability.canProtectRim && threat.threats.postScoring >= 4.5 ? "PRESERVE_RIM_PROTECTION"
          : threat.nominalPosition !== defender.nominalPosition ? "CROSS_MATCH_FOR_FIT"
          : "POSITIONAL_FIT",
        strongestDimension: strongest ? strongest[0] : null,
        worstMismatch: worst ? { type: worst.type, severity: worst.severity } : null,
      },
    };
  });

  return {
    defensiveMatchupVersion: DEFENSIVE_MATCHUP_VERSION,
    side: defendingTeam.side,
    coachId: defendingTeam.coachId,
    eraStyleId: era.id,
    scheme,
    baselineAssignments,
    help,
    threats: offProfiles.threats,
    defenders: defProfiles.defenders,
    matrix,
    optimization: {
      searchSpace: best.searchSpace,
      evaluated: best.evaluated,
      method: "EXHAUSTIVE_PERMUTATION",
      total: best.score.total,
      components: best.score.components,
      severeBaselineViolations: best.score.violations,
    },
    summary: {
      crossMatches: baselineAssignments.filter((a) => a.crossMatched).length,
      severeMismatches: baselineAssignments.reduce((a, x) => a + x.severeCount, 0),
      majorMismatches: baselineAssignments.reduce((a, x) => a + x.majorCount, 0),
      hidden: baselineAssignments.filter((a) => a.isHide).map((a) => ({ defenderId: a.defenderId, onId: a.offensivePlayerId })),
      rimPreservation: best.score.components.rimPreservation,
    },
    confidence: {
      scheme: scheme.confidence,
      assignments: baselineAssignments.every((a) => a.confidence === "HIGH") ? "HIGH"
        : baselineAssignments.some((a) => a.confidence === "LOW") ? "LOW" : "MEDIUM",
      physicalCoverage: `${defProfiles.defenders.filter((d) => d.confidence.physicalCoverage === "COMPLETE").length}/5 defenders fully measured`,
      note: "Confidence describes how certain the INPUTS are. It never randomises an assignment; low confidence prefers conservative fallbacks.",
    },
  };
};

/** Both plans for a matchup. Each team plans against the other's threats. */
export const buildDefensivePlans = ({ gold, blue, era, eff }) => ({
  gold: buildDefensivePlan({ defendingTeam: gold, offensiveTeam: blue, era, eff }),
  blue: buildDefensivePlan({ defendingTeam: blue, offensiveTeam: gold, era, eff }),
});
