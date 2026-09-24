// ── Progression V1: the pure contract ────────────────────────────────────────
// Phase 9D. Career XP, career level, achievements. Everything here is a plain
// function of authoritative records: no storage, no network, no user id, no
// randomness. The server derives what an account SHOULD hold from its saved
// Clashes and challenge attempts and hands the database a list of awards whose
// uniqueness the database decides; the browser only displays.
//
// The one rule above every other: PROGRESSION_POWER_EFFECT = 0. Nothing in this
// module is imported by a draft, roll, era, coach, placement or simulation
// path, and no value here is read by one. A Level 1 and a Level 100 account
// given the same basketball decisions have exactly the same opportunity to win.
import { ERAS, PLAYERS } from "../players.js";

export const PROGRESSION_VERSION = "1.0.0";
export const LEVEL_CURVE_VERSION = "1.0.0";
export const ACHIEVEMENT_CATALOG_VERSION = "1.0.0";
export const PROGRESSION_POWER_EFFECT = 0;

// ── XP contract ──────────────────────────────────────────────────────────────
// Every amount in one place. UI components never carry a number.
export const XP = Object.freeze({
  CLASH_COMPLETION: 100,             // an authoritative completed Clash, any supported mode
  CLASH_WIN: 25,                     // the win bonus; a tie or a loss earns none
  ERA_FIRST_COMPLETION: 50,          // the first completed Clash in an Era, once per account per Era
  CHALLENGE_COMPLETION: 50,          // an official challenge attempt completed
  CHALLENGE_VICTORY: 25,             // the recipient wins the comparison contract
  CHALLENGE_CREATOR_RESPONSE: 25,    // another account completes an official attempt against your challenge
  ACHIEVEMENT: Object.freeze({ small: 50, medium: 100, major: 250 }),
});

/** Closed vocabularies. The database check constraints mirror both. */
export const SOURCE_TYPES = Object.freeze(["clash", "era", "challenge_attempt", "achievement"]);
export const REASONS = Object.freeze(["completion", "win", "first_completion", "victory", "creator_response", "unlock"]);
export const MAX_XP_DELTA = 1000;

/** `clash:<result_id>:completion` — the shape the specification names. */
export const sourceKey = ({ sourceType, sourceId, reason }) => `${sourceType}:${sourceId}:${reason}`;

/** Things that are explicitly NOT XP sources (§11). Pinned by tests: no server hook fires for them. */
export const NO_XP_FOR = Object.freeze([
  "rolling", "holding a player", "revealing an Era", "choosing a coach", "opening a result",
  "copying a challenge link", "creating a challenge", "opening the site", "signing in",
  "changing profile settings", "saving or favoriting a roster", "refreshing", "abandoning a game",
  "daily login",
]);

// ── Level curve (versioned) ──────────────────────────────────────────────────
// Cumulative XP required to REACH each of the first ten levels, then a
// deterministic formula: the cost of the step from level L to L+1 (L ≥ 10) is
// 650 + (L − 10) × 75. Level 100 is the cap; XP keeps accumulating past it and
// the display says MAX LEVEL. Nothing resets and nothing is erased.
export const LEVEL_THRESHOLDS = Object.freeze([0, 250, 550, 900, 1300, 1750, 2250, 2800, 3400, 4050]);
export const LEVEL_CAP = 100;
export const stepCost = (level) => (level < 10 ? LEVEL_THRESHOLDS[level] - LEVEL_THRESHOLDS[level - 1] : 650 + (level - 10) * 75);

/** Cumulative XP at which `level` is reached (level 1 at 0). */
export const cumulativeXpForLevel = (level) => {
  const L = Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
  if (L <= 10) return LEVEL_THRESHOLDS[L - 1];
  let total = LEVEL_THRESHOLDS[9];
  for (let l = 10; l < L; l++) total += stepCost(l);
  return total;
};

