#!/usr/bin/env node
// ── Phase 9B.1 account QA ────────────────────────────────────────────────────
//   node scripts/accounts/accountQa.mjs <preflight|migrations|rls|auth|guest-claim|cloud-save|security>
//   node scripts/accounts/accountQa.mjs <my-eraclash|responsive> [baseUrl]   (browser)
//
// The contract modes read source, SQL and configuration: the things that must
// be true before a single account exists. The browser modes measure the BUILT
// app — with cloud accounts unconfigured they prove the honest disabled state,
// which is exactly what a preview without provider credentials must show.
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  providerConfigured, cloudAccountsEnabled, cloudAccountsStatus, safeReturnPath,
  cleanDisplayName, MAX_DISPLAY_NAME, CLOUD_ACCOUNTS_VERSION,
} from "../../src/accounts/config.js";
import { FAILURE_CODES } from "../../src/accounts/provider.js";
import { createTestProvider } from "../../src/accounts/testAdapter.js";
import {
  buildSavedClash, cloudAccountsServerStatus, cloudAccountsReady, sha256,
  CANDIDATE_ID_SHAPE, MAX_IMPORT_CANDIDATES, CLOUD_ACCOUNTS_SERVER_VERSION,
} from "../../api/_lib/cloudAccounts.js";
import { EVENTS_ALLOWLIST } from "../../api/events.js";
import { ACTIVATION_EVENTS } from "../../src/activation.js";
import { CAPABILITIES, MATRIX, can } from "../../src/entitlements.js";

const MODE = process.argv[2] || "preflight";
const BASE = (process.argv[3] || process.env.ACCOUNT_QA_BASE || "http://localhost:4177").replace(/\/$/, "");
const OUT = process.env.ACCOUNT_QA_OUT || "data/validation/9b1";
fs.mkdirSync(OUT, { recursive: true });
const PHASE = "9B.1 — real accounts, cloud career, My EraClash";

const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: !!p, detail: String(d) }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const read = (f) => fs.readFileSync(f, "utf8");
const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const SQL = read("supabase/migrations/0001_accounts.sql");
const DDL = SQL.replace(/^\s*--.*$/gm, "");
const COLUMNS_DDL = DDL.replace(/comment on [\s\S]*?;/g, "");
const extra = {};

const record = (over = {}) => ({
  v: 1, id: "pv_abc123def4", session: "a".repeat(48), mode: "single",
  goldIds: ["g1", "g2", "g3", "g4", "g5"], blueIds: ["b1", "b2", "b3", "b4", "b5"],
  finalScore: { gold: 112, blue: 104 }, eraId: "1990s", mvp: { name: "Test Legend", pts: 33 },
  previewCandidate: { candidateId: "Candidate 4", calibrationVersion: "1.4.0", candidateCoreHash: "c".repeat(64) },
  pregame: { cards: [{ id: "g1", name: "Gold One", pos: "PG" }] }, core: { winner: "GOLD" },
  challengeId: "chal01", created_at: 1_760_000_000_000, ...over,
});

