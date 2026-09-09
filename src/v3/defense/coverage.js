// ── Ball-screen coverage selection ──────────────────────────────────────────
// The coverage is chosen against THIS handler and THIS screener, defended by
// the ACTUAL assigned defenders — not from a coach preference alone, and never
// as a flat bonus. Every coverage concedes something specific; the choice is
// which concession is cheapest against these five players in this era.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

export const COVERAGES = ["DROP", "SWITCH", "HEDGE", "BLITZ", "ICE", "UNDER", "OVER", "LATE_SWITCH", "HELP_AND_RECOVER"];

/**
 * Score every coverage, return the best plus the full ranking so the choice is
 * inspectable. Deterministic given the same inputs.
 */
export const selectCoverage = ({ handlerThreat, screenerThreat, handlerDefender, screenerDefender, scheme, legality, switchCheck }) => {
  const h = handlerThreat.threats, s = screenerThreat.threats;
  const hd = handlerDefender.capabilities, sd = screenerDefender.capabilities;
  const tk = scheme.toolkit;

  const scores = {
    // Drop keeps the big home. Good against a poor pull-up shooter and a real
    // roll threat; terrible against a shooter who will simply rise up.
    DROP: 5 + sd.rimProtection * 0.45 + (10 - h.pullUpShooting) * 0.40 + tk.dropCoverage * 0.25 - h.pullUpShooting * 0.15,
    // Switch needs BOTH defenders to survive it, and concedes whatever
    // mismatch the swap creates.
    SWITCH: (switchCheck.viable ? 6.5 : 0.5) + switchCheck.pairSwitchability * 0.4 + tk.switching * 0.3
      - Math.max(s.postScoring - hd.postDefense, 0) * 0.55 - Math.max(h.primaryCreation - sd.pointOfAttack, 0) * 0.35,
    // Hedge buys time and needs a mobile screener defender.
    HEDGE: 5 + sd.switchability * 0.3 + hd.screenNavigation * 0.25 + tk.pressure * 0.2 - s.rollThreat * 0.3,
    // Blitz takes the ball out of a dangerous handler's hands, and concedes
    // the short roll and a 4-on-3 behind it.
    BLITZ: 3 + h.primaryCreation * 0.55 + tk.pressure * 0.35 - s.rollThreat * 0.3 - s.passing * 0.25
      - (legality.illegalDefenseRestrictions ? 2.2 : 0),
    // ICE pushes the ball away from the screen; wants a strong-side wall.
    ICE: 4.5 + sd.rimProtection * 0.3 + hd.pointOfAttack * 0.3 - h.pullUpShooting * 0.2,
    // Going under concedes the jumper. Only sane against weak shooting.
    UNDER: 3 + (10 - h.pullUpShooting) * 0.65 - h.pullUpShooting * 0.35,
    // Going over denies the shot and asks the defender to navigate.
    OVER: 3.5 + h.pullUpShooting * 0.5 + hd.screenNavigation * 0.45 - s.rollThreat * 0.2,
    LATE_SWITCH: (switchCheck.viable ? 5 : 1) + hd.screenNavigation * 0.25 + switchCheck.pairSwitchability * 0.25,
    HELP_AND_RECOVER: 4 + sd.helpDefense * 0.35 + scheme.helpAggression * 0.3
      - (legality.illegalDefenseRestrictions ? 1.5 : 0) - s.popThreat * 0.2,
  };

  // Era gating: a coverage that depends on illegal positioning is unavailable,
  // not merely worse.
  const available = COVERAGES.filter((c) => {
    if (c === "SWITCH" && !switchCheck.viable) return false;
    if (c === "BLITZ" && legality.illegalDefenseRestrictions && scheme.doubleTeamAggression < 2) return false;
    return true;
  });

  const ranked = available
    .map((c) => ({ coverage: c, score: r1(clamp(scores[c], 0, 10)) }))
    // Deterministic tie-break on coverage name.
    .sort((a, b) => b.score - a.score || a.coverage.localeCompare(b.coverage));

  const best = ranked[0];
  return {
    coverage: best.coverage,
    score: best.score,
    ranked,
    unavailable: COVERAGES.filter((c) => !available.includes(c)),
    // What this coverage gives up. Fed into the possession outcome, so the
    // concession is real rather than decorative.
    concedes: {
      DROP: "pull-up jumper", SWITCH: "post or speed mismatch", HEDGE: "the roll behind the hedge",
      BLITZ: "short roll and weak-side 4-on-3", ICE: "the baseline drive", UNDER: "the jumper",
      OVER: "the drive if beaten", LATE_SWITCH: "the split-second before the switch",
      HELP_AND_RECOVER: "the weak-side spot-up",
    }[best.coverage],
    switchCheck,
  };
};
