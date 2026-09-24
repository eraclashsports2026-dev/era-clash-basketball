# XP contract V1 (Phase 9D)

Every amount lives in `XP` in `src/progression/contract.js`. No component
carries a number of its own (a gate scans for one).

## Sources

| Source key | XP | Awarded when | Once per |
| --- | --- | --- | --- |
| `clash:<result_id>:completion` | 100 | an authoritative completed Clash is saved to the career — Chaos Clash, Dream Matchup, and any other mode whose result becomes a `saved_clashes` row | result |
| `clash:<result_id>:win` | 25 | that saved Clash's outcome is `win` (a tie or a loss earns none) | result |
| `era:<era_id>:first_completion` | 50 | the account's first completed Clash in that Era | account × Era |
| `challenge_attempt:<attempt_id>:completion` | 50 | the account's official challenge attempt is completed | attempt |
| `challenge_attempt:<attempt_id>:victory` | 25 | the comparison contract decided `recipient` | attempt |
| `challenge_attempt:<attempt_id>:creator_response` | 25 | another **account** completes an official attempt against the creator's challenge | attempt (one attempt per account per challenge) |
| `achievement:<achievement_id>:unlock` | 50 / 100 / 250 | an achievement's target is met by the account's records | achievement id, whatever its catalog version |

A guest's response earns the creator nothing: a guest is not an account and a
guest device is an easy thing to multiply. Creating a challenge, copying a
link, and an attempt that never completes earn nothing.

## Never an XP source

Rolling, holding a player, revealing an Era, choosing a coach, opening a
result, copying a challenge link, creating unlimited challenges, opening the
site, signing in, changing profile settings, saving or favoriting a roster,
refreshing, abandoning a game, daily login. There is no source type for any of
them (`SOURCE_TYPES` is `clash`, `era`, `challenge_attempt`, `achievement`;
`REASONS` is `completion`, `win`, `first_completion`, `victory`,
`creator_response`, `unlock`; both are check constraints in the database).

## Idempotency

`xp_ledger` is unique on `(user_id, source_type, source_id, reason)`. Every
trigger runs the same reconcile, so:

| Event | Additional XP |
| --- | --- |
| refreshing the Result page | 0 |
| opening My EraClash | 0 |
| re-saving a result | 0 |
| retrying a network request | 0 |
| six simultaneous saves of one result | one award (advisory lock + unique constraint) |
| Run It Back | the **new** game earns; the original never earns again |
| a claimed guest result | once, after the claim; the later save adds 0 |

Verified by `npm run progression:xp-qa`, `progression:concurrency-qa`,
`progression:reconcile-qa`, the unit suite and the live database record.

## Farming rule

No hidden throttle. A player who legitimately finishes many Clashes earns for
each. What cannot earn twice is the same result id, the same attempt, an
abandoned or unsimulated game (no saved row), a forged or deleted result id
(no saved row), a delta outside 1–1000, or a source outside the vocabulary.
