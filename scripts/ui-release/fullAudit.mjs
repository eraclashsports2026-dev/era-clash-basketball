// ── Full product audit: web + phone, every route, the whole Chaos journey ─────
// One run = one scored audit. It walks every public route on a desktop and a
// phone, plays a complete Chaos Clash on both (plus a landscape phone and a
// tablet through the draft), opens the menus, modals, report tabs and the era
// rules, reloads mid-run, and checks the things a user would notice: overlaps,
// hidden content, clipped text, broken images, console and network errors,
// horizontal overflow, tap targets, document metadata, redirects, the API's
// health, and the result's arithmetic. Every owner-reported defect has its own
// regression check. Weighted criteria → a 0–100 satisfaction score.
//   node scripts/ui-release/fullAudit.mjs <baseUrl> <outDir> <auditNumber>
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, "");
const OUT = process.argv[3] || "data/validation/audit"; const N = process.argv[4] || "1";
const SHOTS = `${OUT}/screens/audit-${N}`; mkdirSync(SHOTS, { recursive: true });
const b = await chromium.launch(); const criteria = []; const findings = [];
const check = (id, weight, pass, fact = "") => { criteria.push({ id, weight, pass: !!pass, fact: String(fact ?? "").slice(0, 300) }); if (!pass) findings.push({ id, fact: String(fact ?? "").slice(0, 300) }); console.log(`  ${pass ? "PASS" : "FAIL"}  [${weight}] ${id}${fact ? ` — ${String(fact).slice(0, 160)}` : ""}`); };
const session = async (ctx) => { if (!BASE.startsWith("https://")) return; const probe = await ctx.request.get(`${BASE}/api/health`).catch(() => null); if (probe && probe.status() === 200) return; const f = ".preview-secrets/wave2-access-keys.json"; if (!existsSync(f)) throw new Error("gated preview and no keys on disk"); const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner"); await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 }); };
const stage = (p, s, t = 60_000) => p.waitForSelector(`.ec-ta-stage[data-guided-state="${s}"]`, { timeout: t });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IGNORED_REQ = /\/api\/(health|events|narrative)|\/api\/profile$/; // narrative: budget-guarded AI recap with a written fallback; profile: answers 503 on the provider-less harness
const wire = (p, bag) => {
  p.on("pageerror", (e) => bag.pageErrors.push(e.message.slice(0, 160)));
  p.on("console", (m) => { if (m.type() !== "error") return; const at = m.location?.()?.url || ""; if (/narrative|429|favicon/.test(m.text()) || IGNORED_REQ.test(at)) return; bag.consoleErrors.push(`${m.text().slice(0, 120)}${at ? ` @ ${at.replace(BASE, "").slice(0, 60)}` : ""}`); });
  p.on("response", (r) => { if (r.status() >= 400 && !IGNORED_REQ.test(r.url())) bag.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 100)}`); });
  p.on("requestfailed", (r) => { if (!IGNORED_REQ.test(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || "")) bag.failed.push(`FAILED ${r.url().replace(BASE, "").slice(0, 100)} ${r.failure()?.errorText || ""}`); });
};
const fresh = () => ({ pageErrors: [], consoleErrors: [], failed: [] });
// What a user would notice on any page.
const pageFacts = (p, mobile) => p.evaluate((mobile) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const controls = [...document.querySelectorAll("button, a[href], [role=button], [role=tab], input, select, textarea, summary")].filter(vis);
  const small = controls.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).filter((e) => !e.closest("footer")).map((e) => `${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  const imgs = [...document.querySelectorAll("img")].filter(vis);
  const broken = imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => (i.getAttribute("src") || "").slice(0, 80));
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt") && i.getAttribute("aria-hidden") !== "true" && !i.closest("[aria-hidden=true]")).length;
  const unnamed = controls.filter((e) => !(e.textContent || "").trim() && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !e.getAttribute("title") && !e.querySelector("img[alt]") && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest("label")).map((e) => `${e.tagName.toLowerCase()}#${e.id || ""}.${(e.className || "").toString().split(" ")[0]}`);
  // Clipped text: a text node whose box is wider than its clipping ancestor, without a deliberate ellipsis.
  const clipped = [...document.querySelectorAll("h1,h2,h3,p,span,div,button,a,li,dt,dd,td,th")].filter(vis).filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2).filter((e) => { const cs = getComputedStyle(e); if (cs.textOverflow === "ellipsis" || cs.whiteSpace === "nowrap" && cs.overflow === "hidden") return false; return e.scrollWidth > e.clientWidth + 2 && cs.overflow !== "visible"; }).map((e) => `${e.tagName.toLowerCase()} "${e.textContent.trim().slice(0, 30)}"`);
  // Anything fixed or sticky that covers a control it is not part of.
  const overlays = [...document.querySelectorAll("*")].filter((e) => { const cs = getComputedStyle(e); return (cs.position === "fixed" || cs.position === "sticky") && vis(e); });
  const covered = [];
  for (const o of overlays) { const r = o.getBoundingClientRect(); for (const c of controls) { if (o.contains(c) || c.contains(o)) continue; const cr = c.getBoundingClientRect(); const ix = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left)), iy = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top)); if (ix * iy > 0.3 * cr.width * cr.height && cr.top >= 0 && cr.bottom <= innerHeight) { const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2); if (hit && !c.contains(hit) && !hit.contains(c)) covered.push(`${(c.textContent || c.getAttribute("aria-label") || "").trim().slice(0, 24)} under ${o.className.toString().split(" ")[0] || o.tagName}`); } } }
  const h1 = document.querySelectorAll("h1").length;
  return {
    title: document.title, lang: document.documentElement.lang, viewportMeta: !!document.querySelector('meta[name=viewport]'), description: !!document.querySelector('meta[name=description]')?.content,
    h1, main: !!document.querySelector("main"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    smallTargets: mobile ? small : [], broken, noAlt, unnamed, clipped: clipped.slice(0, 8), covered: [...new Set(covered)].slice(0, 6),
    inputZoom: mobile ? [...document.querySelectorAll("input, select, textarea")].filter(vis).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length : 0,
    text: document.body.innerText.slice(0, 4000),
  };
}, mobile);
const routeAudit = async (ctx, name, mobile) => {
  const routes = ["/", "/play", "/play/chaos", "/play/dream", "/leaderboard", "/my-eraclash", "/membership", "/fantasy/live", "/modes/chaos", "/player/00000000000000000000", "/challenge/EC-ZZZZ-ZZZZ", "/this-route-does-not-exist"];
  for (const route of routes) {
    const p = await ctx.newPage(); const bag = fresh(); wire(p, bag);
    await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); } catch {} });
    const resp = await p.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    await sleep(400);
    const f = await pageFacts(p, mobile);
    const slug = route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
    await p.screenshot({ path: `${SHOTS}/${name}-route-${slug}.png` });
    const blank = f.text.trim().length < 40;
    const notFound = /not found|doesn.t exist|no such page|404|nothing here|couldn.t find/i.test(f.text);
    check(`${name} ${route}: renders (HTTP ${resp?.status() ?? "none"}), not blank, no page error`, 3, resp && resp.status() < 500 && !blank && bag.pageErrors.length === 0, [bag.pageErrors[0], blank ? "blank" : ""].filter(Boolean).join(" · "));
    if (route === "/this-route-does-not-exist") check(`${name} unknown route: says so and offers a way home (in-app notice, or the branded 404 page)`, 2, notFound && /home|play|back|lobby/i.test(f.text) && (!resp || [200, 404].includes(resp.status())), `${resp?.status()} ${f.text.replace(/\s+/g, " ").slice(0, 100)}`);
    if (route === "/player/00000000000000000000") check(`${name} unknown profile slug: says the profile is not available (or could not be loaded), no page error`, 2, /not available|could not be loaded|not found|private|unavailable/i.test(f.text) && bag.pageErrors.length === 0, f.text.replace(/\s+/g, " ").slice(0, 120));
    if (route === "/this-route-does-not-exist") { bag.failed = bag.failed.filter((x) => !/^404 GET \/this-route-does-not-exist/.test(x)); bag.consoleErrors = bag.consoleErrors.filter((x) => !/404[^@]*@ \/this-route-does-not-exist/.test(x)); }
    check(`${name} ${route}: no console errors, no failed requests`, 2, bag.consoleErrors.length === 0 && bag.failed.length === 0, [...bag.consoleErrors, ...bag.failed].slice(0, 3).join(" · "));
    check(`${name} ${route}: no horizontal overflow`, 3, f.overflow <= 0, `${f.overflow}px`);
    check(`${name} ${route}: every visible image loads; images have alt or are decorative`, 2, f.broken.length === 0 && f.noAlt === 0, `broken ${f.broken.length} noAlt ${f.noAlt} ${f.broken.slice(0, 2).join(" ")}`);
    check(`${name} ${route}: nothing fixed or sticky covers a control`, 3, f.covered.length === 0, f.covered.join(" · "));
    check(`${name} ${route}: no clipped text`, 1, f.clipped.length === 0, f.clipped.slice(0, 3).join(" · "));
    check(`${name} ${route}: every control has an accessible name`, 2, f.unnamed.length === 0, f.unnamed.slice(0, 3).join(" · "));
    const leak = (f.text.match(/\b(undefined|NaN|Invalid Date|\[object Object\]|null)\b/g) || []);
    check(`${name} ${route}: no leaked code value in the copy (undefined, NaN, null, Invalid Date, [object Object])`, 3, leak.length === 0, leak.slice(0, 3).join(" "));
    check(`${name} ${route}: the fan-made / not-affiliated disclaimer is on the page`, 1, /not affiliated/i.test(f.text));
    check(`${name} ${route}: one h1, a main landmark, a title, lang and viewport meta`, 1, f.h1 === 1 && f.main && f.title.length > 3 && f.lang && f.viewportMeta, `h1=${f.h1} main=${f.main} title="${f.title.slice(0, 40)}" lang=${f.lang}`);
    if (mobile) { check(`${name} ${route}: every control is a 44px target`, 2, f.smallTargets.length === 0, f.smallTargets.slice(0, 4).join(" · ")); check(`${name} ${route}: no input below 16px (iOS zoom)`, 1, f.inputZoom === 0, `${f.inputZoom}`); }
    await p.close();
  }
};
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; }, sel);
const headerBottom = (p) => p.evaluate(() => Math.round(document.querySelector("header")?.getBoundingClientRect().bottom || 0));
// Does the element PAINT? A control can exist, be enabled and even be tappable
// while an opaque layer draws over it (the phone's cream atmosphere did this to
// the in-flow action bar). Sample the screenshot inside the element and compare
// it with the stage background beside it.
const paints = async (p, sel) => {
  const el = p.locator(sel).first(); if (!(await el.count())) return null;
  await el.scrollIntoViewIfNeeded().catch(() => {}); await sleep(250);
  const r = await el.boundingBox(); if (!r || r.width < 8 || r.height < 8) return null;
  const png = (await p.screenshot()).toString("base64"); const dpr = await p.evaluate(() => devicePixelRatio || 1);
  return p.evaluate(async ({ png, r, dpr }) => {
    const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
    const avg = (x, y, w, h) => { const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr))).data; let a = [0, 0, 0], n = 0; for (let i = 0; i < d.length; i += 4) { a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; n++; } return a.map((v) => Math.round(v / n)); };
    const inside = avg(r.x + r.width * 0.1, r.y + r.height * 0.25, r.width * 0.8, r.height * 0.5);
    const stage = document.querySelector(".ec-ta-stage")?.getBoundingClientRect(); const bx = stage ? Math.max(0, stage.left + 2) : 0;
    const beside = avg(bx, r.y, 6, r.height);
    const dist = Math.hypot(inside[0] - beside[0], inside[1] - beside[1], inside[2] - beside[2]);
    return { inside, beside, dist, paints: dist > 12 };
  }, { png, r, dpr });
};
const ctaCovers = (p) => p.evaluate(() => { const w = document.querySelector(".ec-ta-cta-wrap"); if (!w) return null; const r = w.getBoundingClientRect(); return [...document.querySelectorAll(".ec-pc, .ec-coach-card, .ec-era-reveal, .ec-ta-staff")].filter((e) => { const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false; const ix = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)), iy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)); return ix * iy > 0.1 * b.width * b.height; }).length; });
const journey = async (ctx, name, mobile, { full = true, phone = mobile } = {}) => {
  const p = await ctx.newPage(); const bag = fresh(); wire(p, bag); const act = mobile ? "tap" : "click";
  // Seeded ONCE per tab: a reload inside the journey must keep the run it is meant to resume.
  await p.addInitScript(() => { try { if (sessionStorage.getItem("audit_seeded")) return; sessionStorage.setItem("audit_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_era_ack"); } catch {} });
  const t0 = Date.now();
  await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  await p.getByText(/start chaos clash/i).first()[act](); await stage(p, "EMPTY");
  check(`${name}: no ADAPT TO ERA anywhere at the start`, 3, (await p.getByText(/ADAPT TO ERA/i).count()) === 0);
  await p.getByRole("button", { name: /^ROLL/ })[act](); await stage(p, "DRAFTING"); await p.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 }); await sleep(700);
  const rollMs = Date.now() - t0;
  if (phone) { const hb = await headerBottom(p), ro = await box(p, ".ec-ta-roster"); check(`${name}: after Roll 1 the five sit under the pinned header`, 3, ro && ro.top >= hb - 2 && ro.top <= hb + 120, `roster top ${ro?.top} header ${hb}`); }
  check(`${name}: the primary action covers no row (Roll 1)`, 4, (await ctaCovers(p)) === 0, `${await ctaCovers(p)} covered`);
  const paintRoll = await paints(p, ".ec-ta-cta"); check(`${name}: the primary action actually paints on screen (Roll 1)`, 4, paintRoll?.paints === true, JSON.stringify(paintRoll));
  const roster = await p.evaluate(() => { const side = (t) => [...document.querySelectorAll(`.ec-ta-team[data-team="${t}"] .ec-pc`)].map((c) => ({ name: c.querySelector(".ec-pc-name")?.textContent.trim().replace(/KEPT$/, "").trim(), slot: c.dataset.slot || c.querySelector(".ec-pc-slot")?.textContent.trim(), ovr: parseInt(c.querySelector(".ec-pc-ovr")?.textContent, 10) })); return { gold: side("gold"), blue: side("blue") }; });
  const slots = (r) => r.map((x) => x.slot).join(","), names = (r) => r.map((x) => x.name);
  check(`${name}: each five fills PG, SG, SF, PF, C with a numeric rating`, 3, slots(roster.gold) === "PG,SG,SF,PF,C" && roster.gold.every((x) => x.ovr >= 30 && x.ovr <= 99) && (roster.blue.length === 0 || (slots(roster.blue) === "PG,SG,SF,PF,C" && roster.blue.every((x) => x.ovr >= 30 && x.ovr <= 99))), `${slots(roster.gold)} · ${roster.gold.map((x) => x.ovr).join("/")}`);
  if (roster.blue.length) check(`${name}: no player appears on both fives`, 4, names(roster.gold).every((n) => !names(roster.blue).includes(n)) && new Set(names(roster.gold)).size === 5, `${names(roster.gold).filter((n) => names(roster.blue).includes(n)).join(",") || "disjoint"}`);
  // No word of a name may be split across lines, and a KEPT badge stays one piece (360px phones broke both).
  const wrap = await p.evaluate(() => { const r = document.createRange(); const bad = []; for (const n of document.querySelectorAll(".ec-pc-name, .ec-coach-name")) { const t = n.firstChild; if (!t || t.nodeType !== 3) continue; const text = t.textContent; for (const w of text.trim().split(/\s+/)) { const i = text.indexOf(w); if (i < 0) continue; r.setStart(t, i); r.setEnd(t, i + w.length); if (r.getClientRects().length > 1) bad.push(`${w} split`); } const k = n.querySelector(".ec-pc-kept"); if (k && k.getBoundingClientRect().height > 20) bad.push("KEPT split"); } return bad; });
  check(`${name}: no player or coach name splits a word across lines; KEPT stays one badge`, 3, wrap.length === 0, wrap.slice(0, 3).join(" · "));
  const holdBtn = p.locator('.ec-ta-team[data-team="gold"] .ec-pc-action');
  await holdBtn.nth(1)[act](); await holdBtn.nth(3)[act](); await sleep(250);
  const heldInside = await p.evaluate(() => [...document.querySelectorAll('.ec-pc[data-held="true"]')].every((c) => { const r = c.getBoundingClientRect(), a = c.querySelector(".ec-pc-action")?.getBoundingClientRect(); return a && a.left >= r.left - 1 && a.right <= r.right + 1 && a.top >= r.top - 1 && a.bottom <= r.bottom + 1; }));
  check(`${name}: two holds, HELD controls contained in their rows/cards`, 3, (await p.locator('.ec-pc[data-held="true"]').count()) === 2 && heldInside, heldInside ? "" : await p.evaluate(() => [...document.querySelectorAll('.ec-pc[data-held="true"]')].map((c) => { const r = c.getBoundingClientRect(), a = c.querySelector(".ec-pc-action")?.getBoundingClientRect(); return a ? `action bottom ${Math.round(a.bottom - r.bottom)}px past the card` : "no action"; }).join(" · ")));
  const labelOrder = await p.evaluate(() => { const y = (s) => { const e = document.querySelector(s); const r = e?.getBoundingClientRect(); return r && r.height > 0 ? Math.round(r.top) : null; }; return { goldLabel: y('.ec-ta-team-label:not(.ec-ta-team-label--blue), .ec-ta-team-caption[data-team="gold"]'), blueLabel: y('.ec-ta-team-label--blue, .ec-ta-team-caption[data-team="blue"]'), goldRow: y('.ec-ta-team[data-team="gold"] .ec-pc'), blueRow: y('.ec-ta-team[data-team="blue"] .ec-pc'), toggle: !!document.querySelector(".ec-ta-team-toggle") }; });
  if (!labelOrder.toggle && labelOrder.blueLabel !== null && labelOrder.goldRow !== null && labelOrder.blueRow !== null && labelOrder.goldRow !== labelOrder.blueRow) check(`${name}: each team's label sits with its own row when the rosters stack`, 3, labelOrder.blueLabel > labelOrder.goldRow, JSON.stringify(labelOrder));
  await p.waitForFunction(() => [...document.querySelectorAll(".ec-pc-placeholder, .ec-pr-img, .ec-pc-portrait img")].filter((i) => i.getBoundingClientRect().width > 0).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
  const art = await p.evaluate(() => { const imgs = [...document.querySelectorAll(".ec-pc-placeholder, .ec-pr-img, .ec-pc-portrait img")].filter((i) => i.getBoundingClientRect().width > 0); return { shown: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length }; });
  check(`${name}: every visible player carries portrait art`, 4, art.shown >= 5 && art.loaded === art.shown, JSON.stringify(art));
  if (phone) check(`${name}: no atmosphere band under the pinned header (crowd/grain hidden)`, 3, await p.evaluate(() => [".ec-ta-crowd", ".ec-ta-grain"].every((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === "none"; })));
  await p.screenshot({ path: `${SHOTS}/${name}-drafting-held.png` });
  await p.getByRole("button", { name: /^ROLL 2/ })[act](); await p.locator(".ec-ta-title-sub").filter({ hasText: "ROLL 2 OF 3" }).waitFor({ timeout: 60_000 }); await sleep(500);
  check(`${name}: Roll 2 keeps the two held players and shows no era`, 4, (await p.locator('.ec-ta-team[data-team="gold"] .ec-pc[data-held="true"]').count()) === 2 && (await p.locator(".ec-era-reveal-id, .ec-ta-era-chip").count()) === 0 && (await p.getByText(/ADAPT TO ERA/i).count()) === 0);
  if (!full) { await p.screenshot({ path: `${SHOTS}/${name}-roll2.png` }); check(`${name}: no page errors, console errors or failed requests through Roll 2`, 3, bag.pageErrors.length + bag.consoleErrors.length + bag.failed.length === 0, [...bag.pageErrors, ...bag.consoleErrors, ...bag.failed].slice(0, 3).join(" · ")); await p.close(); return; }
  await p.getByRole("button", { name: /FINAL ROLL/ })[act](); await stage(p, "COACH_SELECT"); await p.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await sleep(900);
  if (phone) { const hb = await headerBottom(p), co = await box(p, ".ec-ta-coach"); check(`${name}: after the final roll the coach offers sit under the pinned header`, 4, co && co.top >= hb - 2 && co.top <= hb + 120, `coach top ${co?.top} header ${hb}`); const rows = await p.evaluate(() => [...document.querySelectorAll(".ec-coach-card")].map((e) => Math.round(e.getBoundingClientRect().height))); check(`${name}: coach offers are compact rows (≤ 72px)`, 3, rows.length === 3 && rows.every((h) => h <= 72), rows.join("/")); }
  check(`${name}: the primary action covers no offer (Coach Chaos)`, 4, (await ctaCovers(p)) === 0, `${await ctaCovers(p)} covered`);
  const paintCoach = await paints(p, ".ec-ta-cta"); check(`${name}: CONTINUE WITH COACH paints on screen while disabled`, 4, paintCoach?.paints === true, JSON.stringify(paintCoach));
  const paintReset = await paints(p, ".ec-ta-stage-actions button"); check(`${name}: RESET paints on screen`, 2, paintReset === null || paintReset.paints === true, JSON.stringify(paintReset));
  check(`${name}: three offers with distinct coaches and distinct roles`, 3, await p.evaluate(() => { const c = [...document.querySelectorAll(".ec-coach-card")]; const names = c.map((e) => e.querySelector(".ec-coach-name")?.textContent.trim()), roles = c.map((e) => e.dataset.role); return c.length === 3 && new Set(names).size === 3 && new Set(roles).size === 3; }));
  const ctaBefore = await p.getByRole("button", { name: /CONTINUE WITH COACH/ }).isEnabled();
  await p.screenshot({ path: `${SHOTS}/${name}-coach.png` });
  // Details opens one row/card only
  const tog = p.locator(".ec-coach-detail-toggle").first(); if (await tog.count()) { await tog[act](); await sleep(250); check(`${name}: Scouting detail opens on one offer and reads`, 2, (await p.locator('.ec-coach-card[data-open="true"]').count()) === 1); await tog[act](); }
  await p.locator(".ec-coach-action:not([disabled])").nth(1)[act](); await sleep(300);
  check(`${name}: selecting a staff enables CONTINUE WITH COACH (disabled before)`, 3, !ctaBefore && (await p.getByRole("button", { name: /CONTINUE WITH COACH/ }).isEnabled()));
  await p.getByRole("button", { name: /CONTINUE WITH COACH/ })[act](); await stage(p, "READY"); await sleep(900);
  const era = await p.locator(".ec-era-reveal-id").innerText().catch(() => "");
  check(`${name}: Clash Ready reveals the era with three rule cards, above RUN CLASH`, 5, /^\d{4}s$/.test(era) && (await p.locator(".ec-era-reveal-card").count()) === 3 && (await p.evaluate(() => { const e = document.querySelector(".ec-era-reveal")?.getBoundingClientRect(), c = document.querySelector(".ec-ta-cta")?.getBoundingClientRect(); return e && c && e.bottom <= c.top + 1; })), era);
  if (phone) { const hb = await headerBottom(p), st = await box(p, ".ec-ta-staff-row"); check(`${name}: at Clash Ready the staff and era sit under the pinned header`, 4, st && st.top >= hb - 2 && st.top <= hb + 120, `staff top ${st?.top} header ${hb}`); }
  check(`${name}: the primary action covers nothing at Clash Ready`, 4, (await ctaCovers(p)) === 0, `${await ctaCovers(p)} covered`);
  const paintRun = await paints(p, ".ec-ta-cta"); check(`${name}: RUN CLASH paints on screen`, 4, paintRun?.paints === true, JSON.stringify(paintRun));
  const chip = await p.locator(".ec-ta-era-chip").first().innerText().catch(() => ""); check(`${name}: the era chip and the era panel agree`, 2, !chip || chip.includes(era), `${chip} vs ${era}`);
  const staff = await p.evaluate(() => [...document.querySelectorAll(".ec-ta-staff-v")].map((e) => e.textContent.trim()));
  check(`${name}: both benches are staffed by different coaches`, 3, staff.length === 2 && staff[0] && staff[1] && staff[0] !== staff[1], staff.join(" vs "));
  await p.screenshot({ path: `${SHOTS}/${name}-ready.png` });
  // Era rules modal opens and closes
  const rules = p.getByRole("button", { name: /VIEW ALL ERA RULES/i }); if (await rules.count()) { await rules.first()[act](); await sleep(400); const open = await p.evaluate(() => !!document.querySelector('[role="dialog"], .ec-guide-overlay, .ec-report-overlay, .ec-glossary')); check(`${name}: VIEW ALL ERA RULES opens a readable panel`, 2, open); await p.keyboard.press("Escape"); await sleep(300); const closeBtn = p.getByRole("button", { name: /close|back to the arena/i }); if (await closeBtn.count()) await closeBtn.first()[act]().catch(() => {}); await sleep(300); }
  // Reload mid-run resumes Clash Ready
  await p.reload({ waitUntil: "networkidle" }); await stage(p, "READY", 60_000).catch(() => {});
  check(`${name}: a reload at Clash Ready resumes the same run (same era)`, 3, (await p.locator(".ec-era-reveal-id").innerText().catch(() => "")) === era, `${era}`);
  const tRun = Date.now(); await p.getByRole("button", { name: /RUN CLASH/ })[act](); await p.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 150_000 }); await stage(p, "RESULT"); const runMs = Date.now() - tRun; await sleep(800);
  const result = await p.evaluate(() => { const n = [...document.querySelectorAll(".ec-ta-score-n")].map((e) => parseInt(e.textContent, 10)); const winner = document.querySelector(".ec-ta-score-winner")?.textContent.trim() || ""; const dw = document.querySelector(".ec-ta-score")?.dataset.winner; const mvp = document.querySelector(".ec-ta-score-mvp")?.textContent.trim() || ""; const roster = [...document.querySelectorAll(".ec-pc-name")].map((e) => e.textContent.trim().toLowerCase()); return { n, winner, dw, mvp, mvpOnRoster: roster.some((r) => r && mvp.toLowerCase().includes(r.split(" ").slice(-1)[0])) }; });
  check(`${name}: the score, the winner label and data-winner agree`, 5, result.n.length >= 2 && result.n[0] !== result.n[1] && ((result.n[0] > result.n[1]) === (result.dw === "gold")) && new RegExp(result.dw === "gold" ? "GOLD" : "BLUE").test(result.winner), `${result.n.join("-")} ${result.winner}`);
  check(`${name}: the MVP is a player on one of the two rosters`, 2, result.mvpOnRoster, result.mvp);
  // At the result the primary action is gone (NEW CLASH is a stage action): null = nothing to cover.
  check(`${name}: the primary action covers nothing at the result`, 3, [0, null].includes(await ctaCovers(p)));
  await p.screenshot({ path: `${SHOTS}/${name}-result.png` });
  // Report: quarters add up, tabs switch
  const tabs = p.locator(".ec-report-overlay [role=tab], .ec-ta-rail [role=tab], [role=tablist] [role=tab]");
  if (await tabs.count()) {
    const box_ = tabs.filter({ hasText: /Box Score/i }); if (await box_.count()) { await box_.first()[act](); await sleep(400); }
    const q = await p.evaluate(() => { const rows = [...document.querySelectorAll("table tr")].map((tr) => [...tr.querySelectorAll("td,th")].map((c) => c.textContent.trim())); const byq = rows.filter((r) => /^(GOLD|BLUE)$/i.test(r[0] || "") && r.length >= 6 && r.slice(1).every((v) => /^\d+$/.test(v))); return byq.map((r) => { const nums = r.slice(1).map(Number); const total = nums[nums.length - 1]; const sum = nums.slice(0, -1).reduce((a, x) => a + x, 0); return { team: r[0], sum, total }; }); });
    if (q.length) check(`${name}: the by-quarter table adds up to each final`, 3, q.every((r) => r.sum === r.total), q.map((r) => `${r.team} ${r.sum}=${r.total}`).join(" · "));
    for (const t of ["Coaching", "Analysis"]) { const tab = tabs.filter({ hasText: new RegExp(t, "i") }); if (await tab.count()) { await tab.first()[act](); await sleep(350); check(`${name}: the ${t} tab shows content`, 1, (await p.evaluate(() => (document.querySelector('[role="tabpanel"]')?.innerText || document.body.innerText).trim().length > 40))); } }
  }
  check(`${name}: Run it back is offered after the result`, 2, (await p.getByRole("button", { name: /Run it back/i }).count()) >= 1);
  check(`${name}: no page errors, console errors or failed requests through the whole Clash`, 5, bag.pageErrors.length + bag.consoleErrors.length + bag.failed.length === 0, [...bag.pageErrors, ...bag.consoleErrors, ...bag.failed].slice(0, 3).join(" · "));
  check(`${name}: the first roll answers within 8s and the Clash within 90s`, 2, rollMs < 8000 && runMs < 90_000, `roll ${rollMs}ms · clash ${runMs}ms`);
  await p.close();
};
const extras = async (ctx, name, mobile) => {
  const p = await ctx.newPage(); const bag = fresh(); wire(p, bag); const act = mobile ? "tap" : "click";
  await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); } catch {} });
  await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  if (mobile) {
    const menu = p.getByRole("button", { name: "Menu" }); check(`${name}: the phone header shows a Menu and is at most 72px`, 3, (await menu.count()) === 1 && (await p.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().height))) <= 72);
    await menu[act](); await sleep(350); const items = await p.locator('[role="dialog"] a, [role="dialog"] button, .ec-menu-sheet a, .ec-menu-sheet button, nav a').count(); check(`${name}: the Menu opens with destinations`, 2, items >= 4, `${items} items`); await p.screenshot({ path: `${SHOTS}/${name}-menu.png` }); await p.keyboard.press("Escape"); await sleep(250);
    const closeBtn = p.getByRole("button", { name: /close/i }); if (await closeBtn.count()) await closeBtn.first()[act]().catch(() => {});
  }
  // The four header destinations, reached the way a user reaches them
  for (const dest of ["Daily", "Challenges", "Leaderboard", "My EraClash"]) {
    await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
    if (mobile) { await p.getByRole("button", { name: "Menu" })[act](); await sleep(300); }
    const scope = mobile ? p : p.locator("header");
    const item = scope.getByRole("button", { name: new RegExp(mobile ? dest : `^${dest}`) }).or(scope.getByRole("link", { name: new RegExp(mobile ? dest : `^${dest}`) })).or(scope.getByRole("menuitem", { name: new RegExp(dest) }));
    if (!(await item.count())) { check(`${name}: header destination ${dest} exists`, 2, false, "no control found"); continue; }
    await item.first()[act](); await sleep(700);
    const f = await pageFacts(p, mobile);
    const slug = dest.toLowerCase().replace(/\W+/g, "-");
    await p.screenshot({ path: `${SHOTS}/${name}-dest-${slug}.png` });
    check(`${name} → ${dest}: renders content, no overflow, nothing covered, no clipped text`, 3, f.text.trim().length > 80 && f.overflow <= 0 && f.covered.length === 0 && f.clipped.length === 0, `${f.overflow}px · ${f.covered.join(" ")} · ${f.clipped.join(" ")}`);
    check(`${name} → ${dest}: every image loads and no leaked code value`, 2, f.broken.length === 0 && (f.text.match(/\b(undefined|NaN|Invalid Date|\[object Object\])\b/g) || []).length === 0, f.broken.slice(0, 2).join(" "));
    if (mobile) check(`${name} → ${dest}: 44px targets`, 2, f.smallTargets.length === 0, f.smallTargets.slice(0, 3).join(" · "));
  }
  // Account control opens something sensible
  const acct = p.locator("header").getByRole("button").filter({ hasText: /account|sign|create|owner|guest/i }).first();
  const acctAny = (await acct.count()) ? acct : p.locator("header button").last();
  await acctAny[act](); await sleep(400); check(`${name}: the account control opens a panel or dialog`, 2, await p.evaluate(() => !!document.querySelector('[role="dialog"], [role="menu"], .ec-account-panel, .ec-sheet, form')));
  await p.screenshot({ path: `${SHOTS}/${name}-account.png` }); await p.keyboard.press("Escape"); await sleep(200);
  // How to play / glossary utilities on the Chaos board
  await p.goto(`${BASE}/play/chaos`, { waitUntil: "networkidle" }); await stage(p, "EMPTY");
  if (!mobile) { let reached = false; for (let i = 0; i < 40 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.classList.contains("ec-ta-cta")); } check(`${name}: the keyboard reaches the primary action within 40 tabs`, 2, reached); }
  // Browser back from the board returns to the lobby without an error
  await p.goBack({ waitUntil: "networkidle" }).catch(() => {}); await sleep(400); check(`${name}: browser Back from the board lands on the lobby`, 2, await p.evaluate(() => !!document.querySelector(".ec-lobby") || /\/play\/?$|\/$/.test(location.pathname)), await p.evaluate(() => location.pathname)); await p.goto(`${BASE}/play/chaos`, { waitUntil: "networkidle" }); await stage(p, "EMPTY");
  for (const label of [/how to play/i, /glossary/i]) { const btn = p.getByRole("button", { name: label }); if (await btn.count()) { await btn.first()[act](); await sleep(400); check(`${name}: ${label.source.replace(/\\/g, "")} opens a readable panel`, 1, await p.evaluate(() => (document.querySelector('[role="dialog"], .ec-guide-overlay, .ec-glossary, .ec-report-overlay')?.innerText || "").length > 80)); await p.keyboard.press("Escape"); await sleep(200); const c = p.getByRole("button", { name: /close|back to the arena/i }); if (await c.count()) await c.first()[act]().catch(() => {}); await sleep(200); } }
  check(`${name}: utilities produce no errors`, 2, bag.pageErrors.length + bag.consoleErrors.length + bag.failed.length === 0, [...bag.pageErrors, ...bag.consoleErrors, ...bag.failed].slice(0, 3).join(" · "));
  await p.close();
};
// ── Document, assets, redirects, API ─────────────────────────────────────────
const ctx0 = await b.newContext(); await session(ctx0);
{
  const r = await ctx0.request.get(`${BASE}/`); const html = await r.text();
  check("document: apple-touch-icon for the phone home screen", 1, /rel="apple-touch-icon"/.test(html));
  const og = (html.match(/property="og:image"[^>]*content="([^"]+)"/) || html.match(/content="([^"]+)"[^>]*property="og:image"/) || [])[1];
  if (og) { const ogUrl = /^https?:/.test(og) ? og : `${BASE}${og.startsWith("/") ? "" : "/"}${og}`; const o = await ctx0.request.get(ogUrl).catch(() => null); check("document: the og:image the share cards use actually serves", 2, !!o && o.status() === 200 && /image/.test(o.headers()["content-type"] || ""), `${o?.status()} ${ogUrl.replace(BASE, "")}`); }
  for (const icon of [...html.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1])) { const i = await ctx0.request.get(`${BASE}${icon.startsWith("/") ? "" : "/"}${icon}`).catch(() => null); check(`document: icon ${icon} serves`, 1, !!i && i.status() === 200, `${i?.status()}`); }
  const cc = r.headers()["cache-control"] || ""; check("document: index.html is revalidated (no long max-age / immutable), so a new deploy reaches phones", 2, !/immutable/.test(cc) && !/max-age=(?:[1-9]\d{3,})/.test(cc), cc || "(no cache-control)");
  check("document: title, description, viewport, theme-color, og tags, canonical or manifest", 2, /<title>[^<]{4,}/.test(html) && /name="description"/.test(html) && /name="viewport"/.test(html) && /property="og:title"|name="twitter:title"/.test(html) && /rel="manifest"|rel="canonical"/.test(html), `og:${/property="og:title"/.test(html)} manifest:${/rel="manifest"/.test(html)} theme:${/name="theme-color"/.test(html)}`);
  for (const asset of ["/manifest.webmanifest", "/manifest.json", "/sw.js", "/robots.txt", "/favicon.ico", "/favicon.svg"]) { const a = await ctx0.request.get(`${BASE}${asset}`).catch(() => null); if (a && a.status() === 200) check(`asset ${asset} serves`, 1, true, `${a.headers()["content-type"] || ""}`); }
  const manifestHref = (html.match(/rel="manifest"[^>]*href="([^"]+)"/) || [])[1]; if (manifestHref) { const m = await ctx0.request.get(`${BASE}${manifestHref.startsWith("/") ? "" : "/"}${manifestHref}`); check("manifest: 200 with a name and icons", 1, m.status() === 200 && /"name"/.test(await m.text())); }
  const h = await (await ctx0.request.get(`${BASE}/api/health?deep=1`)).json();
  check("api: health ok, core engine ok, persistence ok", 4, h.status === "ok" && h.coreEngine === "ok" && h.persistence === "ok", JSON.stringify({ status: h.status, core: h.coreEngine, persistence: h.persistence }));
  if (h.cloudAccounts?.providerConfigured) check("api: the account provider accepts the server credential", 4, h.cloudAccounts.serverCredentialAccepted === true, `probe ${h.cloudAccounts.serverCredentialProbeStatus}`);
  const bad = await ctx0.request.post(`${BASE}/api/game`, { data: { action: "nope" }, headers: { "content-type": "application/json" } });
  check("api: an unknown action is refused with a 4xx JSON error, not a 500", 2, bad.status() >= 400 && bad.status() < 500 && /error|code/.test(await bad.text()), `${bad.status()}`);
  const html404 = await ctx0.request.get(`${BASE}/this-route-does-not-exist`); check("routing: an unknown route still serves the app shell (SPA) or a 404 page", 1, [200, 404].includes(html404.status()), `${html404.status()}`);
  if (/eraclashbasketball\.com/.test(BASE)) {
    for (const [from, want] of [["https://eraclashbasketball.com/", /^https:\/\/www\.eraclashbasketball\.com/], ["http://www.eraclashbasketball.com/", /^https:\/\/www\.eraclashbasketball\.com/], ["http://eraclashbasketball.com/", /^https:\/\/(www\.)?eraclashbasketball\.com/]]) {
      const r2 = await ctx0.request.get(from, { maxRedirects: 0 }).catch(() => null); const loc = r2?.headers()["location"] || ""; check(`redirect: ${from} → www https`, 2, r2 && [301, 302, 307, 308].includes(r2.status()) && want.test(loc), `${r2?.status()} ${loc}`);
    }
    const sec = (await ctx0.request.get(`${BASE}/`)).headers(); check("headers: strict-transport-security and x-content-type-options present", 1, !!sec["strict-transport-security"] && !!sec["x-content-type-options"], JSON.stringify({ hsts: !!sec["strict-transport-security"], xcto: sec["x-content-type-options"] || null, xfo: sec["x-frame-options"] || null }));
  }
}
await ctx0.close();
// ── The site keeps its own palette under the OS dark mode and reduced motion ──
{
  const dark = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark", reducedMotion: "reduce" }); await session(dark);
  const p = await dark.newPage(); const bag = fresh(); wire(p, bag);
  await p.addInitScript(() => { try { localStorage.setItem("ec_seen", "1"); } catch {} });
  await p.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  const f = await p.evaluate(() => { const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const body = lum(getComputedStyle(document.body).backgroundColor), court = lum(getComputedStyle(document.querySelector(".ec-lobby-court, main, .ec-arena-court") || document.body).backgroundColor); const text = lum(getComputedStyle(document.querySelector(".ec-mode-card h2, .ec-mode-card h3, main h1, main h2") || document.body).color); return { body, court, text, inputs: [...document.querySelectorAll("input, select, textarea")].map((e) => getComputedStyle(e).colorScheme) }; });
  check("OS dark mode does not invert the product: the court stays light and headings stay dark", 2, (f.court ?? f.body ?? 1) > 0.5 && f.text !== null && f.text < 0.5, JSON.stringify(f));
  await p.screenshot({ path: `${SHOTS}/phone-dark-mode-lobby.png` });
  check("OS dark mode + reduced motion: no console errors or failed requests", 1, bag.pageErrors.length + bag.consoleErrors.length + bag.failed.length === 0, [...bag.pageErrors, ...bag.consoleErrors, ...bag.failed].slice(0, 2).join(" · "));
  await dark.close();
}
// ── Routes + journeys on both form factors ───────────────────────────────────
for (const [name, vp, mobile] of [["web", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 }); await session(ctx);
  console.log(`\n── ${name} routes`); await routeAudit(ctx, name, mobile).catch((e) => check(`${name}: route sweep completed`, 5, false, e.message.slice(0, 200)));
  console.log(`── ${name} journey`); await journey(ctx, name, mobile).catch((e) => check(`${name}: the whole Clash journey completed`, 8, false, e.message.split("\n")[0].slice(0, 200)));
  console.log(`── ${name} extras`); await extras(ctx, name, mobile).catch((e) => check(`${name}: menus, account and utilities completed`, 3, false, e.message.split("\n")[0].slice(0, 200)));
  await ctx.close(); await sleep(1500);
}
for (const [name, vp, mobile] of [["landscape-phone", { width: 844, height: 390 }, true], ["tablet", { width: 768, height: 1024 }, true], ["small-phone", { width: 360, height: 740 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 }); await session(ctx);
  console.log(`── ${name} draft`); await journey(ctx, name, mobile, { full: false, phone: vp.width <= 767 }).catch((e) => check(`${name}: the draft completed`, 4, false, e.message.split("\n")[0].slice(0, 200))); await ctx.close(); await sleep(1000);
}
await b.close();
const weighted = criteria.reduce((a, c) => a + c.weight, 0), passed = criteria.filter((c) => c.pass).reduce((a, c) => a + c.weight, 0);
const score = Math.round((passed / weighted) * 100);
writeFileSync(`${OUT}/audit-${N}.json`, JSON.stringify({ artifact: `full-audit-${N}`, origin: BASE, recordedAt: new Date().toISOString(), score, of: 100, weightedPassed: passed, weightedTotal: weighted, criteria: criteria.length, passedCriteria: criteria.filter((c) => c.pass).length, findings, checks: criteria }, null, 2) + "\n");
console.log(`\nAUDIT ${N} SCORE ${score}/100 (${passed}/${weighted} weighted · ${criteria.filter((c) => c.pass).length}/${criteria.length} criteria · ${findings.length} findings) → ${OUT}/audit-${N}.json`);
