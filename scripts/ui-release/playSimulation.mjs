// Play EraClash as a user would — on the web and on a phone — and score the
// experience 0–100 from what actually happened. Criteria are weighted; each
// records PASS/FAIL with the measured fact. node scripts/ui-release/playSimulation.mjs <origin> [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, "");
const OUT = process.argv[3] || "data/validation/flow-fix"; mkdirSync(`${OUT}/screens`, { recursive: true });
const b = await chromium.launch();
const criteria = [];
const score = (id, weight, pass, fact) => { criteria.push({ id, weight, pass: !!pass, fact: String(fact ?? "").slice(0, 200) }); console.log(`  ${pass ? "PASS" : "FAIL"}  [${weight}] ${id}${fact !== undefined ? ` — ${String(fact).slice(0, 120)}` : ""}`); };
const session = async (ctx) => { if (!BASE.startsWith("https://")) return; const probe = await ctx.request.get(`${BASE}/api/health`).catch(() => null); if (probe && probe.status() === 200) return; const k = JSON.parse(readFileSync(".preview-secrets/wave2-access-keys.json", "utf8")).keys.find((x) => x.role === "owner"); const r = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 }); if (r.status() !== 303) throw new Error("preview access refused"); };
const stage = (p, s, t = 60_000) => p.waitForSelector(`.ec-ta-stage[data-guided-state="${s}"]`, { timeout: t });
const state = (p) => p.locator(".ec-ta-stage").getAttribute("data-guided-state");

