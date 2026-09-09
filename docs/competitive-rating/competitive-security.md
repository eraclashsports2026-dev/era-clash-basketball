# Competitive security (Phase 9E)

Certified live on the preview project `lfybiphmqkiecfrqsfzt`, with every
statement executed against the real database and the roles switched — see
`data/validation/9e/rating-rls-live.json`.

## Refused, live

| Attack | Result |
| --- | --- |
| anonymous read of `competitive_profiles` / `competitive_rating_events` | permission denied for table |
| one account reading another's rating or events | 0 rows — own-row policies only |
| `authenticated` writing a profile or a ledger row | permission denied for table |
| `authenticated` calling any competitive function | permission denied for function |
| service role forging a rating | `COMPETITIVE_RATING_FORGED` |
| service role forging a record | `COMPETITIVE_RECORD_FORGED` |
| editing a rating event | `RATING_EVENT_IMMUTABLE` |
| deleting a rating event | `RATING_EVENT_IMMUTABLE` |
| inserting a duplicate event for one attempt | unique violation on `competitive_events_once` |
| rating a self-challenge | `same_account`, no event |
| a forged or absent bearer token | 401, never downgraded to guest |
| an invalid visibility value, or an unknown preference key | `prefs_ok` returns false |
| a private or provisional account asking for a public rank | null — no rank, no window, no estimate |

Cleanup of the synthetic ledger rows required `ALTER TABLE … DISABLE TRIGGER`
as the table owner, which is itself the measure of how immutable the ledger is
to everything short of ownership.

## 9E-L1 — a defect only the live database could show

`competitive_rate_attempt()` originally seeded both profiles with
`insert … on conflict (user_id) do nothing`. In Postgres a `BEFORE INSERT`
trigger fires **before** the conflict is detected, so `competitive_profile_guard`
was handed a fresh `1000 / 0-0-0` row for an account that already held rating
events and raised `COMPETITIVE_RECORD_FORGED`. Every account's *second* rated
match would have failed in production.

Every repository gate passed, because the fake-cloud harness emulates the
function in JavaScript and has no triggers. The fix is to insert only when the
row is genuinely absent (`… select … where not exists (…)`), which is race-free
because both accounts are already held under `pg_advisory_xact_lock`.
`competitive:rls-qa` now fails if any `on conflict … do nothing` insert targets
a table carrying a `BEFORE INSERT` trigger.

## Telemetry

Six closed events: `leaderboard_viewed`, `leaderboard_visibility_changed`,
`competitive_rating_viewed`, `competitive_rating_change_shown`,
`competitive_provisional_progress_viewed`, `around_me_viewed`. The allowlist in
`api/events.js` and the mirror in `src/activation.js` are pinned equal by
tests. Metadata carries buckets and counts; it never carries a display name,
an email, a user id, a challenge code, an attempt id or a token.

## Account deletion

Deleting an account removes its `competitive_profiles` row and drops it from
the board immediately. Its rating events survive with the deleted side set to
null: past opponents keep the ratings they earned, and history against a
removed account reads "Deleted account" rather than a restored snapshot name.
