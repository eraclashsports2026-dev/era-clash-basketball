// ── Duplicate-person rules (Addendum 16) ──────────────────────────────────────
// EraClash cards are era-versions of real people (jordan-80s and jordan-90s
// are both Michael Jordan). The rules:
//   WITHIN one team  — no two versions of the same person. A lineup cannot
//                      field 1980s Jordan next to 1990s Jordan.
//   ACROSS teams     — different versions of the same person are ALLOWED and
//                      encouraged: 80s Jordan vs 90s Jordan is a core EraClash
//                      fantasy. IDs stay distinct, so analytics, box scores,
//                      and challenge validation all remain correct.
// The person key strips the era suffix from a card id. Suffix forms in the
// dataset: -50s … -20s, -2ks, -2010s.
export const personKey = (id) => String(id).replace(/-(\d0s|2ks|2010s)$/, "");

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
