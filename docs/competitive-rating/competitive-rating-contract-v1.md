# Competitive Rating contract V1 (Phase 9E)

> "How do I rank against other coaches who accepted the same Challenge?" —
> never "How much stronger is my team because I have played more?"

The Challenge Rating is an **Elo-style number that measures results between
accounts**. It is separate from Career XP in every direction:
`COMPETITIVE_RATING_POWER_EFFECT = 0` is a constant in the contract and an
invariant the gates prove. No roll, draft, era, coach, placement, Legend Rival
or simulation path imports the rating, and the rating imports none of theirs.
Two accounts given the same basketball decisions have exactly the same
opportunity to win, whatever their ratings say.

Version `COMPETITIVE_RATING_VERSION 1.0.0`. The pure contract is
`src/competitive/contract.js`; the server is `api/_lib/competitive.js`,
dispatched by `api/profile.js` (no new serverless function); the schema is
`supabase/migrations/0006_competitive_rating_v1.sql`.

## The numbers

| Constant | Value |
| --- | --- |
| Initial rating | 1000 |
| Expectation | `EA = 1 / (1 + 10 ^ ((RB − RA) / 400))`, held to four decimals |
| Result | win 1, tie 0.5, loss 0 |
| K | 40 for a player's first ten rated matches, 24 after |
| Rounding | `round()` half **away from zero**, in JavaScript and in SQL |
| Floor | 100 |
| Placement | 5 rated matches **and** 3 unique authenticated opponents |
| Repeat-opponent limit | 3 rated outcomes per pair in a rolling 7 days |

At the floor the two deltas stop mirroring each other: the loser's rating is
clamped and the ledger stores the clamped difference, while the winner's gain
is untouched. That is deliberate, and the gates pin it.

## What may be rated

Only an **official Challenge comparison between two authenticated accounts**.
Phase 9C's `challenge_outcome` (`creator` | `recipient` | `tie`) is consumed as
given. The rating never looks at a basketball score: the live certification
rated eight events whose attempts all carried the identical score line, and
produced three different competitive outcomes.

Everything else is explicitly **unrated**, with a reason from a closed set and
copy to match — never a fake `+0`:

| Reason | When |
| --- | --- |
| `guest_participant` | either side is not an authenticated account |
| `same_account` | a self-challenge |
| `not_completed` | the attempt is not completed, or carries no comparison |
| `repeat_opponent_limit` | the pair has already spent three rated outcomes in seven days |
| `already_rated` | this attempt has a rating event at this version |
| `not_eligible` | the attempt does not exist |

Ordinary Chaos, Dream Matchup, Daily Clash, Run It Back on its own and QA
fixtures are never rated. An unrated Challenge still earns whatever Phase 9D XP
it is eligible for; the two systems do not gate each other.

## Authority model

- **The server decides the movement; the browser displays it.** The request
  body contributes nothing — not a score, not a delta, not a rating, not a
  user id. Identity is the verified bearer token.
- **The database is the last word.** `competitive_rate_attempt()` is
  `SECURITY DEFINER`, executable by the service role alone. It takes two
  advisory locks in a fixed order (`least`, `greatest`) so two concurrent
  completions sharing an account cannot deadlock, re-checks the ledger after
  waiting, then inserts the event and updates both profiles in one transaction.
- **One attempt, one event, forever.** `competitive_events_once`
  (`challenge_attempt_id`, `rating_version`) is unique; a refresh or retry
  returns `already_rated` and writes nothing. A trigger refuses every `UPDATE`
  and every `DELETE` on the ledger; another refuses any profile whose rating or
  record disagrees with the ledger.

## Backfill and reconciliation

`competitive_reconcile()` rates every pending eligible attempt in
`completed_at` ascending order, with the attempt id as the deterministic
secondary key. A second run rates nothing and changes nothing. Reconciliation
never rewrites rated history and never resets an ordinary profile to 1000; a
completion that arrives late is rated once, from the ratings current at that
moment, which is recorded rather than retro-applied.

## Related

- [Leaderboard contract V1](./leaderboard-contract-v1.md)
- [Competitive security](./competitive-security.md)
- [Operator guide](./competitive-operator-guide.md)
