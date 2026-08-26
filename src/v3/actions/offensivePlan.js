// ── Offensive game plan and coach adjustments ───────────────────────────────
// coachAdjustmentVersion 1.0.0, DEVELOPMENT, behind
// OFFENSIVE_COACH_ADJUSTMENTS_ENABLED.
//
// The mirror of the defensive adjustment engine, and it obeys the same rules:
// triggers read PROCESS (expected shot quality, rim access, turnover rate)
// rather than points, so a made contested three is not evidence and a missed
// open one still is. Adjustments change the ACTION MIX, never the score.
//
// Frequency is bounded and measurable. It is NOT calibrated against real
// coaching behaviour — that is Phase 6C — and nothing here claims otherwise.
import { versionOf } from "../../versions.js";
import { FAMILY_CAPS } from "./families.js";
import { noteParameterRead, traceEnabled } from "../calibration/runtimeParameters.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;

export const COACH_ADJUSTMENT_VERSION = versionOf("coachAdjustmentVersion");

export const OFFENSIVE_TRIGGERS = [
  "POST_MISMATCH_AVAILABLE", "WEAK_DEFENDER_EXPOSED", "ZONE_HIGH_POST_OPEN", "ZONE_CORNER_OPEN",
  "PNR_SUCCESS", "PNR_FAILURE", "ISOLATION_SUCCESS", "ISOLATION_FAILURE",
  "MOVEMENT_SHOOTER_FREED", "PAINT_CONGESTION", "TURNOVER_SPIKE", "RIM_ATTEMPTS_BLOCKED",
  "OFFENSIVE_REBOUND_EDGE", "PRIMARY_CREATOR_NEUTRALIZED",
];

export const OFFENSIVE_RESPONSES = [
  "INCREASE_POST_TARGETING", "INCREASE_ISOLATION_TARGETING", "INCREASE_PNR", "REDUCE_PNR",
  "INCREASE_OFF_BALL_SCREENS", "INCREASE_HANDOFFS", "ATTACK_ZONE_HIGH_POST", "ATTACK_ZONE_CORNERS",
  "CHANGE_PRIMARY_INITIATOR", "INCREASE_PACE", "REDUCE_PACE",
  "INCREASE_CRASH_GLASS", "REDUCE_CRASH_GLASS", "IMPROVE_SPACING", "REDUCE_CREATOR_CONCENTRATION",
];

// Evidence bars, deliberately not one possession. Same shape as the defensive
// engine so the two are comparable.
export const OFF_ADJUSTMENT_MIN_EVENTS = 6;
export const OFF_ADJUSTMENT_COOLDOWN = 30;
// No single family may be pushed past this share of the mix by adjustments,
// so the offence can never become one action.
export const MAX_ADJUSTED_SHARE = 0.42;
export const ADJUSTMENT_STEP = 0.06;

/** Which responses this coach's documented system actually supports. */
export const offensiveToolkit = (team) => {
  const t = {
    post: team.postPref ?? 5, iso: team.isoPref ?? 5, pnr: team.pnrPref ?? 5,
    offBall: team.offBallPref ?? 5, handoff: team.handoffPref ?? 5, cut: team.cutPref ?? 5,
    tempo: team.tempo ?? 5, crashGlass: team.crashGlass ?? 5,
    adaptability: team.coach?.management?.adaptability ?? 5,
    tacticalAdjustment: team.coach?.management?.tacticalAdjustment ?? 5,
    roleDiscipline: team.coach?.management?.roleDiscipline ?? 5,
  };
  // A response is supported when the coach's documented tendency for it is
  // real. This is what stops every coach from becoming equally adaptable:
  // D'Antoni gets the pick-and-roll levers, Kerr the off-ball ones, Jackson the
  // post ones — from the researched fields, not from a stereotype.
  t.supports = {
    INCREASE_POST_TARGETING: t.post >= 4,
    INCREASE_ISOLATION_TARGETING: t.iso >= 4,
    INCREASE_PNR: t.pnr >= 4,
    REDUCE_PNR: t.pnr >= 3,
    INCREASE_OFF_BALL_SCREENS: t.offBall >= 5,
    INCREASE_HANDOFFS: t.handoff >= 5,
    ATTACK_ZONE_HIGH_POST: true,
    ATTACK_ZONE_CORNERS: true,
    CHANGE_PRIMARY_INITIATOR: t.roleDiscipline <= 8 && t.adaptability >= 5,
    INCREASE_PACE: t.tempo >= 5,
    REDUCE_PACE: t.tempo <= 7,
    INCREASE_CRASH_GLASS: t.crashGlass >= 4,
    REDUCE_CRASH_GLASS: t.crashGlass >= 3,
    IMPROVE_SPACING: true,
    REDUCE_CREATOR_CONCENTRATION: t.adaptability >= 6,
  };
  return t;
};