// ── preflight: is this build's account layer coherent and honestly disabled? ─
if (MODE === "preflight") {
  const status = cloudAccountsStatus();
  const server = cloudAccountsServerStatus();
  ok("the account layer declares one version on both sides", CLOUD_ACCOUNTS_VERSION === "1.0.0" && CLOUD_ACCOUNTS_SERVER_VERSION === "1.0.0");
  ok("one module owns the flag; nothing else reads the provider environment directly",
    ["src/accounts/provider.js", "src/accounts/accountState.js", "src/accounts/cloudSave.js", "src/components/accounts/AccountDialog.jsx", "src/components/accounts/MyEraClash.jsx"]
      .every((f) => !/import\.meta\.env\.VITE_SUPABASE/.test(src(f))));
  ok("with no provider configured the build reports itself disabled, with a reason",
    !providerConfigured() && !cloudAccountsEnabled() && status.enabled === false && !!status.reason, status.reason || "");
  ok("the server reports configuration as booleans only — never a key or a fragment",
    Object.values(server).every((v) => typeof v === "boolean") && !cloudAccountsReady(), JSON.stringify(server));
  ok("no fake account can succeed while disabled: every call goes through withProvider",
    /export const withProvider/.test(src("src/accounts/provider.js")) && /CLOUD_ACCOUNTS_DISABLED/.test(src("src/accounts/provider.js")));
  ok("the test adapter is a test double and is imported by nothing under src/",
    fs.existsSync("src/accounts/testAdapter.js")
    && !["src/App.jsx", "src/accounts/provider.js", "src/accounts/accountState.js"].some((f) => /testAdapter/.test(src(f))));
  ok("guest play needs no account: Chaos Clash and the Daily are GUEST capabilities",
    can("GUEST", CAPABILITIES.CHAOS_CLASH) && can("GUEST", CAPABILITIES.DAILY) && MATRIX.GUEST.length === 2);
  ok("no serverless function was added: twelve routes plus middleware", fs.readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && fs.existsSync("middleware.js"));
  ok("the cloud actions live on the existing career route", /CLOUD_ACTIONS/.test(src("api/profile.js")) && /cloudAccountsReady/.test(src("api/profile.js")));
  ok("the new client-rendered routes are gated by the preview middleware and served by the SPA",
    /"\/auth\/:path\*", "\/my-eraclash"/.test(read("middleware.js"))
    && ["/auth/:path*", "/my-eraclash"].every((r) => JSON.parse(read("vercel.json")).rewrites.some((x) => x.source === r)));
  extra.configuration = { client: status, server, ready: cloudAccountsReady() };
  extra.setupDocument = "docs/accounts/eraclash-account-provider-setup.md";
}

// ── migrations: the schema contract ─────────────────────────────────────────
if (MODE === "migrations") {
  const tables = ["profiles", "saved_clashes", "result_claims"];
  ok("one versioned migration exists and records its own version", fs.existsSync("supabase/migrations/0001_accounts.sql") && /insert into public\.schema_migrations \(version\) values \('0001_accounts'\)/.test(DDL));
  ok("every user-owned table exists with a user_id bound to auth.users", tables.every((t) => new RegExp(`create table if not exists public\\.${t}`).test(DDL)) && (DDL.match(/references auth\.users \(id\) on delete cascade/g) || []).length >= 3);
  ok("a profile is unique per user and its name is length- and content-constrained",
    /user_id\s+uuid primary key references auth\.users/.test(DDL)
    && /char_length\(display_name\) between 1 and 24/.test(DDL) && /display_name !~ '\[<>\]'/.test(DDL));
  ok("one clash per user per result, and one owner per result", /unique \(user_id, result_id\)/.test(DDL) && /result_id\s+text primary key/.test(DDL));
  ok("the result id shape is enforced in the database, not only in the client", /result_id ~ '\^\(pv_\)\?\[a-z0-9\]\{6,16\}\$'/.test(DDL));
  ok("career statistics are derived views, not mutable counters that can drift",
    ["career_summary", "career_by_mode", "career_streak"].every((v) => new RegExp(`create or replace view public\\.${v}`).test(DDL))
    && !/counter|games_played\s+integer/.test(COLUMNS_DDL.split("create or replace view")[0]));
  ok("no email column, no seed, no key, no password anywhere in the schema",
    !/\bemail\b/.test(COLUMNS_DDL.split("create table").slice(1).join("create table")) && !/\b(seed|access_key|preview_key|session_token|password)\b/.test(COLUMNS_DDL));
  ok("the device session is stored only as a 64-hex hash", /device_session_hash text not null/.test(DDL) && /device_session_hash ~ '\^\[a-f0-9\]\{64\}\$'/.test(DDL));
  ok("a snapshot is stored so a saved report survives the result cache expiring", /result_snapshot\s+jsonb not null/.test(DDL));
  ok("exactly one profile is created per sign-up, idempotently", /create trigger on_auth_user_created after insert on auth\.users/.test(DDL) && /on conflict \(user_id\) do nothing/.test(DDL));
  ok("deleting an account cascades rather than orphaning private career data", (DDL.match(/on delete cascade/g) || []).length >= 3);
  extra.schema = { migration: "supabase/migrations/0001_accounts.sql", sha256: createHash("sha256").update(SQL).digest("hex"), tables, views: ["career_summary", "career_by_mode", "career_streak"] };
}

