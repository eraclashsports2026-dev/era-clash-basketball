// ── Mismatch taxonomy ────────────────────────────────────────────────────────
// A mismatch is a NAMED basketball problem with a stated consequence, not a
// number. "Severity 7.3" tells a coach nothing; "SEVERE post mismatch: a 74in
// guard on a post hub, expect deep catches and foul trouble" tells them what to
// do about it.
//
// Severity uses bands deliberately. The underlying evidence is a bounded gap,
// but exposing "severity 6.4" would be false precision on top of inputs that
// are themselves categorical for most historical players.

export const MISMATCH_TYPES = [
  "SIZE_MISMATCH", "STRENGTH_MISMATCH", "SPEED_MISMATCH", "POST_MISMATCH",
  "PULLUP_SHOOTING_MISMATCH", "MOVEMENT_SHOOTING_MISMATCH", "RIM_PRESSURE_MISMATCH",
  "SCREEN_NAVIGATION_MISMATCH", "SWITCHABILITY_MISMATCH", "RIM_PROTECTION_MISMATCH",
  "REBOUNDING_MISMATCH", "FOUL_RISK_MISMATCH", "HELP_DEPENDENCY", "LOW_USAGE_HIDE_ASSIGNMENT",
];

export const SEVERITY = ["MINOR", "MODERATE", "MAJOR", "SEVERE"];

/** Bands, not decimals. A gap below MINOR is not a mismatch, it is basketball. */
export const band = (gap) => (gap >= 4.5 ? "SEVERE" : gap >= 3 ? "MAJOR" : gap >= 1.8 ? "MODERATE" : gap >= 1 ? "MINOR" : null);
export const severityRank = (s) => SEVERITY.indexOf(s) + 1;

const HEIGHT_SEVERE_IN = 6;   // a six-inch height gap is a different sport
const HEIGHT_MAJOR_IN = 4;
const WEIGHT_MAJOR_LB = 40;

const mm = (type, severity, threat, defender, evidence, consequence, confidence) =>
  ({ type, severity, offensivePlayerId: threat.playerCardId, defenderId: defender.playerCardId, evidence, confidence, expectedBasketballConsequence: consequence });

/**
 * Every mismatch in one pairing. Order is stable (declaration order), so two
 * runs produce identical lists.
 */
