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

export const markLobbyViewed = ({ hasActiveRun = false, route = "/play" } = {}) => {
  if (!ss.get(LOBBY_AT)) ss.set(LOBBY_AT, Date.now());
  track("play_lobby_viewed", { has_active_run: !!hasActiveRun, route });
};

export const markModeSelected = (mode, action, from = "lobby") =>
  track("play_mode_selected", { mode_id: mode?.id || null, status: action?.status || null, intent: action?.intent || null, from });

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
