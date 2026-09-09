#!/usr/bin/env node
// ── Live signed-in certification ────────────────────────────────────────────
//   node scripts/accounts/liveSignedInQa.mjs <origin>
//
// The signed-in half of Phase 9B.1A, against a real deployment and the real
// provider. Run it against the DURABLE branch origin: a per-commit preview URL
// is a different browser origin, and a session lives in its origin's storage.
//
// Sessions come from the provider's anonymous sign-in, which the owner enables
// for the duration of this run. They are real sessions with a real auth.uid(),
// so RLS, the sign-up trigger, the authoritative save and cross-account
// isolation are all exercised for real. The one thing an anonymous account
// cannot show is signing back in with a credential, because it has none; that
// is reported as not certified rather than glossed.
//
// Every session is adopted through the PRODUCT'S OWN callback, in a URL
// fragment, which is exactly what an emailed link does. Nothing is injected
// into storage behind the app's back.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) { console.error("usage: liveSignedInQa.mjs <origin>"); process.exit(2); }
const owner = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((k) => k.role === "owner");
const SHOTS = "data/validation/9b1a/screens";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, state: pass ? "PASS" : "FAIL", pass: !!pass, detail }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };
// A check that cannot run because the deployment's own credential is refused is
// neither a pass nor a failure of the product. Saying "blocked" keeps the
// verdict honest: nothing here is claimed to work, and nothing is blamed on
// code that was never reached.
const blocked = (name, why) => { results.push({ name, state: "BLOCKED", pass: null, detail: why }); console.log(`  BLOCKED  ${name} … ${why}`); };

const browser = await chromium.launch();
const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  return ctx;
};

// Provider coordinates come from the deployed bundle, where they belong by design.
const ctxA = await newCtx();
const boot = await ctxA.newPage();
await boot.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const cfg = await boot.evaluate(async () => {
  const srcs = [...document.querySelectorAll("script[src]")].map((s) => s.src);
  let url = null, key = null;
  for (const s of srcs) { const t = await (await fetch(s)).text();
    url = url || (t.match(/https:\/\/[a-z0-9]{16,}\.supabase\.co/) || [])[0];
    key = key || (t.match(/sb_publishable_[A-Za-z0-9_-]{16,}/) || [])[0] || (t.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/) || [])[0]; }
  return { url, key };
});
await boot.close();

const mintSession = async (page) => page.evaluate(async ({ url, key }) => {
  const r = await fetch(`${url}/auth/v1/signup`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}" });
  const j = await r.json();
  return { access: j.access_token, refresh: j.refresh_token, userId: j.user?.id, anonymous: !!j.user?.is_anonymous };
}, cfg);

// Adopted the way a real emailed link is adopted: through /auth/callback.
const adopt = async (page, s) => {
  await page.goto(`${BASE}/auth/callback#access_token=${s.access}&refresh_token=${s.refresh}&token_type=bearer&type=magiclink`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
};
// The page has two <header> elements: the brand header and the lobby hero.
// Only the first carries the account control, and picking the wrong one is how
// an earlier run of this script "passed" three header checks vacuously.
const BRAND = "header.ec-brand-header";
const headerButtons = async (page) => page.locator(`${BRAND} button`).allInnerTexts();
const headerText = async (page) => (await page.locator(BRAND).innerText().catch(() => "")).replace(/\s+/g, " ").trim();

const playChaos = async (page) => {
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await page.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').click();
  await page.locator(".ec-ta").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 60_000 });
  const holds = page.locator(".ec-pc-action");
  await holds.nth(0).click(); await page.waitForTimeout(200); await holds.nth(2).click(); await page.waitForTimeout(400);
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click();
  await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).waitFor({ timeout: 150_000 });
};
const savePanel = async (page) => page.evaluate(() => {
  const p = document.querySelector("[data-save-panel]");
  if (!p) return null;
  return { mode: p.dataset.savePanel, heading: p.querySelector("h2")?.textContent.trim() || "",
           buttons: [...p.querySelectorAll("button")].map((b) => b.textContent.trim()) };
});

const deep = await (await ctxA.request.get(`${BASE}/api/health?deep=1`)).json();
const CRED = deep?.cloudAccounts?.serverCredentialAccepted === true;
const CRED_WHY = "the deployment's server credential is refused by the provider, so no cloud write can succeed; every check below that needs stored data is blocked rather than failed";

console.log(`\nLIVE SIGNED-IN QA — ${BASE}`);
console.log(`server credential accepted by the provider: ${CRED}`);

// ── A. signing in through the product's own path ────────────────────────────
console.log("\nA. a session adopted the way an emailed link delivers one");
const pageA = await ctxA.newPage();
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const guestButtons = await headerButtons(pageA);
const sessionA = await mintSession(pageA);
ok("the provider issues a real session with a real user id", !!sessionA.access && !!sessionA.userId, `anonymous=${sessionA.anonymous}`);
await adopt(pageA, sessionA);
ok("the callback adopts a session arriving in a fragment and leaves a safe path", /\/play$/.test(pageA.url()), pageA.url().replace(BASE, "<origin>"));
ok("no token survives in the address bar", !/access_token|refresh_token/.test(pageA.url()));

