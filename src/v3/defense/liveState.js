// ── Live defensive assignment state ──────────────────────────────────────────
// The baseline plan is deterministic and computed once. THIS is where a game
// happens to it: switches, scrambles, transition cross-matches and bounded
// coach adjustments.
//
// The critical invariant: a temporary switch must NOT permanently rewrite the
// baseline. Only an explicit coach reassignment changes the plan. Without that
// separation, one broken play in the first quarter silently becomes the
// matchup for the rest of the game, which is how Magic Johnson ends up
// "guarding" David Robinson for 40 minutes with no explanation.
import { noteParameterRead, traceEnabled } from "../calibration/runtimeParameters.js";
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

export const ASSIGNMENT_STATES = [
  "BASELINE", "TEMPORARY_SWITCH", "SCRAMBLE", "RECOVERING", "CROSS_MATCHED", "COACH_REASSIGNED",
];

// A switch persists for a bounded number of possessions before the defence
// gets back to its plan. Not instant (a switch that reverts immediately is not
// a switch) and not permanent.
export const SWITCH_DURATION_POSSESSIONS = 1;
export const SCRAMBLE_DURATION_POSSESSIONS = 1;

export const createDefensiveState = (plan) => {
  const baseline = new Map();
  for (const a of plan.baselineAssignments) baseline.set(a.offensivePlayerId, a.defenderId);
  return {
    side: plan.side,
    defensiveMatchupVersion: plan.defensiveMatchupVersion,
    schemeId: `${plan.scheme.shellType}:${plan.scheme.ballScreenCoverage}`,
    scheme: plan.scheme,
    baselineAssignments: baseline,
    currentAssignments: new Map(baseline),
    assignmentStates: new Map([...baseline.keys()].map((k) => [k, "BASELINE"])),
    // Why the current assignment differs from baseline, per offensive player.
    assignmentSource: new Map(),
    expiry: new Map(),
    help: plan.help,
    mismatchFlags: [],
    // How often the offence has attacked each matchup successfully. The trigger
    // for a coach adjustment — and it counts SHOT QUALITY, not points, so a
    // made contested three does not panic anybody.
    exploitation: new Map(),
    assignmentChangeHistory: [],
    coverageUsage: new Map(),
    switchCount: 0,
    scrambleCount: 0,
    crossMatchCount: 0,
    unrecoveredMismatches: 0,
    confidence: plan.confidence,
  };
};

/** Who is currently guarding this offensive player. */
export const defenderFor = (state, offensivePlayerId) =>
  state.currentAssignments.get(offensivePlayerId) ?? state.baselineAssignments.get(offensivePlayerId) ?? null;

export const stateFor = (state, offensivePlayerId) =>
  state.assignmentStates.get(offensivePlayerId) ?? "BASELINE";

/**
 * Swap two assignments temporarily. Both offensive players change defender —
 * that is what a switch IS, and modelling only one side would leave a defender
 * covering two men.
 */
export const applySwitch = (state, { offA, offB, source, possessionIndex, mismatchType = null }) => {
  const dA = defenderFor(state, offA), dB = defenderFor(state, offB);
  if (!dA || !dB || dA === dB) return null;
  state.currentAssignments.set(offA, dB);
  state.currentAssignments.set(offB, dA);
  const st = source === "SCRAMBLE" ? "SCRAMBLE" : source === "TRANSITION" ? "CROSS_MATCHED" : "TEMPORARY_SWITCH";
  state.assignmentStates.set(offA, st);
  state.assignmentStates.set(offB, st);
  const dur = source === "SCRAMBLE" ? SCRAMBLE_DURATION_POSSESSIONS : SWITCH_DURATION_POSSESSIONS;
  state.expiry.set(offA, possessionIndex + dur);
  state.expiry.set(offB, possessionIndex + dur);
  state.assignmentSource.set(offA, { source, since: possessionIndex, recoverTo: dA, mismatchType });
  state.assignmentSource.set(offB, { source, since: possessionIndex, recoverTo: dB, mismatchType });
  if (st === "TEMPORARY_SWITCH") state.switchCount++;
  else if (st === "SCRAMBLE") state.scrambleCount++;
  else state.crossMatchCount++;
  return { offA, offB, newDefenderA: dB, newDefenderB: dA, state: st, source };
};

