// ── Lineup placement: eligible positions, legal slots, swaps ─────────────────
// The one place that answers "where can this player go?" for the manual
// builder. Every answer comes from the player card's own `positions` array —
// the authoritative multi-position data — never from a name, a height, a team,
// a decade or a rating. The module is pure so the same rules can be proven in
// tests exactly as the UI applies them.
//
// Slot states are words, not colours: ELIGIBLE (open and legal), SELECTED (this
// player already sits here), OCCUPIED (legal, but someone else is here — a
// swap), INELIGIBLE (the card is not eligible at this position).
import { POSITIONS } from "./players.js";

export const PLACEMENT_VERSION = "1.0.0";

export const SLOT_STATE = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  SELECTED: "SELECTED",
  OCCUPIED: "OCCUPIED",
  INELIGIBLE: "INELIGIBLE",
});

/** How a selection resolves before anyone clicks a slot. */
export const PLACEMENT_MODE = Object.freeze({
  AUTO: "AUTO",                       // exactly one open legal slot → place it
  CHOOSE: "CHOOSE",                   // several open legal slots → pick one
  SWAP_ONLY: "SWAP_ONLY",             // every legal slot is taken → a swap
  DUPLICATE_PERSON: "DUPLICATE_PERSON", // the same canonical person is already on this five
  NONE: "NONE",                       // no legal slot at all (should not happen with real cards)
});

export const POSITION_NAME = Object.freeze({
  PG: "point guard", SG: "shooting guard", SF: "small forward", PF: "power forward", C: "center",
});

const WORD = ["No", "One", "Two", "Three", "Four", "Five"];

/** Every position this card may legally fill, primary first, from card data only. */
export const eligiblePositions = (p) => {
  if (!p) return [];
  const raw = Array.isArray(p.positions) && p.positions.length ? p.positions : (p.pos ? [p.pos] : []);
  const list = raw.filter((s) => POSITIONS.includes(s));
  // Primary first, then the rest in the order the card states them.
  if (p.pos && list.includes(p.pos)) return [p.pos, ...list.filter((s) => s !== p.pos)];
  return [...new Set(list)];
};

export const isEligibleAt = (p, slotIndex) => eligiblePositions(p).includes(POSITIONS[slotIndex]);

/** One canonical person per lineup: two decade-cards of the same player is a duplicate. */
export const samePerson = (a, b) => !!a && !!b && a.name === b.name;
export const personIndex = (five, p, ignoreIndex = -1) =>
  (five || []).findIndex((x, i) => i !== ignoreIndex && samePerson(x, p));

/** A lineup is legal when every filled slot holds an eligible card and no person appears twice. */
export const isLegalLineup = (five) => {
  if (!Array.isArray(five) || five.length !== POSITIONS.length) return false;
  const seen = new Set();
  for (let i = 0; i < five.length; i++) {
    const p = five[i];
    if (!p) continue;
    if (!isEligibleAt(p, i)) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
  }
  return true;
};

/**
 * Describe every slot for a player about to be placed. Nothing is decided
 * here; the UI renders the states and the user (or AUTO) chooses.
 */
export const placementPlan = (five, p) => {
  const lineup = Array.isArray(five) ? five : POSITIONS.map(() => null);
  const dup = personIndex(lineup, p);
  const elig = eligiblePositions(p);
  const slots = POSITIONS.map((pos, index) => {
    const occupant = lineup[index] || null;
    if (!elig.includes(pos)) {
      return { index, pos, state: SLOT_STATE.INELIGIBLE, occupant,
        reason: `${p.name} is not eligible at ${POSITION_NAME[pos]}. Eligible: ${elig.join(", ")}.` };
    }
    if (occupant && samePerson(occupant, p)) {
      return { index, pos, state: SLOT_STATE.SELECTED, occupant, reason: `${p.name} is already here.` };
    }
    if (occupant) {
      return { index, pos, state: SLOT_STATE.OCCUPIED, occupant, reason: `Swap ${occupant.name} for ${p.name}.` };
    }
    return { index, pos, state: SLOT_STATE.ELIGIBLE, occupant: null, reason: `Place ${p.name} at ${POSITION_NAME[pos]}.` };
  });
  const open = slots.filter((s) => s.state === SLOT_STATE.ELIGIBLE).map((s) => s.index);
  const occupied = slots.filter((s) => s.state === SLOT_STATE.OCCUPIED).map((s) => s.index);
  const ineligible = slots.filter((s) => s.state === SLOT_STATE.INELIGIBLE).map((s) => s.index);
  // AUTO only when there is exactly ONE legal slot and it is open: a legal
  // swap is also a choice, so one open slot beside an occupied eligible one is
  // CHOOSE, and a lone occupied slot is a swap the user must confirm — never a
  // silent replacement.
  let mode = PLACEMENT_MODE.NONE;
  if (dup >= 0) mode = PLACEMENT_MODE.DUPLICATE_PERSON;
  else if (open.length === 1 && occupied.length === 0) mode = PLACEMENT_MODE.AUTO;
  else if (open.length === 0 && occupied.length > 0) mode = PLACEMENT_MODE.SWAP_ONLY;
  else if (open.length + occupied.length >= 2) mode = PLACEMENT_MODE.CHOOSE;
  return {
    player: p, eligible: elig, slots, open, occupied, ineligible,
    duplicateIndex: dup, mode,
    autoIndex: mode === PLACEMENT_MODE.AUTO ? open[0] : null,
    // Legal = open or a legal swap. The announcement counts these.
    legalCount: dup >= 0 ? 0 : open.length + occupied.length,
  };
};

