# Progression — operator guide (Phase 9D)

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Contract (pure) | `src/progression/contract.js` | versions, XP amounts, level curve, catalog, evaluator, expected awards, events |
| Server | `api/_lib/progression.js`, dispatched by `api/profile.js` | no new serverless function; `progression-get` / `progression-reconcile` plus hooks on `cloud-save`, `claim-result`, `import-device-history`, `challenge-complete` |
| Schema | `supabase/migrations/0005_progression_v1.sql` | `progression_profiles`, `xp_ledger`, `achievement_unlocks`; `progression_apply()`; `progression_level_for()`; guards; RLS + grants |
| Browser | `src/progression/client.js`, `src/components/progression/*` | postgame CAREER PROGRESS, Overview hero, Achievements tab |
| Fixture (dev only) | `src/ui/progression/ProgressionReferenceFixture.jsx` at `/dev/progression-reference` | present only in a `VITE_EC_DEV_FIXTURES=1` build (`npm run build:fixtures` → `dist-fixtures`) |

## Actions on `/api/profile` (account only)

| Action | Purpose |
| --- | --- |
| `progression-get` | reconcile and read: profile (level, XP, next level), achievements with progress, facts, recent ledger, `repaired` |
| `progression-reconcile` | the same, as an explicit repair |

Existing actions now answer with a `progression` block after a successful
save/claim/import: `{ status, xpDelta, awarded[], unlocked[], before.level,
after (level, totalXp, xpIntoLevel, xpForLevel, xpToNext, maxLevel, progress),
levelUp, levelsGained, summary }`. `challenge-complete` answers with one for the
recipient account and reconciles the creator (once, when the attempt completes).

## Knobs

- `RL_PROGRESSION_PER_MIN_IP` (30) — rate limit on the two actions.
- Everything else is contract code: `XP`, `LEVEL_THRESHOLDS`, `stepCost`,
  `LEVEL_CAP`, `ACHIEVEMENTS`. Changing an amount changes what new records
  earn; nothing already in the ledger changes (the ledger is immutable).
  Bump `PROGRESSION_VERSION` / `LEVEL_CURVE_VERSION` /
  `ACHIEVEMENT_CATALOG_VERSION` when you do.

## Applying the migration

`0005_progression_v1` is idempotent (`if not exists`, `create or replace`,
`drop … if exists`). It was applied to the certified preview project
(`lfybiphmqkiecfrqsfzt`) through the Supabase management API before live
certification; `public.schema_migrations` records it. Production has no cloud
accounts and is untouched.

## Reconciling an account

Opening My EraClash reconciles it. To do it without the UI, call
`progression-reconcile` with the account's bearer. Expected vs stored is
`expectedAwards(records)` vs `xp_ledger`; missing rows are inserted, nothing is
removed. A backfill for an account that existed before 9D is the same call.

## Verifying

```bash
npm run progression:contract-qa            # files
npm run progression:xp-qa                  # in-process fake cloud
npm run progression:achievement-qa
npm run progression:backfill-qa
npm run progression:reconcile-qa
npm run progression:rls-qa                 # SQL as written + the live record
# fake-cloud harness on 4178 (RL_* raised) and fixtures harness on 4179:
PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 RL_PROFILE_PER_MIN_IP=500 RL_PROGRESSION_PER_MIN_IP=500 node scripts/harness.mjs 4178
npm run build:fixtures && PREVIEW_SIM_ENGINE_ENABLED=true VERCEL_ENV=preview ECLASH_FAKE_CLOUD=1 ECLASH_DIST=dist-fixtures node scripts/harness.mjs 4179
npm run progression:security-qa -- http://localhost:4178
npm run progression:concurrency-qa -- http://localhost:4178
npm run progression:responsive-qa -- http://localhost:4178
npm run progression:accessibility-qa -- http://localhost:4178
npm run progression:performance-qa -- http://localhost:4178
npx playwright test e2e/phase9d-progression.spec.js --project challenges-fake-cloud
# on the protected preview (owner key in .preview-secrets/)
npm run progression:deployed-qa -- https://<durable alias>
bash scripts/progression/phase9dSweep.sh [https://<durable alias>]   # the whole sweep, one log
node scripts/progression/phase9dSummary.mjs [https://<durable alias>]
```

The fake cloud (`scripts/lib/fakeCloud.mjs`) plays PostgREST, the auth "who am
I" endpoint and `rpc/progression_apply` in memory with the migration's
semantics; a bearer `test-token.<uuid>` is that user (Joseph, Bea).