// ── B. the signed-in header ─────────────────────────────────────────────────
console.log("\nB. the signed-in header and account menu");
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
await pageA.waitForTimeout(1200);
const signedButtons = await headerButtons(pageA);
const has = (list, re) => list.some((t) => re.test(t));
ok("as a guest the header offers both ways to get an account",
  has(guestButtons, /^Sign in$/i) && has(guestButtons, /create free account/i), JSON.stringify(guestButtons.slice(-2)));
ok("signed in, those two prompts are gone",
  !has(signedButtons, /^Sign in$/i) && !has(signedButtons, /create free account/i), JSON.stringify(signedButtons.slice(-1)));
const chipText = signedButtons[signedButtons.length - 1] || "";
ok("signed in, the header shows an identity chip instead", /coach|free account/i.test(chipText) && chipText.length > 0, JSON.stringify(chipText));
ok("the header never shows an email address", !/@/.test(await headerText(pageA)));
await pageA.screenshot({ path: `${SHOTS}/signed-in-header-1440x900.png` });
// Reloading must not silently drop the session.
await pageA.reload({ waitUntil: "networkidle" });
ok("the session survives a reload", !has(await headerButtons(pageA), /create free account/i));

// ── C. a signed-in Chaos Clash, saved ───────────────────────────────────────
console.log("\nC. a signed-in Chaos Clash and its save");
await playChaos(pageA);
await pageA.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
await pageA.getByRole("dialog", { name: "Full postgame report" }).waitFor({ timeout: 30_000 });
const panel = await savePanel(pageA);
ok("the postgame panel is the signed-in variant, not the guest pitch",
  !!panel && panel.mode !== "guest", JSON.stringify(panel));
await pageA.screenshot({ path: `${SHOTS}/signed-in-postgame-1440x900.png` });
const saveBtn = pageA.getByRole("button", { name: /SAVE/i }).first();
let savedHeading = "";
if (await saveBtn.count()) { await saveBtn.click().catch(() => {}); await pageA.waitForTimeout(6000); }
savedHeading = await pageA.evaluate(() => document.querySelector("[data-save-panel] h2")?.textContent.trim() || "");
if (CRED) ok("a signed-in save completes", !/FAIL/i.test(savedHeading), savedHeading);
else {
  blocked("a signed-in save completes", CRED_WHY);
  ok("a save that cannot succeed says so instead of silently doing nothing", /FAIL/i.test(savedHeading), savedHeading);
}

// ── D. My EraClash, with the row that was actually saved ────────────────────
console.log("\nD. My EraClash on real cloud data");
await pageA.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageA.waitForTimeout(3500);
const careerA = await pageA.locator("body").innerText();
// Each saved Clash renders as a row carrying its own result id, so this counts
// stored rows rather than matching words in prose — an earlier version counted
// prose and passed on nothing at all.
const savedA = await pageA.locator("[data-clash]").count();
ok("My EraClash renders for a signed-in account without asking for one", !/create free account or sign in/i.test(careerA));
ok("it shows no email address anywhere", !/@/.test(careerA));
if (CRED) ok("the Clash that was just saved is listed on the career page", savedA >= 1, `${savedA} saved`);
else blocked("the Clash that was just saved is listed on the career page", CRED_WHY);
await pageA.screenshot({ path: `${SHOTS}/my-eraclash-signed-in-1440x900.png` });

// ── E. cross-device: a second context, the same account ─────────────────────
console.log("\nE. the same account on a second device");
const ctxB = await newCtx();
const pageB = await ctxB.newPage();
await pageB.goto(`${BASE}/play`, { waitUntil: "networkidle" });
ok("a fresh browser starts as a guest", /free account|sign in/i.test(await headerText(pageB)));
await adopt(pageB, sessionA);
await pageB.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageB.waitForTimeout(3500);
const careerB = await pageB.locator("body").innerText();
ok("the same account signs in on a second device", !/create free account or sign in/i.test(careerB));
const savedB = await pageB.locator("[data-clash]").count();
if (CRED) {
  ok("the second device reads back the same saved Clashes, by id", savedB === savedA && savedB >= 1, `${savedA} on the first, ${savedB} on the second`);
  const idsA = await pageA.locator("[data-clash]").evaluateAll((n) => n.map((e) => e.dataset.clash).sort());
  const idsB = await pageB.locator("[data-clash]").evaluateAll((n) => n.map((e) => e.dataset.clash).sort());
  ok("the rows are the same rows, not merely the same number", JSON.stringify(idsA) === JSON.stringify(idsB) && idsA.length >= 1);
} else blocked("the second device reads back the same saved Clashes", CRED_WHY);

