# Clash Breakdown V1

"Why did this Clash turn out the way it did?" answered **descriptively**: which recorded statistics distinguished the two teams, which individual lines stood out, and how the score moved period by period. Built from the completed result the server already stored; no re-simulation, no language model, no new route, no migration.

Contract: `src/breakdown/contract.js` (`clashBreakdownVersion = "1.0.0"`, key-performance rule `1.0.0`). Engine: `src/breakdown/engine.js` (pure: no network, clock or randomness; input never mutated).

## Source and capability

The engine reads only: `core.finalScore`, `v3.fullBox.{gold,blue}[]`, `v3.teamTotals`, `v3.periodScores` (or top-level `periodScores`), `v3.overtimes`, and the result id. It never reads the seed, fingerprint, chaos draft, coach offers, pregame read, narrative or any account field. Machine-readable map with live observations: `data/validation/breakdown-v1/capability-map.json`.

| | Recorded (A) | Derived (D) | Not recorded (N) — omitted |
|---|---|---|---|
| Team | score, FGM/FGA, 3PM/3PA, FTM/FTA, OREB/DREB/REB, AST, STL, BLK, TO, possessions, period scores, overtimes | FG%, 3P%, FT%, points from threes | fouls (column exists, never incremented), pace, points in paint, fast-break, second-chance, bench, largest lead, lead changes, ties, runs |
| Player | PTS, FGM/FGA, 3PM/3PA, FTM/FTA, OREB/DREB, AST, STL, BLK, TO | REB, FG% | minutes, plus/minus, fouls |
| Flow | period scores | running score, leader and halftime by period, second-half split, quarters won | possession sequence, score after each possession, clutch |

The box score is counted per event (one `credit()` updates player and team together); player lines sum exactly to the stored totals and the final score. Lead changes, runs and largest lead exist only inside narrative sentences — V1 does not parse narrative text, so they are deferred. The engine's error-fallback path records the box and totals but no period scores: the breakdown then shows without Game Flow.

## Insight selection

Candidates (threshold = smallest gap that may headline):

| Family | Candidate | Threshold |
|---|---|---|
| SHOOTING | FG% | 5.0 points, both teams ≥ 20 FGA |
| PERIMETER | 3-pointers made · 3P% | 4 made · 10.0 points, both ≥ 10 3PA |
| BALL_SECURITY | turnovers (fewer is stronger) | 4 |
| REBOUNDING | rebounds · offensive rebounds | 7 · 5 |
| FREE_THROWS | free throws made | 6 |
| PLAYMAKING | assists | 6 |
| DEFENSIVE_EVENTS | steals · blocks | 4 · 3 |

Rank by **strength = |gap| ÷ threshold** (scale-free), keep one per family, at most three. Ties in strength fall to the family order above. Fewer than three qualify → fewer shown. None → "Neither team held a large statistical edge in the tracked categories." If the stored totals do not add up to the final score, no insight is shown. Edges held by the losing team are reported like any other.

Copy is template-only and descriptive ("Gold finished with 7 fewer turnovers.", "Blue held a +10 rebounding margin.", "Gold shot 5.9 percentage points better from the field."). Section title "The largest statistical differences", with the note "Recorded differences between the two teams — not a verdict on what caused the result." No "won because", no attribution percentages, no MVP label.

## Team comparison

FG, FG%, 3PT, 3P%, FT, FT%, REB, OREB, DREB, AST, TO, STL, BLK, POSS. Direction: higher is stronger except TO (lower); possessions and made/attempted splits are neutral and never highlighted. The stronger figure is bold with a screen-reader "(stronger)"; zero attempts show "—".

## Key performances (rule 1.0.0)

Per team, both teams always: the leading scorer (tie → more REB+AST → fewer TO → box order); then, among the rest, the player with the most distinctions (TRIPLE-DOUBLE, DOUBLE-DOUBLE, TEAM-HIGH REBOUNDS ≥ 8, TEAM-HIGH ASSISTS ≥ 6, TEAM-HIGH THREES ≥ 4, DEFENSIVE LINE STL+BLK ≥ 4, EFFICIENT SCORING ≥ 20 PTS on ≥ 60% FG), only if they hold one. Line: PTS, then up to three of REB ≥ 5, AST ≥ 5, 3PM ≥ 3, STL ≥ 3, BLK ≥ 3, plus FG and 3PT splits.

## Game flow (period level)

Each period's score and the running score (Q1, Q2 · HALF, Q3, Q4 · FINAL, OT, OT2…), then facts: halftime leader, second-half split, quarters won (and level). Shown only when the periods add up to the final score.

## Where it appears

Collapsed entry ("CLASH BREAKDOWN" + the largest difference + OPEN BREAKDOWN) directly under the final score — and under a Challenge comparison, which stays first — in the result dock, the remembered last Clash, the full report and a saved report from My EraClash → History. Opening is a pure projection of the result already on screen: no request, no new result. A Challenge recipient's breakdown is of their own completed game; before the attempt no result exists.

## History reopen (defect fixed on this path)

The History list reads a light projection of `saved_clashes` (no snapshot). Before V1 the report opened the list row directly, so for a real account it could never reopen ("missing its snapshot"); the in-memory test adapter returned every column and hid it. Now the report reads the owner's full row with `getSavedClash` under the existing owner-only RLS policy (verified by role switch on the Preview database). The test adapter's list uses the same column projection as the real provider.

## Feature flag and release

`CLASH_BREAKDOWN_V1_ENABLED` (server), surfaced as `/api/v3meta` `modes.clashBreakdown`: default on for Vercel Preview, off in Production. Off hides every breakdown surface; the History reopen fix is not flagged (it restores intended behaviour).

Production release (after `APPROVE CLASH BREAKDOWN V1 — RELEASE TO PRODUCTION`):
1. Merge PR #67 (Vercel Git deploy). No migration.
2. Verify production: `/api/health` ok; `/api/v3meta` `clashBreakdown: false`; a Chaos Clash plays; History → a saved Clash now reopens.
3. Set `CLASH_BREAKDOWN_V1_ENABLED=true` in Vercel → Production; redeploy.
4. Smoke: `clashBreakdown: true`; a guest Clash shows the entry under the score; the breakdown numbers equal the Box Score tab; a refresh reopens it from the last Clash.
5. Rollback: set the variable to `false` and redeploy. Nothing is stored, so there is nothing to clean up.

## Gates

`npx vitest run tests/clash-breakdown-v1.test.js`; `node scripts/breakdown/breakdownQa.mjs capability | journey | responsive | screens | deployed <origin>` → `data/validation/breakdown-v1/`.