/**
 * Place `p` at `index`. Refuses an ineligible slot and a duplicate person, and
 * refuses to produce an illegal lineup. A displaced occupant who has exactly
 * one other open eligible slot is moved there (announced by the caller);
 * otherwise they leave the lineup — never silently, and always undoable
 * because the caller keeps the previous five.
 */
export const place = (five, p, index) => {
  const lineup = Array.isArray(five) ? five.slice() : POSITIONS.map(() => null);
  const plan = placementPlan(lineup, p);
  if (plan.mode === PLACEMENT_MODE.DUPLICATE_PERSON) {
    return { ok: false, code: "DUPLICATE_PERSON", five: lineup, message: `${p.name} is already on this lineup — a five cannot field two versions of the same player.` };
  }
  const slot = plan.slots[index];
  if (!slot || slot.state === SLOT_STATE.INELIGIBLE) {
    return { ok: false, code: "INELIGIBLE", five: lineup, message: slot?.reason || "That position is not available." };
  }
  const displaced = lineup[index] || null;
  lineup[index] = p;
  let relocatedTo = null;
  if (displaced) {
    const openFor = POSITIONS.map((_, i) => i).filter((i) => i !== index && !lineup[i] && isEligibleAt(displaced, i));
    if (openFor.length === 1) { lineup[openFor[0]] = displaced; relocatedTo = openFor[0]; }
  }
  if (!isLegalLineup(lineup)) return { ok: false, code: "ILLEGAL_RESULT", five: Array.isArray(five) ? five : lineup, message: "That swap would leave an illegal lineup." };
  return { ok: true, five: lineup, index, displaced, relocatedTo };
};

/** The screen-reader sentence for a selection, e.g.
 *  "Kevin Durant selected. Eligible positions: small forward and power forward. Two legal positions available." */
export const describeSelection = (plan) => {
  const p = plan.player;
  const names = plan.eligible.map((s) => POSITION_NAME[s]);
  const eligText = names.length <= 1 ? (names[0] || "none")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  let count;
  if (plan.mode === PLACEMENT_MODE.DUPLICATE_PERSON) count = `${p.name} is already on this lineup.`;
  else if (plan.legalCount === 0) count = "No legal position available.";
  else if (plan.legalCount === 1) count = "One legal position available.";
  else count = `${WORD[plan.legalCount] || plan.legalCount} legal positions available.`;
  return `${p.name} selected. Eligible positions: ${eligText}. ${count}`;
};

/** The sentence announced after a placement. */
export const describePlacement = (result, { auto = false } = {}) => {
  if (!result?.ok) return result?.message || "Nothing was placed.";
  const p = result.five[result.index];
  const pos = POSITION_NAME[POSITIONS[result.index]];
  let s = `${p.name} placed at ${pos}${auto ? " automatically" : ""}.`;
  if (result.displaced && result.relocatedTo != null) s += ` ${result.displaced.name} moved to ${POSITION_NAME[POSITIONS[result.relocatedTo]]}.`;
  else if (result.displaced) s += ` ${result.displaced.name} left the lineup.`;
  return `${s} Undo is available.`;
};

/** Compact label for a card: "SF · PF". */
export const eligibleLabel = (p) => eligiblePositions(p).join(" · ");
