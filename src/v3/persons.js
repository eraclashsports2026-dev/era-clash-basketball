// ── Duplicate-person rules (Addendum 16) ──────────────────────────────────────
// EraClash cards are era-versions of real people (jordan-80s and jordan-90s
// are both Michael Jordan). The rules:
//   WITHIN one team  — no two versions of the same person. A lineup cannot
//                      field 1980s Jordan next to 1990s Jordan.
//   ACROSS teams     — different versions of the same person are ALLOWED and
//                      encouraged: 80s Jordan vs 90s Jordan is a core EraClash
//                      fantasy. IDs stay distinct, so analytics, box scores,
//                      and challenge validation all remain correct.
//
// Identity now comes from the canonical person registry (data/persons.js),
// which resolves a card to the HUMAN it depicts via that card's name. The
// previous implementation stripped the era suffix off the card id and treated
// the remainder as the person. That was a guess about a string rather than a
// fact about a human, and it was wrong nine times in the 379-card pool — in
// both directions. It let a lineup field russell-50s alongside bill-60s (two
// Bill Russells) while refusing Chet Walker beside Chet Holmgren.
//
// The suffix strip survives ONLY as a fallback for ids that are not in the
// player pool at all (synthetic ids in tests, future cards not yet loaded), so
// this module never throws on an unknown id.
import { personIdForCard } from "./data/persons.js";

const stripEraSuffix = (id) => String(id).replace(/-(\d0s|2ks|2010s)$/, "");

// Canonical person identity for a card id. Returns a real personId
// ("michael-jordan") for known cards, and a suffix-stripped fallback for
// unknown ones. Callers use it only for equality and error labelling.
export const personKey = (id) => personIdForCard(id) ?? stripEraSuffix(id);

// Returns the offending person key if the id list contains two versions of the
// same person, else null.
export const findDuplicatePerson = (ids) => {
  const seen = new Set();
  for (const id of ids || []) {
    const key = personKey(id);
    if (seen.has(key)) return key; // two versions of one person (or the same card twice)
    seen.add(key);
  }
  return null;
};
