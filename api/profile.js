// ── Cloud career persistence (session-keyed) ───────────────────────────────────
// v2.3: profiles are keyed by the HttpOnly cookie session — the browser can no
// longer name an arbitrary uid and read or overwrite someone else's career.
// A one-time legacy migration claims the old localStorage-uid profile into the
// session profile (first session to claim wins; the claim is atomic).
//
// Honest scope: career stats are self-reported gameplay history for the
// player's own dashboard. Public/competitive records (daily board, challenge
// rivalries) are server-computed in /api/game and never read from here.
import { hasStore, getJSON, setJSON, setNX, rateLimit, clientIp } from "./_lib/store.js";
import { getOrCreateSession, sameOrigin } from "./_lib/session.js";
import { sendError, newRequestId } from "./_lib/errors.js";
import { flags, limits } from "./_lib/flags.js";
import { tooLarge, cleanName, cleanText } from "./_lib/validate.js";
// Phase 9B.1: the authoritative cloud-career path lives here rather than in a
// new route — the deployment's serverless function budget is full at 13, so
// real accounts reuse the route that already owns career persistence.
import {
  cloudAccountsServerStatus, cloudAccountsReady, verifyAccountToken,
  claimAndSaveResult, importDeviceHistory, countEligibleForImport,
  CANDIDATE_ID_SHAPE, MAX_IMPORT_CANDIDATES,
} from "./_lib/cloudAccounts.js";

const KEY = (sid) => `profile:${sid}`;
const RESULT_ID_SHAPE = CANDIDATE_ID_SHAPE;
const CLOUD_ACTIONS = new Set(["cloud-save", "claim-result", "import-device-history", "import-preview"]);

/** The bearer token, from the header only — never from a logged request body. */
const bearer = (req) => {
  const h = String(req.headers?.authorization || "");
  return /^Bearer .+/.test(h) ? h.slice(7).trim() : "";
};
const stamp = (req) => {
  const v = String(req.body?.buildStamp || "");
  return /^[\w.:-]{1,64}$/.test(v) ? v : null;
};
const LEGACY_KEY = (uid) => `pf:${uid}`;
const MAX_BYTES = 30_000;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const sanitize = (p = {}) => ({
  v: 2,
  name: cleanName(p.name),
  created_at: num(p.created_at) || Date.now(),
  updated_at: Date.now(),
  stats: {
    gamesPlayed: num(p.stats?.gamesPlayed),
    wins: num(p.stats?.wins),
    losses: num(p.stats?.losses),
    bestWin82: Math.min(82, num(p.stats?.bestWin82)),
    best7Wins: num(p.stats?.best7Wins),
    best7Losses: num(p.stats?.best7Losses),
    challengeWins: num(p.stats?.challengeWins),
    challengeLosses: num(p.stats?.challengeLosses),
    tournamentWins: num(p.stats?.tournamentWins),
    dailyStreak: num(p.stats?.dailyStreak),
    longestDailyStreak: num(p.stats?.longestDailyStreak),
  },
  badges: Array.isArray(p.badges) ? p.badges.slice(0, 40).map((b) => cleanText(String(b), 32)) : [],
  draftCounts: typeof p.draftCounts === "object" && p.draftCounts
    ? Object.fromEntries(Object.entries(p.draftCounts).slice(0, 400).map(([k, v]) => [cleanText(k, 32), num(v)]))
    : {},
  recentGames: Array.isArray(p.recentGames)
    ? p.recentGames.slice(0, 20).map((g) => ({
        w: !!g.w,
        mode: cleanText(String(g.mode || ""), 20),
        score: cleanText(String(g.score || ""), 12),
        mvp: cleanText(String(g.mvp || ""), 40),
        vs: cleanName(String(g.vs || "")),
        ts: num(g.ts),
      }))
    : [],
  savedTeams: Array.isArray(p.savedTeams)
    ? p.savedTeams.slice(0, 12).map((t) => ({
        name: cleanText(String(t.name || ""), 30),
        ids: Array.isArray(t.ids) ? t.ids.slice(0, 5).map((id) => cleanText(String(id), 32)) : [],
        rating: num(t.rating),
      }))
    : [],
  daily: typeof p.daily === "object" && p.daily
    ? Object.fromEntries(Object.entries(p.daily).slice(-60).map(([k, v]) => [String(k).slice(0, 8), { won: !!v?.won }]))
    : {},
});

