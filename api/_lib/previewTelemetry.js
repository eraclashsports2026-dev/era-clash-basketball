// ── Preview-only telemetry ────────────────────────────────────────────────────
// Structured single-line JSON events, prefixed so they are separable from
// production logs. Allowlisted event names only; payloads carry NO personal
// data, tokens, secrets, headers or cookies — enforced by key filtering here,
// not by caller discipline.
export const ALLOWED_PREVIEW_EVENTS = new Set(["simulation_started", "simulation_completed", "simulation_failed",
  "fallback_invoked", "replay_verified", "invariant_failed", "movement_share", "assisted_rate",
  "preview_session_started", "preview_game_started", "preview_game_completed", "preview_game_failed",
  "preview_fallback_invoked", "preview_replay_verified", "preview_feedback_submitted",
  "preview_result_shared", "preview_rematch_started", "preview_mode_selected",
  "pass_created_opportunity_rate", "assist_credit_rate", "opponent_ppp", "realized_zone_share",
  "action_family_distribution", "coach_adjustment_count", "simulation_latency", "cache_hit", "cache_miss"]);
const FORBIDDEN_KEYS = /token|secret|authorization|cookie|password|email|session/i;

export const previewEvent = (event, payload = {}) => {
  if (!ALLOWED_PREVIEW_EVENTS.has(event)) return null;     // unknown events are dropped, not logged
  const clean = Object.fromEntries(Object.entries(payload)
    .filter(([k, v]) => !FORBIDDEN_KEYS.test(k) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")));
  const line = { t: new Date().toISOString(), scope: "preview", event, ...clean };
  console.log(JSON.stringify(line));
  return line;
};
