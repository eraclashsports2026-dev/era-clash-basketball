// ── Clash Breakdown V1: the versioned contract ───────────────────────────────
// "Why did this Clash turn out the way it did?" answered DESCRIPTIVELY: which
// recorded statistics distinguished the two teams, which individual lines
// stood out, and how the score moved period by period. Every number comes from
// the completed result the server already stored and returned; nothing here
// re-simulates, calls a language model, or claims a cause.
//
// This file is the contract: the permitted source fields, the metric
// definitions and their directionality, the insight thresholds and ranking,
// the key-performance rule, the game-flow facts, and what is deliberately
// deferred. `engine.js` applies it; the tests pin it.
export const CLASH_BREAKDOWN_VERSION = "1.0.0";
export const KEY_PERFORMANCE_RULE_VERSION = "1.0.0";
export const MAX_INSIGHTS = 3;
export const MAX_PERFORMANCES_PER_TEAM = 2;

// ── Permitted source fields ──────────────────────────────────────────────────
// The breakdown reads ONLY these paths of a completed result. Anything else —
// the simulation seed, the fingerprint, the chaos draft, the coach offers, the
// pregame read, narrative strings, account or session fields — is never read,
// so it can never reach the projection.
export const SOURCE_FIELDS = Object.freeze([
  "id | resultId",                  // the result's own public id (already in the URL/history the owner holds)
  "core.finalScore | finalScore",   // { gold, blue }
  "v3.teamTotals.{gold,blue}",      // pts fgm fga tpm tpa ftm fta oreb dreb reb ast stl blk to possessions
  "v3.fullBox.{gold,blue}[]",       // per player: id name pos pts fgm fga tpm tpa ftm fta oreb dreb ast stl blk to
  "v3.periodScores[] | periodScores[]", // { period, gold, blue }
  "v3.overtimes",
]);
/** Never copied into a breakdown, whatever the input carries. */
export const FORBIDDEN_OUTPUT_FIELDS = Object.freeze([
  "seed", "simulationSeed", "fingerprint", "parameterSetHash", "chaosDraft", "coachOffers", "cpuDecisionCommit", "cpuCoachCommit",
  "session", "userId", "user_id", "email", "challengeId", "chaosRunId", "chaosManifestId", "pregame", "narrative", "story",
  "expandedAnalysis", "keyMoments", "quarterFlow", "matchupPatterns", "coaching", "rating", "xp",
]);

// ── Authoritative capability map (what the engine records) ───────────────────
// A = recorded authoritatively in the stored result; D = derived
// deterministically from recorded fields; N = not recorded → omitted in V1.
export const CAPABILITY = Object.freeze({
  team: {
    finalScore: "A", periodScores: "A", overtimes: "A",
    fgm: "A", fga: "A", fgPct: "D", tpm: "A", tpa: "A", tpPct: "D", ftm: "A", fta: "A", ftPct: "D",
    reb: "A", oreb: "A", dreb: "A", ast: "A", stl: "A", blk: "A", to: "A", possessions: "A",
    pointsFromThrees: "D", pointsFromFreeThrows: "D",
    fouls: "N",            // pf exists in the box but the engine never increments it (always 0) — not modeled
    pace: "N",             // possessions are recorded; a pace figure needs a minutes basis the engine does not record
    pointsInPaint: "N", fastBreakPoints: "N", secondChancePoints: "N", benchPoints: "N",   // not recorded (five-player rosters, no bench)
    largestLead: "N", leadChanges: "N", ties: "N", scoringRuns: "N",   // only as narrative strings; no stored score timeline
  },
  player: {
    pts: "A", fgm: "A", fga: "A", tpm: "A", tpa: "A", ftm: "A", fta: "A", oreb: "A", dreb: "A", reb: "D", ast: "A", stl: "A", blk: "A", to: "A",
    fgPct: "D", minutes: "N", plusMinus: "N", fouls: "N",
  },
  flow: {
    periodScores: "A", runningScoreByPeriod: "D", leaderByPeriod: "D", halftime: "D", secondHalf: "D", periodsWon: "D",
    possessionSequence: "N", scoreAfterEachPossession: "N", clutch: "N",
  },
});
export const DEFERRED = Object.freeze([
  { metric: "lead changes, ties, largest lead, scoring runs", reason: "the engine counts these during simulation but stores them only inside narrative sentences; V1 does not parse narrative text" },
  { metric: "points in the paint, fast-break, second-chance, bench points", reason: "not recorded by the engine (five-player rosters; no bench)" },
  { metric: "fouls", reason: "the box score carries a pf column the engine never increments" },
  { metric: "minutes, plus/minus", reason: "not modeled" },
  { metric: "pace", reason: "possessions are recorded but no minutes basis for a per-48 figure" },
]);

// ── Team metrics, labels and directionality ──────────────────────────────────
// direction: "higher" (more is the stronger side), "lower" (fewer is stronger),
// "neutral" (volume, not a verdict — never highlighted).
export const TEAM_METRICS = Object.freeze([
  { key: "fg", label: "FG", kind: "split", made: "fgm", att: "fga", direction: "higher" },
  { key: "fgPct", label: "FG%", kind: "pct", made: "fgm", att: "fga", direction: "higher" },
  { key: "tp", label: "3PT", kind: "split", made: "tpm", att: "tpa", direction: "higher" },
  { key: "tpPct", label: "3PT%", kind: "pct", made: "tpm", att: "tpa", direction: "higher" },
  { key: "ft", label: "FT", kind: "split", made: "ftm", att: "fta", direction: "higher" },
  { key: "ftPct", label: "FT%", kind: "pct", made: "ftm", att: "fta", direction: "higher" },
  { key: "reb", label: "REB", kind: "count", field: "reb", direction: "higher" },
  { key: "oreb", label: "OREB", kind: "count", field: "oreb", direction: "higher" },
  { key: "dreb", label: "DREB", kind: "count", field: "dreb", direction: "higher" },
  { key: "ast", label: "AST", kind: "count", field: "ast", direction: "higher" },
  { key: "to", label: "TO", kind: "count", field: "to", direction: "lower" },
  { key: "stl", label: "STL", kind: "count", field: "stl", direction: "higher" },
  { key: "blk", label: "BLK", kind: "count", field: "blk", direction: "higher" },
  { key: "possessions", label: "POSS", kind: "count", field: "possessions", direction: "neutral" },
]);

