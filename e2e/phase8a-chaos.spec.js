// ── Phase 8A: Chaos Clash end to end ─────────────────────────────────────────
// Runs on the Candidate 3 preview harness, where Chaos Clash is enabled — the
// same surface Wave 1 testers use.
import { test, expect } from "@playwright/test";

/** Sign in with a free account so the guest run budget does not gate the flow. */
const withAccount = async (page) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E"); } catch (e) {}
  });
};

const lockHolds = async (page) => {
  const cta = page.getByRole("button", { name: /LOCK HOLDS|FINAL ROLL/ });
  await cta.click();
  await page.waitForTimeout(1200);
};

test("Chaos Clash is the default Play experience", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ROLL YOUR CLASH" })).toBeVisible();
  await expect(page.getByText("Three rolls. Hold your legends. Adapt to the era.")).toBeVisible();
  await expect(page.getByRole("button", { name: "BUILD A DREAM MATCHUP" })).toBeVisible();
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();
  // There is no difficulty control anywhere in the Chaos flow.
  await expect(page.getByRole("tablist", { name: "Opponent difficulty" })).toHaveCount(0);
});

test("three rolls, holds, era reveal before the final holds, then coach offers", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();

  // The era is not shown before Roll 2.
  await expect(page.getByRole("region", { name: "Era reveal" })).toHaveCount(0);

  // Hold one card, then roll. The accessible name flips from "Hold X" to
  // "Release X" once held, so the assertion must follow THAT card rather than
  // re-resolving "the first button still called Hold" — which is a different card.
  const firstHold = page.getByRole("button", { name: /^Hold / }).first();
  const label = await firstHold.getAttribute("aria-label");
  const who = label.replace(/^Hold /, "");
  await firstHold.click();
  await expect(page.getByRole("button", { name: `Release ${who}` })).toHaveAttribute("aria-pressed", "true");
  await lockHolds(page);

  await expect(page.getByText(/ROLL 2 OF 3/)).toBeVisible();
  const era = page.getByRole("region", { name: "Era reveal" });
  await expect(era).toBeVisible();
  await expect(page.getByText("Team Blue's holds were locked before yours were submitted.")).toBeVisible();

  // The final holds come AFTER the era is known.
  await page.getByRole("button", { name: "MAKE MY FINAL HOLDS" }).click();
  await expect(page.getByRole("button", { name: "FINAL ROLL" })).toBeVisible();
  await lockHolds(page);

  await expect(page.getByText("ROSTERS LOCKED")).toBeVisible();
  await expect(page.getByText("CHOOSE YOUR COACH")).toBeVisible();
  // Exactly three offers, in three distinct roles.
  for (const role of ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"]) {
    await expect(page.getByText(role, { exact: true })).toBeVisible();
  }
});

test("a full Clash reaches a postgame with a player-centered story and an aligned box score", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();
  await lockHolds(page);
  await page.getByRole("button", { name: "MAKE MY FINAL HOLDS" }).click();
  await lockHolds(page);
  await page.getByRole("button", { name: /Roster Maximizer/i }).click();
  await page.getByRole("button", { name: "HIRE THIS COACH" }).click();
  await expect(page.getByRole("button", { name: "RUN THE CLASH" })).toBeVisible();
  await page.getByRole("button", { name: "RUN THE CLASH" }).click();

  await expect(page.getByRole("tab", { name: "Box Score" })).toBeVisible({ timeout: 40_000 });

  // Game Story: a deterministic, player-centered opening and quarter flow.
  await page.getByRole("tab", { name: "Game Story" }).click();
  await expect(page.getByText(/HOW (GOLD|BLUE) WON/)).toBeVisible();
  await expect(page.getByText("QUARTER BY QUARTER")).toBeVisible();
  await expect(page.getByText(/WHY YOU (WON|LOST)/)).toHaveCount(0);

  // Box score: ONE table, two row groups, columns that actually agree.
  await page.getByRole("tab", { name: "Box Score" }).click();
  const geometry = await page.evaluate(() => {
    const t = document.querySelector("table.box-table");
    const bodies = [...t.querySelectorAll("tbody")];
    const statRow = (tb) => [...tb.querySelectorAll("tr")].find((r) => r.querySelectorAll("td").length > 3);
    const lefts = (r) => [...r.querySelectorAll("td")].map((td) => Math.round(td.getBoundingClientRect().left));
    return {
      tables: document.querySelectorAll("table").length,
      groups: bodies.length,
      gold: lefts(statRow(bodies[0])),
      blue: lefts(statRow(bodies[1])),
      headers: [...t.querySelectorAll("thead th")].map((h) => h.textContent.trim()),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(geometry.tables).toBe(1);
  expect(geometry.groups).toBe(2);
  expect(geometry.gold).toEqual(geometry.blue);
  expect(geometry.headers).not.toContain("PF");
  expect(geometry.pageOverflow).toBe(false);

  // Coaching: a scouting report, named coaches, no enums, no fabricated clock.
  await page.getByRole("tab", { name: "Coaching & Strategy" }).click();
  await expect(page.getByText("OFFENSIVE PLAN").first()).toBeVisible();
  await expect(page.getByText("BEFORE TIPOFF")).toBeVisible();
  await expect(page.getByText("HOW YOUR DRAFT SHAPED THE GAME")).toBeVisible();
  const coachingText = await page.locator("body").innerText();
  expect(coachingText).not.toMatch(/so the staff/);
  expect(coachingText).not.toMatch(/switch_heavy|drop_heavy/);
  expect(coachingText).not.toMatch(/\bPoss\. \d+/);
});

test("Dream Matchup is gated behind a free account and can be reached from Chaos", async ({ page }) => {
  await page.goto("/");   // deliberately signed out
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "BUILD A DREAM MATCHUP" }).click();
  await expect(page.getByText("FREE ACCOUNT REQUIRED")).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE FREE ACCOUNT" })).toBeVisible();
  // A signed-out user is never stranded.
  await page.getByRole("button", { name: "BACK TO CHAOS CLASH" }).click();
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();
});

test("the Chaos flow is keyboard operable and the hold targets are large enough", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((b) => /^(HOLD|HELD)$/.test(b.textContent.trim()))
      .map((b) => Math.round(b.getBoundingClientRect().height)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);

  // Toggle a hold with the keyboard alone. The control renames itself when
  // held, so the assertion targets the new name.
  const hold = page.getByRole("button", { name: /^Hold / }).first();
  const who = (await hold.getAttribute("aria-label")).replace(/^Hold /, "");
  await hold.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: `Release ${who}` })).toHaveAttribute("aria-pressed", "true");
});

test("mobile keeps both boards readable with no page-level horizontal overflow", async ({ page }) => {
  await withAccount(page);
  for (const [w, h] of [[375, 812], [390, 844], [430, 932], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByText(/ROLL 1 OF 3/)).toBeVisible();
    await expect(page.getByText("TEAM GOLD")).toBeVisible();
    await expect(page.getByText("TEAM BLUE · LEGEND")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `page overflows horizontally at ${w}x${h}`).toBe(false);
  }
});
