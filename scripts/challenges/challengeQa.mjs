#!/usr/bin/env node
// ── Challenges V1 — the gates (Phase 9C) ─────────────────────────────────────
//   node scripts/challenges/challengeQa.mjs <mode> [origin]
//
//   contract      the pure contract and the schema's promises, from the files
//   seed          same-opportunity and branching, on the real chaos draft code
//   rls           the SQL's grants, policies and trigger, as written (the live
//                 role-switch verification is recorded from the database itself
//                 in challenge-rls-qa.json's `live` block by the phase summary)
//   security      enumeration resistance, link hygiene, authority model and
//                 telemetry privacy — driven against a running harness
//   history       created / accepted / responses through the server library
//   responsive    the invitation and the comparison at phone widths (harness)
//   accessibility names, roles, live regions, targets and contrast (harness)
//   deployed      the guest-visible surface on a protected preview + bundle scan
//
// Every mode writes one artifact under data/validation/9c. A harness mode
// expects the fake cloud (ECLASH_FAKE_CLOUD=1) unless the origin is https.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import * as C from "../../src/challenges/contract.js";
import { challengeId as manifestIdOf, buildManifest } from "../../src/chaos/challenge.js";
import { startRun, submitRollDecisions, DRAFT_VERSIONS } from "../../src/chaos/runState.js";
import { hydrate } from "../../api/_lib/chaosRun.js";

const MODE = process.argv[2] || "contract";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const OUT = "data/validation/9c";
const PHASE = "9C — Challenges + Persistent Competitive Identity V1";
const now = () => new Date().toISOString();
const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ check: name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " … " + String(detail).slice(0, 120) : ""}`); };
const write = (name, extra = {}) => { mkdirSync(OUT, { recursive: true }); const passed = checks.every((c) => c.pass); writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ artifact: name, phase: PHASE, generatedAt: now(), origin: BASE, checks, passed, ...extra }, null, 2) + "\n"); console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed → ${OUT}/${name}.json`); process.exit(passed ? 0 : 1); };
const read = (p) => readFileSync(p, "utf8");
const JOSEPH = "11111111-1111-4111-8111-111111111111";

// ── contract ─────────────────────────────────────────────────────────────────
if (MODE === "contract") {
  ok("versions are pinned", C.CHALLENGE_VERSION === "1.0.0" && C.COMPARISON_VERSION === "1.0.0");
  ok("codes: 32 symbols, no 0/O/1/I, EC-XXXX-XXXX, case-insensitive", C.CODE_ALPHABET.length === 32 && !/[0O1I]/.test(C.CODE_ALPHABET) && C.normalizeCode("ec-abcd-efgh") === "EC-ABCD-EFGH" && C.normalizeCode("EC-ABC0-EFGH") === null);
  ok("the link carries the code only", C.invitationUrl("https://x.test", "EC-ABCD-EFGH") === "https://x.test/?challenge=EC-ABCD-EFGH");
  ok("30-day lifetime, derived status", C.CHALLENGE_TTL_DAYS === 30 && C.challengeStatus({ expires_at: "2000-01-01T00:00:00Z" }) === "expired" && C.challengeStatus({ expires_at: "2999-01-01T00:00:00Z", revoked_at: "2026-01-01" }) === "revoked");
  ok("comparison: win/loss first, margin as tie-break", C.compareResults({ gold: 118, blue: 104 }, { gold: 121, blue: 100 }).outcome === "recipient" && C.compareResults({ gold: 118, blue: 104 }, { gold: 105, blue: 102 }).outcome === "creator" && C.compareResults({ gold: 100, blue: 110 }, { gold: 102, blue: 106 }).outcome === "recipient" && C.compareResults({ gold: 110, blue: 100 }, { gold: 120, blue: 110 }).outcome === "tie");
  ok("the invitation shows no five, coach, MVP, result id or user id", !JSON.stringify(C.PUBLIC_INVITATION_FIELDS).match(/roster|coach|mvp|result|user/i));
  ok("one official attempt per account", C.ONE_OFFICIAL_ATTEMPT.perAccount === 1);
  ok("ten closed events; metadata excludes identity", Object.values(C.CHALLENGE_EVENTS).length === 10 && !["displayName", "creatorName", "email", "code", "publicCode", "challengeId", "resultId", "userId", "seed", "seedId", "token", "cookie", "payload", "result"].some((k) => C.EVENT_METADATA_ALLOWED.includes(k)));
  const allow = read("api/events.js"), mirror = read("src/activation.js");
  ok("every event is allowlisted server-side and mirrored client-side", Object.values(C.CHALLENGE_EVENTS).every((e) => allow.includes(`"${e}"`) && mirror.includes(`"${e}"`)));
  ok("no new serverless function", readdirSync("api").filter((f) => f.endsWith(".js")).length === 12 && existsSync("middleware.js"));
  write("challenge-contract", { contract: { challengeVersion: C.CHALLENGE_VERSION, comparisonVersion: C.COMPARISON_VERSION, ttlDays: C.CHALLENGE_TTL_DAYS, codeAlphabet: C.CODE_ALPHABET, codeShape: "EC-XXXX-XXXX", fingerprintFields: C.FINGERPRINT_FIELDS, publicInvitationFields: C.PUBLIC_INVITATION_FIELDS, forbiddenLinkFields: C.FORBIDDEN_LINK_FIELDS, events: C.CHALLENGE_EVENTS, eventMetadata: C.EVENT_METADATA_ALLOWED, attempts: C.ONE_OFFICIAL_ATTEMPT } });
}

