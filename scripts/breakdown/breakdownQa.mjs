#!/usr/bin/env node
// ── Clash Breakdown V1 — the gates ────────────────────────────────────────────
//   node scripts/breakdown/breakdownQa.mjs <mode> [origin]
//
//   capability  the machine-readable capability map: the contract's A/D/N
//               classification checked against a REAL completed result from
//               the running harness (Candidate 4) and, when FALLBACK_ORIGIN is
//               up, the engine's error-fallback path
//   journey     a guest plays a Chaos Clash on the fake-cloud harness (4178):
//               score first, entry present, every displayed number equal to
//               the projection of the authoritative /api/game response, team
//               comparison directionality, key performances, game flow,
//               refresh → the last Clash still opens it, Run It Back is a new
//               seed, and a two-account Challenge still completes unchanged
//   responsive  360/375/390/430/768/1280/1440: no overflow, controls ≥ 44px,
//               nothing covered by the pinned header, keyboard reachability,
//               reduced motion, 200% text zoom, screenshots
//   deployed    the same guest journey on a protected preview (owner key)
//
// Every mode writes one artifact under data/validation/breakdown-v1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { buildBreakdown } from "../../src/breakdown/engine.js";
import * as C from "../../src/breakdown/contract.js";

const MODE = process.argv[2] || "capability";
const BASE = (process.argv[3] || "http://localhost:4178").replace(/\/$/, "");
const FALLBACK = (process.env.FALLBACK_ORIGIN || "").replace(/\/$/, "");
const OUT = "data/validation/breakdown-v1";
const SHOTS = `${OUT}/screens`;
const PHASE = "Clash Breakdown V1";
const now = () => new Date().toISOString();
const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ check: name, pass: !!pass, detail: String(detail).slice(0, 300) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " … " + String(detail).slice(0, 140) : ""}`); };
const write = (name, extra = {}) => { mkdirSync(OUT, { recursive: true }); const passed = checks.every((c) => c.pass); writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ artifact: name, phase: PHASE, generatedAt: now(), origin: BASE, checks, passed, ...extra }, null, 2) + "\n"); console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed → ${OUT}/${name}.json`); process.exit(passed ? 0 : 1); };
const J = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";

