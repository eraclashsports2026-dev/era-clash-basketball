// ── Canonical person identity ─────────────────────────────────────────────────
// A CARD is a player-decade (`jordan-90s`). A PERSON is the human (`michael-
// jordan`). One person may hold several cards. The distinction is load-bearing:
// api/game.js refuses a lineup that fields two versions of the same person, so
// getting person identity wrong changes what the live product accepts.
//
// WHY THIS FILE EXISTS — the old rule was to strip the era suffix off the card
// id and call the remainder the person. That is a guess about a string, not a
// fact about a human, and auditing it against the 379-card pool on 2026-08-24
// found it wrong in nine places, in both directions:
//
//   SPLIT — one human read as two people, so the duplicate rule did not fire:
//     Bill Russell      russell-50s -> "russell"   bill-60s    -> "bill"
//     Bob Pettit        pettit-50s  -> "pettit"    bob-60s     -> "bob"
//     Rick Barry        rick-70s    -> "rick"      barry-60s   -> "barry"
//     Charles Barkley   charles-80s -> "charles"   barkley-90s -> "barkley"
//     Carmelo Anthony   carmelo-00s -> "carmelo"   melo-10s    -> "melo"
//     Mark Price        price-80s   -> "price"     mark-p-90s  -> "mark-p"
//     Antawn Jamison    antawn-90s  -> "antawn"    jamison-00s -> "jamison"
//   COLLIDE — two humans read as one person, so legal lineups were refused:
//     "chet" = Chet Walker (60s, 70s) AND Chet Holmgren (20s)
//     "dj"   = Dennis Johnson (80s)   AND DeAndre Jordan (10s)
//
// Until this file, a lineup could legally field 1950s Russell alongside 1960s
// Russell — two Bill Russells — while Chet Walker and Chet Holmgren, who never
// shared a century let alone a locker room, were rejected as the same man.
//
// THE FIX — identity comes from the card's `name`, which is the human's name,
// slugified. Cards agree on the person exactly when they agree on the person.
// Verified safe against the pool: 323 distinct persons, zero slug collisions
// between different names, and no same-name pair spanning more than three
// decades (the Sr./Jr. hazard). ALIASES below handles the remaining case —
// a person whose cards legitimately carry different name strings.
//
// NICKNAMES ARE NOT PEOPLE. `tiny-70s` and `tiny-80s` both carry the name
// "Nate Archibald", so they already resolve to one person; there is no separate
// "Tiny Archibald". Nicknames belong in displayName, never in identity.
import { PLAYERS } from "../../players.js";

const slug = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Person-level aliases: map a name variant onto the canonical personId. Add an
// entry ONLY when the same human genuinely appears under two name strings.
// Do NOT add nicknames or suffixes here — those belong in DISPLAY_NAMES.
export const ALIASES = {
  // (none required at present — every multi-card person shares one name string)
};

// Optional richer display names. Purely presentational; never identity.
export const DISPLAY_NAMES = {
  "nate-archibald": 'Nate "Tiny" Archibald',
  "walt-bellamy": "Walt Bellamy",
  "earvin-johnson": "Magic Johnson",
};

/** Canonical personId for a card's name. */
export const personIdFromName = (name) => {
  const s = slug(name);
  return ALIASES[s] || s;
};

const CARD_TO_PERSON = (() => {
  const m = new Map();
  for (const p of PLAYERS) m.set(p.id, personIdFromName(p.name));
  return m;
})();

/** Canonical personId for a card id, or null if the card is unknown. */
export const personIdForCard = (cardId) => CARD_TO_PERSON.get(cardId) ?? null;

/** All cards belonging to one person. */
export const cardsForPerson = (personId) =>
  PLAYERS.filter((p) => personIdFromName(p.name) === personId).map((p) => p.id);

/** personId → { personId, displayName, cardIds[], decades[] } */
export const PERSON_INDEX = (() => {
  const idx = new Map();
  for (const p of PLAYERS) {
    const pid = personIdFromName(p.name);
    if (!idx.has(pid)) idx.set(pid, { personId: pid, displayName: DISPLAY_NAMES[pid] || p.name, cardIds: [], decades: [] });
    const e = idx.get(pid);
    e.cardIds.push(p.id);
    e.decades.push(p.decade);
  }
  return idx;
})();

export const ALL_PERSON_IDS = [...PERSON_INDEX.keys()];