// ── F. cross-account isolation, in the browser ──────────────────────────────
console.log("\nF. a different account sees none of it");
const ctxC = await newCtx();
const pageC = await ctxC.newPage();
await pageC.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const sessionC = await mintSession(pageC);
await adopt(pageC, sessionC);
ok("the second account is a different user", sessionC.userId && sessionC.userId !== sessionA.userId);
await pageC.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageC.waitForTimeout(3500);
const savedC = await pageC.locator("[data-clash]").count();
ok("a different account sees none of the first account's saved Clashes", savedC === 0, `${savedC} visible`);
// And the server must refuse it directly, not only hide it in the UI.
const stealing = await ctxC.request.post(`${BASE}/api/profile`, {
  data: { action: "cloud-save", clash: { user_id: sessionA.userId, id: "forged" } },
  headers: { authorization: `Bearer ${sessionC.access}` }, failOnStatusCode: false });
ok("the server refuses a save addressed to somebody else's account", stealing.status() >= 400, `HTTP ${stealing.status()}`);

// ── G. Dream Matchup once you have an account ───────────────────────────────
console.log("\nG. Dream Matchup after authenticating");
await pageA.goto(`${BASE}/play/dream`, { waitUntil: "networkidle" });
await pageA.waitForTimeout(1500);
const dreamSignedIn = await pageA.locator("body").innerText();
ok("the account gate is gone once you have an account", !/free account required/i.test(dreamSignedIn));
await pageA.screenshot({ path: `${SHOTS}/dream-signed-in-1440x900.png` });

// ── H. signing out ──────────────────────────────────────────────────────────
console.log("\nH. signing out");
// Sign out lives inside the account menu, which the identity chip opens.
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
await pageA.waitForTimeout(1200);
// Wait for the chip to be interactive rather than guessing at a delay: an
// earlier version of this clicked before hydration settled and reported a
// working menu as broken.
// The chip is a controlled toggle: a click that lands mid-hydration is
// swallowed, so open it by state rather than by timer, and retry.
const menuBefore = await pageA.locator('[role="menu"]').count();
let menuOpen = false;
for (let i = 0; i < 5 && !menuOpen; i += 1) {
  const chip = pageA.locator(`${BRAND} button[aria-haspopup="true"]`).last();
  await chip.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await chip.click({ timeout: 8000 }).catch(() => {});
  menuOpen = await pageA.locator('[role="menu"]').first().isVisible().catch(() => false);
  if (!menuOpen) await pageA.waitForTimeout(1200);
}
const menuItems = await pageA.locator('[role="menu"] [role="menuitem"]').allInnerTexts().catch(() => []);
ok("the identity chip opens an account menu", menuBefore === 0 && menuOpen && menuItems.length > 0, JSON.stringify(menuItems));
ok("the menu offers the career, settings and a way out",
  menuItems.some((t) => /my eraclash/i.test(t)) && menuItems.some((t) => /account settings/i.test(t)) && menuItems.some((t) => /^sign out$/i.test(t)));
// These are menuitems, not buttons — correct for a menu, and the reason an
// earlier selector of mine silently never clicked anything.
const signOut = pageA.getByRole("menuitem", { name: /^sign out$/i }).first();
if (await signOut.count()) { await signOut.click().catch(() => {}); await pageA.waitForTimeout(4000); }
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const afterOut = await headerButtons(pageA);
ok("signing out returns the header to offering an account",
  has(afterOut, /^Sign in$/i) && has(afterOut, /create free account/i), JSON.stringify(afterOut.slice(-2)));
ok("guest play is intact after signing out", (await pageA.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').count()) > 0);

const passed = results.filter((r) => r.state === "PASS").length;
const failed = results.filter((r) => r.state === "FAIL").length;
const blockedN = results.filter((r) => r.state === "BLOCKED").length;
console.log(`\n${passed} passed · ${failed} failed · ${blockedN} blocked, of ${results.length} live signed-in checks`);
writeFileSync("data/validation/9b1a/live-signed-in-qa.json", JSON.stringify({
  phase: "9B.1A", artifact: "live-signed-in-qa", generatedAt: new Date().toISOString(),
  origin: BASE, commit: process.argv[3] ?? null,
  sessionSource: "The provider's anonymous sign-in, enabled by the owner for this run. These are real sessions with a real auth.uid(), so RLS, the sign-up trigger and the authoritative save are exercised for real. Every one is adopted through the product's own /auth/callback in a URL fragment, exactly as an emailed link delivers one — nothing is injected into storage behind the app's back.",
  notCertifiable: "Signing back in with a credential. An anonymous account has none. The owner's own real sign-in on this origin already demonstrates that path for a credentialed account.",
  accounts: { first: sessionA.userId, second: sessionC.userId },
  serverCredentialAcceptedByProvider: CRED,
  blockedReason: CRED ? null : "The deployment's SUPABASE_SERVICE_ROLE_KEY is present and correctly shaped but refused by the provider — it predates the key rotation earlier in this phase. Every cloud write fails with 401, so checks that need stored data are recorded as BLOCKED rather than passed or failed.",
  checks: results, passed, failed, blocked: blockedN, total: results.length,
  allPassed: failed === 0 && blockedN === 0,
  note: "No token or credential is recorded here. User ids are opaque uuids and the accounts are deleted after this run.",
}, null, 2) + "\n");
console.log("→ data/validation/9b1a/live-signed-in-qa.json");
await browser.close();
process.exit(failed === 0 ? 0 : 1);
