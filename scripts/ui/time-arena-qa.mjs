#!/usr/bin/env node
// ── Time Arena QA: states, accessibility, performance ────────────────────────
//   node scripts/ui/time-arena-qa.mjs states        — the nine flow states
//   node scripts/ui/time-arena-qa.mjs accessibility — measured contrast and semantics
//   node scripts/ui/time-arena-qa.mjs performance   — bundle, assets, interaction
//
// The states are captured by driving a REAL draft, not the fixture: the fixture
// exists to freeze ONE state for geometry work, and a flow that only ever gets
// screenshotted in one state is a flow nobody has looked at.
//
// A real draft needs the real API, and `vite preview` serves static files only —
// so pass a DEPLOYED preview host to capture the state series, and this script
// opens an access session for it the same way a tester's link does:
//
//   node scripts/ui/time-arena-qa.mjs states https://<preview-host>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const MODE = process.argv[2] || "states";
const BASE = (process.argv[3] || "http://localhost:4176").replace(/\/$/, "");
const OUT = "data/validation/8c1";
const SHOTS = `${OUT}/screens`;
const VW = 1536, VH = 1024;

/** An access session for a deployed, gated preview. Keys never reach a URL. */
const openSession = async (context) => {
  if (!BASE.startsWith("https://")) return null;
  const f = ".preview-secrets/wave1-access-keys.json";
  if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
  const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
  const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  return k.testerId;
};

const withAccount = (page) => page.addInitScript(() => {
  try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA"); localStorage.removeItem("ec_chaos_run"); } catch (e) {}
});
const click = async (page, re, timeout = 20_000) => {
  const b = page.getByRole("button", { name: re }).first();
  await b.waitFor({ state: "visible", timeout });
  await b.click();
  await page.waitForTimeout(900);
};

