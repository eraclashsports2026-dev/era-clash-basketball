#!/usr/bin/env node
// ── Phase 9A.1 theme lab QA ──────────────────────────────────────────────────
//   node scripts/ui/themeLabQa.mjs <mode> [baseUrl]
// modes:
//   contracts        write the three token contracts + theme option docs data
//   lab              the four theme URLs render the six fixtures (smoke)
//   dom-invariant    one DOM: counts, text, aria, geometry equal across themes
//   color-balance    60–30–10 pixel audit per theme and fixture, semantic separated
//   accessibility    contrast per text pair + fatigue-risk factors per theme
//   responsive       every fixture at every viewport, per theme (screens + drift)
//   portrait         card frame against silhouette and uniform swatches
//   performance      bundle/CSS deltas, theme-switch cost, FCP/LCP/CLS
//   competitive      the differentiation matrix against the 82-0 review notes
//   contact-sheets   composed comparison sheets + theme-comparison-index.html
//   scorecard        objective fields from the artifacts; owner fields left blank
//
// The lab needs no API: the base URL is a static server of a theme-lab build
// (`npm run build:theme-lab` then `vite preview --port 4176`).
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { BASKETBALL_THEMES } from "../../src/theme/basketballThemes.js";
import { THEME_IDS, ARENA_KEYS, LOBBY_KEYS, READING_KEYS, ROOT_ALIAS_KEYS } from "../../src/theme/themeTypes.js";
import { themeTokenTable, validateTheme, getTheme, THEME_RESOLVER_VERSION } from "../../src/theme/themeResolver.js";
import { MASTER_BRAND, MASTER_BRAND_ROLES, ERA_FRACTURE, FOCUS_RING, TYPE_ROLES, MASTER_BRAND_VERSION } from "../../src/theme/masterBrandTokens.js";
import { SEMANTIC_ROLES, SEMANTIC_DEFAULTS, SEMANTIC_REGIONS, SEMANTIC_VERSION } from "../../src/theme/semanticTokens.js";
import { FIXTURE_IDS, FIXTURE_LABELS } from "../../src/ui/theme-lab/fixtureIds.js";

const MODE = process.argv[2] || "lab";
const BASE = (process.argv[3] || "http://localhost:4176").replace(/\/$/, "");
const OUT = "data/validation/9a1";
const SCREENS = `${OUT}/screens`;
const PHASE = "9A.1 — Basketball theme decision lab";
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const ok = (n, p, d = "") => { checks.push({ name: n, pass: !!p, detail: String(d) }); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };
const write = (name, body) => { fs.writeFileSync(`${OUT}/${name}`, JSON.stringify(body, null, 2) + "\n"); console.log(`wrote ${OUT}/${name}`); };
const json = (name) => (fs.existsSync(`${OUT}/${name}`) ? JSON.parse(fs.readFileSync(`${OUT}/${name}`, "utf8")) : null);

const VIEWPORTS = [[1536, 1024], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812]];
const PRIMARY = [[1536, 1024], [1440, 900], [390, 844]];
const READY = { lobby: ".ec-lobby .ec-mode-card", empty: ".ec-pc-empty", roll2: ".ec-ta-roster .ec-pc", coach: ".ec-coach-action", result: ".ec-ta-rail [role=tab]", postgame: ".pg-final-grid, [role=tabpanel]" };
const labUrl = (theme, fixture) => `${BASE}/dev/basketball-theme-lab?theme=${theme}&fixture=${fixture}&chrome=0`;