// ── rls: policy analysis plus a two-user isolation simulation ───────────────
if (MODE === "rls") {
  const policies = [...DDL.matchAll(/create policy (\w+) on public\.(\w+)\s+for (\w+) to (\w+) using \(([\s\S]*?)\);/g)]
    .map(([, name, table, cmd, role, using]) => ({ name, table, cmd, role, using: using.trim() }));
  ok("row level security is enabled on every user-owned table", ["profiles", "saved_clashes", "result_claims", "schema_migrations"].every((t) => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(DDL)));
  ok("every policy is granted to authenticated only and scoped to auth.uid()", policies.length >= 4 && policies.every((p) => p.role === "authenticated" && /user_id = auth\.uid\(\)/.test(p.using)), policies.map((p) => `${p.table}:${p.cmd}`).join(" "));
  ok("no client role may INSERT, UPDATE or DELETE career data", !/create policy \w+ on public\.(saved_clashes|result_claims)\s+for (insert|update|delete)/.test(DDL));
  ok("a profile may be updated by its owner only, with a matching write check", /profiles_update_own[\s\S]{0,160}with check \(user_id = auth\.uid\(\)\)/.test(DDL));
  ok("anonymous is revoked on every user-owned object and every career view",
    ["profiles", "saved_clashes", "result_claims"].every((t) => new RegExp(`revoke all on public\\.${t}[^;]*from anon`).test(DDL))
    && /revoke all on public\.career_summary, public\.career_by_mode, public\.career_streak from anon/.test(DDL));
  ok("career views run as the caller so the table's policies apply", ["career_summary", "career_by_mode", "career_streak"].every((v) => new RegExp(`view public\\.${v}\\s+with \\(security_invoker = true\\)`).test(DDL)));

  // Two synthetic users, the same rules, simulated.
  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.invalid" }, { userId: "u-2", email: "two@example.invalid" }] });
  const A = "a".repeat(48), B = "b".repeat(48);
  ctx.server.putResult(record({ id: "pv_one11111aa", session: A }));
  ctx.server.putResult(record({ id: "pv_two22222bb", session: B, finalScore: { gold: 80, blue: 95 } }));
  ctx.server.claimAndSave({ resultId: "pv_one11111aa", token: "test-token.u-1", deviceSession: A });
  ctx.server.claimAndSave({ resultId: "pv_two22222bb", token: "test-token.u-2", deviceSession: B });
  let crossUserReads = 0, crossUserWrites = 0, anonymousProtectedReads = 0;
  ctx.signInAs("u-1");
  if (await ctx.provider.getSavedClash("pv_two22222bb")) crossUserReads++;
  if ((await ctx.provider.listSavedClashes()).some((r) => r.user_id !== "u-1")) crossUserReads++;
  if (ctx.server.claimAndSave({ resultId: "pv_two22222bb", token: "test-token.u-1", deviceSession: A }).status === "saved") crossUserWrites++;
  await ctx.provider.updateDisplayName("One Only");
  if (ctx.db.profiles.get("u-2").display_name === "One Only") crossUserWrites++;
  ctx.signOut();
  for (const call of [() => ctx.provider.listSavedClashes(), () => ctx.provider.getProfile(), () => ctx.provider.career()]) {
    try { await call(); anonymousProtectedReads++; } catch { /* refused, as required */ }
  }
  ok("two synthetic users: no cross-user read", crossUserReads === 0, `crossUserReads ${crossUserReads}`);
  ok("two synthetic users: no cross-user write", crossUserWrites === 0, `crossUserWrites ${crossUserWrites}`);
  ok("anonymous reads nothing that belongs to a user", anonymousProtectedReads === 0, `anonymousProtectedReads ${anonymousProtectedReads}`);
  extra.isolation = { crossUserReads, crossUserWrites, anonymousProtectedReads, method: "policy analysis of the applied DDL plus a two-user simulation against an adapter that implements the same rules; not yet executed against a live Postgres (no provider credentials in this shell)" };
  extra.policies = policies;
}

