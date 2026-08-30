// ── Phase 8C: Arena Command Center ───────────────────────────────────────────
import { test, expect } from "@playwright/test";

const withAccount = async (page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E");
      // Each test starts from a clean board — EXCEPT when a test is deliberately
      // exercising resume-after-reload, which it marks in sessionStorage
      // (sessionStorage survives a reload in the same tab, so the marker holds).
      if (!sessionStorage.getItem("e2e_keep_run")) localStorage.removeItem("ec_chaos_run");
    } catch (e) {}
  });
};
const asGuest = async (page) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem("ec_account"); localStorage.removeItem("ec_chaos_run"); } catch (e) {}
  });
};

test("the arena is a two-column command centre with a persistent dock", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await expect(page.locator(".ec-cc")).toBeVisible();
  const dock = page.getByRole("complementary", { name: "Matchup and result" });
  await expect(dock).toBeVisible();
  // Two columns on desktop, and the dock is sticky.
  const layout = await page.evaluate(() => {
    const cc = document.querySelector(".ec-cc");
    const d = document.querySelector(".ec-cc-dock");
    return {
      columns: getComputedStyle(cc).gridTemplateColumns.split(" ").length,
      sticky: getComputedStyle(d).position,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  expect(layout.columns).toBe(2);
  expect(layout.sticky).toBe("sticky");
  expect(layout.overflow).toBe(false);
  // Pre-draft dock state, and no stale result.
  await expect(page.getByText("BUILD YOUR CLASH")).toBeVisible();
  await expect(page.getByText("FINAL SCORE")).toHaveCount(0);
});

test("Play and Fantasy menus are keyboard accessible and registry driven", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");

  const play = page.getByRole("button", { name: /^Play/ });
  await play.click();
  const playMenu = page.getByRole("menu", { name: "Play" });
  await expect(playMenu).toBeVisible();
  for (const m of ["Chaos Clash", "Dream Matchup", "Daily Clash", "Best of 7", "Win 82", "Tournament", "Era Gauntlet"]) {
    await expect(playMenu.getByText(m, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(playMenu).toHaveCount(0);
  await expect(play).toBeFocused();

  const fantasy = page.getByRole("button", { name: /^Fantasy/ });
  await fantasy.click();
  const fantasyMenu = page.getByRole("menu", { name: "Fantasy" });
  await expect(fantasyMenu.getByText("EraClash Fantasy", { exact: true })).toBeVisible();
  await expect(fantasyMenu.getByText("EraClash Live", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fantasyMenu).toHaveCount(0);
});

test("a subscription-gated mode routes to one membership destination with no checkout", async ({ page }) => {
  await asGuest(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("menu", { name: "Play" }).getByRole("menuitem", { name: /Win 82/ }).click();
  await expect(page).toHaveURL(/\/membership\?.*feature=win82.*required=plus/);
  await expect(page.getByRole("heading", { name: "EraClash membership" })).toBeVisible();
  await expect(page.getByText(/does not process payments/i)).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\$\d/);
  expect(body).not.toMatch(/free trial|enter card|checkout/i);
  // Back returns to the arena.
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.locator(".ec-cc")).toBeVisible();
});

test("a coming-soon mode explains itself instead of asking for money", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("menu", { name: "Play" }).getByRole("menuitem", { name: /Era Gauntlet/ }).click();
  await expect(page).toHaveURL(/\/modes\/era-gauntlet/);
  await expect(page.getByText(/not yet built/i)).toBeVisible();
  // The page must DISCLAIM membership, not offer it. The word appears only in
  // the sentence saying the mode is not part of any plan.
  await expect(page.getByText(/not part of any membership/i)).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\$\d|subscribe|upgrade now|buy /i);
  // And it does not route anywhere that asks for money.
  expect(page.url()).not.toMatch(/membership/);
});

test("both fantasy pages are truthful about not being live", async ({ page }) => {
  await withAccount(page);
  for (const [path, heading] of [["/fantasy/eraclash", "EraClash Fantasy"], ["/fantasy/live", "EraClash Live"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/not live/i);
    expect(body).not.toMatch(/join now|enter now|\$\d|entry fee\b(?!s)/i);
  }
});

test("the result appears in the dock and the full report opens over the same page", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: "ROLL 1", exact: true }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  // Dock shows live draft context, not a result.
  await expect(page.getByText("YOUR CLASH SO FAR")).toBeVisible();

  await page.getByRole("button", { name: /LOCK HOLDS & ROLL 2/ }).click();
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL ROLL/ }).click();
  await expect(page.getByText(/COACH ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL COACHES/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL COACH ROLL/ }).click();
  await expect(page.getByText("CHOOSE YOUR COACH").first()).toBeVisible({ timeout: 20_000 });

  // Outlook state before the game.
  await expect(page.getByText("MATCHUP OUTLOOK")).toBeVisible();
  await page.getByRole("button", { name: "SELECT" }).first().click();
  await page.getByRole("button", { name: "HIRE THIS COACH" }).click();
  // Challenge must be reachable at READY (an 8C regression made it vanish).
  await expect(page.getByRole("button", { name: "CHALLENGE THIS CHAOS" })).toBeVisible();
  await page.getByRole("button", { name: "RUN THE CLASH" }).click();

  // Final state in the dock, with all four tabs.
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 45_000 });
  for (const t of ["Game Story", "Box Score", "Coaching", "Analysis"]) {
    await expect(page.getByRole("tab", { name: t }).first()).toBeVisible();
  }
  // The matchup context survives the result.
  await expect(page.getByText("THE MATCHUP YOU BUILT")).toBeVisible();
  await expect(page.getByRole("button", { name: /LOCK HOLDS/ })).toHaveCount(0);

  // The full report opens over the same page and closes back to the arena.
  await page.getByRole("button", { name: /VIEW FULL POSTGAME REPORT/ }).click();
  const dialog = page.getByRole("dialog", { name: "Full postgame report" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab", { name: "Coaching & Strategy" })).toBeVisible();
  await page.getByRole("button", { name: /Back to the arena/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("THE MATCHUP YOU BUILT")).toBeVisible();
  await expect(page.getByText("FINAL SCORE")).toBeVisible();

  // The dock offers a post-game challenge and shows the share link.
  await page.getByRole("button", { name: "Challenge this Chaos" }).click();
  await expect(page.getByText(/\?chaos=[a-z0-9]+/)).toBeVisible();
});

test("a run resumed at READY after a reload still runs", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: "ROLL 1", exact: true }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL 2/ }).click();
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL ROLL/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL COACHES/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL COACH ROLL/ }).click();
  await expect(page.getByText("CHOOSE YOUR COACH").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "SELECT" }).first().click();
  await page.getByRole("button", { name: "HIRE THIS COACH" }).click();
  await expect(page.getByRole("button", { name: "RUN THE CLASH" })).toBeVisible();

  // The regression: after a reload the resumed run's RUN button did nothing,
  // because the click handler waited on in-session state a reload never sets.
  await page.evaluate(() => sessionStorage.setItem("e2e_keep_run", "1"));
  await page.reload();
  await expect(page.getByRole("button", { name: "RUN THE CLASH" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "RUN THE CLASH" }).click();
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 45_000 });
});

