// ── Paint availability ──────────────────────────────────────────────────────
// The correction: "this defender is guarding the nominal centre" is NOT the
// same as "this defender is still near the basket".
//
// A modern passing-hub big operates above the break, sets handoffs, pops, and
// passes from the high post. His defender spends the possession out of the
// paint. Labelling that assignment PRESERVE_RIM_PROTECTION was false — it
// reported rimPreservation 1.0 for exactly the matchup that empties the paint.
//
// Paint availability is derived from the OFFENSIVE assignment's expected action
// distribution, plus the offensive coach's system and the era. No player id
// appears anywhere here.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

export const PAINT_LABELS = {
  PRESERVES_PAINT_PRESENCE: "PRESERVES_PAINT_PRESENCE",
  ASSIGNS_NOMINAL_CENTER: "ASSIGNS_NOMINAL_CENTER",
  FORCED_TO_PERIMETER: "FORCED_TO_PERIMETER",
  MIXED_INTERIOR_PERIMETER_DUTY: "MIXED_INTERIOR_PERIMETER_DUTY",
};

/**
 * How much of the possession this assignment keeps its defender near the rim.
 *
 * 1.0 = a low-post anchor who never leaves the paint.
 * 0.0 = a stretch big or hub who lives above the break.
 */
export const paintAvailability = ({ threat, offensiveScheme = null, eff = null }) => {
  const t = threat.threats;

  // Pulls the defender IN.
  const interiorPull = t.postScoring * 0.34 + t.rimPressure * 0.22
    + t.offensiveRebounding * 0.14 + t.cutting * 0.1;

  // Pulls the defender OUT. A passing hub counts here: a big who initiates
  // from the high post takes his defender with him even when he never shoots.
  const hubRole = clamp((t.passing - 5) * 0.5, 0, 3) * (threat.creationLocus?.perimeter ?? 0.5);
  const perimeterPull = t.popThreat * 0.3 + t.spotUpShooting * 0.24
    + t.movementShooting * 0.2 + t.screening * 0.1 + hubRole * 0.5;

  // Era: where perimeter shooting is worthless, a big who "spaces" does not
  // actually pull anyone out of the paint.
  const eraPerimeterWeight = eff ? clamp(eff.perimeterShotValue / 6, 0.25, 1.25) : 1;
  const out = perimeterPull * eraPerimeterWeight;

  const raw = (interiorPull + 1.2) / (interiorPull + out + 2.4);
  const availability = r2(clamp(raw, 0.05, 0.98));

  const label = availability >= 0.62 ? PAINT_LABELS.PRESERVES_PAINT_PRESENCE
    : availability <= 0.3 ? PAINT_LABELS.FORCED_TO_PERIMETER
    : PAINT_LABELS.MIXED_INTERIOR_PERIMETER_DUTY;

  return {
    availability,
    label,
    interiorPull: r2(interiorPull),
    perimeterPull: r2(out),
    // Named so a reader can see WHY the defender is being dragged out.
    drivers: [
      t.popThreat >= 5 ? "pop threat" : null,
      t.spotUpShooting >= 6.5 ? "spot-up shooting" : null,
      t.movementShooting >= 6 ? "off-ball movement" : null,
      hubRole >= 1 ? "passing hub above the break" : null,
      t.screening >= 5.5 ? "screening away from the rim" : null,
    ].filter(Boolean),
    holdsHim: [
      t.postScoring >= 5.5 ? "post scoring" : null,
      t.rimPressure >= 6.5 ? "rim pressure" : null,
      t.offensiveRebounding >= 6.5 ? "offensive glass" : null,
    ].filter(Boolean),
  };
};

/**
 * The rim-preservation reason for one assignment, distinguishing the four
 * required labels. A nominal centre assignment that empties the paint reports
 * ASSIGNS_NOMINAL_CENTER, not PRESERVES_PAINT_PRESENCE.
 */
export const rimPresenceReason = ({ threat, defender, eff = null }) => {
  const p = paintAvailability({ threat, eff });
  const isRimProtector = defender.roleAvailability.canProtectRim;
  const guardsNominalCentre = threat.nominalPosition === "C" || threat.nominalPosition === "PF";

  if (!isRimProtector) {
    return { ...p, reason: p.availability >= 0.62 ? PAINT_LABELS.PRESERVES_PAINT_PRESENCE : PAINT_LABELS.MIXED_INTERIOR_PERIMETER_DUTY, isRimProtector };
  }
  if (p.availability >= 0.62) return { ...p, reason: PAINT_LABELS.PRESERVES_PAINT_PRESENCE, isRimProtector };
  if (p.availability <= 0.3) return { ...p, reason: PAINT_LABELS.FORCED_TO_PERIMETER, isRimProtector };
  // A real rim protector on a nominal big who nonetheless plays outside: the
  // assignment is defensible, but calling it paint preservation is not.
  return {
    ...p,
    reason: guardsNominalCentre ? PAINT_LABELS.ASSIGNS_NOMINAL_CENTER : PAINT_LABELS.MIXED_INTERIOR_PERIMETER_DUTY,
    isRimProtector,
  };
};

/** Team-level rim preservation, weighted by each rim protector's actual paint availability. */
export const teamRimPreservation = ({ pairs, defenders, eff = null }) => {
  const protectors = pairs.filter((p) => p.defender.roleAvailability.canProtectRim);
  if (!protectors.length) return { preservation: 1, protectors: 0, detail: [] };
  const detail = protectors.map((p) => {
    const r = rimPresenceReason({ threat: p.threat, defender: p.defender, eff });
    return { defenderId: p.defender.playerCardId, offensivePlayerId: p.threat.playerCardId, availability: r.availability, reason: r.reason };
  });
  return {
    preservation: r2(detail.reduce((a, d) => a + d.availability, 0) / detail.length),
    protectors: protectors.length,
    detail,
  };
};