const hexRgb = (h) => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumRgb = ([r, g, b]) => { const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lumRgb(a), lumRgb(b)]; return +(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))).toFixed(2); };
const parseCss = (c) => { const m = String(c).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
const hue = (h) => { const [r, g, b] = hexRgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let hh; if (mx === r) hh = ((g - b) / (mx - mn)) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; return ((hh * 60) + 360) % 360; };
const sat = (h) => { const [r, g, b] = hexRgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

const open = async (browser, theme, fixture, [w, h], opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce", ...opts });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "Lab"); } catch (e) {} });
  await page.goto(labUrl(theme, fixture), { waitUntil: "networkidle" });
  await page.waitForSelector(READY[fixture], { timeout: 30_000 });
  await page.waitForTimeout(250);
  return { ctx, page };
};

// ── contracts ────────────────────────────────────────────────────────────────
if (MODE === "contracts") {
  write("master-brand-color-contract.json", {
    artifact: "master-brand-color-contract", phase: PHASE, status: "FROZEN", version: MASTER_BRAND_VERSION,
    source: "EraClash Logo Mk1 (public/brand/eraclash-logo-mk1.png): obsidian foundation, metallic platinum letterforms, a diagonal Era Fracture where gold meets cobalt",
    tokens: MASTER_BRAND, roles: MASTER_BRAND_ROLES, eraFracture: ERA_FRACTURE, focusRing: FOCUS_RING, typeRoles: TYPE_ROLES,
    layers: {
      1: "Master EraClash brand — shared by every product: EraClash, Basketball, Football, Baseball, Hockey, Soccer, Fantasy, Live, Anime, Comics",
      2: "Sport environment — Basketball's own surfaces, texture, secondary accent, lighting; must remain recognizably EraClash",
      3: "Semantic game colours — function, never decoration",
    },
    rule: "60–30–10: dominant 55–65%, secondary 25–35%, decorative accent 6–12%; semantic colours reported separately and counted as accent only when used decoratively",
    permanent: ["EraClash Logo Mk1", "obsidian foundation", "metallic platinum", "Fracture Gold", "Fracture Cobalt", "diagonal Era Fracture", "consistent navigation and interaction language"],
    forbidden: ["NBA logos or league marks", "a dominant orange CTA system resembling 82-0", "a universal red-and-blue league-style identity", "random cracking across surfaces"],
  });
  write("semantic-color-contract.json", {
    artifact: "semantic-color-contract", phase: PHASE, status: "FROZEN", version: SEMANTIC_VERSION,
    roles: SEMANTIC_ROLES, defaults: SEMANTIC_DEFAULTS, regionsForAudit: SEMANTIC_REGIONS,
    perTheme: Object.fromEntries(THEME_IDS.map((id) => [id, getTheme(id).semantic])),
    rule: "A theme may adjust luminance for contrast; it may never reverse a meaning. Team Gold is the user's side, Team Blue the Legend Rival, violet is Coach/Era, red is danger, green is success, platinum/graphite is neutral.",
    visibleLabels: { solo: { gold: "TEAM GOLD · YOUR FIVE", blue: "TEAM BLUE · LEGEND RIVAL" }, internal: ["cpu", "legendCpu", "blueRoster"], note: "Visible labels only; stored result sides are not remapped." },
  });
  write("basketball-theme-contracts.json", {
    artifact: "basketball-theme-contracts", phase: PHASE, status: "FROZEN", resolver: THEME_RESOLVER_VERSION,
    resolution: 'html[data-theme="<id>"] → --ec-t-* (reading), root aliases, --ec-l-* (lobby); html[data-theme="<id>"] .ec-arena-shell → --ec-a-* (arena). One React tree; no duplicated components; the default product renders unchanged without the attribute.',
    keys: { arena: ARENA_KEYS, lobby: LOBBY_KEYS, reading: READING_KEYS, rootAliases: ROOT_ALIAS_KEYS },
    themes: THEME_IDS.map((id) => ({ ...themeTokenTable(id), validation: validateTheme(getTheme(id)) })),
    restrictions: {
      "fracture-core": ["one central controlled Era Fracture", "no kintsugi cracks on every panel", "empty Team Blue cards never use Gold interaction buttons", "Coach Chaos remains violet"],
      "night-court": ["the arena may stay dark while detailed information uses warm ivory", "long-form Postgame must be measurably easier to read than the darkest themes"],
      "modern-court": ["the active gameplay surface must not feel like a productivity dashboard", "the Time Arena remains cinematic"],
      "hardwood-luxe": ["sandstone may not drift into bright orange", "CTAs may not resemble 82-0's orange system", "wood texture must remain subtle", "not every surface brown"],
    },
  });
  for (const id of THEME_IDS) ok(`${id} validates`, validateTheme(getTheme(id)).length === 0);
}

// ── lab smoke ────────────────────────────────────────────────────────────────
if (MODE === "lab") {
  const browser = await chromium.launch();
  for (const theme of THEME_IDS) {
    for (const fixture of FIXTURE_IDS) {
      try {
        const { ctx, page } = await open(browser, theme, fixture, [1536, 1024]);
        const m = await page.evaluate(() => ({
          theme: document.documentElement.dataset.theme,
          labTheme: document.querySelector("[data-theme-lab]")?.dataset.labTheme,
          strip: !!document.querySelector("[data-theme-lab-chrome]"),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        ok(`${theme}/${fixture} renders with data-theme applied, no strip, no overflow`, m.theme === theme && m.labTheme === theme && !m.strip && m.overflow <= 0, JSON.stringify(m));
        await ctx.close();
      } catch (e) { ok(`${theme}/${fixture} renders`, false, String(e.message).slice(0, 120)); }
    }
  }
  // Theme control is absent from the public product.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  const pub = await page.evaluate(() => ({ dataTheme: document.documentElement.dataset.theme || null, links: [...document.querySelectorAll("a[href]")].filter((a) => /theme-lab/.test(a.href)).length, text: /theme lab|choose your basketball theme/i.test(document.body.innerText) }));
  ok("the public product carries no data-theme, no lab link and no theme picker", pub.dataTheme === null && pub.links === 0 && !pub.text, JSON.stringify(pub));
  await browser.close();
  write("theme-lab-smoke.json", { artifact: "theme-lab-smoke", phase: PHASE, checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── DOM invariant ────────────────────────────────────────────────────────────
const signature = async (page) => page.evaluate(() => {
  const root = document.querySelector("[data-theme-lab]");
  const els = [...root.querySelectorAll("*")];
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const regions = {
    header: [...root.querySelectorAll("header")].map(box),
    stage: [...root.querySelectorAll(".ec-ta-stage")].map(box),
    rail: [...root.querySelectorAll(".ec-ta-rail")].map(box),
    cards: [...root.querySelectorAll(".ec-pc, .ec-pc-empty")].map(box),
    coach: [...root.querySelectorAll(".ec-coach-card")].map(box),
    cta: [...root.querySelectorAll(".ec-ta-cta")].map(box),
    modeCards: [...root.querySelectorAll(".ec-mode-card")].map(box),
    actions: [...root.querySelectorAll(".ec-mode-action")].map(box),
    tabs: [...root.querySelectorAll('[role="tab"]')].map(box),
    postgame: [...root.querySelectorAll(".pg-final-grid, .ec-arena-inset")].map(box),
  };
  const textBoxes = [...root.querySelectorAll("p, .ec-pc-name, .ec-mode-line, .ec-intel-value, .ec-coach-blurb, h1, h2, h3")].map(box);
  return {
    elements: els.length,
    tags: els.map((e) => e.tagName).join(","),
    text: root.innerText.replace(/\s+/g, " ").trim(),
    counts: { cards: root.querySelectorAll(".ec-pc").length, empty: root.querySelectorAll(".ec-pc-empty").length, coach: root.querySelectorAll(".ec-coach-card").length, tabs: root.querySelectorAll('[role="tab"]').length, buttons: root.querySelectorAll("button").length, links: root.querySelectorAll("a").length, modeCards: root.querySelectorAll(".ec-mode-card").length },
    aria: els.map((e) => `${e.getAttribute("role") || ""}|${e.getAttribute("aria-label") || ""}|${e.getAttribute("aria-live") || ""}|${e.getAttribute("aria-pressed") || ""}`).filter((s) => s !== "|||").join(";"),
    regions, textBoxes,
    fonts: [...new Set(els.slice(0, 400).map((e) => getComputedStyle(e).fontSize))].sort().join(","),
    docHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
const maxDelta = (a, b) => { if (!a || !b || a.length !== b.length) return Infinity; let m = 0; for (let i = 0; i < a.length; i++) for (let j = 0; j < 4; j++) m = Math.max(m, Math.abs(a[i][j] - b[i][j])); return m; };

if (MODE === "dom-invariant") {
  const browser = await chromium.launch();
  const report = [];
  for (const fixture of FIXTURE_IDS) {
    for (const vp of PRIMARY) {
      const sigs = {};
      for (const theme of THEME_IDS) { const { ctx, page } = await open(browser, theme, fixture, vp); sigs[theme] = await signature(page); await ctx.close(); }
      const c = sigs["fracture-core"];
      for (const theme of THEME_IDS.slice(1)) {
        const s = sigs[theme];
        const primaryDrift = Math.max(...Object.keys(c.regions).map((k) => maxDelta(c.regions[k], s.regions[k])).filter((v) => Number.isFinite(v)), 0);
        const textDrift = maxDelta(c.textBoxes, s.textBoxes);
        const row = {
          fixture, viewport: `${vp[0]}x${vp[1]}`, theme,
          sameElementCount: c.elements === s.elements, sameTags: c.tags === s.tags, sameText: c.text === s.text, sameAria: c.aria === s.aria,
          sameCounts: JSON.stringify(c.counts) === JSON.stringify(s.counts), sameFonts: c.fonts === s.fonts,
          primaryDriftPx: primaryDrift, textDriftPx: Number.isFinite(textDrift) ? textDrift : null, docHeightDelta: s.docHeight - c.docHeight,
        };
        report.push(row);
        ok(`${fixture} @${row.viewport} ${theme}: same DOM (elements ${s.elements}, text, aria, counts, fonts)`, row.sameElementCount && row.sameTags && row.sameText && row.sameAria && row.sameCounts && row.sameFonts);
        ok(`${fixture} @${row.viewport} ${theme}: geometry within ±2px primary / ±3px text`, primaryDrift <= 2 && (row.textDriftPx === null || row.textDriftPx <= 3), `primary ${primaryDrift}px · text ${row.textDriftPx}px · height Δ${row.docHeightDelta}`);
      }
    }
  }
  await browser.close();
  write("theme-dom-invariant.json", { artifact: "theme-dom-invariant", phase: PHASE, tolerance: { primaryPx: 2, textPx: 3 }, rows: report, checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── colour-area audit ────────────────────────────────────────────────────────
const classifyShot = async (page, pngPath, theme, semanticRects) => {
  const t = getTheme(theme);
  const palette = [];
  const add = (family, colors) => { for (const c of colors) palette.push({ family, rgb: hexRgb(c) }); };
  add("dominant", t.families.dominant.colors); add("secondary", t.families.secondary.colors); add("accent", t.families.accent.colors);
  add("teamGold", [t.semantic.teamGold, t.arena.gold, t.reading["gold-on-dark"], t.reading.gold]);
  add("teamBlue", [t.semantic.teamBlue, t.arena.blue, t.reading["blue-on-dark"], t.reading.blue]);
  add("coachViolet", [t.semantic.coachViolet, t.arena.coach, t.arena["coach-deep"]]);
  add("success", [t.semantic.success]); add("danger", [t.semantic.danger]);
  add("secondary", [t.reading.bg, t.reading["bg-card"], t.reading["bg-card-hover"], t.reading.text, t.reading["text-dim"], t.lobby.panel, t.lobby["panel-raised"], t.lobby.text]);
  const b64 = fs.readFileSync(pngPath).toString("base64");
  return page.evaluate(async ({ b64, palette, semanticRects }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const counts = {}; let total = 0, masked = 0, unclassified = 0;
    const inRects = (x, y, rects) => rects.some((r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]);
    const step = 2;
    for (let y = 0; y < cv.height; y += step) for (let x = 0; x < cv.width; x += step) {
      total++;
      if (inRects(x, y, semanticRects.mask)) { masked++; continue; }
      const i = (y * cv.width + x) * 4; const r = d[i], gg = d[i + 1], b = d[i + 2];
      let best = null, bd = Infinity;
      for (const p of palette) { const dd = (p.rgb[0] - r) ** 2 + (p.rgb[1] - gg) ** 2 + (p.rgb[2] - b) ** 2; if (dd < bd) { bd = dd; best = p; } }
      if (bd > 42 * 42) { unclassified++; continue; }
      let fam = best.family;
      if (fam === "teamGold" || fam === "teamBlue" || fam === "coachViolet") {
        const region = fam === "teamGold" ? semanticRects.teamGold : fam === "teamBlue" ? semanticRects.teamBlue : semanticRects.coachViolet;
        if (!inRects(x, y, region)) fam = `${fam}:decorative`;
      }
      counts[fam] = (counts[fam] || 0) + 1;
    }
    const pct = (n) => +((100 * n) / total).toFixed(2);
    const out = {}; for (const [k, v] of Object.entries(counts)) out[k] = pct(v);
    return { width: cv.width, height: cv.height, sampled: total, maskedPct: pct(masked), unclassifiedPct: pct(unclassified), families: out };
  }, { b64, palette, semanticRects });
};
const rectsOf = (page, selectors) => page.evaluate((sels) => [...document.querySelectorAll(sels.join(","))].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }).filter((r) => r[2] > 0 && r[3] > 0), selectors);

if (MODE === "color-balance") {
  fs.mkdirSync(`${SCREENS}/_audit`, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  for (const theme of THEME_IDS) {
    for (const fixture of FIXTURE_IDS) {
      for (const vp of [[1536, 1024], [390, 844]]) {
        const { ctx, page } = await open(browser, theme, fixture, vp);
        const shot = `${SCREENS}/_audit/${theme}-${fixture}-${vp[0]}.png`;
        await page.screenshot({ path: shot });
        const semanticRects = {
          mask: await rectsOf(page, [".ec-pc-portrait", ".ec-coach-portrait", ".ec-lobby-logo", '[role="img"]', "img"]),
          teamGold: await rectsOf(page, SEMANTIC_REGIONS.teamGold), teamBlue: await rectsOf(page, SEMANTIC_REGIONS.teamBlue), coachViolet: await rectsOf(page, SEMANTIC_REGIONS.coachViolet),
        };
        const c = await classifyShot(page, shot, theme, semanticRects);
        const f = c.families;
        const dominant = f.dominant || 0, secondary = f.secondary || 0;
        const decorativeAccent = (f.accent || 0) + (f["teamGold:decorative"] || 0) + (f["teamBlue:decorative"] || 0) + (f["coachViolet:decorative"] || 0);
        const semantic = { teamGold: f.teamGold || 0, teamBlue: f.teamBlue || 0, coachViolet: f.coachViolet || 0, success: f.success || 0, danger: f.danger || 0 };
        const t = getTheme(theme);
        const flags = [];
        if ((f["teamGold:decorative"] || 0) > 6) flags.push("GOLD_OVERUSED_DECORATIVELY");
        if ((f["teamBlue:decorative"] || 0) > 4) flags.push("COBALT_DECORATIVE");
        if ((f.coachViolet || 0) + (f["coachViolet:decorative"] || 0) > 12 && (fixture === "lobby" || fixture === "postgame")) flags.push("VIOLET_DOMINATES_NEUTRAL_CONTENT");
        if ((f.danger || 0) > 0.5 && fixture !== "postgame") flags.push("RED_OUTSIDE_WARNING");
        if (secondary < 20) flags.push("PLATINUM_UNDERREPRESENTED");
        const domHue = hue(t.families.dominant.colors[0]), accHue = hue(t.families.accent.colors[0]);
        if (domHue !== null && domHue >= 205 && domHue <= 235 && lumRgb(hexRgb(t.families.dominant.colors[0])) < 0.05 && accHue !== null && accHue >= 15 && accHue <= 38 && sat(t.families.accent.colors[0]) > 0.7) flags.push("RESEMBLES_82_0_NAVY_ORANGE");
        const row = { theme, fixture, viewport: `${vp[0]}x${vp[1]}`, dominantPct: dominant, secondaryPct: secondary, decorativeAccentPct: +decorativeAccent.toFixed(2), semanticPct: semantic, maskedPct: c.maskedPct, unclassifiedPct: c.unclassifiedPct, raw: f, flags };
        rows.push(row);
        console.log(`${theme.padEnd(14)} ${fixture.padEnd(9)} ${row.viewport.padEnd(9)} dom ${dominant}% sec ${secondary}% acc ${row.decorativeAccentPct}% | gold ${semantic.teamGold}% blue ${semantic.teamBlue}% violet ${semantic.coachViolet}% | uncl ${c.unclassifiedPct}% ${flags.join(",")}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
  // Per-theme summary over the primary desktop fixtures (lobby, roll2, result, postgame).
  const summary = THEME_IDS.map((theme) => {
    const rs = rows.filter((r) => r.theme === theme && r.viewport === "1536x1024");
    const avg = (k) => +(rs.reduce((n, r) => n + r[k], 0) / rs.length).toFixed(1);
    const dom = avg("dominantPct"), sec = avg("secondaryPct"), acc = avg("decorativeAccentPct");
    return {
      theme, dominantPct: dom, secondaryPct: sec, decorativeAccentPct: acc,
      withinTargets: { dominant: dom >= 55 && dom <= 65, secondary: sec >= 25 && sec <= 35, accent: acc >= 6 && acc <= 12 },
      flags: [...new Set(rs.flatMap((r) => r.flags))],
      note: "Averages across the six fixtures at 1536×1024; masked portrait zones excluded; anti-aliased pixels beyond the tolerance are 'unclassified' and never counted against a theme.",
    };
  });
  for (const s of summary) ok(`${s.theme}: audited (dom ${s.dominantPct}% · sec ${s.secondaryPct}% · acc ${s.decorativeAccentPct}%)${s.flags.length ? ` flags: ${s.flags.join(",")}` : ""}`, true);
  write("color-area-audit.json", { artifact: "color-area-audit", phase: PHASE, method: "nearest-palette pixel classification of full-page-viewport screenshots (stride 2, RGB distance ≤ 42), portrait/logo/image zones masked, team and coach colours counted semantic inside their DOM regions and decorative elsewhere", targets: { dominant: "55–65%", secondary: "25–35%", decorativeAccent: "6–12%" }, summary, rows });
}

// ── accessibility + fatigue ──────────────────────────────────────────────────
const textAudit = async (page, theme) => {
  const t = getTheme(theme);
  return page.evaluate(({ panelRaised, panel, lobbyRaised, lobbyPanel, ctaMid, teamGold, coach }) => {
    const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); if (a == null || b == null) return null; return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))).toFixed(2); };
    const hexRgb = (h) => { const n = parseInt(h.replace("#", ""), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        const m = cs.backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || Number(m[3]) > 0.6)) return cs.backgroundColor;
        // Gradient-backed controls: the primary action is the CTA gold, a held
        // player control is the team accent, a held staff control is violet.
        // A DISABLED primary action is the translucent plate over the stage, not the gold button.
        if (n.matches(".ec-ta-cta, .ec-mode-card--primary .ec-mode-action[data-intent='OPEN_MODE'], .ec-continue-cta") && !n.disabled) return hexRgb(ctaMid);
        if (n.matches('.ec-pc-action[data-on="true"]')) { const v = cs.getPropertyValue("--pc-accent").trim(); return v.startsWith("#") ? hexRgb(v) : (v || hexRgb(teamGold)); }
        if (n.matches('.ec-coach-action[data-on="true"]')) return hexRgb(coach);
        // Panels whose colour is a gradient of tokens: use the theme's panel token.
        const inLobby = !!n.closest(".ec-lobby");
        if (n.matches(".ec-pc, .ec-coach-card, .ec-mode-card, .ec-continue, .ec-panel-raised")) return hexRgb(inLobby ? lobbyRaised : panelRaised);
        if (n.matches(".ec-panel, .ec-intel, .ec-ta-utility, .ec-ta-stage")) return hexRgb(inLobby ? lobbyPanel : panel);
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const root = document.querySelector("[data-theme-lab]");
    const leaves = [...root.querySelectorAll("*")].filter((e) => {
      if (!e.childNodes.length) return false;
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (own.length < 2) return false;
      const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(e);
      // Excluded from the TEXT audit: gradient-clipped display text (the VS
      // mark) and monogram glyphs inside silhouettes — decorative, aria-hidden
      // or inside role="img", and never the reading path.
      if ((cs.webkitBackgroundClip || cs.backgroundClip) === "text" || e.closest('[role="img"], [aria-hidden="true"]')) return false;
      return cs.visibility !== "hidden" && cs.opacity !== "0" && !e.closest(".sr-only");
    });
    const pairs = leaves.map((e) => {
      const cs = getComputedStyle(e); const fontPx = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = fontPx >= 24 || (fontPx >= 18.66 && bold);
      const c = ratio(cs.color, bgOf(e));
      return { text: (e.textContent || "").trim().slice(0, 40), fontPx: +fontPx.toFixed(1), large, contrast: c, pass: c != null && c >= (large ? 3 : 4.5), caps: cs.textTransform === "uppercase" || /^[A-Z0-9 ·—'.:&/-]{6,}$/.test((e.textContent || "").trim()), glowNear: /rgba?\([^)]*\)\s*\d+px\s*\d+px\s*(\d+)px/.test(cs.textShadow) };
    }).filter((p) => p.contrast != null);
    const paragraphs = [...root.querySelectorAll("p")].map((p) => ({ chars: (p.textContent || "").length, lineHeight: parseFloat(getComputedStyle(p).lineHeight) / parseFloat(getComputedStyle(p).fontSize), fontPx: parseFloat(getComputedStyle(p).fontSize), widthPx: Math.round(p.getBoundingClientRect().width), darkBg: (lum(bgOf(p)) ?? 1) < 0.15 }));
    const glows = [...root.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e).boxShadow; const m = s.match(/\)\s*(-?\d+)px\s*(-?\d+)px\s*(\d+)px/); return m && Number(m[3]) >= 14 && !/rgba\(0, 0, 0/.test(s); }).length;
    const bordered = [...root.querySelectorAll("*")].filter((e) => { const cs = getComputedStyle(e); return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && !/rgba\(0, 0, 0, 0\)/.test(cs.borderTopColor); }).length;
    const area = Math.max(1, root.getBoundingClientRect().width * document.documentElement.scrollHeight);
    const focusable = [...root.querySelectorAll("button, a[href], [tabindex]")].slice(0, 5);
    return {
      pairs, textCount: pairs.length, passCount: pairs.filter((p) => p.pass).length,
      avgContrast: +(pairs.reduce((n, p) => n + p.contrast, 0) / Math.max(1, pairs.length)).toFixed(2),
      lowestPassing: pairs.filter((p) => p.pass).sort((a, b) => a.contrast - b.contrast)[0] || null,
      failing: pairs.filter((p) => !p.pass).slice(0, 12),
      lowContrastShare: +(pairs.filter((p) => p.contrast < 4.5).length / Math.max(1, pairs.length)).toFixed(3),
      capsShare: +(pairs.filter((p) => p.caps).length / Math.max(1, pairs.length)).toFixed(3),
      glowNearText: pairs.filter((p) => p.glowNear).length, glows, borderedPer100k: +((bordered / area) * 100_000).toFixed(2),
      paragraphs: { count: paragraphs.length, longOnDark: paragraphs.filter((p) => p.chars > 300 && p.darkBg).length, maxChars: Math.max(0, ...paragraphs.map((p) => p.chars)), avgLineHeight: +(paragraphs.reduce((n, p) => n + (p.lineHeight || 0), 0) / Math.max(1, paragraphs.length)).toFixed(2), minFontPx: Math.min(99, ...paragraphs.map((p) => p.fontPx)), maxWidthPx: Math.max(0, ...paragraphs.map((p) => p.widthPx)) },
      focusVisible: focusable.length > 0,
    };
  }, { panelRaised: t.arena["panel-raised"], panel: t.arena.panel, lobbyRaised: t.lobby["panel-raised"], lobbyPanel: t.lobby.panel, ctaMid: t.arena["cta-mid"], teamGold: t.arena.gold, coach: t.arena.coach });
};

if (MODE === "accessibility") {
  const browser = await chromium.launch();
  const perTheme = {};
  for (const theme of THEME_IDS) {
    const t = getTheme(theme);
    const fixtures = {};
    for (const fixture of FIXTURE_IDS) for (const vp of [[1536, 1024], [390, 844]]) {
      const { ctx, page } = await open(browser, theme, fixture, vp);
      const a = await textAudit(page, theme);
      // Focus ring: tab to the first control and read the outline.
      await page.keyboard.press("Tab");
      const outline = await page.evaluate(() => { const e = document.activeElement; const cs = e ? getComputedStyle(e) : null; return cs ? { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor } : null; });
      fixtures[`${fixture}@${vp[0]}`] = { ...a, pairs: undefined, focusOutline: outline };
      ok(`${theme} ${fixture}@${vp[0]}: ${a.passCount}/${a.textCount} text pairs pass AA (lowest passing ${a.lowestPassing?.contrast}:1)`, a.passCount === a.textCount, a.failing.map((f) => `"${f.text}" ${f.contrast}:1 ${f.fontPx}px`).join(" · "));
      await ctx.close();
    }
    // Token-pair audit — the specification's named pairs, computed from the tokens.
    const rgb = hexRgb; const pair = (a, b) => contrast(rgb(a), rgb(b));
    const named = {
      "body text on arena panel": pair(t.arena.text, t.arena.panel), "muted text on arena panel": pair(t.arena["text-muted"], t.arena.panel),
      "body text on reading card": pair(t.reading.text, t.reading["bg-card"]), "muted text on reading card": pair(t.reading["text-muted"], t.reading["bg-card"]),
      "CTA ink on CTA": pair(t.arena["cta-ink"], t.arena["cta-mid"]), "button ink on gold (reading)": pair(t.reading["on-gold"], t.reading.gold),
      "gold on dark": pair(t.arena.gold, t.arena.panel), "blue on dark": pair(t.arena.blue, t.arena.panel), "violet on dark": pair(t.arena.coach, t.arena.panel),
      "gold on ivory/reading": pair(t.reading.gold, t.reading["bg-card"]), "blue on ivory/reading": pair(t.reading.blue, t.reading["bg-card"]),
      "muted text disabled (0.6 opacity approximated)": +(pair(t.arena["text-muted"], t.arena.panel) * 0.6).toFixed(2),
      "lobby text on lobby card": pair(t.lobby.text, t.lobby["panel-raised"]), "lobby muted on lobby card": pair(t.lobby["text-muted"], t.lobby["panel-raised"]),
    };
    // Fatigue factors (objective, thresholded; not a substitute for preference).
    const color = json("color-area-audit.json");
    const dark = color ? color.summary.find((s) => s.theme === theme) : null;
    const desktop = Object.entries(fixtures).filter(([k]) => k.endsWith("@1536")).map(([, v]) => v);
    const avg = (f) => +(desktop.reduce((n, v) => n + f(v), 0) / desktop.length).toFixed(3);
    const factors = {
      nearBlackAreaPct: dark && lumRgb(hexRgb(t.families.dominant.colors[0])) < 0.02 ? dark.dominantPct : 0,
      lowContrastSecondaryShare: avg((v) => v.lowContrastShare),
      glowCount: Math.round(avg((v) => v.glows)), glowNearText: Math.round(avg((v) => v.glowNearText)),
      borderedPer100kPx: avg((v) => v.borderedPer100k),
      longParagraphsOnDark: Math.round(desktop.reduce((n, v) => n + v.paragraphs.longOnDark, 0)),
      saturatedAccentPct: dark ? dark.decorativeAccentPct : null,
      capsShare: avg((v) => v.capsShare),
    };
    const hits = [factors.nearBlackAreaPct > 55, factors.lowContrastSecondaryShare > 0.05, factors.glowCount > 6, factors.borderedPer100kPx > 4, factors.longParagraphsOnDark > 2, (factors.saturatedAccentPct || 0) > 12].filter(Boolean).length;
    const fatigueRisk = hits >= 3 ? "HIGH" : hits >= 1 ? "MODERATE" : "LOW";
    perTheme[theme] = { namedPairs: named, namedPairsAllPassAA: Object.entries(named).filter(([k]) => !/disabled/.test(k)).every(([, v]) => v >= 4.5), fixtures, fatigue: { factors, thresholdHits: hits, risk: fatigueRisk, thresholds: { nearBlackAreaPct: 55, lowContrastSecondaryShare: 0.05, glowCount: 6, borderedPer100kPx: 4, longParagraphsOnDark: 2, saturatedAccentPct: 12 } } };
    ok(`${theme}: every named token pair passes AA`, perTheme[theme].namedPairsAllPassAA, Object.entries(named).filter(([, v]) => v < 4.5).map(([k, v]) => `${k} ${v}`).join("; "));
    console.log(`${theme}: fatigue risk ${fatigueRisk} (${hits} factors) — ${JSON.stringify(factors)}`);
  }
  // Long-form readability: Night Court vs the darkest theme, measured on the postgame.
  const lf = Object.fromEntries(THEME_IDS.map((id) => [id, perTheme[id].fixtures["postgame@1536"]]));
  await browser.close();
  write("theme-accessibility-and-fatigue.json", { artifact: "theme-accessibility-and-fatigue", phase: PHASE, standard: "WCAG 2.1 AA: 4.5:1 normal text, 3:1 large (≥24px or ≥18.66px bold)", method: "every visible text leaf in the lab's product region, colour against the nearest opaque ancestor background (token panels resolved by theme); focus ring read after one Tab", perTheme, longFormPostgame: Object.fromEntries(Object.entries(lf).map(([k, v]) => [k, { avgContrast: v.avgContrast, lowestPassing: v.lowestPassing?.contrast, paragraphs: v.paragraphs, lowContrastShare: v.lowContrastShare }])), note: "Fatigue risk is a thresholded measurement, not a preference. Human review decides.", checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── responsive screens ───────────────────────────────────────────────────────
if (MODE === "responsive") {
  const browser = await chromium.launch();
  const rows = [];
  for (const theme of THEME_IDS) {
    fs.mkdirSync(`${SCREENS}/${theme}`, { recursive: true });
    for (const fixture of FIXTURE_IDS) for (const vp of VIEWPORTS) {
      const { ctx, page } = await open(browser, theme, fixture, vp, { hasTouch: vp[0] < 800, isMobile: vp[0] < 800 });
      const m = await page.evaluate(() => {
        const h = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height));
        // Primary controls carry the 44px floor (the 8C.1 contract plus the lobby's actions).
        const primary = h(".ec-pc-action, .ec-coach-action, .ec-ta-cta, .ec-mode-action, .ec-continue-cta, .ec-continue-quiet, .ec-coach-detail-toggle");
        // Secondary controls are reported: identical in every theme, they are product geometry, not theme.
        const secondary = h('[role="tab"], .ec-intel button, .ec-ta-utility button').filter((v) => v < 44);
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, docHeight: document.documentElement.scrollHeight, minTap: Math.min(999, ...primary), secondaryBelow44: secondary.length ? Math.min(...secondary) : null };
      });
      await page.screenshot({ path: `${SCREENS}/${theme}/${fixture}-${vp[0]}x${vp[1]}.png` });
      rows.push({ theme, fixture, viewport: `${vp[0]}x${vp[1]}`, ...m });
      await ctx.close();
    }
  }
  await browser.close();
  // Geometry between themes per viewport: doc heights must agree (±3) and no overflow anywhere.
  for (const fixture of FIXTURE_IDS) for (const vp of VIEWPORTS) {
    const rs = rows.filter((r) => r.fixture === fixture && r.viewport === `${vp[0]}x${vp[1]}`);
    const heights = rs.map((r) => r.docHeight);
    ok(`${fixture} @${vp[0]}x${vp[1]}: no overflow in any theme, heights agree (${heights.join("/")})`, rs.every((r) => r.overflow <= 0) && Math.max(...heights) - Math.min(...heights) <= 3);
    if (vp[0] < 800) ok(`${fixture} @${vp[0]}x${vp[1]}: primary touch targets ≥ 44px in every theme`, rs.every((r) => r.minTap >= 44 || r.minTap === 999), `${rs.map((r) => r.minTap).join("/")}${rs[0].secondaryBelow44 ? ` · secondary controls as small as ${rs[0].secondaryBelow44}px in every theme (product geometry, unchanged by theme)` : ""}`);
  }
  write("theme-responsive-qa.json", { artifact: "theme-responsive-qa", phase: PHASE, viewports: VIEWPORTS.map(([w, h]) => `${w}x${h}`), screenshots: rows.length, rows, checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── portrait compatibility ───────────────────────────────────────────────────
if (MODE === "portrait") {
  const browser = await chromium.launch();
  const swatches = { lightUniform: "#F2F2F2", darkUniform: "#141414", saturatedUniformRed: "#E10600", saturatedUniformBlue: "#1D428A", historicalBW: "#8A8A8A" };
  const perTheme = {};
  for (const theme of THEME_IDS) {
    const { ctx, page } = await open(browser, theme, "roll2", [1536, 1024]);
    const m = await page.evaluate(() => {
      const card = document.querySelector('.ec-pc[data-team="gold"]'), blue = document.querySelector('.ec-pc[data-team="blue"]');
      const zone = card.querySelector(".ec-pc-portrait"), fig = card.querySelector(".ec-pc-figure");
      const cs = (e) => getComputedStyle(e);
      const img = document.querySelector(".ec-pc-portrait img");
      return {
        zoneBg: cs(zone).backgroundColor, zoneBgImage: cs(zone).backgroundImage.slice(0, 80), cardBorder: cs(card).borderTopColor, blueBorder: cs(blue).borderTopColor,
        figureBg: fig ? cs(fig).backgroundColor : null, figureOpacity: fig ? cs(fig).opacity : null,
        imgFilter: img ? cs(img).filter : "none (no approved portrait rendered)",
        zoneSize: [Math.round(zone.getBoundingClientRect().width), Math.round(zone.getBoundingClientRect().height)],
        accent: cs(card).getPropertyValue("--pc-accent").trim(),
      };
    });
    const t = getTheme(theme);
    const frame = hexRgb(t.arena["panel-raised"]);
    const results = Object.fromEntries(Object.entries(swatches).map(([k, hexv]) => { const c = contrast(hexRgb(hexv), frame); return [k, { contrastToFrame: c, blendRisk: c < 1.5 }]; }));
    const silhouetteVsFrame = contrast(parseCss(m.figureBg) || hexRgb("#000000"), frame);
    perTheme[theme] = { measured: m, frameToken: t.arena["panel-raised"], uniformSwatches: results, silhouetteContrastToFrame: silhouetteVsFrame, cropPerTheme: "same (portrait zone geometry is a frozen token; the theme touches only colour)", skinToneFilter: m.imgFilter, };
    ok(`${theme}: portrait zone is the frozen size and no theme applies a colour filter to a portrait`, m.zoneSize[1] > 150 && !/hue-rotate|sepia|saturate\((0|0\.\d)\)/.test(m.imgFilter));
    ok(`${theme}: the silhouette fallback (the shipped state) reads against the frame; uniform swatches measured`, silhouetteVsFrame >= 1.2, `silhouette ${silhouetteVsFrame} · ${Object.entries(results).map(([k, r]) => `${k} ${r.contrastToFrame}${r.blendRisk ? " (blend risk)" : ""}`).join(" · ")}`);
    await ctx.close();
  }
  await browser.close();
  write("portrait-theme-compatibility.json", { artifact: "portrait-theme-compatibility", phase: PHASE,
    registry: { approvedPortraits: JSON.parse(fs.readFileSync("src/images/approved.json", "utf8")).images.length, note: "src/images/approved.json holds no approved portrait, so every card renders the premium silhouette fallback. No likeness is generated for this audit (repository policy: no invented likenesses); uniform compatibility is measured against flat swatches at the card frame." },
    swatches, perTheme, geometryUnchanged: true,
    limitation: "Facial-detail and skin-tone checks require an approved photorealistic portrait, which does not exist in the registry — recorded as EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK (the silhouette).",
    checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── performance ──────────────────────────────────────────────────────────────
if (MODE === "performance") {
  const assets = fs.readdirSync("dist/assets").map((f) => ({ file: f, bytes: fs.statSync(`dist/assets/${f}`).size }));
  const themeCssBytes = fs.statSync("src/theme/basketball-themes.css").size;
  const labChunk = assets.find((a) => /ThemeLab/.test(a.file));
  const browser = await chromium.launch();
  const perTheme = {};
  for (const theme of THEME_IDS) {
    const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
    const page = await ctx.newPage();
    await page.goto(labUrl(theme, "roll2"), { waitUntil: "networkidle" });
    await page.waitForSelector(READY.roll2);
    const t = await page.evaluate(async () => {
      const paint = () => performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
      for (let i = 0; i < 40 && !paint(); i++) await new Promise((r) => setTimeout(r, 50));
      const lcp = await new Promise((res) => { let last = null; try { const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e; }); po.observe({ type: "largest-contentful-paint", buffered: true }); setTimeout(() => { po.disconnect(); res(last ? Math.round(last.startTime) : null); }, 300); } catch { res(null); } });
      const cls = await new Promise((res) => { let sum = 0; try { const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) sum += e.value; }); po.observe({ type: "layout-shift", buffered: true }); setTimeout(() => { po.disconnect(); res(+sum.toFixed(4)); }, 300); } catch { res(null); } });
      const time = async (fn) => { const t0 = performance.now(); fn(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return +(performance.now() - t0).toFixed(1); };
      const cur = document.documentElement.dataset.theme;
      const switches = [];
      for (const id of ["fracture-core", "night-court", "modern-court", "hardwood-luxe"]) switches.push(await time(() => { document.documentElement.dataset.theme = id; void document.body.offsetHeight; }));
      document.documentElement.dataset.theme = cur;
      return { fcpMs: paint() ? Math.round(paint().startTime) : null, lcpMs: lcp, cls, themeSwitchMs: switches, transferredKb: Math.round(performance.getEntriesByType("resource").reduce((n, r) => n + (r.transferSize || 0), 0) / 1024) };
    });
    perTheme[theme] = t;
    ok(`${theme}: first paint ${t.fcpMs}ms, LCP ${t.lcpMs}ms, CLS ${t.cls}, theme switch ≤ ${Math.max(...t.themeSwitchMs)}ms`, t.fcpMs != null && t.fcpMs < 2500 && (t.cls ?? 0) < 0.1 && Math.max(...t.themeSwitchMs) < 200);
    await ctx.close();
  }
  await browser.close();
  const raster = fs.readdirSync("public/brand").concat(fs.readdirSync("src/ui/time-arena/assets")).filter((f) => /\.(png|jpg|webp)$/.test(f));
  ok("no theme-specific raster, video or remote font was added", raster.length === 1 && !fs.existsSync("public/themes"), raster.join(","));
  write("theme-performance-qa.json", { artifact: "theme-performance-qa", phase: PHASE, build: "theme-lab build (VITE_EC_THEME_LAB=1) — production compiles the lab out", themeCssBytes, labChunk, mainBundleBytes: assets.filter((a) => /^index-.*\.js$/.test(a.file)).map((a) => a.bytes), cssBundleBytes: assets.filter((a) => /\.css$/.test(a.file)).map((a) => a.bytes), perTheme, checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── competitive differentiation ──────────────────────────────────────────────
if (MODE === "competitive") {
  const competitor = { name: "82-0 (owner review, 26 screenshots, 2026-09-02; assets not stored)", dominantBackground: "dark navy (#0b1220-ish, hue ≈ 220°)", primaryCta: "bright saturated orange (hue ≈ 25°) with orange outlines", panelSystem: "navy cards, thin borders", accentAllocation: "orange everywhere: tabs, badges, CTAs, outlines, links", navigation: "top bar, orange active underline, 'Get the App' pill", cardLanguage: "rounded navy cards with orange CTA button", typography: "geometric sans, orange caps labels", resultPresentation: "projected record + letter grade + points", silhouette: "dark navy + orange" };
  const rows = THEME_IDS.map((id) => {
    const t = getTheme(id);
    const dom = t.families.dominant.colors[0], acc = t.families.accent.colors[0], cta = t.arena["cta-mid"];
    const domHue = hue(dom), accHue = hue(acc), ctaHue = hue(cta);
    const navyDominant = domHue !== null && domHue >= 205 && domHue <= 235 && lumRgb(hexRgb(dom)) < 0.06 && sat(dom) > 0.35;
    const orangeCta = ctaHue !== null && ctaHue >= 15 && ctaHue < 36 && sat(cta) > 0.7;
    const orangeAccent = accHue !== null && accHue >= 15 && accHue < 36 && sat(acc) > 0.6;
    const risks = [];
    if (navyDominant) risks.push("dominant background is a saturated navy like 82-0's");
    if (orangeCta) risks.push("CTA hue sits in 82-0's orange band");
    if (orangeAccent) risks.push("accent hue sits in 82-0's orange band");
    if (id === "hardwood-luxe") risks.push("warm sandstone/gold family shares warmth with an orange system — kept desaturated (sandstone saturation 0.41) and gold-hued (CTA hue ≈ 41°); watch any brightening");
    if (id === "fracture-core") risks.push("dark ground + warm CTA is the same STRUCTURE as 82-0 (dark + warm button); differentiation rests on obsidian-not-navy, gold-not-orange, platinum structure and the cobalt fracture");
    const classification = navyDominant && orangeCta ? "TOO SIMILAR" : risks.length ? "DISTINCT WITH RISKS" : "CLEARLY DISTINCT";
    return { theme: id, dominantBackground: `${t.families.dominant.name} ${dom} (hue ${domHue === null ? "neutral" : Math.round(domHue) + "°"}, lum ${lumRgb(hexRgb(dom)).toFixed(3)})`, primaryCta: `${cta} (hue ${Math.round(ctaHue)}°, ink ${t.arena["cta-ink"]})`, panelSystem: `${t.arena.panel} / ${t.arena["panel-raised"]} with ${t.arena.border} borders`, accentAllocation: `${t.families.accent.name} ${acc} — one dominant glow per state; fracture on selected/transition states only`, navigation: `header ${t.arena.header}; gold active state; no app-store pill`, cardLanguage: "fixed-geometry trading cards, team-owned accent, worded states", typography: "condensed display + system sans; platinum/ink, never orange", resultPresentation: "final score, MVP, Story first; no projected record, no letter grade", silhouette: `${t.families.dominant.name} + ${t.families.secondary.name} + ${t.families.accent.name}`, nbaMarks: "none (no league logos, no official-league palette; Team Gold/Blue are semantic, not a red-white-blue identity)", risks, classification };
  });
  for (const r of rows) ok(`${r.theme}: ${r.classification}`, r.classification !== "TOO SIMILAR", r.risks.join("; "));
  write("competitive-color-differentiation.json", { artifact: "competitive-color-differentiation", phase: PHASE, competitor, matrix: rows, rule: "A theme fails only when it primarily reads as dark navy + bright orange CTA + orange outlines, or as official NBA red + blue + league marks. One shared colour never fails a theme alone.", checks: checks.length, passed: checks.filter((c) => c.pass).length, results: checks });
}

// ── contact sheets + comparison index ────────────────────────────────────────
if (MODE === "contact-sheets") {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  fs.mkdirSync(`${SCREENS}/comparisons`, { recursive: true });
  const sheet = async (name, fixture, vp, cols) => {
    const [w, h] = vp;
    const scale = cols === 4 ? 0.5 : 0.48;
    const tw = Math.round(w * scale), th = Math.round(h * scale);
    const gap = 16, label = 34;
    const rowsN = Math.ceil(4 / cols);
    const W = cols * tw + (cols + 1) * gap, H = rowsN * (th + label) + (rowsN + 1) * gap;
    const tiles = THEME_IDS.map((id) => { const p = `${SCREENS}/${id}/${fixture}-${w}x${h}.png`; return { id, label: `${getTheme(id).role} — ${getTheme(id).label}`, src: `data:image/png;base64,${fs.readFileSync(p).toString("base64")}` }; });
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;background:#1a1a1a;width:${W}px;height:${H}px;font:600 14px system-ui,sans-serif;color:#eee}
      .g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:${gap}px;padding:${gap}px}
      .t{display:grid;grid-template-rows:${label - 8}px ${th}px;gap:8px}
      .l{display:flex;align-items:center;padding:0 4px;color:#eee;letter-spacing:.4px}
      img{width:${tw}px;height:${th}px;object-fit:contain;background:#000;display:block}
    </style><div class="g">${tiles.map((t) => `<div class="t"><div class="l">${t.label}</div><img src="${t.src}"></div>`).join("")}</div>`);
    await page.screenshot({ path: `${SCREENS}/comparisons/${name}.png` });
    console.log(`  ${name}.png (${W}x${H}, ${cols} across, scale ${scale})`);
  };
  await sheet("desktop-play-lobby-contact-sheet", "lobby", [1536, 1024], 2);
  await sheet("desktop-empty-arena-contact-sheet", "empty", [1536, 1024], 2);
  await sheet("desktop-roll2-contact-sheet", "roll2", [1536, 1024], 2);
  await sheet("desktop-coach-contact-sheet", "coach", [1536, 1024], 2);
  await sheet("desktop-result-contact-sheet", "result", [1536, 1024], 2);
  await sheet("desktop-postgame-contact-sheet", "postgame", [1536, 1024], 2);
  await sheet("desktop-1440-roll2-contact-sheet", "roll2", [1440, 900], 2);
  await sheet("mobile-play-lobby-contact-sheet", "lobby", [390, 844], 4);
  await sheet("mobile-roll2-contact-sheet", "roll2", [390, 844], 4);
  await sheet("mobile-result-contact-sheet", "result", [390, 844], 4);
  await sheet("mobile-postgame-contact-sheet", "postgame", [390, 844], 4);
  await browser.close();
  // The comparison index: tabs, side-by-side, overlay, metrics, links, no recommendation.
  const metrics = { color: json("color-area-audit.json")?.summary || null, access: Object.fromEntries(THEME_IDS.map((id) => [id, json("theme-accessibility-and-fatigue.json")?.perTheme?.[id]?.fatigue || null])), dom: json("theme-dom-invariant.json") ? { passed: json("theme-dom-invariant.json").passed, checks: json("theme-dom-invariant.json").checks } : null, competitive: json("competitive-color-differentiation.json")?.matrix?.map((r) => ({ theme: r.theme, classification: r.classification })) || null };
  const previewBase = process.env.PREVIEW_BASE || "";
  const html = `<!doctype html><meta charset="utf-8"><title>EraClash Basketball — theme comparison</title>
<style>
body{margin:0;background:#161616;color:#eee;font:14px/1.5 system-ui,sans-serif}
header{padding:14px 18px;border-bottom:1px solid #333;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
h1{font-size:16px;margin:0;letter-spacing:1px}
nav button,.modes button{background:#222;color:#ddd;border:1px solid #444;border-radius:8px;padding:8px 12px;cursor:pointer;min-height:40px}
nav button[aria-pressed=true],.modes button[aria-pressed=true]{background:#333;border-color:#999;color:#fff}
main{padding:16px 18px;display:grid;gap:16px}
.row{display:grid;gap:12px}
.row.side{grid-template-columns:repeat(2,minmax(0,1fr))}
.row.tabs{grid-template-columns:minmax(0,1fr)}
figure{margin:0;background:#000;border:1px solid #333;border-radius:8px;overflow:hidden}
figure img{display:block;width:100%;height:auto}
figcaption{padding:6px 10px;font-weight:700;color:#ddd;background:#111}
.overlay{position:relative}.overlay img.b{position:absolute;inset:0;opacity:.5}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #333;padding:6px 8px;text-align:left}
.links a{color:#9cc3ff}
.note{color:#aaa;font-size:12px}
</style>
<header><h1>ERACLASH BASKETBALL · THEME COMPARISON</h1>
<nav id="fx"></nav><nav id="vp"></nav><div class="modes" id="modes"></div></header>
<main>
<section id="view"></section>
<section><h2 style="font-size:14px">Direct preview links</h2><div class="links" id="links"></div><p class="note">Owner-only. The lab is compiled out of production and hidden from testers. No automatic recommendation is made anywhere on this page.</p></section>
<section><h2 style="font-size:14px">Objective metrics</h2><div id="metrics"></div></section>
</main>
<script>
const THEMES=${JSON.stringify(THEME_IDS.map((id) => ({ id, label: `${getTheme(id).role} — ${getTheme(id).label}` })))};
const FIXTURES=${JSON.stringify(FIXTURE_IDS.map((id) => ({ id, label: FIXTURE_LABELS[id] })))};
const VIEWPORTS=${JSON.stringify(VIEWPORTS.map(([w, h]) => `${w}x${h}`))};
const METRICS=${JSON.stringify(metrics)};
const BASE=${JSON.stringify(previewBase)};
let fixture="lobby",vp="1536x1024",mode="tabs",tab=THEMES[0].id,overlayA=THEMES[0].id,overlayB=THEMES[1].id;
const shot=(t)=>\`screens/\${t}/\${fixture}-\${vp}.png\`;
const btn=(el,items,cur,set)=>{el.innerHTML="";for(const it of items){const b=document.createElement("button");b.textContent=it.label||it;b.setAttribute("aria-pressed",String((it.id||it)===cur));b.onclick=()=>{set(it.id||it);render()};el.appendChild(b);}};
function render(){
 btn(document.getElementById("fx"),FIXTURES,fixture,(v)=>fixture=v);
 btn(document.getElementById("vp"),VIEWPORTS,vp,(v)=>vp=v);
 btn(document.getElementById("modes"),[{id:"tabs",label:"Theme tabs"},{id:"side",label:"Side by side"},{id:"overlay",label:"Overlay"}],mode,(v)=>mode=v);
 const v=document.getElementById("view");
 if(mode==="tabs"){v.innerHTML=\`<div class="row tabs"><nav id="tt"></nav><figure><figcaption>\${THEMES.find(t=>t.id===tab).label}</figcaption><img src="\${shot(tab)}"></figure></div>\`;btn(v.querySelector("#tt"),THEMES,tab,(x)=>tab=x);}
 else if(mode==="side"){v.innerHTML=\`<div class="row side">\${THEMES.map(t=>\`<figure><figcaption>\${t.label}</figcaption><img src="\${shot(t.id)}"></figure>\`).join("")}</div>\`;}
 else{v.innerHTML=\`<div class="row tabs"><div><nav id="oa"></nav> over <nav id="ob" style="display:inline-flex;gap:6px"></nav> <label>opacity <input id="op" type="range" min="0" max="100" value="50"></label></div><figure class="overlay"><figcaption>\${THEMES.find(t=>t.id===overlayA).label} over \${THEMES.find(t=>t.id===overlayB).label}</figcaption><div style="position:relative"><img src="\${shot(overlayB)}"><img class="b" id="topimg" src="\${shot(overlayA)}"></div></figure></div>\`;btn(v.querySelector("#oa"),THEMES,overlayA,(x)=>overlayA=x);btn(v.querySelector("#ob"),THEMES,overlayB,(x)=>overlayB=x);v.querySelector("#op").oninput=(e)=>{document.getElementById("topimg").style.opacity=e.target.value/100};}
 document.getElementById("links").innerHTML=THEMES.map(t=>\`<div>\${t.label}: <a href="\${BASE}/dev/basketball-theme-lab?theme=\${t.id}&fixture=\${fixture}">\${BASE||"<preview base>"}/dev/basketball-theme-lab?theme=\${t.id}&fixture=\${fixture}</a></div>\`).join("");
 const m=METRICS;const rows=THEMES.map(t=>{const c=(m.color||[]).find(x=>x.theme===t.id)||{};const a=(m.access||{})[t.id]||{};const k=(m.competitive||[]).find(x=>x.theme===t.id)||{};return \`<tr><td>\${t.label}</td><td>\${c.dominantPct??"—"}% / \${c.secondaryPct??"—"}% / \${c.decorativeAccentPct??"—"}%</td><td>\${(c.flags||[]).join(", ")||"none"}</td><td>\${a.risk??"—"} (\${a.thresholdHits??"—"} factors)</td><td>\${k.classification??"—"}</td></tr>\`}).join("");
 document.getElementById("metrics").innerHTML=\`<table><tr><th>Theme</th><th>Dominant / secondary / decorative accent</th><th>Colour flags</th><th>Fatigue risk</th><th>Differentiation</th></tr>\${rows}</table><p class="note">DOM invariant: \${m.dom?\`\${m.dom.passed}/\${m.dom.checks} checks\`:"—"}. Owner-judgment fields are on the scorecard and are intentionally blank.</p>\`;
}
render();
</script>`;
  fs.writeFileSync(`${OUT}/theme-comparison-index.html`, html);
  console.log(`wrote ${OUT}/theme-comparison-index.html`);
  ok("eleven contact sheets and the comparison index exist", fs.readdirSync(`${SCREENS}/comparisons`).length >= 11 && fs.existsSync(`${OUT}/theme-comparison-index.html`));
}

// ── scorecard ────────────────────────────────────────────────────────────────
if (MODE === "scorecard") {
  const color = json("color-area-audit.json"), acc = json("theme-accessibility-and-fatigue.json"), dom = json("theme-dom-invariant.json"), resp = json("theme-responsive-qa.json"), por = json("portrait-theme-compatibility.json"), perf = json("theme-performance-qa.json"), comp = json("competitive-color-differentiation.json");
  const rows = THEME_IDS.map((id) => {
    const a = acc?.perTheme?.[id]; const fixtures = a ? Object.values(a.fixtures) : [];
    const pairs = fixtures.reduce((n, f) => n + f.textCount, 0), passes = fixtures.reduce((n, f) => n + f.passCount, 0);
    const c = color?.summary?.find((s) => s.theme === id);
    const domRows = dom?.rows?.filter((r) => r.theme === id) || [];
    return {
      theme: id, label: getTheme(id).label, role: getTheme(id).role,
      objective: {
        wcagPassRate: pairs ? +(passes / pairs).toFixed(4) : null,
        geometryDriftPx: domRows.length ? Math.max(...domRows.map((r) => r.primaryDriftPx)) : (id === "fracture-core" ? 0 : null),
        colorAreaCompliance: c ? c.withinTargets : null, colorArea: c ? { dominant: c.dominantPct, secondary: c.secondaryPct, accent: c.decorativeAccentPct } : null,
        accentOveruseFlags: c?.flags || null,
        longFormContrast: acc?.longFormPostgame?.[id] || null,
        mobileContrast: a ? Object.fromEntries(Object.entries(a.fixtures).filter(([k]) => k.endsWith("@390")).map(([k, v]) => [k, { pass: v.passCount, of: v.textCount }])) : null,
        portraitCompatibility: por?.perTheme?.[id] ? { silhouetteContrast: por.perTheme[id].silhouetteContrastToFrame, uniformBlendRisks: Object.values(por.perTheme[id].uniformSwatches).filter((r) => r.blendRisk).length } : null,
        competitorDifferentiation: comp?.matrix?.find((r) => r.theme === id)?.classification || null,
        assetWeight: perf ? { themeCssBytesShared: perf.themeCssBytes, labChunkBytes: perf.labChunk?.bytes || null } : null,
        renderingPerformance: perf?.perTheme?.[id] || null,
        fatigueRisk: a?.fatigue?.risk || null,
      },
      ownerJudgment: { mostPremium: null, mostDistinct: null, mostEraClash: null, bestBasketballIdentity: null, mostComfortableForLongUse: null, bestPlayerPortraitPresentation: null, bestFutureMultisportFit: null },
    };
  });
  write("theme-decision-scorecard.json", { artifact: "theme-decision-scorecard", phase: PHASE, decision: "AWAITING OWNER PALETTE SELECTION — no winner is selected here", rows, ownerFieldsNote: "Owner-judgment fields are deliberately null. They are not scored by Claude." });
  ok("owner judgment fields are all blank", rows.every((r) => Object.values(r.ownerJudgment).every((v) => v === null)));
}

const passed = checks.filter((c) => c.pass).length;
if (checks.length) { console.log(`\n${MODE}: ${passed}/${checks.length} checks passed`); process.exit(passed === checks.length ? 0 : 1); }