const { chromium } = await import("@playwright/test");
const browser = await chromium.launch();
const gate = async (ctx) => {
  if (!BASE.startsWith("https://")) return;
  const f = ".preview-secrets/wave2-access-keys.json";
  if (!existsSync(f)) throw new Error(`${BASE} is gated and ${f} is not on disk`);
  const k = JSON.parse(readFileSync(f, "utf8")).keys.find((x) => x.role === "owner");
  const r = await ctx.request.post(`${BASE}/api/preview-access`, { form: { key: k.key }, maxRedirects: 0 });
  if (r.status() !== 303) throw new Error(`preview access refused: HTTP ${r.status()}`);
};
const fresh = (page) => page.addInitScript(() => { try { if (sessionStorage.getItem("qa_seeded")) return; sessionStorage.setItem("qa_seeded", "1"); localStorage.setItem("ec_seen", "1"); localStorage.removeItem("ec_chaos_run"); localStorage.removeItem("ec_chaos_challenge"); localStorage.removeItem("ec_prior_result"); } catch (e) {} });
const tapOrClick = async (loc, touch) => (touch ? loc.tap() : loc.click());
/** Play one Chaos Clash through the real UI; returns the authoritative /api/game response for the Clash. */
const play = async (page, { touch = false, base = BASE } = {}) => {
  let game = null;
  const onResp = async (r) => { if (r.url().includes("/api/game") && r.request().method() === "POST") { try { const j = await r.json(); if (j?.result?.v3 || j?.result?.core) game = j; } catch {} } };
  page.on("response", onResp);
  const click = async (re) => { const b = page.getByRole("button", { name: re }).first(); await b.waitFor({ timeout: 30_000 }); await tapOrClick(b, touch); };
  await page.goto(`${base}/play/chaos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.ec-ta-stage[data-guided-state="EMPTY"]', { timeout: 60_000 }); await click(/^ROLL$/);
  await page.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
  const runId = await page.evaluate(() => localStorage.getItem("ec_chaos_run"));
  await click(/^ROLL 2$/); await click(/FINAL ROLL/);
  await page.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await tapOrClick(page.getByRole("button", { name: /^Select / }).first(), touch);
  await click(/CONTINUE WITH COACH/); await click(/RUN CLASH/); await page.locator(".ec-ta-score[data-winner]").waitFor({ timeout: 120_000 });
  for (let i = 0; i < 40 && !game; i++) await page.waitForTimeout(100);
  page.off("response", onResp);
  return { game, runId };
};
/** Read what the open breakdown shows, as text, for comparison with the projection. */
const readShown = (page) => page.evaluate(() => {
  const root = document.querySelector(".ec-bd"); if (!root) return null;
  const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
  return {
    diffs: [...root.querySelectorAll(".ec-bd-diff")].map((d) => ({ id: d.dataset.insight, title: t(d.querySelector(".ec-bd-diff-title")), values: t(d.querySelector(".ec-bd-diff-values")), summary: t(d.querySelector(".ec-bd-diff-summary")) })),
    balanced: t(root.querySelector(".ec-bd-balanced")),
    cmp: [...root.querySelectorAll(".ec-bd-cmp-row[data-metric]")].map((r) => ({ key: r.dataset.metric, stronger: r.dataset.stronger, cells: [...r.querySelectorAll('[role="cell"]')].map((c) => c.childNodes[0]?.textContent?.trim()) })),
    perf: [...root.querySelectorAll(".ec-bd-perf-team")].map((tm) => ({ team: tm.dataset.team, lines: [...tm.querySelectorAll(".ec-bd-perf")].map((p) => ({ label: t(p.querySelector(".ec-bd-perf-label")), name: t(p.querySelector(".ec-bd-perf-name")), stats: t(p.querySelector(".ec-bd-perf-line")), shooting: t(p.querySelector(".ec-bd-perf-shoot")) })) })),
    flow: [...root.querySelectorAll(".ec-bd-flow-row")].map((r) => t(r)), facts: [...root.querySelectorAll(".ec-bd-facts li")].map(t),
  };
});
const expectShown = (shown, bd) => {
  const diffsMatch = shown.diffs.length === bd.keyDifferences.length && shown.diffs.every((d, i) => d.id === bd.keyDifferences[i].id && d.values === bd.keyDifferences[i].values && d.summary === bd.keyDifferences[i].summary);
  const cmpMatch = shown.cmp.length === bd.teamComparison.length && shown.cmp.every((r, i) => r.key === bd.teamComparison[i].key && r.cells[0] === bd.teamComparison[i].gold && r.cells[1] === bd.teamComparison[i].blue && r.stronger === (bd.teamComparison[i].stronger || "none"));
  const perfMatch = ["gold", "blue"].every((s) => { const shownTeam = shown.perf.find((p) => p.team === s)?.lines || []; return shownTeam.length === bd.playerPerformances[s].length && shownTeam.every((l, i) => l.label === bd.playerPerformances[s][i].label && l.name.startsWith(bd.playerPerformances[s][i].name) && l.stats === bd.playerPerformances[s][i].stats && l.shooting === bd.playerPerformances[s][i].shooting); });
  const flowMatch = !bd.gameFlow ? shown.flow.length === 0 : shown.flow.length === bd.gameFlow.periods.length && shown.facts.join("|") === bd.gameFlow.facts.join("|") && shown.flow.every((f, i) => f.includes(`Gold ${bd.gameFlow.periods[i].goldTotal} – Blue ${bd.gameFlow.periods[i].blueTotal}`));
  return { diffsMatch, cmpMatch, perfMatch, flowMatch };
};
/** Independent recount from the raw box score — not the engine — for the audit trail. */
const recount = (res) => {
  const v3 = res.v3; const sum = (side, k) => v3.fullBox[side].reduce((a, p) => a + (p[k] || 0), 0);
  return Object.fromEntries(["gold", "blue"].map((s) => [s, { pts: sum(s, "pts"), fgm: sum(s, "fgm"), fga: sum(s, "fga"), tpm: sum(s, "tpm"), tpa: sum(s, "tpa"), ftm: sum(s, "ftm"), fta: sum(s, "fta"), reb: sum(s, "oreb") + sum(s, "dreb"), oreb: sum(s, "oreb"), ast: sum(s, "ast"), stl: sum(s, "stl"), blk: sum(s, "blk"), to: sum(s, "to") }]));
};
const openBreakdown = async (page, touch) => {
  const entry = page.locator(".ec-bd").first(); await entry.waitFor({ timeout: 20_000 }); await entry.scrollIntoViewIfNeeded();
  await tapOrClick(entry.getByRole("button", { name: "OPEN BREAKDOWN" }), touch);
  await tapOrClick(entry.getByRole("button", { name: "TEAM COMPARISON" }), touch);
  return entry;
};

// ── capability ───────────────────────────────────────────────────────────────
if (MODE === "capability") {
  const map = { contractVersion: C.CLASH_BREAKDOWN_VERSION, legend: { A: "recorded authoritatively in the stored result", D: "derived deterministically from recorded fields", N: "not recorded — omitted in V1" }, classification: C.CAPABILITY, deferred: C.DEFERRED, observed: {} };
  const probe = async (origin, label) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); await fresh(p);
    const { game } = await play(p, { base: origin }); await ctx.close();
    const r = game.result, v3 = r.v3 || {};
    const box0 = v3.fullBox?.gold?.[0] || {};
    const allPf0 = v3.fullBox ? [...v3.fullBox.gold, ...v3.fullBox.blue].every((x) => (x.pf || 0) === 0) : null;
    const rc = v3.fullBox ? recount(r) : null;
    map.observed[label] = {
      engine: r.core?.engine, candidate: r.candidate?.candidateId || null,
      hasFullBox: !!v3.fullBox, hasTeamTotals: !!v3.teamTotals, hasPeriodScores: Array.isArray(v3.periodScores || r.periodScores), overtimes: v3.overtimes ?? null,
      playerFields: Object.keys(box0), teamTotalFields: v3.teamTotals ? Object.keys(v3.teamTotals.gold) : [],
      boxSumsEqualTeamTotals: !!(rc && v3.teamTotals && ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "ast", "stl", "blk", "to"].every((k) => rc.gold[k] === v3.teamTotals.gold[k] && rc.blue[k] === v3.teamTotals.blue[k])),
      boxSumsEqualFinalScore: !!(rc && rc.gold.pts === r.core.finalScore.gold && rc.blue.pts === r.core.finalScore.blue),
      foulsAlwaysZero: allPf0, hasMinutes: "min" in box0 || "minutes" in box0, hasPlusMinus: "plusMinus" in box0 || "pm" in box0,
      scoreTimelineStored: !!(v3.ledger || v3.possessionLog || r.ledger), leadChangesStructured: typeof v3.leadChanges === "number" || typeof r.leadChanges === "number",
      breakdownAvailable: buildBreakdown(r).available, breakdownFlow: !!buildBreakdown(r).gameFlow,
    };
    return map.observed[label];
  };
  const c4 = await probe(BASE, "candidate4");
  ok("Candidate 4 result records the box score, team totals and period scores", c4.hasFullBox && c4.hasTeamTotals && c4.hasPeriodScores, JSON.stringify({ engine: c4.engine, candidate: c4.candidate }));
  ok("player lines carry exactly the A-classified fields (plus id/name/pos/pf)", ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to"].every((k) => c4.playerFields.includes(k)) && !c4.hasMinutes && !c4.hasPlusMinus, c4.playerFields.join(","));
  ok("the box sums to the stored team totals and to the final score (counted, not allocated)", c4.boxSumsEqualTeamTotals && c4.boxSumsEqualFinalScore);
  ok("fouls: the pf column is always 0 → classified N", c4.foulsAlwaysZero === true && C.CAPABILITY.team.fouls === "N");
  ok("no score timeline or structured lead-change count is stored → lead changes/runs/largest lead classified N and deferred", !c4.scoreTimelineStored && !c4.leadChangesStructured && C.CAPABILITY.team.leadChanges === "N");
  ok("the breakdown is available with period-level game flow on Candidate 4", c4.breakdownAvailable && c4.breakdownFlow);
  if (FALLBACK) {
    const fb = await probe(FALLBACK, "fallbackEngine");
    ok("the engine's fallback path records the box score and totals but no period scores → breakdown without game flow", fb.hasFullBox && fb.hasTeamTotals && !fb.hasPeriodScores && fb.breakdownAvailable && !fb.breakdownFlow, JSON.stringify({ engine: fb.engine }));
  } else ok("fallback engine probe skipped (set FALLBACK_ORIGIN to a harness with PREVIEW_SIM_ENGINE_ENABLED=false)", true, "skipped");
  mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/capability-map.json`, JSON.stringify(map, null, 2) + "\n");
  console.log(`  → ${OUT}/capability-map.json`);
  write("capability-qa");
}

