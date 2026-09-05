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
import { previewIdentity } from "./_lib/previewAccessCheck.js";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { WAVE2, WAVE2_TELEMETRY_EVENTS, cohortOf } from "../src/wave2.js";

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
  // Phase 9A activation (Play Lobby, active-run continuation, Dream Matchup
  // placement). Mirrored by ACTIVATION_EVENTS in src/activation.js; a contract
  // test pins the two lists together. Properties are ids, statuses, counts and
  // millisecond timings — never an email, key, cookie, token, IP or free text.
  "play_lobby_viewed", "play_mode_selected",
  "active_run_continue_clicked", "active_run_abandon_started", "active_run_abandoned", "active_run_expired_shown",
  "account_gate_shown", "membership_gate_shown",
  "dream_player_selected", "eligible_position_choice_shown",
  "dream_player_placed", "dream_player_auto_placed", "dream_player_swap_completed", "dream_player_placement_undone",
  "time_to_first_roll_recorded",
  // Phase 9A.3 Wave 2 activation study (src/wave2.js WAVE2_TELEMETRY_EVENTS;
  // a test pins the two lists together). preview_fallback_invoked is emitted by
  // the SERVER (api/game.js) and counted there; it is not a client event.
  "time_to_mode_selection_recorded",
  "chaos_roll_completed", "chaos_era_revealed", "chaos_coach_selected", "chaos_game_completed",
  "result_tab_opened", "new_clash_started",
  // Phase 9B.1 real accounts and cloud career. Mirrored by ACTIVATION_EVENTS in
  // src/activation.js; a contract test pins the two lists together. No event
  // here carries an email, a name, a token, a cookie or a free-form string.
  "account_signup_started", "account_signup_completed",
  "account_signin_started", "account_signin_completed", "account_signout_completed",
  "guest_result_claim_started", "guest_result_claim_completed", "guest_history_imported",
  "cloud_result_save_started", "cloud_result_save_completed", "cloud_result_save_failed",
  "my_eraclash_viewed", "recent_clash_expanded", "saved_report_opened", "display_name_updated",
  // Phase 9B.2 My EraClash Career V2. Mirrored by ACTIVATION_EVENTS; the same
  // contract test pins the two lists together. Properties are ids, modes,
  // counts, states and booleans — never a name, an email, a token, a code, an
  // export's contents or a deleted account's contents.
  "career_history_viewed", "career_filter_changed", "saved_clash_favorited",
  "roster_saved", "roster_renamed", "roster_deleted", "roster_favorited",
  "run_it_back_started", "exact_replay_started",
  "device_reconciliation_viewed", "device_history_imported",
  "account_export_started", "account_export_completed",
  "account_deletion_started", "account_deletion_cancelled", "account_deletion_completed",
  "reauthentication_completed", "preference_updated",
]);
export const EVENTS_ALLOWLIST = ALLOWED;

// Phase 9A.3: durable, PARTITIONED counters for the Wave 2 study. The partition
// (wave, cohort, tester, build) comes from the signed session and the event's
// build field — never from a client-supplied identity. No counter mixes waves.
const BUILD_SHAPE = /^[a-z0-9]{6,12}$/;
export const wave2PartitionKey = (waveId, cohort, testerId, build) => `wave2-metrics:${waveId}:${cohort ?? "unknown"}:${testerId}:${BUILD_SHAPE.test(String(build)) ? build : "unknown"}`;

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
  const wave2 = PREVIEW_ACCESS.waveId === WAVE2.waveId ? await previewIdentity(req.headers).catch(() => ({ ok: false })) : { ok: false };
  const study = new Set(WAVE2_TELEMETRY_EVENTS);
  for (const e of events) {
    if (!e || typeof e.event !== "string" || !ALLOWED.has(e.event)) continue;
    const clean = JSON.stringify(e);
    if (clean.length > MAX_EVENT_BYTES) continue;
    cmds.push(["LPUSH", `an:log:${day}`, clean]);
    cmds.push(["HINCRBY", `an:counts:${day}`, e.event, 1]);
    if (e.uid) cmds.push(["PFADD", `an:uniq:${day}:${e.event}`, e.uid]);
    if (wave2.ok && study.has(e.event)) {
      const cohort = wave2.cohort ?? cohortOf(wave2.testerId);
      cmds.push(["HINCRBY", wave2PartitionKey(WAVE2.waveId, cohort, wave2.testerId, e.build), e.event, 1]);
      cmds.push(["HINCRBY", `wave2-metrics:events:${WAVE2.waveId}`, e.event, 1]);
      if ((e.event === "time_to_mode_selection_recorded" || e.event === "time_to_first_roll_recorded") && Number.isFinite(e.ms) && e.ms >= 0 && e.ms < 3_600_000) {
        cmds.push(["LPUSH", `wave2-metrics:timing:${WAVE2.waveId}:${e.event}`, Math.round(e.ms)]);
        cmds.push(["LTRIM", `wave2-metrics:timing:${WAVE2.waveId}:${e.event}`, 0, 999]);
      }
    }
  }
  if (cmds.length) {
    cmds.push(["LTRIM", `an:log:${day}`, 0, 49999]);
    cmds.push(["EXPIRE", `an:log:${day}`, 60 * 60 * 24 * 14]);
    cmds.push(["EXPIRE", `an:counts:${day}`, 60 * 60 * 24 * 400]);
    await pipeline(cmds);
  }
  return res.status(204).end();
}
