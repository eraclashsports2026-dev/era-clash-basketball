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
export const buildSchemePlan = ({ coach, defenders, opponentThreats, era, eff }) => {
  const tk = coachToolkit(coach);
  const legal = eraLegality(era);
  const ceiling = personnelCeiling(defenders);

  const oppMovement = Math.max(...opponentThreats.map((t) => t.threats.movementShooting));
  const oppPost = Math.max(...opponentThreats.map((t) => t.threats.postScoring));
  const oppRim = Math.max(...opponentThreats.map((t) => t.threats.rimPressure));
  const oppSpacing = opponentThreats.reduce((a, t) => a + t.threats.spotUpShooting, 0) / opponentThreats.length;

  const constrain = (intent, eraCap, personnelCap) => r1(clamp(Math.min(intent, eraCap, personnelCap), 0, 10));

  const zoneUsage = constrain(tk.zonePreference, legal.maxZoneUsage, 10);
  const switchingFrequency = constrain(tk.switching, 10, ceiling.switchCeiling);
  const helpAggression = constrain(tk.helpAggression, legal.maxHelpAggression, ceiling.helpCeiling);
  const pressureLevel = constrain(tk.pressure, legal.maxPressure, ceiling.pressureCeiling);

  return {
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
