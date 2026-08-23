# EraClash Basketball v2.3 — Production Hardening Release Candidate

Prepared 2026-08-23 on branch `production-hardening`. **Not deployed.**

## v2.3.1 addendum — launch-readiness fixes (same branch)

- **Daily lineup legality is now fully server-verified** (`src/dailyChallenge.js`
  shared by client and server): official challenge = server UTC date → seed →
  pure deterministic draft. The client records its keep/re-spin decisions
  (3 transitions — the Finalize click is Yahtzee roll 3); `/api/game` replays
  them and rejects any five the official draft could not produce
  (`DAILY_INVALID_LINEUP`, attempt never consumed). Client seeds/dates ignored.
  `GET /api/daily?config=1` publishes the official config.
- **Fixed a real fairness bug found during this work**: the old daily used the
  browser's local date and the session-scoped variety guard, so different users
  (and the same user after other games) got *different* "official" rolls. Daily
  days are now UTC days everywhere (seed, claims, board, streaks, history).
- **Production guards**: the in-memory test store is hard-disabled when
  `NODE_ENV=production` (chaos hooks already were). Verified by test.
- Tests: 80 vitest (13 new daily-verification tests incl. dream-team rejection,
  decision tampering, foreign-seed rejection, 20-tab replay → 1 claim) +
  7 Playwright (daily UI journey now exercises record→replay end-to-end).
- Engine spot-check: elite five ≈ 64–74 wins/season, average draft ≈ 33, a
  scoring-less lineup 2–4. Steep tails; flagged for post-launch tuning review,
  not a launch defect.

## Architecture after this release

```
PLAYER INPUT (ids + mode only)
      ↓
SERVER VALIDATION            api/_lib/validate.js — canonical ids, no dup persons,
      ↓                       allowlisted modes, payload caps, origin checks
ERACLASH CORE ENGINE         api/_lib/game-core.js — ratings/chemistry/engine
      ↓                       computed server-side from canonical data, seeded
IMMUTABLE STRUCTURED RESULT  result:{id} written once (SET, never rewritten)
      ↓
POSTGAME AVAILABLE           full box/MVP/edges/chemistry + deterministic recap
      ↓
OPTIONAL AI ENHANCEMENT      api/narrative.js — explains stored results only;
      ↓                       timeout + retry + budgets + circuit breaker
RECORDS                      daily claim (atomic NX), challenge games (append-
                             only), leaderboard — all from the stored result
```

The browser can no longer supply: winner, score, box score, wins, series result,
MVP, chemistry, rating, leaderboard score, daily completion, streak source data
for public boards, challenge outcome, or another user's identity.

## Guest identity

- HttpOnly `Secure` `SameSite=Lax` cookie (`ec_session`, 48-hex crypto-random),
  minted server-side. localStorage uid is analytics/migration metadata only.
- Mutations require same-origin (`Origin`/`Referer` host match).
- Legacy `pf:{uid}` profiles migrate via one-time atomic claim (`legacy:claim:{uid}`).
- Limitations (by design, stated honestly): per-browser identity, no cross-device
  recovery, cookie clear = new guest. **Auth readiness**: server records are
  session-keyed; adding a provider (magic link/Google/Apple/passkeys via e.g.
  Clerk or Auth.js — CEO decision, do not build passwords in-house) only requires
  mapping `account → session` at login and merging like the legacy claim.

## KV namespace & TTL matrix

| Prefix              | Contents                          | TTL         |
|---------------------|-----------------------------------|-------------|
| `result:{id}`       | immutable game results            | 180d        |
| `narrative:{id}`    | AI recap (complete) / fail marker | 180d / 60s  |
| `idem:{simId}`      | idempotency claims                | 24h         |
| `ch:{id}`           | challenges + rivalry chains       | 90d         |
| `dl:{date}:board`   | daily leaderboard                 | 40d         |
| `daily:claim:{date}:{session}` | official-attempt locks | 40d         |
| `profile:{session}` | careers                           | persistent  |
| `pf:{uid}` (legacy) | pre-v2.3 careers (until claimed)  | persistent  |
| `legacy:claim:{uid}`| migration locks                   | persistent  |
| `an:log/counts/uniq`| analytics                         | 14d/400d/—  |
| `fb:*`              | believability feedback            | capped list |
| `rl:*`              | rate-limit windows                | ≤2× window  |
| `circuit:ai:*`      | breaker counters                  | 2× window   |
| `ai:min/day/usage`  | AI budget + usage accounting      | 2m/48h/—    |
| `sim:{id}` (legacy) | deprecated /api/simulate cache    | 1h          |

No permanent record carries a temporary TTL. Export: any Redis client can dump
by prefix (`SCAN profile:* / result:* / ch:*`); do not commit exports with user
data; secrets are never stored in KV.

## Rate limits & cost controls (env-tunable, 0 = emergency off)

Defaults: sim 10/min/session + 20/min/IP + 600/min global · narrative 6/min/session
· challenge create 30/min/IP · feedback 20 · events 120 · profile 20/min/IP ·
AI 60/min + 5000/day global. Circuit breaker: 5 failures / 120s window → OPEN
(deterministic recaps only), fresh window = half-open. AI timeout 20s, 1 retry
with jitter, same idempotent narrative slot — no duplicate billing. Full list in
`.env.example`.

## Feature flags (env)

`MAINTENANCE_MODE` (mutations 503, reads stay up) · `AI_NARRATIVE_ENABLED` ·
`CHALLENGES_ENABLED` · `DAILY_ENABLED` · `PUBLIC_LEADERBOARD_ENABLED` ·
`FEEDBACK_ENABLED`. All default on except maintenance; each disables one
subsystem with a safe client message; rollback = unset + redeploy.

## Security headers (vercel.json)

