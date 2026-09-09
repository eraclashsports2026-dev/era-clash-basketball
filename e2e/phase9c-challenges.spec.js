// ── Phase 9C: Challenges + Persistent Competitive Identity V1 ─────────────────
// Driven on the harness with the fake cloud (ECLASH_FAKE_CLOUD=1): a creator's
// finished Chaos Clash becomes a challenge, a guest opens the link, accepts,
// plays the SAME opening under the guided flow with a CHALLENGE badge, and the
// result compares the two under the contract. The creator's identity is a test
// bearer the fake provider recognises; the recipient is a plain guest browser.
import { test, expect } from "@playwright/test";

const JOSEPH = "11111111-1111-4111-8111-111111111111";
const auth = { Authorization: `Bearer test-token.${JOSEPH}` };
const stage = (page, st) => page.locator(`.ec-ta-stage[data-guided-state="${st}"]`);
// A clean browser ONCE per context: a reload inside the flow must keep the run
// it is meant to resume, so the wipe is guarded by a session flag.
const fresh = async (page) => {
  await page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_chaos_era_ack"); localStorage.removeItem("ec_prior_result"); } catch (e) {} });
};
/** A whole Chaos Clash, from the empty frame to the score, on the guided flow. */
const playThrough = async (page, { hold = true } = {}) => {
  await expect(stage(page, "EMPTY")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  if (hold) { await page.locator('.ec-ta-team[data-team="gold"] .ec-pc-action:not([disabled])').first().click(); await expect(page.locator('.ec-pc[data-held="true"]').first()).toBeVisible(); }
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
const runIdOf = (page) => page.evaluate(() => localStorage.getItem("ec_chaos_run"));
const post = (ctx, body, headers = {}) => ctx.request.post("/api/profile", { data: body, headers: { "content-type": "application/json", ...headers } });

test.describe.configure({ mode: "serial" });

test("a finished Clash becomes a challenge; the link opens an honest invitation; a guest accepts, plays the same opening and is compared", async ({ browser }) => {
  test.slow();
  // ── the creator ────────────────────────────────────────────────────────────
  const creator = await browser.newContext();
  const a = await creator.newPage(); await fresh(a);
  await a.goto("/play/chaos");
  // the run id must be read BEFORE the result lands: a finished run leaves ec_chaos_run
  await expect(stage(a, "EMPTY")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(a.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  const creatorRun = await runIdOf(a);
  await a.getByRole("button", { name: /^ROLL 2$/ }).click();
  await expect(stage(a, "ERA_REVEAL")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await a.getByRole("button", { name: /FINAL ROLL/ }).click();
  await expect(a.locator(".ec-coach-action:not([disabled])").nth(2)).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /^Select / }).first().click();
  await a.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  // no challenge control competes with RUN CLASH any more
  await expect(a.locator(".ec-ta-stage-actions").getByRole("button", { name: /CHALLENGE/ })).toHaveCount(0);
  await a.getByRole("button", { name: /RUN CLASH/ }).click();
  await expect(a.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 90_000 });
  const creatorScore = await a.locator(".ec-ta-score-n").allInnerTexts();

  // as a guest browser the result offers CHALLENGE THIS CHAOS but asks for an account
  const shareBtn = a.getByRole("button", { name: /CHALLENGE THIS CHAOS/ });
  await expect(shareBtn).toBeVisible();
  await expect(a.getByText(/Sign in to challenge a friend/)).toBeVisible();

  // a guest cannot create (401); a signed-in creator can — from THIS browser's run
  expect((await post(creator, { action: "challenge-create", chaosRunId: creatorRun })).status()).toBe(401);
  expect((await post(creator, { action: "challenge-create", chaosRunId: creatorRun }, { Authorization: "Bearer test-token.not-a-uuid" })).status()).toBe(401);
  const created = await (await post(creator, { action: "challenge-create", chaosRunId: creatorRun }, auth)).json();
  expect(created.status).toBe("created");
  expect(created.code).toMatch(/^EC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  for (const k of ["seed", "seedId", "manifest", "result_id", "user_id", "creator_user_id"]) expect(JSON.stringify(created)).not.toContain(k);
  const again = await (await post(creator, { action: "challenge-create", chaosRunId: creatorRun }, auth)).json();
  expect(again.status).toBe("already_created"); expect(again.code).toBe(created.code);
  const code = created.code;

  // ── the invitation, as a fresh guest ───────────────────────────────────────
  const guest = await browser.newContext();
  const b = await guest.newPage(); await fresh(b);
  await b.goto("/?challenge=EC-ZZZZ-ZZZZ");
  await expect(b.getByRole("heading", { name: /not available/i })).toBeVisible({ timeout: 20_000 });
  await b.goto(`/?challenge=${code.toLowerCase()}`);    // case-insensitive
  await expect(b.getByRole("heading", { name: /Joseph challenged you/ })).toBeVisible({ timeout: 20_000 });
  await expect(b.getByText(`${creatorScore[0]}–${creatorScore[1]}`)).toBeVisible();
  await expect(b.getByText(/^ERA$/)).toBeVisible();
  const inviteText = await b.locator("main").innerText();
  expect(inviteText).toMatch(/spends one of your free Chaos runs/);
  expect(inviteText).not.toMatch(/PG|SG|SF|PF|OVR|COACH /);     // no five, no coach before play
  const accept = b.getByRole("button", { name: /ACCEPT CHALLENGE/ });
  expect((await accept.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await accept.click();

  // ── the same opening, under the guided flow, badged ────────────────────────
  await expect(b).toHaveURL(/\/play\/chaos$/, { timeout: 20_000 });
  await expect(stage(b, "DRAFTING")).toBeVisible({ timeout: 30_000 });
  await expect(b.locator(".ec-ta-chal-chip")).toContainText(/CHALLENGE · FROM JOSEPH/);
  const recipientRun = await runIdOf(b);
  expect(recipientRun).toBeTruthy(); expect(recipientRun).not.toBe(creatorRun);
  // a refresh resumes the same attempt, never a second one
  await b.reload();
  await expect(stage(b, "DRAFTING")).toBeVisible({ timeout: 30_000 });
  expect(await runIdOf(b)).toBe(recipientRun);
  await expect(b.locator(".ec-ta-chal-chip")).toBeVisible();
  // opening the link again while the attempt is live offers CONTINUE, not a new run
  await b.goto(`/?challenge=${code}`);
  await expect(b.getByRole("button", { name: /CONTINUE CHALLENGE/ })).toBeVisible({ timeout: 20_000 });
  await b.getByRole("button", { name: /CONTINUE CHALLENGE/ }).click();
  await expect(stage(b, "DRAFTING")).toBeVisible({ timeout: 30_000 });
  expect(await runIdOf(b)).toBe(recipientRun);

  // play it out
  await expect(b.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  await b.getByRole("button", { name: /^ROLL 2$/ }).click();
  await expect(stage(b, "ERA_REVEAL")).toBeVisible({ timeout: 30_000 });
  await b.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await b.getByRole("button", { name: /FINAL ROLL/ }).click();
  await expect(b.locator(".ec-coach-action:not([disabled])").nth(2)).toBeVisible({ timeout: 30_000 });
  await b.getByRole("button", { name: /^Select / }).first().click();
  await b.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  await b.getByRole("button", { name: /RUN CLASH/ }).click();
  await expect(b.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 90_000 });

  // ── the comparison ─────────────────────────────────────────────────────────
  const cmp = b.locator(".ec-chal-cmp");
  await expect(cmp).toBeVisible({ timeout: 30_000 });
  await expect(cmp).toContainText("CHALLENGE COMPLETE");
  await expect(cmp.locator('[data-side="you"] .ec-chal-col-score')).toBeVisible();
  await expect(cmp.locator('[data-side="original"] .ec-chal-col-score')).toHaveText(`${creatorScore[0]}–${creatorScore[1]}`);
  await expect(cmp.getByText(/performance [+-]?\d+/).first()).toBeVisible();
  await expect(cmp).toContainText("FIVE");   // the original's five opens only now
  const outcome = await cmp.getAttribute("data-outcome");
  expect(["creator", "recipient", "tie"]).toContain(outcome);
  const line = await cmp.locator("h2").innerText();
  if (outcome !== "recipient") expect(line).not.toMatch(/You beat/);
  // a recipient's result does not offer to challenge itself back as the same result
  await expect(b.getByRole("button", { name: /CHALLENGE THIS CHAOS/ })).toHaveCount(0);

  // ── the creator sees the response; the invitation counts it ────────────────
  const list = await (await post(creator, { action: "challenge-list" }, auth)).json();
  expect(list.status).toBe("ok");
  const mine = list.created.find((c) => c.code === code);
  expect(mine.responses).toHaveLength(1);
  expect(mine.responses[0]).toMatchObject({ name: "Guest", status: "completed", challengeOutcome: outcome });
  const view = await (await post(guest, { action: "challenge-view", code })).json();
  expect(view.responses).toBe(1); expect(view.viewer.attempt.status).toBe("completed");
  // a second accept by the same guest device is refused: one official attempt
  const second = await (await post(guest, { action: "challenge-accept", code, tier: "GUEST" })).json();
  expect(second.status).toBe("already_attempted");
  // a completed guest returns to the invitation and is told so
  await b.goto(`/?challenge=${code}`);
  await expect(b.getByText(/You have completed this challenge/)).toBeVisible({ timeout: 20_000 });

  // ── revoke: the creator only; the link then reads withdrawn ────────────────
  expect((await (await post(guest, { action: "challenge-revoke", code })).json()).error).toBe("NOT_AUTHENTICATED");
  const rv = await (await post(creator, { action: "challenge-revoke", code }, auth)).json();
  expect(rv.status).toBe("revoked");
  const c = await guest.newPage(); await fresh(c);
  await c.goto(`/?challenge=${code}`);
  await expect(c.getByRole("heading", { name: /withdrawn/i })).toBeVisible({ timeout: 20_000 });
  const third = await (await post(guest, { action: "challenge-accept", code, tier: "GUEST" })).json();
  expect(third.status).toBe("revoked");
  await creator.close(); await guest.close();
});

test("the invitation on a phone: readable, one dominant action, 44px controls, no overflow", async ({ browser }) => {
  const creator = await browser.newContext();
  const a = await creator.newPage(); await fresh(a);
  await a.goto("/play/chaos");
  await expect(stage(a, "EMPTY")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(a.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 30_000 });
  const run = await runIdOf(a);
  await a.getByRole("button", { name: /^ROLL 2$/ }).click();
  await expect(stage(a, "ERA_REVEAL")).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await a.getByRole("button", { name: /FINAL ROLL/ }).click();
  await expect(a.locator(".ec-coach-action:not([disabled])").nth(2)).toBeVisible({ timeout: 30_000 });
  await a.getByRole("button", { name: /^Select / }).first().click();
  await a.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
  await a.getByRole("button", { name: /RUN CLASH/ }).click();
  await expect(a.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 90_000 });
  const { code } = await (await post(creator, { action: "challenge-create", chaosRunId: run }, auth)).json();
  await creator.close();
  for (const [w, h] of [[430, 932], [390, 844], [375, 812]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); await fresh(p);
    await p.goto(`/?challenge=${code}`);
    await expect(p.getByRole("heading", { name: /challenged you/ })).toBeVisible({ timeout: 20_000 });
    const m = await p.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btns = [...document.querySelectorAll("main button")].filter(vis);
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, minBtn: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))), primary: document.querySelectorAll(".ec-chal-btn--primary").length, scoreVisible: vis(document.querySelector(".ec-chal-score")) };
    });
    expect(m.overflow, `${w}x${h} overflow`).toBe(0);
    expect(m.minBtn, `${w}x${h} control`).toBeGreaterThanOrEqual(44);
    expect(m.primary).toBe(1);
    expect(m.scoreVisible).toBe(true);
    await ctx.close();
  }
});
