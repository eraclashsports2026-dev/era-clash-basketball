// ── The phone: compact pinned header, five compact rows, Hold that never rolls ──
// Owner-approved mobile correction (2026-09-09). Real touch taps against the
// local harness; nothing here calls a handler directly. The defect this pins:
// the sticky primary-action wrap used to be 172px tall and sat over the third
// and fourth Hold buttons, so a tap meant for HOLD fired ROLL 2 and the era
// reveal appeared "instead of" Hold.
import { test, expect } from "@playwright/test";

const fresh = async (page) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); localStorage.removeItem("ec_chaos_era_ack"); } catch (e) {}
  });
};
const state = (page) => page.locator(".ec-ta-stage").getAttribute("data-guided-state");
const stageIn = (page, st) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout: 60_000 });
const sub = (page) => page.locator(".ec-ta-title-sub").innerText();
const goldRows = (page) => page.locator('.ec-ta-team[data-team="gold"] .ec-pc.ec-pc--row');
const holdButtons = (page) => page.locator('.ec-ta-team[data-team="gold"] .ec-pc--row .ec-pc-action');
/** Count the roll decisions the browser actually sent. */
const countDecisions = (page) => {
  const seen = { decisions: 0, starts: 0 };
  page.on("request", (r) => {
    if (r.method() !== "POST" || !/\/api\/game/.test(r.url())) return;
    const body = r.postData() || "";
    if (/"chaosAction":"decide"/.test(body)) seen.decisions += 1;
    if (/"chaosAction":"start"/.test(body)) seen.starts += 1;
  });
  return seen;
};
const rollOnce = async (page) => {
  await page.getByRole("button", { name: /^ROLL/ }).tap();
  await stageIn(page, "DRAFTING");
  await expect(goldRows(page)).toHaveCount(5);
};

