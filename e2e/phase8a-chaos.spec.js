// ── Phase 8A/8B contracts, on the current surface ────────────────────────────
// Runs on the Candidate 3 preview harness, where Chaos Clash is enabled — the
// same surface Wave 1 testers use.
//
// These are the Phase 8A and 8B contracts: an empty opening board, live hold
// controls in every decision round, three rolls and no fourth, the era revealed
// before the final decision, a player-centered story, and a box score whose
// columns agree and whose values never wrap. They are asserted against the
// TIME ARENA, because that is the surface people play.
//
// Phase 9B.3 (Chaos Clash Guided Flow V2) changed the PRESENTATION, not the
// mechanics: the arena resolves one of six states, the era reveal is its own
// state with one action (ADAPT TO ERA), Coach Chaos appears only once the five
// is set, and the result leads with the score. The steps below drive that flow;
// what they assert about the game is unchanged.
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
const stage = (page, st) => page.locator(`.ec-ta-stage[data-guided-state="${st}"]`);
const rollOne = async (page) => {
  await expect(stage(page, "EMPTY")).toBeVisible();
  await page.getByRole("button", { name: /^ROLL$/ }).click();
  await expect(stage(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4)).toBeVisible({ timeout: 20_000 });
};
/** 9B.3: the era is revealed WITH Roll 2 as its own state; one action continues. */
const adaptToEra = async (page) => {
  await expect(stage(page, "ERA_REVEAL")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".ec-era-reveal-id")).toHaveText(/^\d{4}s$/);
  await page.getByRole("button", { name: /ADAPT TO ERA/ }).click();
  await expect(stage(page, "DRAFTING")).toBeVisible({ timeout: 20_000 });
};

/**
 * Hire from the three offers that survived the third roll. Coaches no longer
 * have rolls of their own: they ride the same three-roll sequence as the five.
 */
const hireStaff = async (page) => {
  await expect(stage(page, "COACH_SELECT")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("COACH CHAOS").first()).toBeVisible();
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /CONTINUE WITH COACH/ }).click();
};

/** Roll 2 or the final roll, whichever the board offers; then let it land. */
const lockHolds = async (page) => {
  await page.getByRole("button", { name: /^ROLL 2$|FINAL ROLL/ }).click();
  await page.waitForTimeout(1200);
};