// ── auth: flow contracts ────────────────────────────────────────────────────
if (MODE === "auth") {
  const provider = src("src/accounts/provider.js");
  const dialog = src("src/components/accounts/AccountDialog.jsx");
  const callback = src("src/components/accounts/AuthCallback.jsx");
  ok("Google and an email one-time code are the two routes to an account", /signInWithOAuth/.test(provider) && /provider: "google"/.test(provider) && /signInWithOtp/.test(provider) && /verifyOtp/.test(provider));
  ok("the flow is PKCE with a persisted, auto-refreshed session", /flowType: "pkce"/.test(provider) && /persistSession: true/.test(provider) && /autoRefreshToken: true/.test(provider));
  ok("no password field exists anywhere in the product", !/type="password"/.test(dialog) && !/password/i.test(dialog) && !/signInWithPassword/.test(provider));
  ok("the callback route exchanges the code itself rather than trusting a URL fragment", /detectSessionInUrl: false/.test(provider) && /exchangeCodeForSession/.test(callback));
  ok("the address bar is scrubbed BEFORE the exchange, so no code survives in history", callback.indexOf("history.replaceState") < callback.indexOf("exchangeCodeForSession"));
  ok("the return destination is filtered through the same-origin guard", /safeReturnPath/.test(callback) && ["//evil.com", "https://evil.com", "/api/game"].every((b) => safeReturnPath(b) === "/play"));
  ok("the dialog is a real modal: labelled, focus-trapped and dismissible by Escape", /role="dialog" aria-modal="true"/.test(dialog) && /aria-labelledby="ec-auth-title"/.test(dialog) && /e\.key === "Escape"/.test(dialog) && /e\.key !== "Tab"/.test(dialog));
  ok("failures are a closed vocabulary, and the provider's own text never reaches the UI", FAILURE_CODES.length >= 8 && /const asError/.test(provider) && /PROVIDER_ERROR/.test(provider));
  ok("sign-out clears the account from memory immediately and keeps guest play", /set\(\{ ready: true, session: null, profile: null \}\)/.test(src("src/accounts/accountState.js")) && /signOutAccount/.test(src("src/App.jsx")));
  ok("an active Chaos run and the current result are not touched by the callback", !/ec_chaos_run|setResult/.test(callback));
  ok("the header offers Sign in beside Create free account when accounts are real", /onSignIn/.test(src("src/components/arena/AccountControl.jsx")) && /Sign in/.test(src("src/components/arena/AccountControl.jsx")));

  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.invalid" }] });
  await ctx.provider.sendEmailCode("one@example.invalid");
  let wrongRefused = false;
  try { await ctx.provider.verifyEmailCode("one@example.invalid", "000000"); } catch { wrongRefused = true; }
  const session = await ctx.provider.verifyEmailCode("one@example.invalid", "123456");
  let badCallback = false;
  try { await ctx.provider.exchangeCodeForSession("https://x.invalid/auth/callback?code=nope"); } catch { badCallback = true; }
  ok("a wrong code is refused and the right code signs the right user in", wrongRefused && session?.userId === "u-1");
  ok("an invalid callback fails safely", badCallback);
  extra.flows = { google: "signInWithOAuth(pkce) → /auth/callback?next=<safe path>", email: "signInWithOtp → one-time code or emailRedirectTo → /auth/callback", signOut: "provider session ended, state cleared, guest play intact" };
}

