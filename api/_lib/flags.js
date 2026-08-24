// ── Feature flags + emergency controls ─────────────────────────────────────────
// Server-side env-driven kill switches. Each subsystem can be disabled
// independently instead of taking down the app. Client never controls these.
//
// Flag                        Default  Off-behavior
// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE_MODE            false    All mutations 503 MAINTENANCE; reads OK
// AI_NARRATIVE_ENABLED        true     /api/narrative 503; fallback recap only
// CHALLENGES_ENABLED          true     challenge create/complete disabled
// DAILY_ENABLED               true     daily claims/board disabled
// PUBLIC_LEADERBOARD_ENABLED  true     daily board reads return empty
// FEEDBACK_ENABLED            true     /api/feedback no-ops
// USE_ENGINE_SEASON           true     (client build flag — see src/versions.js)
//
// Rollback: unset the env var (or set to "true") and redeploy — no data change.
const bool = (name, dflt) => {
  const v = process.env[name];
  if (v == null || v === "") return dflt;
  return !["false", "0", "off", "no"].includes(String(v).toLowerCase());
};

export const flags = () => ({
  maintenance: bool("MAINTENANCE_MODE", false),
  // V3 possession engine: default OFF. Auto-enabled on Vercel PREVIEW
  // deployments only — production traffic never sees V3 unless the env var is
  // explicitly set (and this branch is never merged without approval).
  // V3 possession engine: LIVE by default everywhere (CEO go, 2026-08-24).
  // Kill switch: set SIM_ENGINE_V3_ENABLED=false in Vercel env and redeploy —
  // the V2 engine remains in the codebase as the instant fallback path.
  simV3: bool("SIM_ENGINE_V3_ENABLED", true),
  aiNarrative: bool("AI_NARRATIVE_ENABLED", true),
  challenges: bool("CHALLENGES_ENABLED", true),
  daily: bool("DAILY_ENABLED", true),
  leaderboard: bool("PUBLIC_LEADERBOARD_ENABLED", true),
  feedback: bool("FEEDBACK_ENABLED", true),
});

// Numeric limits (all overridable per environment; safe defaults).
// 0 is VALID — it is the emergency "fully disable" setting for a limit.
const num = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};

export const limits = () => ({
  // per-session / per-IP fixed windows
  simPerMinSession: num("RL_SIM_PER_MIN_SESSION", 10),
  simPerMinIp: num("RL_SIM_PER_MIN_IP", 20),
  narrativePerMinSession: num("RL_NARRATIVE_PER_MIN_SESSION", 6),
  challengePerMinIp: num("RL_CHALLENGE_PER_MIN_IP", 30),
  feedbackPerMinIp: num("RL_FEEDBACK_PER_MIN_IP", 20),
  eventsPerMinIp: num("RL_EVENTS_PER_MIN_IP", 120),
  profilePerMinIp: num("RL_PROFILE_PER_MIN_IP", 20),
  // global emergency ceilings (fixed 1-minute / 1-day windows)
  maxCoreSimsPerMinute: num("MAX_CORE_SIMULATIONS_PER_MINUTE", 600),
  maxAiPerMinute: num("MAX_AI_REQUESTS_PER_MINUTE", 60),
  maxAiPerDay: num("MAX_AI_REQUESTS_PER_DAY", 5000),
  // circuit breaker
  aiFailThreshold: num("AI_CIRCUIT_FAIL_THRESHOLD", 5),
  aiCircuitWindowSec: num("AI_CIRCUIT_WINDOW_SEC", 120),
  aiTimeoutMs: num("AI_TIMEOUT_MS", 20000),
});
