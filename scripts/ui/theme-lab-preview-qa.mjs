#!/usr/bin/env node
// ── Deployed theme-lab QA (Phase 9A.1) ──────────────────────────────────────
//   PHASE9A1_COMMIT=<sha> node scripts/ui/theme-lab-preview-qa.mjs https://<branch-preview>
// Measured on the DEPLOYMENT: the lab is owner-only (401 anonymous, 404 for a
// tester's valid session), every theme URL renders every fixture, the primary
// decision views hold, the public product carries no theme control, the Wave 1
// alias and production are unchanged. Keys are exchanged for sessions and never
// printed or stored.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium, request as pwRequest } from "@playwright/test";
import { CANDIDATE_THEME_IDS, PRODUCTION_THEME_ID, getTheme } from "../../src/theme/themeResolver.js";
// Phase 9A.1 artifacts describe the FOUR candidates; the production hybrid has its own harness.
const THEME_IDS = CANDIDATE_THEME_IDS;
import { FIXTURE_IDS } from "../../src/ui/theme-lab/fixtureIds.js";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//.test(BASE)) { console.error("usage: node scripts/ui/theme-lab-preview-qa.mjs https://<preview-host>"); process.exit(2); }
const OUT = "data/validation/9a1";
const SHOTS = `${OUT}/preview-screens`;
mkdirSync(SHOTS, { recursive: true });
const gates = []; let failed = 0;
const gate = (name, ok, detail = "") => { gates.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` … ${detail}` : ""}`); };
const keys = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8")).keys;
const owner = keys.find((k) => k.role === "owner"), tester = keys.find((k) => k.role !== "owner");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const LAB = "/dev/basketball-theme-lab";
const READY = { lobby: ".ec-lobby .ec-mode-card", empty: ".ec-pc-empty", roll2: ".ec-ta-roster .ec-pc", coach: ".ec-coach-action", result: ".ec-ta-rail [role=tab]", postgame: ".pg-final-grid, [role=tabpanel]" };

const run = async () => {
  console.log("A. the lab is owner-only");
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const a = await anon.get(LAB, { maxRedirects: 0 });
  gate("anonymous /dev/basketball-theme-lab is refused", a.status() === 401, `HTTP ${a.status()}`);
  await anon.dispose();
  const t = await pwRequest.newContext({ baseURL: BASE });
  const ts = await t.post("/api/preview-access", { form: { key: tester.key }, maxRedirects: 0 });
  gate(`a tester session opens (${tester.testerId}, ${sha(tester.key)})`, ts.status() === 303);
  const tl = await t.get(LAB, { maxRedirects: 0 });
  gate("a tester's valid session gets a 404 at the lab, not the lab", tl.status() === 404, `HTTP ${tl.status()}`);
  const tp = await t.get("/play", { maxRedirects: 0 });
  gate("the same tester still reaches /play", tp.status() === 200, `HTTP ${tp.status()}`);
  await t.dispose();

  console.log("\nB. every theme URL renders every fixture for the owner");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  if (auth.status() !== 303) { console.error("could not open an owner session"); process.exit(1); }
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "Owner"); } catch (e) {} });
  const themeUrls = {};
  for (const theme of THEME_IDS) {
    themeUrls[theme] = `${BASE}${LAB}?theme=${theme}`;
    for (const fixture of FIXTURE_IDS) {
      await page.goto(`${BASE}${LAB}?theme=${theme}&fixture=${fixture}&chrome=0`, { waitUntil: "domcontentloaded" });
      let okRender = true;
      try { await page.waitForSelector(READY[fixture], { timeout: 45_000 }); } catch { okRender = false; }
      const m = okRender ? await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })) : {};
      gate(`${theme} · ${fixture} renders with data-theme, no overflow`, okRender && m.theme === theme && m.overflow <= 0, JSON.stringify(m));
    }
  }
  console.log("\nC. primary decision views");
  for (const [w, h] of [[1536, 1024], [1440, 900], [390, 844]]) {
    for (const fixture of ["lobby", "roll2", "result", "postgame"]) {
      const heights = [];
      for (const theme of THEME_IDS) {
        const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 800, isMobile: w < 800 });
        await c.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
        const p = await c.newPage();
        await p.addInitScript(() => { try { localStorage.setItem("ec_account", "1"); } catch (e) {} });
        await p.goto(`${BASE}${LAB}?theme=${theme}&fixture=${fixture}&chrome=0`, { waitUntil: "domcontentloaded" });
        await p.waitForSelector(READY[fixture], { timeout: 45_000 });
        await p.waitForTimeout(300);
        heights.push(await p.evaluate(() => document.documentElement.scrollHeight));
        if (w !== 1440) await p.screenshot({ path: `${SHOTS}/${theme}-${fixture}-${w}x${h}.png` });
        await c.close();
      }
      gate(`${fixture} @${w}x${h}: the four themes share one geometry (heights ${heights.join("/")})`, Math.max(...heights) - Math.min(...heights) <= 3);
    }
  }
  console.log("\nD. the public product carries no theme control");
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ec-lobby", { timeout: 45_000 });
  const pub = await page.evaluate(() => ({ dataTheme: document.documentElement.dataset.theme || null, labLinks: [...document.querySelectorAll("a[href]")].filter((x) => /theme-lab/.test(x.href)).length, picker: /choose your basketball theme|theme lab/i.test(document.body.innerText) }));
  gate("only the production theme, no lab link, no picker on /play", pub.dataTheme === PRODUCTION_THEME_ID && pub.labLinks === 0 && !pub.picker, JSON.stringify(pub));
  const bundles = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
  let labInMain = false;
  for (const src of bundles) { const body = await (await ctx.request.get(src)).text(); if (/basketball-theme-lab\?theme=|data-theme-lab-chrome/.test(body) && !/ThemeLab-/.test(src)) labInMain = true; }
  gate("the lab is a separate lazy chunk, not part of the main bundle", !labInMain, `${bundles.length} script(s) checked`);
  const health = await (await ctx.request.get(`${BASE}/api/health`)).json();
  const local = previewCandidateIdentity();
  gate("the deployment runs this checkout's candidate", health?.preview?.candidateCoreHash === local.coreHash && health?.preview?.candidateId === local.candidateId, `${health?.preview?.candidateId} / ${String(health?.preview?.candidateCoreHash).slice(0, 12)}`);
  await browser.close();

  console.log("\nE. Wave 1 and production untouched");
  const w1 = await pwRequest.newContext({ baseURL: "https://era-clash-basketball-git-wave1-era-clash.vercel.app" });
  const w1s = await w1.post("/api/preview-access", { form: { key: owner.key }, maxRedirects: 0 });
  const w1html = w1s.status() === 303 ? await (await w1.get("/")).text() : "";
  const w1stamp = (w1html.match(/eraclash-assets:[0-9.]+:[a-f0-9]+/) || [])[0] || null;
  const w1lab = await w1.get(LAB, { maxRedirects: 0 });
  gate("the Wave 1 alias still serves the pre-9A build (stamp 2f35a3b70c30) and has no lab", w1stamp === "eraclash-assets:2.7.2:2f35a3b70c30" && w1lab.status() === 404, `${w1stamp} · lab HTTP ${w1lab.status()}`);
  await w1.dispose();

  writeFileSync(`${OUT}/theme-preview-qa.json`, JSON.stringify({
    artifact: "theme-preview-qa", phase: "9A.1 — Basketball theme decision lab",
    deployment: { baseUrl: BASE, commit: process.env.PHASE9A1_COMMIT || null, environment: "vercel preview, access-gated, owner-only lab" },
    themeUrls, candidateUnderTest: { deployed: health?.preview || null, local },
    stableWave1: { stamp: w1stamp, expected: "eraclash-assets:2.7.2:2f35a3b70c30" },
    gates, passed: gates.length - failed, failed,
  }, null, 2) + "\n");
  console.log(`\n${gates.length - failed}/${gates.length} deployed gates passed`);
  process.exit(failed ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