// ── journey (guest, harness) ─────────────────────────────────────────────────
if (MODE === "journey" || MODE === "deployed") {
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await gate(ctx);
  const page = await ctx.newPage(); await fresh(page);
  // Chaos draft actions also POST /api/game; a RESULT is a response carrying a resultId.
  const resultIds = new Set(); let postsAfterResult = 0, resultShown = false;
  page.on("request", (r) => { if (resultShown && r.url().includes("/api/game") && r.method() === "POST") postsAfterResult++; });
  page.on("response", async (r) => { if (r.url().includes("/api/game") && r.request().method() === "POST") { try { const j = await r.json(); if (j?.resultId) resultIds.add(j.resultId); } catch {} } });
  const meta = await (await ctx.request.get(`${BASE}/api/v3meta`)).json();
  ok("the build has Clash Breakdown switched on", meta.modes?.clashBreakdown === true, JSON.stringify(meta.modes));
  const { game, runId } = await play(page, { touch: true });
  ok("the authoritative /api/game response was captured for the audit", !!game?.result?.v3?.fullBox, game?.resultId);
  const bd = buildBreakdown(game.result);
  resultShown = true;
  // 5. score remains visually primary
  const pos = await page.evaluate(() => { const s = document.querySelector(".ec-ta-score[data-winner]"); const b = document.querySelector(".ec-bd"); return s && b ? { score: s.getBoundingClientRect().top + scrollY, bd: b.getBoundingClientRect().top + scrollY, bdOpen: b.dataset.open } : null; });
  ok("the final score sits above the breakdown entry, which starts collapsed", pos && pos.score < pos.bd && pos.bdOpen === "false", JSON.stringify(pos));
  const teaser = await page.locator(".ec-bd-teaser").textContent();
  ok("the collapsed entry states the single largest recorded difference (or the balanced line)", teaser === (bd.keyDifferences[0]?.summary || bd.balancedLine), teaser);
  await page.locator(".ec-bd").scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/phone-390-result-entry.png` });
  const entry = await openBreakdown(page, true);
  const shown = await readShown(page);
  const m = expectShown(shown, bd);
  ok(`up to three differences, exactly the projection's (${bd.keyDifferences.length} shown)`, m.diffsMatch && shown.diffs.length <= 3, shown.diffs.map((d) => d.id).join(",") || "balanced");
  const rc = recount(game.result);
  const sumsOk = bd.teamComparison.every((row) => { const g = row.gold, b = row.blue; const k = row.key; const R = (s) => rc[s]; const fmt = (s) => ({ fg: `${R(s).fgm}/${R(s).fga}`, tp: `${R(s).tpm}/${R(s).tpa}`, ft: `${R(s).ftm}/${R(s).fta}`, reb: String(R(s).reb), oreb: String(R(s).oreb), ast: String(R(s).ast), to: String(R(s).to), stl: String(R(s).stl), blk: String(R(s).blk) }[k]); return fmt("gold") === undefined || (fmt("gold") === g && fmt("blue") === b); });
  ok("every team number shown equals an independent recount of the raw box score", m.cmpMatch && sumsOk);
  ok("directionality: turnovers favour the lower count; splits and possessions are never marked", (() => { const to = shown.cmp.find((r) => r.key === "to"); const gT = Number(to.cells[0]), bT = Number(to.cells[1]); return (gT === bT ? to.stronger === "none" : to.stronger === (gT < bT ? "gold" : "blue")) && ["fg", "tp", "ft", "possessions"].every((k) => (shown.cmp.find((r) => r.key === k)?.stronger ?? "none") === "none"); })());
  ok("key performances from BOTH teams, exactly the projection's lines", m.perfMatch && shown.perf.every((t) => t.lines.length >= 1));
  ok("game flow: period rows add up to the final score and the facts match", m.flowMatch && (!bd.gameFlow || (bd.gameFlow.periods.at(-1).goldTotal === game.result.core.finalScore.gold && bd.gameFlow.periods.at(-1).blueTotal === game.result.core.finalScore.blue)));
  ok("no causal wording and no MVP label in the rendered breakdown", !/won because|decided|turning point|momentum|dagger|clutch|\bMVP\b|contributed \d+%/i.test(await entry.textContent()));
  await entry.screenshot({ path: `${SHOTS}/phone-390-breakdown-open.png` });
  // audit pair: the raw authoritative record (allowlisted sections only) and its projection
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/audit-${MODE}-source.json`, JSON.stringify({ note: "The authoritative /api/game response for the Clash in the screenshots, reduced to the fields the breakdown may read (seed, fingerprint, draft and narrative omitted).", resultId: game.resultId, finalScore: game.result.core.finalScore, overtimes: game.result.v3.overtimes, periodScores: game.result.v3.periodScores || game.result.periodScores || null, teamTotals: game.result.v3.teamTotals, fullBox: game.result.v3.fullBox }, null, 2) + "\n");
  writeFileSync(`${OUT}/audit-${MODE}-breakdown.json`, JSON.stringify(bd, null, 2) + "\n");
  // no network call was made to open it (pure, client-side)
  const netBefore = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) netBefore.push(r.url()); });
  await tapOrClick(entry.getByRole("button", { name: "CLOSE" }), true); await tapOrClick(entry.getByRole("button", { name: "OPEN BREAKDOWN" }), true);
  await page.waitForTimeout(300);
  ok("opening the breakdown makes no API request (pure projection of the result already on screen)", netBefore.filter((u) => !u.includes("/api/events")).length === 0, netBefore.join(","));
  // 13. refresh: the finished Clash becomes the remembered last Clash; the breakdown still opens there
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('.ec-ta-stage', { timeout: 60_000 });
  const openLast = page.locator(".ec-ta-lastclash").first();
  let afterRefresh = null;
  if (await page.locator(".ec-bd").count()) afterRefresh = "result";
  else if (await openLast.count()) { await tapOrClick(openLast, true); await page.locator(".ec-sheet .ec-bd").waitFor({ timeout: 10_000 }).catch(() => {}); if (await page.locator(".ec-sheet .ec-bd").count()) afterRefresh = "last-clash-sheet"; }
  const bdAfter = afterRefresh ? await (async () => { const e = page.locator(".ec-bd").first(); await tapOrClick(e.getByRole("button", { name: "OPEN BREAKDOWN" }), true); await tapOrClick(e.getByRole("button", { name: "TEAM COMPARISON" }), true); return readShown(page); })() : null;
  ok("after a refresh the same breakdown reopens from the remembered result", !!bdAfter && JSON.stringify(bdAfter.diffs) === JSON.stringify(shown.diffs) && JSON.stringify(bdAfter.cmp) === JSON.stringify(shown.cmp), afterRefresh || "not found");
  if (MODE === "journey") {
    // 15. no duplicate result was created by opening/refreshing (one /api/game POST in the whole journey)
    ok("one result for the whole journey: opening, closing and refreshing the breakdown sent no game request and minted no result", resultIds.size === 1 && resultIds.has(game.resultId) && postsAfterResult === 0, `${resultIds.size} result id(s); ${postsAfterResult} game requests after the result`);
    // 16. Run It Back: a new seed as before
    const post = (c, body, headers = {}) => c.request.post(`${BASE}/api/profile`, { data: body, headers: { "content-type": "application/json", ...headers } });
    const rb = await ctx.request.post(`${BASE}/api/game`, { data: { mode: "single", goldIds: game.result.goldIds, blueIds: game.result.blueIds, coachGoldId: game.result.coachIds?.gold, coachBlueId: game.result.coachIds?.blue, eraStyleId: game.result.eraId, simulationId: `qa-rb-${Date.now()}` }, headers: { "content-type": "application/json" } });
    const rbj = await rb.json();
    ok("Run It Back (same five, coaches, era) is a new game with a new seed", rb.ok() && rbj.resultId && rbj.resultId !== game.resultId && rbj.result?.seed !== game.result.seed, `${game.result.seed} → ${rbj.result?.seed}`);
    // 17. Challenge logic unchanged: account creates, second account completes, comparison as before
    const auth = (u) => ({ Authorization: `Bearer test-token.${u}` });
    await post(ctx, { action: "cloud-save", resultId: game.resultId }, auth(J));
    const created = await (await post(ctx, { action: "challenge-create", chaosRunId: runId }, auth(J))).json();
    ok("an account can still create a governed Challenge from this Clash", created.status === "created" || created.status === "already_created", created.status);
    const bea = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const bp = await bea.newPage(); await fresh(bp); await bp.goto(`${BASE}/`);
    const acc = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-accept", code: created.code, tier: "FREE" }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    const inviteBefore = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-view", code: created.code }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    ok("before the attempt the recipient's invitation carries no box score and no breakdown", !/fullBox|teamTotals|keyDifferences|breakdown/i.test(JSON.stringify(inviteBefore)));
    await bp.evaluate(([rid, code]) => { localStorage.setItem("ec_chaos_run", rid); localStorage.setItem("ec_chaos_challenge", JSON.stringify({ chaosRunId: rid, code, creatorName: "Joseph", at: Date.now() })); }, [acc.chaosRunId, created.code]);
    let bgame = null; bp.on("response", async (r) => { if (r.url().includes("/api/game") && r.request().method() === "POST") { try { const j = await r.json(); if (j?.result?.v3) bgame = j; } catch {} } });
    await bp.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await bp.waitForSelector('.ec-ta-stage[data-guided-state="DRAFTING"]', { timeout: 60_000 });
    await bp.locator('.ec-ta-team[data-team="gold"] .ec-pc').nth(4).waitFor({ timeout: 60_000 });
    for (const re of [/^ROLL 2$/, /FINAL ROLL/]) await bp.getByRole("button", { name: re }).first().click();
    await bp.locator(".ec-coach-action:not([disabled])").nth(2).waitFor({ timeout: 60_000 }); await bp.getByRole("button", { name: /^Select / }).first().click();
    await bp.getByRole("button", { name: /CONTINUE WITH COACH/ }).first().click(); await bp.getByRole("button", { name: /RUN CLASH/ }).first().click();
    await bp.locator(".ec-chal-cmp[data-outcome]").waitFor({ timeout: 120_000 });
    const done = await (await bea.request.post(`${BASE}/api/profile`, { data: { action: "challenge-complete", chaosRunId: acc.chaosRunId }, headers: { "content-type": "application/json", ...auth(B) } })).json();
    ok("the Challenge completes with the same comparison contract (1.0.0) and a rating answer", (done.status === "completed" || done.status === "already_completed") && done.comparison?.comparisonVersion === "1.0.0" && !!done.rating, done.status);
    const order = await bp.evaluate(() => { const c = document.querySelector(".ec-chal-cmp"); const b = document.querySelector(".ec-bd"); return c && b ? (c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? "comparison-first" : "breakdown-first") : "missing"; });
    ok("after completing, the recipient sees the comparison first and a breakdown of THEIR OWN game below it", order === "comparison-first" && bgame && (await bp.locator(".ec-bd-teaser").textContent()) === (buildBreakdown(bgame.result).keyDifferences[0]?.summary || C.BALANCED_LINE), order);
    await bea.close();
  }
  await ctx.close();
  write(`${MODE}-qa`, { resultId: game.resultId, insightIds: bd.keyDifferences.map((d) => d.id), note: "Chromium device emulation (Playwright), not a physical iPhone." });
}

// ── responsive ───────────────────────────────────────────────────────────────
if (MODE === "responsive") {
  mkdirSync(SHOTS, { recursive: true });
  const viewports = [[360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1280, 900], [1440, 1000]];
  // one played Clash, reused: the prior result is replayed into each viewport from browser memory
  const seedCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const sp = await seedCtx.newPage(); await fresh(sp);
  const { game } = await play(sp);
  const prior = await sp.evaluate(() => localStorage.getItem("ec_prior_result")); await seedCtx.close();
  const rows = [];
  for (const [w, h] of viewports) {
    const touch = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch }); const p = await ctx.newPage();
    await p.addInitScript((pr) => { try { localStorage.setItem("ec_seen", "1"); localStorage.setItem("ec_prior_result", pr); localStorage.removeItem("ec_chaos_run"); } catch (e) {} }, prior);
    await p.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".ec-ta-stage", { timeout: 60_000 });
    // the remembered last Clash opens in the sheet on phones and in the rail on desktop
    const open = p.locator(".ec-ta-lastclash").first();
    await open.waitFor({ timeout: 15_000 }).catch(() => {});
    if (!(await p.locator(".ec-bd").count()) && (await open.count())) await tapOrClick(open, touch);
    const e = p.locator(".ec-bd").first(); await e.waitFor({ timeout: 15_000 });
    await tapOrClick(e.getByRole("button", { name: "OPEN BREAKDOWN" }), touch); await tapOrClick(e.getByRole("button", { name: "TEAM COMPARISON" }), touch);
    const m = await p.evaluate(() => {
      const root = document.querySelector(".ec-bd");
      const ctrls = [...root.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0);
      const small = ctrls.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim());
      const overflowPage = Math.max(0, document.documentElement.scrollWidth - innerWidth);
      const overflowInner = [...root.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "hidden" && getComputedStyle(el).overflowX !== "auto").map((el) => el.className).slice(0, 5);
      const r = root.getBoundingClientRect();
      const hdr = document.querySelector(".ec-arena-header, .ec-mobile-header, header");
      const hdrH = hdr ? hdr.getBoundingClientRect().height : 0;
      return { controls: ctrls.length, small, overflowPage, overflowInner, width: Math.round(r.width), headerHeight: Math.round(hdrH), anim: getComputedStyle(root).animationName };
    });
    await e.screenshot({ path: `${SHOTS}/breakdown-${w}x${h}.png` });
    ok(`${w}×${h}: no horizontal overflow, controls ≥ 44px, fits the column`, m.overflowPage === 0 && m.small.length === 0 && m.overflowInner.length === 0 && m.width <= w, JSON.stringify(m).slice(0, 200));
    rows.push({ viewport: `${w}x${h}`, ...m });
    await ctx.close();
  }
  // keyboard + reduced motion + 200% text zoom at a phone width and at desktop
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" }); const p = await ctx.newPage();
    await p.addInitScript((pr) => { try { localStorage.setItem("ec_seen", "1"); localStorage.setItem("ec_prior_result", pr); localStorage.removeItem("ec_chaos_run"); } catch (e) {} }, prior);
    await p.goto(`${BASE}/play/chaos`, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".ec-ta-stage", { timeout: 60_000 });
    const open = p.locator(".ec-ta-lastclash").first();
    await open.waitFor({ timeout: 15_000 }).catch(() => {});
    if (!(await p.locator(".ec-bd").count()) && (await open.count())) await open.click();
    const btn = p.locator(".ec-bd").first().getByRole("button", { name: "OPEN BREAKDOWN" }); await btn.waitFor({ timeout: 15_000 });
    await btn.focus(); await p.keyboard.press("Enter");
    const expanded = await p.locator(".ec-bd").first().getAttribute("data-open");
    await p.keyboard.press("Tab"); const next = await p.evaluate(() => document.activeElement?.textContent?.trim());
    await p.keyboard.press("Enter"); const cmpOpen = await p.locator(".ec-bd-cmp").count();
    const focusRing = await p.evaluate(() => { const b = document.querySelector(".ec-bd-btn"); b.focus(); const s = getComputedStyle(b); return s.outlineStyle !== "none" || s.boxShadow !== "none"; });
    await p.evaluate(() => { document.documentElement.style.fontSize = "200%"; document.body.style.zoom = "1"; });
    await p.addStyleTag({ content: ".ec-bd, .ec-bd * { font-size: 200% !important; }" });
    const zoom = await p.evaluate(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), clipped: [...document.querySelectorAll(".ec-bd-diff-values, .ec-bd-perf-name, .ec-bd-cmp-row")].some((el) => el.scrollWidth > el.clientWidth + 2) }));
    await p.locator(".ec-bd").first().screenshot({ path: `${SHOTS}/breakdown-${w}-text-200.png` });
    ok(`${w}px keyboard: Enter opens, Tab reaches TEAM COMPARISON, Enter opens it; focus ring visible; reduced motion adds no animation`, expanded === "true" && /TEAM COMPARISON/.test(next || "") && cmpOpen === 1 && focusRing && (await p.evaluate(() => getComputedStyle(document.querySelector(".ec-bd")).animationName)) === "none", `${expanded} · ${next} · ${cmpOpen}`);
    ok(`${w}px at 200% text: no horizontal page overflow, no clipped rows`, zoom.overflow === 0 && !zoom.clipped, JSON.stringify(zoom));
    await ctx.close();
  }
  write("responsive-qa", { viewports: rows, resultId: game.resultId, emulation: "Chromium device emulation (Playwright) — not a physical iPhone" });
}
// ── screens: owner review set (live result + full report), phone and desktop ─
if (MODE === "screens") {
  mkdirSync(SHOTS, { recursive: true });
  const sets = [["phone", 390, 844, true], ["desktop", 1280, 900, false]];
  const audit = {};
  for (const [label, w, h, touch] of sets) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 }); await gate(ctx);
    const page = await ctx.newPage(); await fresh(page);
    const { game } = await play(page, { touch });
    const bd = buildBreakdown(game.result); audit[label] = { resultId: game.resultId, source: { finalScore: game.result.core.finalScore, periodScores: game.result.v3.periodScores || null, teamTotals: game.result.v3.teamTotals, fullBox: game.result.v3.fullBox }, breakdown: bd };
    const shot = async (loc, name) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await page.screenshot({ path: `${SHOTS}/${label}-${name}.png`, fullPage: true, clip: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y + (await page.evaluate(() => scrollY)) - 8), width: Math.min(w, b.width + 16), height: b.height + 16 } }); };
    // final result + entry: the viewport as the player sees it right after the game
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/${label}-01-final-result.png` });
    const e = page.locator(".ec-bd").first(); await e.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -120));
    await page.screenshot({ path: `${SHOTS}/${label}-02-breakdown-entry.png` });
    await tapOrClick(e.getByRole("button", { name: "OPEN BREAKDOWN" }), touch);
    await shot(e.locator('[data-block="differences"]'), "03-differences");
    await tapOrClick(e.getByRole("button", { name: "TEAM COMPARISON" }), touch);
    await shot(e.locator('[data-block="comparison"]'), "04-team-comparison");
    await shot(e.locator('[data-block="performances"]'), "05-key-performances");
    if (await e.locator('[data-block="flow"]').count()) await shot(e.locator('[data-block="flow"]'), "06-game-flow");
    // the full report surface (broader editorial layout on desktop)
    const full = page.getByRole("button", { name: /VIEW FULL REPORT/ }).first();
    if (await full.count()) {
      await tapOrClick(full, touch);
      const r = page.locator('.ec-bd[data-surface="report"]').first(); await r.waitFor({ timeout: 15_000 });
      await tapOrClick(r.getByRole("button", { name: "OPEN BREAKDOWN" }), touch); await tapOrClick(r.getByRole("button", { name: "TEAM COMPARISON" }), touch);
      await page.waitForTimeout(200);
      const inner = page.locator(".ec-report-overlay").first();
      const pos = await page.evaluate(() => { const s = document.querySelector(".ec-report-overlay"); const hero = s?.querySelector(".ec-report-overlay .rise"); const b = s?.querySelector('.ec-bd[data-surface="report"]'); return hero && b ? { heroTop: hero.getBoundingClientRect().top, bdTop: b.getBoundingClientRect().top } : null; });
      ok(`${label}: in the full report the score hero precedes the breakdown`, pos && pos.heroTop < pos.bdTop, JSON.stringify(pos));
      // the report is a scrolling overlay: give the viewport the breakdown's full height for one uncropped shot
      const rh = Math.ceil((await r.boundingBox()).height);
      await page.setViewportSize({ width: w, height: Math.min(4000, rh + 300) }); await r.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
      await r.screenshot({ path: `${SHOTS}/${label}-07-full-report-breakdown.png` });
      await page.setViewportSize({ width: w, height: h });
      void inner;
    }
    ok(`${label}: owner review screenshots captured`, true, game.resultId);
    await ctx.close();
  }
  writeFileSync(`${OUT}/owner-review-audit.json`, JSON.stringify({ note: "The authoritative result behind each screenshot set (reduced to the fields the breakdown may read) and the breakdown projection generated from it. Every number in the screenshots appears here.", ...audit }, null, 2) + "\n");
  write("screens-qa");
}
await browser.close();
