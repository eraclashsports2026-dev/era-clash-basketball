# Data Foundation V1 (2026-09-24)

Why: the saved career row and the governed Challenge both read fields the stored Chaos result never had (`previewCandidate`, `pregame.cards`, `pregame.coachGold`) — fields that exist only in the browser's view model and in hand-made fixtures, so every gate passed while every real save lost its candidate, coaches and roster names, and Run It Back from History played both sides with the neutral staff.

## 1. The authoritative record

Written once by `api/game.js` as `result:<id>` / `preview-result:<id>` (180 days). Reader: `api/_lib/resultContract.js` (`RESULT_RECORD_CONTRACT`) — the one place that reads identity, engine, setup, score, MVP, rosters and coaches for saved Clashes and Challenges.

| Purpose | Path on the stored record |
|---|---|
| Result identity | `id` (`pv_` prefix = preview engine), `created_at` (ms), `mode` (`single` for a Chaos simulation), `chaosDraft` (non-null = Chaos) |
| Engine identity | `candidate.{candidateId, possessionCalibrationVersion, coreHash}` — **only when `preview === true`**; `versions.engine`, `fingerprint.engineVersion`, fingerprint parameter-set hash |
| Setup (Run It Back) | `goldIds[5]`, `blueIds[5]`, `coachIds.{gold,blue}` (`neutral` = no coach), `eraId`; the era-custom flag lives on the chaos run |
| Outcome | `core.finalScore.{gold,blue}`, `core.winner`, `core.mvp` + `core.mvpLine` |
| Stats | `v3.fullBox.{gold,blue}[]` (`id,name,pos,pts,fgm,fga,tpm,tpa,ftm,fta,oreb,dreb,ast,stl,blk,to,pf`), `v3.teamTotals`, `v3.periodScores` (Candidate 4), `v3.overtimes` |
| Display names | players from the box line (slot actually played), else `findCard`; coaches from the catalog by id |
| Private | `seed`, `session` (stripped before any response or snapshot) |
| **Not on the record** | `previewCandidate` (view model), `pregame.cards`, `coachGold`/`coachBlue`, display cards |

Pinned by `tests/result-contract.test.js` against a record the real handler stores in the test and the captured Candidate 4 Chaos record (`tests/fixtures/saved-clash/candidate4-chaos-record.json`); the test also scans `api/` so no server code can read a view-model field off a record again. `scripts/foundation/goldenFixtureQa.mjs` traces one real result through raw record → saved row → History projection → Breakdown (raw and saved) → Run It Back input → Challenge metadata (`data/validation/foundation/golden-fixture-comparison.json`).

## 2. What was fixed

