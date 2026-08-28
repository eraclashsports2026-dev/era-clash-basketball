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

import { PREVIEW_ENV } from "../../config/previewEnv.js";

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
  // Daily coach + Era Style integration. DEFAULT OFF everywhere. When off, the
  // Daily behaves exactly as it does today, which is the rollback path: no
  // coach selection, no official era, server-generated seed.
  dailyCoachEra: bool("DAILY_COACH_ERA_ENABLED", false),
  // Possession Engine 1.0. Its own explicit flag — deliberately NOT folded
  // into SIM_ENGINE_V3_ENABLED, which already means too many things. Default
  // false: no production route may select the possession engine.
  possessionEngine: bool("POSSESSION_ENGINE_ENABLED", false),
  // Defensive matchup engine. Its own flag again — the possession engine can
  // run without it, and that A/B is how the defensive system is measured.
  defensiveMatchupEngine: bool("DEFENSIVE_MATCHUP_ENGINE_ENABLED", false),
  // Phase 6B2. Three separate flags because they are three separate systems
  // and the A/B comparisons need them independently switchable.
  zoneResolution: bool("ZONE_RESOLUTION_ENABLED", false),
  expandedOffensiveActions: bool("EXPANDED_OFFENSIVE_ACTIONS_ENABLED", false),
  offensiveCoachAdjustments: bool("OFFENSIVE_COACH_ADJUSTMENTS_ENABLED", false),
  // Phase 6C2A. Its own flag for the same reason: the structural before/after
  // is only measurable if allocation can be switched independently of the
  // families that consume it.
  opportunityAllocation: bool("OPPORTUNITY_ALLOCATION_ENABLED", false),
  // Protected preview: the LOCKED preview candidate (Candidate 3, possession
  // engine line) behind its own default-off flag. When false — the default in
  // every environment — no code path differs from production behavior, and
  // engine 3.2.0 remains the fallback for every request even when true.
  // An explicit PREVIEW_SIM_ENGINE_ENABLED always wins; otherwise Vercel
  // Preview deployments read the repository preview config (production and
  // local runs ignore it — the default stays false).
  previewSimEngine: process.env.PREVIEW_SIM_ENGINE_ENABLED != null && process.env.PREVIEW_SIM_ENGINE_ENABLED !== ""
    ? bool("PREVIEW_SIM_ENGINE_ENABLED", false)
    : (process.env.VERCEL_ENV === "preview" && PREVIEW_ENV.previewSimEngine === true),
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
  // A single recap generation runs ~20-25s, so one attempt gets 34s (a lower
  // cap made attempt 1 abort every time and doubled the user's wait). The
  // total budget stays under vercel.json maxDuration (60s) so a hard failure
  // still returns a handled error rather than a platform 504.
  aiTimeoutMs: num("AI_TIMEOUT_MS", 34000),
  aiTotalBudgetMs: num("AI_TOTAL_BUDGET_MS", 50000),
});