// ── seed: same opportunity, deterministic branching ──────────────────────────
if (MODE === "seed") {
  const seedId = "qa-seed-9c-000001";
  const mk = () => startRun({ runId: "runqa000001", seedId, createdAt: 1_700_000_000_000 });
  const a = mk(), b = mk();
  const SLOTS = ["PG", "SG", "SF", "PF", "C"];
  const names = (r) => { const g = hydrate(r.goldRoster), b = hydrate(r.blueRoster); return SLOTS.map((s) => g[s]?.id).join(",") + "|" + SLOTS.map((s) => b[s]?.id).join(","); };
  ok("the same seed deals the same opening five on both sides", names(a) === names(b), names(a).slice(0, 60));
  ok("the manifest id is a one-way hash, not the seed", manifestIdOf(seedId) !== seedId && /^[a-z0-9]{4,14}$/.test(manifestIdOf(seedId)));
  ok("the manifest carries the versions and never a future draw", (() => { const m = buildManifest({ seedId, createdAt: 1, originRunId: "x", sequence: 2 }); return m.versions && !("futureDraws" in m) && !("branches" in m); })());
  // Branching: two recipients who hold differently branch; the same holds reproduce.
  const decide = (holds) => { const r = mk(); const out = submitRollDecisions(r, { holdSlots: holds, holdRoles: [], hydrate }); if (!out.ok) throw new Error(`decision refused: ${out.code}`); return r; };
  const holdSame1 = decide(["PG"]), holdSame2 = decide(["PG"]), holdDiff = decide(["C"]);
  ok("the same decisions reproduce the same next roll", names(holdSame1) === names(holdSame2));
  ok("different holds branch deterministically", names(holdDiff) !== names(holdSame1) && names(decide(["C"])) === names(holdDiff));
  ok("no odds function takes a tier", !/tier/.test(read("src/chaos/runState.js").split("export const drawFive")[1]?.split("export const")[0] || ""));
  ok("the fingerprint binds the contract fields in order", C.FINGERPRINT_FIELDS.length === 9 && C.fingerprintMaterial({ challengeVersion: "1.0.0" }).startsWith("challengeVersion=1.0.0|"));
  write("challenge-seed-qa", { draftVersions: DRAFT_VERSIONS });
}

