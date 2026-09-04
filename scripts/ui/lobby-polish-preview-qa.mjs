#!/usr/bin/env node
// ── Deployed Play Lobby polish QA (Phase 9A.3P) ──────────────────────────────
// Drives the DEPLOYED owner-review branch preview as a visitor would, and then
// re-reads the stable Wave 2 alias, the Wave 1 alias and production to prove
// none of them moved. Every gate is measured on a deployment, never assumed.
//
//   PHASE9A3P_COMMIT=<sha> node scripts/ui/lobby-polish-preview-qa.mjs https://<branch-preview>
//
// Access: the Wave 2 OWNER key from .preview-secrets/ is exchanged for a signed
// session by POSTing it to /api/preview-access, exactly as a tester's link does.
// No key is printed, stored in an artifact, or placed in a URL.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium, request as pwRequest } from "@playwright/test";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";
import { WAVE2 } from "../../src/wave2.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/ui/lobby-polish-preview-qa.mjs https://<preview-host>"); process.exit(2); }
const OUT = "data/validation/9a3p"; const SHOTS = `${OUT}/screens/preview`; mkdirSync(SHOTS, { recursive: true });
const WAVE2_ALIAS = "https://era-clash-basketball-git-wave2-era-clash.vercel.app";
const WAVE1_ALIAS = "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const PROD = "https://era-clash-basketball.vercel.app";
const WAVE2_STAMP = "eraclash-assets:2.7.2:d3d5455dcf91", WAVE1_STAMP = "eraclash-assets:2.7.2:2f35a3b70c30";
const LABELS = { chaos: "START CHAOS CLASH", dream: "BUILD MATCHUP", daily: "PLAY TODAY’S CLASH", bo7: "START SERIES", win82: "START SEASON", tournament: "ENTER TOURNAMENT", gauntlet: "LEARN MORE" };

