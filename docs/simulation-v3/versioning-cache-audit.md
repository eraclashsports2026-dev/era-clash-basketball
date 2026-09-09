# Versioning & cache audit (pre-Phase 3.5)

What existed before this phase, verified by reading the code at `57c19b1`.

## Version systems found — TWO, in collision

| Location | Shape | Stamped onto |
| --- | --- | --- |
| `src/versions.js` | `VERSIONS.simulation_engine = "2.2"`, app, rating, chemistry, player_data, prompt | V2 results, `/api/health`, analytics |
| `src/v3/engine.js` | `V3_VERSIONS.engine = "3.1.0-alpha"`, possessionModel, gameStateModel, fatigueModel, playerData, coachData, eraData, calibration | V3 results |

**Three concrete problems:**

1. **"V3" meant two things.** The live production engine, and the future
   possession architecture. "Is V3 on?" had two correct answers.
2. **The live engine was labelled alpha.** `3.1.0-alpha` has decided every real
   game since v2.5.0.
3. **Neither registry recorded the intelligence layers**, and both declared
   `playerData` independently — already drifted (`2026-08-23` vs an actual
   381-card pool). `VERSIONS.player_data` carried a stale comment claiming 330 entries.

## Cache systems found

**Existing and good:**

- `api/_lib/store.js` — Upstash/KV REST client with an in-memory test mode.
  Already exports **`setNX`** (the lock primitive that was going unused).
- Circuit breaker: `circuit:ai:{window}` with failure counting.
- Idempotency: `idem:{simulationId}`.
- Immutable results: `result:{id}`.
- Rate limits: `rl:{key}:{window}`.
- Client-side request coalescing in `src/v3meta.js` (in-flight promise sharing + 60s TTL).
- `vercel.json`: `/api/(.*)` → `no-store`; `/assets/(.*)` → `immutable`.

**~35 cache keys, all hand-built as template literals at the call site.**

## Gaps found

| Gap | Severity |
| --- | --- |
| **Narrative cache had no generation lock** | High — N concurrent viewers of one result = N paid provider calls |
| **Narrative key was `narrative:{resultId}`** — no prompt, model, or schema version | High — a prompt rewrite would keep serving text from the old prompt forever |
| No canonical matchup or result fingerprint | High — results were not reconstructable from a single identity |
| No cache-key registry | Medium — nothing knew what was cached or how to invalidate it |
| No cost measurement | Medium — savings were unknowable |
| No research cache | Medium — every research re-run refetched everything |
| No player-card cache identity | Low — UI phase blocker |
| Public result **not-found page cached for 5 minutes** | **Bug** — a freshly-shared result could serve "nothing here" from CDN |
| Service worker cache name `eraclash-v2.3.5` vs app 2.7.2 | Low — stale label |

## Recommended migration (what Phase 3.5 did)

1. One canonical registry in the established location, with the legacy shape **derived** from it.
2. Separate version domains per concern; PLANNED modules carry `null`.
3. Canonical matchup + result fingerprints.
4. One cache-key builder; version segments read from the registry.
5. Narrative generation lock + versioned narrative identity.
6. Telemetry + an honest cost report.
7. Research cache with content hashing and a copyright policy.
8. Fix the not-found caching bug.