/** The level a total earns, and where it sits inside that level. */
export const levelForXp = (totalXp) => {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (level < LEVEL_CAP && xp >= cumulativeXpForLevel(level + 1)) level++;
  const floor = cumulativeXpForLevel(level);
  const maxLevel = level >= LEVEL_CAP;
  const next = maxLevel ? null : cumulativeXpForLevel(level + 1);
  return {
    level, totalXp: xp, maxLevel,
    xpIntoLevel: xp - floor,
    xpForLevel: maxLevel ? null : next - floor,
    xpToNext: maxLevel ? 0 : next - xp,
    nextLevelAt: next,
    progress: maxLevel ? 1 : +((xp - floor) / (next - floor)).toFixed(4),
  };
};

/**
 * Expected velocity, from the contract's own numbers — the analysis the
 * specification asks for, computed rather than asserted. `xpPerClash` models an
 * ordinary completed Clash: completion, the win bonus at the given win rate,
 * and the Era-first bonus amortised over the first Clash in each Era.
 */
export const velocityModel = ({ winRate = 0.5, eraBonusHorizonGames = 40 } = {}) => {
  const perClash = XP.CLASH_COMPLETION + XP.CLASH_WIN * winRate;
  const eraAmortised = (ERAS.length * XP.ERA_FIRST_COMPLETION) / eraBonusHorizonGames;
  const xpPerClashEarly = perClash + eraAmortised;
  const gamesTo = (level) => Math.ceil(cumulativeXpForLevel(level) / (level <= 10 ? xpPerClashEarly : perClash));
  return { winRate, xpPerClash: perClash, xpPerClashEarly: +xpPerClashEarly.toFixed(1), gamesToLevel: Object.fromEntries([2, 5, 10, 25, 50, 100].map((l) => [l, gamesTo(l)])), cumulativeXp: Object.fromEntries([5, 10, 25, 50, 100].map((l) => [l, cumulativeXpForLevel(l)])) };
};

// ── Achievements (versioned catalog) ─────────────────────────────────────────
// Categories map to the Achievements page filters: CAREER (getting_started and
// career), ERAS, CHALLENGES (competition), EXPLORATION. Tones come from the
// existing palette. Two achievements are hidden until unlocked.
export const ACHIEVEMENT_CATEGORIES = Object.freeze(["getting_started", "career", "eras", "competition", "exploration"]);
export const ACHIEVEMENT_FILTERS = Object.freeze([
  { id: "all", label: "All", categories: ACHIEVEMENT_CATEGORIES },
  { id: "career", label: "Career", categories: ["getting_started", "career"] },
  { id: "eras", label: "Eras", categories: ["eras"] },
  { id: "challenges", label: "Challenges", categories: ["competition"] },
  { id: "exploration", label: "Exploration", categories: ["exploration"] },
]);
export const ACHIEVEMENT_TONES = Object.freeze({ getting_started: "gold", career: "platinum", eras: "violet", competition: "cobalt", exploration: "gold" });

const A = (id, name, description, category, tier, metric, target, extra = {}) => Object.freeze({
  id, version: ACHIEVEMENT_CATALOG_VERSION, name, description, category, tier, metric, target,
  progressType: target > 1 ? "count" : "binary", hidden: false, xp: XP.ACHIEVEMENT[tier], icon: extra.icon || category, ...extra,
});

