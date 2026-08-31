// ── Phase 8A: Chaos Clash end to end ─────────────────────────────────────────
// Runs on the Candidate 3 preview harness, where Chaos Clash is enabled — the
// same surface Wave 1 testers use.
import { test, expect } from "@playwright/test";

/** Sign in with a free account so the guest run budget does not gate the flow. */
const withAccount = async (page) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "E2E");
      // Phase 8B resumes an active run, so each test starts from a clean board.
      localStorage.removeItem("ec_chaos_run");
    } catch (e) {}
  });
};

/** Phase 8B: the board opens EMPTY and the first roster needs an explicit roll. */
const rollOne = async (page) => {
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
  await page.getByRole("button", { name: "ROLL 1", exact: true }).click();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
};

/** Drive the three-roll coach draft and hire the first offer. */
const coachDraft = async (page) => {
  await expect(page.getByText(/COACH ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & ROLL COACHES/ }).click();
  await expect(page.getByText(/COACH ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /LOCK HOLDS & FINAL COACH ROLL/ }).click();
  await expect(page.getByText("CHOOSE YOUR COACH").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "SELECT" }).first().click();
  await page.getByRole("button", { name: "HIRE THIS COACH" }).click();
};

const lockHolds = async (page) => {
  const cta = page.getByRole("button", { name: /LOCK HOLDS|FINAL ROLL/ });
  await cta.click();
  await page.waitForTimeout(1200);
};

test("Chaos Clash is the default Play experience and opens with an empty board", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  // Phase 8C: the Arena Command Center is the canonical Play layout.
  await expect(page.locator(".ec-cc")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Matchup and result" })).toBeVisible();
  await expect(page.getByText("EXPLORE MORE MODES")).toBeVisible();
  // Nothing is drawn until the user asks for it.
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
  await expect(page.getByText("ERA HIDDEN")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Hold|Release) / })).toHaveCount(0);
  expect(await page.locator(".chaos-empty-slot").count()).toBe(10);
  // There is no difficulty control anywhere in the Chaos flow.
  await expect(page.getByRole("tablist", { name: "Opponent difficulty" })).toHaveCount(0);
});

test("every hold control stays live in both decision rounds", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await rollOne(page);

  // Roll 1: hold three cards independently; none may disable the others.
  const names = [];
  for (let i = 0; i < 3; i++) {
    const btn = page.getByRole("button", { name: /^Hold / }).first();
    const who = (await btn.getAttribute("aria-label")).replace(/^Hold /, "");
    names.push(who);
    await btn.click();
    await expect(page.getByRole("button", { name: `Release ${who}` })).toHaveAttribute("aria-pressed", "true");
  }
  expect(await page.getByRole("button", { name: /^Release / }).count()).toBe(3);
  for (const b of await page.getByRole("button", { name: /^(Hold|Release) / }).all()) {
    expect(await b.isDisabled()).toBe(false);
  }

  await page.getByRole("button", { name: /LOCK HOLDS & ROLL 2/ }).click();
  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible({ timeout: 20_000 });

  // Roll 2: the controls are LIVE immediately — no acknowledgement gate — and
  // the cards kept through Roll 1 start already selected.
  for (const b of await page.getByRole("button", { name: /^(Hold|Release) / }).all()) {
    expect(await b.isDisabled(), "a hold control was disabled at Roll 2").toBe(false);
  }
  expect(await page.getByRole("button", { name: /^Release / }).count()).toBeGreaterThan(0);

  // A previously held card can be released.
  const held = page.getByRole("button", { name: /^Release / }).first();
  const who = (await held.getAttribute("aria-label")).replace(/^Release /, "");
  await held.click();
  await expect(page.getByRole("button", { name: `Hold ${who}` })).toHaveAttribute("aria-pressed", "false");
});

test("three rolls, holds, era reveal before the final holds, then coach offers", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await rollOne(page);

  // The era is not shown before Roll 2.
  await expect(page.getByText("ERA HIDDEN")).toBeVisible();

  // Hold one card, then roll. The accessible name flips from "Hold X" to
  // "Release X" once held, so the assertion must follow THAT card rather than
  // re-resolving "the first button still called Hold" — which is a different card.
  const firstHold = page.getByRole("button", { name: /^Hold / }).first();
  const label = await firstHold.getAttribute("aria-label");
  const who = label.replace(/^Hold /, "");
  await firstHold.click();
  await expect(page.getByRole("button", { name: `Release ${who}` })).toHaveAttribute("aria-pressed", "true");
  await lockHolds(page);

  await expect(page.getByText(/ROLL 2 OF 3/).first()).toBeVisible();
  // The era is revealed WITH Roll 2 and stays on screen from here on.
  await expect(page.getByRole("region", { name: /era style/ }).first()).toBeVisible();
  await expect(page.getByText("Team Blue's holds were locked before yours were submitted.")).toBeVisible();

  await lockHolds(page);
  await expect(page.getByText(/COACH ROLL 1 OF 3/).first()).toBeVisible({ timeout: 20_000 });
  // The final roster is locked: no hold control survives, and the cards say so.
  await expect(page.getByText("FINAL ROSTER").first()).toBeVisible();
  // Three offers, in three distinct roles, with the era still visible.
  for (const role of ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"]) {
    await expect(page.getByText(role, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: /era style/ }).first()).toBeVisible();
});

