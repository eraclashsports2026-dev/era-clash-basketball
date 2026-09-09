// ── Era translation (draft layer) ────────────────────────────────────────────
// How well does a roster's SHAPE suit a rules environment? This is a draft-time
// planning signal only. It is never a bonus: it does not touch Candidate 3, and
// the simulation still decides every possession from the era's real rules. A
// roster that "translates well" simply has more of what this environment tends
// to reward — the game still has to be played.
import { POSITIONS } from "../players.js";
import { ERA_STYLES, getEra } from "../v3/eraStyles.js";

export const ERA_TRANSLATION_VERSION = "1.0.0";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const asFive = (r) => (Array.isArray(r) ? r : POSITIONS.map((s) => r[s])).filter(Boolean);

/** Every era the Chaos Era Reveal may produce, in canonical order. */
export const CHAOS_ERA_IDS = ERA_STYLES.map((e) => e.id);

/**
 * Roster shape, in the four dimensions eras actually discriminate on.
 * Derived from the same card statistics the app already displays.
 */
export const rosterShape = (roster) => {
  const five = asFive(roster);
  if (!five.length) return { interior: 0, perimeter: 0, rimProtect: 0, pressure: 0, creation: 0, glass: 0 };
  const slots = Array.isArray(roster) ? POSITIONS : POSITIONS;
  const pts = five.reduce((s, p) => s + p.pts, 0) || 1;
  const bigPts = five.filter((p, i) => ["PF", "C"].includes(slots[i])).reduce((s, p) => s + p.pts, 0);
  const wingPts = five.filter((p, i) => ["PG", "SG", "SF"].includes(slots[i])).reduce((s, p) => s + p.pts, 0);
  return {
    interior: clamp01(bigPts / pts / 0.45),
    perimeter: clamp01(wingPts / pts / 0.70),
    rimProtect: clamp01(five.reduce((s, p) => s + p.blk, 0) / 6),
    pressure: clamp01(five.reduce((s, p) => s + p.stl, 0) / 8),
    creation: clamp01(five.reduce((s, p) => s + p.ast, 0) / 26),
    glass: clamp01(five.reduce((s, p) => s + p.reb, 0) / 52),
  };
};

/** What this environment tends to reward, read off the era's real rules. */
export const eraEmphasis = (eraId) => {
  const e = getEra(eraId);
  if (!e) return { interior: 0.2, perimeter: 0.2, rimProtect: 0.2, pressure: 0.15, creation: 0.15, glass: 0.1 };
  const r = e.rules, env = e.environment;
  const em = { interior: 0.16, perimeter: 0.16, rimProtect: 0.16, pressure: 0.14, creation: 0.20, glass: 0.18 };
  if (!r.threePoint) { em.interior += 0.16; em.glass += 0.06; em.perimeter -= 0.14; }
  if (env.tpaPerGame >= 20) { em.perimeter += 0.16; em.creation += 0.05; em.interior -= 0.13; }
  if (r.handCheckAllowed) { em.rimProtect += 0.07; em.pressure += 0.05; em.creation -= 0.06; }
  if (r.illegalDefenseRestrictions) { em.interior += 0.09; em.rimProtect -= 0.04; }
  if (r.zoneLegal) { em.rimProtect += 0.07; em.interior -= 0.04; }
  if (env.orebPct >= 0.30) em.glass += 0.06;
  const total = Object.values(em).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  for (const k of Object.keys(em)) em[k] = Math.max(0, em[k]) / total;
  return em;
};

/** 0..1 — how well this roster's shape matches this era's emphasis. */
export const eraTranslationScore = (roster, eraId) => {
  const s = rosterShape(roster), em = eraEmphasis(eraId);
  return clamp01(Object.keys(em).reduce((acc, k) => acc + em[k] * (s[k] ?? 0), 0));
};

/** Expected translation across ALL eras — the pre-reveal adaptability signal. */
export const eraAdaptability = (roster) =>
  CHAOS_ERA_IDS.reduce((a, id) => a + eraTranslationScore(roster, id), 0) / CHAOS_ERA_IDS.length;

/** Which held players gain or lose opportunity in this environment. */
export const playerEraSwing = (roster, eraId) => {
  const five = asFive(roster);
  const slots = Array.isArray(roster) ? POSITIONS : POSITIONS;
  const em = eraEmphasis(eraId);
  const rows = five.map((p, i) => {
    const big = ["PF", "C"].includes(slots[i]);
    const score =
      (big ? em.interior : em.perimeter) * clamp01(p.pts / 30) +
      em.rimProtect * clamp01(p.blk / 3) +
      em.pressure * clamp01(p.stl / 2.5) +
      em.creation * clamp01(p.ast / 10) +
      em.glass * clamp01(p.reb / 14);
    return { name: p.name, slot: slots[i], score };
  });
  const mean = rows.reduce((a, r) => a + r.score, 0) / (rows.length || 1);
  return {
    gains: rows.filter((r) => r.score > mean * 1.12).sort((a, b) => b.score - a.score).map((r) => r.name),
    loses: rows.filter((r) => r.score < mean * 0.88).sort((a, b) => a.score - b.score).map((r) => r.name),
  };
};

/** Qualitative, roster-specific reading of the revealed environment. */
export const eraImplications = (roster, eraId) => {
  const e = getEra(eraId);
  if (!e) return [];
  const s = rosterShape(roster);
  const out = [];
  if (!e.rules.threePoint) {
    out.push(s.interior >= 0.55
      ? "Every shot counts two, so this roster's interior scoring is worth more than it would be in a modern environment."
      : "Every shot counts two: perimeter volume loses its premium, and this roster gets less out of shooting than it would in a modern era.");
  } else if (e.environment.tpaPerGame >= 20) {
    out.push(s.perimeter >= 0.6
      ? "A high-volume perimeter environment suits how this roster already scores."
      : "This is a spacing environment, and this roster generates most of its offense inside it.");
  }
  if (e.rules.illegalDefenseRestrictions) {
    out.push(s.interior >= 0.5
      ? "Illegal-defense rules forbid pre-rotated help, so one-on-one post scoring is hard to take away."
      : "Illegal-defense rules forbid pre-rotated help, which limits how much this roster's help defense can hide a weak matchup.");
  }
  if (e.rules.handCheckAllowed) {
    out.push(s.pressure >= 0.5
      ? "Hand-checking is legal, which rewards this roster's perimeter physicality."
      : "Hand-checking is legal, so perimeter creation faces more contact than this roster is built for.");
  }
  if (e.rules.zoneLegal && s.rimProtect >= 0.5) out.push("Legal zones let this rim protection anchor a packed paint.");
  return out.slice(0, 3);
};

/** The public Era Reveal payload — rules environment, stated plainly. */
export const eraRevealFacts = (eraId) => {
  const e = getEra(eraId);
  if (!e) return null;
  const r = e.rules, env = e.environment;
  return {
    eraId: e.id,
    threePoint: r.threePoint ? `Three-point line in play (~${env.tpaPerGame} attempts a game league-wide)` : "No three-point line — every field goal is worth two",
    defensiveLegality: r.zoneLegal ? "Zone defense is legal" : "Zones are illegal; illegal-defense guidelines restrict off-ball help",
    physicality: r.handCheckAllowed ? "Hand-checking is legal on the perimeter" : "Hand-checking is banned; perimeter defenders must move their feet",
    pace: `${env.pace} possessions a game league-wide`,
    rebounding: `${Math.round(env.orebPct * 100)}% of misses were rebounded by the offense`,
    ruleFacts: (e.ruleFacts || []).slice(0, 4),
  };
};
