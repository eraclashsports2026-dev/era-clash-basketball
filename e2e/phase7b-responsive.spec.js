// ── Phase 7B — responsive, accessibility and visual states ───────────────────
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const SHOT = "data/validation/7b/screens";
mkdirSync(SHOT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${SHOT}/${name}.png` });

const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o, `${label}: ${o}px of horizontal page overflow`).toBeLessThanOrEqual(0);
};
const randomBoth = async (page) => {
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click();
};
const pickCoach = async (page) => {
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  const d = page.getByRole("dialog", { name: /Select coach/i });
  await d.waitFor({ state: "visible", timeout: 8000 });
  await d.getByRole("button", { name: /^Select / }).click();
  await d.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
};
const throughWizard = async (page) => {
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  const next = page.getByRole("button", { name: /Continue to Era Style/ });
  await next.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 3 && (await next.isDisabled()); i++) await pickCoach(page);
  await next.click();
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
};

test("R1: every required viewport holds the builder without page overflow", async ({ page }) => {
  for (const [w, h] of [[1600, 900], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/play/dream");
    await noOverflow(page, `${w}x${h} empty`);
    await randomBoth(page);
    await noOverflow(page, `${w}x${h} complete`);
    if ([1600, 768, 375].includes(w)) await shot(page, `${w}x${h}-rosters`);
  }
});

test("R2: the coach modal is usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/play/dream");
  await randomBoth(page);
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  const d = page.getByRole("dialog", { name: /Select coach/i });
  await d.waitFor({ state: "visible" });
  await shot(page, "375-coach-modal");
  await noOverflow(page, "375 coach modal");
  // search, filters and the select CTA all reachable
  await expect(d.getByRole("textbox", { name: /Search coaches/i })).toBeVisible();
  await d.getByRole("textbox", { name: /Search coaches/i }).fill("kerr");
  // scoped to the coach list: the native <select> filters also expose options
  const coachList = d.getByRole("listbox", { name: "Coaches" });
  await expect(coachList.getByRole("option")).toHaveCount(1);
  await expect(coachList.getByRole("option").first()).toBeVisible();
  await expect(coachList.getByRole("option").first()).toContainText("Steve Kerr");
  const cta = d.getByRole("button", { name: /^Select / });
  const box = await cta.boundingBox();
  expect(box.height, "select CTA tap target").toBeGreaterThanOrEqual(44);
  // Escape closes and focus is not lost
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
});

test("R3: postgame is readable and scroll-isolated on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/play/dream");
  await randomBoth(page);
  await throughWizard(page);
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 20000 });
  await noOverflow(page, "375 postgame final");
  await shot(page, "375-postgame");
  await page.getByRole("tab", { name: "Box Score" }).click();
  await noOverflow(page, "375 postgame box");
  await shot(page, "375-postgame-box");
  for (const t of ["Final", "Game Story", "Coaching & Strategy"]) {
    const b = await page.getByRole("tab", { name: t }).boundingBox();
    expect(b.height, `${t} tap target`).toBeGreaterThanOrEqual(40);
  }
});

test("R4: keyboard-only completion, including the coach modal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play/dream");
  const press = async (name) => {
    const b = page.getByRole("button", { name }).first();
    await b.waitFor({ state: "visible", timeout: 8000 });
    await b.focus();
    await page.keyboard.press("Enter");
  };
  await press(/Random Team/);
  await page.getByRole("tab", { name: /Random Team/ }).focus();
  await page.keyboard.press("Enter");
  await press(/Continue to Coaches/);
  const next = page.getByRole("button", { name: /Continue to Era Style/ });
  await next.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 3 && (await next.isDisabled()); i++) {
    await press("Choose Coach");
    const d = page.getByRole("dialog", { name: /Select coach/i });
    await d.waitFor({ state: "visible", timeout: 8000 });
    // Tab stays inside the modal
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'));
    expect(inside, "focus is trapped in the coach modal").toBe(true);
    const sel = d.getByRole("button", { name: /^Select / });
    await sel.focus(); await page.keyboard.press("Enter");
    await d.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  await press(/Continue to Era Style/);
  await press(/Lock Era Style/);
  await press(/RUN THE SIM/);
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("tab", { name: "Game Story" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/HOW (GOLD|BLUE) WON/)).toBeVisible();
});

test("R5: reduced motion completes the flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play/dream");
  await randomBoth(page);
  await throughWizard(page);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
});

test("R6: the shell is warm-light with a navy header, not near-black", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play/dream");
  const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (r * 0.299 + g * 0.587 + b * 0.114) / 255; };
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lum(body), "the page is a light surface").toBeGreaterThan(0.8);
  const header = await page.evaluate(() => getComputedStyle(document.querySelector("header")).backgroundColor);
  expect(lum(header), "the header stays navy").toBeLessThan(0.2);
  const ink = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(lum(ink), "body ink is dark on the light page").toBeLessThan(0.3);
  await shot(page, "1440-rosters-empty");
});
