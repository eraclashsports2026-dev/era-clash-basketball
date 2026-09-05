// ── Server side of the cloud career ──────────────────────────────────────────
// The ONE place a career record is created. Everything here is deliberately
// suspicious of the browser:
//
//   · the account identity comes from VERIFYING the bearer token with the
//     provider, never from a request body
//   · the game data comes from the AUTHORITATIVE result record in the store,
//     never from a request body (no score, roster, era or candidate id is read
//     from the client)
//   · ownership of a guest result is proved by comparing the result record's
//     server-minted device session to the caller's HttpOnly cookie
//   · one result may be claimed by exactly one account, enforced by a primary
//     key in Postgres, not by a check-then-write race
//
// Writes use the service-role key, which is server-only: RLS grants no client
// role INSERT on saved_clashes, so a browser with a valid session still cannot
// forge a career record.
import { createHash } from "node:crypto";
import { getJSON } from "./store.js";

export const CLOUD_ACCOUNTS_SERVER_VERSION = "1.0.0";

const jwtRole = (v) => {
  const parts = String(v).split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role ?? null; } catch { return null; }
};
const printableAscii = (v) => !!v && !/[^\x21-\x7e]/.test(v);

/** A secret credential in any form: sb_secret_, or a legacy service_role JWT. */
export const looksLikeSecretKey = (value) => {
  const v = String(value ?? "").trim();
  if (!printableAscii(v)) return false;
  return /^sb_secret_/.test(v) || jwtRole(v) === "service_role";
};

/** A key the BROWSER may hold — anon JWT or sb_publishable_, never a secret. */
export const keyShapeOk = (value) => {
  const v = String(value ?? "").trim();
  if (!printableAscii(v) || looksLikeSecretKey(v)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(v)) return true;
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
};

/** The privileged key the SERVER uses. It must BE a secret, and must be one. */
export const serviceKeyShapeOk = (value) => looksLikeSecretKey(value);

/** The same forgiving boolean the client uses: a dashboard text box is not code. */
export const flagOn = (value) => ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

const url = () => String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = () => String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();

/**
 * Do the server and the browser point at the SAME project? A mismatch is
 * invisible to every other check — both halves look correctly configured, and
 * the server's credential is simply valid for a project it is not calling, so
 * the provider answers 401 exactly as it would for a revoked key.
 * Compared as project refs, never as URLs, so nothing identifying is returned.
 */
const refOf = (u) => (String(u || "").match(/^https:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)$/i) || [])[1] || null;
export const providerRefsMatch = () => {
  const server = refOf(process.env.SUPABASE_URL);
  const browser = refOf(process.env.VITE_SUPABASE_URL);
  if (!server || !browser) return null;   // nothing to compare, not a mismatch
  return server === browser;
};

/** Configuration state, safe to report: booleans only, never a key or a fragment of one. */
export const cloudAccountsServerStatus = () => ({
  providerUrlConfigured: /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url()),
  serviceRoleConfigured: serviceKeyShapeOk(serviceKey()),
  anonKeyConfigured: keyShapeOk(anonKey()),
  enabled: flagOn(process.env.CLOUD_ACCOUNTS_ENABLED),
});

export const cloudAccountsReady = () => {
  const s = cloudAccountsServerStatus();
  return s.enabled && s.providerUrlConfigured && s.serviceRoleConfigured && s.anonKeyConfigured;
};

export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

const BEARER_SHAPE = /^[A-Za-z0-9._-]{20,4096}$/;

/**
 * Verify an account access token WITH THE PROVIDER and return its user id.
 * No local secret, no local JWT parsing: the provider is the authority on
 * whether a token is live, unexpired and unrevoked.
 */
export const verifyAccountToken = async (token, fetchImpl = fetch) => {
  const t = String(token || "");
  if (!BEARER_SHAPE.test(t) || !cloudAccountsReady()) return null;
  try {
    const r = await fetchImpl(`${url()}/auth/v1/user`, {
      headers: { authorization: `Bearer ${t}`, apikey: anonKey() },
    });
    if (!r.ok) return null;
    const body = await r.json();
    const id = body?.id;
    return /^[0-9a-f-]{36}$/i.test(String(id)) ? { userId: String(id) } : null;
  } catch { return null; }
};