export const ACHIEVEMENTS = Object.freeze([
  // Getting started
  A("first_clash", "First Clash", "Complete your first Clash.", "getting_started", "small", "clashes", 1),
  A("first_win", "First Win", "Win your first Clash.", "getting_started", "small", "wins", 1),
  A("first_chaos", "First Chaos", "Complete your first Chaos Clash.", "getting_started", "small", "chaosClashes", 1),
  A("first_challenge", "First Challenge", "Complete your first official Challenge.", "getting_started", "small", "challengesCompleted", 1),
  // Career
  A("ten_clashes", "Ten Clashes", "Complete 10 Clashes.", "career", "small", "clashes", 10),
  A("regular", "Regular", "Complete 25 Clashes.", "career", "small", "clashes", 25),
  A("fifty_clashes", "Fifty Clashes", "Complete 50 Clashes.", "career", "medium", "clashes", 50),
  A("century_club", "Century Club", "Complete 100 Clashes.", "career", "major", "clashes", 100),
  A("ten_wins", "Ten Wins", "Record 10 wins.", "career", "small", "wins", 10),
  A("fifty_wins", "Fifty Wins", "Record 50 wins.", "career", "medium", "wins", 50),
  A("heat_check", "Heat Check", "Win 3 Clashes in a row.", "career", "medium", "longestWinStreak", 3),
  A("on_fire", "On Fire", "Win 5 Clashes in a row.", "career", "major", "longestWinStreak", 5),
  // Eras
  A("time_traveler", "Time Traveler", "Complete Clashes in 3 different Eras.", "eras", "medium", "erasCompleted", 3),
  A("era_scholar", "Era Scholar", "Complete Clashes in 5 different Eras.", "eras", "medium", "erasCompleted", 5),
  A("across_the_ages", "Across the Ages", `Complete a Clash in every Era (${ERAS.length}).`, "eras", "major", "erasCompleted", ERAS.length),
  A("era_adapter", "Era Adapter", "Win Clashes in 3 different Eras.", "eras", "medium", "erasWon", 3),
  // Competition
  A("challenger", "Challenger", "Create a Challenge that receives an official response.", "competition", "small", "challengeResponsesReceived", 1),
  A("answer_the_call", "Answer the Call", "Complete 5 official Challenges.", "competition", "medium", "challengesCompleted", 5),
  A("prove_it", "Prove It", "Win 5 Challenge comparisons.", "competition", "medium", "challengeWins", 5),
  // Exploration / construction
  A("coachs_trust", "Coach's Trust", "Win with 3 different coaches.", "exploration", "medium", "winningCoaches", 3),
  A("positionless", "Positionless", "Complete a Clash with two or more multi-position players in your five.", "exploration", "small", "positionlessClashes", 1),
  // Hidden until unlocked. Neither asks anyone to lose or to exploit the game.
  A("nail_biter", "Nail-Biter", "Win a Clash by 3 points or fewer.", "exploration", "small", "closeWins", 1, { hidden: true }),
  A("statement_win", "Statement Win", "Win a Clash by 25 points or more.", "exploration", "small", "routWins", 1, { hidden: true }),
]);
export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const HIDDEN_ACHIEVEMENT_LABEL = "Secret achievement";
export const MAX_HIDDEN_ACHIEVEMENTS = 3;

// ── Facts: what the records say, derived once ────────────────────────────────
const MULTI_POSITION = new Set(PLAYERS.filter((p) => Array.isArray(p.positions) && p.positions.length > 1).map((p) => p.id));
const playedMs = (r) => { const t = Date.parse(r?.played_at || r?.created_at || ""); return Number.isFinite(t) ? t : 0; };
const byPlayed = (a, b) => playedMs(a) - playedMs(b) || String(a?.result_id || "").localeCompare(String(b?.result_id || ""));
const margin = (r) => (Number.isFinite(Number(r?.gold_score)) && Number.isFinite(Number(r?.blue_score)) ? Number(r.gold_score) - Number(r.blue_score) : null);

/**
 * @param clashes   saved_clashes rows the account owns (mode, outcome, era_id,
 *                  gold_score, blue_score, gold_coach, gold_roster, played_at)
 * @param attempts  the account's COMPLETED challenge_attempts (challenge_outcome)
 * @param responses COMPLETED attempts by OTHER ACCOUNTS against the account's challenges
 */
