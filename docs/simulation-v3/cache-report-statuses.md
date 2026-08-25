# Cache report — operational statuses

`npm run cache:report` · `-- --fixture` · `-- --json`

## The bug this fixes

With an empty store the report printed:

> cost method — unavailable — no configured pricing for the narrative model

Pricing **was** configured for `claude-sonnet-4-6`. The real condition was that no telemetry existed
at all. An operator reading that line would go looking for a missing pricing entry that was never
missing. "No data" and "no price" are different operational states and must never share a message.

A second, related defect was found while fixing it: a narrative request that waited on another
worker's generation lock fired `cache_miss` **and** `cache_lock_wait`, both setting
`narrativeRequest: true` — so one request incremented `narrative_requests` twice. That double-count
meant the report's reconciliation identity could never hold in live telemetry. The lock-wait event no
longer counts the request; the miss already did.

## Statuses

Evaluated by precedence, top to bottom. The first match wins.

| Status | Meaning | Chosen when |
|---|---|---|
| `NO_TELEMETRY` | No cache or model-usage events exist. Nothing has been measured. | no metric keys at all |
| `PARTIAL_TELEMETRY` | Some metrics exist, but the dataset does not fully reconcile. | malformed metric, or the identity below fails |
| `ZERO_REQUESTS` | Telemetry exists, but no narrative requests were recorded. | `narrative_requests == 0` |
| `ZERO_CACHE_HITS` | Narrative requests exist, but none were served from cache. | `hits == 0` |
| `MODEL_PRICING_UNAVAILABLE` | Requests and token data exist, but the configured model has no approved pricing. | avoided tokens exist and the model is unpriced |
| `TELEMETRY_AVAILABLE` | Requests, provider calls, hits, tokens and savings all reconcile. | everything balances |

Why this precedence: with no events, pricing is irrelevant; with no cache hits, avoided tokens cannot
exist, so a missing price is not the story either. A report that cannot reconcile is reported as such
*before* any of its numbers are interpreted.

## Reporting rules

- Unknown pricing yields `Estimated model cost avoided: null` with the reason named — **never `$0`**,
  which reads as "caching saved nothing".
- Avoided **calls** and avoided **tokens** are still reported when pricing is unknown, because those
  are real measurements regardless of what they would have cost.
- An absence of events is never reported as an absence of pricing.
- Unreconciled counts are surfaced (`pending`, `over-accounted`, `malformed`), never rounded into
  agreement.

## Reconciliation identity

```
narrative requests = cache hits + provider calls + lock waits
```

Derived from the actual instrumentation in `api/narrative.js`:

- a **cache hit** counts one request and no provider call
- a **cache miss** counts one request, and then either acquires the lock and calls the provider, or
  waits on another worker's lock
- a **provider failure** is a *subset* of provider calls — the miss already counted the request, so
  failures are **not** a fourth term. Asserting them as one would guarantee a false imbalance on
  every failed generation.

`provider_failures <= provider_calls` is asserted separately.

## Source labelling

Every report states its source in its own output, so a pasted terminal block cannot be mistaken for
production usage:

| Source | Banner | `isLive` |
|---|---|---|
| `PRODUCTION_TELEMETRY` | live usage | true |
| `PREVIEW_TELEMETRY` | live usage in a preview environment | true |
| `LOCAL_TELEMETRY` | this machine only | true |
| `TEST_FIXTURE` | ⚠ synthetic numbers, NOT usage of any kind | false |
| `SYNTHETIC_BENCHMARK` | ⚠ generated load, NOT real usage | false |

Detected from `VERCEL_ENV`; `--fixture` forces `TEST_FIXTURE`.

The bundled `FIXTURE` obeys the identity it demonstrates — 10,000 requests = 7,900 hits + 1,840
provider calls + 260 lock waits. A fixture that violates its own invariant is worse than no fixture,
and the original one did (it counted 10,000 = 7,900 + 2,100 and then added 260 lock waits on top).

## Tests

`tests/v6a-workstream0.test.js` covers all six statuses, the identity, malformed telemetry, the
lock-wait double-count regression, source labelling, and that every status in the enum appears in
this document.
