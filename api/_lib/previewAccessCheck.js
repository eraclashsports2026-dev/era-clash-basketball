// ── Preview access verification: keys + signed sessions ──────────────────────
// Shared by the routing middleware and node functions. Pure crypto via Web
// Crypto so both runtimes (and vitest) run the same code.
//
// Two credentials exist:
//  1. Raw access key — presented once at POST /api/preview-access (or per
//     request via the x-preview-key header for operator tooling). NEVER stored
//     in the browser.
//  2. Signed preview session (cookie pv_session) — HMAC-signed, finite expiry,
//     carries only {wave, testerId, role, keyVersion, sid, exp}. No key, no hash.
//     Revocation is immediate: every verification re-checks the allowlist
//     entry's enabled flag and keyVersion.
//  Phase 9A.3: sessions are WAVE-BOUND (v3). The HMAC secret mixes in the
//  deployment's waveId and the payload names it, so a session minted on one
//  wave's host never verifies on another's, even with a shared store token.
import { PREVIEW_ACCESS } from "../../config/previewAccess.js";

export const COOKIE_NAME = "pv_session";
export const SESSION_VERSION = 3;
export const WAVE_ID = PREVIEW_ACCESS.waveId;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // finite: one week
const KEY_SHAPE = /^[a-f0-9]{32}$/;
const enc = new TextEncoder();

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");

export const sha256Hex = async (s) => {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// The signing secret derives from the deployment's existing store credential —
// present in every environment that persists anything, never a new secret to
// manage. PREVIEW_SESSION_SECRET can override (e.g. tests). Without any secret
// the session layer refuses to issue/verify (fail closed) — the raw-key header
// still works for tooling.
const secretMaterial = () =>
  process.env.PREVIEW_SESSION_SECRET
  || process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.KV_REST_API_TOKEN
  || null;

const hmacKey = async () => {
  const m = secretMaterial();
  if (!m) return null;
  return globalThis.crypto.subtle.importKey("raw", enc.encode(`pv-session-v${SESSION_VERSION}|${m}|${WAVE_ID}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};

const entryFor = (pred) => PREVIEW_ACCESS.keys.find(pred) ?? null;

/** Raw key → {ok, testerId, role, cohort, keyVersion, waveId}. Disabled entries fail. */
export const verifyPreviewKey = async (key) => {
  if (typeof key !== "string" || !KEY_SHAPE.test(key)) return { ok: false };
  const h = await sha256Hex(key);
  const e = entryFor((k) => k.sha256 === h && k.enabled !== false);
  return e ? { ok: true, testerId: e.testerId, role: e.role, cohort: e.cohort ?? null, keyVersion: e.keyVersion, waveId: WAVE_ID } : { ok: false };
};

/** Issue a signed session for a verified key holder. */
export const signSession = async ({ testerId, role, keyVersion }, nowMs = Date.now()) => {
  const k = await hmacKey();
  if (!k) return null;
  const payload = { v: SESSION_VERSION, wave: WAVE_ID, testerId, role, keyVersion,
    sid: b64u(globalThis.crypto.getRandomValues(new Uint8Array(9))),
    iat: Math.floor(nowMs / 1000), exp: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const mac = b64u(await globalThis.crypto.subtle.sign("HMAC", k, enc.encode(body)));
  return `v${SESSION_VERSION}.${body}.${mac}`;
};

/**
 * Verify a session cookie → {ok, testerId, role, sid, exp} or {ok:false, reason}.
 * Re-checks the live allowlist: a revoked tester or rotated keyVersion kills
 * every already-issued session immediately.
 */
export const verifySession = async (token, nowMs = Date.now()) => {
  if (typeof token !== "string") return { ok: false, reason: "missing" };
  if (/^v[0-2]\./.test(token)) return { ok: false, reason: "wrong-version" }; // a pre-9A.3 (Wave 1) session never verifies here
  const m = token.match(/^v3\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return { ok: false, reason: "malformed" };
  const k = await hmacKey();
  if (!k) return { ok: false, reason: "no-secret" };
  const valid = await globalThis.crypto.subtle.verify("HMAC", k, unb64u(m[2]), enc.encode(m[1]));
  if (!valid) return { ok: false, reason: "bad-signature" };
  let p;
  try { p = JSON.parse(unb64u(m[1]).toString("utf8")); } catch { return { ok: false, reason: "bad-payload" }; }
  if (p.v !== SESSION_VERSION || typeof p.exp !== "number") return { ok: false, reason: "bad-payload" };
  if (p.wave !== WAVE_ID) return { ok: false, reason: "wrong-wave" };
  if (p.exp * 1000 <= nowMs) return { ok: false, reason: "expired" };
  const e = entryFor((x) => x.testerId === p.testerId && x.enabled !== false && x.keyVersion === p.keyVersion);
  if (!e || e.role !== p.role) return { ok: false, reason: "revoked" };
  return { ok: true, testerId: p.testerId, role: p.role, cohort: e.cohort ?? null, waveId: WAVE_ID, sid: p.sid, exp: p.exp };
};

export const readCookie = (cookieHeader, name) => {
  for (const part of String(cookieHeader || "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
};

/**
 * Resolve the request's preview identity for node functions:
 * signed session first, then the raw-key header (per-request tooling).
 * Returns {ok, testerId, role, sid} — sid null on header auth.
 */
export const previewIdentity = async (headers) => {
  const s = await verifySession(readCookie(headers.cookie, COOKIE_NAME));
  if (s.ok) return { ok: true, testerId: s.testerId, role: s.role, cohort: s.cohort, waveId: WAVE_ID, sid: s.sid };
  const k = await verifyPreviewKey(headers["x-preview-key"]);
  if (k.ok) return { ok: true, testerId: k.testerId, role: k.role, cohort: k.cohort, waveId: WAVE_ID, sid: null };
  return { ok: false };
};