export default async function handler(req, res) {
  const requestId = newRequestId();
  if (!hasStore()) return sendError(res, "KV_UNAVAILABLE", requestId);
  const session = getOrCreateSession(req, res);

  // Safe configuration probe: booleans only, no key and no fragment of one.
  if (req.method === "GET" && req.query?.cloud === "status") {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ cloudAccounts: { ...cloudAccountsServerStatus(), ready: cloudAccountsReady() } });
  }

  if (req.method === "GET") {
    const profile = await getJSON(KEY(session));
    if (!profile) return sendError(res, "NOT_FOUND", requestId);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json(profile);
  }

  if (req.method !== "POST") return sendError(res, "VALIDATION_FAILURE", requestId);
  if (flags().maintenance) return sendError(res, "MAINTENANCE", requestId);
  if (!sameOrigin(req)) return sendError(res, "FORBIDDEN", requestId);
  if (tooLarge(req, MAX_BYTES + 5000)) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);
  if (!(await rateLimit(`pf:${clientIp(req)}`, limits().profilePerMinIp, 60))) {
    return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });
  }

  // ── Phase 9B.1 cloud-career actions ──────────────────────────────────────
  // Identity comes from verifying the bearer token with the provider; game data
  // comes from the authoritative result record; ownership comes from the
  // HttpOnly device-session cookie. Nothing here trusts the request body for
  // a user id, a score, a roster or a candidate identity.
  const action = typeof req.body?.action === "string" ? req.body.action : null;
  if (action) {
    if (!CLOUD_ACTIONS.has(action)) return sendError(res, "VALIDATION_FAILURE", requestId);
    if (!cloudAccountsReady()) return res.status(503).json({ error: "CLOUD_ACCOUNTS_DISABLED", requestId });
    if (!(await rateLimit(`acct:${clientIp(req)}`, 30, 60))) return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });

    const who = await verifyAccountToken(bearer(req));
    if (!who) return res.status(401).json({ error: "NOT_AUTHENTICATED", requestId });

    if (action === "import-preview") {
      const count = await countEligibleForImport({ candidateIds: req.body?.resultIds, deviceSession: session });
      return res.status(200).json({ ...count, max: MAX_IMPORT_CANDIDATES, requestId });
    }
    if (action === "import-device-history") {
      const out = await importDeviceHistory({
        candidateIds: req.body?.resultIds, userId: who.userId, deviceSession: session,
        buildStamp: stamp(req), themeVersion: req.body?.themeVersion ? cleanText(String(req.body.themeVersion), 40) : null,
      });
      return res.status(200).json({ ...out, requestId });
    }

    const resultId = String(req.body?.resultId || "");
    if (!RESULT_ID_SHAPE.test(resultId)) return sendError(res, "VALIDATION_FAILURE", requestId);
    const out = await claimAndSaveResult({
      resultId, userId: who.userId, deviceSession: session,
      claimedFrom: action === "claim-result" ? "guest_claim" : "signed_in",
      buildStamp: stamp(req), themeVersion: req.body?.themeVersion ? cleanText(String(req.body.themeVersion), 40) : null,
    });
    const code = { saved: 200, already_saved: 200, not_found: 404, not_your_result: 403, already_claimed: 409, not_configured: 503, save_failed: 502 }[out.status] ?? 500;
    return res.status(code).json({ ...out, requestId });
  }

  const clean = sanitize(req.body?.profile);
  const existing = await getJSON(KEY(session));

  // One-time legacy migration: claim the old localStorage-uid profile.
  let legacyBase = null;
  const legacyUid = typeof req.body?.legacyUid === "string" && /^[\w-]{8,64}$/.test(req.body.legacyUid)
    ? req.body.legacyUid : null;
  if (legacyUid && !existing) {
    const claimed = await setNX(`legacy:claim:${legacyUid}`, { session: session.slice(0, 16), ts: Date.now() });
    if (claimed) legacyBase = await getJSON(LEGACY_KEY(legacyUid));
  }

  if (existing?.created_at) clean.created_at = existing.created_at;
  const baseline = existing || legacyBase;
  if (baseline?.stats) {
    for (const k of ["bestWin82", "longestDailyStreak", "tournamentWins", "gamesPlayed", "wins", "losses"]) {
      clean.stats[k] = Math.max(clean.stats[k], num(baseline.stats[k]));
    }
  }
  if (JSON.stringify(clean).length > MAX_BYTES) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);
  await setJSON(KEY(session), clean);
  return res.status(200).json(clean);
}
