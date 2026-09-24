# Leaderboard contract V1 (Phase 9E)

One public board: **Challenge Rating**, as a raw number. There is no XP
leaderboard, no level leaderboard, no achievement leaderboard, no tiers and no
badges — and V1 adds no new tab to My EraClash.

## Who appears

A row exists only for an account that is **both**:

1. **public** — `user_preferences.leaderboard_visibility = 'public'`. The key
   belongs to the Phase 9B.2 closed preference vocabulary, accepts only
   `private` and `public`, and defaults to `private`. An account with no
   preference row at all is private; the live certification confirmed the
   database returns an empty board in that state, so privacy is not something
   the client is trusted to apply.
2. **placed** — 5 rated matches **and** 3 unique authenticated opponents.

Top 100. Signed-out visitors may read the public board; they never see a
private account.

## Ordering

| # | Key | Direction |
| --- | --- | --- |
| 1 | `current_rating` | descending |
| 2 | `rated_wins` | descending |
| 3 | `rated_losses` | ascending |
| 4 | `last_rated_at` — who reached the current rating first | ascending |
| 5 | `user_id` | ascending |

Key 5 is the **deterministic final tie-breaker**. It is stable, it is never
displayed, and it guarantees that two accounts identical on every visible
column still receive a fixed, repeatable order. Ties are never broken by
insertion order or by anything the client sends.

`competitive_profiles_board_idx` indexes exactly these five columns in this
order, so the board is one indexed projection. The browser never downloads
accounts to sort them.

## What a row may carry

`rank`, `displayName`, `initials`, `rating`, `wins`, `losses`, `ties`,
`matches`, `winPct`, `streak` and — optionally — `level`.

Never: email, account id, challenge or attempt id, seed, token, cookie, or any
other private field. `FORBIDDEN_PUBLIC_FIELDS` names them and the gates scan
the responses.

Win % is rated wins over rated matches. Ties are visible in W–L–T and are not a
tie-break.

## Around Me

For a **placed, public** account: approximately two rows above, the account
itself, and two rows below, drawn from the same ranking and resolved
server-side by `competitive_rank_of()`. Near the top or bottom the window is
honestly short — it is never padded and never wrapped.

A private account, and a public account that has not yet placed, receive
**nothing**: no rank, no window, and no estimate. No hypothetical rank is ever
computed for a private user. Any leak here is a P0.

## Before placement

A signed-in account sees its own rating, its record and its placement progress
(`n / 5` rated matches, `n / 3` unique opponents) privately. No public row, no
rank.

## Empty state

> **THE FIRST RANKINGS ARE FORMING**
> Complete official Challenges to establish your Competitive Rating.

## Refresh

On page load and on navigation. No polling. The My Rating module updates from
the Challenge completion response.

## Related

- [Competitive Rating contract V1](./competitive-rating-contract-v1.md)
- [Competitive security](./competitive-security.md)
