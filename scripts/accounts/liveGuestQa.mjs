#!/usr/bin/env node
// ── Live guest and security certification ───────────────────────────────────
//   node scripts/accounts/liveGuestQa.mjs <origin>
//
// Everything that can be certified against a real deployment WITHOUT a
// signed-in session: what the build ships to a browser, what a guest can
// reach, and whether the gates convert rather than dead-end.
//
// Run it against the DURABLE branch origin, not a commit-specific URL. A
// per-commit preview is a new browser origin every push, so a session and its
// storage do not survive one — see docs/accounts/email-sign-in-owner-setup.md.
//
// It prints no credential. The bundle audit records counts and shapes only.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) { console.error("usage: liveGuestQa.mjs <origin>"); process.exit(2); }
const owner = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find(k => k.role === "owner");

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };

const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });

console.log(`\nLIVE GUEST AND SECURITY QA — ${BASE}\n\nA. what the deployed build ships to a browser`);
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const audit = await page.evaluate(async () => {
  const srcs = [...document.querySelectorAll("script[src]")].map(s => s.src);
  const out = { assets: srcs.length, secretShaped: 0, serviceRoleJwt: 0, serviceWords: 0, anonPresent: false, urlPresent: false, bytes: 0 };
  const roleOf = (j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || null; } catch { return null; } };
  for (const s of srcs) {
    const t = await (await fetch(s)).text();
    out.bytes += t.length;
    // By SHAPE, never by variable name: a secret that arrived under an innocent
    // name is exactly the failure this exists to catch. It has happened here.
    out.secretShaped += (t.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length;
    for (const j of t.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []) if (roleOf(j) === "service_role") out.serviceRoleJwt += 1;
    out.serviceWords += (t.match(/SERVICE_ROLE_KEY|SUPABASE_SERVICE/g) || []).length;
    if (/sb_publishable_|anon/.test(t)) out.anonPresent = true;
    if (/\.supabase\.co/.test(t)) out.urlPresent = true;
  }
  return out;
});
ok("no secret-shaped key is served to a browser", audit.secretShaped === 0, `${audit.assets} asset(s), ${(audit.bytes / 1024).toFixed(0)}KB scanned`);
ok("no service_role JWT is served, decided by decoding the role claim", audit.serviceRoleJwt === 0);
ok("no service-role variable name appears in any asset", audit.serviceWords === 0);
ok("the publishable key and project URL ARE present, as they must be", audit.anonPresent && audit.urlPresent);
const healthRaw = await (await ctx.request.get(`${BASE}/api/health`)).text();
const health = JSON.parse(healthRaw);
ok("the health route leaks no key material of any shape",
  !/sb_secret|service_role/.test(healthRaw) && !(healthRaw.match(/eyJ[A-Za-z0-9_-]{10,}\./g) || []).length, `${healthRaw.length} bytes`);
ok("the deployed build is Candidate 4 on the frozen calibration",
  health?.preview?.candidateId === "Candidate 4" && health?.preview?.calibrationVersion === "1.4.0",
  `${health?.preview?.candidateId} · ${health?.preview?.calibrationVersion}`);
// A correctly shaped but revoked key passes every static check. Ask the
// provider directly, because this exact failure hid behind "ready" while every
// save returned 401.
const deepRaw = await (await ctx.request.get(`${BASE}/api/health?deep=1`)).text();
const deep = JSON.parse(deepRaw);
const cloud = deep?.cloudAccounts ?? {};
ok("cloud accounts report configuration as booleans only", Object.values(cloud).every((v) => typeof v === "boolean"), JSON.stringify(cloud));
ok("the provider still accepts the server's own credential",
  cloud.serviceKeyAcceptedByProvider === true,
  cloud.serviceKeyAcceptedByProvider === false ? "REJECTED — the deployment's service-role key is absent, wrong, or was rotated without the deployment being updated" : "");
ok("the deep probe returns no key material", !/sb_secret|sb_publishable|eyJ/.test(deepRaw));