test("mobile stacks the dock and never overflows", async ({ page }) => {
  await withAccount(page);
  for (const [w, h] of [[375, 812], [390, 844], [430, 932], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.locator(".ec-cc")).toBeVisible();
    const r = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector(".ec-cc")).gridTemplateColumns.split(" ").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    expect(r.columns, `dock should stack at ${w}px`).toBe(1);
    expect(r.overflow, `page overflows at ${w}px`).toBe(false);
  }
});

test("Run it back replays the SAME matchup and actually completes", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await page.getByRole("button", { name: "ROLL 1", exact: true }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL 2/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL ROLL/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL COACHES/ }).click();
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL COACH ROLL/ }).click();
  await expect(page.getByText("CHOOSE YOUR COACH").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "SELECT" }).first().click();
  await page.getByRole("button", { name: "HIRE THIS COACH" }).click();
  await page.getByRole("button", { name: "RUN THE CLASH" }).click();
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 45_000 });

  // Capture the rematch request: it must be mode "single" (the server has no
  // "chaos" mode — sending it was rejected outright) and must carry the SAME
  // coaches and era from the finished record, not neutral/default ones.
  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/game") && r.method() === "POST", { timeout: 20_000 });
  await page.getByRole("button", { name: "Run it back" }).click();
  const req = await reqPromise;
  const body = req.postDataJSON();
  expect(body.mode).toBe("single");
  expect(body.coachGoldId, "the rematch must keep the hired coach, not fall to neutral").toBeTruthy();
  expect(body.coachBlueId).toBeTruthy();
  expect(body.eraStyleId, "the rematch must keep the revealed era").toMatch(/^\d{4}s$/);
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 45_000 });
});

test("a Wave 1 scenario link lands a GUEST in the preloaded builder", async ({ page }) => {
  await asGuest(page);
  await page.goto("/?scenario=w1-s1");
  // The arena must not render on top, and the account gate must not block a
  // guided preview scenario.
  await expect(page.getByText(/GUIDED SCENARIO 1/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("THREE ROLLS AVAILABLE")).toHaveCount(0);
  await expect(page.getByText("FREE ACCOUNT REQUIRED")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
});
