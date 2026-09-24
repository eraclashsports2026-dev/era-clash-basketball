// ── Phase 9E: Competitive Rating + Leaderboards V1 ────────────────────────────
// Driven on the harness with the fake cloud. The browser is a guest (a local
// build has no account provider), so the rated match is exercised the way the
// server sees it: Joseph creates a challenge from a played run, Bea accepts by
// API and plays it in her browser, and the completion answers with the rating
// movement for the account that asks. The leaderboard page is asserted signed
// out (the public surface) — the honest cold-start state, no private account.
import { test, expect } from "@playwright/test";

const JOSEPH = "11111111-1111-4111-8111-111111111111", BEA = "22222222-2222-4222-8222-222222222222";
const auth = (u) => ({ Authorization: `Bearer test-token.${u}` });
const stage = (page, st) => page.locator(`.ec-ta-stage[data-guided-state="${st}"]`);
const fresh = async (page) => {
  await page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); localStorage.removeItem("ec_progression_last"); } catch (e) {} });
};
const post = (ctx, body, headers = {}) => ctx.request.post("/api/profile", { data: body, headers: { "content-type": "application/json", ...headers } });
const playFromDrafting = async (page) => {
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
};

test.describe.configure({ mode: "serial" });

test("the leaderboard is readable signed out and never shows a private or provisional account", async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await fresh(page);
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: /Challenge Rating/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ec-cr-board[data-state="ok"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Sign in to see your own rating/)).toBeVisible();
  const rows = await page.locator(".ec-cr-table tbody tr").count();
  if (rows === 0) await expect(page.getByText(/THE FIRST RANKINGS ARE FORMING/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const board = await (await post(ctx, { action: "competitive-leaderboard" })).json();
  expect(board.status).toBe("ok");
  for (const r of board.rows) { expect(Object.keys(r).sort()).toEqual(["displayName", "initials", "level", "losses", "matches", "rank", "rating", "streak", "ties", "winPct", "wins"]); expect(r.matches).toBeGreaterThanOrEqual(5); }
  expect((await post(ctx, { action: "competitive-me" })).status()).toBe(401);
  expect((await post(ctx, { action: "competitive-around-me" })).status()).toBe(401);
  // the header entry lands on the same route
  await page.goto("/play");
  await page.getByRole("button", { name: /^Leaderboard$/ }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.getByRole("heading", { name: /Challenge Rating/ })).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test("an account-vs-account challenge is rated once, from the comparison, and answers each side's movement; a guest completion is unrated", async ({ browser }) => {
  test.slow();
  const joe = await browser.newContext(); const a = await joe.newPage(); await fresh(a);
  const meBefore = await (await post(joe, { action: "competitive-me" }, auth(JOSEPH))).json();
  const beaBefore = await (await post(joe, { action: "competitive-me" }, auth(BEA))).json();
  await a.goto("/play/chaos");
  await expect(stage(a, "EMPTY")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(a.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  const creatorRun = await a.evaluate(() => localStorage.getItem("ec_chaos_run"));
  await playFromDrafting(a);
  const resultId = await a.evaluate(() => JSON.parse(localStorage.getItem("ec_prior_result")).result.resultId);
  await post(joe, { action: "cloud-save", resultId }, auth(JOSEPH));
  const created = await (await post(joe, { action: "challenge-create", chaosRunId: creatorRun }, auth(JOSEPH))).json();
  expect(created.status).toBe("created");

  // Bea accepts as an account and plays the same opening in her browser
  const bea = await browser.newContext(); const b = await bea.newPage(); await fresh(b); await b.goto("/");
  const acc = await (await post(bea, { action: "challenge-accept", code: created.code, tier: "FREE" }, auth(BEA))).json();
  expect(acc.status).toBe("started");
  await b.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Joseph", at: Date.now() })); }, [acc.chaosRunId, created.code]);
  await b.goto("/play/chaos");
  await expect(stage(b, "DRAFTING")).toBeVisible({ timeout: 30_000 });
  await playFromDrafting(b);
  await expect(b.locator(".ec-chal-cmp[data-outcome]")).toBeVisible({ timeout: 30_000 });
  const outcome = await b.locator(".ec-chal-cmp").getAttribute("data-outcome");
  // the guest browser completed the attempt: rated for the accounts, but no movement of the guest's is shown
  await expect(b.locator(".ec-cr-change")).toHaveCount(0);

  // the recipient account asks: RATED, her side and Joseph's
  const done = await (await post(bea, { action: "challenge-complete", chaosRunId: acc.chaosRunId }, auth(BEA))).json();
  expect(["completed", "already_completed"]).toContain(done.status);
  expect(done.rating.rated).toBe(true);
  expect(done.rating.perspective).toBe("recipient");
  expect(done.rating.them.name).toBe("Joseph");
  if (outcome === "recipient") { expect(done.rating.you.delta).toBeGreaterThan(0); expect(done.rating.them.delta).toBeLessThan(0); }
  if (outcome === "creator") { expect(done.rating.you.delta).toBeLessThan(0); expect(done.rating.them.delta).toBeGreaterThan(0); }
  expect(done.rating.you.after).toBe(done.rating.you.before + done.rating.you.delta);
  expect(JSON.stringify(done.rating)).not.toMatch(/1111-4111|2222-4222|user_id/);
  // refresh: the same movement, not a second one
  const again = await (await post(bea, { action: "challenge-complete", chaosRunId: acc.chaosRunId }, auth(BEA))).json();
  expect(again.rating.you.delta).toBe(done.rating.you.delta);
  const meAfter = await (await post(joe, { action: "competitive-me" }, auth(JOSEPH))).json();
  const beaAfter = await (await post(joe, { action: "competitive-me" }, auth(BEA))).json();
  expect(meAfter.record.matches).toBe(meBefore.record.matches + 1);
  expect(beaAfter.record.matches).toBe(beaBefore.record.matches + 1);
  expect(meAfter.rating).toBe(meBefore.rating + done.rating.them.delta);
  expect(beaAfter.rating).toBe(beaBefore.rating + done.rating.you.delta);
  expect(beaAfter.history[0]).toMatchObject({ opponent: "Joseph", delta: done.rating.you.delta });
  // XP stays separate: the completion also carried career XP for the account, in its own block
  expect(done.progression?.status).toBe("ok");
  await joe.close(); await bea.close();
});
