// ── Progression V1: the browser side ─────────────────────────────────────────
// Thin calls to the account route's progression actions, plus the one piece
// of browser memory the postgame needs: what an authoritative result earned,
// keyed by result id, so a reload shows the same "+125 XP" without asking the
// server to award anything again. Nothing here decides XP; the server does.
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

/** The account's progression, reconciled as it is read. Account only. */
export const progressionGetRequest = ({ accessToken }) => post({ action: "progression-get" }, accessToken);
export const progressionReconcileRequest = ({ accessToken }) => post({ action: "progression-reconcile" }, accessToken);

// ── What a result earned, remembered per result id ──────────────────────────
const KEY = "ec_progression_last";
const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
export const rememberProgression = (resultId, outcome) => {
  if (!resultId || !outcome) return;
  try {
    const all = readAll();
    const keep = Object.fromEntries(Object.entries(all).slice(-4));   // a handful of recent results, never a history
    keep[resultId] = { ...outcome, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch { /* private mode or quota: the in-memory value still shows */ }
};
export const progressionFor = (resultId) => { const all = readAll(); return resultId && all[resultId] ? all[resultId] : null; };
export const forgetProgression = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

/**
 * One result can earn in two server calls — the career save, then a challenge
 * completion — and the postgame shows them as one block: deltas add, the level
 * before is the earliest before, the level after is the latest after.
 */
export const mergeProgression = (prev, next) => {
  if (!next) return prev || null;
  if (next.status !== "ok") return prev && prev.status === "ok" ? prev : next;
  if (!prev || prev.status !== "ok") return next;
  const before = prev.before || next.before;
  return {
    status: "ok",
    xpDelta: (prev.xpDelta || 0) + (next.xpDelta || 0),
    awarded: [...(prev.awarded || []), ...(next.awarded || [])],
    unlocked: [...(prev.unlocked || []), ...(next.unlocked || []).filter((u) => !(prev.unlocked || []).some((p) => p.id === u.id))],
    before, after: next.after,
    levelUp: (next.after?.level || 1) > (before?.level || 1), levelsGained: (next.after?.level || 1) - (before?.level || 1),
    summary: next.summary || prev.summary,
  };
};

export const formatXp = (n) => (Number(n) || 0).toLocaleString("en-US");