export const detectMismatches = ({ threat, defender, eff, era, usageShare }) => {
  const out = [];
  const c = defender.capabilities;
  const t = threat.threats;
  const dh = defender.physical.heightIn, dw = defender.physical.weightLb;
  // Confidence is per-pairing: a size claim about two unmeasured players is a
  // weaker claim than the same one about two measured players.
  const sizeConfidence = dh != null ? "MEASURED" : "POSITIONAL_FALLBACK";

  // ── size and strength ────────────────────────────────────────────────────
  // Only claimed against a threat that actually punishes size — a six-inch
  // gap on a spot-up shooter who never posts is not a mismatch worth naming.
  if (dh != null && threat.threatHeightIn != null) {
    const gap = threat.threatHeightIn - dh;
    if (gap >= HEIGHT_MAJOR_IN && t.postScoring >= 4) {
      out.push(mm("SIZE_MISMATCH", gap >= HEIGHT_SEVERE_IN ? "SEVERE" : "MAJOR", threat, defender,
        `${gap.toFixed(0)}in height deficit against a post threat`,
        "deep post catches, shooting over the top, offensive rebounds", sizeConfidence));
    }
  }
  if (dw != null && threat.threatWeightLb != null) {
    const gap = threat.threatWeightLb - dw;
    if (gap >= WEIGHT_MAJOR_LB && t.postScoring >= 4) {
      out.push(mm("STRENGTH_MISMATCH", gap >= 65 ? "SEVERE" : "MAJOR", threat, defender,
        `${gap.toFixed(0)}lb strength deficit against a post threat`,
        "displacement on the catch, deeper position, foul pressure", "MEASURED"));
    }
  }

  // ── post ─────────────────────────────────────────────────────────────────
  const postGap = t.postScoring - c.postDefense;
  if (postGap >= 1 && t.postScoring >= 4.5) {
    out.push(mm("POST_MISMATCH", band(postGap), threat, defender,
      `post scoring ${t.postScoring} against post defence ${c.postDefense}`,
      "the offence will hunt this matchup on the block", defender.confidence.physicalCoverage));
  }

  // ── perimeter ────────────────────────────────────────────────────────────
  const speedGap = t.primaryCreation - c.pointOfAttack;
  if (speedGap >= 1 && t.primaryCreation >= 5.5) {
    out.push(mm("SPEED_MISMATCH", band(speedGap), threat, defender,
      `creation ${t.primaryCreation} against point-of-attack ${c.pointOfAttack}`,
      "first-step advantage, blow-bys, help pulled early", defender.confidence.defense));
  }
  const pullUpGap = t.pullUpShooting - (c.pointOfAttack * 0.6 + c.wingContainment * 0.4);
  if (pullUpGap >= 1 && t.pullUpShooting >= 5.5) {
    out.push(mm("PULLUP_SHOOTING_MISMATCH", band(pullUpGap), threat, defender,
      `pull-up shooting ${t.pullUpShooting} against on-ball containment`,
      "shots taken over a defender who cannot deter them", defender.confidence.defense));
  }
  const chaseGap = t.movementShooting - c.movementChasing;
  if (chaseGap >= 1 && t.movementShooting >= 5) {
    out.push(mm("MOVEMENT_SHOOTING_MISMATCH", band(chaseGap), threat, defender,
      `movement shooting ${t.movementShooting} against chase ability ${c.movementChasing}`,
      "clean catch-and-shoot looks off relocation and screens", defender.confidence.defense));
  }
  const navGap = t.screening + t.movementShooting * 0.5 - c.screenNavigation;
  if (navGap >= 1.8 && t.movementShooting >= 4) {
    out.push(mm("SCREEN_NAVIGATION_MISMATCH", band(navGap), threat, defender,
      `screen navigation ${c.screenNavigation} against an off-ball screening threat`,
      "trailing the play, forcing help and creating rotations", defender.confidence.defense));
  }

  // ── rim ──────────────────────────────────────────────────────────────────
  const rimGap = t.rimPressure - (c.interiorDefense * 0.5 + c.rimProtection * 0.3 + c.pointOfAttack * 0.2);
  if (rimGap >= 1 && t.rimPressure >= 5.5) {
    out.push(mm("RIM_PRESSURE_MISMATCH", band(rimGap), threat, defender,
      `rim pressure ${t.rimPressure} against interior resistance`,
      "downhill drives reaching the rim, help commitment, fouls", defender.confidence.defense));
  }

  // ── consequences of the assignment on TEAM defence ───────────────────────
  if (c.rimProtection >= 7 && t.postScoring <= 3 && (t.movementShooting >= 6 || t.spotUpShooting >= 6.5)) {
    out.push(mm("RIM_PROTECTION_MISMATCH", t.movementShooting >= 8 ? "MAJOR" : "MODERATE", threat, defender,
      `a rim protector (${c.rimProtection}) assigned to a perimeter shooter`,
      "the paint is vacated to guard the arc", defender.confidence.defense));
  }
  const rebGap = t.offensiveRebounding - c.defensiveRebounding;
  if (rebGap >= 1.8) {
    out.push(mm("REBOUNDING_MISMATCH", band(rebGap), threat, defender,
      `offensive rebounding ${t.offensiveRebounding} against ${c.defensiveRebounding}`,
      "second chances on the offensive glass", defender.confidence.defense));
  }
  const foulExposure = t.foulPressure - c.foulDiscipline;
  if (foulExposure >= 1.8) {
    out.push(mm("FOUL_RISK_MISMATCH", band(foulExposure), threat, defender,
      `foul pressure ${t.foulPressure} against discipline ${c.foulDiscipline}`,
      "free throws and early foul trouble", defender.confidence.defense));
  }
  if (c.switchability <= 4.5 && (t.screening >= 5 || t.movementShooting >= 6)) {
    out.push(mm("SWITCHABILITY_MISMATCH", c.switchability <= 3 ? "MAJOR" : "MODERATE", threat, defender,
      `switchability ${c.switchability} against a screening or moving threat`,
      "the matchup cannot be switched out of; help is the only answer", defender.confidence.defense));
  }

  // ── help dependency ──────────────────────────────────────────────────────
  const severeCount = out.filter((m) => m.severity === "SEVERE" || m.severity === "MAJOR").length;
  if (severeCount >= 2) {
    out.push(mm("HELP_DEPENDENCY", severeCount >= 3 ? "SEVERE" : "MAJOR", threat, defender,
      `${severeCount} major-or-worse problems in one pairing`,
      "this matchup cannot be played straight; the scheme must cover it", "DERIVED"));
  }

  // ── hiding ───────────────────────────────────────────────────────────────
  // Not a problem — an intent. Recorded as an assignment fact so the plan can
  // state that it hid someone, and so the counter can be tracked.
  // Low usage is NOT sufficient. An elite movement shooter is the worst place
  // to hide a defender who cannot chase, however few touches he gets — the
  // offence does not need to give him the ball for him to run you off three
  // screens. A hide requires the assignment to be genuinely undemanding.
  if (defender.roleAvailability.canHideOnLowUsagePlayer && usageShare <= 0.16
      && t.primaryCreation <= 5.5 && t.postScoring <= 4.5
      && t.movementShooting <= 6 && t.spotUpShooting <= 7 && t.cutting <= 7) {
    out.push(mm("LOW_USAGE_HIDE_ASSIGNMENT", "MINOR", threat, defender,
      `weak defender placed on a ${(usageShare * 100).toFixed(0)}% usage, low-threat assignment`,
      "the weak link is off the ball — until a screen or a switch drags him into the action", "DERIVED"));
  }

  return out.filter((m) => m.severity != null);
};