// ── Insight candidates and thresholds ────────────────────────────────────────
// A difference qualifies when |Δ| ≥ threshold (and the attempt minimums hold
// for a percentage). Candidates of different scales are ranked by
// strength = |Δ| / threshold — how many "notable units" the gap is — never by
// the raw number. One insight per family (so rebounding cannot take two of
// three slots). Ties in strength fall to FAMILY_ORDER. Up to MAX_INSIGHTS; fewer
// when fewer qualify; none → the balanced sentence.
export const FAMILY_ORDER = Object.freeze(["SHOOTING", "PERIMETER", "BALL_SECURITY", "REBOUNDING", "FREE_THROWS", "PLAYMAKING", "DEFENSIVE_EVENTS"]);
export const INSIGHT_CANDIDATES = Object.freeze([
  { id: "fg_pct", family: "SHOOTING", title: "FIELD-GOAL SHOOTING", metric: "fgPct", threshold: 5.0, minAttempts: 20 },
  { id: "three_made", family: "PERIMETER", title: "THREE-POINT SCORING", metric: "tpm", threshold: 4 },
  { id: "three_pct", family: "PERIMETER", title: "THREE-POINT ACCURACY", metric: "tpPct", threshold: 10.0, minAttempts: 10 },
  { id: "turnovers", family: "BALL_SECURITY", title: "BALL SECURITY", metric: "to", threshold: 4 },
  { id: "rebounds", family: "REBOUNDING", title: "REBOUNDING", metric: "reb", threshold: 7 },
  { id: "off_rebounds", family: "REBOUNDING", title: "OFFENSIVE REBOUNDING", metric: "oreb", threshold: 5 },
  { id: "free_throws", family: "FREE_THROWS", title: "FREE THROWS", metric: "ftm", threshold: 6 },
  { id: "assists", family: "PLAYMAKING", title: "PLAYMAKING", metric: "ast", threshold: 6 },
  { id: "steals", family: "DEFENSIVE_EVENTS", title: "DEFENSIVE EVENTS", metric: "stl", threshold: 4 },
  { id: "blocks", family: "DEFENSIVE_EVENTS", title: "DEFENSIVE EVENTS", metric: "blk", threshold: 3 },
]);
export const LARGE_STRENGTH = 2;   // strength ≥ 2 is described as a "large" gap in the data model only; copy stays plain
export const BALANCED_LINE = "Neither team held a large statistical edge in the tracked categories.";
export const SECTION_TITLE = "The largest statistical differences";
export const DESCRIPTIVE_NOTE = "Recorded differences between the two teams — not a verdict on what caused the result.";

// ── Key performances (rule 1.0.0) ────────────────────────────────────────────
// Per team, up to two lines, BOTH teams always:
//   1. the team's leading scorer (tie → more rebounds + assists → fewer
//      turnovers → box-score order);
//   2. among the rest, the player with the most distinctions (tie → more
//      points → box-score order), shown only if they hold at least one.
// Distinctions: TRIPLE-DOUBLE, DOUBLE-DOUBLE (≥10 in two of PTS/REB/AST/STL/BLK),
// TEAM-HIGH REBOUNDS (≥8), TEAM-HIGH ASSISTS (≥6), TEAM-HIGH 3PM (≥4),
// DEFENSIVE LINE (STL+BLK ≥4), EFFICIENT SCORING (≥20 PTS on ≥60% FG).
// Labels are statistical facts, never "MVP". The line shows PTS, then up to
// three of REB ≥5, AST ≥5, 3PM ≥3, STL ≥3, BLK ≥3 in that order, plus FG.
export const PERFORMANCE_LABELS = Object.freeze({
  LEADING_SCORER: "LEADING SCORER", TRIPLE_DOUBLE: "TRIPLE-DOUBLE", DOUBLE_DOUBLE: "DOUBLE-DOUBLE",
  TEAM_HIGH_REBOUNDS: "TEAM-HIGH REBOUNDS", TEAM_HIGH_ASSISTS: "TEAM-HIGH ASSISTS", TEAM_HIGH_THREES: "TEAM-HIGH THREES",
  DEFENSIVE_LINE: "DEFENSIVE LINE", EFFICIENT_SCORING: "EFFICIENT SCORING",
});
export const LINE_EXTRAS = Object.freeze([["reb", "REB", 5], ["ast", "AST", 5], ["tpm", "3PM", 3], ["stl", "STL", 3], ["blk", "BLK", 3]]);

// ── Telemetry (closed; no names, ids or numbers from the game) ───────────────
export const BREAKDOWN_EVENTS = Object.freeze({ OPENED: "clash_breakdown_opened", COMPARISON_OPENED: "clash_breakdown_comparison_opened" });
export const BREAKDOWN_EVENT_METADATA_ALLOWED = Object.freeze(["breakdownVersion", "surface", "insightCount", "hasFlow"]);