test("a full Clash reaches a postgame with a player-centered story and an aligned box score", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await rollOne(page);
  await lockHolds(page);
  await lockHolds(page);
  await coachDraft(page);
  await expect(page.getByRole("button", { name: "RUN SIM" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "RUN SIM" }).click();

  // Phase 8C: the result lands in the dock; the full report opens over the page.
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /VIEW FULL POSTGAME REPORT/ }).click();
  await expect(page.getByRole("dialog", { name: "Full postgame report" })).toBeVisible();

  // Game Story: a deterministic, player-centered opening and quarter flow.
  await page.getByRole("tab", { name: "Game Story" }).last().click();
  await expect(page.getByText(/HOW (GOLD|BLUE) WON/).last()).toBeVisible();
  await expect(page.getByText("QUARTER BY QUARTER").last()).toBeVisible();
  await expect(page.getByText(/WHY YOU (WON|LOST)/)).toHaveCount(0);
  // Enhanced analysis is never an empty panel.
  await expect(page.getByText("EXPANDED GAME ANALYSIS").last()).toBeVisible();

  // Box score: ONE table, two row groups, columns that actually agree.
  await page.getByRole("tab", { name: "Box Score" }).last().click();
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
  await page.getByRole("tab", { name: "Coaching & Strategy" }).last().click();
  // Three sub-sections, not two very long parallel columns.
  for (const sec of ["Offensive Scheme", "Defensive Scheme", "In-Game Adjustments"]) {
    await expect(page.getByRole("tab", { name: sec })).toBeVisible();
  }
  await page.getByRole("tab", { name: "In-Game Adjustments" }).click();
  const coachingText = await page.locator("body").innerText();
  expect(coachingText).not.toMatch(/so the staff/);
  expect(coachingText).not.toMatch(/switch_heavy|drop_heavy/);
  expect(coachingText).not.toMatch(/\bPoss\. \d+/);
  // The draft-shaped section was removed at the owner's direction.
  const whole = await page.locator("body").innerText();
  expect(whole).not.toMatch(/HOW YOUR DRAFT SHAPED THE GAME/);
  expect(whole).not.toMatch(/BEST HOLD|BIGGEST GAMBLE/);
});

test("box-score stat values never wrap", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/");
  await rollOne(page);
  await lockHolds(page);
  await lockHolds(page);
  await coachDraft(page);
  await page.getByRole("button", { name: "RUN SIM" }).click();
  await expect(page.getByText("FINAL SCORE")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /VIEW FULL POSTGAME REPORT/ }).click();
  await page.getByRole("tab", { name: "Box Score" }).last().click();
  const wrapped = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("table.box-table tbody td")];
    const line = Math.min(...cells.map((c) => c.getBoundingClientRect().height));
    return cells.filter((c) => c.getBoundingClientRect().height > line + 4).map((c) => c.textContent.trim());
  });
  expect(wrapped, "a stat value wrapped onto a second line").toEqual([]);
});

test("Dream Matchup is gated behind a free account and can be reached from the shelf", async ({ page }) => {
  await page.goto("/");   // deliberately signed out
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Dream Matchup/ }).first().click();
  await expect(page.getByText("FREE ACCOUNT REQUIRED")).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE FREE ACCOUNT" }).first()).toBeVisible();
  // A signed-out user is never stranded.
  await page.getByRole("button", { name: "BACK TO CHAOS CLASH" }).click();
  await expect(page.getByText("THREE ROLLS AVAILABLE").first()).toBeVisible();
});

test("the Chaos flow is keyboard operable and the hold targets are large enough", async ({ page }) => {
  await withAccount(page);
  await page.goto("/");
  await rollOne(page);
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
    await rollOne(page);
    await expect(page.getByText("TEAM GOLD")).toBeVisible();
    await expect(page.getByText("TEAM BLUE · LEGEND")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `page overflows horizontally at ${w}x${h}`).toBe(false);
  }
});