const noToken = await ctx.request.post(`${BASE}/api/profile`, { data: { action: "cloud-save", clash: { id: "x" } }, failOnStatusCode: false });
ok("a cloud save with no bearer token is refused", noToken.status() >= 400, `HTTP ${noToken.status()}`);
const noTokenClaim = await ctx.request.post(`${BASE}/api/profile`, { data: { action: "claim-result", resultId: "pv_notmine0001" }, failOnStatusCode: false });
ok("a guest claim with no bearer token is refused", noTokenClaim.status() >= 400, `HTTP ${noTokenClaim.status()}`);
const forgedToken = await ctx.request.post(`${BASE}/api/profile`, {
  data: { action: "cloud-save", clash: { id: "x" } }, headers: { authorization: "Bearer not.a.real.token" }, failOnStatusCode: false });
ok("a cloud save with a forged bearer token is refused", forgedToken.status() >= 400, `HTTP ${forgedToken.status()}`);

console.log("\nB. the guest surfaces, and what a later claim will rest on");
const guest = await ctx.newPage();
await guest.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
const careerText = await guest.locator("body").innerText();
ok("My EraClash requires an account and invents no career", /account|sign in|save/i.test(careerText) && !/@/.test(careerText));
await guest.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const lobby = await guest.locator("body").innerText();
ok("the lobby offers an account and claims no signed-in identity", /free account|sign in/i.test(lobby) && !/career saved/i.test(lobby));
const ec = (await ctx.cookies()).find((c) => c.name === "ec_session");
// This cookie is the ownership proof a guest claim depends on: the server puts
// it on every result it records, and only the device that played can present it.
ok("the device session cookie exists and is HttpOnly", !!ec && ec.httpOnly === true, ec ? `httpOnly=${ec.httpOnly} sameSite=${ec.sameSite} secure=${ec.secure}` : "absent");
ok("the device session cookie is not readable from JavaScript", !(await guest.evaluate(() => document.cookie.includes("ec_session"))));

console.log("\nC. Dream Matchup: the gate, and where it puts you afterwards");
await guest.goto(`${BASE}/play/dream`, { waitUntil: "networkidle" });
const dreamText = await guest.locator("body").innerText();
ok("Dream Matchup is reachable at its own route for a guest", !/page not found|404/i.test(dreamText), `${dreamText.length} chars`);
ok("the gate states that a free account is required", /free account required/i.test(dreamText));
// A price is a currency next to a digit, or a checkout word that is not being
// negated. The copy says "no payment", which must not read as a payment surface.
const pricey = /\$\s?\d/.test(dreamText) || /(?<!no )\b(checkout|subscribe|billing)\b/i.test(dreamText);
ok("the gate shows no price and no checkout", !pricey, /no password, no payment/i.test(dreamText) ? "copy explicitly says no payment" : "");
ok("the gate offers both routes to an account and a way back", /create free account or sign in/i.test(dreamText) && /back to the lobby/i.test(dreamText));
const before = guest.url();
await guest.locator("button", { hasText: /create free account or sign in/i }).first().click({ timeout: 8000 }).catch(() => {});
await guest.waitForTimeout(900);
ok("the gate's OWN call to action opens the account dialog", await guest.locator('[data-account-dialog="true"]').count() > 0);
ok("authenticating never navigates away from the mode being entered", guest.url() === before, guest.url().replace(BASE, "<origin>"));
await guest.keyboard.press("Escape").catch(() => {});
await guest.waitForTimeout(500);
ok("dismissing the dialog leaves you on that route, not the lobby", guest.url() === before, guest.url().replace(BASE, "<origin>"));

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} live guest and security checks passed`);
writeFileSync("data/validation/9b1a/live-guest-security-qa.json", JSON.stringify({
  phase: "9B.1A", artifact: "live-guest-security-qa", generatedAt: new Date().toISOString(),
  origin: BASE, commit: process.argv[3] ?? null,
  scope: "Everything certifiable against a real deployment without a signed-in session, run against the durable branch origin rather than a commit-specific URL.",
  bundleAudit: audit, checks: results, passed, total: results.length, allPassed: passed === results.length,
  note: "No credential appears in this artifact: the bundle audit records counts and shapes only.",
}, null, 2) + "\n");
console.log("→ data/validation/9b1a/live-guest-security-qa.json");
await b.close();
process.exit(passed === results.length ? 0 : 1);
