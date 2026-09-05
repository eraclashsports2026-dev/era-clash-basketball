#!/usr/bin/env node
// ── Chaos Clash Guided Flow V2 — live QA dispatcher (Phase 9B.3) ─────────────
//   node scripts/chaos/guidedFlowQa.mjs <mode> [origin]
//
//   states          drive the six states at three desktop and two phone
//                   viewports, screenshot each, and assert what each state may
//                   and may not show → foundation/drafting/era-reveal/coach-
//                   chaos/clash-ready/result-state QA + responsive + disclosure
//   era-reveal | coach-flow | result-flow
//                   the same drive at 1536 only, reporting one state's file
//   resume          refresh and lobby → Continue at every recoverable state
//   accessibility   live regions, focus, names, contrast, targets, keyboard,
//                   reduced motion — measured on the real flow
//   performance     first paint, layout shift through the whole flow, and the
//                   time each state takes to appear after its action
//   contact-sheets  each capture beside its owner reference
//   deployed        the states drive at 1536 against a gated preview, plus a
//                   scan of what the bundle ships
//
// A real draft needs the real API, so the default origin is the local harness
// (node scripts/harness.mjs 4180); pass a deployed origin to certify the
// protected preview. Everything here reads the DOM of a game actually being
// played; nothing is a fixture, and no data is invented.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { chromium } from "@playwright/test";

const MODE = process.argv[2] || "states";
const BASE = (process.argv[3] || "http://localhost:4180").replace(/\/$/, "");
const OUT = "data/validation/9b3";
const SHOTS = `${OUT}/screens`;
const REF_DIR = "docs/ui/references/chaos-guided-flow-v2";
const STATES = ["EMPTY", "DRAFTING", "ERA_REVEAL", "COACH_SELECT", "READY", "RESULT"];
const FILE = { EMPTY: "01-foundation", DRAFTING: "02-drafting", ERA_REVEAL: "03-era-reveal", COACH_SELECT: "04-coach-chaos", READY: "05-clash-ready", RESULT: "06-result" };
const REF = { EMPTY: "UI1-foundation.png", DRAFTING: "UI2-drafting.png", ERA_REVEAL: "UI3-era-reveal.png", COACH_SELECT: "UI4-coach-chaos.png", READY: "UI5-clash-ready.png", RESULT: "UI6-result.png" };
const ARTIFACT = { EMPTY: "foundation-qa", DRAFTING: "drafting-qa", ERA_REVEAL: "era-reveal-qa", COACH_SELECT: "coach-chaos-qa", READY: "clash-ready-qa", RESULT: "result-state-qa" };
const DESKTOP = [[1536, 1024], [1440, 900], [1280, 800]];
const TABLET = [[1024, 1366], [768, 1024]];
const MOBILE = [[430, 932], [390, 844]];
const PHASE = "9B.3 — Chaos Clash Guided Flow V2";
const now = () => new Date().toISOString();
const write = (name, data) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2) + "\n"); console.log(`  → ${OUT}/${name}.json`); };

/** An access session for a gated preview. Keys never reach a URL or a log. */
const openSession = async (context) => {
  if (!BASE.startsWith("https://")) return null;
  const f = ".preview-secrets/wave2-access-keys.json";
  if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
  const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
  const r = await context.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
  return k.testerId;
};
// A fresh signed-in-looking account with no run — seeded ONCE per tab, so a
// reload inside the resume matrix keeps the run it is meant to recover.
const freshAccount = (page) => page.addInitScript(() => {
  try {
    if (sessionStorage.getItem("qa_seeded")) return;
    sessionStorage.setItem("qa_seeded", "1");
    localStorage.setItem("ec_account", "1"); localStorage.setItem("ec_name", "QA");
    localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_run_at"); localStorage.removeItem("ec_chaos_era_ack");
  } catch (e) {}
});
const stateNow = (page) => page.locator(".ec-ta-stage").getAttribute("data-guided-state", { timeout: 60_000 }).catch(async () => {
  console.log("    (no stage) " + (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 300).replace(/\s+/g, " "));
  return null;
});
const stageIn = (page, st, timeout = 60_000) => page.waitForSelector(`.ec-ta-stage[data-guided-state="${st}"]`, { timeout });
const click = async (page, re, timeout = 30_000) => {
  const b = page.getByRole("button", { name: re }).first();
  await b.waitFor({ state: "visible", timeout });
  await b.click();
};

/** Drive one Clash through all six states, calling `at(state)` in each. */
async function walk(page, at, { hold = true, onEntry = null, afterAdapt = null, afterPick = null } = {}) {
  const t = {};
  const mark = async (st, fn) => { const t0 = Date.now(); await fn(); t[st] = Date.now() - t0; await at(st); };
  const entered = async (st) => { if (onEntry) await onEntry(st); };
  await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" });
  await mark("EMPTY", async () => { await stageIn(page, "EMPTY"); await entered("EMPTY"); });
  await click(page, /^ROLL$/);
  await mark("DRAFTING", async () => {
    await stageIn(page, "DRAFTING");
    await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    await entered("DRAFTING");
    if (hold) {
      // Hold one Gold player BEFORE the state is inspected, so the held card is
      // part of what the drafting state is graded on.
      await page.locator('.ec-ta-team[data-team="gold"] .ec-pc-action:not([disabled])').first().click();
      await page.locator('.ec-pc[data-held="true"]').first().waitFor({ timeout: 10_000 });
    }
  });
  await click(page, /^ROLL 2$/);
  await mark("ERA_REVEAL", async () => { await stageIn(page, "ERA_REVEAL"); await entered("ERA_REVEAL"); });
  await click(page, /ADAPT TO ERA/);
  await stageIn(page, "DRAFTING");
  if (afterAdapt) await afterAdapt();   // roll 2, era acknowledged: a distinct resume stop
  await click(page, /FINAL ROLL/);
  await mark("COACH_SELECT", async () => { await stageIn(page, "COACH_SELECT"); await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await entered("COACH_SELECT"); });
  await page.getByRole("button", { name: /^Select / }).first().click();
  if (afterPick) await afterPick();      // an offer picked, CONTINUE not yet pressed
  await click(page, /CONTINUE WITH COACH/);
  await mark("READY", async () => { await stageIn(page, "READY"); await entered("READY"); });
  await click(page, /RUN CLASH/);
  await mark("RESULT", async () => { await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 }); await stageIn(page, "RESULT"); await entered("RESULT"); });
  return t;
}