test("Chaos Clash is the default Play experience and opens with an empty board", async ({ page }) => {
  await withAccount(page);
  await page.goto("/play/chaos");
  // Phase 8C: the Time Arena is the canonical Play layout.
  await expect(page.locator(".ec-ta")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Live intel" })).toBeVisible();
  // No permanent mode shelf on the Play surface: the arena is for the Clash in
  // front of you, and the Play menu carries every mode.
  await expect(page.getByText("EXPLORE MORE MODES")).toHaveCount(0);
  // Nothing is drawn until the user asks for it: one ROLL, no era, no coaches.
  await expect(stage(page, "EMPTY")).toBeVisible();
  await expect(page.getByRole("button", { name: /^ROLL$/ })).toBeVisible();
  await expect(page.getByText(/ROLL 1 OF 3/).first()).toBeVisible();
  await expect(page.locator(".ec-intel-era-id, .ec-era-reveal-id, .ec-ta-era-chip")).toHaveCount(0);
  await expect(page.locator(".ec-coach-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Hold|Release) / })).toHaveCount(0);
  expect(await page.locator(".ec-pc-empty").count()).toBe(10);
  // There is no difficulty control anywhere in the Chaos flow.
  await expect(page.getByRole("tablist", { name: "Opponent difficulty" })).toHaveCount(0);
});

test("every hold control stays live in both decision rounds", async ({ page }) => {
  await withAccount(page);
  await page.goto("/play/chaos");
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

  await page.getByRole("button", { name: /^ROLL 2$/ }).click();
  // 9B.3: Roll 2 lands as the ERA REVEAL; one action returns to the draft.
  await adaptToEra(page);

  // Roll 2: back on the draft the controls are LIVE, and the cards kept through
  // Roll 1 start already selected.
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
  await page.goto("/play/chaos");
  await rollOne(page);

  // The era is not shown before Roll 2 — and neither is Coach Chaos.
  await expect(page.locator(".ec-ta-utility").getByText(/ERA: HIDDEN/)).toBeVisible();
  await expect(page.locator(".ec-coach-card")).toHaveCount(0);

  // Hold one card, then roll. The accessible name flips from "Hold X" to
  // "Release X" once held, so the assertion must follow THAT card rather than
  // re-resolving "the first button still called Hold" — which is a different card.
  const firstHold = page.getByRole("button", { name: /^Hold / }).first();
  const label = await firstHold.getAttribute("aria-label");
  const who = label.replace(/^Hold /, "");
  await firstHold.click();
  await expect(page.getByRole("button", { name: `Release ${who}` })).toHaveAttribute("aria-pressed", "true");
  await lockHolds(page);

  // The era is revealed WITH Roll 2, as its own state: the reveal names it, the
  // rail's era panel names it, and Coach Chaos is still nowhere on the board.
  await expect(stage(page, "ERA_REVEAL")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".ec-era-reveal-id")).toHaveText(/^\d{4}s$/);
  await expect(page.locator(".ec-ta-rail .ec-intel-era-id")).toHaveText(/^\d{4}s$/);
  await expect(page.locator(".ec-coach-card")).toHaveCount(0);
  await adaptToEra(page);
  // Back on the draft the era stays on screen, stated once in the utility bar.
  await expect(page.locator(".ec-ta-utility").getByText(/^ERA: \d{4}s/)).toBeVisible();
  await expect(page.locator(".ec-ta-rail .ec-intel-era-id")).toHaveCount(0);

  await lockHolds(page);
  await expect(stage(page, "COACH_SELECT")).toBeVisible({ timeout: 20_000 });
  // The final roster is locked and compressed: no hold control survives.
  await expect(page.locator('.ec-ta-stage[data-roster="compressed"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Hold|Release) / })).toHaveCount(0);
  // Three offers, in three distinct roles, with the era still visible as a chip.
  await expect(page.getByText("COACH CHAOS").first()).toBeVisible();
  await expect(page.locator(".ec-coach-card")).toHaveCount(3);
  for (const role of ["ROSTER MAXIMIZER", "OPPONENT COUNTER", "ERA ADAPTER"]) {
    await expect(page.getByText(role, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".ec-ta-era-chip")).toContainText(/ERA: \d{4}s/);
});

test("a full Clash reaches a postgame with a player-centered story and an aligned box score", async ({ page }) => {
  test.slow();
  await withAccount(page);
  await page.goto("/play/chaos");
  await rollOne(page);
  await lockHolds(page);
  await adaptToEra(page);
  await lockHolds(page);
  await hireStaff(page);
  await expect(page.getByRole("button", { name: /RUN CLASH/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /RUN CLASH/ }).click();

  // 9B.3: the score leads the stage head; the full report opens over the page.
  await expect(page.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
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
  await page.goto("/play/chaos");
  await rollOne(page);
  await lockHolds(page);
  await adaptToEra(page);
  await lockHolds(page);
  await hireStaff(page);
  await page.getByRole("button", { name: /RUN CLASH/ }).click();
  await expect(page.locator(".ec-ta-score[data-winner]")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  await page.getByRole("tab", { name: "Box Score" }).last().click();
  const wrapped = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("table.box-table tbody td")];
    const line = Math.min(...cells.map((c) => c.getBoundingClientRect().height));
    return cells.filter((c) => c.getBoundingClientRect().height > line + 4).map((c) => c.textContent.trim());
  });
  expect(wrapped, "a stat value wrapped onto a second line").toEqual([]);
});

test("Dream Matchup is gated behind a free account and can be reached from the Play menu", async ({ page }) => {
  await page.goto("/play/chaos");   // deliberately signed out
  await expect(stage(page, "EMPTY")).toBeVisible({ timeout: 20_000 });
  // The shelf is gone; the Play menu is where a mode is chosen.
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("menuitem", { name: /Dream Matchup/ }).click();
  await expect(page).toHaveURL(/\/play\/dream$/);
  await expect(page.getByText("FREE ACCOUNT REQUIRED")).toBeVisible();
  await expect(page.getByRole("button", { name: "CREATE FREE ACCOUNT" }).first()).toBeVisible();
  // A signed-out user is never stranded: the way back is the Play Lobby (9A).
  await page.getByRole("button", { name: "BACK TO THE LOBBY" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { name: "Chaos Clash" })).toBeVisible();
});

test("the Chaos flow is keyboard operable and the hold targets are large enough", async ({ page }) => {
  await withAccount(page);
  await page.goto("/play/chaos");
  await rollOne(page);
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-label]")]
      .filter((b) => /^(Hold|Release) /.test(b.getAttribute("aria-label")))
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
    await page.goto("/play/chaos");
    await rollOne(page);
    // Both boards are reachable: on a phone (9B.3) one team shows at a time and
    // the other is one tab away; wider than that both are on screen.
    await expect(page.getByText("TEAM GOLD", { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("TEAM BLUE", { exact: true }).locator("visible=true").first()).toBeVisible();
    if (w <= 767) {
      await page.getByRole("tab", { name: /TEAM BLUE/ }).click();
      await expect(page.locator('.ec-ta-team[data-team="blue"] .ec-pc').first()).toBeVisible();
    } else {
      await expect(page.getByText("LEGEND RIVAL", { exact: true }).first()).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `page overflows horizontally at ${w}x${h}`).toBe(false);
  }
});
