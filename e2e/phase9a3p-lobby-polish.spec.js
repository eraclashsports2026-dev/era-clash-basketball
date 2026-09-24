// ── Phase 9A.3P: the polished Play Lobby against the real handlers ───────────
// The adaptive hero from REAL state (a run started through the arena, a career
// written by a finished game), the CTA hierarchy and action labels as rendered,
// the Continue card above the grid, and that the logo still returns to the lobby
// without touching the run. Runs on the Candidate preview harness (4175).
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ART = "data/validation/9a3p";
const artifact = (name, body) => { mkdirSync(ART, { recursive: true }); writeFileSync(`${ART}/${name}`, JSON.stringify(body, null, 2) + "\n"); };

const LABELS = { chaos: "START CHAOS CLASH", dream: "BUILD MATCHUP", daily: "PLAY TODAY’S CLASH", bo7: "START SERIES", win82: "START SEASON", tournament: "ENTER TOURNAMENT", gauntlet: "LEARN MORE" };

const firstTime = (page) => page.addInitScript(() => {
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
});
const withAccount = (page) => page.addInitScript(() => {
  try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E"); if (!sessionStorage.getItem("e2e_keep_run")) { localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); } } catch (e) {}
});
const rendered = (page) => page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => {
  const a = e.querySelector(".ec-mode-action"); const cs = getComputedStyle(a);
  return { id: e.dataset.mode, hierarchy: a.dataset.hierarchy, label: a.textContent.trim(), shown: cs.textTransform === "uppercase" ? a.textContent.trim().toUpperCase() : a.textContent.trim(), name: a.getAttribute("aria-label"), bg: cs.backgroundImage !== "none" ? cs.backgroundImage : cs.backgroundColor, border: cs.borderStyle, tag: a.tagName, href: a.getAttribute("href"), signature: e.querySelector(".ec-mode-signature")?.dataset.signature || null, sigHidden: e.querySelector(".ec-mode-signature")?.getAttribute("aria-hidden") };
}));
const gamePosts = (page) => { const posts = []; page.on("request", (r) => { if (r.url().includes("/api/game") && r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}").chaosAction || "(sim)"); } catch { posts.push("?"); } } }); return posts; };

test("a first-time visitor gets the full hero; every action label and hierarchy is the registry's; viewing starts nothing", async ({ page }) => {
  await firstTime(page);
  const posts = gamePosts(page);
  await page.goto("/play");
  const lobby = page.locator(".ec-lobby");
  await expect(lobby).toHaveAttribute("data-hero", "full");
  await expect(lobby).toHaveAttribute("data-presentation", "play-lobby-polish-v1");
  await expect(page.locator(".ec-lobby-hero--compact")).toHaveCount(0);
  await expect(page.locator(".ec-continue")).toHaveCount(0);
  const cards = await rendered(page);
  for (const c of cards) expect(c.shown, c.id).toBe(LABELS[c.id]);
  expect(cards.filter((c) => c.hierarchy === "primary").map((c) => c.id)).toEqual(["chaos"]);
  expect(cards.filter((c) => c.hierarchy === "unavailable").map((c) => c.id)).toEqual(["gauntlet"]);
  expect(cards.filter((c) => c.hierarchy === "secondary").map((c) => c.id)).toEqual(["dream", "daily", "bo7", "win82", "tournament"]);
  expect(cards.find((c) => c.id === "chaos").bg).toMatch(/gradient/);
  for (const c of cards.filter((c) => c.hierarchy === "secondary")) { expect(c.bg, c.id).not.toMatch(/gradient/); expect(c.border, c.id).toBe("solid"); }
  expect(cards.find((c) => c.id === "gauntlet").border).toBe("dashed");
  expect(cards.find((c) => c.id === "chaos").name).toBe("Start Chaos Clash, recommended mode");
  expect(cards.find((c) => c.id === "dream").name).toBe("Build Dream Matchup, free account required");
  expect(cards.find((c) => c.id === "gauntlet").name).toBe("Learn more about Era Gauntlet, coming soon");
  expect(cards.every((c) => c.signature && c.sigHidden === "true")).toBe(true);
  expect(new Set(cards.map((c) => c.signature)).size).toBe(7);
  // The header carries one image — the Mk1 mark — and no league mark anywhere in the shell or the lobby.
  const marks = await page.evaluate(() => ({
    headerImgs: [...document.querySelectorAll(".ec-brand-header img")].map((i) => i.getAttribute("src")),
    anyNba: [...document.querySelectorAll("header *, .ec-lobby *")].some((e) => /nba/i.test(`${e.getAttribute("src") || ""} ${e.getAttribute("alt") || ""} ${e.getAttribute("aria-label") || ""} ${e.className || ""} ${getComputedStyle(e).backgroundImage}`)),
  }));
  expect(marks.headerImgs).toEqual(["/brand/eraclash-logo-mk1.png"]);
  expect(marks.anyNba).toBe(false);
  expect(posts).toEqual([]);
  artifact("lobby-polish-runtime.json", { artifact: "lobby-polish-runtime", phase: "9A.3P", hero: "full", cards, marks, gamePosts: posts });
});

test("a device that has played gets the compact hero; the grid moves up; nothing else changes", async ({ page }) => {
  await firstTime(page);
  await page.addInitScript(() => { try { localStorage.setItem("ec_career", JSON.stringify({ gamesPlayed: 2, wins: 1, losses: 1 })); } catch (e) {} });
  await page.goto("/play");
  await expect(page.locator(".ec-lobby")).toHaveAttribute("data-hero", "compact-returning");
  await expect(page.locator(".ec-lobby-hero--compact")).toHaveCount(1);
  await expect(page.locator(".ec-lobby-line")).toContainText("Welcome back");
  const m = await page.evaluate(() => ({ heroH: document.querySelector(".ec-lobby-hero").getBoundingClientRect().height, gridTop: document.querySelector(".ec-lobby-primary").getBoundingClientRect().top, cards: document.querySelectorAll(".ec-mode-card").length, logoW: document.querySelector(".ec-lobby-logo").getBoundingClientRect().width }));
  expect(m.cards).toBe(7); expect(m.heroH).toBeLessThan(90); expect(m.logoW).toBeLessThan(200);
  // The same seven labels, the same one primary.
  const cards = await rendered(page);
  for (const c of cards) expect(c.shown, c.id).toBe(LABELS[c.id]);
  expect(cards.filter((c) => c.hierarchy === "primary").map((c) => c.id)).toEqual(["chaos"]);
  artifact("lobby-polish-returning-runtime.json", { artifact: "lobby-polish-returning-runtime", phase: "9A.3P", hero: "compact-returning", ...m });
});

test("an active run: compact hero, Continue above the grid, no shift when the run resolves, the logo keeps the run", async ({ page }) => {
  test.slow();
  await withAccount(page);
  const posts = gamePosts(page);
  await page.goto("/play/chaos");
  await page.getByRole("button", { name: /^ROLL$/ }).click();   // 9B.3: the empty frame offers ROLL
  await expect(page.locator('.ec-ta-stage[data-guided-state="DRAFTING"]')).toBeVisible({ timeout: 20_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  expect(runId).toBeTruthy();
  await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  // Measure the hero and grid at FIRST paint, then after the run lookup has resolved.
  await page.goto("/play");
  const before = await page.evaluate(() => ({ hero: document.querySelector(".ec-lobby").dataset.hero, heroH: document.querySelector(".ec-lobby-hero").getBoundingClientRect().height, compact: !!document.querySelector(".ec-lobby-hero--compact") }));
  expect(before.hero).toBe("compact-active-run"); expect(before.compact).toBe(true);
  const card = page.locator(".ec-continue");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const after = await page.evaluate(() => ({ heroH: document.querySelector(".ec-lobby-hero").getBoundingClientRect().height, continueTop: document.querySelector(".ec-continue").getBoundingClientRect().top, gridTop: document.querySelector(".ec-lobby-primary").getBoundingClientRect().top }));
  expect(after.heroH).toBe(before.heroH); // the hero never moves when the run resolves
  expect(after.continueTop).toBeLessThan(after.gridTop); // Continue is the top action
  await expect(card).toContainText("CONTINUE YOUR CHAOS CLASH");
  await expect(card).toContainText(/era not yet revealed/);
  await expect(card.getByText(/^\d{4}s$/)).toHaveCount(0);
  await expect(page.locator(".ec-lobby-line")).toContainText("Your Chaos Clash is waiting");
  // Only a READ of the run happened while the lobby was open.
  expect(posts.filter((a) => a === "start")).toHaveLength(1);
  expect(posts.filter((a) => a === "view").length).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  // The header logo goes to the lobby and the run survives.
  await page.getByRole("link", { name: /Start Chaos Clash/ }).click();
  await expect(page).toHaveURL(/\/play\/chaos$/);
  await page.getByRole("button", { name: "EraClash Basketball home" }).click();
  await expect(page.locator(".ec-continue")).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem("ec_chaos_run"))).toBe(runId);
  artifact("lobby-polish-active-run-runtime.json", { artifact: "lobby-polish-active-run-runtime", phase: "9A.3P", hero: before.hero, heroHeightFirstPaint: before.heroH, heroHeightAfterResolve: after.heroH, continueAboveGrid: after.continueTop < after.gridTop, gamePosts: posts, runPreserved: true });
});

test("the Play dropdown and the lobby still agree card by card, and the gated card still gates", async ({ page }) => {
  await withAccount(page);
  await page.addInitScript(() => { try { localStorage.removeItem("ec_account"); } catch (e) {} });
  await page.goto("/play");
  const lobby = await page.locator(".ec-mode-card").evaluateAll((els) => els.map((e) => ({ title: e.querySelector(".ec-mode-title").textContent.trim(), badge: e.querySelector(".ec-mode-badge")?.textContent.trim() || null })));
  await page.getByRole("button", { name: /^Play/ }).click();
  const menu = await page.getByRole("menuitem").evaluateAll((els) => els.filter((e) => !/How modes work/.test(e.textContent)).map((e) => ({ title: e.querySelector("span span").textContent.trim(), badge: e.querySelector("span + span + span")?.textContent.trim() || null })));
  expect(menu.map((m) => m.title)).toEqual(lobby.map((l) => l.title));
  for (let i = 0; i < lobby.length; i++) expect(menu[i].badge, lobby[i].title).toBe(lobby[i].badge);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Build Dream Matchup, free account required/ }).click();
  await expect(page).toHaveURL(/\/play\/dream$/);
  await expect(page.getByRole("heading", { name: "Dream Matchup" })).toBeVisible();
  await expect(page.locator("#ec-acct-name")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: /Learn more about Era Gauntlet, coming soon/ }).click();
  await expect(page).toHaveURL(/\/modes\/era-gauntlet$/);
});
