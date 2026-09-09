// ── Competitive Rating V1: the browser side ──────────────────────────────────
// Thin calls to the account route's competitive actions. The leaderboard is
// readable signed out; a user's own rating and the rows around them need the
// bearer. Visibility is a PREFERENCE, written through the existing 9B.2 path
// under RLS (closed vocabulary) — never through a competitive endpoint. Nothing
// here computes a rating; the database does.
import { withProvider } from "../accounts/provider.js";
import { VISIBILITY, VISIBILITY_PREF_KEY, VISIBILITY_DEFAULT } from "./contract.js";

const post = async (body, accessToken = null) => {
  const r = await fetch("/api/profile", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", Accept: "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!data) throw new Error(`HTTP ${r.status}`);
  return { httpStatus: r.status, ...data };
};

export const leaderboardRequest = ({ accessToken = null } = {}) => post({ action: "competitive-leaderboard" }, accessToken);
export const competitiveMeRequest = ({ accessToken }) => post({ action: "competitive-me" }, accessToken);
export const aroundMeRequest = ({ accessToken }) => post({ action: "competitive-around-me" }, accessToken);

/** Read the visibility preference (private unless the account chose public). */
export const visibilityFrom = (prefs) => (prefs?.[VISIBILITY_PREF_KEY] === "public" ? "public" : VISIBILITY_DEFAULT);
/** Change it — the approved preference path, merged with the account's other preferences. */
export const setLeaderboardVisibility = async (visibility, currentPrefs = null) => {
  if (!VISIBILITY.includes(visibility)) throw Object.assign(new Error("VISIBILITY_INVALID"), { code: "VISIBILITY_INVALID" });
  // merged with the account's other preferences, so a visibility change never drops one
  const base = currentPrefs ?? (await withProvider((p) => p.getPreferences(), {})) ?? {};
  const saved = await withProvider((p) => p.setPreferences({ ...base, [VISIBILITY_PREF_KEY]: visibility }), null);
  return saved ? visibilityFrom(saved) : visibility;
};
