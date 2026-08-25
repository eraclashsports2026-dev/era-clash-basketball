# Caching and cost

## Three layers

### Layer 1 — process memory
Bounded, in-process, for cheap deterministic reads. **Never relied on for
correctness**: serverless instances vanish without warning.

### Layer 2 — Upstash/KV
Cross-instance persistence: immutable results, AI narratives, idempotency,
generation locks, daily config, rate limits, circuit-breaker state.

### Layer 3 — CDN / browser
JS/CSS (`immutable`, content-hashed), player images, public immutable result
pages, share images.

## What is deliberately NOT network-cached

Team Intelligence benchmarks at **0.037 ms warm / 5.4 ms cold**. An Upstash
round trip is 10–50 ms. **Caching it over the network would make it 300× slower
and cost money to do so.**

> The objective is lower total latency and lower cost — not "more caching."

Default policy: recompute cheap deterministic logic, optionally memoize
in-process, and persist only when measured cost or latency justifies it. The
versioned cache *identities* exist for `teamintel:` and `coachfit:` so the
decision can be revisited with profiling rather than re-derived from scratch.

## Immutable results

A completed core result never changes. Duplicate requests, reloads, and shared
pages all return the existing result.

**A rematch creates a new simulation ID and a new seed**, therefore a new result
identity. This is why the seed is part of the *result* fingerprint and not the
*matchup* fingerprint — if the final-result cache were keyed on the matchup
alone, every rematch would replay the identical game.

Retention is **permanent**. Competitive records and user history must not vanish
under an operational TTL.

## AI narrative cache

Identity: `resultId` + prompt version + schema version + provider + model.

```
Postgame requests narrative
        ↓
  check stored narrative ──found──▶ return cached  (no provider call)
        ↓ not found
  acquire generation lock (SET NX, 75s TTL)
        ↓                         ↓ lock held by someone else
  call model once            poll ≤4.8s → return narrative, or 202 pending
        ↓
  validate output ──invalid──▶ store FAILURE marker, return fallback
        ↓ valid
  store narrative · release lock · return
```

**The lock is the point.** Without it, five people opening the same result
produce five paid calls for one piece of text. TTL exceeds the provider timeout
plus margin and is finite, so a dead worker's lock always expires.

### What is never cached
Invalid model output is **never** stored as a narrative. Failures write an
explicit `status: "failed"` marker that can never masquerade as text.

### Negative caching and the circuit breaker
A failure marker is recorded for diagnostics but is **deliberately not
short-circuited on**. An earlier version returned early on it — which starved
the circuit breaker of the failures it counts: two failing requests became one
provider call, the breaker stayed HALF_OPEN instead of OPEN, and global outage
protection silently stopped working.

Provider-outage damping is the circuit breaker's job and it already does it
well. The lock handles the stampede case this endpoint actually had.

## Public result caching

| Path | Header | Why |
| --- | --- | --- |
| Result found | `public, max-age=86400, stale-while-revalidate=604800` | The share record is immutable |
| **Result not found** | **`no-store`** | Previously inherited `max-age=300` — a result shared moments after someone hit its URL would serve "nothing here" from CDN for five minutes. **This was a bug and is fixed.** |
| `/api/(.*)` | `no-store` | No private data may ever be publicly cached |
| `/assets/(.*)` | `public, max-age=31536000, immutable` | Content-hashed by Vite |

`immutable` is used **only** on versioned public asset URLs — never on a private
API, session data, user history, or a mutable response. A test enforces this.

## Cost measurement

`npm run cache:report` (`-- --fixture`, `-- --json`).

**Honesty rules, enforced by test:**
- Every report states its **source**; a fixture run is labelled as a fixture in
  the output itself, so a pasted terminal block cannot be mistaken for production.
- Cost is computed only from configured pricing for the exact model that would
  have been called. **Unknown pricing yields `null`** — never zero, never a guess.
  Avoided calls and avoided tokens are still reported, because those are real.
- The report **reconciles**: requests = hits + provider calls + pending. A report
  that does not balance says so rather than being rounded into agreement.

## Observability

Events: `cache_hit` · `cache_miss` · `cache_write` · `cache_lock_wait` ·
`cache_stale` · `cache_error`.

Properties: namespace, operation, latency, resultId, provider, model, hit source
(memory/kv/cdn), lock wait duration, error code, request id, tokens avoided,
estimated cost avoided.

**Never logged:** API keys, tokens, cookies, authorization headers, full session
ids, email addresses, or full payloads.

> A naive `/token/i` deny-list ate `tokensAvoidedInput` — the single most
> important number in the cost report — because "tokens" contains "token".
> Usage metrics are allowlisted first, then the credential deny-list applies.
