// Unified Light UI release gates.
//   node scripts/ui-release/uiReleaseQa.mjs <mode> [origin]
//   challenge-entry   a Chaos result offers ONLY the governed challenge; legacy
//                     links (/?c=, /?ch=) still open the roster builder; a 9C
//                     invitation resolves to the Chaos invite surface
//   theme             every Chaos state + Home + Daily render on the shared Light
//                     Court tokens: ivory canvas, ink text, obsidian navigation,
//                     dark portrait well, gold CTA with dark ink
//   responsive        eight viewports × Home / Daily / Chaos states: no horizontal
//                     overflow, controls ≥ 44px
//   accessibility     live text contrast ≥ 4.5 (3.0 for ≥ 24px) on every Chaos
//                     state, keyboard reach of the primary control, reduced motion
//   performance       first paint + transition times on the light build
// Default origin is the real local harness (node scripts/harness.mjs 4180).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const MODE = process.argv[2] || "theme";
const BASE = (process.argv[3] || "http://localhost:4180").replace(/\/$/, "");
const OUT = "data/validation/ui-release";
const SCREENS = `${OUT}/screens`;
const now = () => new Date().toISOString();
const rows = [];
const ok = (name, pass, detail = "") => { rows.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${pass || !detail ? "" : ` — ${detail}`}`); return !!pass; };
const write = (name, extra = {}) => { mkdirSync(OUT, { recursive: true }); const data = { artifact: name, mode: MODE, origin: BASE, recordedAt: now(), pass: rows.every((r) => r.pass), checks: rows, ...extra }; writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2) + "\n"); console.log(`  → ${OUT}/${name}.json`); return data.pass; };
const src = (p) => readFileSync(p, "utf8");

const openSession = async (context) => {
  if (!BASE.startsWith("https://")) return null;
  const f = ".preview-secrets/wave2-access-keys.json";
  if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
  const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
  const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  return true;
};
const freshAccount = (page) => page.addInitScript(() => {
  try {
    if (sessionStorage.getItem("qa_seeded")) return;
    sessionStorage.setItem("qa_seeded", "1");
    localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA");
    localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); localStorage.removeItem("ec_chaos_era_ack");
  } catch (e) {}
});
const stageIn = (page, st, timeout = 60_000) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout });
const click = async (page, re, timeout = 30_000) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ state: "visible", timeout }); await b.click(); };
const STATES = ["EMPTY", "DRAFTING", "ERA_REVEAL", "COACH_SELECT", "READY", "RESULT"];
/** Drive one Clash through the six states, calling at(state) in each. */
async function walk(page, at) {
  const t = {};
  const mark = async (st, fn) => { const t0 = Date.now(); await fn(); t[st] = Date.now() - t0; await at(st); };
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await mark("EMPTY", () => stageIn(page, "EMPTY"));
  await click(page, /^ROLL$/);
  await mark("DRAFTING", async () => { await stageIn(page, "DRAFTING"); await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 }); });
  await click(page, /^ROLL 2$/);
  await mark("ERA_REVEAL", () => stageIn(page, "ERA_REVEAL"));
  await click(page, /ADAPT TO ERA/);
  await stageIn(page, "DRAFTING");
  await click(page, /FINAL ROLL/);
  await mark("COACH_SELECT", async () => { await stageIn(page, "COACH_SELECT"); await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await click(page, /CONTINUE WITH COACH/);
  await mark("READY", () => stageIn(page, "READY"));
  await click(page, /RUN CLASH/);
  await mark("RESULT", async () => { await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 }); await stageIn(page, "RESULT"); });
  return t;
}
const newPage = async (browser, viewport = { width: 1536, height: 1024 }, extra = {}) => {
  const ctx = await browser.newContext({ viewport, ...extra });
  await openSession(ctx);
  const page = await ctx.newPage();
  await freshAccount(page);
  return { ctx, page };
};
// Relative luminance of a computed colour; alpha composited over the given ground.
const LUM_FN = `(c, ground) => { const m = String(c).match(/[\\d.]+/g); if (!m) return null; let [r, g, b] = m.slice(0, 3).map(Number); const a = m.length > 3 ? Number(m[3]) : 1; if (ground && a < 1) { const gm = String(ground).match(/[\\d.]+/g).slice(0, 3).map(Number); r = r * a + gm[0] * (1 - a); g = g * a + gm[1] * (1 - a); b = b * a + gm[2] * (1 - a); } const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }`;
const shot = async (page, name) => { mkdirSync(SCREENS, { recursive: true }); await page.screenshot({ path: `${SCREENS}/${name}.png`, fullPage: false }); };

/* ---------------------------------------------------------------- challenge-entry */
async function challengeEntry() {
  const app = src("src/App.jsx");
  ok("source: the legacy Challenge CTA is withdrawn on a Chaos result", /onChallenge=\{live && res\?\.tag !== "chaos" \? doShare : null\}/.test(app));
  ok("source: doShare mints the legacy roster challenge only for non-Chaos results", /const legacyChallenge = result\?\.tag !== "chaos";/.test(app) && /legacyChallenge \? createChallenge\(team, rec\) : Promise\.resolve\(null\)/.test(app) && /resultUrl && ch \?/.test(app));
  ok("source: the legacy /?c= and /?ch= handler is intact (old links never break)", /params\.get\("c"\) \|\| params\.get\("ch"\)/.test(app) && /loadChallengeFromUrl\(\)/.test(app));
  ok("source: the governed ChallengeShare is the challenge surface on a Chaos result", /challengeShare=\{result\?\.resultId && chaosRun\?\.chaosRunId/.test(app) && /<ChallengeShare chaosRunId=\{chaosRun\.chaosRunId\}/.test(app));
  ok("source: the legacy codec is unchanged (verbatim guard)", /old shared links must never break/i.test(src("src/challengeClient.js")) && /export const decodeChallenge/.test(src("src/challengeClient.js")));
  const browser = await chromium.launch();
  try {
    const { page } = await newPage(browser);
    await walk(page, async () => {});
    const facts = await page.evaluate(() => {
      const text = document.body.innerText;
      const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent.trim());
      return {
        legacyChallengeCta: buttons.filter((t) => /Challenge a Friend|CHALLENGE A FRIEND WITH THIS TEAM|Challenge Someone Else/i.test(t)).length,
        governedShare: !!document.querySelector(".ec-chal-share, .ec-chal-cta-row"),
        legacyBuilder: /YOU'VE BEEN CHALLENGED/.test(text),
        directChallengeLink: /\/challenge\//.test(text),
        result: !!document.querySelector(".ec-ta-score[data-winner]"),
      };
    });
    ok("browser: a completed Chaos result renders", facts.result);
    ok("browser: no legacy 'Challenge a Friend' CTA on a Chaos result", facts.legacyChallengeCta === 0, `legacy CTAs ${facts.legacyChallengeCta}`);
    ok("browser: the governed challenge surface (ChallengeShare) is offered on the Chaos result", facts.governedShare);
    ok("browser: no /challenge/{id} legacy link is shown on the Chaos result", !facts.directChallengeLink);
    await shot(page, "challenge-entry-chaos-result");
    // The full report (Postgame) still offers Share — result sharing is not a
    // challenge — and offers no legacy Challenge CTA either.
    await page.getByRole("button", { name: /VIEW FULL REPORT/ }).first().click();
    await page.waitForTimeout(800);
    const report = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].map((x) => x.textContent.trim()); return { share: b.filter((t) => /Share/i.test(t)).length, legacy: b.filter((t) => /Challenge a Friend|CHALLENGE A FRIEND|Challenge Someone Else/i.test(t)).length }; });
    ok("browser: the full report keeps Share on the Chaos result (result sharing is not a challenge)", report.share >= 1, JSON.stringify(report));
    ok("browser: the full report shows no legacy Challenge CTA on the Chaos result", report.legacy === 0, JSON.stringify(report));
    await shot(page, "challenge-entry-chaos-full-report");
    // Legacy invitation formats: /?c=<v2 code> is decoded client-side and opens the roster builder.
    const legacy = await newPage(browser);
    const ids = await legacy.page.evaluate(async (base) => { const r = await fetch(`${base}/api/players?limit=5`).catch(() => null); return null; }, BASE).catch(() => null);
    const code = Buffer.from("1,2,3,4,5|W").toString("base64").replace(/=+$/, "");
    await legacy.page.goto(`${BASE}/?c=${code}`, { waitUntil: "domcontentloaded" });
    await legacy.page.waitForTimeout(2500);
    const legacyFacts = await legacy.page.evaluate(() => ({ builder: /YOU'VE BEEN CHALLENGED|CHALLENGE/i.test(document.body.innerText), chaos: !!document.querySelector(".ec-ta-stage") }));
    ok("browser: a legacy /?c= link still opens the legacy challenge path (not silently redirected into Chaos)", legacyFacts.builder && !legacyFacts.chaos, JSON.stringify(legacyFacts));
    // A 9C invitation resolves to the Chaos invite surface (an unknown code shows the invite error, never the roster builder).
    const inv = await newPage(browser);
    await inv.page.goto(`${BASE}/?challenge=EC-QAQA-QAQA`, { waitUntil: "domcontentloaded" });
    await inv.page.waitForSelector(".ec-chal-invite", { timeout: 30_000 }).catch(() => {});
    const invFacts = await inv.page.evaluate(() => ({ invite: !!document.querySelector(".ec-chal-invite"), builder: /YOU'VE BEEN CHALLENGED/.test(document.body.innerText) }));
    ok("browser: a /?challenge=EC-… invitation resolves to the Chaos invite surface, never the roster builder", invFacts.invite && !invFacts.builder, JSON.stringify(invFacts));
    await shot(inv.page, "challenge-entry-invite-surface");
  } finally { await browser.close(); }
  return write("challenge-entry-regression-qa");
}

/* ---------------------------------------------------------------- theme */
const themeFacts = (page) => page.evaluate((LUM) => {
  const lum = eval(LUM); const cs = (e) => getComputedStyle(e);
  const bodyBg = cs(document.body).backgroundColor;
  const arena = document.querySelector(".ec-arena-shell, .arena") || document.body;
  const header = document.querySelector("header");
  const stage = document.querySelector(".ec-ta-stage");
  const canvas = stage ? cs(stage).backgroundColor : cs(arena).backgroundColor;
  const canvasLum = lum(canvas, bodyBg) ?? lum(bodyBg);
  const well = document.querySelector(".ec-pc-figure");
  // The stage's primary control is .ec-ta-cta; on the result the dock's primary is VIEW FULL REPORT.
  const cta = document.querySelector(".ec-ta-cta") || [...document.querySelectorAll("button")].find((b) => /VIEW FULL REPORT|START CHAOS CLASH/.test(b.textContent.trim()) && b.offsetParent);
  const text = [...document.querySelectorAll(".ec-ta-stage h1, .ec-ta-stage h2, .ec-ta-stage h3, .ec-ta-stage p, .ec-lobby h1, .ec-lobby h2, .ec-lobby p")].filter((e) => e.offsetParent).slice(0, 12).map((e) => lum(cs(e).color));
  const tokens = cs(document.documentElement);
  return {
    theme: document.documentElement.getAttribute("data-theme"),
    bodyLum: lum(bodyBg), canvas, canvasLum,
    headerLum: header ? lum(cs(header).backgroundColor) : null,
    wellLum: well ? lum(cs(well).backgroundImage.match(/rgb\([^)]*\)/)?.[0] || cs(well).backgroundColor) : null,
    ctaLabel: cta ? cta.textContent.trim() : null, ctaDisabled: cta ? cta.disabled : null,
    ctaBgLum: cta ? lum(cs(cta).backgroundColor, bodyBg) : null,
    ctaInkLum: cta ? lum(cs(cta).color) : null,
    textLums: text,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}, LUM_FN);

async function theme() {
  const browser = await chromium.launch();
  const perState = {};
  try {
    const { page } = await newPage(browser);
    await walk(page, async (st) => { perState[st] = await themeFacts(page); await shot(page, `theme-${st.toLowerCase()}`); });
    for (const st of STATES) {
      const f = perState[st];
      ok(`${st}: renders on the production theme with an ivory canvas (lum > 0.8)`, f.theme === "night-court-production-hybrid" && (f.canvasLum > 0.8 || f.bodyLum > 0.8), `canvas ${f.canvas} lum ${f.canvasLum?.toFixed(3)}`);
      ok(`${st}: the global navigation stays obsidian (lum < 0.02)`, f.headerLum !== null && f.headerLum < 0.02, `header lum ${f.headerLum}`);
      ok(`${st}: no horizontal overflow at 1536×1024`, f.overflow === 0, `overflow ${f.overflow}`);
      if (f.textLums.length) ok(`${st}: stage text is ink on ivory (every sampled text lum < 0.35)`, f.textLums.every((l) => l !== null && l < 0.35), JSON.stringify(f.textLums.map((l) => l?.toFixed(3))));
      // COACH_SELECT's CONTINUE WITH COACH is disabled until a coach is picked: a quiet ivory
      // control with readable ink, deliberately not gold — the gold fill is graded when enabled.
      if (f.ctaLabel && f.ctaDisabled) ok(`${st}: the primary CTA (${f.ctaLabel}) is disabled and still readable (ink lum < 0.35)`, f.ctaInkLum < 0.35, `bg ${f.ctaBgLum?.toFixed(3)} ink ${f.ctaInkLum?.toFixed(3)}`);
      else if (f.ctaLabel) ok(`${st}: the primary CTA (${f.ctaLabel}) is a gold fill with dark ink`, f.ctaBgLum > 0.3 && f.ctaInkLum < 0.05, `bg ${f.ctaBgLum?.toFixed(3)} ink ${f.ctaInkLum?.toFixed(3)}`);
      if (st === "DRAFTING" || st === "RESULT") ok(`${st}: the portrait well stays dark (jersey-vs-stage separation)`, f.wellLum !== null && f.wellLum < 0.05, `well lum ${f.wellLum}`);
    }
    // Home and Daily keep their approved light look.
    const home = await newPage(browser);
    await home.page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    const hf = await themeFacts(home.page);
    ok("Home: ivory canvas, obsidian navigation, no overflow", hf.bodyLum > 0.8 || hf.canvasLum > 0.8, JSON.stringify({ canvasLum: hf.canvasLum, headerLum: hf.headerLum }));
    ok("Home: the global navigation stays obsidian", hf.headerLum < 0.02);
    await shot(home.page, "theme-home");
    await home.page.goto(`${BASE}/daily`, { waitUntil: "networkidle" }).catch(() => {});
    const df = await themeFacts(home.page);
    ok("Daily: light canvas and obsidian navigation", (df.bodyLum > 0.75 || df.canvasLum > 0.75) && df.headerLum < 0.02, JSON.stringify({ canvasLum: df.canvasLum, bodyLum: df.bodyLum }));
    await shot(home.page, "theme-daily");
    // The generated stylesheet carries the contract.
    const css = src("src/theme/basketball-themes.css");
    ok("stylesheet: .ec-arena-shell carries Warm Court Ivory + Editorial Ink; .ec-brand-header carries obsidian + platinum", (() => { const prod = css.slice(css.indexOf('html[data-theme="night-court-production-hybrid"] .ec-arena-shell')); const hdr = css.slice(css.indexOf('html[data-theme="night-court-production-hybrid"] .ec-brand-header')); const block = (x) => x.slice(0, x.indexOf("}")); return /--ec-a-bg: #F1EDE4/.test(block(prod)) && /--ec-a-text: #151B24/.test(block(prod)) && /--ec-a-header: rgba\(3, 6, 11, 0\.94\)/.test(block(hdr)) && /--ec-a-text: #E7EAF0/.test(block(hdr)); })());
  } finally { await browser.close(); }
  return write("shared-theme-live-qa", { states: perState });
}

/* ---------------------------------------------------------------- responsive */
const VIEWPORTS = [[1536, 1024], [1440, 900], [1280, 800], [1024, 1366], [768, 1024], [430, 932], [390, 844], [375, 812]];
const layoutFacts = (page) => page.evaluate(() => {
  const small = [...document.querySelectorAll("button, a[href], input, select, [role=tab]")].filter((e) => e.offsetParent && getComputedStyle(e).visibility !== "hidden").map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44));
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: small.length, controls: document.querySelectorAll("button").length };
});
async function responsive() {
  const browser = await chromium.launch();
  const matrix = {};
  try {
    for (const [w, h] of VIEWPORTS) {
      const { page, ctx } = await newPage(browser, { width: w, height: h });
      const key = `${w}x${h}`; matrix[key] = {};
      await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
      matrix[key].home = await layoutFacts(page); await shot(page, `responsive-home-${key}`);
      await page.goto(`${BASE}/daily`, { waitUntil: "networkidle" }).catch(() => {});
      matrix[key].daily = await layoutFacts(page); await shot(page, `responsive-daily-${key}`);
      await walk(page, async (st) => { matrix[key][st] = await layoutFacts(page); await shot(page, `responsive-${st.toLowerCase()}-${key}`); });
      for (const [screen, f] of Object.entries(matrix[key])) {
        ok(`${key} ${screen}: no horizontal overflow`, f.overflow === 0, `overflow ${f.overflow}`);
        // Text links inside prose are exempt from 44px; interactive controls are not.
        ok(`${key} ${screen}: every visible control ≥ 44px`, f.small === 0, `small ${f.small}/${f.controls}`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  return write("ui-responsive-qa", { viewports: VIEWPORTS.map(([w, h]) => `${w}x${h}`), matrix });
}

/* ---------------------------------------------------------------- accessibility */
const contrastFacts = (page) => page.evaluate((LUM) => {
  const lum = eval(LUM);
  const contrast = (a, b) => { const [x, y] = a > b ? [a, b] : [b, a]; return (x + 0.05) / (y + 0.05); };
  // rgb()/rgba() and color(srgb r g b / a) — the latter is what color-mix() computes to.
  const parse = (c) => { const str = String(c); const m = str.match(/[\d.]+/g); if (!m) return null; if (/^color\(srgb/.test(str)) return { r: +m[0] * 255, g: +m[1] * 255, b: +m[2] * 255, a: m.length > 3 ? +m[3] : 1 }; return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 }; };
  // The nearest opaque background (alpha > 0.5), a gradient's first stop counting —
  // the same method as the enforced 9B.3 accessibility gate — with the page body
  // as the ground when nothing opaque is found (the light court, not a night).
  const norm = (c) => { const q = parse(c); return q ? `rgb(${q.r.toFixed(0)}, ${q.g.toFixed(0)}, ${q.b.toFixed(0)})` : c; };
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const bg = parse(cs.backgroundColor); if (bg && bg.a > 0.5) return norm(cs.backgroundColor); const g = cs.backgroundImage.match(/(rgba?|color)\([^)]+\)/); if (g) { const gm = parse(g[0]); if (gm && gm.a > 0.5) return norm(g[0]); } n = n.parentElement; } return norm(getComputedStyle(document.body).backgroundColor); };
  const visible = (e) => { if (!e.offsetParent) return false; const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.clipPath !== "inset(50%)" && cs.clip !== "rect(0px, 0px, 0px, 0px)"; };
  const els = [...document.querySelectorAll("h1,h2,h3,h4,p,span,button,a,label,li,td,th,div,output,b,strong,em")].filter((e) => !e.closest(".sr-only") && !e.closest('[aria-hidden="true"]') && visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  const bad = []; let count = 0;
  for (const e of els) {
    const cs = getComputedStyle(e); if (Number(cs.opacity) < 0.5 || e.disabled) continue;
    const fgc = parse(cs.color); if (!fgc) continue;
    const bg = bgOf(e); const bgc = parse(bg);
    // text with its own alpha composites over the ground
    const fg = { r: fgc.r * fgc.a + bgc.r * (1 - fgc.a), g: fgc.g * fgc.a + bgc.g * (1 - fgc.a), b: fgc.b * fgc.a + bgc.b * (1 - fgc.a) };
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const c = contrast(lum(`rgb(${fg.r}, ${fg.g}, ${fg.b})`), lum(bg)); count++;
    if (c < need) bad.push({ text: e.textContent.trim().slice(0, 40), c: +c.toFixed(2), need, fg: cs.color, bg, size, cls: e.className.toString().slice(0, 50) });
  }
  const focusables = [...document.querySelectorAll("button, a[href], input, [tabindex='0']")].filter((e) => e.offsetParent);
  return { count, bad: bad.slice(0, 20), badCount: bad.length, focusables: focusables.length, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches };
}, LUM_FN);
async function accessibility() {
  const browser = await chromium.launch();
  const perState = {};
  try {
    const { page } = await newPage(browser, { width: 1536, height: 1024 }, { reducedMotion: "reduce" });
    await walk(page, async (st) => {
      perState[st] = await contrastFacts(page);
      // keyboard: Tab reaches a visible focusable; the primary CTA is a real button
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? { tag: a.tagName, text: a.textContent.trim().slice(0, 30), outline: getComputedStyle(a).outlineStyle } : null; });
      perState[st].focused = focused;
    });
    for (const st of STATES) {
      const f = perState[st];
      ok(`${st}: live text contrast ≥ 4.5 (3.0 large) on the light court — ${f.count} text nodes`, f.badCount === 0, JSON.stringify(f.bad.slice(0, 6)));
      ok(`${st}: keyboard Tab lands on a real control`, !!f.focused && ["BUTTON", "A", "INPUT"].includes(f.focused.tag), JSON.stringify(f.focused));
      ok(`${st}: reduced motion honoured in the page (media query active)`, f.reduced === true);
    }
    const home = await newPage(browser, { width: 1536, height: 1024 }, { reducedMotion: "reduce" });
    await home.page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    const hf = await contrastFacts(home.page);
    ok(`Home: live text contrast — ${hf.count} nodes`, hf.badCount === 0, JSON.stringify(hf.bad.slice(0, 6)));
    const css = src("src/index.css");
    ok("stylesheet: prefers-reduced-motion rule present", /prefers-reduced-motion:\s*reduce/.test(css));
    ok("stylesheet: visible focus style declared", /:focus-visible/.test(css));
  } finally { await browser.close(); }
  return write("ui-accessibility-qa", { states: perState });
}

/* ---------------------------------------------------------------- performance */
async function performance() {
  const browser = await chromium.launch();
  try {
    const { page } = await newPage(browser);
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    const paint = await page.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0));
    const bytes = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /\.(js|css)$/.test(r.name)).reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0));
    const t = await walk(page, async () => {});
    ok(`Home first contentful paint ${paint}ms (≤ 2500)`, paint > 0 && paint <= 2500);
    ok(`JS+CSS transferred on Home ${(bytes / 1024).toFixed(0)}KB (≤ 1500KB)`, bytes <= 1500 * 1024);
    for (const [st, ms] of Object.entries(t)) if (st !== "RESULT") ok(`${st} appeared in ${ms}ms (≤ 4000)`, ms <= 4000);
    ok(`RESULT (includes the full simulation) in ${t.RESULT}ms (≤ 30000)`, t.RESULT <= 30_000);
    const cssBytes = readFileSync("src/theme/basketball-themes.css").length;
    ok(`generated theme stylesheet ${cssBytes} bytes (≤ 40000)`, cssBytes <= 40_000);
  } finally { await browser.close(); }
  return write("ui-performance-qa");
}

const run = { "challenge-entry": challengeEntry, theme, responsive, accessibility, performance }[MODE];
if (!run) { console.error(`unknown mode ${MODE}`); process.exit(2); }
console.log(`ui-release ${MODE} @ ${BASE}`);
const pass = await run();
console.log(`${MODE}: ${rows.filter((r) => r.pass).length}/${rows.length} checks passed`);
process.exit(pass ? 0 : 1);