/** What one state actually shows. Facts, measured in the page. */
const inspect = (page, state) => page.evaluate((state) => {
  const q = (s) => document.querySelectorAll(s).length;
  const txt = (s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() || "";
  const body = document.body.innerText;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const filledPrimaries = [...document.querySelectorAll(".ec-ta-cta, .ec-ta-result-hero button")].filter((b) => vis(b) && /rgb\(2(4[0-9]|5[0-5]), 1(8|9)\d, \d+\)/.test(getComputedStyle(b).backgroundColor) || (b.classList.contains("ec-ta-cta") && vis(b)));
  const buttons = [...document.querySelectorAll(".ec-ta button, .ec-ta [role=tab]")].filter(vis);
  const draftPressure = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /DRAFT PRESSURE/i.test(e.textContent || "")).length;
  const stage = document.querySelector(".ec-ta-stage");
  const score = document.querySelector(".ec-ta-score");
  const hero = document.querySelector(".ec-ta-result-hero");
  return {
    guidedState: stage?.dataset.guidedState || null,
    rosterMode: stage?.dataset.roster || null,
    cta: txt(".ec-ta-cta"), ctaCount: q(".ec-ta-cta"), ctaDisabled: !!document.querySelector(".ec-ta-cta")?.disabled,
    cards: q(".ec-ta-roster .ec-pc"), emptyCards: q(".ec-pc-empty"), holdControls: [...document.querySelectorAll(".ec-pc-action")].filter(vis).length,
    heldCards: q('.ec-pc[data-held="true"]'), keptTags: q(".ec-pc-kept"),
    heldLocked: [...document.querySelectorAll('.ec-pc[data-held="true"] .ec-pc-action[aria-pressed="true"]')].filter((b) => /LOCKED/.test(b.textContent)).length,
    coachCards: q(".ec-coach-card"), staffLines: q(".ec-ta-staff"),
    docks: q(".ec-dock"), rail: q(".ec-ta-rail"), railPanel: txt(".ec-ta-rail h2"),
    intelCompact: document.querySelector(".ec-intel--compact")?.dataset.expanded === "false", viewDetails: q(".ec-intel-more"),
    draftPressureMentions: draftPressure, eraId: txt(".ec-intel-era-id") || txt(".ec-era-reveal-id"),
    eraReveal: q(".ec-era-reveal"), eraCards: q(".ec-era-reveal-card"), eraChip: q(".ec-ta-era-chip"),
    lastClash: q(".ec-ta-lastclash"),
    score: !!score, scoreText: txt(".ec-ta-score"), winner: txt(".ec-ta-score-winner"),
    tabs: q(".ec-dock-tab"), storyOpen: q('[role="tabpanel"]') > 0 && /HOW (GOLD|BLUE) WON/i.test(body),
    scoreAboveTabs: !!score && !!hero && score.getBoundingClientRect().top < hero.getBoundingClientRect().top,
    // A prediction is a stated probability, favourite or projected score. The
    // product's own promise that there are "NO PREDICTIONS" is not one.
    predictions: /win probability|likely winner|expected score|projected (winner|score)|\d+ ?% (to win|chance)|favou?rite to win/i.test(body),
    fakeProgress: /Preparing matchup|Building game plans|Finalizing result/.test(body),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minButton: buttons.length ? Math.min(...buttons.map((b) => Math.round(b.getBoundingClientRect().height))) : null,
    minButtonSel: buttons.length ? (buttons.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0].className || buttons[0].tagName) : null,
    liveRegionText: [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "),
    focusOnCta: document.activeElement?.classList?.contains("ec-ta-cta") || false,
    // Read at the top of the page: is the one primary action on screen without scrolling?
    ctaOnScreen: (() => { const e = document.querySelector(".ec-ta-cta"); if (!e) return null; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })(),
    teamToggle: !!document.querySelector(".ec-ta-team-toggle") && vis(document.querySelector(".ec-ta-team-toggle")),
    blueVisible: [...document.querySelectorAll('.ec-ta-team[data-team="blue"] .ec-pc, .ec-ta-team[data-team="blue"] .ec-pc-empty')].some(vis),
    goldVisible: [...document.querySelectorAll('.ec-ta-team[data-team="gold"] .ec-pc, .ec-ta-team[data-team="gold"] .ec-pc-empty')].some(vis),
    stateWord: state,
  };
}, state);

