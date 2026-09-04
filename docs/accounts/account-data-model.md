# Account data model

Three tables, three views, one rule: **a browser can read its own rows and
change its own display name, and nothing else.** Career records are written by
the server after it has verified who is asking and proved the result belongs to
them.

Migration: `supabase/migrations/0001_accounts.sql`.

## profiles

One row per authenticated user, created by a trigger on sign-up
(`handle_new_user`), so exactly one profile exists per account and the product
never has to create one.

| Column | Notes |
| --- | --- |
| `user_id` | primary key, references `auth.users`, cascades on delete |
| `display_name` | 1–24 characters, may not contain `<` or `>` |
| `avatar_url` | nullable, must start `https://` |
| `created_at`, `updated_at` | `updated_at` maintained by a trigger |

**There is no email column.** The address stays in `auth.users`, where only the
user's own session can read it, and it is never shown as a public identity.
The display name is seeded from the OAuth full name when one is offered,
sanitised and truncated; otherwise it is "Coach".

## saved_clashes

One immutable career snapshot per (user, authoritative result).

| Column | Source |
| --- | --- |
| `user_id` | the **verified** account token, never a request body |
| `result_id` | the id the client asked to save, shape-checked in the database |
| `mode`, `outcome`, `gold_score`, `blue_score`, `era_id` | the authoritative result record |
| `gold_roster`, `blue_roster`, `gold_coach`, `blue_coach`, `mvp` | the same record |
| `candidate_id`, `calibration_version`, `candidate_core_hash` | the record's own candidate identity |
| `theme_version`, `build_stamp` | which build the game was played on |
| `challenge_fingerprint` | `sha256("challenge|" + id)`, truncated — never the seed |
| `claimed_from` | `signed_in`, `guest_claim` or `device_import` |
| `result_snapshot` | the record minus its device session |
| `played_at` | the record's creation time |

`unique (user_id, result_id)` makes a repeated save idempotent.
`result_snapshot` carries enough to re-render the full report after the
temporary result cache expires, which is why a saved Clash keeps the numbers
the original candidate produced instead of being recomputed by a newer one.

## result_claims

The durable ownership record. `result_id` is the **primary key**, so one
authoritative result can belong to exactly one account and the second account to
try loses without a check-then-write race.

| Column | Notes |
| --- | --- |
| `result_id` | primary key |
| `user_id` | the owning account |
| `device_session_hash` | `sha256` of the server-minted guest session, 64 hex |
| `claimed_via`, `claimed_at` | provenance |

The guest session itself is never stored. No credential of any kind is.

## Career views

`career_summary`, `career_by_mode` and `career_streak` are **derived** from
`saved_clashes` rather than kept as counters that can drift. All three are
declared `security_invoker = true`, so they run as the querying user and the
table's policies are what isolate one career from another.

There is no rank, no contender grade, no percentile and no leaderboard position,
because none of those exist in the product.

## Row level security

Enabled on every user-owned table. The complete policy set:

| Table | Command | Role | Scope |
| --- | --- | --- | --- |
| `profiles` | select | authenticated | `user_id = auth.uid()` |
| `profiles` | update | authenticated | `user_id = auth.uid()` in both `using` and `with check` |
| `saved_clashes` | select | authenticated | `user_id = auth.uid()` |
| `result_claims` | select | authenticated | `user_id = auth.uid()` |

There is deliberately **no** insert, update or delete policy on `saved_clashes`
or `result_claims`, and no insert or delete policy on `profiles`. A signed-in
browser therefore cannot forge a career record, edit a score, or delete someone
else's history even with a completely valid session.

## Effective privileges (migration 0002)

Policies are only half of it. Supabase grants every new table in `public` to
`anon` and `authenticated` by default, so migration 0001 — which revoked
`anon` and stopped there — left a signed-in browser holding INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES and TRIGGER on the career tables. Row level
security blocked every write reachable through PostgREST, but **TRUNCATE is not
subject to row level security**, and the grants contradicted what 0001's own
comment claimed. Migration 0002 narrows them:

| Role | profiles | saved_clashes | result_claims | career views |
| --- | --- | --- | --- | --- |
| `anon` | none | none | none | none |
| `authenticated` | SELECT, and UPDATE on `display_name` and `avatar_url` only | SELECT | SELECT | SELECT |

The column list on that UPDATE matters: without it, a user could rewrite their
own row's `user_id` or `created_at`. The `updated_at` trigger still fires,
because column privileges are checked against the columns a statement names,
not against what a trigger sets.

Default privileges in `public` are revoked for both roles, so a table added by
a later migration starts closed rather than open. Neither trigger function is
executable by `anon` or `authenticated`, so neither is published at
`/rest/v1/rpc/`, and both pin `search_path`.

Verified against the live database rather than read off the migration text:
`data/validation/9b1/account-rls-live-verification.json`.

## What the server never trusts

- a `user_id` in a request body — the identity comes from verifying the bearer
  token with the provider (`GET /auth/v1/user`)
- a score, roster, era, coach, MVP or candidate id in a request body — all of it
  is read from the authoritative record in the store
- ownership asserted by localStorage — proved by comparing the record's
  server-minted device session to the caller's HttpOnly cookie
- a list of result ids — a browser may *propose* candidates for the device
  import, and each one is authorised on its own

## Deletion

Every table cascades from `auth.users`, so removing an account removes its
profile, its saved clashes and its claims together. Self-service deletion and
export are **not** in this phase; an operator performs it. That limitation is
stated on the career page and blocks any claim of public-launch readiness.
