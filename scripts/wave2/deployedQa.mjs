#!/usr/bin/env node
// ── Wave 2 deployed QA (Phase 9A.3) ──────────────────────────────────────────
//   PHASE9A3_COMMIT=<sha> node scripts/wave2/deployedQa.mjs https://<host> [--alias]
// Measured on a real Wave 2 deployment with the Wave 2 keys: the access matrix
// (owner, five testers, wrong key, every Wave 1 key refused, tampered session,
// role escalation, logout), the Play Lobby, active-run continuation, a Chaos
// Clash on Candidate 4, the Result Dock and Full Postgame, Wave 2 feedback,
// Dream Matchup placement, Night Court on desktop/tablet/mobile, the portrait
// fixture, and isolation (Wave 2 keys refused on the Wave 1 alias; Wave 1
// unchanged). Keys are exchanged for sessions and never printed.
// --alias writes wave2-stable-alias-qa.json instead of wave2-branch-preview-qa.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium, request as pwRequest } from "@playwright/test";
import { PRODUCTION_THEME_ID } from "../../src/theme/themeResolver.js";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";
import { WAVE2, WAVE2_COHORTS } from "../../src/wave2.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/wave2/deployedQa.mjs https://<host> [--alias]"); process.exit(2); }
const ALIAS_MODE = process.argv.includes("--alias");
const OUT = "data/validation/9a3"; const SHOTS = `${OUT}/preview-screens${ALIAS_MODE ? "-alias" : ""}`; mkdirSync(SHOTS, { recursive: true });
const WAVE1 = "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const gates = []; let failed = 0;
const gate = (name, ok, detail = "") => { gates.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); return !!ok; };
const w2 = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys;
const w1 = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8")).keys;
const owner = w2.find((k) => k.role === "owner"); const testers = w2.filter((k) => k.role !== "owner");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const P = PRODUCTION_THEME_ID;
const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const withAccount = (page) => page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "Wave 2 QA"); localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
const asGuest = (page) => page.addInitScript(() => { try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_name"); localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
const session = async (base, key) => { const c = await pwRequest.newContext({ baseURL: base }); const r = await c.post("/api/preview-access", { form: { key }, maxRedirects: 0 }); const cookie = r.headers()["set-cookie"] || ""; await c.dispose(); return { status: r.status(), cookie, ok: r.status() === 303 && /pv_session=[^;]/.test(cookie) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) }; };

const run = async () => {
  console.log(`\nWAVE 2 DEPLOYED QA — ${BASE}${ALIAS_MODE ? " (stable alias)" : ""}\n\nA. access matrix`);
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const root = await anon.get("/play", { maxRedirects: 0 });
  gate("anonymous /play is refused with the access page (401)", root.status() === 401 && /Private preview/.test(await root.text()));
  const api = await anon.get("/api/health", { maxRedirects: 0 });
  gate("anonymous API is 401 JSON", api.status() === 401);
  const bad = await anon.post("/api/preview-access", { form: { key: "00000000000000000000000000000000" }, maxRedirects: 0 });
  gate("a wrong key is refused and sets no session", bad.status() === 401 && !/pv_session=[^;]/.test(bad.headers()["set-cookie"] || ""));
  const tampered = await anon.get("/play", { headers: { cookie: "pv_session=v3.eyJ2IjozfQ.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, maxRedirects: 0 });
  gate("a tampered / forged session cookie is refused", tampered.status() === 401);
  const v2 = await anon.get("/play", { headers: { cookie: "pv_session=v2.eyJ2IjoyLCJ0ZXN0ZXJJZCI6Im93bmVyIiwicm9sZSI6Im93bmVyIn0.AAAA" }, maxRedirects: 0 });
  gate("a Wave 1-format (v2) session is refused on Wave 2", v2.status() === 401);
  await anon.dispose();
  const ledger = [];
  for (const k of w2) { const s = await session(BASE, k.key); ledger.push({ testerId: k.testerId, role: k.role, cohort: k.cohort, sha256Prefix: sha(k.key), accepted: s.ok }); }
  gate(`the Wave 2 owner key and all five Wave 2 tester keys open HttpOnly Secure sessions`, ledger.every((k) => k.accepted), ledger.map((k) => k.testerId).join(", "));
  const w1OnW2 = []; for (const k of w1) { const s = await session(BASE, k.key); w1OnW2.push({ testerId: k.testerId, status: s.status }); }
  gate(`every Wave 1 key (${w1.length}, owner included) is refused on Wave 2`, w1OnW2.every((r) => r.status === 401), w1OnW2.map((r) => `${r.testerId}:${r.status}`).join(" "));
  const w2OnW1 = []; for (const k of w2) { const s = await session(WAVE1, k.key); w2OnW1.push({ testerId: k.testerId, status: s.status }); }
  gate(`every Wave 2 key (${w2.length}) is refused on the Wave 1 alias`, w2OnW1.every((r) => r.status === 401), w2OnW1.map((r) => `${r.testerId}:${r.status}`).join(" "));
  // A tester session cannot reach the owner-only lab; the owner can.
  const t = await pwRequest.newContext({ baseURL: BASE }); await t.post("/api/preview-access", { form: { key: testers[0].key }, maxRedirects: 0 });
  const tl = await t.get("/dev/basketball-theme-lab", { maxRedirects: 0 }); const tp = await t.get("/play", { maxRedirects: 0 });
  gate("a tester session: 200 at /play, 404 at the owner-only lab (no role escalation)", tp.status() === 200 && tl.status() === 404, `play ${tp.status()} · lab ${tl.status()}`);
  const logout = await t.delete("/api/preview-access"); const after = await t.get("/play", { maxRedirects: 0 });
  gate("logout clears the session (DELETE → 204, then 401)", logout.status() === 204 && after.status() === 401, `${logout.status()} → ${after.status()}`);
  await t.dispose();

  console.log("\nB. the product, as a Wave 2 tester");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: testers[0].key }, maxRedirects: 0 });
  if (auth.status() !== 303) { console.error("could not open a Wave 2 tester session"); process.exit(1); }
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  const local = previewCandidateIdentity();
  gate("the deployment runs Candidate 4 / 1.4.0 with this checkout's core hash and the Wave 2 id", health?.preview?.candidateId === local.candidateId && health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.calibrationVersion === local.possessionCalibrationVersion && health?.preview?.waveId === WAVE2.waveId, `${health?.preview?.candidateId} / ${health?.preview?.calibrationVersion} / ${health?.preview?.waveId}`);
  const html = await (await ctx.request.get(`${BASE}/`)).text(); const stamp = (html.match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null;
  const page = await ctx.newPage(); await withAccount(page);
  const posts = []; page.on("request", (r) => { if (/\/api\/game/.test(r.url()) && r.method() === "POST") posts.push(r.url()); });
  // Play Lobby as a new visitor
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await page.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 }); await page.waitForTimeout(800);
  const lobby = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, cards: document.querySelectorAll(".ec-mode-card").length, first: document.querySelector(".ec-lobby-primary .ec-mode-card")?.dataset.mode, recommended: document.querySelector('.ec-mode-card[data-recommended="true"]')?.dataset.mode, header: getComputedStyle(document.querySelector("header")).backgroundColor, canvas: getComputedStyle(document.querySelector(".ec-lobby-court")).backgroundColor, run: localStorage.getItem("ec_chaos_run"), continueCard: document.querySelectorAll(".ec-continue").length, dreamHref: document.querySelector('.ec-mode-card[data-mode="dream"] .ec-mode-action')?.getAttribute("href"), gauntlet: document.querySelector('.ec-mode-card[data-mode="gauntlet"]')?.dataset.status }));
  gate("Play Lobby: seven modes, Chaos first and recommended, Night Court (obsidian header, ivory canvas), viewing created no run and no POST", lobby.theme === P && lobby.cards === 7 && lobby.first === "chaos" && lobby.recommended === "chaos" && lum(lobby.header) < 0.02 && lum(lobby.canvas) > 0.8 && lobby.run === null && lobby.continueCard === 0 && posts.length === 0, JSON.stringify({ first: lobby.first, posts: posts.length }));
  gate("direct mode links: Dream Matchup links to /play/dream; Era Gauntlet is truthfully Coming soon", /\/play\/dream$/.test(lobby.dreamHref || "") && lobby.gauntlet === "COMING_SOON");
  await page.screenshot({ path: `${SHOTS}/desktop-play-lobby-1536x1024.png` });
  // Refresh and Back keep the lobby
  await page.reload({ waitUntil: "domcontentloaded" }); await page.locator(".ec-lobby").waitFor({ timeout: 30_000 });
  gate("refresh keeps the lobby", await page.locator(".ec-lobby").isVisible());
  // Active run: start, return via the logo, continue the exact run
  await page.locator('.ec-mode-card[data-mode="chaos"] .ec-mode-action').click();
  await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^ROLL 1/ }).click(); await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  const firstName = await page.locator(".ec-ta-roster .ec-pc .ec-pc-name").first().innerText();
  await page.getByRole("button", { name: "EraClash Basketball home" }).click(); await page.locator(".ec-continue").waitFor({ timeout: 30_000 });
  gate("the logo returns to the lobby and the Continue card shows the run (run preserved)", /\/$|\/play$/.test(new URL(page.url()).pathname) && (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId);
  await page.locator(".ec-continue").getByRole("button", { name: /Continue/i }).click(); await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  gate("Continue reopens the exact same run (same first card, same id)", (await page.locator(".ec-ta-roster .ec-pc .ec-pc-name").first().innerText()) === firstName && (await page.evaluate(() => localStorage.getItem("ec_chaos_run"))) === runId);
  await page.getByRole("button", { name: /Reset this Clash/ }).click(); const dlg = page.getByRole("dialog"); await dlg.waitFor({ timeout: 10_000 });
  gate("abandoning asks for confirmation first", await dlg.isVisible());
  await dlg.getByRole("button", { name: "No, keep drafting" }).click();
  await dlg.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(300);
  // Chaos: three rolls, holds, era, coach, Candidate 4 game
  const holds = page.locator(".ec-pc-action"); await holds.nth(0).click(); await page.waitForTimeout(200); await holds.nth(2).click(); await page.waitForTimeout(450);
  gate("multiple holds register", (await page.locator('.ec-pc[data-held="true"]').count()) === 2);
  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click(); await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  const era = (await page.locator(".ec-intel-era-id").innerText()).trim();
  gate("Era Reveal arrives with Roll 2", /^\d{4}s$/.test(era), era);
  await page.screenshot({ path: `${SHOTS}/desktop-roll2-1536x1024.png` });
  await page.getByRole("button", { name: /FINAL ROLL/ }).click(); await page.getByRole("button", { name: /^Select / }).first().waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: /^Select / }).first().click(); await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 }); await page.getByRole("button", { name: /RUN SIM/ }).click();
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).waitFor({ timeout: 120_000 });
  const dock = await page.evaluate(() => ({ open: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(), scores: [...document.querySelectorAll(".ec-dock-score")].map((e) => Number(e.textContent)), candidate: !!document.querySelector(".ec-ta-rail") }));
  gate("a Candidate 4 game completes; the Result Dock leads with the Story and two scores", dock.open === "Game Story" && dock.scores.length === 2 && dock.scores.every((n) => n > 40), JSON.stringify(dock));
  for (const tab of ["Box Score", "Coaching", "Analysis", "Game Story"]) { await page.locator(".ec-ta-rail").getByRole("tab", { name: tab }).click(); await page.waitForTimeout(120); }
  gate("every result tab opens", (await page.locator('[role="tabpanel"]').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/desktop-result-1536x1024.png` });
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click(); const report = page.getByRole("dialog", { name: "Full postgame report" }); await report.waitFor({ timeout: 20_000 });
  const pg = await page.evaluate(() => { const l = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const inset = document.querySelector(".ec-report-overlay .ec-arena-inset"); return { heroDark: l(getComputedStyle(inset).backgroundColor) < 0.05, paperLight: l(getComputedStyle(inset.parentElement).backgroundColor) > 0.8, wave2Panel: document.querySelectorAll('.ec-report-overlay [data-wave2-feedback="true"]').length, wave1Panel: /PREVIEW — rate this result/.test(document.querySelector(".ec-report-overlay").innerText) }; });
  gate("Full Postgame: dark hero over the ivory report; the Wave 2 feedback panel replaces the Wave 1 panel", pg.heroDark && pg.paperLight && pg.wave2Panel === 1 && !pg.wave1Panel, JSON.stringify(pg));
  await report.getByRole("tab", { name: "Box Score" }).click();
  const box = await page.evaluate(() => { const table = document.querySelector(".ec-report-overlay .box-table"); const rows = [...table.querySelectorAll("tbody tr")].map((tr) => Math.round(tr.getBoundingClientRect().height)); return { tables: document.querySelectorAll(".ec-report-overlay table").length, uniform: Math.max(...rows) - Math.min(...rows) <= 2, nowrap: [...table.querySelectorAll("td")].every((td) => getComputedStyle(td).whiteSpace === "nowrap"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  gate("Box Score: one table, uniform rows, nowrap cells, no page overflow", box.tables === 1 && box.uniform && box.nowrap && box.overflow === 0);
  await page.screenshot({ path: `${SHOTS}/desktop-postgame-1536x1024.png` });
  // Wave 2 feedback round trip (task N2, result-bound)
  await report.getByRole("tab", { name: "Final" }).click();
  const panel = report.locator('[data-wave2-feedback="true"]');
  await panel.getByRole("button", { name: /^N2 ·/ }).click();
  const groups = panel.getByRole("group"); const n = await groups.count(); for (let i = 0; i < n; i++) await groups.nth(i).getByRole("button", { name: "5 of 5" }).click();
  await panel.getByRole("button", { name: "No issue" }).click();
  await panel.scrollIntoViewIfNeeded(); await panel.screenshot({ path: `${SHOTS}/desktop-wave2-feedback-panel.png` });
  const [fb] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/feedback") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null), panel.getByRole("button", { name: /Send Wave 2 feedback/ }).click()]);
  const sentBody = fb ? (() => { try { return fb.request().postDataJSON(); } catch { return null; } })() : null;
  gate("Wave 2 feedback (task N2, five ratings) is accepted and confirmed to the tester; the request carries no identity field", fb && fb.status() >= 200 && fb.status() < 300 && await panel.getByText(/Wave 2 feedback recorded/).isVisible() && sentBody && !("testerId" in sentBody) && !("waveId" in sentBody) && /^pv_/.test(sentBody.resultId || ""), `HTTP ${fb?.status()} · fields ${sentBody ? Object.keys(sentBody).join(",") : "?"}`);
  // Resubmission is a revision, not a duplicate (server replaces the primary record).
  const rid = sentBody?.resultId || null;
  const fb2 = await page.evaluate((rid) => fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "wave2", taskId: "N2", resultId: rid, ratings: { draftClarity: 4, eraClarity: 4, coachChoiceClarity: 4, resultClarity: 4, visualComfort: 4 }, issueCategory: "NONE", testerId: "spoof", waveId: "spoof", candidateId: "spoof" }) }).then((r) => r.status), rid);
  gate("a resubmission with spoofed identity fields is accepted as a revision (server identity wins)", fb2 >= 200 && fb2 < 300, `HTTP ${fb2}`);
  const badTask = await page.evaluate(() => fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "wave2", taskId: "X9", ratings: { startingClarity: 5 } }) }).then((r) => r.status));
  gate("an unknown task id is rejected (400)", badTask === 400, `HTTP ${badTask}`);
  // Result reload consistency: sharing stores a snapshot of THIS result (POST /api/result → {id}); two GETs of it are identical and carry both dock scores.
  const shareBtn = report.getByRole("button", { name: /Share/ }).first();
  let shareId = null;
  if (await shareBtn.count()) { const [res] = await Promise.all([page.waitForResponse((r) => /\/api\/result$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null), shareBtn.click()]); shareId = res ? (await res.json().catch(() => ({}))).id ?? null : null; }
  const s1 = shareId ? await (await ctx.request.get(`${BASE}/api/result?id=${shareId}`)).text() : ""; const s2 = shareId ? await (await ctx.request.get(`${BASE}/api/result?id=${shareId}`)).text() : "";
  gate("the stored result reloads consistently: two reads of the shared snapshot are identical and carry both dock scores", !!shareId && s1.length > 50 && s1 === s2 && dock.scores.every((n) => new RegExp(`\\b${n}\\b`).test(s1)), shareId ? `${s1.length} bytes` : "share not offered / no id");
  // Sharing opens the Share modal (the text + Copy + Close); close it, then leave the report.
  const shareModal = page.getByRole("dialog", { name: "Share challenge" });
  if (await shareModal.count()) { await shareModal.getByRole("button", { name: "Close" }).click(); await shareModal.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}); }
  await page.getByRole("button", { name: /Back to the arena/ }).click();
  await report.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  // New Clash from the dock while the result is on screen.
  await page.getByRole("button", { name: "New Chaos Clash" }).click(); await page.getByText("THREE ROLLS AVAILABLE").first().waitFor({ timeout: 20_000 });
  gate("a new Clash starts from the dock and the previous result stays labelled", await page.locator(".ec-ta-rail").getByText("LAST CLASH · NOT THE DRAFT ON SCREEN").first().isVisible());
  // Refresh: the arena comes back coherent (ten cards or ten card backs, no error).
  await page.reload({ waitUntil: "domcontentloaded" }); await page.locator(".ec-ta").waitFor({ timeout: 45_000 }); await page.waitForTimeout(1500);
  const afterReload = await page.evaluate(() => ({ cards: document.querySelectorAll(".ec-ta-roster .ec-pc").length, backs: document.querySelectorAll(".ec-ta-roster .ec-pc-empty").length, alerts: document.querySelectorAll('[role="alert"]').length }));
  gate("after a refresh the arena is coherent: ten cards or ten card backs, no error", afterReload.cards + afterReload.backs === 10 && afterReload.alerts === 0, JSON.stringify(afterReload));
  // Dream Matchup placement
  await page.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: /Add a player to Team Gold/ }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click(); await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Durant"); await page.locator('button[data-player="durant-10s"]').click();
  const grid = page.locator('.roster-grid[aria-label="Team Gold lineup"]');
  const states = await grid.locator("[data-slot]").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.slot, e.dataset.placeState])));
  gate("multi-position selection lights SG · SF · PF only", states.SG === "ELIGIBLE" && states.SF === "ELIGIBLE" && states.PF === "ELIGIBLE" && states.PG === "INELIGIBLE" && states.C === "INELIGIBLE", JSON.stringify(states));
  await page.screenshot({ path: `${SHOTS}/desktop-dream-placement-1536x1024.png` });
  await page.getByRole("button", { name: "Place Kevin Durant at Power Forward" }).click(); gate("manual placement lands", /Durant/.test(await grid.locator('[data-slot="PF"]').innerText()));
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click(); await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Chamberlain"); await page.locator('button[data-player="wilt-60s"]').click(); await page.waitForTimeout(300);
  gate("a one-position player is placed automatically", /Chamberlain/.test(await grid.locator('[data-slot="C"]').innerText()));
  await page.getByRole("button", { name: "Undo the last placement" }).click(); gate("Undo restores the five", !/Chamberlain/.test(await grid.locator('[data-slot="C"]').innerText()));
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click(); await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Pettit"); await page.locator('button[data-player="bob-60s"]').click();
  gate("an occupied eligible slot is offered as a swap", (await grid.locator('[data-slot="PF"]').getAttribute("data-place-state")) === "OCCUPIED");
  await grid.getByRole("button", { name: "Swap Kevin Durant for Bob Pettit at Power Forward" }).click(); gate("the swap is explicit and legal", /Pettit/.test(await grid.locator('[data-slot="PF"]').innerText()));
  await page.getByRole("button", { name: /Add a player to Team Gold/ }).click(); await page.getByRole("dialog", { name: "Choose a player" }).getByLabel("Search players").fill("Pettit");
  // The picker either withholds a person already on the floor or offers them disabled — either way the same person cannot be added twice.
  const dupBtn = page.locator('button[data-player="bob-60s"]');
  const dupState = (await dupBtn.count()) === 0 ? "withheld from the picker" : (await dupBtn.evaluate((b) => b.disabled || b.getAttribute("aria-disabled") === "true" || /already|on the team|placed/i.test(b.textContent + (b.getAttribute("aria-label") || "")))) ? "offered disabled" : "OFFERED AGAIN";
  gate("the same person cannot be added twice (duplicate-person refusal)", dupState !== "OFFERED AGAIN", dupState);
  await page.keyboard.press("Escape").catch(() => {});
  // Account gate as a guest
  const g = await browser.newContext({ viewport: { width: 1536, height: 1024 } }); await g.request.post(`${BASE}/api/preview-access`, { form: { key: testers[1].key }, maxRedirects: 0 });
  const gp = await g.newPage(); await asGuest(gp); await gp.goto(`${BASE}/play/dream`, { waitUntil: "domcontentloaded" }); await gp.getByText("FREE ACCOUNT REQUIRED").waitFor({ timeout: 30_000 });
  gate("a guest at an account-required mode sees the gate with a way back", await gp.getByRole("button", { name: "BACK TO THE LOBBY" }).isVisible());
  await g.close();
  // Theme fixture: portraits (owner only)
  const o = await browser.newContext({ viewport: { width: 1536, height: 1024 } }); await o.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  const op = await o.newPage(); await withAccount(op); await op.goto(`${BASE}/dev/basketball-theme-lab?theme=${P}&fixture=portraits&chrome=0`, { waitUntil: "domcontentloaded" }); await op.locator("[data-portrait-test]").first().waitFor({ timeout: 45_000 });
  gate("the owner reaches the lab; dark and light uniforms and the silhouette ride the portrait stage", (await op.locator("[data-uniform]").count()) === 10 && (await op.locator(".ec-pc-portrait .ec-portrait-stage").count()) === 10);
  await op.screenshot({ path: `${SHOTS}/desktop-portrait-stage-1536x1024.png` });
  await o.close(); await ctx.close();

  console.log("\nC. tablet and mobile");
  for (const [w, h, name] of [[768, 1024, "tablet"], [390, 844, "mobile"]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 800 });
    await c.request.post(`${BASE}/api/preview-access`, { form: { key: testers[2].key }, maxRedirects: 0 });
    const p = await c.newPage(); await withAccount(p);
    await p.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" }); await p.locator(".ec-lobby .ec-mode-card").first().waitFor({ timeout: 45_000 });
    const lb = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cols: new Set([...document.querySelectorAll(".ec-lobby-primary .ec-mode-card")].map((c) => Math.round(c.getBoundingClientRect().x))).size, tap: Math.min(...[...document.querySelectorAll(".ec-mode-action, .ec-brand-header button")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))) }));
    gate(`${name} lobby: ${w <= 640 ? "one column" : "two columns"}, no overflow, controls ≥ 44px`, lb.overflow === 0 && lb.cols === (w <= 640 ? 1 : 2) && lb.tap >= 44, JSON.stringify(lb));
    await p.screenshot({ path: `${SHOTS}/${name}-play-lobby-${w}x${h}.png` });
    await p.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await p.locator(".ec-ta").waitFor({ timeout: 45_000 }); await p.getByRole("button", { name: /^ROLL 1/ }).click(); await p.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
    const ar = await p.evaluate(() => { const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc")]; return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().y))).size, tap: Math.min(...[...document.querySelectorAll(".ec-pc-action, .ec-ta-cta")].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))) }; });
    gate(`${name} Time Arena: no overflow, no ten-card compression, controls ≥ 44px`, ar.overflow === 0 && ar.rows >= 2 && ar.tap >= 44, JSON.stringify(ar));
    await p.screenshot({ path: `${SHOTS}/${name}-time-arena-${w}x${h}.png` });
    await c.close();
  }
  await browser.close();

  console.log("\nD. Wave 1 untouched");
  const w1ctx = await pwRequest.newContext({ baseURL: WAVE1 });
  const w1s = await w1ctx.post("/api/preview-access", { form: { key: w1.find((k) => k.role === "owner").key }, maxRedirects: 0 });
  const w1html = w1s.status() === 303 ? await (await w1ctx.get("/")).text() : ""; const w1stamp = (w1html.match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null;
  const w1health = w1s.status() === 303 ? await (await w1ctx.get("/api/health")).json() : null;
  const wave1Unchanged = w1s.status() === 303 && w1stamp === "eraclash-assets:2.7.2:2f35a3b70c30" && w1health?.preview?.candidateId === "Candidate 3" && !/ec-lobby|night-court/.test(w1html);
  gate("the Wave 1 alias still serves its original build (stamp 2f35a3b70c30, Candidate 3), the Wave 1 owner key still opens it, no lobby, no Night Court", wave1Unchanged, `${w1stamp} · ${w1health?.preview?.candidateId}`);
  await w1ctx.dispose();

  const out = { artifact: ALIAS_MODE ? "wave2-stable-alias-qa" : "wave2-branch-preview-qa", phase: "9A.3 — Wave 2 private beta", deployment: { baseUrl: BASE, aliasUrl: ALIAS_MODE ? BASE : null, commit: process.env.PHASE9A3_COMMIT || null, buildStamp: stamp, waveId: health?.preview?.waveId ?? null }, candidateUnderTest: { deployed: health?.preview || null, local }, wave2Keys: ledger, wave1KeysOnWave2: w1OnW2, wave2KeysOnWave1: w2OnW1, wave1Unchanged, wave1Stamp: w1stamp, feedbackResultId: rid ? "pv_… (present)" : null, gates, passed: gates.length - failed, failed };
  writeFileSync(`${OUT}/${out.artifact}.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${gates.length - failed}/${gates.length} deployed gates passed`);
  process.exit(failed ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
