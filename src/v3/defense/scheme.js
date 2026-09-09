// ── Defensive scheme and era legality ────────────────────────────────────────
// A scheme is what a coach INTENDS, filtered by what the era permits and what
// the personnel can actually execute. All three constraints are real:
//
//   · a coach who never switched does not become a switching coach
//   · a zone is not available in an era where zones were illegal
//   · a lineup of non-switchable defenders cannot switch, whatever the coach wants
//
// There is no era defence bonus anywhere. The era changes WHICH STRUCTURES
// EXIST and how freely help may position itself. It never makes defenders better.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;
const num = (x, d = 5) => (Number.isFinite(Number(x)) ? Number(x) : d);

export const DEFENSIVE_ENVIRONMENTS = [
  "MAN_ORIENTED_ILLEGAL_DEFENSE",  // zones illegal AND illegal-defense guidelines in force
  "MAN_WITH_RESTRICTED_HELP",      // zones illegal, help positioning limited
  "MODERN_MAN_HELP",               // zones legal, free help positioning
  "ZONE_CAPABLE",
  "SWITCH_CAPABLE",
  "DROP_CAPABLE",
  "PRESSURE_CAPABLE",
];

/**
 * Which structures the selected era actually permits. Derived from the SOURCED
 * era rule facts (`zoneLegal`, `illegalDefenseRestrictions`,
 * `defensiveThreeSeconds`, `handCheckAllowed`) — no invented history.
 */
export const eraLegality = (era) => {
  const r = era.rules ?? {};
  const zoneLegal = Boolean(r.zoneLegal);
  const illegalDefense = Boolean(r.illegalDefenseRestrictions);
  const environments = [];

  if (illegalDefense && !zoneLegal) environments.push("MAN_ORIENTED_ILLEGAL_DEFENSE", "MAN_WITH_RESTRICTED_HELP");
  else if (!zoneLegal) environments.push("MAN_WITH_RESTRICTED_HELP");
  else environments.push("MODERN_MAN_HELP", "ZONE_CAPABLE");

  // Switching and dropping are man-defence techniques and existed in every
  // era; what changes is how much pre-rotation and off-ball loading is legal
  // around them.
  environments.push("SWITCH_CAPABLE", "DROP_CAPABLE");
  if (r.handCheckAllowed) environments.push("PRESSURE_CAPABLE");

  return {
    eraStyleId: era.id,
    environments,
    zoneLegal,
    illegalDefenseRestrictions: illegalDefense,
    defensiveThreeSeconds: Boolean(r.defensiveThreeSeconds),
    handCheckAllowed: Boolean(r.handCheckAllowed),
    // Caps, not bonuses. An illegal-defense era CANNOT pre-rotate freely; a
    // modern era can. This limits a scheme, it never improves a defender.
    maxHelpAggression: illegalDefense ? 4.5 : zoneLegal ? 10 : 7,
    maxPreRotation: illegalDefense ? 2.5 : zoneLegal ? 9 : 6,
    maxZoneUsage: zoneLegal ? 8 : 0,
    // Physical perimeter contact is permitted or it is not. Where it is, a
    // pressure scheme is available — and it carries its own foul risk.
    maxPressure: r.handCheckAllowed ? 9 : 6,
    paintOccupancyLimited: Boolean(r.defensiveThreeSeconds),
    note: illegalDefense
      ? "Illegal-defense guidelines in force: zones prohibited and off-ball defenders restricted from standing in non-assignment help positions."
      : zoneLegal
        ? "Zone defence legal; free help positioning, subject to defensive three seconds."
        : "Zones prohibited but illegal-defense guidelines lifted: man principles with fuller help latitude.",
  };
};

/** What the coach's own documented record supports. Not what we wish they did. */
export const coachToolkit = (coach) => {
  const d = coach.defense ?? {};
  const m = coach.management ?? {};
  const pick = (names, fallback) => {
    for (const n of names) if (Number.isFinite(Number(d[n]))) return Number(d[n]);
    return fallback;
  };
  return {
    coachId: coach.coachId ?? null,
    name: coach.name ?? null,
    manPreference: pick(["manPreference", "man"], 6),
    zonePreference: pick(["zonePreference", "zone"], 3),
    switching: pick(["switching"], 5),
    dropCoverage: pick(["dropCoverage", "drop"], 5),
    pressure: pick(["pressure"], 5),
    helpAggression: pick(["helpAggression"], 5),
    rimPriority: pick(["rimProtectionPriority", "rimPriority"], 5),
    reboundPriority: pick(["defensiveReboundingPriority", "defRebPriority"], 5),
    adaptability: num(m.adaptability, 5),
    tacticalAdjustment: num(m.tacticalAdjustment, 5),
    roleDiscipline: num(m.roleDiscipline, 5),
  };
};