/** The baseline offensive game plan. Deterministic. */
export const buildOffensivePlan = ({ offense, defense, defPlan, eff, baselineMix }) => {
  const toolkit = offensiveToolkit(offense);
  return {
    coachAdjustmentVersion: COACH_ADJUSTMENT_VERSION,
    side: offense.side,
    coachId: offense.coachId,
    baselineActionMix: { ...baselineMix },
    currentActionMix: { ...baselineMix },
    creatorHierarchy: offense.players
      .map((p) => ({ cardId: p.cardId, tier: p.creationTier, usageShare: p.usageShare }))
      .sort((a, b) => b.usageShare - a.usageShare),
    mismatchTargets: [],
    paceTarget: offense.tempo,
    spacingPriority: r1(offense.offense.spacing),
    crashGlassPriority: r1(offense.crashGlass),
    zoneAttackPlan: defPlan?.zoneShell
      ? { shellType: defPlan.zoneShell.shellType, primaryGaps: defPlan.zoneShell.pressurePoints }
      : null,
    adjustmentHistory: [],
    toolkit,
    // Rolling process evidence, keyed by family.
    evidence: {},
  };
};

/** Record what a family actually produced. Quality and process, not points. */
export const recordOffensiveOutcome = (plan, { family, shotQuality, outcome, shotCategory, targetedMismatch }) => {
  const e = plan.evidence[family] ?? { events: 0, qualitySum: 0, turnovers: 0, blocked: 0, rimAttempts: 0, mismatchAttacks: 0 };
  e.events++;
  e.qualitySum += Number(shotQuality) || 0;
  if (outcome === "TURNOVER_STOLEN" || outcome === "TURNOVER_UNFORCED") e.turnovers++;
  if (shotCategory === "RIM") e.rimAttempts++;
  if (targetedMismatch) e.mismatchAttacks++;
  plan.evidence[family] = e;
  return e;
};

/**
 * Consider a bounded offensive adjustment. Deterministic given the same state
 * and possession index.
 */