/** The authoritative record, by the same key convention api/game.js writes. */
export const readAuthoritativeResult = async (resultId) => {
  const id = String(resultId || "");
  const isPreview = /^pv_[a-z0-9]{6,16}$/.test(id);
  if (!isPreview && !/^[a-z0-9]{6,16}$/.test(id)) return null;
  return getJSON(`${isPreview ? "preview-result" : "result"}:${id}`);
};

const OUTCOME = (record) => {
  const g = record?.finalScore?.gold, b = record?.finalScore?.blue;
  if (!Number.isFinite(g) || !Number.isFinite(b)) return record?.won ? "win" : "loss";
  if (g === b) return "tie";
  return g > b ? "win" : "loss";
};

const roster = (ids, record) => {
  const list = Array.isArray(ids) ? ids : [];
  const byId = new Map((record?.pregame?.cards || []).map((c) => [c.id, c]));
  return list.slice(0, 5).map((id) => {
    const c = byId.get(id);
    return { id: String(id).slice(0, 40), name: c?.name ? String(c.name).slice(0, 40) : null, pos: c?.pos ? String(c.pos).slice(0, 4) : null };
  });
};

const coach = (c) => (c ? { id: String(c.id ?? "").slice(0, 40) || null, name: c.name ? String(c.name).slice(0, 40) : null } : null);

/**
 * The career row, built ENTIRELY from the authoritative record.
 * `result_snapshot` keeps enough to re-render the saved report after the
 * temporary result cache expires — and deliberately drops the device session,
 * so no career row can identify the guest browser that produced it.
 */
export const buildSavedClash = ({ record, userId, claimedFrom, buildStamp = null, themeVersion = null }) => {
  const { session, ...withoutSession } = record || {};
  return {
    user_id: userId,
    result_id: String(record.id),
    mode: String(record.mode || "single").slice(0, 20),
    user_side: "gold",
    outcome: OUTCOME(record),
    gold_score: Number.isFinite(record?.finalScore?.gold) ? record.finalScore.gold : null,
    blue_score: Number.isFinite(record?.finalScore?.blue) ? record.finalScore.blue : null,
    era_id: record?.eraId ? String(record.eraId).slice(0, 20) : null,
    gold_roster: roster(record?.goldIds, record),
    blue_roster: roster(record?.blueIds, record),
    gold_coach: coach(record?.pregame?.coachGold || record?.coachGold),
    blue_coach: coach(record?.pregame?.coachBlue || record?.coachBlue),
    mvp: record?.mvp ? { name: String(record.mvp.name || "").slice(0, 40), pts: Number(record.mvp.pts) || null } : null,
    candidate_id: record?.previewCandidate?.candidateId ? String(record.previewCandidate.candidateId).slice(0, 40) : null,
    calibration_version: record?.previewCandidate?.calibrationVersion ? String(record.previewCandidate.calibrationVersion).slice(0, 20) : null,
    candidate_core_hash: record?.previewCandidate?.candidateCoreHash ? String(record.previewCandidate.candidateCoreHash).slice(0, 64) : null,
    theme_version: themeVersion ? String(themeVersion).slice(0, 40) : null,
    build_stamp: buildStamp ? String(buildStamp).slice(0, 64) : null,
    // A non-reversible fingerprint: the same-seed challenge can be recognised
    // without the seed itself ever reaching account data.
    challenge_fingerprint: record?.challengeId ? sha256(`challenge|${record.challengeId}`).slice(0, 32) : null,
    claimed_from: claimedFrom,
    result_snapshot: withoutSession,
    played_at: new Date(Number(record?.created_at) || Date.now()).toISOString(),
  };
};

/** The provider refusing the server's own credential, as opposed to refusing the caller. */
export const serverKeyRejected = (status) => status === 401 || status === 403;

