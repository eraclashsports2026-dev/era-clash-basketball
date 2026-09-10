// Coach Chaos on the phone: the three offers must be rows the size of the five
// player rows (owner correction 2026-09-10). Walks a fresh run to COACH_SELECT
// on two phones and one desktop, measures both row kinds and every control,
// opens one scouting detail, selects one staff, and records screens + numbers.
//   node scripts/ui-release/coachRowMeasure.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test"; import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, "");
const OUT = process.argv[3] || "data/validation/flow-fix"; mkdirSync(`${OUT}/screens`, { recursive: true });
const b = await chromium.launch(); const rows = []; let failures = 0;
const ok = (name, pass, fact = "") => { if (!pass) failures++; console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${fact ? ` — ${fact}` : ""}`); rows.push({ name, pass: !!pass, fact: String(fact).slice(0, 240) }); };
const session = async (ctx) => { if (!BASE.startsWith("https://")) return; const probe = await ctx.request.get(`${BASE}/api/health`).catch(() => null); if (probe && probe.status() === 200) return; const f = ".preview-secrets/wave2-access-keys.json"; if (!existsSync(f)) throw new Error("gated preview and no keys on disk"); const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner"); await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 }); };
const stage = (p, s) => p.waitForSelector(`.ec-ta-stage[data-guided-state="${s}"]`, { timeout: 60_000 });
const box = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; }), sel);
const measures = {};
const ONLY = (process.env.VIEWPORTS || "").split(",").filter(Boolean);
for (const [name, vp, mobile] of [["phone-390", { width: 390, height: 844 }, true], ["phone-430", { width: 430, height: 932 }, true], ["desktop-1440", { width: 1440, height: 900 }, false]]) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 }); await session(ctx);
  const p = await ctx.newPage(); const act = mobile ? "tap" : "click";
  await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_era_ack"); } catch {} });
  await p.goto(`${BASE}/play/chaos`, { waitUntil: "networkidle" }); await stage(p, "EMPTY");
  await p.getByRole("button", { name: /^ROLL/ })[act](); await stage(p, "DRAFTING"); await p.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
  await p.getByRole("button", { name: /^ROLL 2/ })[act](); await p.locator(".ec-ta-title-sub").filter({ hasText: "ROLL 2 OF 3" }).waitFor({ timeout: 60_000 });
  await p.getByRole("button", { name: /FINAL ROLL/ })[act](); await stage(p, "COACH_SELECT"); await p.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await p.waitForTimeout(400);
  const player = await box(p, '.ec-ta-team[data-team="gold"] .ec-pc'), coach = await box(p, ".ec-coach-card"), actions = await box(p, ".ec-coach-action"), toggles = await box(p, ".ec-coach-detail-toggle");
  const rowVariant = await p.locator(".ec-coach-card--row").count();
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const medianH = (a) => { const s = a.map((r) => r.h).sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  measures[name] = { playerRowH: medianH(player), coachRowH: medianH(coach), coachRows: coach.map((r) => r.h), actions, toggles, rowVariant, overflow };
  if (mobile) {
    ok(`${name}: the three offers are rows`, rowVariant === 3 && coach.length === 3, `rows=${rowVariant}`);
    // A player row grows with a two-line name; the base geometry is its shortest
    // row (56px minimum), and every coach row must sit within 14px of that.
    const baseRow = Math.min(...player.map((r) => r.h));
    ok(`${name}: a coach row is the size of a player row (within 14px of the base row)`, coach.every((r) => Math.abs(r.h - baseRow) <= 14), `player rows ${player.map((r) => r.h).join("/")}px · coach ${coach.map((r) => r.h).join("/")}px`);
    ok(`${name}: every coach control is a 44px target`, actions.every((r) => r.h >= 44 && r.w >= 44) && toggles.every((r) => r.h >= 44 && r.w >= 44), `actions ${actions.map((r) => `${r.w}×${r.h}`).join(" ")} · toggles ${toggles.map((r) => `${r.w}×${r.h}`).join(" ")}`);
    ok(`${name}: no horizontal overflow`, overflow <= 0, `${overflow}px`);
    // The whole coach list sits under the five without leaving the screen's worth of scrolling the cards needed
    const list = await p.evaluate(() => { const r = document.querySelector(".ec-cc-offers").getBoundingClientRect(); return Math.round(r.height); });
    ok(`${name}: the three offers together are shorter than one old card (232px)`, list < 232, `${list}px`);
    await p.locator(".ec-cc-offers").scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/screens/coach-rows-${name}.png` });
    // Open one scouting detail: only that row grows
    const before = await box(p, ".ec-coach-card");
    await p.locator(".ec-coach-detail-toggle").first()[act](); await p.waitForTimeout(250);
    const after = await box(p, ".ec-coach-card");
    ok(`${name}: opening a scouting detail grows that row only`, after[0].h > before[0].h && after[1].h === before[1].h && after[2].h === before[2].h, `${before.map((r) => r.h).join("/")} → ${after.map((r) => r.h).join("/")}`);
    await p.screenshot({ path: `${OUT}/screens/coach-rows-${name}-detail.png` });
    await p.locator(".ec-coach-detail-toggle").first()[act](); await p.waitForTimeout(200);
    // Select a staff: the row reads selected and the primary action is enabled
    await p.locator(".ec-coach-action:not([disabled])").nth(1)[act](); await p.waitForTimeout(250);
    const sel = await p.locator('.ec-coach-card[data-on="true"]').count(), cta = await p.getByRole("button", { name: /CONTINUE WITH COACH/ }).isEnabled();
    ok(`${name}: one selected staff, CONTINUE WITH COACH enabled`, sel === 1 && cta, `selected=${sel}`);
    await p.screenshot({ path: `${OUT}/screens/coach-rows-${name}-selected.png` });
  } else {
    // The desktop card is untouched: the frozen 248px width, and the 232px
    // minimum that the Light Court type already sat above (243px on the live
    // site before this change).
    ok(`${name}: the desktop keeps its three coach cards`, rowVariant === 0 && coach.length === 3 && coach.every((r) => r.w === 248 && r.h >= 232 && r.h <= 256), `cards ${coach.map((r) => `${r.w}×${r.h}`).join(" ")}`);
    await p.screenshot({ path: `${OUT}/screens/coach-cards-${name}.png` });
  }
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/coach-rows.json`, JSON.stringify({ artifact: "coach-rows", origin: BASE, recordedAt: new Date().toISOString(), rule: "phone coach offers are rows within 14px of the player rows; every control ≥ 44px; the desktop cards are untouched", measures, checks: rows, pass: failures === 0 }, null, 2) + "\n");
console.log(`\ncoach rows: ${rows.length - failures}/${rows.length} checks passed → ${OUT}/coach-rows.json`);
process.exit(failures ? 1 : 0);
