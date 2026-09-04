// ── The lobby's adaptive hero (Phase 9A.3P) ──────────────────────────────────
// One pure decision, made from EXISTING product state before the first paint:
//
//   full                 a genuine first-time state — no remembered run, no
//                        finished game on this device, and this device has not
//                        been here before
//   compact-active-run   this browser remembers an unfinished Chaos run; the
//                        Continue card is the top action, the grid moves up
//   compact-returning    this device has played (or has been here) before
//
// Nothing here writes storage, sets a cookie, starts or deletes a run, reads a
// server, or reveals anything about a run. The inputs are the same values the
// lobby, the career store and the analytics identity already read, so deciding
// the hero adds no tracking. Because the decision is synchronous the hero is
// painted in its final size on the first frame — no layout shift when a run
// lookup resolves later.
import { RUN_KEY } from "./runStorage.js";

export const HERO_STATES = Object.freeze({ FULL: "full", COMPACT_ACTIVE_RUN: "compact-active-run", COMPACT_RETURNING: "compact-returning" });
export const HERO_STATE_IDS = Object.freeze(Object.values(HERO_STATES));

/** The one decision, from plain inputs (testable without a browser). */
export const resolveHeroState = ({ hasRememberedRun = false, gamesPlayed = 0, recentGames = 0, returningDevice = false } = {}) => {
  if (hasRememberedRun) return HERO_STATES.COMPACT_ACTIVE_RUN;
  if ((Number(gamesPlayed) || 0) > 0 || (Number(recentGames) || 0) > 0 || returningDevice) return HERO_STATES.COMPACT_RETURNING;
  return HERO_STATES.FULL;
};

const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const json = (k, d) => { try { return JSON.parse(ls(k)) ?? d; } catch { return d; } };

/**
 * Read the inputs the browser already holds. `returningDevice` is the same flag
 * src/identity.js derives for `returning_session` (ec_seen existed before this
 * tab). It is passed in rather than read here so the caller can hand over the
 * session's memoised value — reading ec_seen after boot would call every
 * first-time visitor returning.
 */
export const readHeroInputs = ({ returningDevice = false } = {}) => {
  const career = json("ec_career", {});
  const recent = json("ec_recent", []);
  return {
    hasRememberedRun: !!ls(RUN_KEY),
    gamesPlayed: Number(career?.gamesPlayed) || 0,
    recentGames: Array.isArray(recent) ? recent.length : 0,
    returningDevice: !!returningDevice,
  };
};

export const readHeroState = (opts) => resolveHeroState(readHeroInputs(opts));

/** The one concise line each compact state carries; the full hero keeps the product line. */
export const HERO_LINE = Object.freeze({
  "compact-active-run": "Your Chaos Clash is waiting. Pick it up, or choose another way to play.",
  "compact-returning": "Welcome back. Choose how you want to play.",
});
