// ── Daily Challenge with coaches + Era Style (preview flag ON) ────────────────
// Runs against the 4174 harness, where DAILY_COACH_ERA_ENABLED=true. The
// flag-off journeys in journeys.spec.js stay on 4173 and must keep passing
// unchanged — that pair IS the isolation proof at the UI level.
//
// What a real player has to be able to do here: see today's era, understand
// how the three coaches differ, hire exactly one, and be unable to start the
// official attempt until they have.
import { test, expect } from "@playwright/test";

/**
 * Reach a top-level destination at ANY width. Below 900px the header folds
 * Daily, Challenges, Leaderboard and My EraClash into one "More" menu rather
 * than wrapping onto three lines, so a phone-width test has to open the menu.
 */
const gotoNav = async (page, label) => {
  const direct = page.getByRole("button", { name: label, exact: true });
  if (await direct.count() && await direct.first().isVisible()) return direct.first().click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${label}`) }).click();
};

const draftDailyRoster = async (page) => {
  await gotoNav(page, "Daily");
  await page.getByRole("button", { name: /Start Today's Challenge/ }).click();
  await page.getByRole("button", { name: /Roll 2/ }).click();
  await page.getByRole("button", { name: /Roll 3/ }).click();
  await page.getByRole("button", { name: /Finalize Squad/ }).click();
};

test("D1: the official era is shown, and it is the same one the server ran", async ({ page }) => {
  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  expect(cfg.officialEraStyleId, "the preview flag must be on for this project").toBeTruthy();

  await page.goto("/");
  await draftDailyRoster(page);

  await expect(page.getByText("TODAY'S ERA STYLE")).toBeVisible();
  await expect(page.getByText("Same for everyone", { exact: true })).toBeVisible();
  // The label the player reads must be today's official era, not a default.
  await expect(page.getByText(cfg.era.label, { exact: false }).first()).toBeVisible();
  // Documented era description, in words.
  await expect(page.getByText(cfg.era.summary[0], { exact: false })).toBeVisible();
});

test("D2: three coaches, each with tags and a stated difference, and no ratings", async ({ page }) => {
  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  await page.goto("/");
  await draftDailyRoster(page);

  await expect(page.getByText("HIRE ONE COACH")).toBeVisible();
  for (const o of cfg.coachOptions) {
    const opt = page.getByRole("button", { name: new RegExp(o.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    await expect(opt).toBeVisible();
    await expect(opt).toContainText(o.whyDifferent);
    await expect(opt).toContainText(o.systemTags[0]);
  }
  // No rating, OVR, score, or ranking may leak into the choice — a ranked
  // list would make the decision cosmetic.
  const panel = page.getByText("HIRE ONE COACH").locator("xpath=ancestor::div[1]");
  await expect(panel).not.toContainText(/OVR|Rating|Score|\bRank\b|#1|Best fit/i);
});

test("D3: the sim is locked until a coach is hired, then unlocks", async ({ page }) => {
  await page.goto("/");
  await draftDailyRoster(page);

  // Roster is complete but the decision is not — no official attempt yet.
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toHaveCount(0);
  await expect(page.getByText(/Hire one of today's three coaches/)).toBeVisible();

  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  const first = cfg.coachOptions[0];
  await page.getByRole("button", { name: new RegExp(first.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();

  await expect(page.getByText("Locked in")).toBeVisible();
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
});

test("D4: hiring a coach plays the Daily and the result reports the coach and era", async ({ page }) => {
  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  const pick = cfg.coachOptions[1];
  await page.goto("/");
  await draftDailyRoster(page);
  await page.getByRole("button", { name: new RegExp(pick.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();

  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Box Score" }).click();
  await expect(page.getByText("BOX SCORE", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Final" }).click();
  // The one decision the player owned belongs in the result metadata.
  await expect(page.getByText(new RegExp(`Coach:\\s*${pick.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeVisible();
  await expect(page.getByText(/Era Style:/)).toBeVisible();
});

test("D5: mobile — the era, all three coaches, and the sim button are usable at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  await page.goto("/");
  await draftDailyRoster(page);

  await expect(page.getByText("TODAY'S ERA STYLE")).toBeVisible();
  for (const o of cfg.coachOptions) {
    const opt = page.getByRole("button", { name: new RegExp(o.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    await expect(opt).toBeVisible();
    const box = await opt.boundingBox();
    // Tap target and no horizontal overflow on a phone.
    expect(box.height, `${o.name} tap target`).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width, `${o.name} must not overflow 375px`).toBeLessThanOrEqual(375);
  }
  await page.getByRole("button", { name: new RegExp(cfg.coachOptions[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  const sim = page.getByRole("button", { name: /RUN THE SIM/ });
  await expect(sim).toBeVisible();
  const sb = await sim.boundingBox();
  expect(sb.height).toBeGreaterThanOrEqual(44);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW, "the page must not scroll sideways on mobile").toBeLessThanOrEqual(375 + 1);
});

test("D6: a coach outside today's three is rejected and the attempt survives", async ({ page }) => {
  await page.goto("/");
  const cfg = await (await page.request.get("/api/daily?config=1")).json();
  // Drive the API directly — the UI cannot express this, which is the point.
  const res = await page.request.post("/api/game", {
    data: {
      mode: "daily",
      simulationId: crypto.randomUUID(),
      goldIds: [],
      dailyDecisions: [],
      coachGoldId: "gregg-popovich-not-today",
      legacyUid: "e2e-daily-invalid",
    },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  const body = await res.json();
  expect(["DAILY_INVALID_COACH", "DAILY_INVALID_LINEUP", "VALIDATION_FAILURE"]).toContain(body.code);

  // The official attempt must still be available to a legitimate run.
  await draftDailyRoster(page);
  await page.getByRole("button", { name: new RegExp(cfg.coachOptions[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
});
