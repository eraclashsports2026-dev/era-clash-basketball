#!/usr/bin/env node
// ── Measured DOM contract for the Time Arena ──────────────────────────────────
// Opens the development-only canonical fixture at 1536 × 1024, measures the real
// bounding boxes, and grades them against the FROZEN hand-authored contract in
// data/validation/8c1/time-arena-visual-contract.json.
//
// The targets are NOT derived from the implementation: this script reads them,
// it never writes them. If a measurement is out of tolerance the run fails, and
// the only honest way to pass is to change the geometry.
//
//   node scripts/ui/measure-time-arena.mjs [baseUrl]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4176").replace(/\/$/, "");
const ROUTE = "/dev/time-arena-reference";
const OUT = "data/validation/8c1";
const contract = JSON.parse(readFileSync(`${OUT}/time-arena-visual-contract.json`, "utf8"));
const { width: VW, height: VH } = contract.canonicalViewport;
const T = contract.targets;

const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass, detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const within = (name, actual, target, tol, unit = "px") => {
  const delta = Math.abs(actual - target);
  ok(`${name}`, delta <= tol, `${actual}${unit} vs ${target}${unit} (±${tol}, off by ${+delta.toFixed(1)})`);
  return delta;
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".ec-ta-roster .ec-pc", { timeout: 20_000 });

  const g = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        top: Math.round(r.top + window.scrollY), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const boxes = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { slot: el.dataset.slot || el.dataset.role || null, team: el.dataset.team || null,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const teamOf = (el) => (el.dataset.team || el.closest("[data-team]")?.dataset.team || null);
    const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc, .ec-ta-roster .ec-pc-empty")].map((el) => {
      const r = el.getBoundingClientRect();
      return { slot: el.dataset.slot, team: teamOf(el),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const portrait = document.querySelector(".ec-pc-portrait");
    const firstCard = document.querySelector(".ec-ta-roster .ec-pc");
    return {
      viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      header: box("header") || box(".ec-arena-shell > header") || box("[role=banner]"),
      arena: box(".ec-ta-main"),
      rail: box(".ec-ta-rail"),
      stage: box(".ec-ta-stage"),
      chaosHeading: box(".ec-ta-title-main"),
      rollProgression: box(".ec-ta-stepper"),
      goldLabel: box(".ec-ta-team-label"),
      blueLabel: box(".ec-ta-team-label--blue"),
      roster: box(".ec-ta-roster"),
      divider: box(".ec-ta-roster-divider"),
      cards,
      portraitZone: portrait ? { h: Math.round(portrait.getBoundingClientRect().height) } : null,
      cardHeight: firstCard ? Math.round(firstCard.getBoundingClientRect().height) : null,
      coachHeading: box(".ec-ta-coach-title"),
      coachCards: boxes(".ec-coach-card"),
      cta: box(".ec-ta-cta"),
      utility: box(".ec-ta-utility"),
      intel: box(".ec-intel"),
      resultDock: box(".ec-ta-rail > div:last-of-type"),
      atmosphere: (() => {
        const a = document.querySelector(".ec-ta-atmos");
        if (!a) return null;
        const cs = getComputedStyle(a, "::before");
        const after = getComputedStyle(a, "::after");
        return {
          present: true,
          court: /url\(/.test(cs.backgroundImage) ? "svg" : cs.backgroundImage.slice(0, 40),
          lighting: (after.backgroundImage.match(/radial-gradient/g) || []).length,
          crowd: /url\(/.test(getComputedStyle(document.querySelector(".ec-ta-crowd")).backgroundImage),
          grain: /url\(/.test(getComputedStyle(document.querySelector(".ec-ta-grain")).backgroundImage),
        };
      })(),
      figureMask: (() => {
        const f = document.querySelector(".ec-pc-figure");
        if (!f) return null;
        const cs = getComputedStyle(f);
        return {
          maskImage: (cs.maskImage || cs.webkitMaskImage || "none").slice(0, 60),
          height: Math.round(f.getBoundingClientRect().height),
        };
      })(),
    };
  });

  // ── Grade against the frozen contract ───────────────────────────────────
  ok("the canonical viewport rendered", g.viewport.w === VW && g.viewport.h === VH, `${g.viewport.w}x${g.viewport.h}`);
  within("header height", g.header?.h ?? -1, T.header.height, T.header.tolerance);
  within("right-rail width", g.rail?.w ?? -1, T.rail.width, T.rail.tolerance);
  within("main-arena width", g.arena?.w ?? -1, T.mainArena.width, T.mainArena.tolerance);
  within("main-to-rail gap", (g.rail?.x ?? 0) - (g.arena?.right ?? 0), T.mainToRailGap.value, T.mainToRailGap.tolerance);

  const players = g.cards;
  ok("ten player cards are present", players.length === 10, `${players.length}`);
  const order = players.map((c) => `${c.team}:${c.slot}`);
  ok("the card order matches the reference", JSON.stringify(order) === JSON.stringify(contract.composition.cardOrder), order.join(" "));
  // Held cards lift 3px on purpose (a state signal that is not a colour), so a
  // single row is a tight CLUSTER of tops rather than one identical value.
  const spread = Math.max(...players.map((c) => c.y)) - Math.min(...players.map((c) => c.y));
  ok("both teams share ONE roster row", spread <= 4, `top spread ${spread}px (held cards lift 3px)`);
  const widths = players.map((c) => c.w), heights = players.map((c) => c.h);
  within("player-card width", Math.round(widths.reduce((a, b) => a + b, 0) / widths.length), T.playerCard.width, T.playerCard.widthTolerance);
  within("player-card height", Math.round(heights.reduce((a, b) => a + b, 0) / heights.length), T.playerCard.height, T.playerCard.heightTolerance);
  ok("every card is the same size", Math.max(...widths) - Math.min(...widths) <= 1 && Math.max(...heights) - Math.min(...heights) <= 1);
  const intraGap = players[1].x - (players[0].x + players[0].w);
  within("player-card gap", intraGap, T.playerCardGap.value, T.playerCardGap.tolerance);
  const centreGap = players[5].x - (players[4].x + players[4].w);
  within("centre divider gap", centreGap, T.centreDividerGap.value, T.centreDividerGap.tolerance);
  const ratio = (g.portraitZone?.h ?? 0) / (g.cardHeight || 1);
  ok("the portrait zone dominates the card",
    ratio >= T.portraitZoneRatio.min && ratio <= T.portraitZoneRatio.max, `${(ratio * 100).toFixed(1)}%`);

  ok("three coach cards", g.coachCards.length === 3, `${g.coachCards.length}`);
  within("coach-card width", g.coachCards[0]?.w ?? -1, T.coachCard.width, T.coachCard.widthTolerance);
  within("coach-card height", g.coachCards[0]?.h ?? -1, T.coachCard.height, T.coachCard.heightTolerance);
  ok("the coach cards share one row", new Set(g.coachCards.map((c) => c.y)).size === 1);

  within("final-roll CTA width", g.cta?.w ?? -1, T.finalRollCta.width, T.finalRollCta.widthTolerance);
  within("final-roll CTA height", g.cta?.h ?? -1, T.finalRollCta.height, T.finalRollCta.heightTolerance);
  within("utility-bar height", g.utility?.h ?? -1, T.utilityFooter.height, T.utilityFooter.tolerance);

  // First-viewport density: everything in the primary composition, no scroll.
  for (const [name, b] of [["coach chaos", g.coachHeading], ["final roll", g.cta], ["utility bar", g.utility],
    ["intel panel", g.intel], ["result dock", g.resultDock]]) {
    ok(`${name} is inside the first viewport`, !!b && b.bottom <= VH + 1, b ? `bottom ${b.bottom} ≤ ${VH}` : "missing");
  }
  ok("the document does not scroll past the ceiling", g.documentHeight <= T.documentHeight.max, `${g.documentHeight}px ≤ ${T.documentHeight.max}px`);
  ok("no page-level horizontal overflow", g.horizontalOverflow === 0, `${g.horizontalOverflow}px`);

  // Atmosphere and the portrait fallback are structural, not decorative.
  ok("the court layer is a local SVG", g.atmosphere?.court === "svg", g.atmosphere?.court);
  ok("both spotlights and the vignette are present", (g.atmosphere?.lighting ?? 0) >= 4, `${g.atmosphere?.lighting} radial layers`);
  ok("the crowd layer is present", g.atmosphere?.crowd === true);
  ok("the grain layer is present", g.atmosphere?.grain === true);
  ok("the portrait fallback fills the portrait zone",
    (g.figureMask?.height ?? 0) >= (g.portraitZone?.h ?? 0) - 2 && /url\(/.test(g.figureMask?.maskImage || ""),
    `${g.figureMask?.height}px, mask ${g.figureMask?.maskImage}`);

  const passed = checks.filter((c) => c.pass).length;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/time-arena-geometry.json`, JSON.stringify({
    artifact: "time-arena-geometry", phase: "8C.1 — pixel-fidelity reconstruction",
    target: `${BASE}${ROUTE}`, viewport: contract.canonicalViewport,
    gradedAgainst: "time-arena-visual-contract.json (frozen, hand-authored)",
    measured: g, checks: checks.length, passed, failed: checks.length - passed, results: checks,
  }, null, 2) + "\n");

  await browser.close();
  console.log(`\ngeometry: ${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
