# Privacy data inventory (factual, from code and configuration) — 2026-09-10

Nonpublic working document. Every statement below points at the code, schema or
provider setting it comes from. Items marked **UNKNOWN** need an owner or
provider answer before the public notice can state them.

## Who processes what

| Party | Role | What reaches it | Evidence |
|---|---|---|---|
| Vercel (hosting, serverless functions, edge middleware) | hosting / logs | every request: IP address, user agent, URL, timing (Vercel request logs; retention per Vercel plan — **UNKNOWN** plan/retention) | `vercel.json`, `middleware.js`, `api/*.js` |
| Supabase (project `eraclash-basketball-production`, region **us-west-1**) | authentication + database | account email (Supabase Auth only), display name, career records, challenges, ratings, preferences | `supabase/migrations/0001–0007`, `src/accounts/provider.js`; `profiles` has no email column (comment on table) |
| Upstash Redis (or Vercel KV) | game state + counters | Chaos runs and results (keyed by ids), guest-session ↔ run ownership, rate-limit counters keyed by **client IP** (60 s windows), analytics event log | `api/_lib/store.js` (`clientIp`, `rateLimit`), `api/events.js` |
| Anthropic API (`claude-sonnet-4-6`) | AI game recap (optional; deterministic fallback) | the finished game only: era, player names (historical players), lineups, box scores, key moments — no account identity, no email, no device id | `api/_lib/ai.js` (`nameOf`, `line`, lineups); `ANTHROPIC_API_KEY` server-side |
| Email delivery (Supabase built-in today; custom SMTP provider once configured) | sign-in codes/links | the sign-in email address; the message content | Workstream 3 — provider **UNKNOWN until approved** |
| Pixa / Recraft (design time only) | portrait placeholder generation | nothing about users — art was generated offline and committed | `src/images/placeholders.json` |

No advertising, no third-party analytics SDK, no social plugins, no payment
processor (no purchases exist; the membership page says so).

## Browser storage (first party)

| Key | Where | What | Life | Evidence |
|---|---|---|---|---|
| `ec_session` cookie | HttpOnly, Secure, SameSite=Lax | server-minted guest/device session id (random) — ties a device to its Chaos runs and its 3-run guest budget | 365 days (`MAX_AGE`) | `api/_lib/session.js` |
| `pv_session` cookie | protected PREVIEW deployments only | signed preview-access session {wave, testerId, role, keyVersion, sid, exp} | 7 days | `api/_lib/previewAccessCheck.js` |
| Supabase auth session | localStorage (supabase-js) | access/refresh tokens for a signed-in account | until sign-out / expiry | `src/accounts/provider.js` |
| `ec_chaos_run`, `ec_chaos_run_at` | localStorage | the current Chaos run id and when it started (resume after reload) | until reset/new run | `src/App.jsx`, ChaosStage |
| `ec_prior_result` | localStorage | the last finished Clash (LAST CLASH view) | overwritten by the next result | `src/App.jsx` |
| `ec_seen`, `ec_account`, `ec_name`, device career (records/badges) | localStorage | first-visit flag; the legacy on-device career (name, record, badges) | until cleared | `src/components/Profile.jsx`, `src/identity.js` |
| `ec_sid` | localStorage | analytics session id (random) | until cleared | `src/analytics.js` |
| service worker cache | Cache Storage | static assets and same-origin GET responses (never `/api/`) | until the next build | `public/sw.js` |

## Account data (Supabase, row level security on every table)

- **Auth user**: email address, sign-in timestamps (Supabase Auth; not in any public table). No password (one-time code / magic link).
- **profiles**: display name (1–24 chars, default "Coach"), optional avatar URL, timestamps. Private; not public.
- **saved_clashes** (immutable career snapshots), **result_claims** (result ↔ owner; stores sha256 of the device session id, never the id), **saved_rosters** (player ids/names/positions), **user_preferences** (closed-vocabulary UI prefs incl. `profile_visibility` and `leaderboard_visibility`, both **private by default**).
- **challenges / challenge_secrets / challenge_attempts** (server-written; the link carries only a public code).
- **progression_profiles, xp_ledger, achievement_unlocks** (XP, level, unlocks).
- **competitive_profiles, competitive_rating_events** (Challenge Rating ledger).
- **public_profiles** (opaque slug; means nothing while `profile_visibility` is private), **profile_featured_achievements**.
- Export: **Account → Export my data** downloads everything above as one JSON file, assembled from the user's own RLS-scoped reads (`docs/accounts/account-export.md`).

## Deletion, retention, what survives

- **Account → Delete my account** (re-authentication within 30 min, typed confirmation) deletes the Supabase auth user; `on delete cascade` removes profiles, saved_clashes, result_claims, saved_rosters, user_preferences, progression rows, competitive_profiles, public_profiles, featured achievements.
- **Retained, pseudonymised** (not anonymous): `competitive_rating_events` keep the event with the deleted side set to null (`on delete set null`) so the other player's rating history stays auditable; challenge history is anonymised by `anonymize_deleted_account()` (0004). These rows can still be linked to a game and an opponent; they are not "anonymous".
- **Retained outside the account**: Redis game runs/results by id (TTL **UNKNOWN** — `RUN_TTL_SECONDS` in `api/_lib/chaosRun.js`, to confirm), the analytics event log (14 days) and daily counters (400 days) — events carry an event name, build, timing, the analytics session id and, on previews, a tester id; no email.
- **Provider backups**: Supabase daily backups per plan (**UNKNOWN** plan/retention); Vercel logs per plan (**UNKNOWN**).
- Deleting an account does not remove a Clash a *different* player saved from a shared Challenge; their copy is theirs.

## Public exposure (intentional, opt-in)

- Leaderboard rows appear only when `leaderboard_visibility` is public **and** the account is placed (rated); the row shows display name, rating, rated record — never email.
- Public profile (`/player/<slug>`) appears only when `profile_visibility` is public; independent of the leaderboard setting.
- Display names are chosen by the user (≤24 chars, no `<>`); a name can be changed at any time.

## Age, jurisdiction, operator — **UNKNOWN (owner decisions)**

Legal operator name; operating jurisdiction and intended audience; age policy
(the product collects no birth date and has no age gate today); monitored
privacy/support contact (the domain has no mailboxes — MX is empty).
