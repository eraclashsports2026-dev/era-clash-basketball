# Progression security (Phase 9D)

## Threats and answers

| Threat | Answer |
| --- | --- |
| A browser writes XP, a level or an unlock | No client role holds insert/update/delete on any progression table (grants revoked; no such policies). The only write path is `progression_apply()`, `SECURITY DEFINER`, revoked from `public`, `anon` and `authenticated`. |
| A client posts a forged XP delta, level, award list or owner id | No route reads any of them from the body. Identity is the verified bearer's `userId`; awards are derived from database rows. A forged body changes nothing (harness gate, e2e, live). |
| A forged total or level reaches the profile by any path | `progression_profile_guard_trg` recomputes the ledger sum and the curve's level and refuses a disagreeing row (`PROGRESSION_TOTAL_FORGED`, `PROGRESSION_LEVEL_FORGED`). |
| An award is edited after the fact | `xp_ledger_immutable_trg` refuses `UPDATE`. Repair is by insert only. |
| Duplicate awards (refresh, retry, re-save, concurrency, backfill) | `unique (user_id, source_type, source_id, reason)`; `ON CONFLICT DO NOTHING`; per-account `pg_advisory_xact_lock`. |
| A stranger claims a result to earn from it | The career save path is unchanged: ownership is proved by the device session; a foreign device gets `not_your_result` and no progression block. |
| Guest farming through challenges | A guest's completed attempt earns the guest nothing (no identity) and the creator nothing (not an account). |
| User A reads User B | RLS `user_id = auth.uid()` on all three tables; the server answers only for the token's own account. Live role switches recorded in `progression-rls-live.json`. |
| Anonymous reads | Every grant to `anon` revoked; `anon` reads nothing. |
| Enumeration / rate | Progression actions are rate-limited per IP (`RL_PROGRESSION_PER_MIN_IP`, default 30) under the route's own limit. |
| Secrets in the bundle | The bundle names the client actions only — never the database function, the ledger table or the dev fixture route; no `sb_secret_`, no service-role JWT (deployed gate). |
| Telemetry leaking identity | Seven closed events; metadata may carry level, xpDelta, reasonCategory, achievementId, achievementCategory, unlockCount, mode, success, failureCode, filter — never a name, email, result id, challenge id, account id, token or session id. |

## Deletion

All three tables reference `auth.users (id) on delete cascade`. Deleting an
account leaves no XP, no level and no unlock behind. Challenge history
anonymisation is 0004's and unchanged. Verified live with synthetic accounts.

## Any arbitrary client XP write is a P0

The certification treats a client-originated write reaching any progression
table as a P0. The live record shows `insert`, `update` and `delete` by the
`authenticated` role refused on all three tables, `rpc/progression_apply`
refused for `anon` and `authenticated`, and a direct `UPDATE` of `total_xp`
refused by the guard even for the service role.