export const factsFromRecords = ({ clashes = [], attempts = [], responses = [] } = {}) => {
  const rows = [...(clashes || [])].filter((r) => r && ["win", "loss", "tie"].includes(r.outcome)).sort(byPlayed);
  const wins = rows.filter((r) => r.outcome === "win");
  const eras = (set) => ERAS.filter((e) => set.has(e)).concat([...set].filter((e) => !ERAS.includes(e)));
  let streak = 0, longest = 0;
  for (const r of rows) { streak = r.outcome === "win" ? streak + 1 : 0; longest = Math.max(longest, streak); }
  const completedAttempts = (attempts || []).filter((a) => a && a.status === "completed");
  return {
    clashes: rows.length,
    wins: wins.length,
    losses: rows.filter((r) => r.outcome === "loss").length,
    ties: rows.filter((r) => r.outcome === "tie").length,
    chaosClashes: rows.filter((r) => r.mode === "chaos").length,
    erasCompleted: eras(new Set(rows.map((r) => r.era_id).filter(Boolean))),
    erasWon: eras(new Set(wins.map((r) => r.era_id).filter(Boolean))),
    winningCoaches: [...new Set(wins.map((r) => r.gold_coach?.id || r.gold_coach?.name).filter(Boolean))],
    positionlessClashes: rows.filter((r) => (Array.isArray(r.gold_roster) ? r.gold_roster : []).filter((p) => MULTI_POSITION.has(p?.id)).length >= 2).length,
    closeWins: wins.filter((r) => { const m = margin(r); return m != null && m >= 1 && m <= 3; }).length,
    routWins: wins.filter((r) => { const m = margin(r); return m != null && m >= 25; }).length,
    longestWinStreak: longest,
    challengesCompleted: completedAttempts.length,
    challengeWins: completedAttempts.filter((a) => a.challenge_outcome === "recipient").length,
    challengeResponsesReceived: (responses || []).filter((a) => a && a.status === "completed").length,
  };
};

/** A metric's current value; arrays count their members. */
export const metricValue = (facts, metric) => { const v = facts?.[metric]; return Array.isArray(v) ? v.length : Number(v) || 0; };

/**
 * Every achievement with truthful progress. `unlocked` is what the database
 * already holds; an achievement whose target the facts meet and the database
 * does not yet hold is `newlyUnlocked`. Pure and cheap: one pass over ~23 rows.
 */
export const evaluateAchievements = (facts, unlocked = []) => {
  const held = new Map((unlocked || []).map((u) => [typeof u === "string" ? u : u.achievement_id, typeof u === "string" ? null : u]));
  return ACHIEVEMENTS.map((a) => {
    const current = Math.min(metricValue(facts, a.metric), a.target);
    const met = current >= a.target;
    const row = held.get(a.id) || null;
    const isUnlocked = !!row || met;
    return {
      ...a, current, met,
      unlocked: isUnlocked, newlyUnlocked: met && !row,
      unlockedAt: row?.unlocked_at || null,
      // A hidden achievement shows nothing about itself until it is unlocked.
      display: a.hidden && !isUnlocked ? { name: HIDDEN_ACHIEVEMENT_LABEL, description: "Keep playing to reveal it.", secret: true } : { name: a.name, description: a.description, secret: false },
    };
  });
};

export const achievementSummary = (evaluated) => ({ total: evaluated.length, unlocked: evaluated.filter((a) => a.unlocked).length });

/** Awards (ledger rows) for the achievements newly met. Once per achievement id, whatever its version. */
export const achievementAwards = (evaluated) => evaluated.filter((a) => a.newlyUnlocked).map((a) => ({ sourceType: "achievement", sourceId: a.id, reason: "unlock", xpDelta: a.xp, achievementId: a.id, achievementVersion: a.version }));

// ── Expected awards: what the ledger should contain for these records ────────
/**
 * Deterministic and idempotent by construction: the same records always yield
 * the same list, and every entry's key is unique per account, so applying the
 * list twice inserts nothing the second time. Only authoritative records
 * appear here — a row in saved_clashes is a result the server verified and
 * stored; a completed challenge_attempt is a comparison the server made.
 */
export const expectedAwards = ({ clashes = [], attempts = [], responses = [] } = {}) => {
  const out = [];
  const rows = [...(clashes || [])].filter((r) => r?.result_id && ["win", "loss", "tie"].includes(r.outcome)).sort(byPlayed);
  const erasSeen = new Set();
  for (const r of rows) {
    out.push({ sourceType: "clash", sourceId: String(r.result_id), reason: "completion", xpDelta: XP.CLASH_COMPLETION });
    if (r.outcome === "win") out.push({ sourceType: "clash", sourceId: String(r.result_id), reason: "win", xpDelta: XP.CLASH_WIN });
    if (r.era_id && !erasSeen.has(r.era_id)) { erasSeen.add(r.era_id); out.push({ sourceType: "era", sourceId: String(r.era_id), reason: "first_completion", xpDelta: XP.ERA_FIRST_COMPLETION }); }
  }
  for (const a of attempts || []) {
    if (!a?.id || a.status !== "completed") continue;
    out.push({ sourceType: "challenge_attempt", sourceId: String(a.id), reason: "completion", xpDelta: XP.CHALLENGE_COMPLETION });
    if (a.challenge_outcome === "recipient") out.push({ sourceType: "challenge_attempt", sourceId: String(a.id), reason: "victory", xpDelta: XP.CHALLENGE_VICTORY });
  }
  for (const a of responses || []) {
    if (!a?.id || a.status !== "completed") continue;
    out.push({ sourceType: "challenge_attempt", sourceId: String(a.id), reason: "creator_response", xpDelta: XP.CHALLENGE_CREATOR_RESPONSE });
  }
  return out;
};