/** Recover any expired temporary assignment back to the baseline plan. */
export const recoverAssignments = (state, possessionIndex) => {
  const recovered = [];
  for (const [offId, expiresAt] of [...state.expiry.entries()]) {
    if (possessionIndex < expiresAt) continue;
    const base = state.baselineAssignments.get(offId);
    const st = stateFor(state, offId);
    if (st === "COACH_REASSIGNED") { state.expiry.delete(offId); continue; }
    if (state.currentAssignments.get(offId) !== base) {
      state.currentAssignments.set(offId, base);
      recovered.push(offId);
    }
    state.assignmentStates.set(offId, "BASELINE");
    state.assignmentSource.delete(offId);
    state.expiry.delete(offId);
  }
  return recovered;
};

/**
 * Whether these two defenders can switch this screen. Depends on BOTH — a
 * lineup is switchable collectively or only at selected positions, and one
 * player's rating is not enough. Era matters too: pre-rotation and off-ball
 * loading around a switch are limited where illegal-defense guidelines apply.
 */
export const canSwitch = ({ defenderA, defenderB, scheme, threatA, threatB }) => {
  const a = defenderA.capabilities.switchability, b = defenderB.capabilities.switchability;
  const pair = Math.min(a, b) * 0.65 + ((a + b) / 2) * 0.35;
  // The size gap the switch would create is the real constraint: switching a
  // 74in guard onto a post hub is not a switch, it is a surrender.
  const sizeGap = defenderA.physical.heightIn != null && defenderB.physical.heightIn != null
    ? Math.abs(defenderA.physical.heightIn - defenderB.physical.heightIn) : 4;
  const postExposure = Math.max(threatA?.threats.postScoring ?? 0, threatB?.threats.postScoring ?? 0);
  const viable = pair >= 5.5 && (sizeGap <= 5 || postExposure <= 5.5);
  return {
    viable,
    pairSwitchability: r1(pair),
    limiting: a <= b ? defenderA.playerCardId : defenderB.playerCardId,
    sizeGap,
    reason: viable ? "PAIR_SWITCHABLE"
      : pair < 5.5 ? "PAIR_NOT_SWITCHABLE"
      : "SIZE_GAP_TOO_LARGE_FOR_POST_THREAT",
    // Frequency comes from the coach; viability comes from the players.
    frequency: clamp((scheme?.switchingFrequency ?? 5) / 10, 0, 1),
  };
};

// ── Coach adjustments (PARTS 21-22) ──────────────────────────────────────────
// Bounded and evidence-driven. One made shot must never trigger a change:
// the trigger counts EXPECTED SHOT QUALITY conceded against a matchup, so
// "good defence, difficult shot made" is distinguished from "bad process".
export const ADJUSTMENT_TRIGGERS = [
  "MATCHUP_REPEATEDLY_BEATEN", "POST_REPEATEDLY_EXPLOITED", "PNR_REPEATEDLY_SUCCESSFUL",
  "EXCESSIVE_RIM_PRESSURE", "SWITCH_MISMATCH_TARGETED", "HIDDEN_DEFENDER_DRAGGED_IN",
];
export const ADJUSTMENT_RESPONSES = [
  "CHANGE_PRIMARY_DEFENDER", "INCREASE_HELP", "REDUCE_HELP", "CHANGE_BALL_SCREEN_COVERAGE",
  "INCREASE_DOUBLE_TEAM", "REHIDE_WEAK_DEFENDER", "STOP_SWITCHING_MATCHUP", "START_SWITCHING_MATCHUP",
];