- **Saved Clash** (PR #68, integrated): candidate / calibration / core hash from `record.candidate` (preview only); coaches from `record.coachIds` with catalog names — the neutral staff is stored as null, so it is never counted as a distinct coach and Run It Back sends none; roster names/positions from the box score, else the catalog.
- **Challenge metadata**: `candidate_id`, `calibration_version`, `parameter_hash` (the candidate core hash, as the Challenge contract documents) and the two fingerprint inputs now come from the record's candidate; they were always null. Comparison math, same-opportunity rules and what a recipient sees (the creator's catalog five and coach, after completion) are unchanged.
- **Clash Cards**: the result payload's `completedAt` now reads `created_at` (it read `createdAt`/`playedAt`, never set; not rendered); `eraCustom` reads the run.
- **History reopen** (PR #67): the list omits the snapshot; reopening reads the owner's full row through `getSavedClash` under RLS. The test adapter's list now returns the real column projection.

## 3. Reference classification (repository-wide search)

| Pattern | Location | Class | Action |
|---|---|---|---|
| `record.previewCandidate` | `api/_lib/challenges.js` (candidate, calibration, parameter hash, fingerprint) | STALE/WRONG | fixed |
| `record.previewCandidate` | `api/_lib/cloudAccounts.js` | STALE/WRONG | fixed (#68) |
| `previewCandidate` | `src/App.jsx` viewSim, `Postgame.jsx`, `ArenaHeader.jsx` | BROWSER VIEW MODEL (built from `record.candidate` with the same preview gate) | none |
| `previewCandidateIdentity()` | `previewEngine.js`, `health.js`, `feedback.js` | SERVER (engine identity function) | none |
| `pregame.cards` | `challenges.js`, `cloudAccounts.js` | STALE/WRONG (always empty; catalog fallback masked it) | removed / fixed |
| `pregame.cards`, `previewCandidate` | `tests/v9b1-accounts.test.js`, `scripts/accounts/accountQa.mjs`, `src/accounts/testAdapter.js` | TEST FIXTURE (invented shape) | fixed (#68) |
| `coachGold` / `coachBlue` | `challenges.js`, `cloudAccounts.js` | STALE/WRONG | fixed |
| `coachGoldId` / `coachBlueId` | `api/game.js`, `chaosRun.js`, `game-core-v3.js`, `previewEngine.js` | SERVER request / engine options | none |
| `record.coachIds` | `App.jsx` (view model, daily telemetry), `resultContract.js` | CANONICAL | none |
| `goldIds` / `blueIds` | `api/game.js`, `App.jsx`, `ai.js`, `narrative.js`, `resultContract.js` | CANONICAL | none |
| `record.createdAt` / `playedAt` | `api/_lib/cards.js` | STALE/WRONG (not rendered) | fixed |
| `v3.fullBox`, `teamTotals`, `periodScores` | Breakdown, dock, Postgame | CANONICAL | none |

Consumers checked with no change needed: progression (reads saved-row columns; fixed at the source), competitive settlement and Rivalries (Challenge attempts and comparisons only), public profiles, account export (list rows; never exported snapshots), deletion (SQL cascades), telemetry.

## 4. Historical data (Production)

Read-only audit (`data/validation/foundation/production-audit-before.json`): 9 saved Clashes, all Chaos, all Candidate 4 / 1.4.0 by their own snapshots, 2 accounts. All 9 lack candidate identity, both coaches and roster names; all 9 are fully recoverable from their snapshot (0 partial, 0 unrecoverable). 0 Challenges, so no Challenge metadata to repair.

Repair: `supabase/repairs/2026-09-24-saved-clash-fields.sql`, generated by `scripts/foundation/savedClashRepair.mjs` from the application's own coach catalog. It backs up `saved_clashes` into a private `ops_backup` schema, fills only nulls from each row's own snapshot, logs before/after counts, and is idempotent. Proven on the Preview database to write exactly what `buildSavedClash` writes and to change nothing on a second run (`repair-equivalence-result.json`).

Progression: achievements are derived from saved rows and the established reconciliation inserts only what the ledger lacks (unique key). Restoring coaches lets **1 account** (5 distinct winning coaches in its saved history) earn *Coach's Trust* once, on its next career open — a legitimately earned award the bad data hid. No other achievement reads the repaired fields; no XP is re-run; no rating event is touched.

## 5. Release sequence

1. Merge the integration branch into `main` (Vercel Git deploy). Clash Breakdown stays off in Production by default.
2. Wait until www.eraclashbasketball.com serves the new build; verify guest play, health, leaderboard, profiles, `/api/v3meta` (`clashBreakdown: false`).
3. Apply the repair (backup first), re-run the audit: every `*_missing` = 0, every `*_mismatch` = 0.
4. Enable Clash Breakdown: the owner's approval is recorded; the flag's default becomes on for Production in code, and `CLASH_BREAKDOWN_V1_ENABLED=false` in Vercel remains the kill switch. Deploy, verify `clashBreakdown: true`.
5. Live smoke (guest), then a second fresh live run; authenticated journeys as available.
6. Rollback: code revert or the kill switch; the repair is reversible from `ops_backup.saved_clashes_20260924`; no user record is deleted.