/** What the personnel can execute, regardless of intent. */
export const personnelCeiling = (defenders) => {
  const mean = (f) => defenders.reduce((a, d) => a + f(d), 0) / defenders.length;
  const switchable = defenders.filter((d) => d.roleAvailability.canSwitch).length;
  return {
    // Collective switchability, not one player's rating: a lineup switches only
    // as well as its weakest link in the switch.
    switchCeiling: r1(clamp(mean((d) => d.capabilities.switchability) * 0.5 + switchable * 1.1, 0, 10)),
    switchableCount: switchable,
    helpCeiling: r1(mean((d) => d.capabilities.helpDefense)),
    pressureCeiling: r1(mean((d) => d.capabilities.pointOfAttack) * 0.7 + mean((d) => d.physical.speed) * 0.3),
    rimCeiling: r1(Math.max(...defenders.map((d) => d.capabilities.rimProtection))),
    rimProtectors: defenders.filter((d) => d.roleAvailability.canProtectRim).length,
    chaseCount: defenders.filter((d) => d.roleAvailability.canChaseShooter).length,
    postDefenders: defenders.filter((d) => d.roleAvailability.canGuardPost).length,
  };
};

/**
 * The deterministic base scheme. Every dimension is min(intent, era cap,
 * personnel ceiling) — so a scheme is never something the coach did not do,
 * the era did not allow, or the roster cannot execute.
 */
/**
 * How much of a coach's scheme intent transfers past what the personnel can
 * execute on its own. `neutralIntent` is the generic coach's value in
 * src/v3/coaches.js, which makes a generic coach a fixed point.
 */
export const SCHEME_TRANSFER = Object.freeze({ neutralIntent: 5, rate: 0.5 });

