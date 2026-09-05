// ── Challenges V1: the browser side ──────────────────────────────────────────
// Thin calls to the account route's challenge actions, plus the one piece of
// browser memory the flow needs: which Chaos run is a challenge attempt, so
// the CHALLENGE MODE badge and the completion step survive a reload. Nothing
// here decides anything; the server does.
import { normalizeCode, invitationUrl } from "./contract.js";

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

export const createChallengeRequest = ({ chaosRunId, accessToken }) => post({ action: "challenge-create", chaosRunId }, accessToken);
export const viewChallengeRequest = ({ code, accessToken = null }) => post({ action: "challenge-view", code: normalizeCode(code) }, accessToken);
export const acceptChallengeRequest = ({ code, accessToken = null, tier = "GUEST" }) => post({ action: "challenge-accept", code: normalizeCode(code), tier }, accessToken);
export const completeChallengeRequest = ({ chaosRunId, accessToken = null }) => post({ action: "challenge-complete", chaosRunId }, accessToken);
export const revokeChallengeRequest = ({ code, accessToken }) => post({ action: "challenge-revoke", code: normalizeCode(code) }, accessToken);
export const listChallengesRequest = ({ accessToken }) => post({ action: "challenge-list" }, accessToken);

export const challengeLink = (code) => invitationUrl(window.location.origin, code);
export const shareText = () => "I challenged you in EraClash. Think you can build a better five?";

// ── Which run is a challenge attempt ─────────────────────────────────────────
const KEY = "ec_chaos_challenge";
export const rememberChallengeRun = ({ chaosRunId, code, creatorName }) => {
  try { localStorage.setItem(KEY, JSON.stringify({ chaosRunId, code: normalizeCode(code), creatorName: String(creatorName || "").slice(0, 24), at: Date.now() })); } catch { /* private mode */ }
};
export const challengeForRun = (chaosRunId) => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && chaosRunId && v.chaosRunId === chaosRunId ? v : null;
  } catch { return null; }
};
export const anyChallengeRun = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
export const forgetChallengeRun = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

/** Copy with a fallback for browsers that refuse the async clipboard. */
export const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
};
export const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