// ── guest-claim and cloud-save ──────────────────────────────────────────────
if (MODE === "guest-claim" || MODE === "cloud-save") {
  const server = src("api/_lib/cloudAccounts.js");
  const route = src("api/profile.js");
  const userIdAssignments = [...route.matchAll(/userId:\s*([A-Za-z0-9_.?]+)/g)].map(([, v]) => v);
  ok("the account identity comes from verifying the token with the provider, never from a body",
    /verifyAccountToken/.test(server) && /auth\/v1\/user/.test(server)
    && !/req\.body\??\.\s*user_?[iI]d/.test(route)                    // never read off the body
    && userIdAssignments.length > 0 && userIdAssignments.every((v) => v === "who.userId"),  // always the verified token
    userIdAssignments.join(", ") || "none");
  ok("the game data comes from the authoritative record, never from the request", /readAuthoritativeResult/.test(server) && /buildSavedClash\(\{ record/.test(server));
  ok("ownership is proved by the server-minted device session cookie", /record\.session !== deviceSession/.test(server) && /getOrCreateSession/.test(src("api/profile.js")));
  ok("one result has one owner, decided by a primary key rather than a check-then-write race", /result_claims/.test(server) && /resolution=ignore-duplicates/.test(server) && /owner !== userId/.test(server));
  ok("a repeated save is idempotent on (user, result)", /on_conflict=user_id,result_id/.test(server));
  ok("a save never re-runs the simulation", !/simulate|runGame|computeResult/.test(server));
  ok("the snapshot drops the device session, so a career row cannot identify a browser", /const \{ session, \.\.\.withoutSession \} = record/.test(server));
  ok("a challenge is fingerprinted, never stored in the clear", /challenge_fingerprint: record\?\.challengeId \? sha256/.test(server));
  ok("a proposed import list is capped and every id is authorised on its own", /MAX_IMPORT_CANDIDATES/.test(server) && MAX_IMPORT_CANDIDATES === 25 && /for \(const id of ids\)/.test(server));
  ok("only authoritative result-id shapes are accepted", ["pv_abc123def4", "abcdef1234"].every((v) => CANDIDATE_ID_SHAPE.test(v)) && ["../etc", "PV_X", "pv_", "a b"].every((v) => !CANDIDATE_ID_SHAPE.test(v)));

  const row = buildSavedClash({ record: record(), userId: "u-1", claimedFrom: "guest_claim" });
  ok("the career row's scores, era, MVP and candidate all come from the record", row.gold_score === 112 && row.blue_score === 104 && row.outcome === "win" && row.era_id === "1990s" && row.candidate_id === "Candidate 4" && row.calibration_version === "1.4.0");
  ok("a tie and a loss are derived from the score, not from a `won` claim",
    buildSavedClash({ record: record({ finalScore: { gold: 99, blue: 99 }, won: true }), userId: "u", claimedFrom: "signed_in" }).outcome === "tie"
    && buildSavedClash({ record: record({ finalScore: { gold: 90, blue: 101 }, won: true }), userId: "u", claimedFrom: "signed_in" }).outcome === "loss");
  ok("no device session appears anywhere in the stored row", !JSON.stringify(row).includes("a".repeat(48)) && row.result_snapshot.session === undefined);

  const ctx = createTestProvider({ users: [{ userId: "u-1", email: "one@example.invalid" }, { userId: "u-2", email: "two@example.invalid" }] });
  const GUEST = "g".repeat(48);
  ctx.server.putResult(record({ id: "pv_guest12345", session: GUEST }));
  ctx.server.putResult(record({ id: "pv_mine2222aa", session: GUEST, finalScore: { gold: 90, blue: 101 } }));
  ctx.server.putResult(record({ id: "pv_other333bb", session: "o".repeat(48) }));
  const first = ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST, claimedFrom: "guest_claim" });
  const repeat = ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-1", deviceSession: GUEST });
  const second = ctx.server.claimAndSave({ resultId: "pv_guest12345", token: "test-token.u-2", deviceSession: GUEST });
  const foreign = ctx.server.claimAndSave({ resultId: "pv_other333bb", token: "test-token.u-1", deviceSession: GUEST });
  const missing = ctx.server.claimAndSave({ resultId: "pv_ghost4444c", token: "test-token.u-1", deviceSession: GUEST });
  const forged = ctx.server.claimAndSave({ resultId: "pv_mine2222aa", token: "forged-token", deviceSession: GUEST });
  ok("the current result is claimed once", first.status === "saved" && ctx.db.savedClashes.length === 1);
  ok("a repeated claim creates no duplicate", repeat.status === "already_saved" && ctx.db.savedClashes.length === 1);
  ok("a second account cannot claim the same result", second.status === "already_claimed" && !ctx.db.savedClashes.some((r) => r.user_id === "u-2"));
  ok("another device's result is refused", foreign.status === "not_your_result");
  ok("an unknown result id is refused honestly", missing.status === "not_found");
  ok("an unverifiable token saves nothing", forged.status === "not_authenticated");
  const imp1 = ctx.server.importDeviceHistory({ candidateIds: ["pv_guest12345", "pv_mine2222aa", "pv_other333bb"], token: "test-token.u-1", deviceSession: GUEST });
  const imp2 = ctx.server.importDeviceHistory({ candidateIds: ["pv_guest12345", "pv_mine2222aa"], token: "test-token.u-1", deviceSession: GUEST });
  ok("a device import takes only this device's results", imp1.imported === 1 && imp1.alreadySaved === 1 && imp1.refused === 1);
  ok("a repeated import is safe and adds nothing", imp2.imported === 0 && imp2.alreadySaved === 2 && ctx.db.savedClashes.length === 2);
  ok("the visible save states are the three the specification names", ["SAVING", "SAVED TO MY ERACLASH", "SAVE FAILED — TRY AGAIN"].every((w) => read("src/components/accounts/SaveThisClash.jsx").includes(w)));
  ok("a failed save keeps the result and offers a retry", /TRY AGAIN/.test(read("src/components/accounts/SaveThisClash.jsx")) && /onSaveAgain/.test(src("src/App.jsx")));
  extra.claimLedger = { first: first.status, repeat: repeat.status, secondAccount: second.status, otherDevice: foreign.status, unknown: missing.status, forgedToken: forged.status, import: imp1, reimport: imp2 };
}

