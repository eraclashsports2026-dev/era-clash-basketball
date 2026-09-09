// ── The canonical rating basis for the Synthetic V2 guardrails ───────────────
//
// requireConstructionCanBeatHigherOvr and requireExtremeTalentRemainsMeaningful
// are claims about OVR. OVR is not a quantity this phase gets to invent: it is
// src/rating.js, the position-weighted rating the product computes and shows.
// An earlier draft used a hand-rolled summed-stat proxy and the calibration
// ladder exposed it — a five the proxy rated 1.75x higher LOST 60% of games
// across all three eras, because the proxy tracked accolade counts rather than
// the position-weighted production and balance the product actually rates on.
//
// The talent surface also changed shape as a result. Targeting a rating level
// and letting a search pick any five that reaches it does not isolate talent:
// the search is free to return a differently CONSTRUCTED five, and construction
// is the other axis under test. So the strong side is built by upgrading the
// weak side SLOT BY SLOT, preserving position and functional role, which leaves
// card quality as the only thing that moved.
import { slotRating, teamRating, displayOVR } from "../../src/rating.js";
import { PLAYERS, findCard } from "../../src/players.js";
import { buildIntelligence } from "../../src/v3/intelligence.js";
import { personIdForCard } from "../../src/v3/data/persons.js";

export const SLOTS = Object.freeze(["PG", "SG", "SF", "PF", "C"]);
export const person = (id) => personIdForCard(id) ?? id;
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

const _prof = new Map();
export const profileOf = (id) => {
  if (!_prof.has(id)) _prof.set(id, buildIntelligence(findCard(id), {}));
  return _prof.get(id);
};

/** The product's per-slot rating for one card in one slot. */
export const cardSlotRating = (id, slot) => slotRating(findCard(id), slot);
/** The product's team rating for a five, in PG..C order. */
export const fiveRating = (five) => teamRating(five.map(findCard), SLOTS);
/** The 60-99 display OVR the UI shows, per slot. */
export const fiveDisplayOvr = (five) => five.map((id, i) => displayOVR(findCard(id), SLOTS[i]));
/** Summed per-slot rating, i.e. teamRating before the balance multiplier. */
export const summedSlotRating = (five) => five.reduce((a, id, i) => a + cardSlotRating(id, SLOTS[i]), 0);

/**
 * Upgrade a five slot by slot: same slot, same functional role, a strictly
 * better card. A slot with no role-preserving upgrade in the pool is left
 * unchanged and recorded, so the result is never weaker anywhere and the
 * construction is held as close to fixed as the pool allows.
 */
export const buildRoleMatchedUpgrade = ({ five, factor, exclude = new Set() }) => {
  const used = new Set(five.map(person));
  const out = []; const slots = [];
  for (const [i, id] of five.entries()) {
    const slot = SLOTS[i];
    const base = cardSlotRating(id, slot);
    const role = profileOf(id).roles?.primary ?? null;
    const cands = PLAYERS.filter((c) => (c.positions ?? [c.pos]).includes(slot)
      && !exclude.has(person(c.id)) && !used.has(person(c.id))
      && (profileOf(c.id).roles?.all ?? []).includes(role)
      && slotRating(c, slot) > base);
    cands.sort((a, b) => {
      const pa = profileOf(a.id).roles?.primary === role ? 0 : 1;
      const pb = profileOf(b.id).roles?.primary === role ? 0 : 1;
      return pa - pb || slotRating(a, slot) - slotRating(b, slot) || a.id.localeCompare(b.id);
    });
    const target = base * factor;
    const pick = cands.find((c) => slotRating(c, slot) >= target && profileOf(c.id).roles?.primary === role)
      ?? cands.find((c) => slotRating(c, slot) >= target)
      ?? cands[cands.length - 1] ?? null;
    if (pick) {
      used.add(person(pick.id)); out.push(pick.id);
      slots.push({ slot, from: id, to: pick.id, fromRating: r5(base), toRating: r5(slotRating(pick, slot)),
        role, roleMatch: profileOf(pick.id).roles?.primary === role ? "PRIMARY" : "SECONDARY",
        reachedTarget: slotRating(pick, slot) >= target });
    } else {
      out.push(id);
      slots.push({ slot, from: id, to: id, fromRating: r5(base), toRating: r5(base), role,
        roleMatch: "UNCHANGED", reachedTarget: false,
        reason: `the pool has no card legal at ${slot} carrying the role "${role}" with a higher slot rating` });
    }
  }
  const before = fiveRating(five); const after = fiveRating(out);
  return { five: out, slots, factor,
    ratingBefore: before, ratingAfter: after, achievedRatio: r5(after / before),
    slotsUpgraded: slots.filter((s) => s.roleMatch !== "UNCHANGED").length,
    noSlotGotWorse: slots.every((s) => s.toRating >= s.fromRating),
    primaryRoleMatches: slots.filter((s) => s.roleMatch === "PRIMARY").length,
    rule: "per slot, the lowest-rated card that is legal in the slot, carries the original's primary functional role, is rated above the original, and reaches the target factor if any candidate does; primary-role matches preferred over secondary; ties by card id. A slot with no such card is left unchanged." };
};
