// ── Chaos Draft weighted odds ────────────────────────────────────────────────
// finalWeight = baseRarityWeight x rollStageModifier x heldTalentPressure
//               x positionEligibility
//
// WHAT MAY NEVER ENTER THIS FUNCTION
// account tier, payment history, previous wins, previous losses, tester
// identity, spending, engagement score, desired outcome. The weight function
// below takes a card, a slot, a roll number and the held-tier census — nothing
// else is in scope, and a fairness test asserts that identical (seed, side,
// slot, roll, held, burned) inputs produce identical weights for a GUEST, a
// FREE account, a PLUS subscriber and a COMMISSIONER.
import { PLAYERS, POSITIONS } from "../players.js";
import { draftPctAt, tierOf, DRAFT_VALUE_VERSION } from "./draftValue.js";
import { hashString, deriveSeed, mulberry32 } from "../v3/seed.js";

export const DRAFT_PROBABILITY_VERSION = "1.0.0";
export const CHAOS_DRAFT_VERSION = "1.0.0";

export const ROLLS = 3;

// ── Tunable coefficients (calibrated in scripts/chaos/calibrate.mjs) ─────────
export const ODDS = Object.freeze({
  // baseRarityWeight = exp(-RARITY_K * draftValuePercentile).
  // Strictly decreasing in Draft Value (locked decisions #16/#17) and strictly
  // positive for every card in the pool (locked decision #20).
  // CALIBRATED: 1,000,000-run sweep. 0.60 keeps a top-decile star a real but
  // uncommon opening outcome (~38% of opening fives) while holding the FINAL
  // three-star rate at 2.4% — inside the original frozen band of 2-5%.
  rarityK: 0.60,

  // rollStageModifier: applied to the TOP TIERS only, so later rolls are
  // riskier without quietly degrading the whole pool (locked decision #18).
  // Roll 1 is the most generous; Roll 3 is the highest-risk roll.
  stage: { 1: { APEX: 1.00, ELITE: 1.00 }, 2: { APEX: 0.78, ELITE: 0.88 }, 3: { APEX: 0.58, ELITE: 0.76 } },

  // heldTalentPressure: each held rare card multiplies the weight of FUTURE
  // top-tier cards (locked decision #19). Applies to unresolved slots only and
  // never to a card already held.
  pressure: { APEX: 0.70, ELITE: 0.85 },

  // Floor on the cumulative pressure multiplier: top-tier probability must
  // never reach zero (locked decision #20).
  pressureFloor: 0.30,
  // A pressure multiplier is never allowed to exceed 1 — holding talent must
  // not make more talent MORE likely.
  pressureCap: 1.0,
});

/** Tiers that Draft Pressure and roll-stage scarcity act upon. */
const TOP_TIERS = new Set(["APEX", "ELITE"]);

/** baseRarityWeight — strictly decreasing in Draft Value, strictly positive. */
export const baseRarityWeight = (player, slotPos) =>
  Math.exp(-ODDS.rarityK * draftPctAt(player, slotPos));

/** rollStageModifier — 1 for non-top tiers; scarcer for APEX/ELITE by roll. */
export const rollStageModifier = (tier, roll) => {
  if (!TOP_TIERS.has(tier)) return 1;
  const row = ODDS.stage[roll] || ODDS.stage[3];
  return row[tier] ?? 1;
};

/**
 * heldTalentPressure — the multiplier applied to a top-tier card's weight given
 * what the drafting side is ALREADY holding. Returns 1 for non-top tiers: the
 * pressure targets rarity, it does not secretly weaken every future card.
 */
export const heldTalentPressure = (tier, heldCensus) => {
  if (!TOP_TIERS.has(tier)) return 1;
  const apex = heldCensus?.APEX || 0;
  const elite = heldCensus?.ELITE || 0;
  const m = Math.pow(ODDS.pressure.APEX, apex) * Math.pow(ODDS.pressure.ELITE, elite);
  return Math.min(ODDS.pressureCap, Math.max(ODDS.pressureFloor, m));
};

/** Public, non-exploitative Draft Pressure label. */
export const draftPressureLabel = (heldCensus) => {
  const m = heldTalentPressure("APEX", heldCensus);
  if (m >= 0.95) return "LOW";
  if (m >= 0.66) return "RISING";
  return "HIGH";
};

export const DRAFT_PRESSURE_TOOLTIP =
  "Locking rare talent makes another elite pull less likely, but every player remains possible.";