/** The rules each state must obey. Each returns [name, pass, detail]. */
const rules = (st, f, mobile, touch = mobile) => {
  const r = [];
  const ok = (n, p, d = "") => r.push({ check: n, pass: !!p, detail: d });
  ok("the stage is in the expected state", f.guidedState === st, f.guidedState);
  ok("no horizontal overflow", f.overflow === 0, `${f.overflow}px`);
  // Touch targets are 44px on a phone. With a pointer, WCAG 2.2 AA (2.5.8)
  // asks 24px; the smallest control and its size are recorded either way.
  if (f.minButton != null) ok(touch ? "every control is a 44px touch target" : "every control is at least a 24px pointer target", f.minButton >= (touch ? 44 : 24), `${f.minButton}px · ${f.minButtonSel}`);
  ok("nothing predicts a winner", !f.predictions);
  ok("no fabricated progress figure", !f.fakeProgress);
  if (mobile) {
    ok("one team at a time on a phone, Gold first", f.teamToggle && f.goldVisible && (st === "RESULT" || st === "READY" || st === "COACH_SELECT" ? true : !f.blueVisible));
    if (f.ctaOnScreen !== null) ok("the primary action is on screen at the top of the page (sticky)", f.ctaOnScreen === true);
  }
  switch (st) {
    case "EMPTY":
      ok("one primary action, and it is ROLL", f.ctaCount === 1 && /^ROLL/.test(f.cta) && !f.ctaDisabled, f.cta);
      ok("ten card backs, deliberate and empty", f.emptyCards === 10);
      ok("no Coach Chaos yet", f.coachCards === 0);
      ok("no previous Result Dock beside the empty frame", f.docks === 0);
      ok("no Draft Pressure yet", f.draftPressureMentions === 0);
      ok("no era shown yet", !f.eraId && f.eraChip === 0);
      ok("the rail is a short guide", /HOW CHAOS WORKS/.test(f.railPanel) || mobile);
      break;
    case "DRAFTING":
      ok("ten cards on the board", f.cards === 10);
      ok("HOLD on the five you control, and only those", f.holdControls === (mobile && !f.blueVisible ? 5 : 5), `${f.holdControls}`);
      ok("held state is not colour-only: LOCKED text and aria-pressed", f.heldCards >= 1 && f.heldLocked === f.heldCards, `${f.heldCards} held, ${f.heldLocked} marked`);
      ok("one primary action naming the next roll", f.ctaCount === 1 && /^ROLL 2|^FINAL ROLL/.test(f.cta), f.cta);
      ok("Coach Chaos is not on the board while drafting", f.coachCards === 0);
      ok("no Result Dock while drafting", f.docks === 0);
      ok("Live Intel is compact", f.intelCompact === true, `viewDetails=${f.viewDetails}`);
      ok("Draft Pressure appears exactly once", f.draftPressureMentions === 1, `${f.draftPressureMentions}`);
      ok("the era is still hidden on roll 1", !f.eraId);
      break;
    case "ERA_REVEAL":
      ok("the era is the focus, with its real name", f.eraReveal === 1 && /^\d{4}s$/.test(f.eraId), f.eraId);
      ok("three rule cards from the run's own facts", f.eraCards === 3, `${f.eraCards}`);
      ok("one action: ADAPT TO ERA", f.ctaCount === 1 && /ADAPT TO ERA/.test(f.cta), f.cta);
      ok("the roster stays present", f.cards === 10);
      ok("Coach Chaos is not on the board at the reveal", f.coachCards === 0);
      ok("no Result Dock at the reveal", f.docks === 0);
      break;
    case "COACH_SELECT":
      ok("three coaching offers are the hero", f.coachCards === 3);
      ok("the finished five persists, compressed", f.cards === 10 && f.rosterMode === "compressed");
      ok("no hold controls once the five is set", f.holdControls === 0);
      ok("the continuation waits for a choice", f.ctaCount === 1 && /CONTINUE WITH COACH/.test(f.cta) && f.ctaDisabled, f.cta);
      ok("no staff is claimed before a decision exists", f.staffLines === 0);
      ok("the era rides along as a compact chip", f.eraChip === 1);
      ok("no Result Dock beside the coaching decision", f.docks === 0);
      break;
    case "READY":
      ok("one primary action: RUN CLASH", f.ctaCount === 1 && /RUN CLASH/.test(f.cta) && !f.ctaDisabled, f.cta);
      ok("both fives on the board, compressed", f.cards === 10 && f.rosterMode === "compressed");
      ok("the staff decision is carried under the fives", f.staffLines >= 1, `${f.staffLines}`);
      ok("the three offers no longer compete with the action", f.coachCards === 0);
      ok("the era is stated", f.eraChip === 1);
      ok("no Result Dock beside the ready matchup", f.docks === 0);
      break;
    case "RESULT":
      ok("the score leads", f.score && /\d+\s*FINAL\s*\d+/.test(f.scoreText), f.scoreText.slice(0, 40));
      ok("a winner is named", /TEAM (GOLD|BLUE) WINS/.test(f.winner), f.winner);
      ok("the score sits above the story and the tabs", f.scoreAboveTabs);
      ok("the matchup that produced it is on screen", f.cards === 10 && f.staffLines >= 1);
      ok("four result sections", f.tabs === 4, `${f.tabs}`);
      ok("the story is open for a game that just finished", f.storyOpen);
      ok("no contextual rail competes with the result", f.rail === 0);
      ok("no prediction anywhere", !f.predictions);
      break;
  }
  return r;
};

