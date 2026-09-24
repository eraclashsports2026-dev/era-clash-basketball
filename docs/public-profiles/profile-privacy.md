# Profile privacy and security (Phase 9F)

Certified live on the preview project `lfybiphmqkiecfrqsfzt`, with every
statement executed against the real database and the roles switched — see
`data/validation/9f/profile-rls-live.json`. The database layer was certified
**before any client code existed**, so the thing being trusted is the thing
that was tested.

## Any private-profile leak is a P0

There was none. What was verified, live:

| Attack | Result |
| --- | --- |
| anonymous read of `public_profiles` / `profile_featured_achievements` | permission denied for table |
| anonymous call of `profile_public_get` | permission denied for function |
| one account reading another's profile row or featured rows | 0 rows — own-row policies only |
| `authenticated` inserting a featured achievement | permission denied for table |
| `authenticated` calling `profile_set_featured` | permission denied for function |
| `authenticated` changing its own slug | permission denied for table |
| service role changing a slug | `PUBLIC_PROFILE_SLUG_IMMUTABLE` |
| featuring a **locked** achievement | `not_unlocked` |
| featuring an unknown id | `not_unlocked` (fail-closed; the JS contract names it `unknown_achievement` for the UI) |
| featuring another account's unlock | `not_unlocked` |
| a fourth featured achievement | `too_many` |
| a duplicate | `duplicate` |
| `'DROP TABLE users'` as an achievement id | `malformed` |
| an invalid `profile_visibility`, wrong case, wrong type, or an unknown key | `prefs_ok` returns false |
| a private profile, unknown slug, malformed slug, auth uuid as slug, empty string, injection-shaped slug | all identical: **no rows** |

Every featured refusal is **atomic**: the previously saved showcase survived
each one intact.

### One nuance worth stating precisely

An authenticated account attempting to flip **another** account's
`profile_visibility` raises **no error** — RLS scopes the statement to its own
rows, so it matches zero rows and changes nothing. That is silent zero-row
scoping, not an error refusal. Both are safe; the artifact records which one
actually happens rather than claiming a denial that Postgres never issues.

## Two defects the live pass found before the UI existed

**9F-L1 — wrong public data.** `profile_public_get` mapped `rated_matches` into
the `unique_opponents` position of its `RETURNS TABLE`. The types matched, so
nothing complained, and a public profile reported 5 opponents for an account
with 3. A provisional card would have shown the match count where the opponent
count belongs.

**9F-L2 — the provisional card could not render.** `rated_matches` was gated
behind `case when c.placed` along with the rating, leaving the card specified
to read "3 / 5 RATED MATCHES, 2 / 3 OPPONENTS" with nothing to show. The two
placement counts are now public; the rating, rank and W-L-T split stay private
until placement.

## A third, in the contract

`publicProfile()` originally re-derived "show a rank only when placed and on
the leaderboard" from `leaderboard_visibility`. But that is a **private**
preference which must never travel in a public payload — so a public row cannot
carry it, and the projection nulled a rank the database had correctly granted.
The predicate is now documented in the contract and implemented in the SQL,
where the authority is, and a public row simply carries the rank it was given.
Passing a private field into a public payload builder is a footgun even when it
happens to work.

## Telemetry

Six closed events: `public_profile_viewed`, `profile_visibility_changed`,
`public_profile_previewed`, `public_profile_shared`,
`featured_achievement_updated`, `leaderboard_profile_opened`. The allowlist in
`api/events.js` and the mirror in `src/activation.js` are pinned equal by
tests. Metadata carries categories and counts only — never a display name, an
email, an account or auth id, **the slug**, a challenge or attempt id, or a
token.

## Account deletion

Deleting an account removes its `public_profiles` row and its featured rows by
`ON DELETE CASCADE`, so the profile stops resolving immediately, the former
display name leaks nowhere and no stale profile route remains. Its rating
events survive with the deleted side nulled: surviving opponents keep the
ratings they earned, and history reads "Deleted account" as Phase 9C
established.