HSTS 2y · nosniff · Referrer-Policy strict-origin-when-cross-origin ·
Permissions-Policy (camera/mic/geo/payment denied) · COOP same-origin · CSP:
`default-src 'self'; script-src 'self'` (no inline scripts — SW registration
moved into the bundle), `style-src 'self' 'unsafe-inline'` (**documented
exception**: the app uses inline React styles; migration path = CSS extraction),
`img-src 'self' data:`, `connect-src 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`. `/api/*` no-store; static assets immutable; player images
same-origin CORP.

## Admin & image pipeline security

No admin HTTP surface exists: review (`review.html`) and approval
(`approve.mjs`) are local CLI tooling only — nothing in production can approve,
alter, or delete image assets. The importer enforces an SSRF allowlist
(`upload.wikimedia.org`, `loc.gov` hosts; HTTPS only, default port, no IPs, no
credentials in URLs, redirects refused, 25MB cap, jpg/png only). Approved
originals are immutable files under version control; attribution lives in
`src/images/approved.json`.

## Dependency audit

Production dependencies: **0 vulnerabilities**. Dev-only, deferred with reasons:
esbuild ≤0.24.2 (vite 5 dev server GHSA-67mh — not in production builds; fix is
vite 8 breaking upgrade, schedule separately) and uuid <11.1.1 via autocannon
(load-test tool only). No abandoned production deps (react, react-dom only).

## Test inventory (all passing)

- 67 vitest unit/integration: rating/chemistry/engine invariants, license
  whitelist, **server authority** (fabricated fields ignored, dup-person
  rejection, oversized 413, cross-origin 403), idempotency, daily one-attempt +
  engine-failure protection, challenge immutability + stored-five enforcement,
  profile IDOR isolation, XSS neutralization, SSRF allowlist, **chaos** (AI
  500/timeout/circuit/budget, KV-down honesty, challenge-write-failure honesty).
- 7 Playwright E2E (real UI + real handlers + memory store): guest game with AI
  outage fallback + rematch; duplicate-click = 1 POST; daily consume-once +
  reload persistence; core-failure/tamper rejection; challenge link → play →
  immutable rivalry → rematch appends; cross-session profile isolation; XSS.

## Load tests (local harness — one Node process, NOT a production capacity claim)

| Scenario | Result |
|---|---|
| A: 100 users browsing | 23.3k rps, p50 4ms, p99 8ms, 0 errors |
| B: 100-user sim burst | 9.9k rps, p50 9ms, p99 26ms, 0 errors |
| C: 250-user sim burst | 9.6k rps, p50 23ms, p99 58ms, 0 errors |
| D: 500 users on one challenge link | 37.7k rps, p99 21ms, 0 errors |
| E: 50 parallel daily submits, one session | exactly 1 official claim |
| H: 60 parallel identical simulationIds | exactly 1 result created |
| F: burst under default limits | exactly 20 accepted (= configured 20/min/IP), 91k clean 429s, zero hangs |

Run with `npm run loadtest`. Core simulation is pure CPU (~1ms) — the platform
bottleneck in production will be KV round-trips and function concurrency, not
the engine.

## Deployment checklist (in order)

1. Merge `production-hardening` → `v2-rebuild` (or main) after CEO review.
2. Vercel env: `ANTHROPIC_API_KEY` (existing) + KV pair (Storage → Upstash
   Redis Marketplace → connect project). Optional: tune flags/limits.
3. Deploy to a **preview** URL; verify `/api/health` → `{status:"ok",
   persistence:"ok"}`; play one game per mode; open a challenge link.
4. Confirm headers with `curl -I` (CSP, HSTS, nosniff present).
5. Promote to production; re-verify health; watch structured logs for
   `error_code` spikes for the first hour.

## Rollback plan (in order)

1. Vercel → Deployments → promote the previous deployment (instant, no data
   migration needed — v2.3 keys are additive; old clients keep working against
   the deprecated `/api/simulate`).
2. Emergency partial disable instead of full rollback: set the relevant flag
   (`AI_NARRATIVE_ENABLED=false`, `CHALLENGES_ENABLED=false`, `DAILY_ENABLED=false`,
   `MAINTENANCE_MODE=true`) and redeploy env only.
3. Stale service worker: bump `CACHE` in `public/sw.js` + `VERSIONS.app` and
   redeploy — network-first HTML picks it up on next load.
4. Data integrity after rollback: results/challenges/claims are immutable and
   additive; nothing in v2.3 rewrote v2.2 keys. Legacy `pf:{uid}` remains until
   claimed.

## Recommended alerts (when monitoring is added)

Core sim success <99.9% · narrative success <90% · 5xx >1% for 5m · KV errors
>1% · provider 429 spike · circuit OPEN >10m · daily AI budget hit · challenge
write failures >0.5%. Provider-neutral hooks: every request logs one JSON line
with `request_id`, route, status, latency, `error_code`; pipe Vercel log drains
anywhere.

## Open risks (direct)

- Daily lineup legality isn't fully re-derived server-side (any valid 5 ids can
  be a "daily" team; the seeded-roll legality of the picks isn't replayed).
  Score fabrication is impossible, but a cheater could daily-submit a
  non-seeded dream team. Fix: server-verified roll replay (next session).
- Career profile stats are self-reported (own dashboard only — never feeds
  public boards). Cosmetic cheating of one's own profile is possible.
- Session cookie theft = guest identity theft (standard for cookie auth; HTTPS
  + HttpOnly mitigate). No account recovery until real auth lands.
- `style-src 'unsafe-inline'` remains (inline React styles).
- Legacy `/api/simulate` stays deployed one release for old bundles — remove
  next release.
- Local load numbers ≠ production capacity; KV latency under real traffic
  unmeasured until a preview soak.
