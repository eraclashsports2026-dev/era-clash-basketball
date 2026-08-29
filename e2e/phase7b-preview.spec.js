// ── Phase 7B — Candidate 3 preview surfaces ──────────────────────────────────
// These run against a harness with the preview engine ON, because coaching
// detail, key moments, matchup patterns and series continuity only exist on
// Candidate 3 — the engine the Wave 1 testers are actually using.
import { test, expect } from "@playwright/test";

const buildMatchup = async (page) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click();
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  const next = page.getByRole("button", { name: /Continue to Era Style/ });
  await next.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 3 && (await next.isDisabled()); i++) {
    await page.getByRole("button", { name: "Choose Coach" }).first().click();
    const d = page.getByRole("dialog", { name: /Select coach/i });
    await d.waitFor({ state: "visible", timeout: 8000 });
    await d.getByRole("button", { name: /^Select / }).click();
    await d.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  await next.click();
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
};
const runSim = async (page) => {
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 20000 });
};

test("P1: Ready and Postgame show the SAME pregame read", async ({ page }) => {
  await buildMatchup(page);
  // capture the read shown on the Ready screen
  await expect(page.getByText("MATCHUP PREVIEW")).toBeVisible({ timeout: 10000 });
  const readyText = await page.locator("body").innerText();
  const readRow = (t) => (t.match(/(Talent|Construction|Creation|Spacing|Defense|Rebounding)\n(Strong Gold Edge|Strong Blue Edge|Gold Edge|Blue Edge|Even)/g) ?? []);
  const before = readRow(readyText);
  expect(before.length, "the ready screen shows category reads").toBeGreaterThan(0);
  await runSim(page);
  await page.getByRole("tab", { name: "Coaching & Strategy" }).click();
  await expect(page.getByText("PRE-GAME READ")).toBeVisible();
  const after = readRow(await page.locator("body").innerText());
  expect(after, "the stored read is reused verbatim").toEqual(before);
});

test("P2: no raw engine numbers reach the user", async ({ page }) => {
  await buildMatchup(page);
  await runSim(page);
  for (const tab of ["Final", "Box Score", "Game Story", "Coaching & Strategy"]) {
    await page.getByRole("tab", { name: tab }).click();
    const body = await page.locator("body").innerText();
    expect(body, `${tab}: raw edge value leaked`).not.toMatch(/\b(Gold|Blue) \+\d+\b/);
    expect(body, `${tab}: team rating total leaked`).not.toMatch(/RATING\s+\d{3,4}/);
    expect(body, `${tab}: chemistry presented as an engine input`).not.toMatch(/unlock bonuses|Computed from ratings/i);
  }
});

test("P3: Coaching & Strategy shows real recorded coaching", async ({ page }) => {
  await buildMatchup(page);
  await runSim(page);
  await page.getByRole("tab", { name: "Coaching & Strategy" }).click();
  await expect(page.getByText("OPENING PLAN").first()).toBeVisible();
  await expect(page.getByText("DEFENSIVE SCHEME").first()).toBeVisible();
  await expect(page.getByText("IN-GAME ADJUSTMENTS").first()).toBeVisible();
  const body = await page.locator("body").innerText();
  // adjustments are either listed with their trigger, or explicitly absent
  expect(body).toMatch(/so the staff |No in-game adjustment was recorded/);
});

test("P4: key moments and matchup patterns are separate sections", async ({ page }) => {
  await buildMatchup(page);
  await runSim(page);
  await expect(page.getByText("KEY MOMENTS")).toBeVisible();
  const body = await page.locator("body").innerText();
  // moments carry a period, never an invented game clock
  expect(body).not.toMatch(/Q[1-4]\s+\d+:\d{2}/);
  const km = body.slice(body.indexOf("KEY MOMENTS"), body.indexOf("MATCHUP PATTERNS") > 0 ? body.indexOf("MATCHUP PATTERNS") : undefined);
  // a game-long count belongs to patterns, not moments
  expect(km).not.toMatch(/\b\d+ times for \d+ points\b/);
});

test("P5: a Candidate 3 result never offers a different-engine series", async ({ page }) => {
  await buildMatchup(page);
  await runSim(page);
  await expect(page.getByRole("button", { name: /Best of 7/i })).toHaveCount(0);
  await expect(page.getByText(/Best of 7 is unavailable in this preview/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Rematch/i }).first()).toBeVisible();
});

test("P6: one box score, no PF column", async ({ page }) => {
  await buildMatchup(page);
  await runSim(page);
  await page.getByRole("tab", { name: "Box Score" }).click();
  await expect(page.getByText("BOX SCORE", { exact: true })).toBeVisible();
  await expect(page.getByText("POSSESSION BOX SCORE")).toHaveCount(0);
  await expect(page.getByText("FULL BOX SCORE")).toHaveCount(0);
  const headers = await page.locator("th").allInnerTexts();
  expect(headers).not.toContain("PF");
  expect(headers).toContain("OREB");
  expect(headers).toContain("TO");
});
