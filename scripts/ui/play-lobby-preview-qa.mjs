#!/usr/bin/env node
// ── Deployed Play Lobby QA (Phase 9A) ────────────────────────────────────────
// Drives the DEPLOYED branch preview as a visitor would: the access gate on the
// new routes, the lobby, that viewing it starts nothing, Chaos from the lobby,
// the Continue card, an explicit abandon, the Dream Matchup gate and placement,
// the Story-led result, and the phone. Every gate is measured on the deployment,
// never assumed from the local build.
//
//   PHASE9A_COMMIT=<sha> node scripts/ui/play-lobby-preview-qa.mjs https://<branch-preview>
//
// Access: the owner key from .preview-secrets/ is exchanged for a signed session
// by POSTing it to /api/preview-access, exactly as a tester's link does. No key
// is printed, stored in an artifact, or placed in a URL.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { chromium, request as pwRequest } from "@playwright/test";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/ui/play-lobby-preview-qa.mjs https://<preview-host>"); process.exit(2); }
const OUT = "data/validation/9a";
const SHOTS = `${OUT}/preview-screens`;
mkdirSync(SHOTS, { recursive: true });

const gates = [];
let failed = 0;
const gate = (name, ok, detail = "") => {
  gates.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`);
};
const keys = () => {
  const f = ".preview-secrets/wave1-access-keys.json";
  if (!existsSync(f)) throw new Error(`${f} is not on disk`);
  return JSON.parse(readFileSync(f, "utf8")).keys;
};
const owner = keys().find((k) => k.role === "owner");
const sha = (s) => { const { createHash } = require_crypto(); return createHash("sha256").update(s).digest("hex").slice(0, 12); };
function require_crypto() { return (0, eval)('require("node:crypto")'); }
const freshAccount = (page) => page.addInitScript(() => {
  try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); } catch (e) {}
});
const asGuest = (page) => page.addInitScript(() => {
  try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); } catch (e) {}
});
const gamePosts = (page) => {
  const posts = [];
  page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}").chaosAction || "(sim)"); } catch { posts.push("?"); } } });
  return posts;
};

const run = async () => {
  // ══ A. The access gate covers the new routes ═══════════════════════════════
  console.log("A. access control on the play routes");
  const anon = await pwRequest.newContext({ baseURL: BASE });
  for (const p of ["/", "/play", "/play/chaos", "/play/dream", "/play/daily", "/play/best-of-7"]) {
    const r = await anon.get(p, { maxRedirects: 0 });
    gate(`unauthenticated ${p} is refused`, r.status() === 401, `HTTP ${r.status()}`);
    const body = await r.text();
    gate(`the refusal page for ${p} leaks no application`, !/ec-lobby|Chaos Clash|Dream Matchup/.test(body), `${body.length} bytes`);
  }
  const wrong = await anon.post("/api/preview-access", { form: { key: "not-a-key" }, maxRedirects: 0 });
  gate("a wrong key is denied", wrong.status() === 401, `HTTP ${wrong.status()}`);
  await anon.dispose();
  // Every existing tester key still opens a session (identity: hash prefix only).
  const ledger = [];
  for (const k of keys()) {
    const c = await pwRequest.newContext({ baseURL: BASE });
    const r = await c.post("/api/preview-access", { form: { key: k.key }, maxRedirects: 0 });
    ledger.push({ testerId: k.testerId, role: k.role, sha256Prefix: sha(k.key), accepted: r.status() === 303, status: r.status() });
    await c.dispose();
  }
  gate("every current secure key still opens a session", ledger.every((k) => k.accepted), ledger.map((k) => k.testerId).join(", "));

  // ══ B. The lobby ═══════════════════════════════════════════════════════════
  console.log("\nB. the lobby as a new visitor");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  if (auth.status() !== 303) { console.error("could not open a preview session"); process.exit(1); }
  const page = await ctx.newPage();
  await freshAccount(page);
  const posts = gamePosts(page);
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-lobby").waitFor({ timeout: 45_000 });
  await page.waitForTimeout(1200);
  gate("/play renders the Play Lobby", await page.locator(".ec-lobby").isVisible());
  gate("the Mk1 logo is served", await page.locator(".ec-lobby-logo").evaluate((img) => img.complete && img.naturalWidth > 0));
  const cards = await page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => ({ id: e.dataset.mode, status: e.dataset.status, recommended: e.dataset.recommended, primary: e.classList.contains("ec-mode-card--primary") })));
  gate("three primary cards: Chaos Clash, Dream Matchup, Daily Clash", cards.filter((c) => c.primary).map((c) => c.id).join(",") === "chaos,dream,daily");
  gate("four secondary cards with truthful statuses", cards.filter((c) => !c.primary).length === 4 && cards.find((c) => c.id === "gauntlet")?.status === "COMING_SOON");
  gate("Chaos Clash is recommended", cards[0]?.recommended === "true");
  gate("viewing the lobby made no game request", posts.length === 0, posts.join(",") || "none");
  gate("no run is remembered after viewing the lobby", (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === null);
  gate("no continuation card without a run", (await page.locator(".ec-continue").count()) === 0);
  await page.screenshot({ path: `${SHOTS}/lobby-1536.png` });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-lobby").waitFor({ timeout: 45_000 });
  gate("/ is the same entrance", (await page.locator(".ec-lobby").getAttribute("data-entrance")) === "true");
  gate("still no game request from the entrance", posts.length === 0);

  // ══ C. Chaos from the lobby → Continue → Abandon ═══════════════════════════
  console.log("\nC. start Chaos, return to the lobby, resume the exact run, abandon explicitly");
  await page.getByRole("link", { name: /Play Chaos Clash, recommended/ }).click();
  await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  gate("Chaos opens the Time Arena at /play/chaos", /\/play\/chaos$/.test(page.url()) && (await page.locator(".ec-pc-empty").count()) === 10, page.url());
  gate("opening the arena still dealt nothing", posts.length === 0);
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  const names = await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts();
  gate("ROLL 1 is the first and only start", posts.filter((a) => a === "start").length === 1 && !!runId);
  await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  await page.locator(".ec-continue").waitFor({ timeout: 30_000 });
  const card = await page.locator(".ec-continue").innerText();
  gate("the lobby offers Continue for the run", /CONTINUE YOUR CHAOS CLASH/.test(card) && /Roll 1 of 3/.test(card));
  gate("the card hides the unrevealed era", /era not yet revealed/.test(card) && !/\d{4}s era/.test(card));
  gate("the logo preserved the run", (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId);
  await page.screenshot({ path: `${SHOTS}/lobby-continue.png` });
  await page.getByRole("button", { name: /Continue your Chaos Clash/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const resumed = await page.locator('.ec-ta-team[data-team="gold"] .ec-pc .ec-pc-name').allInnerTexts();
  gate("Continue resumes the exact five", JSON.stringify(resumed) === JSON.stringify(names));
  gate("resuming started no new run", posts.filter((a) => a === "start").length === 1 && posts.includes("view"));
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-continue").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  const dialog = page.getByRole("dialog", { name: /Abandon this Chaos Clash/ });
  gate("abandon asks first", await dialog.isVisible());
  await dialog.getByRole("button", { name: /No, keep this Chaos Clash/ }).click();
  gate("No keeps the run", (await page.locator(".ec-continue").count()) === 1 && (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId);
  await page.getByRole("button", { name: /Abandon this Chaos Clash/ }).click();
  await page.getByRole("dialog", { name: /Abandon this Chaos Clash/ }).getByRole("button", { name: /Yes, abandon/ }).click();
  await page.waitForTimeout(1500);
  gate("Yes abandons it and the card is gone", (await page.locator(".ec-continue").count()) === 0 && (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === null);
  gate("abandon was sent to the server", posts.includes("abandon"));

  // ══ D. Dream Matchup: gate, then placement ═════════════════════════════════
  console.log("\nD. Dream Matchup as a guest, then placement as an account");
  const g = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  await g.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const gp = await g.newPage();
  await asGuest(gp);
  await gp.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await gp.locator(".ec-lobby").waitFor({ timeout: 45_000 });
  const dream = gp.locator('.ec-mode-card[data-mode="dream"]');
  gate("a guest's Dream Matchup card says Free account", (await dream.getAttribute("data-status")) === "ACCOUNT_REQUIRED");
  await dream.locator(".ec-mode-action").click();
  await gp.getByText("FREE ACCOUNT REQUIRED").waitFor({ timeout: 20_000 });
  gate("the account gate opens at /play/dream", /\/play\/dream$/.test(gp.url()));
  await gp.getByRole("button", { name: "BACK TO THE LOBBY" }).click();
  await gp.locator(".ec-lobby").waitFor({ timeout: 20_000 });
  gate("the way back from the gate is the lobby", /\/play$/.test(gp.url()));
  await g.close();

  await page.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant");
  await page.locator('button[data-player="durant-10s"]').click();
  const grid = page.locator('.roster-grid[aria-label="Team Gold lineup"]');
  const states = await grid.locator("[data-slot]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.slot, e.dataset.placeState])));
  gate("Durant's eligible slots (SF · PF · SG) are highlighted; PG and C are not controls",
    states.SG === "ELIGIBLE" && states.SF === "ELIGIBLE" && states.PF === "ELIGIBLE" && states.PG === "INELIGIBLE" && states.C === "INELIGIBLE", JSON.stringify(states));
  await page.screenshot({ path: `${SHOTS}/placement-durant.png` });
  await page.getByRole("button", { name: "Place Kevin Durant at Power Forward" }).click();
  gate("manual placement lands", /Durant/.test(await grid.locator('[data-slot="PF"]').innerText()));
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Chamberlain");
  await page.locator('button[data-player="wilt-60s"]').click();
  await page.waitForTimeout(300);
  gate("a one-position player is placed automatically", /Chamberlain/.test(await grid.locator('[data-slot="C"]').innerText()));
  await page.getByRole("button", { name: "Undo the last placement" }).click();
  gate("Undo restores the five", !/Chamberlain/.test(await grid.locator('[data-slot="C"]').innerText()));
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Pettit");
  await page.locator('button[data-player="bob-60s"]').click();
  gate("an occupied eligible slot is offered as a swap", (await grid.locator('[data-slot="PF"]').getAttribute("data-place-state")) === "OCCUPIED");
  await grid.getByRole("button", { name: "Swap Kevin Durant for Bob Pettit at Power Forward" }).click();
  gate("the swap is legal and explicit", /Pettit/.test(await grid.locator('[data-slot="PF"]').innerText()));

  // ══ E. A full Candidate game and the Story-led dock ════════════════════════
  console.log("\nE. a full game on the candidate engine, Story first");
  await page.evaluate(() => { try { localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const ctaCount = async () => page.locator("button.ec-ta-cta").count();
  gate("one primary action at Roll 1", (await ctaCount()) === 1);
  gate("the coach section is actionable during the roll", (await page.locator(".ec-ta-coach").getAttribute("data-active")) === "true");
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click();
  await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 });
  gate("one primary action at READY", (await ctaCount()) === 1);
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  const rail = page.locator(".ec-ta-rail");
  await rail.getByText("FINAL SCORE", { exact: true }).first().waitFor({ timeout: 90_000 });
  gate("the result lands in the dock", true);
  gate("the Story is the open section", (await rail.getByRole("tab", { name: "Game Story" }).getAttribute("aria-selected")) === "true" && (await rail.locator("#ec-dock-panel").count()) === 1);
  gate("the board compressed: no primary action, the matchup stays", (await ctaCount()) === 0 && (await page.getByText("THE MATCHUP YOU BUILT").count()) === 1);
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  const local = previewCandidateIdentity();
  gate("the deployment runs this checkout's candidate", health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.candidateId === local.candidateId,
    `${health?.preview?.candidateId} / ${String(health?.preview?.candidateCoreHash).slice(0, 12)}`);
  await page.screenshot({ path: `${SHOTS}/result-story.png` });

  // ══ F. Tablet and phone ════════════════════════════════════════════════════
  console.log("\nF. tablet and phone");
  const responsive = [];
  for (const [w, h, touch] of [[1280, 800, false], [768, 1024, true], [430, 932, true], [390, 844, true]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await c.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
    const p = await c.newPage();
    await freshAccount(p);
    await p.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
    await p.locator(".ec-lobby").waitFor({ timeout: 45_000 });
    const m = await p.evaluate(() => {
      const cards = [...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")];
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        columns: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().x))).size,
        minTarget: Math.min(...[...document.querySelectorAll(".ec-mode-action")].map((b) => Math.round(b.getBoundingClientRect().height))),
        first: cards[0]?.dataset.mode,
      };
    });
    await p.screenshot({ path: `${SHOTS}/lobby-${w}x${h}.png` });
    responsive.push({ viewport: `${w}x${h}`, ...m });
    gate(`${w}x${h}: no overflow, Chaos first, 44px targets, ${w <= 640 ? 1 : w <= 1024 ? 2 : 3} column(s)`,
      m.overflow <= 0 && m.first === "chaos" && m.minTarget >= 44 && m.columns === (w <= 640 ? 1 : w <= 1024 ? 2 : 3), JSON.stringify(m));
    await c.close();
  }
  await browser.close();

  writeFileSync(`${OUT}/preview-integration.json`, JSON.stringify({
    artifact: "preview-integration", phase: "9A — Play Lobby, activation clarity, multi-position placement",
    deployment: { baseUrl: BASE, commit: process.env.PHASE9A_COMMIT || null, environment: "vercel preview, access-gated, branch alias" },
    candidateUnderTest: { deployed: health?.preview || null, local },
    accessControl: { unauthenticatedRoutesRefused: gates.filter((g) => /is refused/.test(g.name)).every((g) => g.ok), keys: ledger },
    responsive, gates, passed: gates.length - failed, failed,
  }, null, 2) + "\n");
  console.log(`\n${gates.length - failed}/${gates.length} deployed gates passed`);
  console.log(`evidence written to ${OUT}/preview-integration.json`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