export const considerOffensiveAdjustment = ({ plan, offense, defPlan, defState, possessionIndex, eff, params = null }) => {
  // The registry's declared defaults for these were WRONG before Phase 6C2C3:
  // it claimed a cooldown of 12, a value liveState.js records as deliberately
  // abandoned because it produced ~3.3 assignment changes a game. The registry
  // now carries the values the engine actually runs, split per engine.
  const minEvents = params ? params.get.coach.offensiveAdjustmentMinEvents : OFF_ADJUSTMENT_MIN_EVENTS;
  const cooldown = params ? params.get.coach.offensiveAdjustmentCooldown : OFF_ADJUSTMENT_COOLDOWN;
  const step = params ? params.get.coach.adjustmentMagnitude : ADJUSTMENT_STEP;
  if (params && traceEnabled()) {
    noteParameterRead("coach.offensiveAdjustmentMinEvents", minEvents);
    noteParameterRead("coach.offensiveAdjustmentCooldown", cooldown);
    noteParameterRead("coach.adjustmentMagnitude", step);
  }
  const last = plan.adjustmentHistory[plan.adjustmentHistory.length - 1];
  if (last && possessionIndex - last.possessionIndex < cooldown) return null;

  const tk = plan.toolkit;
  // A rigid coach demands more evidence. This is the difference between
  // coaches, not a random gate.
  const needed = minEvents + Math.round(clamp((10 - tk.adaptability) * 0.7, 0, 6));
  const mean = (f) => {
    const e = plan.evidence[f];
    return e && e.events >= needed ? e.qualitySum / e.events : null;
  };

  // ── Triggers, ordered by how strong the evidence is ──────────────────────
  const candidates = [];

  // A live post mismatch that is NOT being attacked is the clearest signal.
  const postMism = defPlan ? plan.mismatchTargets.find((m) => m.type === "POST_MISMATCH") : null;
  const postShare = plan.currentActionMix.POST_UP ?? 0;
  if (postMism && postShare < 0.3) {
    candidates.push({ trigger: "POST_MISMATCH_AVAILABLE", response: "INCREASE_POST_TARGETING", strength: 3, detail: `a ${postMism.severity.toLowerCase()} post mismatch is available and post share is ${(postShare * 100).toFixed(0)}%` });
  }

  const pnrQ = mean("PICK_AND_ROLL");
  if (pnrQ != null && pnrQ >= 6) candidates.push({ trigger: "PNR_SUCCESS", response: "INCREASE_PNR", strength: 2, detail: `pick-and-roll is generating ${r1(pnrQ)} quality` });
  if (pnrQ != null && pnrQ <= 4.2) candidates.push({ trigger: "PNR_FAILURE", response: "REDUCE_PNR", strength: 2, detail: `pick-and-roll is generating only ${r1(pnrQ)} quality` });

  const isoQ = mean("ISOLATION");
  if (isoQ != null && isoQ >= 6) candidates.push({ trigger: "ISOLATION_SUCCESS", response: "INCREASE_ISOLATION_TARGETING", strength: 2, detail: `isolation is generating ${r1(isoQ)} quality` });
  if (isoQ != null && isoQ <= 4) candidates.push({ trigger: "ISOLATION_FAILURE", response: "INCREASE_OFF_BALL_SCREENS", strength: 2, detail: `isolation is generating only ${r1(isoQ)} quality` });

  const screenQ = mean("OFF_BALL_SCREEN");
  if (screenQ != null && screenQ >= 6) candidates.push({ trigger: "MOVEMENT_SHOOTER_FREED", response: "INCREASE_OFF_BALL_SCREENS", strength: 2, detail: `off-ball screens are generating ${r1(screenQ)} quality` });

  // Rim attempts being blocked, or the paint congested: stop driving into it.
  const allEvents = Object.values(plan.evidence).reduce((a, e) => a + e.events, 0);
  const allRim = Object.values(plan.evidence).reduce((a, e) => a + e.rimAttempts, 0);
  if (allEvents >= needed * 2 && allRim / Math.max(1, allEvents) >= 0.45 && (defPlan?.defenders ?? []).some((d) => d.capabilities.rimProtection >= 8)) {
    candidates.push({ trigger: "PAINT_CONGESTION", response: "IMPROVE_SPACING", strength: 1, detail: "too many attempts at a protected rim" });
  }
  const allTo = Object.values(plan.evidence).reduce((a, e) => a + e.turnovers, 0);
  if (allEvents >= needed * 2 && allTo / Math.max(1, allEvents) >= 0.2) {
    candidates.push({ trigger: "TURNOVER_SPIKE", response: "REDUCE_CREATOR_CONCENTRATION", strength: 2, detail: `turnovers on ${((allTo / allEvents) * 100).toFixed(0)}% of tracked possessions` });
  }

  // Zone-specific.
  if (plan.zoneAttackPlan) {
    if (plan.zoneAttackPlan.primaryGaps.includes("HIGH_POST")) candidates.push({ trigger: "ZONE_HIGH_POST_OPEN", response: "ATTACK_ZONE_HIGH_POST", strength: 2, detail: `${plan.zoneAttackPlan.shellType} concedes the high post` });
    if (plan.zoneAttackPlan.primaryGaps.includes("CORNER")) candidates.push({ trigger: "ZONE_CORNER_OPEN", response: "ATTACK_ZONE_CORNERS", strength: 2, detail: `${plan.zoneAttackPlan.shellType} concedes the corners` });
  }

  // The primary creator being contained is a reason to move the ball.
  const primary = plan.creatorHierarchy[0];
  if (primary && defState) {
    const onPrimary = defState.currentAssignments.get(primary.cardId);
    const cell = defPlan?.matrix.cells[defPlan.matrix.defenders.findIndex((d) => d.playerCardId === onPrimary)]
      ?.find((c) => c.offensivePlayerId === primary.cardId);
    if (cell && cell.cost <= 3 && allEvents >= needed) {
      candidates.push({ trigger: "PRIMARY_CREATOR_NEUTRALIZED", response: "CHANGE_PRIMARY_INITIATOR", strength: 2, detail: "the primary creator is comfortably guarded" });
    }
  }

  if (!candidates.length) return null;

  // Strongest evidence first, then a deterministic tie-break on trigger name.
  candidates.sort((a, b) => b.strength - a.strength || a.trigger.localeCompare(b.trigger));

  // A response whose lever is already at its ceiling is not available: the
  // coach has already made that change. Without this the same trigger fired
  // every cooldown and the history filled with seven identical entries after
  // the mix had stopped moving.
  const atCeiling = (response) => {
    const FAMILY_OF = {
      INCREASE_POST_TARGETING: "POST_UP", INCREASE_ISOLATION_TARGETING: "ISOLATION",
      INCREASE_PNR: "PICK_AND_ROLL", INCREASE_OFF_BALL_SCREENS: "OFF_BALL_SCREEN",
      INCREASE_HANDOFFS: "HANDOFF", ATTACK_ZONE_HIGH_POST: "ZONE_ATTACK",
      ATTACK_ZONE_CORNERS: "ZONE_ATTACK", IMPROVE_SPACING: "SPOT_UP",
    };
    const fam = FAMILY_OF[response];
    if (!fam) return false;
    const cap = Math.min(MAX_ADJUSTED_SHARE, FAMILY_CAPS[fam] ?? 0.4);
    return (plan.currentActionMix[fam] ?? 0) >= cap - 0.005;
  };

  // The first candidate this coach's system supports AND has room to move.
  for (const c of candidates) {
    if (tk.supports[c.response] && !atCeiling(c.response)) {
      return {
        rejected: false, possessionIndex, trigger: c.trigger, response: c.response, detail: c.detail,
        // Adaptability shapes how much the mix moves, bounded.
        magnitude: r2(step * clamp(0.5 + tk.tacticalAdjustment * 0.08, 0.5, 1.3)),
      };
    }
  }

  // Nothing supported. Recorded, so "why didn't the coach adjust" is answerable.
  return {
    rejected: true, possessionIndex, trigger: candidates[0].trigger,
    reason: "NO_SUPPORTED_OFFENSIVE_ADJUSTMENT",
    detail: `${candidates[0].response} is not supported by this coach's documented system`,
  };
};

