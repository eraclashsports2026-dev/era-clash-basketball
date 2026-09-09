// ── Public Competitive Profiles V1: the browser side ─────────────────────────
// Phase 9F. Thin calls to the account route's profile actions. A public profile
// is fetched by SLUG and by nothing else; the owner's own state needs the
// bearer. Visibility is a PREFERENCE, written through the existing 9B.2 path
// under RLS (closed vocabulary) — never through a profile endpoint, so a
// browser can only ever change its own.
//
// Nothing here decides what a public profile may say: the server sends the
// projection it is allowed to send, and these functions pass it through.
import { withProvider } from "../accounts/provider.js";
import {
  PROFILE_VISIBILITY, PROFILE_VISIBILITY_PREF_KEY, PROFILE_VISIBILITY_DEFAULT,
  profileVisibilityFrom, isSlug, profilePath, profileUrl,
} from "./contract.js";

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

/** A public profile by slug. Readable signed out; a private or unknown slug answers found:false. */
export const publicProfileRequest = ({ slug, accessToken = null } = {}) => post({ action: "profile-public", slug }, accessToken);
/** The account's own profile state, including its slug and both visibility settings. */
export const profileMeRequest = ({ accessToken }) => post({ action: "profile-me" }, accessToken);
/** Links for the rows the public leaderboard already shows: { rank: slug }. */
export const boardLinksRequest = ({ accessToken = null } = {}) => post({ action: "profile-board-links" }, accessToken);
/** Replace the featured showcase. The server judges unlock state; an empty array clears it. */
export const setFeaturedRequest = ({ featured, accessToken }) => post({ action: "profile-featured-set", featured }, accessToken);

export { profileVisibilityFrom, isSlug, profilePath, profileUrl };

/** Change profile visibility — the approved preference path, merged so nothing else is dropped. */
export const setProfileVisibility = async (visibility, currentPrefs = null) => {
  if (!PROFILE_VISIBILITY.includes(visibility)) throw Object.assign(new Error("PROFILE_VISIBILITY_INVALID"), { code: "PROFILE_VISIBILITY_INVALID" });
  const base = currentPrefs ?? (await withProvider((p) => p.getPreferences(), {})) ?? {};
  const saved = await withProvider((p) => p.setPreferences({ ...base, [PROFILE_VISIBILITY_PREF_KEY]: visibility }), null);
  return saved ? profileVisibilityFrom(saved) : visibility;
};

/**
 * Share a profile link. Native share where the browser offers it, clipboard
 * otherwise, and the link itself last — no social SDK, no tracking parameter,
 * and nothing about the viewer in the URL. Returns how it was shared so the
 * caller can say the right thing.
 */
export const shareProfile = async ({ slug, displayName = null, origin = null } = {}) => {
  const url = profileUrl(origin ?? (typeof window !== "undefined" ? window.location.origin : null), slug);
  if (!url) return { ok: false, method: "none" };
  const title = displayName ? `${displayName} on EraClash` : "EraClash competitive profile";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return { ok: true, method: "native", url };
    }
  } catch (e) {
    // a cancelled share is not a failure, and it is not a reason to fall through
    if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return { ok: false, method: "native_cancelled", url };
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: "clipboard", url };
    }
  } catch { /* fall through to showing the link */ }
  return { ok: false, method: "manual", url };
};
