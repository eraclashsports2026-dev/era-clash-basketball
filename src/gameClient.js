// ── Game client (v2.3) ─────────────────────────────────────────────────────────
// Talks to the authoritative server:
//   /api/game      → validated, immutable core result (no AI involved)
//   /api/narrative → optional enhanced recap for that result
// The client never computes or submits scores, winners, streaks, or records.
// Failures are state-specific: an AI failure is cosmetic; a core failure means
// NO result was recorded and the Daily attempt was NOT used.
import { track } from "./analytics.js";
import { reportError } from "./errors.js";
import { getUid, getDisplayName } from "./identity.js";
import { teamRating } from "./rating.js";

const newSimId = () => {
  try { return crypto.randomUUID(); } catch { return `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

export class GameError extends Error {
  constructor(code, message, retryAfter) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const FRIENDLY = {
  RATE_LIMITED: "EraClash is experiencing heavy traffic. Your team is saved — try again in a moment.",
  MAINTENANCE: "EraClash is briefly down for maintenance. Your team is saved.",
  ENGINE_FAILURE: "We couldn't complete this matchup. No result was recorded — nothing was counted against your record.",
  VALIDATION_FAILURE: "That lineup couldn't be validated. Rebuild and try again.",
  DAILY_INVALID_LINEUP: "That lineup doesn't match today's official Daily draft. Your attempt was not used — restart today's challenge.",
  DAILY_INVALID_COACH: "That coach isn't one of today's three official options. Your attempt was not used — pick one of the three and run it again.",
  DAILY_INVALID_ERA: "Today's Daily has one official Era Style, set by the server. Your attempt was not used — reload and try again.",
  DAILY_VERSION_MISMATCH: "Today's Daily was updated while you were playing. Your attempt was not used — restart today's challenge to get the current setup.",
  DAILY_ALREADY_COMPLETED: "You've already played today's Daily. Come back at midnight UTC for the next one.",
  IDEMPOTENCY_CONFLICT: "That game was already processed — check your recent results.",
  FEATURE_DISABLED: "This mode is temporarily disabled.",
  KV_UNAVAILABLE: "Cloud saving is temporarily unavailable.",
};

const parseError = async (res) => {
  let code = "UNKNOWN_ERROR";
  try { code = (await res.json()).code || code; } catch { /* non-JSON */ }
  const retryAfter = Number(res.headers.get("Retry-After")) || null;
  return new GameError(code, FRIENDLY[code] || "Something went wrong. Your team is saved — try again.", retryAfter);
};

// In-flight dedupe: double-clicks reuse the same promise AND the same
// simulationId, so the server also sees one idempotent request.
const inflight = new Map();

// runGame({mode, gold, blue, challengeId, dailyDecisions, onStage}) → {resultId, result, records}
export const runGame = (opts) => {
  const key = `${opts.mode}|${opts.gold.map((p) => p.id).join(",")}|${(opts.blue || []).map((p) => p.id).join(",")}|${opts.challengeId || ""}|${opts.difficulty || ""}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = _run(opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

async function _run({ mode, gold, blue, challengeId, dailyDecisions, coachGoldId, coachBlueId, eraStyleId, difficulty, onStage }) {
  const simulationId = newSimId();
  const started = Date.now();
  track("simulation_started", { mode, simulation_id: simulationId, team_rating: teamRating(gold) });
  onStage?.("Validating the matchup");
  try {
    onStage?.(mode === "82" ? "Running the 82-game season" : mode === "tournament" ? "Running the tournament" : "Running the matchup");
    const res = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        simulationId,
        goldIds: gold.map((p) => p.id),
        blueIds: blue ? blue.map((p) => p.id) : undefined,
        challengeId: challengeId || undefined,
        dailyDecisions: dailyDecisions || undefined,
        coachGoldId: coachGoldId || undefined,
        coachBlueId: coachBlueId || undefined,
        eraStyleId: eraStyleId || undefined,
        difficulty: difficulty || undefined,
        displayName: getDisplayName() || undefined,
        legacyUid: getUid(),
      }),
    });
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    track("simulation_completed", {
      mode, simulation_id: simulationId, latency_ms: Date.now() - started,
      result: data.result?.core?.winner === "Gold" || (data.result?.wins > data.result?.losses) ? "win" : "loss",
      persisted: !!data.records?.persisted,
      // V3 balance telemetry (Addendum 27/28): what was picked and how expected
      // vs realized compared — the raw material for post-release meta review.
      ...(data.result?.v3 ? {
        engine: "v3",
        coach_gold: coachGoldId || "neutral",
        coach_blue: coachBlueId || "neutral",
        era_style: eraStyleId || "2020s",
        difficulty: difficulty || undefined,   // Win 82 / Tournament schedule strength
        expected_gold_pct: data.result.v3.expectedGoldWinPct,
        outcome_class: data.result.v3.outcomeClass,
        overtimes: data.result.v3.overtimes,
      } : {}),
    });
    return data;
  } catch (err) {
    track("simulation_failed", { mode, simulation_id: simulationId, latency_ms: Date.now() - started, error: String(err.code || err.message).slice(0, 60) });
    reportError("game", err);
    throw err instanceof GameError ? err : new GameError("UNKNOWN_ERROR", FRIENDLY.ENGINE_FAILURE);
  }
}

// Enhanced recap. When the result is persisted, reference it by id (the server
// reads its own stored copy); otherwise pass the result inline (narration-only
// transport — it can't affect records because none exist without a store).
export const requestNarrative = async ({ resultId, result, persisted }) => {
  const res = await fetch("/api/narrative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persisted && resultId ? { resultId } : { result }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()).narrative;
};