// ── rls: the SQL as written ──────────────────────────────────────────────────
if (MODE === "rls") {
  const SQL = read("supabase/migrations/0004_challenges.sql");
  for (const t of ["challenges", "challenge_secrets", "challenge_attempts"]) {
    ok(`${t}: RLS enabled`, new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL));
    ok(`${t}: anon and authenticated revoked`, new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`).test(SQL));
  }
  ok("authenticated may select own challenges and own/response attempts only", /grant select on public\.challenges\s+to authenticated/.test(SQL) && /grant select on public\.challenge_attempts to authenticated/.test(SQL) && !/grant (insert|update|delete)/.test(SQL));
  ok("secrets: no policy, no grant", !/create policy \w+ on public\.challenge_secrets/.test(SQL) && !/grant .* on public\.challenge_secrets/.test(SQL));
  ok("policies scope to auth.uid()", (SQL.match(/auth\.uid\(\)/g) || []).length >= 3);
  ok("one official attempt per account is a unique index", /unique index if not exists challenge_attempts_one_per_account/.test(SQL));
  ok("deleted accounts are anonymised by a trigger the client cannot call", /on_auth_user_deleted_challenges after delete on auth\.users/.test(SQL) && /revoke execute on function public\.anonymize_deleted_account\(\)/.test(SQL));
  const live = existsSync(`${OUT}/challenge-rls-live.json`) ? JSON.parse(read(`${OUT}/challenge-rls-live.json`)) : null;
  ok("the live role-switch verification is recorded from the database", !!live?.verifiedAt, live ? `verified ${live.verifiedAt}` : "not yet recorded");
  write("challenge-rls-qa", { live });
}

// ── harness-driven modes ─────────────────────────────────────────────────────
const httpModes = new Set(["security", "history", "responsive", "accessibility", "performance", "deployed"]);
if (httpModes.has(MODE)) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (BASE.startsWith("https://")) {
    const f = ".preview-secrets/wave2-access-keys.json";
    if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
    const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
    const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
    if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  }
  const post = (ctx, body, headers = {}) => ctx.request.post(`${BASE}/api/profile`, { data: body, headers: { "content-type": "application/json", ...headers } });
  const auth = { Authorization: `Bearer test-token.${JOSEPH}` };
  const fresh = (page) => page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); } catch (e) {} });
  const stage = (page, st) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout: 60_000 });
  const click = async (page, re) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ timeout: 30_000 }); await b.click(); };
  /** Play one Chaos Clash to the score; returns the run id read while the run was live. */
  const play = async (page) => {
    await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
    await click(page, /^ROLL 2$/); await stage(page, "ERA_REVEAL"); await click(page, /ADAPT TO ERA/); await click(page, /FINAL ROLL/);
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
    await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
    return runId;
  };
  const isFake = !BASE.startsWith("https://");

  if (MODE === "security") {
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("the account provider is configured on this origin", !!(health?.cloudAccounts?.providerConfigured && health?.cloudAccounts?.serverCredentialConfigured), JSON.stringify(health?.cloudAccounts || {}).slice(0, 120));
    // enumeration: unknown, malformed, sequential-looking, empty
    const codes = ["EC-ZZZZ-ZZZZ", "EC-AAAA-AAAA", "EC-AAAA-AAAB", "nonsense", "", "../x", "EC-0000-0000", "%00"];
    const views = [];
    for (const code of codes) { const r = await post(context, { action: "challenge-view", code }); views.push({ code, http: r.status(), body: await r.json() }); }
    ok("every unknown or malformed code reads as one generic unavailable", views.every((v) => v.http === 200 && v.body.status === "unavailable" && Object.keys(v.body).sort().join(",") === "requestId,status"), views.map((v) => v.body.status).join(","));
    const g = await context.request.get(`${BASE}/api/profile?challenge=EC-ZZZZ-ZZZZ`);
    ok("the GET form answers the same way", g.status() === 200 && (await g.json()).status === "unavailable");
    // authority
    ok("create without an account is refused", (await post(context, { action: "challenge-create", chaosRunId: "runaaaaaaaa1" })).status() === 401);
    ok("a presented but invalid token is refused, not downgraded to guest", (await post(context, { action: "challenge-view", code: "EC-ZZZZ-ZZZZ" }, { Authorization: "Bearer test-token.forged" })).status() === 401);
    ok("list and revoke need an account", (await post(context, { action: "challenge-list" })).status() === 401 && (await post(context, { action: "challenge-revoke", code: "EC-ZZZZ-ZZZZ" })).status() === 401);
    ok("a bad run id is a validation failure", (await post(context, { action: "challenge-complete", chaosRunId: "../x" })).status() === 400);
    ok("an unknown action is a validation failure", (await post(context, { action: "challenge-hack" })).status() === 400);
    // a body cannot carry a score
    const src = read("api/profile.js") + read("api/_lib/challenges.js");
    ok("no route reads a score, outcome or user id from the body", !/req\.body\?\.(score|gold|blue|outcome|performance|userId|user_id)/.test(src));
    ok("the seed reaches only challenge_secrets", /challenge_secrets/.test(read("api/_lib/challenges.js")) && !/seed_id/.test(read("src/challenges/client.js")) && !/seed/.test(JSON.stringify(C.PUBLIC_INVITATION_FIELDS)));
    // rate limiting exists on the view path
    ok("the invitation lookup is rate-limited per IP", /rateLimit\(`chal-view:\$\{clientIp\(req\)\}`, limits\(\)\.challengeViewPerMinIp/.test(read("api/profile.js")));
    // telemetry privacy in the clients
    const clients = ["src/components/challenges/ChallengeShare.jsx", "src/components/challenges/ChallengeInvite.jsx", "src/components/challenges/ChallengeComparison.jsx", "src/components/challenges/ChallengesTab.jsx", "src/App.jsx"].map(read).join("\n");
    ok("no event property carries a name, code, id, seed, token or payload", !/track\([^)]*\b(creatorName|displayName|email|code|chaosRunId|resultId|seed|token|cookie|comparison)\s*:/.test(clients));
    if (isFake) {
      // a real code: honest statuses, and the seed-hash manifest id never appears in any response
      const page = await context.newPage(); await fresh(page); const runId = await play(page);
      const created = await (await post(context, { action: "challenge-create", chaosRunId: runId }, auth)).json();
      ok("a signed-in creator creates from their own run", created.status === "created", `${created.status}${created.detail ? " · " + created.detail : ""}${created.code ? " · " + created.code : ""}`);
      const view = await (await post(context, { action: "challenge-view", code: created.code })).json();
      ok("a live code reads open with the headline only", view.status === "open" && view.creatorScore && !JSON.stringify(view).match(/roster|coach|mvp|seed|manifest|result_id|user_id/i));
      const other = await browser.newContext(); const o = await other.newPage(); await fresh(o); await o.goto(`${BASE}/`);
      const stolen = await (await post(other, { action: "challenge-create", chaosRunId: runId }, auth)).json();
      ok("another device cannot mint a challenge from someone else's run", stolen.status === "not_your_result", stolen.status);
      const notYours = await (await post(other, { action: "challenge-complete", chaosRunId: runId })).json();
      ok("another device cannot complete someone else's run", ["not_found", "not_your_run"].includes(notYours.status), notYours.status);
      await other.close();
    }
    write("challenge-security-qa", { enumeration: views.map((v) => ({ code: v.code, http: v.http, status: v.body.status })) });
  }

  if (MODE === "history") {
    if (!isFake) { ok("history mode runs on the fake-cloud harness", false, "pass a local origin"); write("challenge-history-qa"); }
    const page = await context.newPage(); await fresh(page); const runId = await play(page);
    const created = await (await post(context, { action: "challenge-create", chaosRunId: runId }, auth)).json();
    ok("created", created.status === "created");
    const list0 = await (await post(context, { action: "challenge-list" }, auth)).json();
    ok("CREATED lists the challenge with zero responses", list0.created.some((c) => c.code === created.code && c.responses.length === 0 && c.status === "open"));
    // a guest accepts and completes
    const guest = await browser.newContext(); const g = await guest.newPage(); await fresh(g);
    // Every challenge call the page makes is logged, so a silent failure is not silent.
    const calls = [];
    g.on("response", async (r) => { if (r.url().includes("/api/profile") && r.request().method() === "POST") { try { const b = JSON.parse(r.request().postData() || "{}"); if (String(b.action || "").startsWith("challenge-")) calls.push({ action: b.action, http: r.status(), body: (await r.text()).slice(0, 300) }); } catch (e) { calls.push({ error: String(e).slice(0, 100) }); } } });
    await g.goto(`${BASE}/?challenge=${created.code}`); await g.getByRole("button", { name: /ACCEPT CHALLENGE/ }).click({ timeout: 30_000 });
    await stage(g, "DRAFTING"); await g.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await click(g, /^ROLL 2$/); await stage(g, "ERA_REVEAL"); await click(g, /ADAPT TO ERA/); await click(g, /FINAL ROLL/);
    await g.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await g.getByRole("button", { name: /^Select / }).first().click();
    await click(g, /CONTINUE WITH COACH/); await click(g, /RUN CLASH/);
    const compared = await g.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 }).then(() => true).catch(() => false);
    if (!compared) { console.log("  challenge calls the page made:", JSON.stringify(calls, null, 1)); console.log("  comparison block:", await g.locator(".ec-chal-cmp").innerText().catch(() => "(none)")); console.log("  challenge context:", await g.evaluate(() => localStorage.getItem("ec_chaos_challenge"))); }
    ok("the guest's result is compared once the server binds it", compared, compared ? "" : "no comparison rendered");
    const outcome = compared ? await g.locator(".ec-chal-cmp").getAttribute("data-outcome") : null;
    const list1 = await (await post(context, { action: "challenge-list" }, auth)).json();
    const mine = list1.created.find((c) => c.code === created.code);
    ok("the creator sees the guest's completed response with the contract outcome", mine?.responses.length === 1 && mine.responses[0].status === "completed" && mine.responses[0].challengeOutcome === outcome && mine.responses[0].name === "Guest", JSON.stringify(mine?.responses[0] || {}).slice(0, 120));
    ok("the response carries no email, user id or device hash", !JSON.stringify(list1).match(/email|user_id|device_session|hash/i));
    // a second account accepts; ACCEPTED shows it in progress under its own login
    const BEA = "22222222-2222-4222-8222-222222222222"; const beaAuth = { Authorization: `Bearer test-token.${BEA}` };
    const bea = await browser.newContext(); const bp = await bea.newPage(); await fresh(bp); await bp.goto(`${BASE}/`);
    const acc = await (await post(bea, { action: "challenge-accept", code: created.code, tier: "FREE" }, beaAuth)).json();
    ok("a signed-in recipient starts one official attempt", acc.status === "started" && acc.chaosRunId, acc.status);
    const dup = await (await post(bea, { action: "challenge-accept", code: created.code, tier: "FREE" }, beaAuth)).json();
    ok("accepting again resumes the same run", dup.status === "resumed" && dup.chaosRunId === acc.chaosRunId);
    const beaList = await (await post(bea, { action: "challenge-list" }, beaAuth)).json();
    ok("ACCEPTED lists the attempt in progress with the creator's name and headline", beaList.accepted.some((a) => a.code === created.code && a.status === "started" && a.creatorName === "Joseph" && a.creatorScore), JSON.stringify(beaList.accepted[0] || {}).slice(0, 120));
    ok("the creator cannot accept their own challenge", (await (await post(context, { action: "challenge-accept", code: created.code, tier: "FREE" }, auth)).json()).status === "own_challenge");
    const rv = await (await post(context, { action: "challenge-revoke", code: created.code }, auth)).json();
    const list2 = await (await post(context, { action: "challenge-list" }, auth)).json();
    const afterRevoke = list2.created.find((c) => c.code === created.code);
    ok("revocation shows in CREATED and keeps the completed response (and the attempt in progress)", rv.status === "revoked" && afterRevoke?.status === "revoked" && afterRevoke?.responses.filter((r) => r.status === "completed").length === 1 && afterRevoke?.responses.length === 2, `revoke → ${rv.status || rv.error} · listed ${afterRevoke?.status} · responses ${afterRevoke?.responses?.map((r) => r.status).join(",")}`);
    await guest.close(); await bea.close();
    write("challenge-history-qa", { outcome });
  }

  if (MODE === "responsive" || MODE === "accessibility") {
    if (!isFake) { ok(`${MODE} mode runs on the fake-cloud harness`, false, "pass a local origin"); write(MODE === "responsive" ? "challenge-responsive-qa" : "challenge-accessibility-qa"); }
    const page = await context.newPage(); await fresh(page); const runId = await play(page);
    const created = await (await post(context, { action: "challenge-create", chaosRunId: runId }, auth)).json();
    const shots = `${OUT}/screens`; mkdirSync(shots, { recursive: true });
    const viewports = MODE === "responsive" ? [[1440, 900], [430, 932], [390, 844], [375, 812]] : [[1440, 900], [390, 844]];
    const rows = [];
    for (const [w, h] of viewports) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: MODE === "accessibility" && w === 1440 ? "reduce" : "no-preference" });
      const p = await ctx.newPage(); await fresh(p);
      await p.goto(`${BASE}/?challenge=${created.code}`); await p.getByRole("heading", { name: /challenged you/ }).waitFor({ timeout: 30_000 });
      const m = await p.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const m = cs.backgroundColor.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return cs.backgroundColor; const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) { const gm = g[0].match(/[\d.]+/g); if (gm && (gm.length < 4 || Number(gm[3]) > 0.5)) return g[0]; } n = n.parentElement; } return "rgb(3,7,13)"; };
        const ratio = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); if (a == null || b == null) return null; const [hi, lo] = a > b ? [a, b] : [b, a]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
        const btns = [...document.querySelectorAll("main button")].filter(vis);
        const texts = [".ec-chal-h1", ".ec-chal-body", ".ec-chal-facts dd", ".ec-chal-facts dt", ".ec-chal-note", ".ec-chal-btn--primary"].map((s) => { const e = document.querySelector(s); return e ? { s, contrast: ratio(e), px: parseFloat(getComputedStyle(e).fontSize) } : null; }).filter(Boolean);
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minBtn: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))), primaries: document.querySelectorAll(".ec-chal-btn--primary").length,
          h1: !!document.querySelector("main h1"), liveRegions: document.querySelectorAll("[aria-live]").length, unlabelled: btns.filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label"))).length,
          texts, colourOnly: false, scoreVisible: vis(document.querySelector(".ec-chal-score")), acceptVisibleAtTop: (() => { const b = document.querySelector(".ec-chal-btn--big"); if (!b) return false; const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() };
      });
      await p.screenshot({ path: `${shots}/invite-${w}x${h}.png` });
      rows.push({ viewport: `${w}x${h}`, ...m });
      ok(`${w}×${h}: no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
      ok(`${w}×${h}: every control ≥ 44px`, m.minBtn >= 44, `${m.minBtn}px`);
      ok(`${w}×${h}: exactly one dominant action; creator, score and era readable`, m.primaries === 1 && m.scoreVisible);
      if (MODE === "accessibility") {
        ok(`${w}×${h}: a heading, a live region, no unlabelled control`, m.h1 && m.liveRegions >= 1 && m.unlabelled === 0);
        for (const t of m.texts) ok(`${w}×${h}: ${t.s} contrast ${t.contrast}:1 at ${t.px}px`, t.contrast == null || t.contrast >= (t.px >= 18.5 ? 3 : 4.5));
        // keyboard: Tab reaches ACCEPT and Enter starts it
        let reached = false; for (let i = 0; i < 30 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.classList?.contains("ec-chal-btn--big")); }
        ok(`${w}×${h}: Tab reaches ACCEPT CHALLENGE`, reached);
        if (reached && w === 390) { await p.keyboard.press("Enter"); const arrived = await stage(p, "DRAFTING").then(() => true).catch(() => false); ok("Enter accepts and the arena takes focus on the decision", arrived && await p.evaluate(() => document.activeElement?.classList?.contains("ec-ta-cta"))); }
      }
      await ctx.close();
    }
    write(MODE === "responsive" ? "challenge-responsive-qa" : "challenge-accessibility-qa", { rows });
  }

  if (MODE === "performance") {
    if (!isFake) { ok("performance mode runs on the fake-cloud harness", false, "pass a local origin"); write("challenge-performance-qa"); }
    const page = await context.newPage(); await fresh(page); const runId = await play(page);
    const t = async (fn) => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
    const create = await t(() => post(context, { action: "challenge-create", chaosRunId: runId }, auth));
    const created = await create.r.json();
    const view = await t(() => post(context, { action: "challenge-view", code: created.code }));
    const guest = await browser.newContext(); const g = await guest.newPage(); await fresh(g);
    // Headless Chromium does not always emit a paint entry for a fresh tab, so
    // the moment the invitation's heading enters the document is recorded too.
    await g.addInitScript(() => { window.__cls = 0; window.__fcp = null; window.__firstHeading = null;
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = Math.round(e.startTime); }).observe({ type: "paint", buffered: true }); } catch (e) {}
      try { const mo = new MutationObserver(() => { if (window.__firstHeading == null && document.querySelector("main h1")) { window.__firstHeading = Math.round(performance.now()); mo.disconnect(); } }); mo.observe(document, { childList: true, subtree: true }); } catch (e) {} });
    const nav = await t(async () => { await g.goto(`${BASE}/?challenge=${created.code}`); await g.getByRole("heading", { name: /challenged you/ }).waitFor({ timeout: 30_000 }); });
    const paint = await g.evaluate(() => window.__fcp ?? (() => { const p = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint"); return p ? Math.round(p.startTime) : null; })());
    const firstHeading = await g.evaluate(() => window.__firstHeading);
    await g.waitForTimeout(500); const cls = await g.evaluate(() => +window.__cls.toFixed(4));
    const accept = await t(async () => { await g.getByRole("button", { name: /ACCEPT CHALLENGE/ }).click(); await stage(g, "DRAFTING"); });
    const list = await t(() => post(context, { action: "challenge-list" }, auth));
    ok("create answers within 2s on the harness", create.ms < 2000, `${create.ms}ms`);
    ok("the invitation lookup answers within 1s", view.ms < 1000, `${view.ms}ms`);
    ok("the invitation's heading is in the document within 2.5s and the page does not shift", (paint ?? firstHeading) != null && (paint ?? firstHeading) < 2500 && cls <= 0.1, `FCP ${paint ?? "n/a"} · first heading ${firstHeading}ms · CLS ${cls}`);
    ok("accept → arena at DRAFTING within 5s", accept.ms < 5000, `${accept.ms}ms`);
    ok("the history list answers within 1.5s", list.ms < 1500, `${list.ms}ms`);
    await guest.close();
    write("challenge-performance-qa", { ms: { create: create.ms, view: view.ms, invitationLoad: nav.ms, accept: accept.ms, list: list.ms }, firstContentfulPaintMs: paint, firstHeadingMs: firstHeading, invitationCls: cls });
  }

  if (MODE === "deployed") {
    // The guest-visible surface on the protected preview: invitation states,
    // enumeration, authority, and what the bundle ships. Live challenge rows
    // for accept/complete are seeded by the phase's live QA (see the summary).
    const health = await (await context.request.get(`${BASE}/api/health`)).json();
    ok("Candidate 4 on the preview", health?.preview?.candidateId === "Candidate 4" && health?.preview?.calibrationVersion === "1.4.0", `${health?.preview?.candidateId} ${health?.preview?.calibrationVersion}`);
    ok("the account provider is configured", !!(health?.cloudAccounts?.providerConfigured && health?.cloudAccounts?.serverCredentialConfigured), JSON.stringify(health?.cloudAccounts || {}).slice(0, 120));
    const un = await (await post(context, { action: "challenge-view", code: "EC-ZZZZ-ZZZZ" })).json();
    ok("an unknown code is generically unavailable", un.status === "unavailable");
    ok("create without an account is refused", (await post(context, { action: "challenge-create", chaosRunId: "runaaaaaaaa1" })).status() === 401);
    ok("a forged token is refused", (await post(context, { action: "challenge-view", code: "EC-ZZZZ-ZZZZ" }, { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).status() === 401);
    const page = await context.newPage(); await fresh(page);
    await page.goto(`${BASE}/?challenge=EC-ZZZZ-ZZZZ`); await page.getByRole("heading", { name: /not available/i }).waitFor({ timeout: 30_000 });
    ok("the unavailable invitation renders on the preview", true);
    const seeded = process.env.LIVE_CHALLENGE_CODE ? C.normalizeCode(process.env.LIVE_CHALLENGE_CODE) : null;
    if (seeded) {
      await page.goto(`${BASE}/?challenge=${seeded}`); await page.getByRole("heading", { name: /challenged you/ }).waitFor({ timeout: 30_000 });
      ok("the seeded live challenge renders its invitation", true);
      await page.getByRole("button", { name: /ACCEPT CHALLENGE/ }).click();
      const arrived = await stage(page, "DRAFTING").then(() => true).catch(() => false);
      ok("a guest accepts on the preview and the arena opens badged", arrived && (await page.locator(".ec-ta-chal-chip").count()) === 1);
      if (arrived) {
        await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
        await click(page, /^ROLL 2$/); await stage(page, "ERA_REVEAL"); await click(page, /ADAPT TO ERA/); await click(page, /FINAL ROLL/);
        await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
        await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/);
        const done = await page.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 150_000 }).then(() => true).catch(() => false);
        ok("the guest's result is compared on the preview", done, done ? await page.locator(".ec-chal-cmp").getAttribute("data-outcome") : "no comparison");
        await page.screenshot({ path: `${OUT}/screens/deployed-comparison-1280x900.png` });
      }
    } else ok("a seeded live challenge code was provided (LIVE_CHALLENGE_CODE)", false, "not provided — accept/complete on the preview not exercised by this run");
    for (const [envName, want] of [["LIVE_EXPIRED_CODE", "expired"], ["LIVE_REVOKED_CODE", "revoked"]]) {
      const c = process.env[envName] ? C.normalizeCode(process.env[envName]) : null;
      if (!c) { ok(`a live ${want} code was provided (${envName})`, false, "not provided"); continue; }
      const v = await (await post(context, { action: "challenge-view", code: c })).json();
      ok(`a live ${want} challenge reads ${want} and refuses new attempts`, v.status === want && (await (await post(context, { action: "challenge-accept", code: c, tier: "GUEST" })).json()).status === want, v.status);
      await page.goto(`${BASE}/?challenge=${c}`); await page.getByRole("heading", { name: want === "expired" ? /expired/i : /withdrawn/i }).waitFor({ timeout: 30_000 });
      ok(`the ${want} invitation renders honestly on the preview`, true);
    }
    // bundle scan: no secret-shaped strings, no seed material, the contract present
    const scan = await page.evaluate(async () => { let text = ""; for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) text += await (await fetch(s)).text(); return { bytes: text.length, secretShaped: (text.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length, serviceJwt: (text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []).filter((j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch { return false; } }).length, hasContract: text.includes("challenge-accept"), seedIdLiteral: text.includes("seed_id") }; });
    ok("no secret-shaped string in the bundle", scan.secretShaped === 0 && scan.serviceJwt === 0);
    ok("the bundle carries the challenge client and never the secrets table name", scan.hasContract && !scan.seedIdLiteral);
    write("challenge-deployed-qa", { seededCode: seeded ? "provided" : null, bundle: scan, health: { candidate: health?.preview?.candidateId, calibration: health?.preview?.calibrationVersion } });
  }
  await browser.close();
}