// Evidence thresholds. Deliberately not one possession.
export const ADJUSTMENT_MIN_EVENTS = 5;
// Mean conceded shot quality that counts as "being beaten". Set from the
// MEASURED distribution of per-matchup conceded quality rather than picked:
// p50 is 4.7, p90 is 6.2, max 7.1. A threshold of 6.4 sat above p90 and
// produced 0.37 adjustments a game, which is a coach who never adjusts.
export const ADJUSTMENT_MIN_QUALITY = 5.9;
// Possessions between changes. Set from observed behaviour: at 12 the engine
// produced ~3.3 assignment changes per game, which is not how coaches behave —
// a real staff makes one or two matchup changes in a night. Raising it also
// lets the cheaper responses (coverage, help) matter, instead of every problem
// being answered by moving personnel.
export const ADJUSTMENT_COOLDOWN = 34;
// A personnel swap is the most disruptive answer available, so it has to clear
// a real bar. Below it the coach changes coverage or help instead — which is
// also the order a coach actually tries things in.
export const SWAP_MIN_GAIN = 2.6;
export const SWAP_MIN_NET = 1.0;

/** Record what the offence did against a matchup. Quality, not points. */
export const recordExploitation = (state, { offensivePlayerId, defenderId, shotQuality, action, isPost, isPnr }) => {
  const key = `${offensivePlayerId}>${defenderId}`;
  const e = state.exploitation.get(key) ?? { events: 0, qualitySum: 0, post: 0, pnr: 0, offensivePlayerId, defenderId };
  e.events++;
  e.qualitySum += Number(shotQuality) || 0;
  if (isPost) e.post++;
  if (isPnr) e.pnr++;
  state.exploitation.set(key, e);
  return e;
};

/**
 * Consider a bounded adjustment. Deterministic: given the same state and the
 * same possession index it always reaches the same decision — the variability
 * comes from the game arriving at different states, not from a dice roll.
 *
 * Adaptability governs how READILY a coach acts and how well the change fits;
 * it never grants a change the roster or the era cannot support.
 */