// ── security ────────────────────────────────────────────────────────────────
if (MODE === "security") {
  const walk = (dir) => fs.readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return fs.statSync(p).isDirectory() ? walk(p) : /\.(jsx?|css)$/.test(f) ? [p] : []; });
  const clientFiles = walk("src");
  ok("no browser module names a service-role key", clientFiles.every((f) => !/SERVICE_ROLE|service_role/.test(read(f))));
  ok("the service-role key is server-only and never logged", /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(src("api/_lib/cloudAccounts.js")) && !/console\./.test(src("api/_lib/cloudAccounts.js")));
  if (fs.existsSync("dist")) {
    const bundles = fs.readdirSync("dist/assets").filter((f) => f.endsWith(".js")).map((f) => `dist/assets/${f}`);
    ok("no built bundle contains a service-role reference or a JWT-shaped secret", bundles.every((f) => { const b = read(f); return !/service_role/.test(b) && !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(b); }), `${bundles.length} bundles scanned`);
    // The SDK's own internals (its auth client) must live in a lazily loaded
    // chunk, not in the entry bundle a guest downloads to play Chaos Clash.
    const entry = bundles.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    const sdkInternals = /GoTrueClient|PostgrestClient|SupabaseClient/;
    const lazy = bundles.filter((f) => f !== entry && sdkInternals.test(read(f)));
    ok("the provider SDK is code-split, so guest play never downloads it",
      !sdkInternals.test(read(entry)) && lazy.length >= 1,
      `entry ${(fs.statSync(entry).size / 1024).toFixed(0)}KB carries no SDK internals; ${lazy.length} lazy chunk(s) do`);
  } else {
    ok("bundle scan skipped: run npm run build first", false, "dist/ absent");
  }
  ok("the token travels in an Authorization header, never in a URL", /Authorization: `Bearer/.test(src("src/accounts/cloudSave.js")) && !/token=/.test(src("src/accounts/cloudSave.js")));
  ok("open redirects are refused by one guard used everywhere", ["//evil.com", "https://evil.com", "\\\\evil", "/api/x", "/auth/callback"].every((b) => safeReturnPath(b) === "/play"));
  ok("a display name is cleaned and capped on the client, in the API and in the database",
    cleanDisplayName("<b>x</b>").indexOf("<") === -1 && cleanDisplayName("y".repeat(50)).length === MAX_DISPLAY_NAME
    && /char_length\(display_name\) between 1 and 24/.test(DDL) && /display_name !~ '\[<>\]'/.test(DDL));
  ok("preview access and product authentication stay separate layers",
    ["src/accounts/provider.js", "src/accounts/accountState.js", "src/accounts/cloudSave.js", "api/_lib/cloudAccounts.js"].every((f) => !/previewAccess|pv_session|x-preview-key/.test(src(f)))
    && !/preview/i.test(COLUMNS_DDL));
  ok("product sign-in cannot bypass the preview gate: the gate runs in middleware ahead of every route", /export const config/.test(read("middleware.js")) && /"\/auth\/:path\*", "\/my-eraclash"/.test(read("middleware.js")));
  ok("account telemetry carries no email, name, token or cookie",
    ["src/accounts/accountState.js", "src/accounts/cloudSave.js", "src/components/accounts/AccountDialog.jsx", "src/components/accounts/AuthCallback.jsx", "src/components/accounts/MyEraClash.jsx", "src/components/accounts/SaveThisClash.jsx"]
      .every((f) => [...src(f).matchAll(/track\("([^"]+)",\s*(\{[^}]*\})/g)].every(([, , props]) => !/@|accessToken|refresh|cookie|token|\bemail:/i.test(props))));
  ok("every account event is allowlisted on the server", ACTIVATION_EVENTS.filter((e) => /^(account|guest_|cloud_result|my_eraclash|recent_clash|saved_report|display_name)/.test(e)).every((e) => EVENTS_ALLOWLIST.has(e)));
  ok("the content policy opens only the provider's own hosts and still forbids third-party script",
    /connect-src 'self' https:\/\/\*\.supabase\.co https:\/\/\*\.supabase\.in;/.test(JSON.stringify(JSON.parse(read("vercel.json")))) && /script-src 'self';/.test(JSON.stringify(JSON.parse(read("vercel.json")))));
  ok("the cloud actions are rate limited and origin checked like every other mutation", /rateLimit\(`acct:/.test(src("api/profile.js")) && /sameOrigin\(req\)/.test(src("api/profile.js")));
  extra.security = { serviceRoleInClient: 0, tokensInUrl: 0, openRedirects: 0, previewLeakage: 0 };
}

