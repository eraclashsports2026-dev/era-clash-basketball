// Review pass: every navigation destination, menu item, footer and info link
// on desktop and on a phone — page errors, failed requests, broken images,
// dead links. node scripts/ui-release/linkReview.mjs <origin> [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, "");
const OUT = process.argv[3] || "data/validation/flow-fix";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const findings = []; const visited = [];
const session = async (ctx) => { if (!BASE.startsWith("https://")) return; const probe = await ctx.request.get(`${BASE}/api/health`).catch(() => null); if (probe && probe.status() === 200) return; const k = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((x) => x.role === "owner"); const r = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 }); if (r.status() !== 303) throw new Error("preview access refused"); };
const audit = async (page, label) => {
  await page.waitForTimeout(600);
  const facts = await page.evaluate(() => {
    const imgs = [...document.images]; const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && !i.hidden && i.getBoundingClientRect().width > 0).map((i) => i.currentSrc || i.src);
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && !h.startsWith("#") && !h.startsWith("mailto:"));
    return { title: document.title, h1: document.querySelector("h1")?.textContent?.trim().slice(0, 60) || null, brokenImages: broken, links, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, text: document.body.innerText.slice(0, 200).replace(/\s+/g, " ") };
  });
  visited.push({ label, url: page.url(), title: facts.title, h1: facts.h1, overflow: facts.overflow });
  if (facts.brokenImages.length) findings.push({ where: label, kind: "broken-image", detail: facts.brokenImages.slice(0, 5) });
  if (facts.overflow > 0) findings.push({ where: label, kind: "horizontal-overflow", detail: `${facts.overflow}px` });
  if (/not found|404|something went wrong|error/i.test(facts.text) && !/no critical weakness|error rate/i.test(facts.text)) findings.push({ where: label, kind: "error-text", detail: facts.text.slice(0, 120) });
  return facts;
};
for (const [name, vp, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile }); await session(ctx);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push({ kind: "pageerror", detail: String(e.message).slice(0, 200) }));
  page.on("console", (m) => { if (m.type() === "error") errors.push({ kind: "console-error", detail: m.text().slice(0, 200) }); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/\/api\/(health|events)/.test(r.url())) errors.push({ kind: `http-${s}`, detail: `${r.request().method()} ${r.url().replace(BASE, "").slice(0, 120)} ${(r.request().postData() || "").slice(0, 80)}` }); });
  await page.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); } catch {} });
  // 1. Home and every top-level destination
  await page.goto(`${BASE}/play`, { waitUntil: "networkidle" }); await audit(page, `${name}: Home`);
  const destinations = mobile ? [] : ["Daily", "Challenges", "Leaderboard", "My EraClash"];
  for (const d of destinations) { await page.getByRole("button", { name: d, exact: true }).first().click(); await page.waitForTimeout(700); await audit(page, `${name}: ${d}`); }
  if (mobile) {
    for (const item of [/^Daily\b(?! Clash)/, /^Challenges/, /^Leaderboard/, /^My EraClash/]) {
      await page.getByRole("button", { name: "Menu" }).tap(); const sheet = page.getByRole("dialog", { name: "Menu" }); await sheet.waitFor();
      await sheet.getByRole("menuitem", { name: item }).first().tap(); await page.waitForTimeout(700); await audit(page, `${name}: menu → ${item}`);
    }
    // account control and the menu account actions
    await page.getByRole("button", { name: /Sign in or create|Create account|Account menu/ }).first().tap(); await page.waitForTimeout(500);
    const dialog = await page.locator('[role="dialog"], [role="menu"]').count(); if (!dialog) findings.push({ where: `${name}: account icon`, kind: "no-dialog", detail: "tapping the account control opened nothing" });
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("button", { name: /^Play/ }).click(); await page.waitForTimeout(300); const items = await page.getByRole("menuitem").allInnerTexts(); await page.keyboard.press("Escape");
    if (items.length < 7) findings.push({ where: "desktop: Play menu", kind: "menu-items", detail: `${items.length} items` });
    await page.getByRole("button", { name: /^Fantasy/ }).click(); await page.waitForTimeout(300);
    const fantasy = page.getByRole("menuitem"); const nF = await fantasy.count(); if (nF) { await fantasy.first().click(); await page.waitForTimeout(700); await audit(page, "desktop: Fantasy → first"); }
    // the header's account control: Sign in when a provider is configured, otherwise the Create account CTA
    const acct = page.getByRole("button", { name: /Sign in|Create free account|Create account|Account menu/ }).first();
    if (await acct.count()) { await acct.click(); await page.waitForTimeout(400); if (!(await page.locator('[role="dialog"], [role="menu"]').count())) findings.push({ where: "desktop: account control", kind: "no-dialog", detail: "no dialog or menu opened" }); await page.keyboard.press("Escape"); }
    else findings.push({ where: "desktop: header", kind: "missing-control", detail: "no account control in the header" });
  }
  // 2. Chaos board utilities and footer links
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await page.waitForSelector(".ec-ta-stage"); await audit(page, `${name}: Chaos board`);
  for (const util of [/HOW TO PLAY/, /STRATEGY GUIDE/, /GLOSSARY/, /HELP & SETTINGS/]) {
    const btn = page.getByRole("button", { name: util }).first(); if (await btn.count()) { await btn.click(); await page.waitForTimeout(500); const open = await page.locator('[role="dialog"], .ec-guide, .ec-sheet').count(); if (!open) findings.push({ where: `${name}: ${util}`, kind: "no-surface", detail: "control opened nothing" }); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  }
  const footer = page.locator("footer a, .ec-footer a, a[href='/credits'], a:has-text('Image credits')"); const nFoot = await footer.count();
  for (let i = 0; i < nFoot; i++) { const href = await footer.nth(i).getAttribute("href"); if (!href) continue; const r = await ctx.request.get(href.startsWith("http") ? href : `${BASE}${href}`).catch(() => null); if (!r || r.status() >= 400) findings.push({ where: `${name}: footer link ${href}`, kind: "dead-link", detail: r ? `HTTP ${r.status()}` : "no response" }); else visited.push({ label: `${name}: footer ${href}`, status: r.status() }); }
  // 3. known routes
  for (const route of ["/membership", "/credits", "/my-eraclash", "/?challenge=EC-ZZZZ-ZZZZ", "/challenge/nonexistent", "/result/zzzzzz"]) {
    const r = await ctx.request.get(`${BASE}${route}`, { maxRedirects: 3 }).catch(() => null);
    visited.push({ label: `${name}: GET ${route}`, status: r ? r.status() : "no response" });
    if (!r || r.status() >= 500) findings.push({ where: `${name}: GET ${route}`, kind: "server-error", detail: r ? `HTTP ${r.status()}` : "no response" });
  }
  for (const e of errors) findings.push({ where: name, ...e });
  await ctx.close();
}
await b.close();
const dedup = []; const seen = new Set(); for (const f of findings) { const k = JSON.stringify(f); if (!seen.has(k)) { seen.add(k); dedup.push(f); } }
const out = { artifact: "link-and-error-review", origin: BASE, recordedAt: new Date().toISOString(), visited, findings: dedup, pass: dedup.length === 0 };
writeFileSync(`${OUT}/link-review.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`visited ${visited.length} · findings ${dedup.length}`); for (const f of dedup) console.log("  !", f.where, f.kind, JSON.stringify(f.detail).slice(0, 160));
process.exit(dedup.length ? 1 : 0);
