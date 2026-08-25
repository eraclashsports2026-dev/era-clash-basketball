# Card-id migrations

A card id is a **stable key**. It appears in stored results, result fingerprints, saved teams in
`localStorage`, challenge links and analytics. Renaming one is a migration, not an edit.

## Registry

| Old id | Canonical id | Reason |
|---|---|---|
| `luol-70s` | `curtis-perry-70s` | The card represents **Curtis Perry**; the id reads as Luol Deng |

## What was and was not broken

Verified directly rather than assumed: `personIdForCard("luol-70s")` already returned
**`curtis-perry`**, and `PERSON_INDEX.get("curtis-perry")` already listed the card. The *person*
identity was always correct. Nothing was broken — the **id string** was misleading to anyone reading
a fingerprint, a ledger or an analytics row.

## Compatibility model

`src/v3/data/cardAliases.js` holds a one-way, deterministic table:

```
CARD_ID_ALIASES  = { "luol-70s": "curtis-perry-70s" }
RESERVED_CARD_IDS = { "luol-70s": "never reassign — stored records contain it" }
resolveCardId(id) // unknown ids pass through unchanged
```

`findCard(id)` in `src/players.js` is the **only** lookup that should be used for an id that came from
outside the process. A bare `PLAYERS.find` returns `undefined` for a retired alias and silently
breaks an old record.

Patched to resolve aliases:

- `api/_lib/validate.js` — alias keys are added to the `byId` map, so a stored result or challenge
  link containing the retired id still **validates** server-side
- `src/v3/playerProfile.js`, `src/v3/intelligence.js`, `src/v3/teamIntelligence.js`,
  `src/v3/possession/testContext.js` — engine paths
- `src/challengeClient.js` — challenge links
- `src/App.jsx`, `src/components/Profile.jsx`, `src/components/ManualPicker.jsx` — saved teams and
  shared results read from storage

## Fingerprint behaviour

`canonicalSide` in `src/v3/fingerprint.js` **canonicalises ids before hashing**. Old and new id forms
therefore produce the **identical** `matchupFingerprint`.

This was a deliberate choice with a real trade-off. The replay path reads a stored record's
`goldIds` and **re-derives** the fingerprint; it never compares a stored hash string. Canonicalising
makes that re-derivation stable across the rename. The alternative — never canonicalising — would
have kept a misleading id inside every future fingerprint forever.

Verified: an old-id lineup and a canonical-id lineup produce a byte-identical box score, a
byte-identical possession ledger, and the same fingerprint. New results write the **canonical** id
into the box score.

## Deprecation policy

- Retired ids resolve **forever**. There is no removal date.
- A retired id is **never reassigned**. If a Luol Deng card is ever added it takes a fresh id;
  reusing `luol-70s` would silently repoint every stored record containing it.
- Aliasing is **one-way**. `curtis-perry-70s` never resolves back to `luol-70s`.
- No duplicate person identity is created — `cardsForPerson("curtis-perry")` returns exactly one card.
- No stored result is rewritten. Old records keep the id they were written with; analytics may
  distinguish stored id from resolved canonical id.