// ── states ───────────────────────────────────────────────────────────────────
async function statesMode(viewports = [...DESKTOP, ...TABLET, ...MOBILE], only = null, prefix = "") {
  const browser = await chromium.launch();
  const perState = Object.fromEntries(STATES.map((s) => [s, []]));
  const transitions = {};
  for (const [vw, vh] of viewports) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    await openSession(context);
    const page = await context.newPage();
    await freshAccount(page);
    const dir = `${SHOTS}/${prefix}${vw}x${vh}`; mkdirSync(dir, { recursive: true });
    console.log(`\n${vw}×${vh}`);
    const t = await walk(page, async (st) => {
      // Captures start at the top of the page: on a phone the sticky action or a
      // hold can leave the viewport mid-board, and the owner compares the head.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${dir}/${FILE[st]}.png` });
      const facts = await inspect(page, st);
      const checks = rules(st, facts, vw <= 767, vw <= 1179);
      perState[st].push({ viewport: `${vw}x${vh}`, screenshot: `${dir}/${FILE[st]}.png`, facts, checks });
      const failed = checks.filter((c) => !c.pass);
      console.log(`  ${failed.length ? "FAIL" : "PASS"}  ${FILE[st]}${failed.length ? " — " + failed.map((c) => `${c.check} (${c.detail})`).join("; ") : ""}`);
    });
    transitions[`${vw}x${vh}`] = t;
    await context.close();
  }
  await browser.close();
  let allPass = true;
  for (const st of STATES) {
    if (only && only !== st) continue;
    const runs = perState[st];
    const failed = runs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ viewport: r.viewport, ...c })));
    if (failed.length) allPass = false;
    // A focused single-state run must not overwrite the seven-viewport record.
    const name = prefix + (only ? { ERA_REVEAL: "era-reveal-flow-qa", COACH_SELECT: "coach-flow-qa", RESULT: "result-flow-qa" }[st] || `${ARTIFACT[st]}-focused` : ARTIFACT[st]);
    write(name, { artifact: name, phase: PHASE, generatedAt: now(), origin: BASE, state: st, viewports: viewports.map(([w, h]) => `${w}x${h}`), reference: `${REF_DIR}/${REF[st]}`, runs, failed, passed: failed.length === 0 });
  }
  if (!only) {
    const overflow = Object.fromEntries(STATES.map((s) => [s, Object.fromEntries(perState[s].map((r) => [r.viewport, r.facts.overflow]))]));
    const minButton = Object.fromEntries(STATES.map((s) => [s, Object.fromEntries(perState[s].map((r) => [r.viewport, r.facts.minButton]))]));
    write(`${prefix}responsive-qa`, { artifact: `${prefix}responsive-qa`, phase: PHASE, generatedAt: now(), origin: BASE, viewports: viewports.map(([w, h]) => `${w}x${h}`), overflowByState: overflow, minControlByState: minButton, classes: { desktop: DESKTOP.map(([w, h]) => `${w}x${h}`), tablet: TABLET.map(([w, h]) => `${w}x${h}`), mobile: MOBILE.map(([w, h]) => `${w}x${h}`) }, mobilePattern: "one team at a time (Gold first, Blue one tap away), sticky primary action; 44px touch targets through 1179px", transitionsMs: transitions, passed: allPass });
    const d = (st, k) => perState[st].map((r) => r.facts[k]);
    write(`${prefix}progressive-disclosure-qa`, {
      artifact: `${prefix}progressive-disclosure-qa`, phase: PHASE, generatedAt: now(), origin: BASE,
      coachChaosHiddenUntilRosterSet: ["EMPTY", "DRAFTING", "ERA_REVEAL"].every((s) => d(s, "coachCards").every((n) => n === 0)) && d("COACH_SELECT", "coachCards").every((n) => n === 3),
      resultDockAbsentDuringDraft: ["EMPTY", "DRAFTING", "ERA_REVEAL", "COACH_SELECT", "READY"].every((s) => d(s, "docks").every((n) => n === 0)),
      liveIntelCompactWhileDrafting: d("DRAFTING", "intelCompact").every(Boolean),
      draftPressureStatedOnce: d("DRAFTING", "draftPressureMentions").every((n) => n === 1),
      eraRevealIsADedicatedState: d("ERA_REVEAL", "eraReveal").every((n) => n === 1),
      contextualRailGoneAtResult: d("RESULT", "rail").every((n) => n === 0),
      passed: allPass,
    });
  }
  return allPass;
}

