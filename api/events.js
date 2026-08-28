// ── Analytics ingest ───────────────────────────────────────────────────────────
// Accepts batched events from src/analytics.js. Stored two ways when a store
// is configured:
//   1. Raw event log:  LPUSH  an:log:{yyyymmdd}   (capped, 14-day TTL)
//   2. Daily counters: HINCRBY an:counts:{yyyymmdd} {event}
//   3. Daily uniques:  PFADD  an:uniq:{yyyymmdd}:{event} {uid}  (HyperLogLog)
// Counters + uniques answer the core funnel questions (draft start rate, games
// per user, second-game rate, share rate...) without a vendor. Without a store
// this endpoint is a silent 204 no-op.
import { hasStore, pipeline, rateLimit, clientIp, dayKey } from "./_lib/store.js";
import { sameOrigin } from "./_lib/session.js";

const ALLOWED = new Set([
  "session_started", "returning_session",
  "draft_started", "player_option_shown", "player_selected", "reroll_used",
  "draft_completed", "draft_abandoned",
  "simulation_started", "simulation_completed", "simulation_failed",
  "second_game_started", "rematch_started", "best_of_7_started", "swap_one_started",
  "daily_challenge_started", "daily_challenge_completed", "daily_challenge_failed", "daily_result_shared",
  // Coach/Era Daily (Phase 5D). Anything not named here is dropped, so an
  // event added to the client without a line here is instrumentation that
  // silently does nothing.
  "daily_config_loaded", "daily_era_viewed", "daily_coach_options_viewed",
  "daily_coach_selected", "daily_started", "daily_completed",
  "daily_invalid_coach", "daily_invalid_era", "daily_version_mismatch",
  "challenge_created", "challenge_link_opened", "challenge_started", "challenge_completed",
  "challenge_won", "challenge_lost", "challenge_rematch_started",
  "share_initiated", "share_completed", "share_failed",
  "result_created", "shared_link_opened",
  "pwa_install_prompt_shown", "pwa_installed",
  "frontend_error", "simulation_error",
  "feedback_submitted", "account_claimed", "preview_scenario_loaded",
]);

const MAX_BATCH = 50;
const MAX_EVENT_BYTES = 2000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOrigin(req)) return res.status(204).end(); // drop cross-origin noise silently

  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, MAX_BATCH) : [];
  if (!events.length) return res.status(204).end();
  if (!hasStore()) return res.status(204).end(); // instrumentation is best-effort

  if (!(await rateLimit(`ev:${clientIp(req)}`, 120, 60))) return res.status(204).end();

  const day = dayKey();
  const cmds = [];
  for (const e of events) {
    if (!e || typeof e.event !== "string" || !ALLOWED.has(e.event)) continue;
    const clean = JSON.stringify(e);
    if (clean.length > MAX_EVENT_BYTES) continue;
    cmds.push(["LPUSH", `an:log:${day}`, clean]);
    cmds.push(["HINCRBY", `an:counts:${day}`, e.event, 1]);
    if (e.uid) cmds.push(["PFADD", `an:uniq:${day}:${e.event}`, e.uid]);
  }
  if (cmds.length) {
    cmds.push(["LTRIM", `an:log:${day}`, 0, 49999]);
    cmds.push(["EXPIRE", `an:log:${day}`, 60 * 60 * 24 * 14]);
    cmds.push(["EXPIRE", `an:counts:${day}`, 60 * 60 * 24 * 400]);
    await pipeline(cmds);
  }
  return res.status(204).end();
}
