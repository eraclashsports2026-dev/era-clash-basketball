// ── Card-id aliases ─────────────────────────────────────────────────────────
// A card id is a STABLE KEY. It appears in stored results, result fingerprints,
// saved teams in localStorage, challenge links and analytics, so renaming one is
// a migration rather than an edit.
//
// This module holds the one-way alias table. Old ids keep resolving forever;
// new writes use the canonical id only.
//
// Why `luol-70s` needed this: the card represents CURTIS PERRY, but the id reads
// as Luol Deng. The person identity was always correct — personIdForCard
// resolved it to `curtis-perry` — so nothing was broken; the id was simply
// misleading to anyone reading a fingerprint or a ledger.

/** oldId → canonicalId. One-way and deterministic. */
export const CARD_ID_ALIASES = Object.freeze({
  "luol-70s": "curtis-perry-70s",
});

/**
 * Ids that must NEVER be reassigned to a different player without an explicit
 * future migration. `luol-70s` reads like Luol Deng, and if a Luol Deng card is
 * ever added it must take a fresh id — reusing this one would silently
 * repoint every stored record that already contains it.
 */
export const RESERVED_CARD_IDS = Object.freeze({
  "luol-70s": "Retired alias for curtis-perry-70s. Never reassign — stored results and fingerprints contain it.",
});

/** Canonical id for any id, old or new. Unknown ids pass through unchanged. */
export const resolveCardId = (id) => CARD_ID_ALIASES[id] ?? id;

/** Every alias pointing at a canonical id (for diagnostics and analytics). */
export const aliasesFor = (canonicalId) =>
  Object.entries(CARD_ID_ALIASES).filter(([, v]) => v === canonicalId).map(([k]) => k);

export const isAlias = (id) => Object.prototype.hasOwnProperty.call(CARD_ID_ALIASES, id);
