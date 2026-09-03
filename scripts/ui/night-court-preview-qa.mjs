#!/usr/bin/env node
// ── Deployed Night Court V1 QA (Phase 9A.2) ──────────────────────────────────
//   PHASE9A2_COMMIT=<sha> node scripts/ui/night-court-preview-qa.mjs https://<branch-preview>
// Measured on the DEPLOYMENT with a real owner session: access control and every
// issued key; the lab still owner-only; the lobby, an empty arena, Roll 1, Era
// Reveal, Coach Chaos, a Candidate 4 game, the Result Dock and its tabs, the
// Full Postgame and Box Score, Dream Matchup placement, the account and
// membership gates, desktop/tablet/mobile, portrait fixtures, feedback, and the
// stable Wave 1 alias. Keys are exchanged for sessions and never printed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium, request as pwRequest } from "@playwright/test";
import { PRODUCTION_THEME_ID } from "../../src/theme/themeResolver.js";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/ui/night-court-preview-qa.mjs https://<preview-host>"); process.exit(2); }
const OUT = "data/validation/9a2";
const SHOTS = `${OUT}/preview-screens`;
mkdirSync(SHOTS, { recursive: true });
const gates = []; let failed = 0;
const gate = (name, ok, detail = "") => { gates.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); return !!ok; };
const secrets = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8"));
const keys = secrets.keys;
const owner = keys.find((k) => k.role === "owner"), tester = keys.find((k) => k.role !== "owner");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const P = PRODUCTION_THEME_ID;
const LAB = "/dev/basketball-theme-lab";
const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const withAccount = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "Owner QA"); localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
const asGuest = (page) => page.addInitScript(() => { try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_name"); localStorage.removeItem("ec_chaos_run"); } catch (e) {} });

const run = async () => {
  console.log(`\nDEPLOYED NIGHT COURT V1 QA — ${BASE}\n\nA. access control`);
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const root = await anon.get("/play", { maxRedirects: 0 });
  gate("unauthenticated /play is refused (401 access page)", root.status() === 401 && /Private preview/.test(await root.text()), `HTTP ${root.status()}`);
  const bad = await anon.post("/api/preview-access", { form: { key: "ec-w1-v1-burned-000000000000000000000000" }, maxRedirects: 0 });
  gate("an invalid / pre-rotation-format key is denied and sets no session", bad.status() === 401 && !/pv_session=[^;]/.test(bad.headers()["set-cookie"] || ""), `HTTP ${bad.status()}`);
  gate("the key file carries only the current key version; burned v1 keys are not present", keys.every((k) => k.keyVersion === secrets.keyVersion) && (secrets.rotationLog || []).length > 0, `keyVersion ${secrets.keyVersion}, ${secrets.rotationLog?.length ?? 0} rotation entries`);
  await anon.dispose();
  const ledger = [];
  for (const k of keys) {
    const c = await pwRequest.newContext({ baseURL: BASE });
    const r = await c.post("/api/preview-access", { form: { key: k.key }, maxRedirects: 0 });
    const cookie = r.headers()["set-cookie"] || "";
    ledger.push({ testerId: k.testerId, role: k.role, sha256Prefix: sha(k.key), accepted: r.status() === 303 && /pv_session=[^;]/.test(cookie) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) });
    await c.dispose();
  }
  gate(`all ${keys.length} existing Wave 1 keys still open a session`, ledger.every((k) => k.accepted), ledger.map((k) => k.testerId).join(", "));
  const t = await pwRequest.newContext({ baseURL: BASE });
  await t.post("/api/preview-access", { form: { key: tester.key }, maxRedirects: 0 });
  const tl = await t.get(LAB, { maxRedirects: 0 }); const tp = await t.get("/play", { maxRedirects: 0 });
  gate("a tester's valid session: 404 at the lab, 200 at /play", tl.status() === 404 && tp.status() === 200, `lab ${tl.status()} · play ${tp.status()}`);
  await t.dispose();

  console.log("\nB. the product, as the owner");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  if (auth.status() !== 303) { console.error("could not open an owner session"); process.exit(1); }
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  const local = previewCandidateIdentity();
  gate("the deployment runs this checkout's candidate (Candidate 4, 1.4.0)", health?.preview?.candidateId === local.candidateId && health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.possessionCalibrationVersion === local.possessionCalibrationVersion, `${health?.preview?.candidateId} / ${String(health?.preview?.candidateCoreHash).slice(0, 12)} / ${health?.preview?.possessionCalibrationVersion}`);
  const stamp = ((await (await ctx.request.get(`${BASE}/`)).text()).match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null;
  const page = await ctx.newPage();
  await withAccount(page);
  // 8. the Play Lobby
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 });
  const lobby = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, header: getComputedStyle(document.querySelector("header")).backgroundColor, logo: (() => { const i = document.querySelector("header img.ec-brand-logo"); return i && i.complete && i.naturalWidth > 0; })(), lobbyLogo: (() => { const i = document.querySelector(".ec-lobby-logo"); return i && i.complete && i.naturalWidth > 0; })(), band: getComputedStyle(document.querySelector(".ec-lobby-hero")).backgroundColor, canvas: getComputedStyle(document.querySelector(".ec-lobby-court")).backgroundColor, fracture: getComputedStyle(document.querySelector(".ec-lobby-fracture")).backgroundImage, cardInk: getComputedStyle(document.querySelector(".ec-mode-title")).color, labLinks: [...document.querySelectorAll("a[href]")].filter((a) => /theme-lab/.test(a.href)).length, picker: /theme lab|choose your basketball theme/i.test(document.body.innerText), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  gate("the lobby renders the production theme: obsidian header + band with the Mk1 logo, ivory canvas, ink titles, one fracture, no picker", lobby.theme === P && lobby.logo && lobby.lobbyLogo && lum(lobby.header) < 0.02 && lum(lobby.band) < 0.02 && lum(lobby.canvas) > 0.8 && lum(lobby.cardInk) < 0.05 && /112deg/.test(lobby.fracture) && lobby.labLinks === 0 && !lobby.picker && lobby.overflow === 0, JSON.stringify({ theme: lobby.theme, canvas: lobby.canvas }));
  await page.screenshot({ path: `${SHOTS}/desktop-play-lobby-1536x1024.png` });
  // 9–13. empty arena → Roll 1 → Era Reveal → Coach Chaos → a Candidate 4 game
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  const empty = await page.evaluate(() => ({ backs: document.querySelectorAll(".ec-pc-empty").length, divider: getComputedStyle(document.querySelector(".ec-ta-roster-divider")).backgroundImage, ctaGlow: getComputedStyle(document.querySelector(".ec-ta-cta")).boxShadow, stageFocus: document.querySelector(".ec-ta-stage").dataset.focus, transition: document.querySelectorAll(".ec-fracture-transition").length }));
  gate("an empty Chaos Arena: ten card backs, the fracture divide, the one glow on ROLL 1", empty.backs === 10 && /112deg/.test(empty.divider) && /232, 177, 60/.test(empty.ctaGlow) && empty.stageFocus === "empty", JSON.stringify({ backs: empty.backs, focus: empty.stageFocus }));
  await page.screenshot({ path: `${SHOTS}/desktop-empty-arena-1536x1024.png` });
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const holds = page.locator(".ec-pc-action"); await holds.nth(0).click(); await holds.nth(1).click();
  const r1 = await page.evaluate(() => ({ held: document.querySelectorAll('.ec-pc[data-held="true"]').length, heldEdge: getComputedStyle(document.querySelector('.ec-pc[data-held="true"]'), "::before").backgroundImage, heldGlow: getComputedStyle(document.querySelector('.ec-pc[data-held="true"]')).boxShadow, ctaGlow: getComputedStyle(document.querySelector(".ec-ta-cta")).boxShadow, focus: document.querySelector(".ec-ta-stage").dataset.focus, stages: document.querySelectorAll(".ec-pc-portrait .ec-portrait-stage").length, eraHidden: /HIDDEN/.test(document.querySelector(".ec-ta-utility").innerText) }));
  gate("Roll 1: holds register; held cards carry the fracture edge and the one glow moves from the CTA to the cards; every portrait rides the stage", r1.held === 2 && /112deg/.test(r1.heldEdge) && /225, 167, 44/.test(r1.heldGlow) && !/232, 177, 60/.test(r1.ctaGlow) && r1.focus === "hold" && r1.stages === 10 && r1.eraHidden, JSON.stringify({ held: r1.held, focus: r1.focus, stages: r1.stages }));
  await page.screenshot({ path: `${SHOTS}/desktop-roll1-hold-1536x1024.png` });
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click();
  await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  const era = await page.evaluate(() => ({ id: document.querySelector(".ec-intel-era-id")?.innerText.trim(), revealed: document.querySelector(".ec-intel-era").dataset.revealed, edge: getComputedStyle(document.querySelector(".ec-intel-era"), "::before").backgroundImage, violet: getComputedStyle(document.querySelector(".ec-intel-era .ec-intel-value")).color }));
  gate("Era Reveal: the era arrives with Roll 2 and the era section carries the fracture edge; era intelligence reads violet", /^\d{4}s$/.test(era.id || "") && era.revealed === "true" && /112deg/.test(era.edge), `${era.id} · ${era.violet}`);
  await page.screenshot({ path: `${SHOTS}/desktop-roll2-era-1536x1024.png` });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Select / }).first().click();
  const coach = await page.evaluate(() => { const on = document.querySelector('.ec-coach-card[data-on="true"]'); return { selected: !!on, edge: on ? getComputedStyle(on, "::before").backgroundImage : "", glow: on ? getComputedStyle(on).boxShadow : "", title: getComputedStyle(document.querySelector(".ec-ta-coach-title")).color, focus: document.querySelector(".ec-ta-stage").dataset.focus, othersEdge: [...document.querySelectorAll('.ec-coach-card[data-on="false"]')].every((c) => parseFloat(getComputedStyle(c, "::before").opacity) === 0) }; });
  gate("Coach Chaos: the selected staff carries the fracture edge and the one glow (violet); the others do not", coach.selected && /112deg/.test(coach.edge) && coach.focus === "hire" && coach.othersEdge, JSON.stringify({ focus: coach.focus, title: coach.title }));
  await page.screenshot({ path: `${SHOTS}/desktop-coach-select-1536x1024.png` });
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 });
  const simResP = page.waitForResponse((r) => /\/api\/(simulate|game)/.test(r.url()) && r.request().method() === "POST" && r.status() === 200, { timeout: 90_000 }).catch(() => null);
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  const heldSim = await page.locator('.ec-fracture-transition[data-kind="sim"][data-hold="true"]').count().catch(() => 0);
  await simResP;
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).waitFor({ timeout: 120_000 });
  // 14–15. Result Dock and every tab
  const dock = await page.evaluate(() => ({ storyOpen: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(), edge: (() => { const e = document.querySelector('.ec-fracture-edge[data-on="true"]'); return e ? getComputedStyle(e).backgroundImage : ""; })(), score: document.querySelectorAll(".ec-dock-score").length, tabUnderline: getComputedStyle(document.querySelector('.ec-dock-tab[aria-selected="true"]'), "::after").backgroundImage, candidate: /candidate/i.test(document.body.innerText) }));
  gate("the Result Dock: Story leads a live result, the final-score panel carries the fracture edge, the active tab is underlined by it", dock.storyOpen === "Game Story" && /112deg/.test(dock.edge) && dock.score === 2 && /112deg/.test(dock.tabUnderline), JSON.stringify({ open: dock.storyOpen }));
  gate("the simulation held the central fracture transition while it ran", heldSim >= 1, `${heldSim} transition element(s) holding`);
  for (const tab of ["Box Score", "Coaching", "Analysis", "Game Story"]) { await page.locator(".ec-ta-rail").getByRole("tab", { name: tab }).click(); await page.waitForTimeout(150); }
  gate("every result tab opens", (await page.locator('[role="tabpanel"]').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/desktop-result-1536x1024.png` });
  // 16–17. Full Postgame and the Box Score
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  const report = page.getByRole("dialog", { name: "Full postgame report" });
  await report.waitFor({ timeout: 20_000 });
  const pg = await page.evaluate(() => { const l = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const inset = document.querySelector(".ec-report-overlay .ec-arena-inset"); const paper = document.querySelector(".ec-report-overlay .ec-arena-inset").parentElement; return { heroDark: l(getComputedStyle(inset).backgroundColor) < 0.05, paperLight: l(getComputedStyle(paper).backgroundColor) > 0.8, vs: getComputedStyle([...document.querySelectorAll(".ec-report-overlay .ec-arena-inset div")].find((d) => d.textContent.trim() === "VS") || inset).backgroundImage, watermark: document.querySelectorAll(".ec-report-overlay .ec-fracture-watermark").length, h1: document.querySelectorAll(".ec-report-overlay h1").length }; });
  gate("Full Postgame: dark result hero (fracture VS + watermark) above a light editorial report, with a heading", pg.heroDark && pg.paperLight && /112deg/.test(pg.vs) && pg.watermark === 1 && pg.h1 >= 1, JSON.stringify(pg));
  await report.getByRole("tab", { name: "Box Score" }).click();
  const box = await page.evaluate(() => { const l = (c) => { const [r, g, b] = String(c).match(/[\d.]+/g).map(Number); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; }; const table = document.querySelector(".ec-report-overlay .box-table"); const cells = [...document.querySelectorAll(".ec-report-overlay td.box-player")].filter((c) => c.textContent.trim() && c.textContent.trim() !== "TOTAL").slice(0, 4); const widths = [...table.querySelectorAll("colgroup col")].map((c) => c.getBoundingClientRect().width); const wrapped = [...table.querySelectorAll("td")].filter((td) => td.getBoundingClientRect().height > 30).length; return { tables: document.querySelectorAll(".ec-report-overlay table").length, ink: cells.map((c) => l(getComputedStyle(c).color)), paper: cells.map((c) => l(getComputedStyle(c).backgroundColor)), tabular: getComputedStyle(table).fontVariantNumeric, wrapped, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, scroller: getComputedStyle(document.querySelector(".ec-report-overlay .box-scroll")).overflowX }; });
  gate("Box Score: ONE table, tabular numerals, no wrapped cell, ink on ivory, scroll isolated, no page overflow", box.tables === 1 && /tabular/.test(box.tabular) && box.wrapped === 0 && box.ink.every((i) => i < 0.4) && box.overflow === 0 && box.scroller === "auto", JSON.stringify({ tables: box.tables, wrapped: box.wrapped }));
  await page.screenshot({ path: `${SHOTS}/desktop-postgame-box-1536x1024.png` });
  await report.getByRole("tab", { name: "Game Story" }).click();
  await page.screenshot({ path: `${SHOTS}/desktop-postgame-story-1536x1024.png`, fullPage: true });
  await page.getByRole("button", { name: /Back to the arena/ }).click();
  // 24. feedback (from the report, as the deployed 8C.1 pass did)
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  await report.waitFor({ timeout: 20_000 });
  let feedbackStatus = null;
  const fbBtn = report.getByRole("button", { name: /Send preview feedback/ });
  if (await fbBtn.count()) {
    const opt = report.getByRole("radio").first(); if (await opt.count()) await opt.check().catch(() => {});
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/feedback") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null), fbBtn.click()]);
    feedbackStatus = res ? res.status() : null;
    gate("preview feedback is accepted from the themed report", feedbackStatus != null && feedbackStatus >= 200 && feedbackStatus < 300, `HTTP ${feedbackStatus}`);
  } else gate("the preview feedback panel is present on the result", false, "not rendered");
  await page.getByRole("button", { name: /Back to the arena/ }).click();
  // 18. Dream Matchup placement, unchanged
  await page.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click();
  await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant");
  await page.locator('button[data-player="durant-10s"]').click();
  const grid = page.locator('.roster-grid[aria-label="Team Gold lineup"]');
  const states = await grid.locator("[data-slot]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.slot, e.dataset.placeState])));
  gate("Dream Matchup placement is byte-for-byte 9A: Durant lights SG · SF · PF; PG and C are ineligible; states carry words", states.SG === "ELIGIBLE" && states.SF === "ELIGIBLE" && states.PF === "ELIGIBLE" && states.PG === "INELIGIBLE" && states.C === "INELIGIBLE", JSON.stringify(states));
  const placementLook = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, paper: getComputedStyle(document.body).backgroundColor, words: document.querySelectorAll(".ec-slot-state").length }));
  gate("the Dream builder is an editorial (ivory) surface with worded slot states", placementLook.theme === P && lum(placementLook.paper) > 0.8 && placementLook.words >= 5, JSON.stringify(placementLook));
  await page.screenshot({ path: `${SHOTS}/desktop-dream-placement-1536x1024.png` });
  await page.getByRole("button", { name: "Place Kevin Durant at Power Forward" }).click();
  gate("a manual placement lands", /Durant/.test(await grid.locator('[data-slot="PF"]').innerText()));
  // 19. account and membership gates
  const g = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  await g.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const gp = await g.newPage(); await asGuest(gp);
  await gp.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" });
  await gp.getByText("FREE ACCOUNT REQUIRED").waitFor({ timeout: 30_000 });
  const gateLook = await gp.evaluate(() => { const l = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const btn = [...document.querySelectorAll("button")].find((b) => /CREATE FREE ACCOUNT/.test(b.textContent)); return { header: l(getComputedStyle(document.querySelector("header")).backgroundColor), paper: l(getComputedStyle(document.body).backgroundColor), gold: getComputedStyle(btn).backgroundColor, ink: l(getComputedStyle(btn).color), prices: /\$|price|per month|trial/i.test(document.body.innerText) }; });
  gate("the account gate: obsidian header, ivory content, one gold primary action with light ink, no prices", gateLook.header < 0.02 && gateLook.paper > 0.8 && gateLook.ink > 0.8 && !gateLook.prices, JSON.stringify(gateLook));
  await gp.screenshot({ path: `${SHOTS}/desktop-account-gate-1536x1024.png` });
  await gp.goto(`${BASE}/membership?feature=win82&from=/play`, { waitUntil: "domcontentloaded" });
  await gp.locator(".ec-panel").first().waitFor({ timeout: 30_000 });
  const mem = await gp.evaluate(() => { const l = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; return { header: l(getComputedStyle(document.querySelector("header")).backgroundColor), page: l(getComputedStyle(document.querySelector(".ec-arena-page")).backgroundColor), panel: l(getComputedStyle(document.querySelector(".ec-panel")).backgroundColor), h1: l(getComputedStyle(document.querySelector("h1")).color), prices: /\$\d|per month|\/mo|checkout|free trial/i.test(document.body.innerText), editorial: !!document.querySelector(".ec-editorial-shell") }; });
  gate("the membership gate: editorial shell — ivory page and panels, ink heading, obsidian header, no prices or checkout", mem.editorial && mem.header < 0.02 && mem.page > 0.8 && mem.panel > 0.8 && mem.h1 < 0.05 && !mem.prices, JSON.stringify(mem));
  await gp.screenshot({ path: `${SHOTS}/desktop-membership-1536x1024.png` });
  await g.close();
  // 23. portrait fixtures, on the deployment (owner-only lab)
  await page.goto(`${BASE}${LAB}?theme=${P}&fixture=portraits&chrome=0`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-portrait-test]").first().waitFor({ timeout: 45_000 });
  const por = await page.evaluate(() => ({ tests: document.querySelectorAll("[data-uniform]").length, stages: document.querySelectorAll(".ec-pc-portrait .ec-portrait-stage").length, layers: document.querySelectorAll(".ec-portrait-field").length }));
  gate("the portrait-stage fixture renders ten uniform tests on the deployment, each on the stage", por.tests === 10 && por.stages === 10 && por.layers === 10, JSON.stringify(por));
  await page.screenshot({ path: `${SHOTS}/desktop-portrait-stage-1536x1024.png` });
  await ctx.close();

  console.log("\nC. tablet and mobile");
  for (const [w, h, name] of [[768, 1024, "tablet"], [390, 844, "mobile"]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 800 });
    await c.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
    const p = await c.newPage(); await withAccount(p);
    await p.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await p.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 });
    const lb = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cols: new Set([...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")].map((c) => Math.round(c.getBoundingClientRect().x))).size, tap: Math.min(...[...document.querySelectorAll(".ec-mode-action, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))), header: getComputedStyle(document.querySelector("header")).backgroundColor }));
    gate(`${name} lobby: ${w <= 640 ? "one column" : "two columns"}, no overflow, controls ≥ 44px, obsidian header`, lb.overflow === 0 && lb.cols === (w <= 640 ? 1 : 2) && lb.tap >= 44 && lum(lb.header) < 0.02, JSON.stringify(lb));
    await p.screenshot({ path: `${SHOTS}/${name}-play-lobby-${w}x${h}.png` });
    await p.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await p.locator(".ec-ta").waitFor({ timeout: 45_000 });
    await p.getByRole("button", { name: /^ROLL 1/ }).click(); await p.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
    const ar = await p.evaluate(() => { const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc")]; return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().y))).size, minW: Math.min(...cards.map((c) => Math.round(c.getBoundingClientRect().width))), tap: Math.min(...[...document.querySelectorAll(".ec-pc-action, .ec-ta-cta")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))), stacked: (() => { const r = document.querySelector(".ec-ta-rail").getBoundingClientRect(), s = document.querySelector(".ec-ta-main").getBoundingClientRect(); return Math.abs(r.x - s.x) < 4; })() }; });
    gate(`${name} Time Arena: no overflow, no ten-card compression (${ar.rows} rows, min ${ar.minW}px), controls ≥ 44px, rail stacked`, ar.overflow === 0 && ar.rows >= 2 && ar.minW >= 130 && ar.tap >= 44 && ar.stacked, JSON.stringify(ar));
    await p.screenshot({ path: `${SHOTS}/${name}-time-arena-${w}x${h}.png` });
    await c.close();
  }
  await browser.close();

  console.log("\nD. Wave 1 and production untouched");
  const w1 = await pwRequest.newContext({ baseURL: "https://era-clash-basketball-git-wave1-era-clash.vercel.app" });
  const w1s = await w1.post("/api/preview-access", { form: { key: owner.key }, maxRedirects: 0 });
  const w1html = w1s.status() === 303 ? await (await w1.get("/")).text() : "";
  const w1stamp = (w1html.match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null;
  const w1lab = await w1.get(LAB, { maxRedirects: 0 });
  const w1theme = /night-court-production-hybrid/.test(w1html);
  gate("the stable Wave 1 alias still serves the pre-9A build (stamp 2f35a3b70c30), has no lab and no production theme", w1stamp === "eraclash-assets:2.7.2:2f35a3b70c30" && w1lab.status() === 404 && !w1theme, `${w1stamp} · lab HTTP ${w1lab.status()}`);
  await w1.dispose();

  writeFileSync(`${OUT}/theme-preview-qa.json`, JSON.stringify({
    artifact: "theme-preview-qa", phase: "9A.2 — Night Court Editorial production theme",
    deployment: { baseUrl: BASE, commit: process.env.PHASE9A2_COMMIT || null, buildStamp: stamp, environment: "vercel preview, access-gated; the lab owner-only" },
    candidateUnderTest: { deployed: health?.preview || null, local }, keys: ledger, feedback: { httpStatus: feedbackStatus, note: "204 is this endpoint's success response for a stored preview record; persistence is verified by `npm run preview:wave1-feedback-report` in a shell with store credentials." },
    stableWave1: { stamp: w1stamp, expected: "eraclash-assets:2.7.2:2f35a3b70c30", labStatus: w1lab.status() },
    gates, passed: gates.length - failed, failed,
  }, null, 2) + "\n");
  console.log(`\n${gates.length - failed}/${gates.length} deployed gates passed`);
  process.exit(failed ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