export const totalOf = (awards) => (awards || []).reduce((s, a) => s + (Number(a.xpDelta ?? a.xp_delta) || 0), 0);

/** Human labels for the postgame module and the ledger. */
export const AWARD_LABELS = Object.freeze({
  "clash:completion": "Clash complete", "clash:win": "Win bonus", "era:first_completion": "New Era explored",
  "challenge_attempt:completion": "Challenge complete", "challenge_attempt:victory": "Challenge won", "challenge_attempt:creator_response": "Challenge answered",
  "achievement:unlock": "Achievement",
});
export const awardLabel = (a) => {
  const key = `${a.sourceType ?? a.source_type}:${a.reason}`;
  if (key === "achievement:unlock") return ACHIEVEMENT_BY_ID.get(a.sourceId ?? a.source_id)?.name || "Achievement";
  return AWARD_LABELS[key] || key;
};
export const reasonCategory = (a) => `${a.sourceType ?? a.source_type}:${a.reason}`;

/**
 * The postgame summary for one authoritative event, from the awards that call
 * inserted and the totals the database returned. `before` is derived by
 * subtracting the delta, so a level-up is detected without a second read.
 */
export const progressionDelta = ({ awarded = [], unlocked = [], totalXp = 0 }) => {
  const xpDelta = totalOf(awarded);
  const after = levelForXp(totalXp);
  const before = levelForXp(Math.max(0, totalXp - xpDelta));
  return { xpDelta, awarded, unlocked, before, after, levelUp: after.level > before.level, levelsGained: after.level - before.level };
};

/** Screen-reader sentence for an award: "125 career XP earned. Level 8. 335 XP until Level 9." */
export const announceProgress = (delta) => {
  if (!delta) return "";
  const l = delta.after;
  const tail = l.maxLevel ? "Max level." : `${l.xpToNext} XP until Level ${l.level + 1}.`;
  return `${delta.xpDelta} career XP earned. Level ${l.level}. ${tail}`;
};

// ── Telemetry (closed vocabulary) ────────────────────────────────────────────
export const PROGRESSION_EVENTS = Object.freeze({
  VIEWED: "progression_viewed",
  XP_SHOWN: "xp_awarded_ui_shown",
  LEVEL_UP_SHOWN: "level_up_shown",
  UNLOCK_SHOWN: "achievement_unlocked_ui_shown",
  ACHIEVEMENTS_VIEWED: "achievements_viewed",
  FILTER_CHANGED: "achievement_filter_changed",
  RECONCILED: "progression_reconciled",
});
export const EVENT_METADATA_ALLOWED = Object.freeze(["level", "xpDelta", "reasonCategory", "achievementId", "achievementCategory", "unlockCount", "mode", "success", "failureCode", "filter"]);

// ── Policy, in one place ─────────────────────────────────────────────────────
export const PROGRESSION_POLICY = Object.freeze({
  powerEffect: PROGRESSION_POWER_EFFECT,
  serverDecidesAwards: true,
  oneAwardPerSource: "unique (user_id, source_type, source_id, reason)",
  guestXp: "none; a claimed guest result earns once, after the claim",
  levelCap: LEVEL_CAP, noPrestige: true, noSeasonalReset: true, noHiddenThrottle: true,
  leaderboards: "none (Phase 9E)", publicProfile: "none",
});
