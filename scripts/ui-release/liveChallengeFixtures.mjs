// Authorised live fixtures for the three seeded checks of challenge:deployed-qa.
//   node scripts/ui-release/liveChallengeFixtures.mjs <previewOrigin>
// Signs in three pre-created synthetic accounts on the protected preview (see
// below), plays three Chaos Clashes, mints three governed
// challenges and revokes one. Codes are written ONLY to .uirc-live-codes.env
// (untracked); the user ids to .uirc-live-fixtures.json (untracked) so the
// cleanup SQL can delete every row they created. Nothing is printed but counts.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE.startsWith("https://")) { console.error("pass the https preview origin"); process.exit(2); }
const browser = await chromium.launch();
const stage = (page, st) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout: 60_000 });
const click = async (page, re) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ timeout: 30_000 }); await b.click(); };
const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const k = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((x) => x.role === "owner");
  const r = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  return ctx;
};
const ctx0 = await newCtx(); const boot = await ctx0.newPage();
await boot.goto(`${BASE}/play`, { waitUntil: "networkidle" });
const cfg = await boot.evaluate(async () => {
  let url = null, key = null;
  for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) { const t = await (await fetch(s)).text();
    url = url || (t.match(/https:\/\/[a-z0-9]{16,}\.supabase\.co/) || [])[0];
    key = key || (t.match(/sb_publishable_[A-Za-z0-9_-]{16,}/) || [])[0] || (t.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/) || [])[0]; }
  return { url, key };
});
await ctx0.close();
if (!cfg.url || !cfg.key) throw new Error("provider coordinates not found in the bundle");

// Anonymous sign-up is refused on the preview provider (9B.1A). The fixture
// accounts are three pre-created rows in auth.users (qa-uirc-a/b/c@example.invalid,
// inserted by the fixture SQL with a throwaway bcrypt password); the session is
// minted by the password grant with the bundle's publishable key and adopted
// through /auth/callback like an emailed link. The password comes from the
// FIXTURE_PASSWORD environment variable and is never written anywhere.
const PASSWORD = process.env.FIXTURE_PASSWORD; if (!PASSWORD) { console.error("FIXTURE_PASSWORD not set"); process.exit(2); }
const EMAILS = { live: "qa-uirc-a@example.invalid", revoked: "qa-uirc-b@example.invalid", expired: "qa-uirc-c@example.invalid" };
const fixtures = []; const codes = {};
for (const label of ["live", "revoked", "expired"]) {
  const ctx = await newCtx(); const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  const s = await page.evaluate(async ({ url, key, email, password }) => { const r = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const j = await r.json(); return { http: r.status, access: j.access_token, refresh: j.refresh_token, userId: j.user?.id, err: j.error_description || j.msg || j.error || null }; }, { ...cfg, email: EMAILS[label], password: PASSWORD });
  if (!s.access) throw new Error(`password sign-in refused for ${label}: HTTP ${s.http} ${s.err || ""}`);
  await page.goto(`${BASE}/auth/callback#access_token=${s.access}&refresh_token=${s.refresh}&token_type=bearer&type=magiclink`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stage(page, "EMPTY"); await click(page, /^ROLL$/);
  await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  await click(page, /^ROLL 2$/); await click(page, /FINAL ROLL/);
  await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await page.getByRole("button", { name: /^Select / }).first().click();
  await click(page, /CONTINUE WITH COACH/); await click(page, /RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
  // The governed share: CHALLENGE creates through the page's own signed-in session.
  await page.getByRole("button", { name: /^CHALLENGE/ }).first().click().catch(() => {});
  const codeEl = page.locator(".ec-chal-code-v");
  let code = null;
  if (await codeEl.count().then((n) => n > 0) || await codeEl.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false)) code = (await codeEl.textContent()).trim();
  if (!code) {
    const r = await page.evaluate(async ({ runId, access }) => { const x = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${access}` }, body: JSON.stringify({ action: "challenge-create", chaosRunId: runId }) }); return x.json(); }, { runId, access: s.access });
    code = r.code || null;
  }
  if (!code) throw new Error(`no challenge code for ${label}`);
  if (label === "revoked") {
    const rv = await page.evaluate(async ({ code, access }) => { const x = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${access}` }, body: JSON.stringify({ action: "challenge-revoke", code }) }); return { http: x.status, body: await x.json() }; }, { code, access: s.access });
    if (rv.http !== 200) throw new Error(`revoke failed: HTTP ${rv.http}`);
  }
  fixtures.push({ label, userId: s.userId, runId: runId ? "recorded" : null });
  codes[label] = code;
  await ctx.close();
  console.log(`  ${label}: account minted, clash played, challenge created${label === "revoked" ? ", revoked" : ""}`);
}
await browser.close();
writeFileSync(".uirc-live-codes.env", `LIVE_CHALLENGE_CODE=${codes.live}\nLIVE_REVOKED_CODE=${codes.revoked}\nLIVE_EXPIRED_CODE=${codes.expired}\n`);
writeFileSync(".uirc-live-fixtures.json", JSON.stringify({ createdAt: new Date().toISOString(), origin: BASE, userIds: fixtures.map((f) => f.userId) }, null, 2));
console.log(`fixtures: ${fixtures.length} synthetic accounts, 3 challenges (one revoked). Codes in .uirc-live-codes.env (untracked); the 'expired' one still needs its expiry moved into the past by the fixture SQL.`);