// ── resume: refresh, and lobby → Continue, at every recoverable state ────────
async function resumeMode() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  await openSession(context);
  const page = await context.newPage();
  await freshAccount(page);
  const rows = [];
  const runId = () => page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  const probe = async (st, label = st) => {
    if (st === "RESULT") {
      // A finished result is App state. Leaving via the lobby and re-entering
      // Chaos is measured, never assumed; a hard reload is recorded as what it is.
      const score = await page.locator(".ec-ta-score-n").allInnerTexts();
      await page.reload({ waitUntil: "domcontentloaded" });
      const afterReload = await stateNow(page);
      // The finished game is one tap away from the empty frame: LAST CLASH.
      const last = page.locator(".ec-ta-lastclash");
      const lastClash = await last.waitFor({ timeout: 10_000 }).then(() => last.innerText()).catch(() => null);
      const scoreKept = !!lastClash && score.every((n) => lastClash.includes(n));
      await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
      const continueOffered = await page.locator(".ec-continue-cta").waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
      rows.push({ state: st, reload: afterReload, lastClashAfterReload: lastClash ? lastClash.replace(/\s+/g, " ") : null, scoreKept, lobbyContinueOffered: continueOffered,
        pass: afterReload === "EMPTY" && scoreKept && !continueOffered,
        note: "a finished game is not an active run: a hard reload returns to the empty frame with the result one tap away as LAST CLASH, the lobby offers no Continue for it, and a signed-in account has it in My EraClash" });
      console.log(`  ${rows.at(-1).pass ? "PASS" : "FAIL"}  RESULT: reload→${afterReload} · last clash kept ${scoreKept} · lobby Continue ${continueOffered}`);
      return;
    }
    const before = await runId();
    await page.reload({ waitUntil: "domcontentloaded" });
    await stageIn(page, st).catch(() => {});
    const afterReload = await stateNow(page);
    const heldAfterReload = await page.locator('.ec-pc[data-held="true"]').count();
    // Lobby → Continue (a run in progress) or → START CHAOS CLASH (no run yet)
    await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
    // The lobby's mode action carries the mode's name as its label, so it is
    // addressed by its card; the Continue card's action by its own class.
    const cont = page.locator(st === "EMPTY" ? ".ec-mode-card--primary .ec-mode-action" : ".ec-continue-cta").first();
    const hasContinue = await cont.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
    if (hasContinue) await cont.click();
    await stageIn(page, st).catch(() => {});
    const afterContinue = await stateNow(page);
    const after = await runId();
    rows.push({ state: label, reload: afterReload, heldAfterReload, lobbyOffered: st === "EMPTY" ? "START CHAOS CLASH" : (hasContinue ? "Continue" : "none"), continue: afterContinue, sameRun: st === "EMPTY" ? null : before === after && !!before,
      pass: afterReload === st && afterContinue === st && before === after && (st === "EMPTY" || hasContinue) });
    console.log(`  ${rows.at(-1).pass ? "PASS" : "FAIL"}  ${label}: reload→${afterReload} · continue→${afterContinue} · same run ${before === after}`);
  };
  const pickProbe = async () => {
    // The pick is not a commitment until CONTINUE: a refresh returns to Coach
    // Chaos with the same three offers and no pick, and the hire is not spent.
    const before = await runId();
    await page.reload({ waitUntil: "domcontentloaded" });
    await stageIn(page, "COACH_SELECT").catch(() => {});
    await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }).catch(() => {});
    const st = await stateNow(page); const after = await runId();
    const offers = await page.locator(".ec-coach-card").count();
    const ctaDisabled = await page.locator(".ec-ta-cta").isDisabled().catch(() => null);
    rows.push({ state: "COACH_SELECT (offer picked, not yet continued)", reload: st, offersAfterReload: offers, pickCleared: ctaDisabled === true, sameRun: before === after && !!before, pass: st === "COACH_SELECT" && offers === 3 && before === after,
      note: "a pick becomes a hire only on CONTINUE WITH COACH; the reload returns the offers and asks for the pick again" });
    console.log(`  ${rows.at(-1).pass ? "PASS" : "FAIL"}  COACH_SELECT (offer picked): reload→${st} · offers ${offers} · pick cleared ${ctaDisabled} · same run ${before === after}`);
    await page.getByRole("button", { name: /^Select / }).first().click();
  };
  const _label = (st) => (st === "COACH_SELECT" ? "COACH_SELECT (final roster locked, offers dealt)" : st);
  await walk(page, (st) => probe(st, _label(st)), { afterAdapt: () => probe("DRAFTING", "DRAFTING (roll 2, era acknowledged)"), afterPick: pickProbe });
  await browser.close();
  const recoverable = rows.filter((r) => r.state !== "RESULT");
  const passed = rows.every((r) => r.pass);
  write("active-run-resume-qa", { artifact: "active-run-resume-qa", phase: PHASE, generatedAt: now(), origin: BASE, rows, passed,
    note: "The era acknowledgement is kept per run id in this browser, so ERA_REVEAL returns until it has been adapted to and DRAFTING returns after. No Continue spends a run: the run id is unchanged across every round-trip." });
  write("state-machine-qa", { artifact: "state-machine-qa", phase: PHASE, generatedAt: now(), origin: BASE,
    resolver: "src/components/arena/guidedState.js", states: STATES, derivedFrom: "the server run view (phase, coachDraft.selecting, eraState.revealed) + the shell's game phase + a per-run era acknowledgement",
    reached: rows.map((r) => r.state), recoverable: recoverable.map((r) => ({ state: r.state, reload: r.reload, continue: r.continue })), passed });
  return passed;
}

