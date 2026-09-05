# Saved rosters

A five a player chooses to keep, in `public.saved_rosters`. Owner-written under
RLS; a second account sees none of them.

## What is stored

Identity references only. A snapshot is an array of one to five objects, each
`{ id, name?, pos? }` and **nothing else**. This is enforced twice:

- `rosterSnapshotFrom()` in the client drops every other key;
- the `roster_snapshot_ok()` CHECK constraint refuses a row that carries any
  other key (a `rating`, an `ovr`, a badge).

So a client can never make a capability true by saving it, and the game
reconstructs every player from the canonical registry at play time. The coach
snapshot is `{ id?, name? }` only.

## Limits and immutability

- A free account keeps **10** rosters. The 11th is refused by the
  `enforce_saved_roster_limit` trigger. The number lives in
  `src/accounts/careerV2.js` (`SAVED_ROSTER_LIMIT_FREE`); a contract test pins it
  to the trigger. `src/entitlements.js`, the frozen gameplay-policy file, is not
  touched — a roster count is an account limit, not a gameplay entitlement.
- The snapshot and its version are immutable once written (a guard trigger
  raises `ROSTER_SNAPSHOT_IMMUTABLE`). The display name and the favorite flag are
  editable; renaming stamps `renamed_at`, favoriting stamps `favorited_at`
  server-side.

## Saving one

From any Clash in your history, **Save roster** stores its gold five, coach, era
and source. The default name is drawn from the first three surnames
("Jordan / Duncan / Curry"), and is renameable.
