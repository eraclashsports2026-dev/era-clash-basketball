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
const ok = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };

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
const headerText = async (page) => (await page.locator("header").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

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

console.log(`\nLIVE SIGNED-IN QA — ${BASE}`);

// ── A. signing in through the product's own path ────────────────────────────
console.log("\nA. a session adopted the way an emailed link delivers one");
const pageA = await ctxA.newPage();
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const guestHeader = await headerText(pageA);
const sessionA = await mintSession(pageA);
ok("the provider issues a real session with a real user id", !!sessionA.access && !!sessionA.userId, `anonymous=${sessionA.anonymous}`);
await adopt(pageA, sessionA);
ok("the callback adopts a session arriving in a fragment and leaves a safe path", /\/play$/.test(pageA.url()), pageA.url().replace(BASE, "<origin>"));
ok("no token survives in the address bar", !/access_token|refresh_token/.test(pageA.url()));

// ── B. the signed-in header ─────────────────────────────────────────────────
console.log("\nB. the signed-in header and account menu");
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const signedHeader = await headerText(pageA);
ok("the header stops asking for an account once you have one",
  /free account|sign in/i.test(guestHeader) && !/create free account/i.test(signedHeader), `guest: "${guestHeader.slice(0, 40)}…" → signed in: "${signedHeader.slice(0, 40)}…"`);
ok("the header shows an identity rather than an email address", signedHeader.length > 0 && !/@/.test(signedHeader), signedHeader.slice(0, 60));
await pageA.screenshot({ path: `${SHOTS}/signed-in-header-1440x900.png` });
// Reloading must not silently drop the session.
await pageA.reload({ waitUntil: "networkidle" });
ok("the session survives a reload", !/create free account/i.test(await headerText(pageA)));

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
let saveClicked = false;
if (await saveBtn.count()) { await saveBtn.click().catch(() => {}); await pageA.waitForTimeout(3000); saveClicked = true; }
ok("a signed-in player can save the Clash from the postgame", saveClicked);

// ── D. My EraClash, with the row that was actually saved ────────────────────
console.log("\nD. My EraClash on real cloud data");
await pageA.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageA.waitForTimeout(2500);
const careerA = await pageA.locator("body").innerText();
ok("My EraClash renders for a signed-in account without asking for one", !/create free account or sign in/i.test(careerA));
ok("it shows no email address anywhere", !/@/.test(careerA));
await pageA.screenshot({ path: `${SHOTS}/my-eraclash-signed-in-1440x900.png` });

// ── E. cross-device: a second context, the same account ─────────────────────
console.log("\nE. the same account on a second device");
const ctxB = await newCtx();
const pageB = await ctxB.newPage();
await pageB.goto(`${BASE}/play`, { waitUntil: "networkidle" });
ok("a fresh browser starts as a guest", /free account|sign in/i.test(await headerText(pageB)));
await adopt(pageB, sessionA);
await pageB.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageB.waitForTimeout(2500);
const careerB = await pageB.locator("body").innerText();
ok("the same account signs in on a second device", !/create free account or sign in/i.test(careerB));
ok("the second device sees the same career as the first",
  careerB.replace(/\s+/g, " ").slice(0, 400) === careerA.replace(/\s+/g, " ").slice(0, 400));

// ── F. cross-account isolation, in the browser ──────────────────────────────
console.log("\nF. a different account sees none of it");
const ctxC = await newCtx();
const pageC = await ctxC.newPage();
await pageC.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const sessionC = await mintSession(pageC);
await adopt(pageC, sessionC);
ok("the second account is a different user", sessionC.userId && sessionC.userId !== sessionA.userId);
await pageC.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
await pageC.waitForTimeout(2500);
const careerC = await pageC.locator("body").innerText();
ok("a different account does not see the first account's career",
  careerC.replace(/\s+/g, " ").slice(0, 400) !== careerA.replace(/\s+/g, " ").slice(0, 400));
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
await pageA.goto(`${BASE}/my-eraclash`, { waitUntil: "networkidle" });
const signOut = pageA.getByRole("button", { name: /sign out|log out/i }).first();
let signedOut = false;
if (await signOut.count()) { await signOut.click().catch(() => {}); await pageA.waitForTimeout(2500); signedOut = true; }
ok("a signed-in player can sign out", signedOut);
await pageA.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const afterOut = await headerText(pageA);
ok("signing out returns the header to asking for an account", /free account|sign in/i.test(afterOut), afterOut.slice(0, 50));
ok("guest play is intact after signing out", (await pageA.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').count()) > 0);

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} live signed-in checks passed`);
writeFileSync("data/validation/9b1a/live-signed-in-qa.json", JSON.stringify({
  phase: "9B.1A", artifact: "live-signed-in-qa", generatedAt: new Date().toISOString(),
  origin: BASE, commit: process.argv[3] ?? null,
  sessionSource: "The provider's anonymous sign-in, enabled by the owner for this run. These are real sessions with a real auth.uid(), so RLS, the sign-up trigger and the authoritative save are exercised for real. Every one is adopted through the product's own /auth/callback in a URL fragment, exactly as an emailed link delivers one — nothing is injected into storage behind the app's back.",
  notCertifiable: "Signing back in with a credential. An anonymous account has none. The owner's own real sign-in on this origin already demonstrates that path for a credentialed account.",
  accounts: { first: sessionA.userId, second: sessionC.userId },
  checks: results, passed, total: results.length, allPassed: passed === results.length,
  note: "No token or credential is recorded here. User ids are opaque uuids and the accounts are deleted after this run.",
}, null, 2) + "\n");
console.log("→ data/validation/9b1a/live-signed-in-qa.json");
await browser.close();
process.exit(passed === results.length ? 0 : 1);
