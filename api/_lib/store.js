// ── Server-side store abstraction ─────────────────────────────────────────────
// Thin REST client for Upstash Redis / Vercel KV (same REST protocol). No SDK
// dependency — plain fetch. Every feature that uses the store must degrade
// gracefully when it is not configured: hasStore() gates all persistence.
//
// Required env (either pair):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   KV_REST_API_URL        + KV_REST_API_TOKEN          (Vercel KV names)

const cfg = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
};

export const hasStore = () => !!cfg();

// Run one Redis command, e.g. cmd("SET", "k", "v", "EX", 60). Returns the
// command result, or null on any transport error (callers treat null as miss).
export const cmd = async (...args) => {
  const c = cfg();
  if (!c) return null;
  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
};

// Pipeline several commands in one round trip. Returns array of results or null.
export const pipeline = async (commands) => {
  const c = cfg();
  if (!c || !commands.length) return null;
  try {
    const res = await fetch(`${c.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((cm) => cm.map(String))),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.map((d) => d.result ?? null) : null;
  } catch {
    return null;
  }
};

// JSON helpers
export const getJSON = async (key) => {
  const raw = await cmd("GET", key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
export const setJSON = (key, value, exSeconds) =>
  exSeconds
    ? cmd("SET", key, JSON.stringify(value), "EX", exSeconds)
    : cmd("SET", key, JSON.stringify(value));

// SET NX — returns true only if the key was newly created (idempotency guard).
export const setNX = async (key, value, exSeconds) => {
  const args = ["SET", key, JSON.stringify(value), "NX"];
  if (exSeconds) args.push("EX", exSeconds);
  return (await cmd(...args)) === "OK";
};

// Fixed-window rate limit: allow `limit` hits per `windowSeconds` per key.
// Fails OPEN (returns true) when the store is unavailable — availability of
// gameplay beats strictness of limits.
export const rateLimit = async (key, limit, windowSeconds) => {
  if (!hasStore()) return true;
  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const n = await cmd("INCR", bucket);
  if (n === 1 || n === "1") await cmd("EXPIRE", bucket, windowSeconds);
  if (n == null) return true;
  return Number(n) <= limit;
};

// Random URL-safe id for challenges / results.
export const newId = (len = 10) => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const buf = new Uint8Array(len);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
};

// Client IP for rate limiting (Vercel sets x-forwarded-for).
export const clientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

export const dayKey = (d = new Date()) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