/** Severity-weighted cost of a mismatch list. Bands map to costs, not decimals. */
export const SEVERITY_COST = { MINOR: 0.5, MODERATE: 1.6, MAJOR: 4, SEVERE: 9 };

// ── Correlated clusters ─────────────────────────────────────────────────────
// One physical disadvantage legitimately produces several descriptive labels: a
// small defender on a dominant centre is genuinely outsized, out-muscled,
// out-posted, out-rebounded and in foul trouble. Those descriptions are all
// true and worth keeping.
//
// But they are NOT six independent penalties. They are six symptoms of ONE
// latent disadvantage, and summing them charged that disadvantage six times —
// which is why small-ball-versus-size priced at 31 mismatch cost in a single
// pairing and drowned every other consideration.
//
// A cluster is therefore priced as: the largest component in full, plus
// steeply discounted secondary components, plus a small bounded interaction
// term (the symptoms do compound — being outsized AND slow is worse than
// either), capped.
export const MISMATCH_CLUSTERS = {
  INTERIOR_PHYSICAL: {
    types: ["SIZE_MISMATCH", "STRENGTH_MISMATCH", "POST_MISMATCH", "REBOUNDING_MISMATCH", "FOUL_RISK_MISMATCH"],
    // A physical disadvantage compounds meaningfully, so the interaction term
    // is the largest of the four clusters.
    secondaryDiscount: 0.30, interaction: 0.16, cap: 15,
  },
  PERIMETER_MOBILITY: {
    types: ["SPEED_MISMATCH", "PULLUP_SHOOTING_MISMATCH", "MOVEMENT_SHOOTING_MISMATCH", "SCREEN_NAVIGATION_MISMATCH"],
    // Being beaten off the dribble and being beaten off the ball are more
    // separable than the interior symptoms — a slow defender may still
    // navigate screens well — so secondaries retain more weight.
    secondaryDiscount: 0.42, interaction: 0.10, cap: 14,
  },
  RIM_ACCESS: {
    types: ["RIM_PRESSURE_MISMATCH", "RIM_PROTECTION_MISMATCH", "HELP_DEPENDENCY"],
    secondaryDiscount: 0.35, interaction: 0.12, cap: 11,
  },
  SWITCHING: {
    types: ["SWITCHABILITY_MISMATCH", "RECOVERY_MISMATCH"],
    secondaryDiscount: 0.5, interaction: 0.08, cap: 7,
  },
};