for (const [w, h] of [[430, 932], [390, 844]]) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test("the header is one compact row and stays pinned while the roster scrolls", async ({ page }) => {
      await fresh(page);
      await page.goto("/play/chaos");
      await stageIn(page, "EMPTY");
      const header = page.locator("header.ec-brand-header");
      const box = await header.boundingBox();
      expect(box.height).toBeLessThanOrEqual(72);
      expect(box.y).toBe(0);
      await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
      await expect(page.getByRole("button", { name: "EraClash Basketball home" })).toBeVisible();
      // no second row of Play / Fantasy / More, no Create free account row
      await expect(page.locator("header").getByRole("button", { name: /^Play/ })).toHaveCount(0);
      await expect(page.locator("header").getByText(/Create free account/)).toHaveCount(0);
      await rollOnce(page);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(300);
      const after = await header.boundingBox();
      expect(after.y).toBe(0);
      expect(after.height).toBeLessThanOrEqual(72);
      // the menu sheet layers above the header, traps focus, and returns it
      await page.getByRole("button", { name: "Menu" }).tap();
      const sheet = page.getByRole("dialog", { name: "Menu" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("menuitem", { name: /^Daily\b/ }).last()).toBeVisible();
      await expect(sheet.getByRole("menuitem", { name: /Create free account|Create account/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
    });

    test("every Hold control is reachable, holds only its player, and never rolls", async ({ page }) => {
      await fresh(page);
      const seen = countDecisions(page);
      await page.goto("/play/chaos");
      await stageIn(page, "EMPTY");
      await rollOnce(page);
      expect(await sub(page)).toMatch(/ROLL 1 OF 3/);
      const holds = holdButtons(page);
      await expect(holds).toHaveCount(5);
      for (let i = 0; i < 5; i++) {
        const b = holds.nth(i);
        await b.scrollIntoViewIfNeeded();
        const box = await b.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        // the element under the button's centre is the button — not the sticky action bar
        const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.closest(".ec-pc-action") ? "hold" : (e?.closest(".ec-ta-cta-wrap") ? "cta" : e?.className || "other"); }, [box.x + box.width / 2, box.y + box.height / 2]);
        expect(hit).toBe("hold");
      }
      // hold the third and the fourth — the two the old bar covered at 430px
      await holds.nth(2).tap();
      await holds.nth(3).tap();
      await expect(holds.nth(2)).toHaveAttribute("aria-pressed", "true");
      await expect(holds.nth(3)).toHaveAttribute("aria-pressed", "true");
      await expect(holds.nth(2)).toHaveText(/HELD/);
      await expect(holds.nth(0)).toHaveText(/^HOLD$/);
      expect(await goldRows(page).locator('[data-held="true"]').count() + await page.locator('.ec-pc--row[data-held="true"]').count()).toBeGreaterThan(0);
      expect(await state(page)).toBe("DRAFTING");
      expect(await sub(page)).toMatch(/ROLL 1 OF 3/);
      expect(seen.decisions).toBe(0);
      // Team Blue is read-only
      await page.getByRole("tab", { name: /TEAM BLUE/ }).tap();
      await expect(page.locator('.ec-ta-team[data-team="blue"] .ec-pc--row .ec-pc-action')).toHaveCount(0);
      await expect(page.locator('.ec-ta-team[data-team="blue"] .ec-pc--row .ec-pc-static')).toHaveCount(5);
      await page.getByRole("tab", { name: /TEAM GOLD/ }).tap();
    });

    test("a double tap on ROLL 2 is one roll; Roll 2 is drafting again; held players are kept", async ({ page }) => {
      await fresh(page);
      const seen = countDecisions(page);
      await page.goto("/play/chaos");
      await stageIn(page, "EMPTY");
      await rollOnce(page);
      expect(seen.starts).toBe(1);
      const holds = holdButtons(page);
      await holds.nth(1).tap();
      await holds.nth(4).tap();
      const heldNames = await page.locator('.ec-pc--row[data-held="true"] .ec-pc-name').allInnerTexts();
      expect(heldNames).toHaveLength(2);
      // a real double tap: two touch taps at the same point, no waiting between them
      const box = await page.getByRole("button", { name: /^ROLL 2/ }).boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator(".ec-ta-title-sub")).toHaveText(/ROLL 2 OF 3/, { timeout: 60_000 });
      await page.waitForTimeout(800);
      expect(seen.decisions).toBe(1);
      // no era interstitial: Roll 2 is drafting again, with holds, and no ADAPT TO ERA anywhere
      expect(await state(page)).toBe("DRAFTING");
      await expect(page.getByRole("button", { name: /ADAPT TO ERA/ })).toHaveCount(0);
      await expect(holdButtons(page)).toHaveCount(5);
      expect(seen.decisions).toBe(1);
      const keptNames = await page.locator('.ec-pc--row .ec-pc-kept').locator("xpath=..").allInnerTexts();
      for (const n of heldNames) expect(keptNames.some((k) => k.includes(n))).toBe(true);
    });

    test("the whole Clash completes on the phone and Run it back is offered", async ({ page }) => {
      await fresh(page);
      await page.goto("/play/chaos");
      await stageIn(page, "EMPTY");
      await rollOnce(page);
      await page.getByRole("button", { name: /^ROLL 2/ }).tap();
      await expect(page.locator(".ec-ta-title-sub")).toHaveText(/ROLL 2 OF 3/, { timeout: 60_000 });
      await page.getByRole("button", { name: /FINAL ROLL/ }).tap();
      await stageIn(page, "COACH_SELECT");
      // the era is not shown before the coach is set
      await expect(page.locator(".ec-era-reveal-id")).toHaveCount(0);
      await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 });
      // the three offers are rows the size of the player rows, with 44px controls (owner correction 2026-09-10)
      await expect(page.locator(".ec-coach-card--row")).toHaveCount(3);
      const geometry = await page.evaluate(() => {
        const h = (sel) => [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().height));
        const box = (sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
        return { player: h('.ec-ta-team[data-team="gold"] .ec-pc'), coach: h(".ec-coach-card"), controls: box(".ec-coach-action, .ec-coach-detail-toggle") };
      });
      // The row's base geometry is 56px + borders; a roster whose every name wraps makes all five rows 80px,
      // so compare with the shortest row OR the design minimum, whichever is smaller.
      const baseRow = Math.min(58, ...geometry.player);
      for (const h of geometry.coach) expect(Math.abs(h - baseRow)).toBeLessThanOrEqual(14);
      for (const [w, h] of geometry.controls) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
      await page.locator(".ec-coach-action:not([disabled])").first().tap();
      await page.getByRole("button", { name: /CONTINUE WITH COACH/ }).tap();
      await stageIn(page, "READY");
      // rolls → coach → era: the era is revealed here, with its rules, above RUN CLASH
      await expect(page.locator(".ec-era-reveal-id")).toHaveText(/^\d{4}s$/);
      await expect(page.locator(".ec-era-reveal-card")).toHaveCount(3);
      await page.getByRole("button", { name: /RUN CLASH/ }).tap();
      await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 150_000 });
      await stageIn(page, "RESULT");
      await expect(page.getByRole("button", { name: /Run it back/i })).toBeVisible();
      // rows stay compact on the result too, and no horizontal overflow anywhere
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  });
}

test.describe("shared header consumers", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("Home and Daily keep the compact header; desktop keeps the full header", async ({ page, browser }) => {
    await fresh(page);
    await page.goto("/play");
    const box = await page.locator("header.ec-brand-header").boundingBox();
    expect(box.height).toBeLessThanOrEqual(72);
    await expect(page.getByText(/start chaos clash/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Menu" }).tap();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("menuitem", { name: /^Daily\b(?! Clash)/ }).tap();
    await expect(page.getByText(/CLASH ACROSS ERAS|DAILY/i).first()).toBeVisible();
    expect((await page.locator("header.ec-brand-header").boundingBox()).height).toBeLessThanOrEqual(72);
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const d = await desk.newPage();
    await d.goto("/play");
    await expect(d.locator("header").getByRole("button", { name: /^Play/ })).toBeVisible();
    await expect(d.locator("header").getByRole("button", { name: "Menu" })).toHaveCount(0);
    await desk.close();
  });
});
