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

// ── In-memory store (tests + local load harness ONLY) ─────────────────────────
// Activated by ECLASH_TEST_MEMORY_STORE=1 — and HARD-DISABLED in production
// (NODE_ENV=production on Vercel): a stray env var can never silently replace
// real persistence with per-instance memory. Implements the exact Redis subset
// this codebase uses so integrity paths (idempotency, atomic daily claims,
// immutable results) are fully testable.
const memMode = () =>
  process.env.ECLASH_TEST_MEMORY_STORE === "1" && process.env.NODE_ENV !== "production";
const mem = { kv: new Map(), exp: new Map(), h: new Map(), l: new Map(), z: new Map(), s: new Map() };
export const _memReset = () => { for (const m of Object.values(mem)) m.clear(); };
const alive = (k) => {
  const e = mem.exp.get(k);
  if (e && e < Date.now()) {
    mem.exp.delete(k); mem.kv.delete(k); mem.h.delete(k); mem.l.delete(k); mem.z.delete(k); mem.s.delete(k);
    return false;
  }
  return true;
};
const memCmd = (args) => {
  const [op, key, ...rest] = args.map(String);
  if (key != null) alive(key);
  switch (op.toUpperCase()) {
    case "GET": return mem.kv.has(key) ? mem.kv.get(key) : null;
    case "SET": {
      const nx = rest.some((a) => a.toUpperCase?.() === "NX");
      const exIdx = rest.findIndex((a) => a.toUpperCase?.() === "EX");
      if (nx && mem.kv.has(key)) return null;
      mem.kv.set(key, rest[0]);
      if (exIdx > -1) mem.exp.set(key, Date.now() + Number(rest[exIdx + 1]) * 1000);
      return "OK";
    }
    case "INCR": { const v = Number(mem.kv.get(key) || 0) + 1; mem.kv.set(key, String(v)); return v; }
    case "EXPIRE": mem.exp.set(key, Date.now() + Number(rest[0]) * 1000); return 1;
    case "HINCRBY": {
      const h = mem.h.get(key) || mem.h.set(key, new Map()).get(key);
      const v = Number(h.get(rest[0]) || 0) + Number(rest[1]); h.set(rest[0], v); return v;
    }
    case "PFADD": { const s = mem.s.get(key) || mem.s.set(key, new Set()).get(key); s.add(rest[0]); return 1; }
    case "LPUSH": { const l = mem.l.get(key) || mem.l.set(key, []).get(key); l.unshift(rest[0]); return l.length; }
    case "LTRIM": { const l = mem.l.get(key) || []; mem.l.set(key, l.slice(Number(rest[0]), Number(rest[1]) + 1)); return "OK"; }
    case "ZADD": { const z = mem.z.get(key) || mem.z.set(key, new Map()).get(key); z.set(rest[1], Number(rest[0])); return 1; }
    case "ZINCRBY": { const z = mem.z.get(key) || mem.z.set(key, new Map()).get(key); const v = (z.get(rest[1]) || 0) + Number(rest[0]); z.set(rest[1], v); return v; }
    case "ZCARD": return (mem.z.get(key) || new Map()).size;
    case "ZREVRANK": {
      const sorted = [...(mem.z.get(key) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
      const i = sorted.findIndex(([m]) => m === rest[0]); return i === -1 ? null : i;
    }
    case "ZREVRANGE": {
      const sorted = [...(mem.z.get(key) || new Map()).entries()].sort((a, b) => b[1] - a[1])
        .slice(Number(rest[0]), Number(rest[1]) + 1);
      const withScores = rest.some((a) => a.toUpperCase?.() === "WITHSCORES");
      return withScores ? sorted.flatMap(([m, s]) => [m, String(s)]) : sorted.map(([m]) => m);
    }
    default: return null;
  }
};

export const hasStore = () => memMode() || !!cfg();

// Run one Redis command, e.g. cmd("SET", "k", "v", "EX", 60). Returns the
// command result, or null on any transport error (callers treat null as miss).
export const cmd = async (...args) => {
  if (memMode()) return memCmd(args);
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
  if (memMode()) return commands.map((cm) => memCmd(cm));
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