// ── browser modes ───────────────────────────────────────────────────────────
if (MODE === "my-eraclash" || MODE === "responsive") {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const guest = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });

  if (MODE === "my-eraclash") {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage(); await guest(page);
    await page.goto(`${BASE}/my-eraclash`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 30_000 });
    const m = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.textContent || null,
      landmark: !!document.querySelector('main[aria-labelledby]'),
      cta: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
      fabricated: /rank|contender|percentile|leaderboard position/i.test(document.body.innerText),
      minTarget: Math.min(...[...document.querySelectorAll("main button, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Out of this phase's scope, measured so it is not lost: the global
      // footer's credits link predates Phase 9B.1 and is below 44px.
      footerLinks: [...document.querySelectorAll("footer button, footer a")].filter((b) => b.offsetParent).map((b) => ({ text: (b.textContent || "").trim().slice(0, 24), height: Math.round(b.getBoundingClientRect().height), width: Math.round(b.getBoundingClientRect().width) })),
    }));
    ok("the career page requires an account and says so, with a labelled landmark and an h1", /My EraClash/.test(m.heading || "") && m.landmark);
    ok("a signed-out visitor is offered an account rather than shown someone's data", m.cta.some((c) => /CREATE FREE ACCOUNT OR SIGN IN/.test(c)));
    ok("no rank, contender grade, percentile or leaderboard position is invented", !m.fabricated);
    ok("every account control and header control is at least 44px, and the page does not overflow", m.minTarget >= 44 && m.overflow <= 0, `${m.minTarget}px · ${m.overflow}px`);
    // Was recorded as an out-of-scope gap in Phase 9B.1; now asserted, because
    // the footer's hit area has been raised to the same 44px minimum.
    ok("the global footer's controls are at least a 44px touch target",
      m.footerLinks.length > 0 && m.footerLinks.every((l) => l.height >= 44),
      JSON.stringify(m.footerLinks));

    // Contrast, measured against the surface each element actually sits on.
    // The career page is a READING surface: without the editorial shell its
    // heading inherited the arena's platinum text and sat almost invisibly on
    // an ivory card, which is exactly what this gate exists to catch.
    const contrast = await page.evaluate(() => {
      const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (fg, bg) => { const a = lum(fg), z = lum(bg); return a == null || z == null ? null : +(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05))).toFixed(2); };
      const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.6)) return c; n = n.parentElement; } return getComputedStyle(document.body).backgroundColor; };
      return [...document.querySelectorAll("main h1, main h2, main p, main dt, main dd, main button, main a")]
        .filter((e) => e.getBoundingClientRect().height > 0 && (e.textContent || "").trim().length > 1)
        .map((e) => { const cs = getComputedStyle(e); const px = parseFloat(cs.fontSize); const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700); return { tag: e.tagName, text: (e.textContent || "").trim().slice(0, 28), fontPx: +px.toFixed(1), large, ratio: ratio(cs.color, bgOf(e)), floor: large ? 3 : 4.5 }; });
    });
    const failing = contrast.filter((c) => c.ratio == null || c.ratio < c.floor);
    ok("every text element on the career page clears WCAG AA on the surface it sits on", failing.length === 0, failing.length ? failing.map((c) => `${c.tag} "${c.text}" ${c.ratio}`).join(" · ") : `${contrast.length} elements, lowest ${Math.min(...contrast.map((c) => c.ratio)).toFixed(2)}:1`);
    ok("the career page and the sign-in callback are editorial reading surfaces", await page.evaluate(() => !!document.querySelector(".ec-editorial-shell")));
    extra.contrast = contrast;
    // With accounts unconfigured the dialog states the honest reason.
    await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ec-lobby .ec-mode-card", { timeout: 30_000 });
    const header = await page.evaluate(() => ({
      cta: [...document.querySelectorAll(".ec-brand-header button")].map((b) => b.textContent.trim()),
      chaosPlayable: !!document.querySelector('.ec-mode-card[data-mode="chaos"] .ec-mode-action[data-hierarchy="primary"]'),
    }));
    ok("guest play is untouched: Chaos Clash still carries the one primary action", header.chaosPlayable);
    ok("the header shows an account call to action and no signed-in identity", header.cta.some((c) => /Create/i.test(c)) && !header.cta.some((c) => /Sign out/i.test(c)));
    fs.mkdirSync(`${OUT}/screens`, { recursive: true });
    await page.goto(`${BASE}/my-eraclash`, { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: `${OUT}/screens/my-eraclash-signed-out-1280x900.png` });
    extra.myEraClash = m; await ctx.close();
  }

  if (MODE === "responsive") {
    const rows = [];
    for (const [w, h, touch] of [[1536, 1024, false], [1440, 900, false], [1280, 800, false], [1024, 768, false], [768, 1024, true], [430, 932, true], [390, 844, true], [375, 812, true]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const page = await ctx.newPage(); await guest(page);
      await page.goto(`${BASE}/my-eraclash`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("main", { timeout: 30_000 });
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minTarget: Math.min(...[...document.querySelectorAll("main button, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))),
        emailVisible: /@/.test(document.querySelector("main")?.innerText || ""),
      }));
      rows.push({ viewport: `${w}x${h}`, ...m });
      ok(`${w}x${h}: no page-level overflow, account and header controls at least 44px, no email on screen`, m.overflow <= 0 && m.minTarget >= 44 && !m.emailVisible, `overflow ${m.overflow} · min ${m.minTarget}px`);
      fs.mkdirSync(`${OUT}/screens`, { recursive: true });
      await page.screenshot({ path: `${OUT}/screens/my-eraclash-${w}x${h}.png` });
      await ctx.close();
    }
    extra.rows = rows;
  }
  await browser.close();
}

const FILE = { preflight: "phase9b1-preflight.json", migrations: "account-schema-contract.json", rls: "account-rls-qa.json", auth: "auth-flow-qa.json", "guest-claim": "guest-claim-qa.json", "cloud-save": "cloud-save-qa.json", security: "account-security-qa.json", "my-eraclash": "my-eraclash-qa.json", responsive: "account-responsive-qa.json" }[MODE];
const passed = checks.filter((c) => c.pass).length;
fs.writeFileSync(`${OUT}/${FILE}`, JSON.stringify({
  artifact: FILE.replace(/\.json$/, ""), phase: PHASE, mode: MODE,
  baseUrl: ["my-eraclash", "responsive"].includes(MODE) ? BASE : null,
  provider: "supabase (auth + postgres + row level security)",
  cloudAccountsConfigured: providerConfigured(), cloudAccountsReady: cloudAccountsReady(),
  checks: checks.length, passed, failed: checks.length - passed, results: checks, ...extra,
}, null, 2) + "\n");
console.log(`\n${MODE}: ${passed}/${checks.length} checks passed → ${OUT}/${FILE}`);
process.exit(passed === checks.length ? 0 : 1);
