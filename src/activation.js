// ── Activation instrumentation ──────────────────────────────────────────────
// The first five minutes, measured: when the lobby was seen, when a mode was
// chosen, and how long a session took to reach its first roll. Everything here
// rides the existing analytics wrapper and the server's allowlist (api/events.js);
// an event named in one place and not the other is instrumentation that
// silently does nothing, so the contract test pins both lists together.
//
// No PII, no keys, no free text. Timings are milliseconds and a coarse bucket.
import { track } from "./analytics.js";

export const ACTIVATION_EVENTS = Object.freeze([
  "play_lobby_viewed",
  "play_mode_selected",
  "active_run_continue_clicked",
  "active_run_abandon_started",
  "active_run_abandoned",
  "active_run_expired_shown",
  "account_gate_shown",
  "membership_gate_shown",
  "dream_player_selected",
  "eligible_position_choice_shown",
  "dream_player_placed",
  "dream_player_auto_placed",
  "dream_player_swap_completed",
  "dream_player_placement_undone",
  "time_to_first_roll_recorded",
  // Phase 9A.3 Wave 2 study additions (mirrored in api/events.js and src/wave2.js).
  "time_to_mode_selection_recorded",
  "chaos_roll_completed", "chaos_era_revealed", "chaos_coach_selected", "chaos_game_completed",
  "result_tab_opened", "new_clash_started",
  // Phase 9B.1 real accounts and cloud career (mirrored in api/events.js).
  // Metadata is a closed vocabulary: authMethod, entryPoint, mode, success,
  // resultPresent, claimCountBucket and a failureCode — never an email, a
  // name, a token, a cookie or a stack.
  "account_signup_started", "account_signup_completed",
  "account_signin_started", "account_signin_completed", "account_signout_completed",
  "guest_result_claim_started", "guest_result_claim_completed", "guest_history_imported",
  "cloud_result_save_started", "cloud_result_save_completed", "cloud_result_save_failed",
  "my_eraclash_viewed", "recent_clash_expanded", "saved_report_opened", "display_name_updated",
  // Phase 9B.2 My EraClash Career V2
  "career_history_viewed", "career_filter_changed", "saved_clash_favorited",
  "roster_saved", "roster_renamed", "roster_deleted", "roster_favorited",
  "run_it_back_started", "exact_replay_started",
  "device_reconciliation_viewed", "device_history_imported",
  "account_export_started", "account_export_completed",
  "account_deletion_started", "account_deletion_cancelled", "account_deletion_completed",
  "reauthentication_completed", "preference_updated",
  // Phase 9B.3 Chaos Clash guided flow. Mirrored by ACTIVATION_EVENTS; the same
  // contract test pins the two lists together. Properties are the six state
  // names, roll numbers, era ids and action names — never free text.
  "chaos_state_viewed", "chaos_primary_action",
  "era_reveal_viewed", "era_reveal_continued",
  "coach_chaos_viewed", "coach_offer_selected",
  "clash_ready_viewed", "run_clash_started", "result_state_viewed",
  "live_intel_expanded", "era_rules_expanded",
  // Phase 9C — Challenges + Persistent Competitive Identity V1 (closed vocabulary;
  // metadata may carry challengeVersion, authState, entryPoint, status, mode,
  // success, failureCode — never a name, a code, an id, a payload, a seed or a token)
  "challenge_created", "challenge_link_copied", "challenge_share_invoked", "challenge_opened",
  "challenge_accept_started", "challenge_attempt_started", "challenge_attempt_completed",
  "challenge_comparison_viewed", "challenge_revoked", "challenge_expired_viewed",
]);

const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, String(v)); } catch { /* storage blocked */ } },
};
const ENTRY_AT = "ec_entry_at";
const LOBBY_AT = "ec_lobby_at";
const FIRST_ROLL = "ec_first_roll_recorded";

/** Called once at app boot: the clock the first roll is measured against. */
export const markEntry = () => { if (!ss.get(ENTRY_AT)) ss.set(ENTRY_AT, Date.now()); };

// Phase 9A.3P: the SAME allowlisted event carries two bounded presentation
// properties — which lobby presentation was shown and which hero state resolved
// (full · compact-active-run · compact-returning). No new event, no free text.
const HERO_STATE_SHAPE = /^(full|compact-active-run|compact-returning)$/;
export const markLobbyViewed = ({ hasActiveRun = false, route = "/play", heroState = null, lobbyPresentationVersion = null } = {}) => {
  if (!ss.get(LOBBY_AT)) ss.set(LOBBY_AT, Date.now());
  const props = { has_active_run: !!hasActiveRun, route };
  if (HERO_STATE_SHAPE.test(String(heroState))) props.hero_state = heroState;
  if (/^[a-z0-9-]{1,40}$/.test(String(lobbyPresentationVersion))) props.lobby_presentation_version = lobbyPresentationVersion;
  track("play_lobby_viewed", props);
};

const MODE_CHOSEN = "ec_mode_chosen_recorded";
export const markModeSelected = (mode, action, from = "lobby") => {
  track("play_mode_selected", { mode_id: mode?.id || null, status: action?.status || null, intent: action?.intent || null, from });
  // Once per session: how long the lobby was open before the first mode choice.
  if (!ss.get(MODE_CHOSEN)) {
    ss.set(MODE_CHOSEN, "1");
    const lobbyAt = Number(ss.get(LOBBY_AT)) || Number(ss.get(ENTRY_AT)) || Date.now();
    const ms = Math.max(0, Date.now() - lobbyAt);
    track("time_to_mode_selection_recorded", { ms, bucket: bucketMs(ms), mode_id: mode?.id || null });
  }
};

export const bucketMs = (ms) => (ms < 10_000 ? "<10s" : ms < 30_000 ? "10-30s" : ms < 60_000 ? "30-60s" : ms < 180_000 ? "1-3m" : ">3m");

/** Once per session, when the first ROLL 1 is pressed. */
export const recordFirstRoll = () => {
  if (ss.get(FIRST_ROLL)) return null;
  ss.set(FIRST_ROLL, "1");
  const now = Date.now();
  const lobbyAt = Number(ss.get(LOBBY_AT)) || 0;
  const entryAt = Number(ss.get(ENTRY_AT)) || now;
  const from = lobbyAt ? "lobby" : "direct";
  const ms = Math.max(0, now - (lobbyAt || entryAt));
  const props = { ms, bucket: bucketMs(ms), from };
  track("time_to_first_roll_recorded", props);
  return props;
};
