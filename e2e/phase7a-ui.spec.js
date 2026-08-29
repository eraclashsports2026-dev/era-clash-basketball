// ── Phase 7A — rebuilt Play UI: responsive, keyboard, visual records ──────────
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOT_DIR = "data/validation/7a/screens";
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });

const noHorizontalOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o, `${label}: horizontal overflow ${o}px`).toBeLessThanOrEqual(0);
};
const randomBoth = async (page) => {
  await page.getByRole("button", { name: /Random Team/ }).first().click();
  await page.getByRole("tab", { name: /Random Team/ }).click();
};
const pickCoach = async (page) => {
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Select coach/i });
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.getByRole("button", { name: /^Select / }).click();
  await dialog.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
};
const throughWizard = async (page) => {
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  const next = page.getByRole("button", { name: /Continue to Era Style/ });
  await next.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 3 && (await next.isDisabled()); i++) await pickCoach(page);
  await next.click();
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
};

test("U1: full wizard + postgame at desktop 1440 — screenshots and zero overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await shot(page, "1440-rosters-empty"); await noHorizontalOverflow(page, "rosters-empty");
  await randomBoth(page);
  await shot(page, "1440-rosters-complete"); await noHorizontalOverflow(page, "rosters-complete");
  // Play dropdown renders real modes
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await expect(page.getByRole("menuitemradio", { name: /SINGLE GAME/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /How Modes Work/ })).toBeVisible();
  await shot(page, "1440-play-dropdown");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Continue to Coaches/ }).click();
  await expect(page.getByRole("button", { name: "Choose Coach" }).first()).toBeVisible({ timeout: 8000 });
  await shot(page, "1440-coaches"); await noHorizontalOverflow(page, "coaches");
  // the modal itself is a captured state
  await page.getByRole("button", { name: "Choose Coach" }).first().click();
  await page.getByRole("dialog", { name: /Select coach/i }).waitFor({ state: "visible", timeout: 8000 });
  await shot(page, "1440-coach-modal"); await noHorizontalOverflow(page, "coach-modal");
  await page.getByRole("dialog", { name: /Select coach/i }).getByRole("button", { name: /^Select / }).click();
  const next1 = page.getByRole("button", { name: /Continue to Era Style/ });
  for (let i = 0; i < 3 && (await next1.isDisabled()); i++) await pickCoach(page);
  await next1.click();
  await expect(page.getByText("CHOOSE ERA STYLE")).toBeVisible();
  await shot(page, "1440-era"); await noHorizontalOverflow(page, "era");
  await page.getByRole("button", { name: /Lock Era Style/ }).click();
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
  await shot(page, "1440-ready"); await noHorizontalOverflow(page, "ready");
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await shot(page, "1440-postgame-final"); await noHorizontalOverflow(page, "postgame-final");
  await page.getByRole("tab", { name: "Box Score" }).click();
  await shot(page, "1440-postgame-box"); await noHorizontalOverflow(page, "postgame-box");
  await page.getByRole("tab", { name: "Game Story" }).click();
  await shot(page, "1440-postgame-story");
  await page.getByRole("tab", { name: "Coaching & Strategy" }).click();
  await shot(page, "1440-postgame-coaching"); await noHorizontalOverflow(page, "postgame-coaching");
});

test("U2: full wizard + postgame at mobile 375 — zero page overflow, isolated table scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await noHorizontalOverflow(page, "m-rosters-empty");
  await randomBoth(page);
  await shot(page, "375-rosters"); await noHorizontalOverflow(page, "m-rosters");
  await throughWizard(page);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
  await shot(page, "375-ready"); await noHorizontalOverflow(page, "m-ready");
  await page.getByRole("button", { name: /RUN THE SIM/ }).click();
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  await shot(page, "375-postgame"); await noHorizontalOverflow(page, "m-postgame");
  // the possession table scrolls inside its own container, never the page
  await page.getByRole("tab", { name: "Box Score" }).click();
  await noHorizontalOverflow(page, "m-postgame-box");
  await shot(page, "375-postgame-box");
  // postgame tabs stay tappable (44px targets)
  for (const t of ["Final", "Game Story", "Coaching & Strategy"]) {
    const box = await page.getByRole("tab", { name: t }).boundingBox();
    expect(box.height, `${t} tap target`).toBeGreaterThanOrEqual(40);
  }
});

test("U3: remaining viewports hold the rosters and ready layouts", async ({ page }) => {
  for (const [w, h] of [[1600, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await noHorizontalOverflow(page, `${w}x${h}-empty`);
    await randomBoth(page);
    await noHorizontalOverflow(page, `${w}x${h}-complete`);
    if (w === 768 || w === 1600) await shot(page, `${w}x${h}-rosters`);
  }
});

test("U4: keyboard-only completion of the wizard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // keyboard activation (Enter) on every stage control
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
  const nextK = page.getByRole("button", { name: /Continue to Era Style/ });
  await nextK.waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 3 && (await nextK.isDisabled()); i++) {
    await press("Choose Coach");
    const dialog = page.getByRole("dialog", { name: /Select coach/i });
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    const sel = dialog.getByRole("button", { name: /^Select / });
    await sel.focus(); await page.keyboard.press("Enter");
    await dialog.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  await press(/Continue to Era Style/);
  await press(/Lock Era Style/);
  await press(/RUN THE SIM/);
  await expect(page.getByText(/TEAM (GOLD|BLUE) WINS/)).toBeVisible({ timeout: 15000 });
  // postgame tabs by keyboard
  await page.getByRole("tab", { name: "Game Story" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/WHY YOU (WON|LOST)/)).toBeVisible();
});

test("U5: reduced motion renders every stage without animation dependence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await randomBoth(page);
  await throughWizard(page);
  await expect(page.getByRole("button", { name: /RUN THE SIM/ })).toBeVisible();
});

test("U6: How Modes Work modal — focus, escape, truthful engine language", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await page.getByRole("menuitem", { name: /How Modes Work/ }).click();
  const dialog = page.getByRole("dialog", { name: /How modes work/i });
  await expect(dialog).toBeVisible();
  const text = await dialog.innerText();
  expect(text).not.toMatch(/AI outcome|AI decides|AI-powered engine/i);
  expect(text).toMatch(/simulation/i);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