/** Census of held cards by tier, for pressure. Held cards are never re-weighted. */
export const heldTierCensus = (heldCards, slotOf = null) => {
  const c = { APEX: 0, ELITE: 0, STAR: 0, SPECIALIST: 0 };
  for (const h of heldCards || []) {
    if (!h) continue;
    const t = tierOf(h, slotOf?.(h) ?? h.pos);
    c[t] = (c[t] || 0) + 1;
  }
  return c;
};

/**
 * finalWeight for one card at one slot. positionEligibility is enforced by the
 * caller's pool construction (a card not eligible at the slot has weight 0 by
 * exclusion, never by a magic number here).
 */
export const finalWeight = (player, slotPos, roll, heldCensus) => {
  const tier = tierOf(player, slotPos);
  return baseRarityWeight(player, slotPos)
    * rollStageModifier(tier, roll)
    * heldTalentPressure(tier, heldCensus);
};

// ── Deterministic draw identity ──────────────────────────────────────────────
// nextDrawIdentity = seed + side + slot + roll + heldRosterFingerprint
//                    + burnedPersonFingerprint + draftVersions
//
// Two runs with the same seed AND the same decisions walk an identical path.
// Two runs with the same seed and DIFFERENT decisions branch — deterministically
// and reproducibly — because the held/burned fingerprints are inputs.
export const fingerprintIds = (ids) => hashString([...(ids || [])].sort().join("|"));

export const drawIdentity = ({ seedId, side, slot, roll, heldIds, burnedIds }) =>
  hashString([
    seedId, side, slot, String(roll),
    String(fingerprintIds(heldIds)),
    String(fingerprintIds(burnedIds)),
    CHAOS_DRAFT_VERSION, DRAFT_VALUE_VERSION, DRAFT_PROBABILITY_VERSION,
  ].join("~"));

/**
 * Draw one card for a slot. Pure and deterministic given its inputs.
 *
 * Exclusions are structural, not probabilistic:
 *   - burned people never return (locked decision #14)
 *   - the same canonical PERSON cannot appear twice in one matchup (#15)
 *   - only position-eligible cards are considered
 */
export const drawForSlot = ({
  slot, roll, seedId, side, heldIds, burnedIds, excludeNames, heldCensus, pool = PLAYERS,
}) => {
  const burned = new Set(burnedIds || []);
  const names = new Set(excludeNames || []);
  let eligible = pool.filter(
    (p) => p.positions.includes(slot) && !burned.has(p.id) && !names.has(p.name)
  );
  // A slot must always resolve. If person-uniqueness and burning have emptied
  // the slot, relax the burn constraint (never the person constraint: two of
  // the same person on one court is a correctness violation, an empty slot is
  // merely unlucky). This is reached only in pathological pools and is tested.
  if (eligible.length === 0) {
    eligible = pool.filter((p) => p.positions.includes(slot) && !names.has(p.name));
  }
  if (eligible.length === 0) return null;

  const rng = mulberry32(deriveSeed(drawIdentity({ seedId, side, slot, roll, heldIds, burnedIds }), 0));
  const weights = eligible.map((p) => finalWeight(p, slot, roll, heldCensus));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return eligible[0];
  let t = rng() * total;
  for (let i = 0; i < eligible.length; i++) { t -= weights[i]; if (t <= 0) return eligible[i]; }
  return eligible[eligible.length - 1];
};

/** Draw a full five for one side, respecting holds, burns and person-uniqueness. */
export const drawFive = ({ seedId, side, roll, held = {}, burnedIds = [], opponentNames = [] }) => {
  const out = {};
  const heldCards = POSITIONS.map((s) => held[s]).filter(Boolean);
  const heldCensus = heldTierCensus(heldCards, (c) => POSITIONS.find((s) => held[s]?.id === c.id) || c.pos);
  const heldIds = heldCards.map((c) => c.id);
  // Person-uniqueness spans the WHOLE matchup: the opponent's names are excluded
  // too, so one canonical person can never appear on both sides.
  const used = new Set([...heldCards.map((c) => c.name), ...opponentNames]);
  for (const slot of POSITIONS) {
    if (held[slot]) { out[slot] = held[slot]; continue; }
    const pick = drawForSlot({
      slot, roll, seedId, side, heldIds, burnedIds,
      excludeNames: [...used], heldCensus,
    });
    out[slot] = pick;
    if (pick) used.add(pick.name);
  }
  return out;
};
