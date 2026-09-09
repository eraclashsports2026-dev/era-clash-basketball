# Competitive operator guide (Phase 9E)

## Where things live

| Piece | Path |
| --- | --- |
| Pure contract (math, eligibility, ordering, projection) | `src/competitive/contract.js` |
| Browser client | `src/competitive/client.js` |
| Server library | `api/_lib/competitive.js` (dispatched by `api/profile.js` — no new function) |
| Schema and database functions | `supabase/migrations/0006_competitive_rating_v1.sql` |
| Leaderboard page and view | `src/components/competitive/LeaderboardPage.jsx` |
| Overview module, rating movement, visibility control | `src/components/competitive/` |
| Dev reference fixture (`/dev/competitive-reference`) | `src/ui/competitive/CompetitiveReferenceFixture.jsx` |
| Gates | `scripts/competitive/competitiveQa.mjs` |
| Serial sweep | `scripts/competitive/phase9eSweep.sh` |
| Preservation, ledger and summary | `scripts/competitive/phase9eSummary.mjs` |

## Running the gates

The file-only gates need nothing running:

```bash
npm run competitive:contract-qa
npm run competitive:rating-qa
npm run competitive:backfill-qa
npm run competitive:rls-qa
```

The rest need the fake-cloud harness on 4178 and, for the UI gates, the
fixtures harness on 4179. `scripts/competitive/phase9eSweep.sh` starts both,
runs every gate serially and stops them again. Never run the vitest suite
beside Playwright — chain them.

```bash
bash scripts/competitive/phase9eSweep.sh                       # local
bash scripts/competitive/phase9eSweep.sh https://<preview>     # plus deployed
```

## Reading a rating that looks wrong

1. `competitive_rating_events` is the ledger. The profile is a projection of
   it: `current_rating` is the rating after the newest event, and W-L-T is
   counted from events. If they disagree, the guard would have refused the
   write, so they cannot.
2. An event records both ratings before, both expected scores, both deltas and
   both ratings after. Replay it with `rateMatch()` from the contract — the
   live certification does exactly this and matches to four decimals.
3. A match that did not move a rating has a reason, not a `+0`. Look for the
   unrated reason in the completion response.

## Backfill

```sql
select public.competitive_reconcile('1.0.0', 3, 7, 500);
```

Returns `{seen, rated, skipped}`. It is safe to run repeatedly: a second run
rates nothing. It orders by `completed_at`, then attempt id, so the numbers do
not depend on when rows arrived.

## Applying the migration

Preview project `lfybiphmqkiecfrqsfzt` only; production has no cloud accounts
and must stay untouched. The migration is idempotent (`create or replace`,
`create table if not exists`, `drop policy if exists`), so re-applying it is
the way to guarantee the live function bodies match the committed file. Verify
by comparing `md5(pg_proc.prosrc)` against the body in the migration.

## What must never change

`COMPETITIVE_RATING_POWER_EFFECT` is 0. If a future phase wants the rating to
affect a game, that is a new methodology and needs a new version key — bumping
`1.0.0` in place would silently break the frozen policy hashes that pin it.
