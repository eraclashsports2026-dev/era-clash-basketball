# Achievement catalog V1 (Phase 9D)

`ACHIEVEMENT_CATALOG_VERSION 1.0.0` — 23 achievements, 2 hidden, five
categories, four tones from the existing palette. Definitions are static
client-safe configuration in `src/progression/contract.js`; progress is derived
from the account's records by `evaluateAchievements(factsFromRecords(...))`,
never stored and never trusted from a client counter. Unlocks are one row per
achievement per account; achievement XP is awarded once per achievement id.

## Catalog

| Id | Name | Category | Tier / XP | Target (metric) |
| --- | --- | --- | --- | --- |
| first_clash | First Clash | getting_started | small / 50 | 1 completed Clash |
| first_win | First Win | getting_started | small / 50 | 1 win |
| first_chaos | First Chaos | getting_started | small / 50 | 1 completed Chaos Clash |
| first_challenge | First Challenge | getting_started | small / 50 | 1 completed official Challenge |
| ten_clashes | Ten Clashes | career | small / 50 | 10 Clashes |
| regular | Regular | career | small / 50 | 25 Clashes |
| fifty_clashes | Fifty Clashes | career | medium / 100 | 50 Clashes |
| century_club | Century Club | career | major / 250 | 100 Clashes |
| ten_wins | Ten Wins | career | small / 50 | 10 wins |
| fifty_wins | Fifty Wins | career | medium / 100 | 50 wins |
| heat_check | Heat Check | career | medium / 100 | longest win streak 3 |
| on_fire | On Fire | career | major / 250 | longest win streak 5 |
| time_traveler | Time Traveler | eras | medium / 100 | Clashes completed in 3 Eras |
| era_scholar | Era Scholar | eras | medium / 100 | 5 Eras |
| across_the_ages | Across the Ages | eras | major / 250 | every Era (8) |
| era_adapter | Era Adapter | eras | medium / 100 | wins in 3 Eras |
| challenger | Challenger | competition | small / 50 | 1 official response received (by another account) |
| answer_the_call | Answer the Call | competition | medium / 100 | 5 completed official Challenges |
| prove_it | Prove It | competition | medium / 100 | 5 Challenge comparisons won |
| coachs_trust | Coach's Trust | exploration | medium / 100 | wins with 3 distinct coaches |
| positionless | Positionless | exploration | small / 50 | a completed Clash whose five holds ≥ 2 multi-position players (registry `positions`) |
| nail_biter | Nail-Biter · **hidden** | exploration | small / 50 | a win by 1–3 points |
| statement_win | Statement Win · **hidden** | exploration | small / 50 | a win by 25+ points |

Hidden achievements read **SECRET ACHIEVEMENT** until unlocked; neither asks
anyone to lose or to exploit the game. RIVALRY (§15) is deliberately not built:
counting completed attempts against the same account is relationship tracking
the privacy model does not support.

## Facts the evaluator reads

From `saved_clashes` (outcome, mode, era_id, scores, gold_coach, gold_roster,
played_at, in played order): clashes, wins, losses, ties, chaosClashes,
erasCompleted, erasWon, winningCoaches, positionlessClashes, closeWins,
routWins, longestWinStreak. From `challenge_attempts`: challengesCompleted and
challengeWins (the account's completed attempts) and challengeResponsesReceived
(completed attempts by other accounts against the account's challenges).

## Evaluation

Achievements evaluate after eligible authoritative events — a Clash saved, a
guest result claimed, a device import, a challenge completed or answered — and
whenever the career is opened or reconciled. Never on a React render. The
evaluator is pure and cheap (one pass over 23 definitions).

## Page

My EraClash → Achievements: "12 / 23 UNLOCKED", filters ALL · CAREER · ERAS ·
CHALLENGES · EXPLORATION (buttons with `aria-pressed`), cards with an icon,
name, description, progress ("3 / 5" with a semantic bar) or unlock date, and
the XP. Desktop three columns, tablet two, phone one. Icons are one small
extensible glyph set (`AchievementIcon.jsx`), toned gold / cobalt / violet /
platinum.