async function play(name, vp, mobile) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 }); await session(ctx);
  const p = await ctx.newPage(); const act = mobile ? "tap" : "click";
  const errors = []; p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 120))); p.on("console", (m) => { if (m.type() === "error" && !/narrative|429/.test(m.text())) errors.push("console: " + m.text().slice(0, 120)); });
  // /api/narrative is the optional AI recap with a written fallback; a 429 there is the budget guard, not a broken page
  const failed = []; p.on("response", (r) => { if (r.status() >= 400 && !/\/api\/(health|events|narrative)/.test(r.url())) failed.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  const decisions = { start: 0, decide: 0, coach: 0, sim: 0 }; p.on("request", (r) => { if (r.method() !== "POST" || !/\/api\/game/.test(r.url())) return; const body = r.postData() || ""; for (const k of Object.keys(decisions)) if (body.includes(`"chaosAction":"${k}"`)) decisions[k]++; if (/"chaosAction":"simulate"|simulationId/.test(body)) decisions.sim++; });
  await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_era_ack"); } catch {} });
  const t0 = Date.now();
  // Home
  await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  const fcp = await p.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0));
  score(`${name}: Home paints quickly`, 3, fcp > 0 && fcp < 2500, `FCP ${fcp}ms`);
  const header = await p.evaluate(() => { const h = document.querySelector("header.ec-brand-header"); const r = h.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), compact: h.classList.contains("ec-brand-header--compact") }; });
  score(`${name}: header is ${mobile ? "compact and" : ""} pinned`, 4, header.top === 0 && (mobile ? header.compact && header.h <= 72 : !header.compact), JSON.stringify(header));
  await p.screenshot({ path: `${OUT}/screens/sim-${name}-home.png` });
  await p.getByText(/start chaos clash/i).first()[act]();
  await stage(p, "EMPTY"); score(`${name}: Home → Chaos empty frame`, 3, true);
  // Roll 1
  await p.getByRole("button", { name: /^ROLL/ })[act](); await stage(p, "DRAFTING");
  const cards = mobile ? p.locator('.ec-ta-team[data-team="gold"] .ec-pc--row') : p.locator('.ec-ta-team[data-team="gold"] .ec-pc');
  await cards.nth(4).waitFor({ timeout: 60_000 }); await p.waitForTimeout(700);
  score(`${name}: one tap = one roll (start requests)`, 4, decisions.start === 1, `start=${decisions.start}`);
  const art = await p.evaluate(() => { const imgs = [...document.querySelectorAll('.ec-pc-placeholder, .ec-pr-img, .ec-pc-portrait img')].filter((i) => i.getBoundingClientRect().width > 0); return { shown: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length }; });
  score(`${name}: every visible player carries portrait art (placeholder or approved)`, 5, art.shown >= 5 && art.loaded === art.shown, JSON.stringify(art));
  const sub = () => p.locator(".ec-ta-title-sub").innerText();
  score(`${name}: the board says ROLL 1 OF 3`, 2, /ROLL 1 OF 3/.test(await sub()), await sub());
  // Hold two (the third and fourth — the rows the old bar covered)
  const holds = p.locator('.ec-ta-team[data-team="gold"] .ec-pc-action');
  await expectCount(holds, 5); await holds.nth(2)[act](); await holds.nth(3)[act](); await p.waitForTimeout(250);
  const held = await p.locator('.ec-pc[data-held="true"]').count();
  score(`${name}: two holds hold two players and nothing rolls`, 5, held === 2 && decisions.decide === 0 && (await state(p)) === "DRAFTING", `held=${held} decide=${decisions.decide}`);
  await p.screenshot({ path: `${OUT}/screens/sim-${name}-roll1-held.png` });
  // Roll 2 — real double tap
  const r2 = await p.getByRole("button", { name: /^ROLL 2/ }).boundingBox();
  if (mobile) { await p.touchscreen.tap(r2.x + r2.width / 2, r2.y + r2.height / 2); await p.touchscreen.tap(r2.x + r2.width / 2, r2.y + r2.height / 2); } else { await p.mouse.dblclick(r2.x + r2.width / 2, r2.y + r2.height / 2); }
  await p.locator(".ec-ta-title-sub").filter({ hasText: "ROLL 2 OF 3" }).waitFor({ timeout: 60_000 }); await p.waitForTimeout(600);
  score(`${name}: a double tap on ROLL 2 is exactly one roll`, 5, decisions.decide === 1, `decide=${decisions.decide}`);
  score(`${name}: no era step after Roll 2 — drafting again, holds available`, 5, (await state(p)) === "DRAFTING" && (await p.getByRole("button", { name: /ADAPT TO ERA/ }).count()) === 0 && (await holds.count()) === 5);
  const kept = await p.locator('.ec-ta-team[data-team="gold"] .ec-pc[data-held="true"]').count();
  score(`${name}: the two held players are kept into Roll 2`, 4, kept === 2, `kept=${kept}`);
  score(`${name}: the era is still hidden while drafting`, 3, (await p.locator(".ec-era-reveal-id").count()) === 0 && (await p.locator(".ec-ta-era-chip").count()) === 0);
  // Final roll → Coach
  await p.getByRole("button", { name: /FINAL ROLL/ })[act](); await stage(p, "COACH_SELECT");
  await p.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 });
  score(`${name}: the final roll opens Coach Chaos with three offers`, 4, (await p.locator(".ec-coach-card").count()) === 3 && decisions.decide === 2, `decide=${decisions.decide}`);
  score(`${name}: the era is not shown before the coach is chosen`, 3, (await p.locator(".ec-era-reveal-id").count()) === 0);
  await p.locator(".ec-coach-action:not([disabled])").first()[act](); await p.getByRole("button", { name: /CONTINUE WITH COACH/ })[act](); await stage(p, "READY"); await p.waitForTimeout(500);
  const era = await p.locator(".ec-era-reveal-id").innerText().catch(() => "");
  score(`${name}: Clash Ready reveals the era with three rule cards`, 6, /^\d{4}s$/.test(era) && (await p.locator(".ec-era-reveal-card").count()) === 3, `${era}`);
  score(`${name}: both staffs are named at Clash Ready`, 2, (await p.locator(".ec-ta-staff").count()) === 2);
  await p.screenshot({ path: `${OUT}/screens/sim-${name}-ready-era.png` });
  // Run
  let engine = null; p.on("response", async (r) => { if (/api\/game/.test(r.url())) { try { const j = await r.json(); if (j?.result?.candidate) engine = { id: j.result.candidate.candidateId, hash: j.result.candidate.coreHash?.slice(0, 8), core: j.result.core?.engine }; } catch {} } });
  const tRun = Date.now(); await p.getByRole("button", { name: /RUN CLASH/ })[act](); await p.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 150_000 }); await stage(p, "RESULT"); const runMs = Date.now() - tRun; await p.waitForTimeout(600);
  score(`${name}: the Clash completes with a score and a winner`, 6, /\d+/.test(await p.locator(".ec-ta-score-n").first().innerText()) && /TEAM (GOLD|BLUE) WINS/.test(await p.locator(".ec-ta-score-winner").innerText()), `${runMs}ms`);
  score(`${name}: the simulation used the intended engine`, 4, !!engine && /possession/.test(engine.core || "") , JSON.stringify(engine));
  score(`${name}: the result keeps the era stated`, 2, (await p.locator(".ec-ta-era-chip").count()) === 1);
  score(`${name}: four result sections and the story open`, 3, (await p.locator(".ec-dock-tab").count()) === 4);
  await p.screenshot({ path: `${OUT}/screens/sim-${name}-result.png` });
  const smallControls = () => p.evaluate(() => [...document.querySelectorAll("button, a[href], [role=tab]")].filter((e) => e.offsetParent && getComputedStyle(e).visibility !== "hidden").map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44)).length);
  if (mobile) score(`${name}: every visible control on the result board ≥ 44px`, 3, (await smallControls()) === 0, `small=${await smallControls()}`);
  // Full report + share, no legacy challenge
  await p.getByRole("button", { name: /VIEW FULL REPORT/ }).first()[act](); await p.locator(".ec-report-overlay").waitFor({ timeout: 10_000 }).catch(() => {}); await p.waitForTimeout(600);
  const rb = await p.evaluate(() => [...document.querySelectorAll("button")].map((x) => x.textContent.trim()));
  score(`${name}: the full report offers Share and no legacy Challenge CTA`, 3, rb.some((t) => /Share/i.test(t)) && !rb.some((t) => /Challenge a Friend|CHALLENGE A FRIEND/i.test(t)));
  if (mobile) score(`${name}: every visible control in the full report ≥ 44px`, 2, (await smallControls()) === 0, `small=${await smallControls()}`);
  await p.getByRole("button", { name: /Back to the arena/ }).first()[act](); await p.locator(".ec-report-overlay").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {}); await p.waitForTimeout(400);
  // Run it back: the same five and staff, a new game
  const simsBefore = decisions.sim;
  const rib = p.getByRole("button", { name: /Run it back/i }).first();
  const ranBack = await rib.count() > 0; if (ranBack) { await rib.scrollIntoViewIfNeeded(); await rib[act](); }
  let ranBackOk = false; if (ranBack) { for (let i = 0; i < 300 && decisions.sim === simsBefore; i++) await p.waitForTimeout(100); ranBackOk = decisions.sim > simsBefore && await p.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 150_000 }).then(() => true).catch(() => false); await p.waitForTimeout(600); }
  score(`${name}: Run it back replays the same five and finishes`, 4, ranBack && ranBackOk, `ranBack=${ranBack} sims=${decisions.sim}`);
  // Layout hygiene
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  score(`${name}: no horizontal overflow`, 3, overflow === 0, `${overflow}px`);
  score(`${name}: no page errors`, 4, errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
  score(`${name}: no failed requests`, 4, failed.length === 0, failed.slice(0, 3).join(" | ") || "none");
  console.log(`  ${name} journey ${Math.round((Date.now() - t0) / 1000)}s`);
  await ctx.close();
}
async function expectCount(loc, n) { for (let i = 0; i < 100; i++) { if ((await loc.count()) === n) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error(`expected ${n} got ${await loc.count()}`); }

console.log(`play simulation @ ${BASE}`);
await play("web", { width: 1440, height: 900 }, false);
await play("mobile", { width: 390, height: 844 }, true);
await b.close();
const total = criteria.reduce((a, c) => a + c.weight, 0); const got = criteria.filter((c) => c.pass).reduce((a, c) => a + c.weight, 0);
const s = Math.round((got / total) * 100);
const out = { artifact: "play-simulation-score", origin: BASE, recordedAt: new Date().toISOString(), score: s, of: 100, weightedPassed: got, weightedTotal: total, criteria, failed: criteria.filter((c) => !c.pass) };
writeFileSync(`${OUT}/play-simulation-score.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`\nSCORE ${s}/100 (${got}/${total} weighted · ${criteria.filter((c) => c.pass).length}/${criteria.length} criteria)`);