// A type may belong to more than one cluster (FOUL_RISK and RIM_PROTECTION do).
// It is priced in its PRIMARY cluster only — the first that claims it — so
// cluster membership cannot itself double-count.
const PRIMARY_CLUSTER = (() => {
  const m = {};
  for (const [key, c] of Object.entries(MISMATCH_CLUSTERS)) {
    for (const t of c.types) if (!(t in m)) m[t] = key;
  }
  return m;
})();

export const clusterOf = (type) => PRIMARY_CLUSTER[type] ?? "UNCLUSTERED";

/**
 * Cluster-aware numerical effect. Descriptive labels are untouched: this only
 * changes what they COST.
 */
export const mismatchCost = (list) => {
  const groups = {};
  for (const m of list) {
    if (m.type === "LOW_USAGE_HIDE_ASSIGNMENT") continue;
    const key = clusterOf(m.type);
    (groups[key] = groups[key] ?? []).push(SEVERITY_COST[m.severity] ?? 0);
  }
  let total = 0;
  for (const [key, costs] of Object.entries(groups)) {
    const cfg = MISMATCH_CLUSTERS[key];
    costs.sort((a, b) => b - a);
    if (!cfg) { total += costs.reduce((a, b) => a + b, 0); continue; }
    const primary = costs[0] ?? 0;
    const secondary = costs.slice(1).reduce((a, b) => a + b, 0) * cfg.secondaryDiscount;
    // Interaction: symptoms compounding, scaled by how many there are, bounded.
    const interaction = costs.length > 1 ? primary * cfg.interaction * Math.min(costs.length - 1, 3) : 0;
    total += Math.min(cfg.cap, primary + secondary + interaction);
  }
  return Math.round(total * 10) / 10;
};

/** Diagnostic: the per-cluster breakdown behind a cost. */
export const mismatchCostBreakdown = (list) => {
  const groups = {};
  for (const m of list) {
    if (m.type === "LOW_USAGE_HIDE_ASSIGNMENT") continue;
    const key = clusterOf(m.type);
    (groups[key] = groups[key] ?? []).push({ type: m.type, severity: m.severity, cost: SEVERITY_COST[m.severity] ?? 0 });
  }
  return Object.entries(groups).map(([cluster, members]) => {
    const cfg = MISMATCH_CLUSTERS[cluster];
    const costs = members.map((x) => x.cost).sort((a, b) => b - a);
    const naive = costs.reduce((a, b) => a + b, 0);
    const primary = costs[0] ?? 0;
    const secondary = costs.slice(1).reduce((a, b) => a + b, 0) * (cfg?.secondaryDiscount ?? 1);
    const interaction = cfg && costs.length > 1 ? primary * cfg.interaction * Math.min(costs.length - 1, 3) : 0;
    const clustered = cfg ? Math.min(cfg.cap, primary + secondary + interaction) : naive;
    return {
      cluster, members: members.map((x) => `${x.severity}:${x.type}`),
      naiveSum: Math.round(naive * 10) / 10,
      clustered: Math.round(clustered * 10) / 10,
      capped: cfg ? primary + secondary + interaction > cfg.cap : false,
    };
  });
};