/**
 * Ask the provider whether it accepts the server's own credential, and answer
 * with a boolean. Nothing about the key is returned or logged. This exists
 * because a key that is correctly SHAPED and has been revoked looks perfectly
 * healthy to every other check: cloud accounts reported ready while every save
 * failed with a 401.
 */
export const serviceKeyAccepted = async (fetchImpl = fetch) => (await serviceKeyProbe(fetchImpl)).accepted;

/**
 * The same question with its working shown: the HTTP status the provider gave,
 * and PostgREST's own short error code if it sent one. Both are safe to report
 * — a status is a number and the code is a symbol like PGRST301 or 42501 — and
 * they separate causes that a boolean cannot:
 *   401  the credential is not accepted at all
 *   403  accepted, but not permitted to read that table
 *   404  the path is wrong, which would mean the probe is at fault
 * That distinction is the difference between "replace the key" and "stop
 * blaming the key".
 */
export const serviceKeyProbe = async (fetchImpl = fetch) => {
  const k = serviceKey();
  if (!serviceKeyShapeOk(k)) return { accepted: false, status: null, code: "not_configured", variant: null, tried: [] };
  // Which header combination does this provider actually accept? A legacy
  // service_role credential is a JWT and is happy as a Bearer token. A new
  // sb_secret_ key is NOT a JWT, and a gateway that insists on parsing the
  // Authorization header as one answers 401 — which from outside looks exactly
  // like a revoked key, and had me blaming configuration twice.
  const variants = [
    ["both", { apikey: k, authorization: `Bearer ${k}` }],
    ["apikey-only", { apikey: k }],
    ["bearer-only", { authorization: `Bearer ${k}` }],
  ];
  const tried = [];
  for (const [variant, headers] of variants) {
    try {
      const r = await fetchImpl(`${url()}/rest/v1/profiles?select=user_id&limit=1`, { method: "GET", headers });
      const text = await r.text();
      let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      const code = typeof body?.code === "string" ? body.code.slice(0, 16) : null;
      tried.push({ variant, status: r.status, code });
      if (!serverKeyRejected(r.status)) return { accepted: true, status: r.status, code, variant, tried };
    } catch { tried.push({ variant, status: null, code: "unreachable" }); }
  }
  const first = tried[0] || { status: null, code: null };
  return { accepted: false, status: first.status, code: first.code, variant: null, tried };
};