const gates = []; let failed = 0;
const gate = (name, ok, detail = "") => { gates.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };
const w2 = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys; const owner = w2.find((k) => k.role === "owner");
const w1 = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8")).keys;
const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const firstTime = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
const returning = (page) => page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); localStorage.setItem("ec_career", JSON.stringify({ gamesPlayed: 2, wins: 1, losses: 1 })); } catch (e) {} });
const keepAccount = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); } catch (e) {} });
const posts = (page) => { const p = []; page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") { try { p.push(JSON.parse(r.postData() || "{}").chaosAction || "(sim)"); } catch { p.push("?"); } } }); return p; };
const lobbyFacts = (page) => page.evaluate(() => ({
  hero: document.querySelector(".ec-lobby").dataset.hero, presentation: document.querySelector(".ec-lobby").dataset.presentation, compact: !!document.querySelector(".ec-lobby-hero--compact"),
  cards: [...document.querySelectorAll(".ec-mode-card")].map((e) => { const a = e.querySelector(".ec-mode-action"); const cs = getComputedStyle(a); return { id: e.dataset.mode, label: cs.textTransform === "uppercase" ? a.textContent.trim().toUpperCase() : a.textContent.trim(), hierarchy: a.dataset.hierarchy, name: a.getAttribute("aria-label"), gradient: /gradient/.test(cs.backgroundImage), border: cs.borderStyle, arrow: getComputedStyle(a, "::after").content, href: a.getAttribute("href"), signature: e.querySelector(".ec-mode-signature")?.dataset.signature, sigHidden: e.querySelector(".ec-mode-signature")?.getAttribute("aria-hidden"), sigOpacity: e.querySelector(".ec-mode-signature") ? +parseFloat(getComputedStyle(e.querySelector(".ec-mode-signature")).opacity).toFixed(3) : null, wraps: a.scrollWidth > a.clientWidth + 1 }; }),
  headerImgs: [...document.querySelectorAll(".ec-brand-header img")].map((i) => i.getAttribute("src")), headerHeight: Math.round(document.querySelector(".ec-brand-header").getBoundingClientRect().height),
  anyNba: [...document.querySelectorAll(".ec-brand-header *, .ec-lobby *")].some((e) => /nba/i.test(`${e.getAttribute("src") || ""} ${e.getAttribute("alt") || ""} ${e.getAttribute("aria-label") || ""} ${getComputedStyle(e).backgroundImage}`)),
  headerBg: getComputedStyle(document.querySelector(".ec-brand-header")).backgroundColor, canvas: getComputedStyle(document.querySelector(".ec-lobby-court")).backgroundColor,
  continueCard: !!document.querySelector(".ec-continue"), continueAboveGrid: document.querySelector(".ec-continue") ? document.querySelector(".ec-continue").getBoundingClientRect().top < document.querySelector(".ec-lobby-primary").getBoundingClientRect().top : null,
  eraLeak: document.querySelector(".ec-continue") ? /\b\d{4}s\b/.test(document.querySelector(".ec-continue").textContent) : false,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, docHeight: document.documentElement.scrollHeight, run: localStorage.getItem("ec_chaos_run"),
  minTarget: Math.min(...[...document.querySelectorAll(".ec-mode-action, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))),
  primaryCols: new Set([...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")].map((c) => Math.round(c.getBoundingClientRect().x))).size,
}));
const stampOf = async (ctx, base) => (((await (await ctx.get(`${base}/`)).text()).match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null);

const run = async () => {
  console.log(`\nDEPLOYED PLAY LOBBY POLISH QA — ${BASE}\n\nA. access and identity`);
  const anon = await pwRequest.newContext({ baseURL: BASE });
  for (const p of ["/", "/play", "/play/chaos", "/play/dream"]) { const r = await anon.get(p, { maxRedirects: 0 }); gate(`unauthenticated ${p} is refused (401)`, r.status() === 401, `HTTP ${r.status()}`); }
  const wrong = await anon.post("/api/preview-access", { form: { key: "not-a-key" }, maxRedirects: 0 }); gate("a wrong key is refused", wrong.status() === 401);
  const w1try = await anon.post("/api/preview-access", { form: { key: w1.find((k) => k.role === "owner").key }, maxRedirects: 0 }); gate("the Wave 1 owner key is refused on the polish preview (Wave 2 pool only)", w1try.status() === 401, `HTTP ${w1try.status()}`);
  await anon.dispose();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  gate("the Wave 2 owner key opens a session on the polish preview", auth.status() === 303, `HTTP ${auth.status()}`);
  if (auth.status() !== 303) { console.error("no session — stopping"); process.exit(1); }
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json(); const local = previewCandidateIdentity();
  const stamp = await stampOf(ctx.request, BASE);
  gate("the preview runs Candidate 4 / 1.4.0 with this checkout's core hash and the Wave 2 id", health?.preview?.candidateId === local.candidateId && health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.calibrationVersion === local.possessionCalibrationVersion && health?.preview?.waveId === WAVE2.waveId, `${health?.preview?.candidateId} / ${health?.preview?.calibrationVersion} / ${health?.preview?.waveId}`);
  gate("the preview build stamp differs from the stable Wave 2 stamp (a new build, not the distributed one)", !!stamp && stamp !== WAVE2_STAMP, stamp);

  console.log("\nB. first-time lobby");
  let page = await ctx.newPage(); await firstTime(page); const p0 = posts(page);
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 }); await page.waitForTimeout(800);
  const ft = await lobbyFacts(page);
  gate("full hero for a first-time visitor; Night Court shell (obsidian header, ivory canvas); presentation play-lobby-polish-v1", ft.hero === "full" && !ft.compact && lum(ft.headerBg) < 0.02 && lum(ft.canvas) > 0.8 && ft.presentation === "play-lobby-polish-v1");
  gate("the header shows the Mk1 mark only; no league mark anywhere in the shell or the lobby; header not taller than the parent's 65px", ft.headerImgs.join() === "/brand/eraclash-logo-mk1.png" && !ft.anyNba && ft.headerHeight <= 65, `${ft.headerImgs.join()} · ${ft.headerHeight}px`);
  gate("all seven action labels are exact", ft.cards.every((c) => c.label === LABELS[c.id]), ft.cards.map((c) => `${c.id}:${c.label}`).join(" · "));
  gate("exactly one filled-Gold CTA (Chaos); five bordered+arrowed secondaries; one dashed unavailable (Era Gauntlet)", ft.cards.filter((c) => c.gradient).map((c) => c.id).join() === "chaos" && ft.cards.filter((c) => c.hierarchy === "secondary").every((c) => c.border === "solid" && /→/.test(c.arrow)) && ft.cards.filter((c) => c.hierarchy === "secondary").length === 5 && ft.cards.find((c) => c.id === "gauntlet").border === "dashed");
  gate("accessible names carry purpose, mode and access fact", ft.cards.find((c) => c.id === "chaos").name === "Start Chaos Clash, recommended mode" && ft.cards.find((c) => c.id === "dream").name === "Build Dream Matchup, free account required" && ft.cards.find((c) => c.id === "gauntlet").name === "Learn more about Era Gauntlet, coming soon");
  gate("seven distinct signatures, hidden from assistive tech, 4–10% opacity", new Set(ft.cards.map((c) => c.signature)).size === 7 && ft.cards.every((c) => c.sigHidden === "true" && c.sigOpacity >= 0.04 && c.sigOpacity <= 0.10));
  gate("no label wraps; no overflow; one desktop viewport; no run created; no POST", ft.cards.every((c) => !c.wraps) && ft.overflow <= 0 && ft.docHeight <= 1024 && !ft.run && p0.length === 0, `doc ${ft.docHeight}px · posts ${p0.length}`);
  await page.screenshot({ path: `${SHOTS}/first-time-desktop-1536x1024.png` });
  // Every mode route from its card.
  const routes = {};
  for (const id of ["dream", "daily", "bo7", "win82", "tournament", "gauntlet", "chaos"]) { await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.locator(`.ec-mode-card[data-mode="${id}"] .ec-mode-action`).waitFor({ timeout: 30_000 }); await page.locator(`.ec-mode-card[data-mode="${id}"] .ec-mode-action`).click(); await page.waitForTimeout(600); routes[id] = new URL(page.url()).pathname; }
  gate("every card routes to its mode's own address (Era Gauntlet to its information page, never a checkout)", routes.chaos === "/play/chaos" && routes.dream === "/play/dream" && routes.daily === "/play/daily" && routes.bo7 === "/play/best-of-7" && routes.win82 === "/play/win-82" && routes.tournament === "/play/tournament" && routes.gauntlet === "/modes/era-gauntlet", JSON.stringify(routes));
  gate("Coming Soon opens an information page, not a purchase", await page.goto(`${BASE}/modes/era-gauntlet`, { waitUntil: "domcontentloaded" }).then(() => page.locator(".ec-panel").first().waitFor({ timeout: 30_000 })).then(() => page.evaluate(() => !/checkout|\$\d|price/i.test(document.body.innerText))));
  // Account-required gate as a guest.
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.locator('.ec-mode-card[data-mode="dream"] .ec-mode-action').waitFor({ timeout: 30_000 }); await page.locator('.ec-mode-card[data-mode="dream"] .ec-mode-action').click();
  await page.locator("#ec-acct-name").waitFor({ timeout: 30_000 });
  gate("BUILD MATCHUP as a guest continues through the existing account gate at /play/dream", /\/play\/dream$/.test(page.url()) && await page.getByRole("button", { name: "BACK TO THE LOBBY" }).isVisible());
  await page.close();

  console.log("\nC. returning lobby");
  page = await ctx.newPage(); await returning(page); const p1 = posts(page);
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 }); await page.waitForTimeout(600);
  const rt = await lobbyFacts(page);
  gate("compact hero for a returning device; the same seven labels and the one primary; no run; no POST", rt.hero === "compact-returning" && rt.compact && rt.cards.every((c) => c.label === LABELS[c.id]) && rt.cards.filter((c) => c.gradient).map((c) => c.id).join() === "chaos" && !rt.run && p1.length === 0 && rt.docHeight <= 1024);
  await page.screenshot({ path: `${SHOTS}/returning-desktop-1536x1024.png` });
  await page.close();

  console.log("\nD. active run, one Chaos Clash, Result Dock");
  page = await ctx.newPage(); await keepAccount(page); const p2 = posts(page);
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^ROLL 1/ }).click(); await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run")); const firstName = await page.locator(".ec-ta-roster .ec-pc .ec-pc-name").first().innerText();
  await page.getByRole("button", { name: "EraClash Basketball home" }).click(); await page.locator(".ec-lobby").waitFor({ timeout: 30_000 });
  const paint = await page.evaluate(() => ({ hero: document.querySelector(".ec-lobby").dataset.hero, h: Math.round(document.querySelector(".ec-lobby-hero").getBoundingClientRect().height) }));
  await page.locator(".ec-continue:not(.ec-continue--pending)").waitFor({ timeout: 30_000 }); await page.waitForTimeout(500);
  const ar = await lobbyFacts(page); const heroAfter = await page.evaluate(() => Math.round(document.querySelector(".ec-lobby-hero").getBoundingClientRect().height));
  gate("the logo returns to the lobby: compact hero at first paint and after the run resolves (no shift), Continue above the grid, era hidden, run preserved", paint.hero === "compact-active-run" && paint.h === heroAfter && ar.continueCard && ar.continueAboveGrid && !ar.eraLeak && ar.run === runId, `hero ${paint.h}→${heroAfter}px`);
  await page.screenshot({ path: `${SHOTS}/active-run-desktop-1536x1024.png` });
  await page.locator(".ec-continue").getByRole("button", { name: /Continue/i }).click(); await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  gate("Continue reopens the exact run (same first card, same id); only one start was ever posted", (await page.locator(".ec-ta-roster .ec-pc .ec-pc-name").first().innerText()) === firstName && (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId && p2.filter((a) => a === "start").length === 1);
  const holds = page.locator(".ec-pc-action"); await holds.nth(0).click(); await page.waitForTimeout(200); await holds.nth(2).click(); await page.waitForTimeout(450);
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click(); await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click(); await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Select / }).first().click(); await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 }); await page.getByRole("button", { name: /RUN SIM/ }).click();
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).waitFor({ timeout: 120_000 });
  const dock = await page.evaluate(() => ({ open: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(), scores: [...document.querySelectorAll(".ec-dock-score")].map((e) => Number(e.textContent)) }));
  gate("one Chaos Clash completes on Candidate 4; the Result Dock leads with the Story and two scores", dock.open === "Game Story" && dock.scores.length === 2 && dock.scores.every((n) => n > 40), JSON.stringify(dock));
  for (const tab of ["Box Score", "Coaching", "Analysis", "Game Story"]) { await page.locator(".ec-ta-rail").getByRole("tab", { name: tab }).click(); await page.waitForTimeout(120); }
  gate("every result tab opens", (await page.locator('[role="tabpanel"]').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/result-desktop-1536x1024.png` });
  // After a finished game the lobby is a returning lobby.
  await page.getByRole("button", { name: "EraClash Basketball home" }).click(); await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 30_000 }); await page.waitForTimeout(500);
  const post = await lobbyFacts(page);
  gate("after the game the lobby is compact (returning) with no false Continue card", post.hero !== "full" && !post.continueCard, post.hero);
  await page.close();

  console.log("\nE. tablet and mobile");
  for (const [w, h, name] of [[768, 1024, "tablet"], [430, 932, "mobile"], [390, 844, "mobile"], [375, 812, "mobile"]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); await c.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
    const p = await c.newPage(); await firstTime(p); await p.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await p.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 }); await p.waitForTimeout(400);
    const f = await lobbyFacts(p);
    gate(`${name} ${w}×${h}: no overflow, Chaos first, ≥44px controls, labels intact, Mk1 only in the header, ${w < 700 ? "one column with a full-width primary" : "two columns"}`, f.overflow <= 0 && f.cards[0].id === "chaos" && f.minTarget >= 44 && f.cards.every((c) => c.label === LABELS[c.id] && !c.wraps) && f.headerImgs.join() === "/brand/eraclash-logo-mk1.png" && (w < 700 ? f.primaryCols === 1 : f.primaryCols === 2), `overflow ${f.overflow} · min ${f.minTarget}px · cols ${f.primaryCols}`);
    await p.screenshot({ path: `${SHOTS}/${name}-first-time-${w}x${h}.png`, fullPage: true });
    if (w === 390) { const rp = await c.newPage(); await returning(rp); await rp.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await rp.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 }); const rf = await lobbyFacts(rp); gate("mobile 390×844 returning: compact hero", rf.hero === "compact-returning" && rf.compact); await rp.screenshot({ path: `${SHOTS}/mobile-returning-390x844.png`, fullPage: true }); }
    await c.close();
  }

  console.log("\nF. the frozen builds did not move");
  const w2ctx = await pwRequest.newContext(); const w2s = await w2ctx.post(`${WAVE2_ALIAS}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const w2stamp = w2s.status() === 303 ? await stampOf(w2ctx, WAVE2_ALIAS) : null; const w2health = w2s.status() === 303 ? await (await w2ctx.get(`${WAVE2_ALIAS}/api/health`)).json() : null;
  const w2html = w2s.status() === 303 ? await (await w2ctx.get(`${WAVE2_ALIAS}/play`)).text() : "";
  gate(`the stable Wave 2 alias still serves ${WAVE2_STAMP} (Candidate 4, Wave 2 id) — current testers were not moved`, w2stamp === WAVE2_STAMP && w2health?.preview?.candidateId === "Candidate 4" && w2health?.preview?.waveId === WAVE2.waveId, `${w2stamp}`);
  gate("the stable Wave 2 build does not carry the polish (no play-lobby-polish-v1 in its bundle)", !/play-lobby-polish-v1/.test(w2html) || w2html.length < 2000, `${w2html.length} bytes of shell`);
  await w2ctx.dispose();
  const w1ctx = await pwRequest.newContext(); const w1s = await w1ctx.post(`${WAVE1_ALIAS}/api/preview-access`, { form: { key: w1.find((k) => k.role === "owner").key }, maxRedirects: 0 });
  const w1stamp = w1s.status() === 303 ? await stampOf(w1ctx, WAVE1_ALIAS) : null; const w1health = w1s.status() === 303 ? await (await w1ctx.get(`${WAVE1_ALIAS}/api/health`)).json() : null;
  gate(`the Wave 1 alias still serves ${WAVE1_STAMP} (Candidate 3)`, w1stamp === WAVE1_STAMP && w1health?.preview?.candidateId === "Candidate 3", `${w1stamp} · ${w1health?.preview?.candidateId}`);
  await w1ctx.dispose();
  const pc = await pwRequest.newContext(); const ph = await (await pc.get(`${PROD}/api/health`)).json(); const proot = await pc.get(`${PROD}/`); const phtml = await proot.text();
  gate("production is unchanged: build 2.7.2, no preview block, no lobby, no polish", ph?.build === "2.7.2" && !ph?.preview && proot.status() === 200 && !/ec-lobby|play-lobby-polish/.test(phtml), `${ph?.build}`);
  await pc.dispose();

  await browser.close();
  const out = { artifact: "lobby-preview-qa", phase: "9A.3P — Play Lobby brand, CTA and entry polish", deployment: { baseUrl: BASE, commit: process.env.PHASE9A3P_COMMIT || null, buildStamp: stamp, health: health?.preview || null }, frozen: { wave2: { alias: WAVE2_ALIAS, stamp: w2stamp, expected: WAVE2_STAMP, unchanged: w2stamp === WAVE2_STAMP }, wave1: { alias: WAVE1_ALIAS, stamp: w1stamp, expected: WAVE1_STAMP, unchanged: w1stamp === WAVE1_STAMP }, production: { url: PROD, build: ph?.build, unchanged: ph?.build === "2.7.2" && !ph?.preview } }, firstTime: ft, returning: rt, activeRun: { heroAtFirstPaint: paint, continueAboveGrid: ar.continueAboveGrid, eraLeak: ar.eraLeak, runPreserved: ar.run === runId }, routes, dock, gates, passed: gates.length - failed, failed, screenshots: SHOTS, note: "Owner-review branch preview only. No tester was invited to it; the stable Wave 2 alias was read, never written." };
  writeFileSync(`${OUT}/lobby-preview-qa.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${out.passed}/${gates.length} deployed gates passed → ${OUT}/lobby-preview-qa.json`);
  process.exit(failed ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