export const buildSchemePlan = ({ coach, defenders, opponentThreats, era, eff }) => {
  const tk = coachToolkit(coach);
  const legal = eraLegality(era);
  const ceiling = personnelCeiling(defenders);

  const oppMovement = Math.max(...opponentThreats.map((t) => t.threats.movementShooting));
  const oppPost = Math.max(...opponentThreats.map((t) => t.threats.postScoring));
  const oppRim = Math.max(...opponentThreats.map((t) => t.threats.rimPressure));
  const oppSpacing = opponentThreats.reduce((a, t) => a + t.threats.spotUpShooting, 0) / opponentThreats.length;

  const constrain = (intent, eraCap, personnelCap) => r1(clamp(Math.min(intent, eraCap, personnelCap), 0, 10));

  /**
   * A SCHEME dimension is not capped by raw personnel the way a physical
   * ceiling is. Scheme is precisely what a coach uses to get team defence out
   * of limited individual defenders, so truncating intent to personnel
   * capability makes the whole dimension inexpressible.
   *
   * Historical V5 measured the consequence. helpCeiling sits near 3.0 for every
   * calibration team while coach help intent runs 5 to 9, so the ceiling bound
   * on all eight defences and collapsed the dimension to a 3.0-4.5 band. Worse,
   * because the neutral coach's intent is 5 and truncation lands near 3.0, six
   * of the eight defences had ABOVE-neutral intent realized BELOW the neutral
   * default — the engine scored a documented elite defensive coach as less
   * helping than a generic one. helpCommitment is helpAggression / 10, so
   * Tom Thibodeau's help-9 defence conceded 0.00035 MORE points per possession
   * than neutral, and coach help intent correlated with opponent scoring at
   * Spearman +0.29: the wrong sign.
   *
   * The truncated value stays the base. A coach's intent RELATIVE TO THE
   * NEUTRAL DEFAULT then transfers partially on top of it. Centring on the
   * neutral default makes a generic coach an exact fixed point, so this
   * differentiates coaching identity without shifting the league mean in either
   * direction — a flat defensive bonus would move every team, and this moves
   * only coaches who deviate from generic intent, in the direction they
   * deviate. The era cap is still absolute: a scheme the rules forbid stays
   * forbidden — and where it binds every coach to the same value, as the
   * illegal-defence eras do for pre-rotated help, no coach differentiation is
   * expressible and none is invented.
   */
  const transferScheme = (intent, eraCap, personnelCap) => {
    const base = Math.min(intent, eraCap, personnelCap);
    // The differential comes from the coach's OWN intent, not from the
    // era-capped value. Taking it from the capped value made every coach in a
    // restricted era collapse to one number, which erases identity a second
    // time for a different reason. The era cap is then applied to the result,
    // so a rule the era forbids stays forbidden and no coach exceeds it.
    const differential = (intent - SCHEME_TRANSFER.neutralIntent) * SCHEME_TRANSFER.rate;
    return r1(clamp(Math.min(base + differential, eraCap), 0, 10));
  };

  const zoneUsage = constrain(tk.zonePreference, legal.maxZoneUsage, 10);
  // Switching, help and pressure are SCHEME. Zone usage above is not: it is a
  // binary legality question, so it keeps the hard constraint.
  const switchingFrequency = transferScheme(tk.switching, 10, ceiling.switchCeiling);
  const helpAggression = transferScheme(tk.helpAggression, legal.maxHelpAggression, ceiling.helpCeiling);
  const pressureLevel = transferScheme(tk.pressure, legal.maxPressure, ceiling.pressureCeiling);

  // How much of each scheme dimension is the COACH rather than the personnel:
  // the realized value minus what this same personnel would realize under a
  // generic coach in this same era. Zero for a neutral coach on any roster and
  // in any era, which is what lets a consumer use it without shifting the
  // league mean. Carried on the plan so the possession engine can read the
  // coaching contribution without rebuilding a second plan per shot.
  const neutralHelp = transferScheme(SCHEME_TRANSFER.neutralIntent, legal.maxHelpAggression, ceiling.helpCeiling);
  const neutralPressure = transferScheme(SCHEME_TRANSFER.neutralIntent, legal.maxPressure, ceiling.pressureCeiling);
  const neutralSwitching = transferScheme(SCHEME_TRANSFER.neutralIntent, 10, ceiling.switchCeiling);

  return {
    helpDifferential: r1(helpAggression - neutralHelp),
    pressureDifferential: r1(pressureLevel - neutralPressure),
    switchingDifferential: r1(switchingFrequency - neutralSwitching),
    // Shell type is chosen from what is LEGAL, then from what the coach prefers.
    shellType: zoneUsage >= 5 ? "ZONE_MIXED"
      : legal.illegalDefenseRestrictions ? "MAN_ILLEGAL_DEFENSE"
      : legal.zoneLegal ? "MODERN_MAN_HELP" : "MAN_RESTRICTED_HELP",
    // What the defence plays when it is NOT in its zone this possession. Zone
    // use became per-possession in Phase 6C4A, so the per-possession ledger
    // label needs the man fallback — "ZONE_MIXED" on a man possession was how
    // the zone share read 100% for any coach above the old threshold.
    manShellType: legal.illegalDefenseRestrictions ? "MAN_ILLEGAL_DEFENSE"
      : legal.zoneLegal ? "MODERN_MAN_HELP" : "MAN_RESTRICTED_HELP",
    environments: legal.environments,
    // Ball-screen coverage is a preference here; the actual per-possession
    // choice is made against the specific handler and screener (see coverage.js).
    ballScreenCoverage: switchingFrequency >= 7 ? "SWITCH_HEAVY"
      : tk.dropCoverage >= 7 ? "DROP_HEAVY"
      : pressureLevel >= 7 ? "AGGRESSIVE_SHOW"
      : "MIXED",
    switchingFrequency,
    helpAggression,
    zoneUsage,
    pressureLevel,
    // Priorities respond to the OPPONENT, which is what makes this a plan
    // rather than a template.
    paintPriority: r1(clamp(tk.rimPriority * 0.5 + oppRim * 0.3 + oppPost * 0.2, 0, 10)),
    perimeterPriority: r1(clamp(oppSpacing * 0.5 + oppMovement * 0.3 + eff.perimeterShotValue * 0.2, 0, 10)),
    doubleTeamAggression: r1(clamp((oppPost >= 8 ? 5 : 2) + tk.helpAggression * 0.35, 0, 10) * (legal.illegalDefenseRestrictions ? 0.6 : 1)),
    reboundingPriority: r1(tk.reboundPriority),
    transitionDefensePriority: r1(clamp(10 - tk.reboundPriority * 0.5, 0, 10)),
    // Cross-matching is a POLICY, not a licence for arbitrary swapping. A
    // high-discipline coach cross-matches less readily.
    crossMatchPolicy: tk.roleDiscipline >= 8 ? "CONSERVATIVE" : tk.adaptability >= 7 ? "AGGRESSIVE" : "SELECTIVE",
    weakDefenderHidePolicy: tk.adaptability >= 6 ? "ACTIVE" : "PASSIVE",
    legality: legal,
    toolkit: tk,
    personnelCeiling: ceiling,
    // Why each capped dimension landed where it did — so "why isn't this team
    // switching" has an answer.
    constraints: [
      zoneUsage === 0 && tk.zonePreference > 0 ? { dimension: "zoneUsage", limitedBy: "ERA", detail: `zones illegal in ${era.id}` } : null,
      switchingFrequency < tk.switching ? { dimension: "switchingFrequency", limitedBy: "PERSONNEL", detail: `only ${ceiling.switchableCount} of 5 defenders can switch` } : null,
      helpAggression < tk.helpAggression ? { dimension: "helpAggression", limitedBy: legal.maxHelpAggression < ceiling.helpCeiling ? "ERA" : "PERSONNEL", detail: legal.note } : null,
      pressureLevel < tk.pressure ? { dimension: "pressureLevel", limitedBy: legal.maxPressure < ceiling.pressureCeiling ? "ERA" : "PERSONNEL", detail: legal.handCheckAllowed ? "personnel speed" : "hand-checking not permitted" } : null,
    ].filter(Boolean),
    confidence: defenders.every((d) => d.confidence.physicalCoverage === "COMPLETE") ? "HIGH"
      : defenders.some((d) => d.confidence.physicalCoverage === "NONE") ? "LOW" : "MEDIUM",
  };
};
