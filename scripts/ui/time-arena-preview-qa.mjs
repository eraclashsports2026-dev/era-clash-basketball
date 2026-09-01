#!/usr/bin/env node
// ── Deployed-preview evidence for Phase 8C.1 ─────────────────────────────────
// Everything here runs against a REAL branch preview over the network, through
// the access gate, on the REAL product build. The dev fixture is compiled out of
// a preview build, so the geometry measured here comes from a genuine draft
// played through the UI — which is the stronger evidence anyway.
//
// Raw access keys are never printed, never written to an artifact, and never put
// in a URL: keys are exchanged for a signed session cookie over POST, and a
// tester is identified in output by id and by the first 12 hex of the sha256
// that is already committed.
//
//   node scripts/ui/time-arena-preview-qa.mjs https://<preview-host>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { previewCandidateIdentity } from "../../api/_lib/previewEngine.js";
import { chromium, request as pwRequest } from "@playwright/test";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\/[^/]+$/.test(BASE)) {
  console.error("usage: node scripts/ui/time-arena-preview-qa.mjs https://<preview-host>");
  process.exit(2);
}
const KEYFILE = ".preview-secrets/wave1-access-keys.json";
const OUT = "data/validation/8c1";
const SHOTS = `${OUT}/preview-screens`;
const contract = JSON.parse(readFileSync(`${OUT}/time-arena-visual-contract.json`, "utf8"));
const { width: VW, height: VH } = contract.canonicalViewport;