export const considerAdjustment = ({ state, plan, possessionIndex, defenders, threats, params = null }) => {
  // Separate from the offensive engine's values on purpose: 34 and 30 were
  // tuned independently, and one registry entry claiming 12 for both was the
  // defect Phase 6C2C3 corrected.
  const minEvents = params ? params.get.coach.defensiveAdjustmentMinEvents : ADJUSTMENT_MIN_EVENTS;
  const cooldown = params ? params.get.coach.defensiveAdjustmentCooldown : ADJUSTMENT_COOLDOWN;
  if (params && traceEnabled()) {
    noteParameterRead("coach.defensiveAdjustmentMinEvents", minEvents);
    noteParameterRead("coach.defensiveAdjustmentCooldown", cooldown);
  }
  const last = state.assignmentChangeHistory[state.assignmentChangeHistory.length - 1];
  if (last && possessionIndex - last.possessionIndex < cooldown) return null;

  const tk = plan.scheme.toolkit;
  // A low-adaptability coach demands more evidence before moving. This is the
  // difference between coaches, not a random gate.
  const needed = minEvents + Math.round(clamp((10 - tk.adaptability) * 0.6, 0, 5));

  const worst = [...state.exploitation.values()]
    .filter((e) => e.events >= needed && e.qualitySum / e.events >= ADJUSTMENT_MIN_QUALITY)
    .sort((a, b) => (b.qualitySum / b.events) - (a.qualitySum / a.events))[0];
  if (!worst) return null;

  const threat = threats.find((t) => t.playerCardId === worst.offensivePlayerId);
  const beaten = defenders.find((d) => d.playerCardId === worst.defenderId);
  if (!threat || !beaten) return null;

  const meanQuality = r1(worst.qualitySum / worst.events);
  const trigger = worst.post >= Math.ceil(worst.events * 0.5) ? "POST_REPEATEDLY_EXPLOITED"
    : worst.pnr >= Math.ceil(worst.events * 0.5) ? "PNR_REPEATEDLY_SUCCESSFUL"
    : threat.threats.rimPressure >= 7 ? "EXCESSIVE_RIM_PRESSURE"
    : stateFor(state, worst.offensivePlayerId) !== "BASELINE" ? "SWITCH_MISMATCH_TARGETED"
    : beaten.roleAvailability.canHideOnLowUsagePlayer ? "HIDDEN_DEFENDER_DRAGGED_IN"
    : "MATCHUP_REPEATEDLY_BEATEN";

  // Find a better defender who is CURRENTLY assigned to a less dangerous
  // player — a swap, not a duplication. Rejected if nothing legitimate exists:
  // a coach cannot conjure a defender he does not have.
  const currentPairs = [...state.currentAssignments.entries()];
  let bestSwap = null;
  for (const [otherOffId, otherDefId] of currentPairs) {
    if (otherOffId === worst.offensivePlayerId) continue;
    const cand = defenders.find((d) => d.playerCardId === otherDefId);
    const otherThreat = threats.find((t) => t.playerCardId === otherOffId);
    if (!cand || !otherThreat) continue;
    const gainDim = trigger === "POST_REPEATEDLY_EXPLOITED" ? "postDefense"
      : trigger === "EXCESSIVE_RIM_PRESSURE" ? "interiorDefense" : "pointOfAttack";
    const gain = cand.capabilities[gainDim] - beaten.capabilities[gainDim];
    // The swap must not simply move the problem: what the candidate gives up
    // on his own assignment is subtracted.
    const givesUp = clamp(otherThreat.usageShare * 10, 0, 4);
    const net = gain - givesUp;
    if (gain >= SWAP_MIN_GAIN && (!bestSwap || net > bestSwap.net)) bestSwap = { otherOffId, otherDefId, gain: r1(gain), net: r1(net), cand };
  }

  // ── Response is chosen by TRIGGER, not by a fixed ladder ─────────────────
  // A fixed "swap first, then coverage, then help" ladder meant a personnel
  // swap answered every problem, because with five all-time defenders there is
  // almost always a better one available — and the rest of the taxonomy never
  // fired. That is also bad basketball: you double the post, you change the
  // coverage against a screen, and you move a matchup only when the matchup
  // itself is the problem.
  const preferred = {
    POST_REPEATEDLY_EXPLOITED: ["INCREASE_DOUBLE_TEAM", "CHANGE_PRIMARY_DEFENDER", "INCREASE_HELP"],
    PNR_REPEATEDLY_SUCCESSFUL: ["CHANGE_BALL_SCREEN_COVERAGE", "INCREASE_HELP", "CHANGE_PRIMARY_DEFENDER"],
    EXCESSIVE_RIM_PRESSURE: ["INCREASE_HELP", "CHANGE_PRIMARY_DEFENDER"],
    SWITCH_MISMATCH_TARGETED: ["STOP_SWITCHING_MATCHUP", "CHANGE_PRIMARY_DEFENDER"],
    HIDDEN_DEFENDER_DRAGGED_IN: ["REHIDE_WEAK_DEFENDER", "CHANGE_PRIMARY_DEFENDER", "INCREASE_HELP"],
    MATCHUP_REPEATEDLY_BEATEN: ["CHANGE_PRIMARY_DEFENDER", "INCREASE_HELP", "CHANGE_BALL_SCREEN_COVERAGE"],
  }[trigger] ?? ["CHANGE_PRIMARY_DEFENDER", "INCREASE_HELP"];

  // Whether each response is actually available — era, scheme and personnel.
  const supported = {
    CHANGE_PRIMARY_DEFENDER: () => (bestSwap && bestSwap.net > SWAP_MIN_NET
      ? `${bestSwap.cand.name} takes ${threat.name}; ${beaten.name} picks up the vacated assignment` : null),
    INCREASE_DOUBLE_TEAM: () => (plan.scheme.doubleTeamAggression >= 3 && !plan.scheme.legality.illegalDefenseRestrictions
      ? `send a second defender at ${threat.name} on the catch` : null),
    CHANGE_BALL_SCREEN_COVERAGE: () => `move off ${plan.scheme.ballScreenCoverage} against this handler`,
    INCREASE_HELP: () => (plan.scheme.helpAggression < plan.scheme.legality.maxHelpAggression
      ? `load help toward ${threat.name} within era limits` : null),
    STOP_SWITCHING_MATCHUP: () => (plan.scheme.switchingFrequency > 0
      ? `stop switching the ${threat.name} screen and stay attached` : null),
    REHIDE_WEAK_DEFENDER: () => (plan.scheme.weakDefenderHidePolicy === "ACTIVE"
      ? `move ${beaten.name} off the action and hide him elsewhere` : null),
    REDUCE_HELP: () => (plan.scheme.helpAggression > 2 ? "pull help back and stay home on shooters" : null),
  };

  let response = null, detail = null;
  for (const r of preferred) {
    const d = supported[r]?.();
    if (d) { response = r; detail = d; break; }
  }
  if (!response) {
    // Nothing legitimate available. Recorded as a REJECTED consideration so
    // "why didn't the coach adjust" is answerable.
    return {
      rejected: true, possessionIndex, trigger, meanQuality,
      offensivePlayerId: worst.offensivePlayerId, defenderId: worst.defenderId,
      reason: "NO_SUPPORTED_ADJUSTMENT_AVAILABLE",
      detail: `none of ${preferred.join(", ")} was supported by the roster, the scheme or ${plan.scheme.legality.eraStyleId} rules`,
    };
  }

  return {
    rejected: false, possessionIndex, trigger, response, detail,
    meanQuality, events: worst.events,
    offensivePlayerId: worst.offensivePlayerId, defenderId: worst.defenderId,
    swap: bestSwap ? { otherOffId: bestSwap.otherOffId, otherDefId: bestSwap.otherDefId, gain: bestSwap.gain } : null,
    // Adaptability shapes how well the change is executed, bounded.
    quality: r1(clamp(0.4 + plan.scheme.toolkit.tacticalAdjustment * 0.06, 0.4, 1)),
  };
};

