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
  claimAndSaveResult, importDeviceHistory, countEligibleForImport, deleteAccount,
  CANDIDATE_ID_SHAPE, MAX_IMPORT_CANDIDATES,
} from "./_lib/cloudAccounts.js";
// Phase 9C: challenges ride the same route and the same function budget. Their
// auth rule differs from the career actions — an invitation may be read and a
// challenge accepted by a guest — so they are dispatched before the bearer-only
// block, with a token verified whenever one is presented.
import {
  createChallenge, viewChallenge, acceptChallenge, completeChallengeAttempt, revokeChallenge, listChallenges, displayNameFor,
} from "./_lib/challenges.js";
import { normalizeCode } from "../src/challenges/contract.js";
import { normalizeTier } from "../src/entitlements.js";
import { validRunId } from "./_lib/chaosRun.js";

const KEY = (sid) => `profile:${sid}`;
const RESULT_ID_SHAPE = CANDIDATE_ID_SHAPE;
const CLOUD_ACTIONS = new Set(["cloud-save", "claim-result", "import-device-history", "import-preview", "delete-account"]);
const CHALLENGE_ACTIONS = new Set(["challenge-create", "challenge-view", "challenge-accept", "challenge-complete", "challenge-revoke", "challenge-list"]);
const ACCOUNT_ONLY_CHALLENGE_ACTIONS = new Set(["challenge-create", "challenge-revoke", "challenge-list"]);
/** A guest: an identity with no user id. Never a stand-in for a token that failed verification. */
const GUEST_IDENTITY = Object.freeze({ userId: null });

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

  if (req.method === "GET" && req.query?.challenge !== undefined) {
    // The invitation a link opens to. Generic for anything that is not a live
    // code; rate-limited per IP so codes cannot be swept.
    if (!cloudAccountsReady()) return res.status(503).json({ error: "CLOUD_ACCOUNTS_DISABLED", requestId });
    if (!(await rateLimit(`chal-view:${clientIp(req)}`, limits().challengeViewPerMinIp, 60))) return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });
    const code = normalizeCode(String(req.query.challenge || ""));
    const token = bearer(req);
    const verified = token ? await verifyAccountToken(token) : null;
    if (token && !verified) return res.status(401).json({ error: "NOT_AUTHENTICATED", requestId });
    const who = verified || GUEST_IDENTITY;
    const deviceSession = getOrCreateSession(req, res);
    const out = code ? await viewChallenge({ code, userId: who.userId, deviceSession }) : { status: "unavailable" };
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ...out, requestId });
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

  // ── Phase 9C challenge actions ──────────────────────────────────────────
  const action9c = typeof req.body?.action === "string" ? req.body.action : null;
  if (action9c && CHALLENGE_ACTIONS.has(action9c)) {
    if (!cloudAccountsReady()) return res.status(503).json({ error: "CLOUD_ACCOUNTS_DISABLED", requestId });
    if (!(await rateLimit(`chal:${clientIp(req)}`, limits().challengeActionsPerMinIp, 60))) return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });
    // A presented token is verified; an invalid one is refused, never quietly
    // downgraded to a guest. No token at all is a guest, where a guest is allowed.
    const token = bearer(req);
    // `who` is the verified token's identity, or the guest identity (no user id)
    // where a guest is allowed. Every user id below is read from it and nowhere else.
    const verified = token ? await verifyAccountToken(token) : null;
    if (token && !verified) return res.status(401).json({ error: "NOT_AUTHENTICATED", requestId });
    const who = verified || GUEST_IDENTITY;
    if (ACCOUNT_ONLY_CHALLENGE_ACTIONS.has(action9c) && !who.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED", requestId });
    const displayName = who.userId ? await displayNameFor(who.userId) : null;
    // Tier gates ACCESS only (never odds). A guest cannot claim a tier without a token.
    const tier = who.userId ? (["FREE", "PLUS", "COMMISSIONER"].includes(normalizeTier(req.body?.tier)) ? normalizeTier(req.body.tier) : "FREE") : "GUEST";
    const code = normalizeCode(String(req.body?.code || ""));
    const chaosRunId = validRunId(req.body?.chaosRunId);
    let out;
    if (action9c === "challenge-create") {
      if (!chaosRunId) return sendError(res, "VALIDATION_FAILURE", requestId);
      out = await createChallenge({ chaosRunId, userId: who.userId, deviceSession: session, displayName });
      const http = { created: 200, already_created: 200, not_found: 404, not_your_result: 403, not_simulated: 409, not_eligible: 409, not_configured: 503, save_failed: 502 }[out.status] ?? 500;
      return res.status(http).json({ ...out, challenge: undefined, requestId });
    }
    if (action9c === "challenge-view") {
      out = code ? await viewChallenge({ code, userId: who.userId, deviceSession: session }) : { status: "unavailable" };
      return res.status(200).json({ ...out, requestId });
    }
    if (action9c === "challenge-accept") {
      out = code ? await acceptChallenge({ code, userId: who.userId, deviceSession: session, tier, displayName }) : { status: "unavailable" };
      const http = { started: 200, resumed: 200, unavailable: 200, expired: 200, revoked: 200, already_attempted: 409, own_challenge: 403, guest_limit: 403, not_configured: 503, save_failed: 502 }[out.status] ?? 500;
      if (out.status === "guest_limit") return res.status(403).json({ requestId, status: out.status, gated: true, guestRunsUsed: out.guestRunsUsed, guestRunsAllowed: out.guestRunsAllowed, gate: { kind: "ACCOUNT", message: "Create a free account to keep playing Chaos Clash." } });
      return res.status(http).json({ ...out, requestId });
    }
    if (action9c === "challenge-complete") {
      if (!chaosRunId) return sendError(res, "VALIDATION_FAILURE", requestId);
      out = await completeChallengeAttempt({ chaosRunId, userId: who.userId, deviceSession: session, displayName });
      const http = { completed: 200, already_completed: 200, not_found: 404, not_your_run: 403, not_simulated: 409, not_configured: 503, save_failed: 502 }[out.status] ?? 500;
      return res.status(http).json({ ...out, requestId });
    }
    if (action9c === "challenge-revoke") {
      out = code ? await revokeChallenge({ code, userId: who.userId }) : { status: "unavailable" };
      const http = { revoked: 200, already_revoked: 200, unavailable: 200, not_configured: 503, save_failed: 502 }[out.status] ?? 500;
      return res.status(http).json({ ...out, requestId });
    }
    out = await listChallenges({ userId: who.userId });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(out.status === "ok" ? 200 : 503).json({ ...out, requestId });
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

    if (action === "delete-account") {
      // The one destructive account action. Identity is the verified token's
      // own user id — the request body cannot name someone else to delete.
      const out = await deleteAccount({ userId: who.userId });
      const code = { deleted: 200, not_configured: 503, invalid_user: 400, provider_rejected_server_key: 502, delete_failed: 502 }[out.status] ?? 500;
      return res.status(code).json({ ...out, requestId });
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