const gates = [];
let failed = 0;
const gate = (name, ok, detail = "") => {
  gates.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` … ${detail}` : ""}`);
  return !!ok;   // so the evidence file can DERIVE its claims instead of asserting them
};
const near = (actual, target, tol) => Math.abs(actual - target) <= tol;

if (!existsSync(KEYFILE)) { console.error(`missing ${KEYFILE} — cannot verify access control`); process.exit(2); }
const keyfile = JSON.parse(readFileSync(KEYFILE, "utf8"));
const KEYS = keyfile.keys;
const owner = KEYS.find((k) => k.role === "owner") || KEYS[0];

/** Client-side test setup: an account exists and no run is in progress. */
const freshAccount = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem("ec_account", "1");
    localStorage.setItem("ec_name", "8C1 QA");
    localStorage.removeItem("ec_chaos_run");
  } catch (e) {}
});

/** Contrast of an element's own colour against its effective background. */
/**
 * Contrast of an element's own colour against the surface actually behind it.
 *
 * Walking backgroundColor alone is how an audit lies: a panel painted with a
 * gradient reports backgroundColor "transparent", the walk continues past it,
 * and gold-on-navy inside that panel gets scored against the ivory page two
 * levels up — 1.8:1, a defect that does not exist. If a gradient panel hides
 * the surface and declares no base colour, this returns null and the caller
 * reports it as UNMEASURED rather than inventing a ratio in either direction.
 */
const CONTRAST_FN = `(el) => {
  const lum = (c) => { const [r,g,b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b; };
  const parse = (s) => (String(s).match(/[\\d.]+/g) || []).slice(0,4).map(Number);
  const over = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map((i) => fg[i]*a + bg[i]*(1-a)); };
  let bg = null, p = el;
  while (p) {
    const cs = getComputedStyle(p);
    const c = parse(cs.backgroundColor);
    if (c.length && (c[3] ?? 1) > 0.5) { bg = c.slice(0,3); break; }
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    p = p.parentElement;
  }
  if (!bg) return null;
  const fg = over(parse(getComputedStyle(el).color), bg);
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}`;

const run = async () => {
  mkdirSync(SHOTS, { recursive: true });
  console.log(`\nDEPLOYED PREVIEW QA — ${BASE}\n`);

  // ══ A. The gate, from outside ══════════════════════════════════════════════
  console.log("A. access control");
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const root = await anon.get("/");
  const rootBody = await root.text();
  const rootRefused = gate("unauthenticated / is refused with the access page", root.status() === 401 && /Private preview/.test(rootBody), `HTTP ${root.status()}`);
  gate("the access page leaks no application", !/ec-ta|era-clash|EraClash|<div id="root"/.test(rootBody), `${rootBody.length} bytes`);
  gate("the access page is unindexable", (root.headers()["x-robots-tag"] || "").includes("noindex"));
  const apiAnon = await anon.get("/api/health");
  const apiRefused = gate("unauthenticated API is 401 JSON", apiAnon.status() === 401 && (await apiAnon.json()).error === "preview_access_required", `HTTP ${apiAnon.status()}`);
  const bad = await anon.post("/api/preview-access", { form: { key: "not-a-real-key-000000" }, maxRedirects: 0 });
  const wrongKeyDenied = gate("a wrong key is denied and sets no session", bad.status() === 401 && !/pv_session=[^;]/.test(bad.headers()["set-cookie"] || ""), `HTTP ${bad.status()}`);
  await anon.dispose();

  // Every issued key still opens the door. One request each, no browser.
  const keyLedger = [];
  for (const k of KEYS) {
    const c = await pwRequest.newContext({ baseURL: BASE });
    const r = await c.post("/api/preview-access", { form: { key: k.key }, maxRedirects: 0 });
    const cookie = r.headers()["set-cookie"] || "";
    const ok = r.status() === 303 && /pv_session=[^;]/.test(cookie) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie);
    keyLedger.push({ testerId: k.testerId, role: k.role, sha256Prefix: k.sha256.slice(0, 12), accepted: ok, status: r.status() });
    await c.dispose();
  }
  gate(`all ${KEYS.length} Wave 1 keys are accepted and yield an HttpOnly Secure session`,
    keyLedger.every((k) => k.accepted),
    keyLedger.every((k) => k.accepted) ? keyLedger.map((k) => k.testerId).join(", ")
      : `rejected: ${keyLedger.filter((k) => !k.accepted).map((k) => `${k.testerId} (HTTP ${k.status})`).join(", ")}`);

  // ══ B. A real draft at the canonical viewport ══════════════════════════════
  console.log("\nB. a real draft at the canonical viewport");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const auth = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
  if (auth.status() !== 303) { console.error("could not open a preview session"); process.exit(1); }
  const page = await ctx.newPage();
  await freshAccount(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".ec-ta").waitFor({ timeout: 45_000 });
  gate("the Time Arena is the landing surface", await page.locator(".ec-ta").isVisible());
  gate("an empty board shows ten card backs", (await page.locator(".ec-pc-empty").count()) === 10);
  await page.screenshot({ path: `${SHOTS}/state-01-empty.png` });

  // The roll number is also announced in a screen-reader live region, so the
  // board itself is the signal: ten real cards, then the next CTA.
  await page.getByRole("button", { name: /^ROLL 1/ }).click();
  await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/state-02-roll1.png` });

  // Geometry, measured on the deployed product build.
  const geo = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc")];
    const tops = cards.map((c) => c.getBoundingClientRect().y).sort((a, b) => a - b);
    const rows = tops.reduce((acc, y) => { if (!acc.length || y - acc[acc.length - 1] > 8) acc.push(y); return acc; }, []);
    const c0 = cards[0]?.getBoundingClientRect();
    const fig = cards[0]?.querySelector(".ec-pc-portrait, .ec-pc-figure")?.getBoundingClientRect();
    const gap = cards.length > 1 ? Math.round(cards[1].getBoundingClientRect().x - (c0.x + c0.width)) : null;
    return {
      cards: cards.length, rosterRows: rows.length,
      cardW: Math.round(c0?.width || 0), cardH: Math.round(c0?.height || 0),
      portraitPct: fig && c0 ? Math.round((fig.height / c0.height) * 1000) / 10 : 0,
      cardGap: gap,
      rail: Math.round(r(".ec-ta-rail")?.width || 0),
      main: Math.round(r(".ec-ta-main")?.width || 0),
      header: Math.round(r(".ec-arena-shell > header")?.height || 0),
      cta: { w: Math.round(r(".ec-ta-cta")?.width || 0), h: Math.round(r(".ec-ta-cta")?.height || 0) },
      utility: Math.round(r(".ec-ta-utility")?.height || 0),
      docHeight: document.documentElement.scrollHeight,
      // The deployed page renders the site footer BELOW the arena; the fixture
      // route does not. Grade the arena composition — header + court — which is
      // exactly what the fixture's document height measures.
      arenaComposition: (() => {
        const h = r(".ec-arena-shell > header"), m = r(".ec-arena-court");
        return h && m ? Math.round(h.height + m.height) : null;
      })(),
      siteFooter: Math.round(r(".ec-arena-shell > footer")?.height || 0),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dockInFold: (r(".ec-ta-rail > div:last-of-type")?.top ?? 1e6) < window.innerHeight,
      atmosphere: (() => {
        const a = document.querySelector(".ec-ta-atmos");
        if (!a) return null;
        return {
          court: /url\(/.test(getComputedStyle(a, "::before").backgroundImage),
          lighting: (getComputedStyle(a, "::after").backgroundImage.match(/radial-gradient/g) || []).length,
          crowd: /url\(/.test(getComputedStyle(document.querySelector(".ec-ta-crowd")).backgroundImage),
          grain: /url\(/.test(getComputedStyle(document.querySelector(".ec-ta-grain")).backgroundImage),
        };
      })(),
    };
  });
  const t = contract.targets;
  gate("ten player cards on one row", geo.cards === 10 && geo.rosterRows === 1, `${geo.cards} cards, ${geo.rosterRows} row(s)`);
  gate("player card is the canonical size", near(geo.cardW, t.playerCard.width, t.playerCard.widthTolerance) && near(geo.cardH, t.playerCard.height, t.playerCard.heightTolerance), `${geo.cardW}x${geo.cardH}`);
  gate("portrait zone is about two thirds of the card",
    geo.portraitPct >= t.portraitZoneRatio.min * 100 && geo.portraitPct <= t.portraitZoneRatio.max * 100, `${geo.portraitPct}%`);
  gate("right rail is the canonical width", near(geo.rail, t.rail.width, t.rail.tolerance), `${geo.rail}px`);
  gate("main arena is the canonical width", near(geo.main, t.mainArena.width, t.mainArena.tolerance), `${geo.main}px`);
  gate("header is the canonical height", near(geo.header, t.header.height, t.header.tolerance), `${geo.header}px`);
  gate("primary CTA is the canonical size", near(geo.cta.w, t.finalRollCta.width, t.finalRollCta.widthTolerance) && near(geo.cta.h, t.finalRollCta.height, t.finalRollCta.heightTolerance), `${geo.cta.w}x${geo.cta.h}`);
  gate("utility bar is the canonical height", near(geo.utility, t.utilityFooter.height, t.utilityFooter.tolerance), `${geo.utility}px`);
  gate("the arena composition fits the canonical viewport", geo.arenaComposition <= t.documentHeight.max,
    `arena ${geo.arenaComposition}px ceiling ${t.documentHeight.max} · document ${geo.docHeight}px including a ${geo.siteFooter}px site footer the fixture route does not render`);
  gate("no horizontal overflow", geo.overflowX === 0, `${geo.overflowX}px`);
  gate("the result dock is inside the first viewport", geo.dockInFold);
  gate("the arena atmosphere renders: court, spotlights, crowd, grain",
    !!geo.atmosphere && geo.atmosphere.court && geo.atmosphere.lighting >= 4 && geo.atmosphere.crowd && geo.atmosphere.grain,
    `court ${geo.atmosphere?.court} · ${geo.atmosphere?.lighting} radial layers · crowd ${geo.atmosphere?.crowd} · grain ${geo.atmosphere?.grain}`);

  // Hold, roll, and prove the era arrives with Roll 2.
  const holdBtns = page.locator(".ec-pc-action");
  await holdBtns.nth(0).click();
  await holdBtns.nth(1).click();
  gate("holds register on the board", (await page.locator('.ec-pc[data-held="true"]').count()) === 2);
  const eraBeforeReveal = await page.locator(".ec-ta-utility").innerText();
  gate("the era is hidden before Roll 2", /HIDDEN/.test(eraBeforeReveal));

  await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click();
  await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
  const eraId = (await page.locator(".ec-intel-era-id").innerText()).trim();
  gate("the era is revealed with Roll 2, in the rail", /^\d{4}s$/.test(eraId), eraId);
  gate("the era box appears once, in the rail", (await page.locator(".ec-intel-era-id").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/state-03-roll2-era.png` });

  // Roll 2 is the first board that carries KEPT markers, and a marker that wraps
  // a line inside a card of FIXED height pushes that card's button out through
  // the bottom — so held cards' buttons sat lower than the rest. Checked here
  // rather than at Roll 1, because at Roll 1 no card is marked KEPT and the
  // defect is invisible.
  const footers = await page.evaluate(() => [...document.querySelectorAll(".ec-ta-roster .ec-pc")].map((c) => {
    const card = c.getBoundingClientRect();
    const foot = c.querySelector(".ec-pc-action, .ec-pc-static")?.getBoundingClientRect();
    return {
      slot: c.dataset.slot, team: c.dataset.team, kept: !!c.querySelector(".ec-pc-kept"),
      cardH: Math.round(card.height),
      overflowPx: foot ? Math.round(Math.max(0, foot.bottom - card.bottom)) : 0,
      // Distance from the card's own bottom edge, which is stable whether or not
      // the card is lifted by being held.
      footInset: foot ? Math.round(card.bottom - foot.bottom) : null,
    };
  }));
  const keptCount = footers.filter((f) => f.kept).length;
  gate("every player card button sits inside its own card",
    footers.every((f) => f.overflowPx === 0),
    `${keptCount} card(s) marked KEPT · worst overflow ${Math.max(...footers.map((f) => f.overflowPx))}px`);
  gate("every player card button sits at the same place on its card",
    new Set(footers.map((f) => f.footInset)).size === 1 && new Set(footers.map((f) => f.cardH)).size === 1,
    `insets ${[...new Set(footers.map((f) => f.footInset))].join("/")} · heights ${[...new Set(footers.map((f) => f.cardH))].join("/")}`);

  await page.getByRole("button", { name: /FINAL ROLL/ }).click();
  await page.locator(".ec-coach-card").nth(2).waitFor({ timeout: 45_000 });
  gate("coach offers arrive in the same sequence, not a second draft", (await page.locator(".ec-coach-card").count()) >= 3);
  // A card of fixed height with a long coaching span pushed its footer out
  // through the bottom border once. Every footer must sit INSIDE its card, and
  // the three cards must be one height, with real coach copy — not fixture copy.
  const coachFit = async () => page.evaluate(() => [...document.querySelectorAll(".ec-coach-card")].map((c) => {
    const card = c.getBoundingClientRect(), foot = c.querySelector(".ec-coach-foot")?.getBoundingClientRect();
    return {
      height: Math.round(card.height),
      footOverflowPx: foot ? Math.round(Math.max(0, foot.bottom - card.bottom)) : 0,
      footTop: Math.round(foot?.top ?? 0),
    };
  }));
  const staffFit = await coachFit();
  gate("every coach footer sits inside its own card",
    staffFit.every((c) => c.footOverflowPx === 0),
    `worst overflow ${Math.max(...staffFit.map((c) => c.footOverflowPx))}px`);
  gate("the coach cards are one height with their footers on one line",
    new Set(staffFit.map((c) => c.height)).size === 1 && Math.max(...staffFit.map((c) => c.footTop)) - Math.min(...staffFit.map((c) => c.footTop)) <= 1,
    `heights ${[...new Set(staffFit.map((c) => c.height))].join("/")}`);
  // Self-consistency is not enough: three cards can agree with each other and
  // still all drift off the canonical height once real copy replaces fixture
  // copy. Grade the closed card against the frozen contract, on real content.
  gate("a closed coach card is the canonical height on real copy",
    staffFit.every((c) => near(c.height, t.coachCard.height, t.coachCard.heightTolerance)),
    `${staffFit[0]?.height}px against ${t.coachCard.height}±${t.coachCard.heightTolerance}`);
  await page.screenshot({ path: `${SHOTS}/state-04-staff.png` });
  await page.getByRole("button", { name: /^Select / }).first().click();
  await page.getByRole("button", { name: /HIRE THIS STAFF/ }).click();
  await page.getByRole("button", { name: /RUN SIM/ }).waitFor({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/state-05-ready.png` });

  const urlBefore = page.url();
  await page.getByRole("button", { name: /RUN SIM/ }).click();
  await page.locator(".ec-dock-score").first().waitFor({ timeout: 90_000 });
  gate("the result appears on the same page", page.url() === urlBefore, page.url().replace(BASE, "") || "/");
  await page.screenshot({ path: `${SHOTS}/state-06-result.png` });

  const dock = page.locator(".ec-ta-rail > div:last-of-type");
  // The dock opens with no section expanded, as the reference shows, so the box
  // score is asked for — and then it must carry EVERY column, which is the
  // defect this gate exists for.
  gate("the dock leads with the score and no section forced open",
    (await dock.locator(".ec-dock-box").count()) === 0 && (await dock.locator(".ec-dock-score").count()) === 2);
  await dock.getByRole("tab", { name: "Box Score" }).click();
  await dock.locator(".ec-dock-box").waitFor({ timeout: 20_000 });
  const boxText = await dock.locator(".ec-dock-box").innerText();
  const WANT = ["PTS", "FG", "REB", "AST", "STL", "BLK", "TO"];
  gate("the dock box score carries every stat column",
    WANT.every((c) => new RegExp(`\\b${c}\\b`).test(boxText)),
    WANT.filter((c) => !new RegExp(`\\b${c}\\b`).test(boxText)).join(",") || "PTS FG REB AST STL BLK TO");
  const dockRows = await dock.locator(".ec-dock-box").evaluate((el) =>
    [...el.querySelectorAll(":scope > div > div")].filter((d) => /tabular-nums/.test(d.style.fontVariantNumeric)).length);
  gate("the dock box score lists both teams in full", dockRows >= 10, `${dockRows} rows`);
  await page.screenshot({ path: `${SHOTS}/state-06b-dock-box.png` });

  // ── The page is the ONLY vertical scroller in the arena ───────────────────
  // The rail used to be a sticky pane with its own max-height and overflow-y,
  // and the dock panel a 320px scroller inside it. Up to 504px of the result sat
  // behind an inner scrollbar, and the page stopped scrolling whenever the
  // pointer was over the rail. Checked with EVERY dock section open, because
  // that is when the rail is tallest.
  const scrollTraps = [];
  for (const tabName of ["Game Story", "Box Score", "Coaching", "Analysis"]) {
    await dock.getByRole("tab", { name: tabName }).click();
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll(".ec-ta, .ec-ta *").forEach((e) => {
        const cs = getComputedStyle(e);
        if (!["auto", "scroll"].includes(cs.overflowY)) return;
        // A wide stat table may scroll SIDEWAYS; it must not scroll vertically.
        if (e.scrollHeight > e.clientHeight + 1 || cs.overflowY === "scroll") {
          bad.push(`${String(e.className).trim().split(/\s+/)[0]} clips ${e.scrollHeight - e.clientHeight}px`);
        }
      });
      const rail = document.querySelector(".ec-ta-rail").getBoundingClientRect();
      return { bad, docHeight: document.documentElement.scrollHeight,
        railBottomBeyondViewport: Math.round(rail.bottom - window.innerHeight) };
    });
    scrollTraps.push({ section: tabName, ...t });
    await dock.getByRole("tab", { name: tabName }).click();
  }
  const trapped = scrollTraps.filter((t) => t.bad.length);
  gate("no arena surface traps the scroll — the page is the only vertical scroller",
    trapped.length === 0,
    trapped.length ? trapped.map((t) => `${t.section}: ${t.bad.join(", ")}`).join(" · ")
      : `checked with all four dock sections open`);
  gate("an open dock section grows the page instead of hiding behind a scrollbar",
    scrollTraps.every((t) => t.docHeight > 1024),
    scrollTraps.map((t) => `${t.section} ${t.docHeight}px`).join(" · "));
  // ── Starting over, from the board ─────────────────────────────────────────
  // The only route to a new Clash used to be a link inside the result.
  const newOnBoard = page.locator(".ec-ta-stage .ec-ta-stage-actions")
    .getByRole("button", { name: /Start a new Clash/ });
  gate("a finished game offers a new Clash on the board itself", await newOnBoard.count() === 1);
  await newOnBoard.click();
  const resetDialog = page.getByRole("dialog", { name: /Start a new Clash/ });
  await resetDialog.waitFor({ timeout: 15_000 });
  const dialogBits = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"]');
    const btns = [...d.querySelectorAll("button")];
    return {
      modal: d.getAttribute("aria-modal") === "true",
      says: /stays in the Result Dock/.test(d.innerText),
      buttons: btns.map((b) => b.innerText.trim()),
      taps: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))),
      focusedIsSafe: /^No/i.test(document.activeElement?.getAttribute("aria-label") || ""),
    };
  });
  gate("the reset dialog asks before it fires, and says what it will do",
    dialogBits.modal && dialogBits.says && dialogBits.buttons.includes("YES") && dialogBits.buttons.includes("NO"),
    dialogBits.buttons.join("/"));
  gate("the safe answer holds focus and both answers are 44px",
    dialogBits.focusedIsSafe && dialogBits.taps >= 44, `min ${dialogBits.taps}px`);
  await resetDialog.getByRole("button", { name: /^No/ }).click();
  gate("No closes the dialog and leaves the result where it was",
    (await page.getByRole("dialog", { name: /Start a new Clash/ }).count()) === 0
    && (await dock.locator(".ec-dock-score").count()) === 2);

  const resultFit = await coachFit();
  gate("the finished board keeps the staff decision, still inside its cards",
    resultFit.length === 3 && resultFit.every((c) => c.footOverflowPx === 0) && new Set(resultFit.map((c) => c.height)).size === 1,
    `${resultFit.length} cards, worst overflow ${Math.max(0, ...resultFit.map((c) => c.footOverflowPx))}px`);
  // The original defect was EMPTY SPACE INSIDE THE STAGE COLUMN — the board
  // collapsed after a sim and left ~480px of nothing beside a full rail. Measure
  // that directly: the column must end where its own content ends. Comparing the
  // two columns' lengths is the wrong test — once the rail was freed to scroll
  // with the page it became legitimately longer than the stage, and a gate on
  // parity would have demanded padding out a column for no reader's benefit.
  const tail = await page.evaluate(() => {
    const main = document.querySelector(".ec-ta-main");
    const kids = [...main.children].map((e) => e.getBoundingClientRect().bottom);
    const r = main.getBoundingClientRect();
    return {
      unusedStageColumnPx: kids.length ? Math.round(r.bottom - Math.max(...kids)) : null,
      stageColumnPx: Math.round(r.height),
      railPx: Math.round(document.querySelector(".ec-ta-rail").getBoundingClientRect().height),
    };
  });
  gate("the stage column ends where its content ends, with no empty run below it",
    tail.unusedStageColumnPx !== null && tail.unusedStageColumnPx <= 24,
    `${tail.unusedStageColumnPx}px unused · stage ${tail.stageColumnPx}px, rail ${tail.railPx}px`);
  await dock.getByRole("tab", { name: "Box Score" }).click();

  // ══ C. The full report: names and prose must be READABLE ═══════════════════
  console.log("\nC. the full report");
  await page.getByRole("button", { name: /VIEW FULL REPORT/ }).click();
  const report = page.getByRole("dialog", { name: "Full postgame report" });
  await report.waitFor({ timeout: 45_000 });
  await page.screenshot({ path: `${SHOTS}/state-07-report-final.png` });
  await report.getByRole("tab", { name: "Box Score" }).click();
  await page.locator(".box-player").first().waitFor();
  const names = await page.$$eval(".box-player", (els, fn) => {
    const contrast = eval(fn);
    return els.slice(0, 24).map((el) => ({ text: el.innerText.trim(), contrast: contrast(el) }));
  }, CONTRAST_FN);
  const measuredNames = names.filter((n) => n.contrast !== null);
  const worst = measuredNames.length ? Math.min(...measuredNames.map((n) => n.contrast)) : null;
  gate("box score lists named players", names.length >= 10 && names.every((n) => n.text.length > 1), `${names.length} rows`);
  gate("every player name is readable", worst !== null && worst >= 4.5,
    `worst contrast ${worst}:1 across ${measuredNames.length}/${names.length} measurable rows`);
  await page.screenshot({ path: `${SHOTS}/state-08-report-box.png` });

  await report.getByRole("tab", { name: "Game Story" }).click();
  const story = await page.evaluate((fn) => {
    const contrast = eval(fn);
    const dlg = document.querySelector('[role="dialog"]');
    const paras = [...dlg.querySelectorAll("p, .ec-story-body, div")]
      .filter((e) => e.children.length === 0 && e.innerText.trim().split(/\s+/).length >= 12);
    const ratios = paras.map(contrast).filter((r) => r !== null);
    return { count: paras.length, measured: ratios.length,
      worst: ratios.length ? Math.min(...ratios) : null,
      sample: paras[0]?.innerText.trim().slice(0, 60) || "" };
  }, CONTRAST_FN);
  gate("the game story has readable body prose",
    story.count >= 1 && story.worst !== null && story.worst >= 4.5,
    `${story.count} passages, ${story.measured} measurable, worst ${story.worst}:1`);
  await page.screenshot({ path: `${SHOTS}/state-09-report-story.png` });

  // The fourth report surface. It is the one the brief names that no other gate
  // in this file opens, and 579 local coaching contracts say nothing about
  // whether the tab renders on a deployed build.
  await report.getByRole("tab", { name: "Coaching & Strategy" }).click();
  const coaching = await page.evaluate((fn) => {
    const contrast = eval(fn);
    const dlg = document.querySelector('[role="dialog"]');
    const leaves = [...dlg.querySelectorAll("div, p, li, span")]
      .filter((e) => e.children.length === 0 && e.innerText.trim().length > 3);
    const scored = leaves.map((e) => ({ ratio: contrast(e), fontSize: parseFloat(getComputedStyle(e).fontSize),
      weight: Number(getComputedStyle(e).fontWeight) || 400, text: e.innerText.trim().slice(0, 40) }))
      .filter((x) => x.ratio !== null);
    // WCAG large text (>=18.66px bold, or >=24px) clears at 3:1; everything
    // else needs 4.5:1. Grading every label at 4.5 would fail real headings.
    const floorFor = (x) => (x.fontSize >= 24 || (x.fontSize >= 18.66 && x.weight >= 700)) ? 3 : 4.5;
    const failing = scored.filter((x) => x.ratio < floorFor(x));
    return { blocks: leaves.length, measured: scored.length,
      worst: scored.length ? Math.min(...scored.map((x) => x.ratio)) : null,
      failing: failing.slice(0, 6), failingCount: failing.length,
      names: /coach/i.test(dlg.innerText) };
  }, CONTRAST_FN);
  gate("the coaching report renders, readable, on the deployed build",
    coaching.blocks >= 12 && coaching.names && coaching.failingCount === 0,
    coaching.failingCount === 0
      ? `${coaching.blocks} blocks, ${coaching.measured} measurable, worst ${coaching.worst}:1`
      : `${coaching.failingCount} below floor: ${coaching.failing.map((f) => `"${f.text}" ${f.ratio}:1 at ${f.fontSize}px/${f.weight}`).join(" · ")}`);
  await page.screenshot({ path: `${SHOTS}/state-10-report-coaching.png` });

  // ══ D. Feedback, end to end ════════════════════════════════════════════════
  console.log("\nD. feedback");
  await report.getByRole("tab", { name: "Final" }).click();
  const panel = report.getByText(/PREVIEW — rate this result/);
  let feedbackStatus = null;
  if (await panel.count()) {
    const fives = report.getByRole("button", { name: "5", exact: true });
    const n = await fives.count();
    for (let i = 0; i < n; i++) await fives.nth(i).click();
    await report.getByRole("button", { name: "yes", exact: true }).click();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/feedback") && r.request().method() === "POST", { timeout: 30_000 }),
      report.getByRole("button", { name: /Send preview feedback/ }).click(),
    ]);
    feedbackStatus = res.status();
    gate("preview feedback is accepted", res.status() >= 200 && res.status() < 300, `HTTP ${res.status()}`);
    gate("the tester is told it was recorded", await report.getByText(/preview feedback recorded/).isVisible());
  } else {
    gate("preview feedback panel is present on a preview result", false, "panel not rendered");
  }

  // ══ E. The era is actually random ══════════════════════════════════════════
  console.log("\nE. the era is dealt, not defaulted");
  const eras = [eraId];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { try { localStorage.removeItem("ec_chaos_run"); } catch (e) {} });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^ROLL 1/ }).click();
    await page.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
    await page.getByRole("button", { name: /LOCK & ROLL 2/ }).click();
    await page.getByRole("button", { name: /FINAL ROLL/ }).waitFor({ timeout: 45_000 });
    eras.push((await page.locator(".ec-intel-era-id").innerText()).trim());
  }
  const distinct = [...new Set(eras)];
  gate("six fresh drafts do not all land on one era", distinct.length > 1, eras.join(", "));
  gate("no draft defaults to the 1950s", !(distinct.length === 1 && distinct[0] === "1950s"));

  // ══ F. Tablet and phone ════════════════════════════════════════════════════
  console.log("\nF. tablet and phone");
  const responsive = [];
  for (const [w, h, touch] of [[1280, 800, false], [768, 1024, true], [430, 932, true], [390, 844, true]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await c.request.post(`${BASE}/api/preview-access`, { form: { key: owner.key }, maxRedirects: 0 });
    const p = await c.newPage();
    await freshAccount(p);
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: /^ROLL 1/ }).click();
    await p.locator(".ec-ta-roster .ec-pc").nth(9).waitFor({ timeout: 45_000 });
    const m = await p.evaluate(() => {
      const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc")];
      const tops = cards.map((c) => c.getBoundingClientRect().y).sort((a, b) => a - b);
      const rows = tops.reduce((acc, y) => { if (!acc.length || y - acc[acc.length - 1] > 8) acc.push(y); return acc; }, []);
      const unreachable = [...document.querySelectorAll(".ec-ta *")].filter((e) => {
        if (e.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) return false;
        let p = e;
        while (p && p !== document.body) { if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false; p = p.parentElement; }
        return true;
      }).length;
      const hd = document.querySelector(".ec-arena-shell > header");
      const hr = hd?.getBoundingClientRect();
      return {
        rosterRows: rows.length,
        // A sticky header that wraps its nav onto three lines was 217px tall on
        // a phone — a quarter of the viewport, on every screen, permanently.
        headerPx: Math.round(hr?.height || 0),
        headerPctOfViewport: hr ? Math.round((hr.height / window.innerHeight) * 100) : null,
        headerSticky: hd ? getComputedStyle(hd).position === "sticky" : false,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minTap: Math.min(...[...document.querySelectorAll(".ec-pc-action, .ec-coach-action, .ec-ta-cta")]
          .map((b) => Math.round(b.getBoundingClientRect().height)).concat([999])),
        unreachable,
      };
    });
    await p.screenshot({ path: `${SHOTS}/responsive-${w}x${h}.png`, fullPage: false });
    responsive.push({ viewport: `${w}x${h}`, touch, ...m });
    console.log(`  ${w}x${h}: ${m.rosterRows} row(s), header ${m.headerPx}px (${m.headerPctOfViewport}%), overflow ${m.overflowX}px, min tap ${m.minTap}px`);
    await c.close();
  }
  gate("nothing is clipped or unreachable on any width",
    responsive.every((r) => r.overflowX === 0 && r.unreachable === 0));
  gate("the sticky header never takes more than a fifth of any viewport",
    responsive.every((r) => r.headerPctOfViewport !== null && r.headerPctOfViewport <= 20),
    responsive.map((r) => `${r.viewport} ${r.headerPx}px/${r.headerPctOfViewport}%`).join(" · "));
  gate("every hold and roll control is a 44px target on touch widths",
    responsive.filter((r) => r.touch).every((r) => r.minTap >= 44),
    `min ${Math.min(...responsive.filter((r) => r.touch).map((r) => r.minTap))}px`);

  // ══ G. The development fixture is not in the deployed build ════════════════
  console.log("\nG. isolation");
  const html = await (await ctx.request.get(`${BASE}/`)).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  let fixtureHits = 0, scanned = 0;
  for (const a of assets) {
    const body = await (await ctx.request.get(`${BASE}${a}`)).text();
    scanned++;
    if (/time-arena-reference|ReferenceFixture|fixture0000000/.test(body)) fixtureHits++;
  }
  gate("the dev fixture is absent from every deployed bundle", fixtureHits === 0, `${scanned} bundle(s) scanned`);
  const devRoute = await ctx.request.get(`${BASE}/dev/time-arena-reference`);
  const devPage = await ctx.newPage();
  await devPage.goto(`${BASE}/dev/time-arena-reference`, { waitUntil: "domcontentloaded" });
  await devPage.waitForTimeout(2500);
  const fixtureRendered = await devPage.evaluate(() => !!document.querySelector('[data-fixture="time-arena-reference"]'));
  gate("the fixture route renders no fixture on a deployed build", !fixtureRendered, `HTTP ${devRoute.status()}`);
  await devPage.close();

  // ── Deployed candidate identity ───────────────────────────────────────────
  // The evidence used to say which URL was graded but not which engine that URL
  // was running. On 2026-09-01 /api/health was found reporting "Candidate 3" and
  // "1.3.0" beside Candidate 4's core hash — a literal id and a lookup at a
  // VERSIONS path that does not exist, so the fallback answered every request.
  // A 55/55 evidence file recorded none of it. These gates compare what the
  // deployment reports against what this checkout would report, so a build that
  // is not the candidate under test can no longer pass a QA run silently.
  let deployedIdentity = null;
  try {
    const hres = await ctx.request.get(`${BASE}/api/health`);
    const body = hres.ok() ? await hres.json() : null;
    deployedIdentity = body?.preview ?? null;
    const local = previewCandidateIdentity();
    gate("the deployed build reports a candidate identity", !!deployedIdentity?.candidateId,
      deployedIdentity?.candidateId || `HTTP ${hres.status()}`);
    gate("the deployed core hash is this checkout's candidate",
      deployedIdentity?.candidateCoreHash === local.coreHash,
      `deployed ${String(deployedIdentity?.candidateCoreHash).slice(0, 12)} vs local ${local.coreHash.slice(0, 12)}`);
    gate("the deployed candidate id and calibration version agree with this checkout",
      deployedIdentity?.candidateId === local.candidateId
        && deployedIdentity?.calibrationVersion === local.possessionCalibrationVersion,
      `deployed ${deployedIdentity?.candidateId} / ${deployedIdentity?.calibrationVersion} vs local ${local.candidateId} / ${local.possessionCalibrationVersion}`);
  } catch (err) {
    gate("the deployed build reports a candidate identity", false, String(err.message || err));
  }

  await browser.close();

  // ── Evidence ──────────────────────────────────────────────────────────────
  writeFileSync(`${OUT}/time-arena-preview-qa.json`, JSON.stringify({
    artifact: "time-arena-preview-qa", phase: "8C.1 — pixel-fidelity reconstruction",
    deployment: { baseUrl: BASE, commit: process.env.PHASE8C1_COMMIT || null, environment: "vercel preview, access-gated" },
    // Which engine the graded deployment was actually running, read from
    // /api/health rather than assumed, next to what this checkout resolves.
    candidateUnderTest: { deployed: deployedIdentity, local: previewCandidateIdentity() },
    method: "Playwright over the network against the deployed branch preview, authenticated with a signed session obtained by POSTing an access key. The dev fixture is compiled out of a preview build, so every measurement below comes from a real draft played through the UI.",
    accessControl: {
      // Measured, not asserted. These were hard-coded `true` beside a genuinely
      // derived keyLedger, so a run where the gate regressed would still have
      // recorded the gate as holding — an evidence file that lies is worse than
      // no evidence file.
      unauthenticatedRootRefused: rootRefused,
      unauthenticatedApiRefused: apiRefused,
      wrongKeyDenied,
      keys: keyLedger,
      note: "Raw keys are never printed or stored here. A tester is identified by id and by the first 12 hex of the sha256 already committed in config.",
    },
    canonicalGeometryOnDeployedBuild: geo,
    playerCardFootersAtRoll2: footers,
    eraDealt: { observed: eras, distinct },
    report: { boxScoreRows: names.length, worstNameContrast: worst, story, coaching },
    feedback: {
      httpStatus: feedbackStatus,
      note: "204 is this endpoint's success response for a stored preview record — and also what it returns when no store is configured or when the caller is rate limited. So this proves the round trip is accepted end to end, with the UI confirming it, from a real preview session on a real preview result. It does not prove persistence from outside the deployment; run `npm run preview:wave1-feedback-report` in a shell that has the store credentials to see the record itself.",
    },
    responsive,
    scrollOwnership: scrollTraps,
    isolation: { bundlesScanned: scanned, fixtureHits, devRouteStatus: devRoute.status(), fixtureRendered },
    screens: `${SHOTS}/`,
    gates, passed: gates.length - failed, failed,
  }, null, 2) + "\n");

  console.log(`\n${gates.length - failed}/${gates.length} deployed gates passed`);
  console.log(`evidence written to ${OUT}/time-arena-preview-qa.json`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