// ── accessibility ────────────────────────────────────────────────────────────
async function accessibilityMode() {
  const browser = await chromium.launch();
  const results = [];
  for (const [vw, vh, reduce] of [[1536, 1024, false], [390, 844, false], [1536, 1024, true]]) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: reduce ? "reduce" : "no-preference" });
    await openSession(context);
    const page = await context.newPage();
    await freshAccount(page);
    const per = [];
    await walk(page, async (st) => {
      await page.waitForTimeout(300);
      const a = await page.evaluate((st) => {
        const lum = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        // The nearest opaque background — a gradient's first stop counts, since the
        // primary action is painted with one.
        const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); const bg = cs.backgroundColor; const m = bg.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return bg; const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) { const gm = g[0].match(/[\d.]+/g); if (gm && (gm.length < 4 || Number(gm[3]) > 0.5)) return g[0]; } n = n.parentElement; } return "rgb(3,7,13)"; };
        const ratio = (el) => { const cs = getComputedStyle(el); const a = lum(cs.color), b = lum(bgOf(el)); if (a == null || b == null) return null; const [hi, lo] = a > b ? [a, b] : [b, a]; return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
        const sample = (sel) => { const el = document.querySelector(sel); if (!el || el.disabled) return null; const px = parseFloat(getComputedStyle(el).fontSize); const c = ratio(el); return { sel, px, contrast: c, needs: px >= 18.5 ? 3 : 4.5, ok: c == null || c >= (px >= 18.5 ? 3 : 4.5) }; };
        const texts = [".ec-ta-title-main", ".ec-ta-title-sub", ".ec-ta-cta", ".ec-ta-cta-sub", ".ec-intel-value", ".ec-intel-label", ".ec-era-reveal-card", ".ec-era-reveal-body", ".ec-coach-blurb", ".ec-ta-staff-v", ".ec-ta-score-winner", ".ec-pc-name"].map(sample).filter(Boolean);
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const controls = [...document.querySelectorAll(".ec-ta button, .ec-ta [role=tab]")].filter(vis);
        return {
          state: st, texts,
          liveRegions: document.querySelectorAll("[aria-live]").length,
          announcement: [...document.querySelectorAll(".sr-only[aria-live]")].map((e) => e.textContent.trim()).filter(Boolean)[0] || "",
          holdsAnnounced: [...document.querySelectorAll(".ec-pc-action")].every((b) => b.hasAttribute("aria-pressed")),
          coachSelectAnnounced: [...document.querySelectorAll(".ec-coach-action")].every((b) => b.hasAttribute("aria-pressed")),
          progressSemantic: !!document.querySelector('.ec-ta-stepper[role="list"]') || st === "RESULT",
          teamToggleSemantic: !document.querySelector(".ec-ta-team-toggle") || !!document.querySelector('.ec-ta-team-toggle[role="tablist"]'),
          focusOnPrimary: window.__focusAtEntry?.[st] ?? null,
          decisionFocused: window.__decisionFocusAtEntry?.[st] ?? null,
          minTarget: controls.length ? Math.min(...controls.map((b) => Math.round(b.getBoundingClientRect().height))) : null,
          unlabelledButtons: controls.filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label"))).length,
          eraAnimation: (() => { const e = document.querySelector(".ec-era-reveal"); return e ? getComputedStyle(e).animationName : null; })(),
        };
      }, st);
      // Keyboard focus is the one that must be visible: Tab once and read the ring.
      await page.keyboard.press("Tab");
      a.focusVisible = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" || cs.boxShadow !== "none"; });
      per.push(a);
    }, { onEntry: (st) => page.evaluate((st) => {
      window.__focusAtEntry = window.__focusAtEntry || {}; window.__decisionFocusAtEntry = window.__decisionFocusAtEntry || {};
      const e = document.activeElement;
      window.__focusAtEntry[st] = !!e?.classList?.contains("ec-ta-cta");
      // Where the primary action is disabled (Coach Chaos before a pick), focus
      // belongs on the decision itself: the first offer's Select.
      window.__decisionFocusAtEntry[st] = !!(e?.classList?.contains("ec-ta-cta") || e?.classList?.contains("ec-coach-action"));
    }, st) });
    // Keyboard: from the empty frame, Tab must reach ROLL and Enter must deal.
    await freshAccount(page); await page.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await stageIn(page, "EMPTY");
    let reached = false; for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press("Tab"); reached = await page.evaluate(() => document.activeElement?.classList?.contains("ec-ta-cta")); }
    if (reached) await page.keyboard.press("Enter");
    const dealtByKeyboard = reached ? await stageIn(page, "DRAFTING", 60_000).then(() => true).catch(() => false) : false;
    await context.close();
    const failures = [];
    for (const p of per) {
      for (const t of p.texts) if (!t.ok) failures.push(`${p.state} ${t.sel} contrast ${t.contrast}:1 at ${t.px}px`);
      if (p.liveRegions < 1) failures.push(`${p.state}: no live region`);
      if (!p.announcement && p.state !== "EMPTY") failures.push(`${p.state}: nothing announced`);
      if (!p.holdsAnnounced) failures.push(`${p.state}: hold state not announced`);
      if (!p.coachSelectAnnounced) failures.push(`${p.state}: coach selection not announced`);
      if (!p.progressSemantic) failures.push(`${p.state}: progress indicator is not semantic`);
      if (!p.teamToggleSemantic) failures.push(`${p.state}: team toggle is not a tablist`);
      if (p.focusVisible === false) failures.push(`${p.state}: focus not visible`);
      if (p.minTarget != null && p.minTarget < (vw <= 767 ? 44 : 24)) failures.push(`${p.state}: ${p.minTarget}px control`);
      if (p.unlabelledButtons) failures.push(`${p.state}: ${p.unlabelledButtons} unlabelled buttons`);
      if (reduce && p.state === "ERA_REVEAL" && p.eraAnimation && p.eraAnimation !== "none") failures.push("era reveal animates under reduced motion");
      if (!reduce && ["DRAFTING", "READY"].includes(p.state) && !p.focusOnPrimary) failures.push(`${p.state}: focus did not move to the primary action`);
      if (!reduce && p.state === "COACH_SELECT" && !p.decisionFocused) failures.push(`${p.state}: focus did not move to the decision`);
    }
    if (!dealtByKeyboard) failures.push("the first roll cannot be made from the keyboard");
    results.push({ viewport: `${vw}x${vh}`, reducedMotion: reduce, states: per, keyboard: { tabReachesRoll: reached, dealtByKeyboard }, failures });
    console.log(`  ${failures.length ? "FAIL" : "PASS"}  ${vw}×${vh}${reduce ? " reduced-motion" : ""}${failures.length ? " — " + failures.join("; ") : ""}`);
  }
  await browser.close();
  const passed = results.every((r) => r.failures.length === 0);
  write("accessibility-qa", { artifact: "accessibility-qa", phase: PHASE, generatedAt: now(), origin: BASE, standard: "WCAG 2.1 AA (4.5:1 body, 3:1 large), 44px targets, semantic progress and tabs, aria-live announcements from real values, focus follows the decision, reduced motion", results, passed });
  return passed;
}

