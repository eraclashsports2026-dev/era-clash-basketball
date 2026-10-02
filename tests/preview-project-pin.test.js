// ── A Vercel Preview can only talk to the Preview Supabase project ────────────
// The Preview-scoped Vercel variables named the PRODUCTION project; the
// containment guards kept that inert (accounts off). A Vercel Preview
// deployment now resolves its provider address and publishable key from
// config/projectRefs.js whatever the dashboard says. Production and local
// harnesses (no VERCEL=1) still read the environment. The server SECRET is
// never pinned — it only ever comes from the environment.
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as refs from "../config/projectRefs.js";

const PROD = "https://dxdtnhdeaanhfoqngdel.supabase.co";
const KEYS = ["VERCEL", "VERCEL_ENV", "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CLOUD_ACCOUNTS_ENABLED"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const setEnv = (o) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, o); };
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.resetModules(); });
const load = async () => { vi.resetModules(); return import("../api/_lib/cloudAccounts.js"); };
const WRONG_PREVIEW_ENV = { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PROD, VITE_SUPABASE_URL: PROD, SUPABASE_ANON_KEY: "sb_publishable_YIAKyZH0TGlBL9z5GLPeJg_MEWWLvcP", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "Z".repeat(32), CLOUD_ACCOUNTS_ENABLED: "true" };

describe("the pinned Preview identity", () => {
  it("is the Preview project, public values only", () => {
    expect(refs.PREVIEW_SUPABASE_URL).toBe("https://lfybiphmqkiecfrqsfzt.supabase.co");
    expect(refs.supabaseRefOf(refs.PREVIEW_SUPABASE_URL)).toBe(refs.PREVIEW_SUPABASE_REF);
    expect(refs.PREVIEW_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    expect(read("config/projectRefs.js")).not.toMatch(/sb_secret_|service_role/);
    expect(refs.PREVIEW_SUPABASE_REF).not.toBe(refs.PRODUCTION_SUPABASE_REF);
  });
  it("applies only on a Vercel Preview deployment", () => {
    expect(refs.onVercelPreview({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(refs.onVercelPreview({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(refs.onVercelPreview({ VERCEL_ENV: "preview" })).toBe(false);   // a local harness
    expect(refs.onVercelPreview({})).toBe(false);
  });
});
function read(p) { return readFileSync(p, "utf8"); }

describe("the server on a Vercel Preview whose variables name Production", () => {
  it("calls the Preview project, never Production, and the containment guard stays false", async () => {
    setEnv(WRONG_PREVIEW_ENV);
    const m = await load();
    expect(m.previewPointedAtProduction()).toBe(false);
    expect(m.providerRefsMatch()).toBe(true);
    expect(m.cloudAccountsReady()).toBe(true);
    const calls = [];
    const fetchStub = async (u, init) => { calls.push({ u: String(u), apikey: init?.headers?.apikey }); return new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200 }); };
    const realFetch = globalThis.fetch; globalThis.fetch = fetchStub;
    try { await m.verifyAccountToken("a.b.c"); await m.rest("profiles?select=user_id", {}, fetchStub); } finally { globalThis.fetch = realFetch; }
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) { expect(c.u.startsWith(refs.PREVIEW_SUPABASE_URL)).toBe(true); expect(c.u).not.toContain("dxdtnhdeaanhfoqngdel"); }
  });
});

describe("everywhere else the environment still decides", () => {
  it("Production reads its own variables", async () => {
    setEnv({ ...WRONG_PREVIEW_ENV, VERCEL_ENV: "production" });
    const m = await load();
    const calls = []; const fetchStub = async (u) => { calls.push(String(u)); return new Response("[]", { status: 200 }); };
    await m.rest("profiles?select=user_id", {}, fetchStub);
    expect(calls[0].startsWith(PROD)).toBe(true);
  });
  it("a local harness (VERCEL_ENV=preview, no VERCEL=1) keeps its fake-cloud address, and the guard still refuses production", async () => {
    setEnv({ ...WRONG_PREVIEW_ENV, VERCEL: undefined });
    delete process.env.VERCEL;
    const m = await load();
    expect(m.previewPointedAtProduction()).toBe(true);    // the 2026-09-10 guard is intact
    expect(m.cloudAccountsReady()).toBe(false);
    setEnv({ VERCEL_ENV: "preview", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_" + "B".repeat(32), SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "A".repeat(32), CLOUD_ACCOUNTS_ENABLED: "true" });
    const m2 = await load();
    const calls = []; const fetchStub = async (u) => { calls.push(String(u)); return new Response("[]", { status: 200 }); };
    await m2.rest("profiles?select=user_id", {}, fetchStub);
    expect(calls[0].startsWith("https://abcdefghijklmnopqrst.supabase.co")).toBe(true);
  });
  it("the build pins VITE_* only on a Vercel Preview, and keeps every release guard", () => {
    const v = read("vite.config.js");
    expect(v).toMatch(/if \(process\.env\.VERCEL === "1" && process\.env\.VERCEL_ENV === "preview"\) \{\s*process\.env\.VITE_SUPABASE_URL = PREVIEW_SUPABASE_URL;\s*process\.env\.VITE_SUPABASE_ANON_KEY = PREVIEW_SUPABASE_PUBLISHABLE_KEY;/);
    expect(v).toContain("a PREVIEW build was pointed at the production Supabase project");
    expect(v).toContain("VITE_SUPABASE_URL names a different project from SUPABASE_URL");
    expect(v).toContain("holds a secret-shaped value and was dropped from the build");
  });
});