/** Commit an adjustment. This DOES change the baseline — a coach decision is
 *  the only thing that may. */
export const applyAdjustment = (state, adj) => {
  if (!adj || adj.rejected) {
    if (adj) state.assignmentChangeHistory.push({ ...adj, id: `adj-${state.assignmentChangeHistory.length + 1}` });
    return null;
  }
  const id = `adj-${state.assignmentChangeHistory.length + 1}`;
  if (adj.response === "CHANGE_PRIMARY_DEFENDER" && adj.swap) {
    const { otherOffId, otherDefId } = adj.swap;
    state.baselineAssignments.set(adj.offensivePlayerId, otherDefId);
    state.baselineAssignments.set(otherOffId, adj.defenderId);
    state.currentAssignments.set(adj.offensivePlayerId, otherDefId);
    state.currentAssignments.set(otherOffId, adj.defenderId);
    state.assignmentStates.set(adj.offensivePlayerId, "COACH_REASSIGNED");
    state.assignmentStates.set(otherOffId, "COACH_REASSIGNED");
    state.expiry.delete(adj.offensivePlayerId);
    state.expiry.delete(otherOffId);
  }
  // Exploitation evidence resets for the changed matchup: the coach acted, and
  // the next decision must be earned by new evidence.
  state.exploitation.delete(`${adj.offensivePlayerId}>${adj.defenderId}`);
  state.assignmentChangeHistory.push({ ...adj, id });
  return { ...adj, id };
};
