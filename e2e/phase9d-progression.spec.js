// ── Phase 9D: Progression, XP and Achievements V1 ─────────────────────────────
// Driven on the harness with the fake cloud (ECLASH_FAKE_CLOUD=1). The browser
// is a guest — a local build has no account provider — so the signed-in path is
// exercised the way the server sees it: the result this browser produced is
// saved with a test bearer, the save answers with the progression it earned,
// a second save earns nothing, and the account reads its own progression.
// The guest surface is asserted in the page: the one-line career note appears
// after the score and the winner, and no XP is shown to a guest.
import { test, expect } from "@playwright/test";

const JOSEPH = "11111111-1111-4111-8111-111111111111", BEA = "22222222-2222-4222-8222-222222222222";
const auth = (u) => ({ Authorization: `Bearer test-token.${u}` });
const stage = (page, st) => page.locator(`.ec-ta-stage[data-guided-state="${st}"]`);
const fresh = async (page) => {
  await page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); localStorage.removeItem("ec_progression_last"); } catch (e) {} });
};
const playThrough = async (page) => {
  await expect(stage(page, "EMPTY")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^ROLL 2$/ }).click();
  await expect(stage(page, "ERA_REVEAL")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await expect(page.locator(".ec-coach-action:not([disabled])").nth(2)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  await page.getByRole("button", { name: /RUN CLASH/ }).click();
  await expect(page.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 90_000 });
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem("ec_prior_result") || "null")?.result?.resultId || null; } catch { return null; } });
};
const post = (ctx, body, headers = {}) => ctx.request.post("/api/profile", { data: body, headers: { "content-type": "application/json", ...headers } });

test.describe.configure({ mode: "serial" });

test("a saved Clash earns its XP once; the guest sees the career note after the score; the account reads its own progression", async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext();
  const page = await ctx.newPage(); await fresh(page);
  await page.goto("/play/chaos");
  const resultId = await playThrough(page);
  expect(resultId).toBeTruthy();

  // ── the guest surface: after the score and the winner, one line, no XP, no modal
  const note = page.locator('.ec-prog[data-state="guest"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText(/Sign in to preserve your career/);
  await expect(page.locator('.ec-prog[data-state="earned"]')).toHaveCount(0);
  const order = await page.evaluate(() => { const s = document.querySelector(".ec-ta-score[data-winner]"), m = document.querySelector(".ec-prog"); return s.getBoundingClientRect().top < m.getBoundingClientRect().top; });
  expect(order).toBe(true);
  expect(await page.locator('[role="dialog"]').count()).toBe(0);

  // ── the server: a signed-in save earns once, in the save response
  expect((await post(ctx, { action: "progression-get" })).status()).toBe(401);
  const before = await (await post(ctx, { action: "progression-get" }, auth(JOSEPH))).json();
  const beaBefore = await (await post(ctx, { action: "progression-get" }, auth(BEA))).json();
  const first = await (await post(ctx, { action: "cloud-save", resultId }, auth(JOSEPH))).json();
  expect(first.status).toBe("saved");
  expect(first.progression.status).toBe("ok");
  expect(first.progression.awarded.map((a) => a.category)).toContain("clash:completion");
  expect(first.progression.xpDelta).toBeGreaterThanOrEqual(100);
  if (before.facts.clashes === 0) expect(first.progression.unlocked.map((u) => u.id)).toContain("first_clash");
  expect(first.progression.after.level).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(first.progression)).not.toMatch(/user_id|1111-4111|result_id/);

  // refresh / retry / re-save: nothing twice
  const again = await (await post(ctx, { action: "cloud-save", resultId }, auth(JOSEPH))).json();
  expect(again.status).toBe("already_saved");
  expect(again.progression.xpDelta).toBe(0);
  const state = await (await post(ctx, { action: "progression-get" }, auth(JOSEPH))).json();
  expect(state.status).toBe("ok");
  expect(state.profile.totalXp).toBe(first.progression.after.totalXp);
  expect(state.profile.totalXp).toBe(before.profile.totalXp + first.progression.xpDelta);
  expect(state.facts.clashes).toBe(before.facts.clashes + 1);
  // the Era bonus exactly when this was the account's first Clash in that Era
  expect(first.progression.awarded.map((a) => a.category).includes("era:first_completion")).toBe(state.facts.erasCompleted.length === before.facts.erasCompleted.length + 1);
  expect(state.achievements.length).toBeGreaterThanOrEqual(20);
  expect(state.achievements.find((a) => a.id === "first_clash").unlocked).toBe(true);
  expect(state.achievements.find((a) => a.id === "ten_clashes")).toMatchObject({ current: Math.min(10, before.facts.clashes + 1), target: 10 });
  expect(state.recent.filter((r) => r.category === "clash:completion").length).toBeGreaterThanOrEqual(1);
  expect(state.repaired).toEqual({ awards: 0, unlocks: 0 });

  // ── another account sees none of it, and cannot earn from this device's result
  const bea = await (await post(ctx, { action: "progression-get" }, auth(BEA))).json();
  expect(bea.status).toBe("ok"); expect(bea.facts.clashes).toBe(beaBefore.facts.clashes); expect(bea.profile.totalXp).toBe(beaBefore.profile.totalXp);
  const forged = await (await post(ctx, { action: "progression-reconcile", xpDelta: 9999, level: 50, userId: JOSEPH }, auth(BEA))).json();
  expect(forged.profile.totalXp).toBe(beaBefore.profile.totalXp); expect(forged.profile.level).toBe(beaBefore.profile.level);
  expect((await post(ctx, { action: "progression-get" }, { Authorization: "Bearer test-token.forged" })).status()).toBe(401);
  await ctx.close();
});

test("Run It Back is a new authoritative game: it may earn again; the original never does", async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext();
  const page = await ctx.newPage(); await fresh(page);
  await page.goto("/play/chaos");
  const firstResult = await playThrough(page);
  const a = await (await post(ctx, { action: "cloud-save", resultId: firstResult }, auth(BEA))).json();
  expect(a.status).toBe("saved");
  await page.getByRole("button", { name: /Run it back/i }).first().click();
  await expect(page.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction((prev) => { try { return JSON.parse(localStorage.getItem("ec_prior_result") || "null")?.result?.resultId !== prev; } catch { return false; } }, firstResult, { timeout: 60_000 });
  const secondResult = await page.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
  expect(secondResult).not.toBe(firstResult);
  const b = await (await post(ctx, { action: "cloud-save", resultId: secondResult }, auth(BEA))).json();
  expect(b.status).toBe("saved");
  expect(b.progression.awarded.map((x) => x.category)).toContain("clash:completion");
  const again = await (await post(ctx, { action: "cloud-save", resultId: firstResult }, auth(BEA))).json();
  expect(again.status).toBe("already_saved"); expect(again.progression.xpDelta).toBe(0);
  const state = await (await post(ctx, { action: "progression-get" }, auth(BEA))).json();
  expect(state.recent.filter((r) => r.category === "clash:completion").length).toBeGreaterThanOrEqual(2);
  await ctx.close();
});
