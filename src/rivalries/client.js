// ── Rivalries V1: the browser side ───────────────────────────────────────────
// Thin calls to the account route's Rivalry actions. The body carries opaque
// handles only: an attempt the caller took part in, a rivalry the caller is a
// member of. Nothing here decides anything; the database does, under the pair
// lock, after the server verified the bearer.
import { RIVALRY_CONTEXT_KEY } from "./contract.js";

const post = async (body, accessToken) => {
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

export const requestRivalryRequest = ({ attemptId, accessToken }) => post({ action: "rivalry-request", attemptId }, accessToken);
export const respondRivalryRequest = ({ rivalryId, rivalryAction, accessToken }) => post({ action: "rivalry-respond", rivalryId, rivalryAction }, accessToken);
export const listRivalriesRequest = ({ accessToken }) => post({ action: "rivalry-list" }, accessToken);
export const rivalryDetailRequest = ({ rivalryId, accessToken, limit, offset = 0 }) => post({ action: "rivalry-detail", rivalryId, ...(limit ? { limit } : {}), offset }, accessToken);

// ── Challenge Again context (session memory) ─────────────────────────────────
// Which Rivalry a fresh Chaos Clash is being played for, so the result surface
// can say who the invitation is meant for. The Challenge link itself is the
// ordinary governed link: the server enrols the comparison from the two
// accounts, never from this note.
export const rememberRivalryContext = ({ rivalryId, opponentName }) => {
  try { sessionStorage.setItem(RIVALRY_CONTEXT_KEY, JSON.stringify({ rivalryId: String(rivalryId), opponentName: String(opponentName || "").slice(0, 24), at: Date.now() })); } catch { /* private mode */ }
};
export const rivalryContext = () => {
  try { const v = JSON.parse(sessionStorage.getItem(RIVALRY_CONTEXT_KEY) || "null"); return v && v.rivalryId && Date.now() - (v.at || 0) < 6 * 3600_000 ? v : null; } catch { return null; }
};
export const forgetRivalryContext = () => { try { sessionStorage.removeItem(RIVALRY_CONTEXT_KEY); } catch { /* private mode */ } };