const states = async (page) => {
  const captured = [];
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/state-${name}.png` });
    captured.push(name);
    console.log(`  captured state-${name}.png`);
  };

  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ec-ta-roster", { timeout: 45_000 });
  await shot("1-empty");

  // Every wait below is on something a PLAYER can see. The roll number is also
  // announced in a screen-reader live region, and waiting on that invisible
  // copy waits forever.
  // Phase 9B.3 guided flow: the words are the resolver's (src/components/arena/guidedState.js)
  // and the era reveal is a state of its own between Roll 2 and the final roll.
  await click(page, /^ROLL$/);
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  await shot("2-roll-1");
  await click(page, /^ROLL 2$/, 45_000);
  await page.locator(".ec-era-reveal-id").waitFor({ timeout: 45_000 });
  await shot("3-roll-2-era-revealed");
  await click(page, /ADAPT TO ERA/, 45_000);
  await click(page, /FINAL ROLL/, 45_000);
  await page.locator(".ec-coach-card").nth(2).waitFor({ timeout: 45_000 });
  await shot("4-final-roll-locked");

  await page.getByRole("button", { name: /^Select / }).first().click();
  await shot("5-coach-selected");
  await click(page, /CONTINUE WITH COACH/, 45_000);
  await page.getByRole("button", { name: /RUN CLASH/ }).waitFor({ timeout: 45_000 });
  await shot("6-ready");

  // Simulating is transient: capture it without waiting for the result.
  await page.getByRole("button", { name: /RUN CLASH/ }).first().click();
  await page.waitForTimeout(600);
  await shot("7-simulating");

  await page.locator(".ec-ta-score").waitFor({ timeout: 60_000 });
  await shot("8-result-dock");

  await click(page, /VIEW FULL REPORT/);
  await page.getByRole("dialog", { name: "Full postgame report" }).waitFor({ timeout: 20_000 });
  await shot("9-full-postgame");

  return { captured, viewport: `${VW}x${VH}` };
};

const accessibility = async (page) => {
  await page.goto(`${BASE}/dev/time-arena-reference`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ec-ta-roster .ec-pc");
  const a = await page.evaluate(() => {
    const lum = (c) => {
      const m = String(c).match(/[\d.]+/g);
      if (!m) return null;
      const [r, g, b] = m.map(Number).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const m = bg.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[3]) > 0.5)) return bg;
        n = n.parentElement;
      }
      return "rgb(3,7,13)";
    };
    const ratio = (fg, bg) => {
      const a = lum(fg), b = lum(bg);
      if (a === null || b === null) return null;
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
    };
    const sample = (sel, label) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        label, selector: sel,
        fontPx: +parseFloat(cs.fontSize).toFixed(1),
        contrast: ratio(cs.color, bgOf(el)),
      };
    };
    const texts = [
      sample(".ec-pc-name", "player name"),
      sample(".ec-pc-decade", "card decade"),
      sample(".ec-pc-ovr", "card OVR"),
      sample(".ec-intel-value", "intel value"),
      sample(".ec-intel-value--sub", "intel secondary"),
      sample(".ec-intel-label", "intel label"),
      sample(".ec-coach-blurb", "coach blurb"),
      sample(".ec-ta-cta-sub", "cta sub-line"),
      sample(".ec-ta-utility button", "utility link"),
      sample(".ec-ta-step-label", "roll step label"),
    ].filter(Boolean);
    return {
      texts,
      holdStatesAnnounced: [...document.querySelectorAll(".ec-pc-action")].every((b) => b.hasAttribute("aria-pressed")),
      teamIdentityInAccessibleName: [...document.querySelectorAll(".ec-pc")].every((c) => /Team (Gold|Blue)/.test(c.getAttribute("aria-label") || "")),
      lockGlyphsPresent: [...document.querySelectorAll('.ec-pc-action[data-on="true"]')].every((b) => /LOCKED/.test(b.textContent)),
      liveRegions: document.querySelectorAll("[aria-live]").length,
      landmarks: [...document.querySelectorAll("header,main,aside,nav,section[aria-label]")].map((e) => e.tagName.toLowerCase()),
      namesAreRealText: [...document.querySelectorAll(".ec-pc-name")].every((n) => (n.textContent || "").trim().length > 2),
      reducedMotion: [...document.styleSheets].some((s) => {
        try { return [...s.cssRules].some((r) => String(r.cssText).includes("prefers-reduced-motion")); } catch { return false; }
      }),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  // Keyboard: the first hold control must be reachable by tabbing, and holding
  // must work from the keyboard alone.
  let focusReachesBoard = false;
  let tabs = 0;
  for (; tabs < 60 && !focusReachesBoard; tabs++) {
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press("Tab");
    // eslint-disable-next-line no-await-in-loop
    focusReachesBoard = await page.evaluate(() => !!document.activeElement?.classList?.contains("ec-pc-action"));
  }
  const holdByKeyboard = focusReachesBoard
    ? await (async () => {
      const before = await page.evaluate(() => document.activeElement.getAttribute("aria-pressed"));
      await page.keyboard.press("Enter");
      const after = await page.evaluate(() => document.activeElement.getAttribute("aria-pressed"));
      return before !== after;
    })()
    : false;
  const focusVisible = await page.evaluate(() => {
    const b = document.querySelector(".ec-pc-action");
    b.focus();
    const cs = getComputedStyle(b);
    return cs.outlineStyle !== "none" || cs.boxShadow !== "none";
  });

  const failures = [];
  const PROSE = new Set(["intel value", "intel secondary", "coach blurb", "cta sub-line", "player name"]);
  for (const t of a.texts) {
    const floor = PROSE.has(t.label) ? 11.5 : 10;
    if (t.fontPx < floor) failures.push(`${t.label} is ${t.fontPx}px (floor ${floor}px)`);
    // AA: 4.5 for body text, 3.0 for large (>=18.66px or >=14px bold).
    const needs = t.fontPx >= 18.5 ? 3 : 4.5;
    if (t.contrast !== null && t.contrast < needs) failures.push(`${t.label} contrast ${t.contrast}:1 (needs ${needs}:1)`);
  }
  if (!a.holdStatesAnnounced) failures.push("hold state is not announced");
  if (!a.teamIdentityInAccessibleName) failures.push("team identity is colour-only");
  if (!a.namesAreRealText) failures.push("player names are not real text");
  if (!a.reducedMotion) failures.push("no reduced-motion support");
  if (a.horizontalOverflow !== 0) failures.push(`page overflows ${a.horizontalOverflow}px`);
  if (!focusVisible) failures.push("focus is not visible on a hold control");
  if (!focusReachesBoard) failures.push("the board is not reachable by keyboard");
  if (focusReachesBoard && !holdByKeyboard) failures.push("holding cannot be toggled from the keyboard");

  writeFileSync(`${OUT}/time-arena-accessibility-qa.json`, JSON.stringify({
    artifact: "time-arena-accessibility-qa", phase: "8C.1 — pixel-fidelity reconstruction",
    target: `${BASE}/dev/time-arena-reference`, viewport: `${VW}x${VH}`,
    measured: { ...a, focusVisible, focusReachesBoard, tabsToReachBoard: tabs, holdByKeyboard },
    standard: "WCAG 2.1 AA (4.5:1 body, 3:1 large), 44px touch targets on mobile, no hover-only information",
    failures, passed: failures.length === 0,
  }, null, 2) + "\n");
  console.log(failures.length ? `FAIL\n  - ${failures.join("\n  - ")}` : "accessibility: no failures");
  return { failures };
};

const performance = async (page) => {
  const assetDir = "dist/assets";
  const bundle = existsSync(assetDir) ? readdirSync(assetDir).map((f) => ({
    file: f, bytes: statSync(`${assetDir}/${f}`).size,
  })).sort((a, b) => b.bytes - a.bytes) : [];
  const svgDir = "src/ui/time-arena/assets";
  const svgs = readdirSync(svgDir).map((f) => ({ file: f, bytes: statSync(`${svgDir}/${f}`).size }));

  await page.goto(`${BASE}/dev/time-arena-reference`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ec-ta-roster .ec-pc");
  // Wait for the paint entry rather than sampling and hoping: on a warm run the
  // evaluate can land before the entry is recorded, and a null that coerces to 0
  // is a performance gate that passes because it measured NOTHING.
  const timing = await page.evaluate(async () => {
    const paintEntry = () => performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    for (let i = 0; i < 40 && !paintEntry(); i++) await new Promise((r) => setTimeout(r, 50));
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const paint = paintEntry();
    return {
      firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
      loadMs: Math.round(nav.loadEventEnd || 0),
      transferredKb: Math.round(performance.getEntriesByType("resource").reduce((n, r) => n + (r.transferSize || 0), 0) / 1024),
      images: performance.getEntriesByType("resource").filter((r) => /\.(svg|png|jpg|webp)/.test(r.name)).length,
    };
  });

  // Interaction cost: a hold toggle and a tab switch, measured in the page.
  const interaction = await page.evaluate(async () => {
    const time = async (fn) => { const t0 = performance.now(); fn(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t0); };
    const hold = document.querySelector(".ec-pc-action");
    const holdMs = hold ? await time(() => hold.click()) : null;
    const tab = document.querySelector('[role="tab"]');
    const tabMs = tab ? await time(() => tab.click()) : null;
    return { holdToggleMs: holdMs, dockTabMs: tabMs };
  });

  const rules = await page.evaluate(() => {
    const raster = [...document.querySelectorAll(".ec-ta, .ec-ta *")].some((e) => {
      const bg = getComputedStyle(e).backgroundImage;
      return /url\(/.test(bg) && !/^url\(["']?data:image\/svg/.test(bg.trim()) && !/\.svg/.test(bg);
    });
    const portraits = [...document.querySelectorAll(".ec-pc-portrait img")];
    return {
      noRasterBackground: !raster,
      noBackgroundVideo: document.querySelectorAll(".ec-ta video").length === 0,
      portraitsLazyLoaded: portraits.length === 0 || portraits.every((i) => i.loading === "lazy"),
      portraitImagesFound: portraits.length,
    };
  });

  const svgTotal = svgs.reduce((n, s) => n + s.bytes, 0);
  const failures = [];
  if (svgTotal > 24 * 1024) failures.push(`arena SVG kit is ${Math.round(svgTotal / 1024)}KB`);
  // A missing number is a failure to MEASURE, not a pass. Both of these used to
  // read `?? 0`, so an unrecorded paint or an unclickable hold scored perfectly.
  if (timing.firstContentfulPaintMs == null) failures.push("first paint was not measured");
  else if (timing.firstContentfulPaintMs > 2500) failures.push(`first paint ${timing.firstContentfulPaintMs}ms`);
  if (interaction.holdToggleMs == null) failures.push("hold toggle was not measured");
  for (const [k, v] of Object.entries(rules)) if (v === false) failures.push(`rule violated: ${k}`);
  else if (interaction.holdToggleMs > 120) failures.push(`hold toggle ${interaction.holdToggleMs}ms`);

  writeFileSync(`${OUT}/time-arena-performance-qa.json`, JSON.stringify({
    artifact: "time-arena-performance-qa", phase: "8C.1 — pixel-fidelity reconstruction",
    bundle: { files: bundle.slice(0, 6), totalKb: Math.round(bundle.reduce((n, b) => n + b.bytes, 0) / 1024) },
    arenaAssetKit: { files: svgs, totalKb: +(svgTotal / 1024).toFixed(1) },
    timing, interaction,
    // These three were hard-coded true and measured by nothing. An unmeasured
    // claim in an evidence file is worse than no claim, so they are measured now.
    rules,
    failures, passed: failures.length === 0,
  }, null, 2) + "\n");
  console.log(`performance: SVG kit ${(svgTotal / 1024).toFixed(1)}KB · bundle ${Math.round(bundle.reduce((n, b) => n + b.bytes, 0) / 1024)}KB · FCP ${timing.firstContentfulPaintMs}ms · hold ${interaction.holdToggleMs}ms`);
  if (failures.length) console.log(`  FAIL: ${failures.join("; ")}`);
  return { failures };
};

const run = async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const tester = await openSession(context);
  if (tester) console.log(`  access session opened for ${tester} on ${BASE}`);
  const page = await context.newPage();
  await withAccount(page);
  let out = {};
  if (MODE === "states") {
    out = await states(page);
    writeFileSync(`${OUT}/time-arena-state-screens.json`, JSON.stringify({
      artifact: "time-arena-state-screens", phase: "8C.1 — pixel-fidelity reconstruction",
      viewport: `${VW}x${VH}`, capturedFrom: "a real draft, not the fixture",
      target: BASE,
      note: BASE.startsWith("https://")
        ? "Captured against the deployed, access-gated preview: a real draft needs the real API, which a static local preview does not serve."
        : "Captured against a local server. A real draft needs a live API; `vite preview` serves static files only.",
      ...out,
    }, null, 2) + "\n");
  } else if (MODE === "accessibility") out = await accessibility(page);
  else if (MODE === "performance") out = await performance(page);
  else { console.error(`unknown mode ${MODE}`); process.exit(2); }
  await browser.close();
  process.exit((out.failures || []).length ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
