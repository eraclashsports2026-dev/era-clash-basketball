# EraClash Basketball v2.1 — "The Connected EraClash" Release Candidate

Prepared 2026-08-23 on branch `v2-rebuild`. **Not deployed** — deploy requires CEO approval.

## What this release is

v2.1 turns EraClash from a standalone game into a measurable, persistent, shareable platform:
analytics on every important step of the loop, anonymous-first identity with cloud career sync,
persistent server-side challenges with rivalry chains, a broadcast-style Postgame, public
shareable result pages with OpenGraph previews, Daily Challenge streaks + global leaderboard,
a My EraClash career dashboard, a believability-feedback system, a deterministic simulation
engine with a benchmark harness, and hardening (idempotency, rate limits, model-output
validation, SW cache versioning).

## Required environment (new)

One Redis-compatible KV store powers all persistence. Either pair of env vars works:

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV (same protocol) |
| `ANTHROPIC_API_KEY` | (existing) simulation model |

**Without the store configured, nothing breaks**: the app runs exactly like v2 (local-only
progress, URL-encoded challenge links, no leaderboard/result pages, analytics no-op).
Every server feature checks `hasStore()` and degrades gracefully.

**ACTION NEEDED (CEO)**: create a Vercel KV / Upstash database (Vercel dashboard →
Storage → KV, or upstash.com) and set the env vars in the Vercel project. This is the
only blocker for the persistence features; it was intentionally not done in this session
(no paid-service activation without approval).

## Storage keys (all in one KV namespace)

- `ch:{id}` challenges (90d TTL) · `re:{id}` shared results (180d TTL)
- `pf:{uid}` career profiles · `dl:{date}:*` daily boards/attempts (40d TTL)
- `an:*` analytics logs/counters/uniques · `fb:*` believability feedback
- `sim:{simulationId}` idempotency cache (1h TTL) · `rl:*` rate-limit buckets

No SQL migrations required; all structures are created lazily. Rollback = unset env vars.

## CEO approval items (before production)

1. **Engine-simulated Win 82** (`USE_ENGINE_SEASON` in `src/versions.js`, currently `true`):
   season games 1–81 are decided by the deterministic engine; the LLM simulates and
   narrates only the finale. ~82× cheaper and instant, but it changes how Win 82 outcomes
   are decided. Difficulty curve measured: an average random draft wins ~40% of games; elite
   construction reaches 60–75 wins; 82-0 stays near-impossible (~3% for a maxed roster).
   Set to `false` to restore the v2 behavior (every game = 1 model call).
2. **Deploy + KV provisioning** (above).
3. **Prompt addition**: the simulate prompt now asks for a `turningPoint` sentence
   (prompt version 2.1). Low risk; flagged because prompting changed.
4. NOT changed (explicitly locked): rating coefficients, OOP penalty, chemistry v2
   multiplier, player OVRs, player database. Chemistry v2.5 attributes are display/engine
   insights only and do **not** alter teamRating — wiring them into ratings is a future
   approval item.

## Deferred / known gaps (honest list)

- **Dynamic OG share images** (per-result PNG cards): result pages use text OG tags + the
  app icon. `@vercel/og` image generation is the natural next step; architecture (public
  `/result/{id}` snapshot) already supports it.
- **Real cross-device auth**: identity is an anonymous per-device uid; "Save your career"
  names it and syncs to KV. An auth provider (Clerk/Supabase/etc.) is a service decision —
  schema is uid-keyed so mapping a login → uid later needs no migration.
- **Attribute coverage**: 93 of 330 player-decades curated (the most-drafted stars +
  defense-first role players). Insights stay silent for lineups without full coverage
  (accuracy over fake completeness). Populating the rest is a data task, not code.
- Analytics has no dashboard — counters/uniques in KV answer the funnel questions; a
  reporting page or vendor export is future work.
- E2E browser tests: critical journeys were verified manually in this session; the unit
  suite covers the logic. Playwright would be the next testing investment.
- Server-side challenge results trust the client's reported score (validated for shape,
  not re-simulated). Leaderboard integrity beyond rate-limiting + one-attempt NX locks
  would require server-side simulation (enabled by the engine, future work).

## Version registry

`src/versions.js`: app 2.1.0 · rating 2.0 (unchanged) · chemistry 2.5 (additive layer) ·
simulation_engine 2.1 · player_data 2026-08-23 · prompt 2.1. Every simulation result and
feedback record carries this block.