/** Apply an adjustment to the action mix. Bounded and renormalised. */
export const applyOffensiveAdjustment = (plan, adj) => {
  const id = `off-${plan.adjustmentHistory.length + 1}`;
  if (!adj || adj.rejected) {
    if (adj) plan.adjustmentHistory.push({ ...adj, id });
    return null;
  }

  const mix = { ...plan.currentActionMix };
  const touchedFamilies = [];
  const bump = (family, delta) => {
    const cap = Math.min(MAX_ADJUSTED_SHARE, FAMILY_CAPS[family] ?? 0.4);
    mix[family] = r2(clamp((mix[family] ?? 0) + delta, 0, cap));
    if (delta > 0) touchedFamilies.push(family);
  };

  switch (adj.response) {
    case "INCREASE_POST_TARGETING": bump("POST_UP", adj.magnitude); break;
    case "INCREASE_ISOLATION_TARGETING": bump("ISOLATION", adj.magnitude); break;
    case "INCREASE_PNR": bump("PICK_AND_ROLL", adj.magnitude); break;
    case "REDUCE_PNR": bump("PICK_AND_ROLL", -adj.magnitude); break;
    case "INCREASE_OFF_BALL_SCREENS": bump("OFF_BALL_SCREEN", adj.magnitude); break;
    case "INCREASE_HANDOFFS": bump("HANDOFF", adj.magnitude); break;
    case "ATTACK_ZONE_HIGH_POST": case "ATTACK_ZONE_CORNERS": bump("ZONE_ATTACK", adj.magnitude); break;
    case "IMPROVE_SPACING": bump("SPOT_UP", adj.magnitude); bump("POST_UP", -adj.magnitude * 0.5); break;
    case "REDUCE_CREATOR_CONCENTRATION": bump("ISOLATION", -adj.magnitude); bump("SPOT_UP", adj.magnitude * 0.5); bump("CUT", adj.magnitude * 0.5); break;
    case "CHANGE_PRIMARY_INITIATOR":
      // A role change, not a mix change: the second creator initiates.
      if (plan.creatorHierarchy.length > 1) {
        const [a, b] = plan.creatorHierarchy;
        plan.creatorHierarchy[0] = b; plan.creatorHierarchy[1] = a;
      }
      break;
    case "INCREASE_PACE": plan.paceTarget = r1(clamp(plan.paceTarget + 0.6, 0, 10)); break;
    case "REDUCE_PACE": plan.paceTarget = r1(clamp(plan.paceTarget - 0.6, 0, 10)); break;
    case "INCREASE_CRASH_GLASS": plan.crashGlassPriority = r1(clamp(plan.crashGlassPriority + 0.5, 0, 10)); break;
    case "REDUCE_CRASH_GLASS": plan.crashGlassPriority = r1(clamp(plan.crashGlassPriority - 0.5, 0, 10)); break;
    default: break;
  }

  // Renormalise so the mix stays a distribution — but make room by scaling the
  // OTHER families, not the one just adjusted. Scaling everything pulled the
  // bumped family straight back below its cap, so it never reached a ceiling,
  // the "already at the ceiling" check never fired, and the same trigger
  // repeated every cooldown for the whole game.
  const touched = new Set(touchedFamilies);
  const families = Object.keys(mix).filter((k) => k !== "GENERIC_HALF_COURT" && k !== "TRANSITION");
  const others = families.filter((k) => !touched.has(k));
  const claimed = families.reduce((a, k) => a + (mix[k] ?? 0), 0);
  if (claimed > 0.9) {
    const protectedSum = families.filter((k) => touched.has(k)).reduce((a, k) => a + (mix[k] ?? 0), 0);
    const room = Math.max(0.05, 0.9 - protectedSum);
    const otherSum = others.reduce((a, k) => a + (mix[k] ?? 0), 0);
    if (otherSum > room) {
      const scale = room / otherSum;
      for (const k of others) mix[k] = r2(mix[k] * scale);
    }
    mix.GENERIC_HALF_COURT = 0.1;
  } else {
    mix.GENERIC_HALF_COURT = r2(1 - claimed);
  }

  plan.currentActionMix = mix;
  // Evidence resets for the changed family: the next decision must be earned.
  plan.evidence = {};
  plan.adjustmentHistory.push({ ...adj, id });
  return { ...adj, id };
};

/** Refresh the live mismatch targets the offence knows about. */
export const refreshMismatchTargets = (plan, { defPlan, defState, offense }) => {
  if (!defPlan) { plan.mismatchTargets = []; return; }
  const out = [];
  for (const p of offense.players) {
    const defId = defState ? defState.currentAssignments.get(p.cardId) : null;
    if (!defId) continue;
    const di = defPlan.matrix.defenders.findIndex((d) => d.playerCardId === defId);
    const cell = defPlan.matrix.cells[di]?.find((c) => c.offensivePlayerId === p.cardId);
    if (!cell) continue;
    for (const m of cell.mismatches) {
      if (["SEVERE", "MAJOR"].includes(m.severity)) out.push({ type: m.type, severity: m.severity, offensivePlayerId: p.cardId, defenderId: defId });
    }
  }
  plan.mismatchTargets = out;
};