const rest = async (path, init = {}, fetchImpl = fetch) => {
  const r = await fetchImpl(`${url()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
};

/**
 * Claim ownership of one authoritative result for one account, then store the
 * career snapshot. Both writes are idempotent, and the claim is decided by the
 * database: `result_claims.result_id` is the primary key, so the second account
 * to try loses without a race.
 *
 * Returns a closed status: saved · already_saved · not_found · not_your_result
 * · already_claimed · not_configured · save_failed
 */
export const claimAndSaveResult = async ({ resultId, userId, deviceSession, claimedFrom = "signed_in", buildStamp = null, themeVersion = null }, deps = {}) => {
  const fetchImpl = deps.fetch || fetch;
  if (!cloudAccountsReady()) return { status: "not_configured" };

  const record = deps.record !== undefined ? deps.record : await readAuthoritativeResult(resultId);
  if (!record) return { status: "not_found" };

  // Ownership: the result must have been produced by THIS browser's
  // server-minted session. A result id guessed or copied from elsewhere fails
  // here, which is what makes a client-supplied candidate list safe.
  if (!deviceSession || record.session !== deviceSession) return { status: "not_your_result" };

  const hash = sha256(deviceSession);
  const claim = await rest("result_claims", {
    method: "POST",
    headers: { prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ result_id: String(record.id), user_id: userId, device_session_hash: hash, claimed_via: claimedFrom }),
  }, fetchImpl);

  // A 401 or 403 here is the provider refusing OUR OWN credential, not anything
  // about the player or the result. Retrying cannot fix it and the operator
  // needs to know that: it means the server's key is absent, wrong, or was
  // rotated without the deployment being updated. It is worth its own status,
  // because "save failed, try again" invites a loop that can never succeed.
  if (serverKeyRejected(claim.status)) return { status: "save_failed", detail: "provider_rejected_server_key" };
  if (!claim.ok) return { status: "save_failed", detail: `claim_http_${claim.status}` };

  // ignore-duplicates returns an empty array when the row already existed:
  // read it back and insist the owner is this user.
  let owner = Array.isArray(claim.body) && claim.body[0]?.user_id ? claim.body[0].user_id : null;
  if (!owner) {
    const existing = await rest(`result_claims?result_id=eq.${encodeURIComponent(String(record.id))}&select=user_id`, {}, fetchImpl);
    owner = Array.isArray(existing.body) && existing.body[0]?.user_id ? existing.body[0].user_id : null;
    if (!owner) return { status: "save_failed", detail: "claim_unreadable" };
  }
  if (owner !== userId) return { status: "already_claimed" };

  const row = buildSavedClash({ record, userId, claimedFrom, buildStamp, themeVersion });
  const saved = await rest("saved_clashes?on_conflict=user_id,result_id", {
    method: "POST",
    headers: { prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify(row),
  }, fetchImpl);

  if (serverKeyRejected(saved.status)) return { status: "save_failed", detail: "provider_rejected_server_key" };
  if (!saved.ok) return { status: "save_failed", detail: `save_http_${saved.status}` };
  const created = Array.isArray(saved.body) && saved.body.length > 0;
  return { status: created ? "saved" : "already_saved", resultId: row.result_id, outcome: row.outcome, mode: row.mode };
};

/** Result ids a browser proposes are only candidates; each is authorised on its own. */
export const CANDIDATE_ID_SHAPE = /^(pv_)?[a-z0-9]{6,16}$/;
export const MAX_IMPORT_CANDIDATES = 25;

/**
 * Device-history import. The browser sends the result ids it remembers; every
 * one is verified against the authoritative record's session before anything is
 * written, so a list borrowed from another device imports nothing. Safe to
 * retry: each result is idempotent on its own, and a partial failure leaves the
 * successful ones saved.
 */
export const importDeviceHistory = async ({ candidateIds, userId, deviceSession, buildStamp = null, themeVersion = null }, deps = {}) => {
  if (!cloudAccountsReady()) return { status: "not_configured", imported: 0, results: [] };
  const ids = [...new Set((Array.isArray(candidateIds) ? candidateIds : []).map(String).filter((id) => CANDIDATE_ID_SHAPE.test(id)))].slice(0, MAX_IMPORT_CANDIDATES);
  const results = [];
  for (const id of ids) {
    const r = await claimAndSaveResult({ resultId: id, userId, deviceSession, claimedFrom: "device_import", buildStamp, themeVersion }, deps);
    results.push({ resultId: id, status: r.status });
  }
  return {
    status: "ok",
    proposed: ids.length,
    imported: results.filter((r) => r.status === "saved").length,
    alreadySaved: results.filter((r) => r.status === "already_saved").length,
    refused: results.filter((r) => ["not_your_result", "already_claimed", "not_found"].includes(r.status)).length,
    failed: results.filter((r) => r.status === "save_failed").length,
    results,
  };
};

/** How many remembered results are genuinely this device's, without writing anything. */
export const countEligibleForImport = async ({ candidateIds, deviceSession }, deps = {}) => {
  const ids = [...new Set((Array.isArray(candidateIds) ? candidateIds : []).map(String).filter((id) => CANDIDATE_ID_SHAPE.test(id)))].slice(0, MAX_IMPORT_CANDIDATES);
  let eligible = 0;
  for (const id of ids) {
    const record = deps.record !== undefined ? deps.record : await readAuthoritativeResult(id);
    if (record && deviceSession && record.session === deviceSession) eligible++;
  }
  return { proposed: ids.length, eligible };
};