// ── performance ──────────────────────────────────────────────────────────────
async function performanceMode() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  await openSession(context);
  const page = await context.newPage();
  await freshAccount(page);
  await page.addInitScript(() => {
    window.__cls = 0; window.__shifts = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value;
      window.__shifts.push({ t: Math.round(e.startTime), value: +e.value.toFixed(4), nodes: [...new Set((e.sources || []).map((x) => x.node ? (x.node.className && String(x.node.className).split(" ")[0]) || x.node.tagName : "?"))].slice(0, 6) }); } }).observe({ type: "layout-shift", buffered: true }); } catch (e) {}
  });
  const clsAt = {};
  const shiftCount = {};
  const t = await walk(page, async (st) => { await page.waitForTimeout(600); clsAt[st] = await page.evaluate(() => +window.__cls.toFixed(4)); shiftCount[st] = await page.evaluate(() => window.__shifts.length); });
  // Which elements moved when the result landed — read from the observer's sources.
  const resultShifts = await page.evaluate((from) => window.__shifts.slice(from), shiftCount.READY || 0);
  const paint = await page.evaluate(() => { const p = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint"); return p ? Math.round(p.startTime) : null; });
  await browser.close();
  const assets = existsSync("dist/assets") ? readdirSync("dist/assets").map((f) => ({ file: f, kb: Math.round(statSync(`dist/assets/${f}`).size / 1024) })).sort((a, b) => b.kb - a.kb) : [];
  const failures = [];
  if (paint == null) failures.push("first paint not measured"); else if (paint > 2500) failures.push(`first paint ${paint}ms`);
  if (clsAt.READY > 0.1) failures.push(`layout shift through the decision states ${clsAt.READY}`);
  // When the result lands the board and the score must not move; whatever moves
  // below the result (utility bar, footer) is recorded with its size.
  // A shift the observer attributes to the head or board counts when it is
  // perceptible (≥ 0.01); a one-frame sub-pixel settle is recorded, not failed.
  const boardMoved = resultShifts.some((s) => s.value >= 0.01 && s.nodes.some((n) => /^(ec-ta-stage|ec-ta-roster|ec-ta-team|ec-pc|ec-ta-score|ec-ta-stage-head|ec-ta-title)/.test(String(n))));
  if (boardMoved) failures.push("the board or the score moved when the result landed");
  if (clsAt.RESULT - clsAt.READY > 0.1) failures.push(`content below the result moved when it landed: ${(clsAt.RESULT - clsAt.READY).toFixed(3)} (target ≤ 0.1)`);
  for (const [st, ms] of Object.entries(t)) if (st !== "RESULT" && ms > 4000) failures.push(`${st} took ${ms}ms to appear`);
  write("performance-qa", { artifact: "performance-qa", phase: PHASE, generatedAt: now(), origin: BASE,
    firstContentfulPaintMs: paint, cumulativeLayoutShiftByState: clsAt, stateTransitionMs: t,
    note: "Transition times include the server round trip for the action (a roll, a hire, the simulation); RESULT includes the whole simulation. CLS is cumulative across the flow, so the RESULT figure is the total.",
    resultArrivalShifts: resultShifts,
    bundle: { largest: assets.slice(0, 5), totalKb: assets.reduce((n, a) => n + a.kb, 0) }, failures, passed: failures.length === 0 });
  console.log(`  FCP ${paint}ms · CLS ${clsAt.RESULT} · transitions ${JSON.stringify(t)}`);
  return failures.length === 0;
}

// ── contact sheets: each capture beside its owner reference ──────────────────
async function contactSheets() {
  const dir = `${SHOTS}/contact`; mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 3120, height: 1150 } });
  const data = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const sheets = [];
  for (const st of STATES) {
    const ref = `${REF_DIR}/${REF[st]}`;
    const desk = `${SHOTS}/1536x1024/${FILE[st]}.png`;
    if (!existsSync(desk)) { console.log(`  skip ${FILE[st]} (no 1536 capture)`); continue; }
    const m430 = `${SHOTS}/430x932/${FILE[st]}.png`, m390 = `${SHOTS}/390x844/${FILE[st]}.png`;
    const html = `<!doctype html><html><body style="margin:0;background:#07090e;color:#dfe6f2;font:700 14px/1.3 system-ui;padding:14px">
      <div style="display:grid;grid-template-columns:1536px 1536px;gap:24px;align-items:start">
        <div><div style="letter-spacing:2px;margin-bottom:8px">OWNER REFERENCE · ${REF[st]}</div><img src="${data(ref)}" style="width:1536px;display:block;border:1px solid #2a3140"></div>
        <div><div style="letter-spacing:2px;margin-bottom:8px">BUILD · ${FILE[st]} · 1536×1024 · ${BASE.replace(/^https?:\/\//, "")}</div><img src="${data(desk)}" style="width:1536px;display:block;border:1px solid #2a3140"></div>
      </div></body></html>`;
    await page.setContent(html); await page.screenshot({ path: `${dir}/${FILE[st]}.jpg`, type: "jpeg", quality: 90, fullPage: true });
    if (existsSync(m430) && existsSync(m390)) {
      const mh = `<!doctype html><html><body style="margin:0;background:#07090e;color:#dfe6f2;font:700 14px/1.3 system-ui;padding:14px">
        <div style="display:grid;grid-template-columns:1024px 430px 390px;gap:24px;align-items:start">
          <div><div style="letter-spacing:2px;margin-bottom:8px">OWNER REFERENCE (scaled)</div><img src="${data(ref)}" style="width:1024px;display:block;border:1px solid #2a3140"></div>
          <div><div style="letter-spacing:2px;margin-bottom:8px">430×932</div><img src="${data(m430)}" style="width:430px;display:block;border:1px solid #2a3140"></div>
          <div><div style="letter-spacing:2px;margin-bottom:8px">390×844</div><img src="${data(m390)}" style="width:390px;display:block;border:1px solid #2a3140"></div>
        </div></body></html>`;
      await page.setViewportSize({ width: 1920, height: 1000 }); await page.setContent(mh); await page.screenshot({ path: `${dir}/${FILE[st]}-mobile.jpg`, type: "jpeg", quality: 90, fullPage: true });
      await page.setViewportSize({ width: 3120, height: 1150 });
    }
    const t1024 = `${SHOTS}/1024x1366/${FILE[st]}.png`, t768 = `${SHOTS}/768x1024/${FILE[st]}.png`;
    if (existsSync(t1024) && existsSync(t768)) {
      const th = `<!doctype html><html><body style="margin:0;background:#07090e;color:#dfe6f2;font:700 14px/1.3 system-ui;padding:14px">
        <div style="display:grid;grid-template-columns:1024px 1024px 768px;gap:24px;align-items:start">
          <div><div style="letter-spacing:2px;margin-bottom:8px">OWNER REFERENCE (scaled)</div><img src="${data(ref)}" style="width:1024px;display:block;border:1px solid #2a3140"></div>
          <div><div style="letter-spacing:2px;margin-bottom:8px">1024×1366</div><img src="${data(t1024)}" style="width:1024px;display:block;border:1px solid #2a3140"></div>
          <div><div style="letter-spacing:2px;margin-bottom:8px">768×1024</div><img src="${data(t768)}" style="width:768px;display:block;border:1px solid #2a3140"></div>
        </div></body></html>`;
      await page.setViewportSize({ width: 2900, height: 1400 }); await page.setContent(th); await page.screenshot({ path: `${dir}/${FILE[st]}-tablet.jpg`, type: "jpeg", quality: 90, fullPage: true });
      await page.setViewportSize({ width: 3120, height: 1150 });
    }
    sheets.push({ state: st, reference: ref, desktop: `${dir}/${FILE[st]}.jpg`, tablet: `${dir}/${FILE[st]}-tablet.jpg`, mobile: `${dir}/${FILE[st]}-mobile.jpg` });
    console.log(`  sheet ${FILE[st]}`);
  }
  await browser.close();
  return sheets;
}

// ── deployed: the states drive against a gated preview, plus what it ships ───
async function deployedMode() {
  if (!BASE.startsWith("https://")) { console.error("deployed mode needs an https origin"); process.exit(2); }
  const passed = await statesMode([[1536, 1024], [390, 844]], null, "deployed-");
  const browser = await chromium.launch(); const context = await browser.newContext(); await openSession(context);
  const page = await context.newPage(); await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });
  const audit = await page.evaluate(async () => {
    const srcs = [...document.querySelectorAll("script[src]")].map((s) => s.src);
    const out = { assets: srcs.length, secretShaped: 0, serviceRoleJwt: 0, bytes: 0 };
    const roleOf = (j) => { try { return JSON.parse(atob(j.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || null; } catch { return null; } };
    for (const s of srcs) { const t = await (await fetch(s)).text(); out.bytes += t.length; out.secretShaped += (t.match(/sb_secret_[A-Za-z0-9_-]{16,}/g) || []).length; for (const j of t.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g) || []) if (roleOf(j) === "service_role") out.serviceRoleJwt += 1; }
    return out;
  });
  const health = await (await context.request.get(`${BASE}/api/health`)).json();
  // Which build the alias serves. The service worker's cache identity is a
  // content hash and differs from a local build because the environment is
  // baked into the bundle, so it is recorded, not compared. The proof that the
  // alias serves THIS head is a marker only this head carries: the browser key
  // the finished game is kept under (App.jsx, 9B.3).
  const idOf = (t) => (String(t).match(/eraclash-assets:[0-9.]+:[0-9a-f]+/) || [null])[0];
  const served = idOf(await (await context.request.get(`${BASE}/sw.js`)).text());
  const local = existsSync("dist/sw.js") ? idOf(readFileSync("dist/sw.js", "utf8")) : null;
  const bundleHasMarker = await page.evaluate(async () => { for (const s of [...document.querySelectorAll("script[src]")].map((x) => x.src)) { if ((await (await fetch(s)).text()).includes("ec_prior_result")) return true; } return false; });
  await browser.close();
  const ok = passed && audit.secretShaped === 0 && audit.serviceRoleJwt === 0 && health?.preview?.candidateId === "Candidate 4" && bundleHasMarker;
  write("secret-audit", { artifact: "secret-audit", phase: PHASE, generatedAt: now(), origin: BASE, bundle: audit, buildIdentity: { served, localFinalBuild: local, servesThisHead: bundleHasMarker, note: "content hashes differ between a local and a Vercel build (environment is baked in); servesThisHead reads a marker introduced at this head" }, candidate: { id: health?.preview?.candidateId, coreHash: health?.preview?.candidateCoreHash, calibration: health?.preview?.calibrationVersion }, passed: audit.secretShaped === 0 && audit.serviceRoleJwt === 0 });
  console.log(`  deployed: states ${passed ? "pass" : "FAIL"} · secrets ${audit.secretShaped + audit.serviceRoleJwt} · ${health?.preview?.candidateId} ${health?.preview?.calibrationVersion} · build ${served} · serves this head ${bundleHasMarker}`);
  return ok;
}

const run = async () => {
  mkdirSync(SHOTS, { recursive: true });
  let ok = true;
  console.log(`\nCHAOS GUIDED FLOW QA — ${MODE} — ${BASE}`);
  if (MODE === "states") ok = await statesMode();
  else if (MODE === "era-reveal") ok = await statesMode([[1536, 1024]], "ERA_REVEAL");
  else if (MODE === "coach-flow") ok = await statesMode([[1536, 1024]], "COACH_SELECT");
  else if (MODE === "result-flow") ok = await statesMode([[1536, 1024]], "RESULT");
  else if (MODE === "resume") ok = await resumeMode();
  else if (MODE === "accessibility") ok = await accessibilityMode();
  else if (MODE === "performance") ok = await performanceMode();
  else if (MODE === "contact-sheets") ok = (await contactSheets()).length === 6;
  else if (MODE === "deployed") ok = await deployedMode();
  else { console.error(`unknown mode ${MODE}`); process.exit(2); }
  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
};
run().catch((e) => { console.error(e); process.exit(1); });
