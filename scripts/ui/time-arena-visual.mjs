#!/usr/bin/env node
// ── Visual QA: state screenshots, responsive screenshots, overlay and diff ────
// Everything here is produced with Playwright alone — no image dependency was
// added. The overlay and the difference heatmap are composited IN A PAGE
// (CSS opacity for the 50/50, mix-blend-mode: difference for the heatmap) and
// screenshotted, which is exact for our purpose and costs nothing to install.
//
// The canonical reference must exist on disk before the overlay and heatmap can
// be produced. If it does not, this script says so and skips ONLY those two
// artifacts rather than inventing a comparison:
//
//   docs/ui/references/time-arena-canonical.png
//
//   node scripts/ui/time-arena-visual.mjs [baseUrl]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "http://localhost:4176").replace(/\/$/, "");
const FIXTURE = "/dev/time-arena-reference";
const OUT = "data/validation/8c1";
const SHOTS = `${OUT}/screens`;
const REFERENCE = "docs/ui/references/time-arena-canonical.png";
const contract = JSON.parse(readFileSync(`${OUT}/time-arena-visual-contract.json`, "utf8"));
const { width: VW, height: VH } = contract.canonicalViewport;

const VIEWPORTS = [
  [1536, 1024], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812],
];

const notes = [];
const log = (m) => { notes.push(m); console.log(m); };

/** Composite two images in a page and screenshot the result. */
const compose = async (page, aPath, bPath, mode, outPath) => {
  const a = `data:image/png;base64,${readFileSync(aPath).toString("base64")}`;
  const b = `data:image/png;base64,${readFileSync(bPath).toString("base64")}`;
  const blend = mode === "diff"
    ? "mix-blend-mode: difference; filter: invert(0) brightness(2.2) saturate(2);"
    : "opacity: 0.5;";
  await page.setViewportSize({ width: VW, height: VH });
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;background:#000;width:${VW}px;height:${VH}px;overflow:hidden}
    .l{position:absolute;inset:0;width:${VW}px;height:${VH}px;background-size:${VW}px ${VH}px;background-repeat:no-repeat}
  </style>
  <div class="l" style="background-image:url('${a}')"></div>
  <div class="l" style="background-image:url('${b}');${blend}"></div>`);
  await page.screenshot({ path: outPath });
};

const run = async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });

  // ── 1. The canonical implementation screenshot ─────────────────────────────
  await page.goto(`${BASE}${FIXTURE}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".ec-ta-roster .ec-pc");
  await page.screenshot({ path: `${SHOTS}/implementation.png` });
  log(`captured ${SHOTS}/implementation.png at ${VW}x${VH}`);

  // ── 2. Responsive interpretations ─────────────────────────────────────────
  const responsive = [];
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}${FIXTURE}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".ec-ta-roster");
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".ec-ta-roster .ec-pc, .ec-ta-roster .ec-pc-empty")];
      // Held cards lift 3px deliberately, so a row is a cluster of tops within
      // a few pixels rather than one identical value.
      const sortedTops = cards.map((c) => c.getBoundingClientRect().y).sort((a, b) => a - b);
      const rows = sortedTops.reduce((acc, y) => {
        if (!acc.length || y - acc[acc.length - 1] > 8) acc.push(y);
        return acc;
      }, []);
      const tops = new Set(rows);
      const rail = document.querySelector(".ec-ta-rail");
      const unreachable = [...document.querySelectorAll(".ec-ta *")].filter((e) => {
        if (e.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) return false;
        let p = e;
        while (p && p !== document.body) {
          if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
          p = p.parentElement;
        }
        return true;
      }).length;
      return {
        columns: getComputedStyle(document.querySelector(".ec-ta")).gridTemplateColumns.split(" ").length,
        rosterRows: tops.size,
        cardWidth: Math.round(cards[0]?.getBoundingClientRect().width || 0),
        railSticky: getComputedStyle(rail).position,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        taps: Math.min(...[...document.querySelectorAll(".ec-pc-action, .ec-coach-action")]
          .map((b) => Math.round(b.getBoundingClientRect().height)).concat([999])),
        unreachable,
      };
    });
    await page.screenshot({ path: `${SHOTS}/responsive-${w}x${h}.png` });
    responsive.push({ viewport: `${w}x${h}`, ...m });
    log(`  ${w}x${h}: ${m.rosterRows} roster row(s), card ${m.cardWidth}px, overflow ${m.horizontalOverflow}px, min tap ${m.taps}px`);
  }

  // ── 3. Overlay and difference heatmap, if the reference is on disk ─────────
  let reference = null;
  if (existsSync(REFERENCE)) {
    const bytes = readFileSync(REFERENCE);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const dims = await page.evaluate(async (src) => await new Promise((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res(null);
      i.src = src;
    }), `data:image/png;base64,${bytes.toString("base64")}`);
    writeFileSync(`${SHOTS}/canonical-reference.png`, bytes);
    await compose(page, `${SHOTS}/canonical-reference.png`, `${SHOTS}/implementation.png`, "overlay", `${SHOTS}/overlay-50.png`);
    await compose(page, `${SHOTS}/canonical-reference.png`, `${SHOTS}/implementation.png`, "diff", `${SHOTS}/diff-heatmap.png`);
    reference = { path: REFERENCE, sha256, bytes: bytes.length, dimensions: dims };
    log(`overlay and heatmap written; reference sha256 ${sha256.slice(0, 16)}…`);
    writeFileSync(`${OUT}/reference-manifest.json`, JSON.stringify({
      artifact: "reference-manifest", phase: "8C.1 — pixel-fidelity reconstruction",
      canonicalReference: reference, storedAt: REFERENCE,
      note: "Stored verbatim: not optimised, cropped, recoloured or overwritten.",
    }, null, 2) + "\n");
  } else {
    log(`SKIPPED overlay and heatmap: ${REFERENCE} is not on disk.`);
    log("  The reference arrives as conversation content, not as a file, so it cannot be hashed or diffed.");
    log("  Save it to that path and re-run; no comparison is invented in the meantime.");
  }

  writeFileSync(`${OUT}/time-arena-responsive-qa.json`, JSON.stringify({
    artifact: "time-arena-responsive-qa", phase: "8C.1 — pixel-fidelity reconstruction",
    target: `${BASE}${FIXTURE}`, results: responsive,
    expectations: contract.responsive,
    allWithoutUnreachableOverflow: responsive.every((r) => r.unreachable === 0 && r.horizontalOverflow === 0),
    tenCardRowAtCanonical: responsive[0]?.rosterRows === 1,
    minTouchTargetAcrossViewports: Math.min(...responsive.map((r) => r.taps)),
  }, null, 2) + "\n");

  writeFileSync(`${OUT}/time-arena-visual-summary.json`, JSON.stringify({
    artifact: "time-arena-visual-summary", phase: "8C.1 — pixel-fidelity reconstruction",
    methodology: {
      capture: "Playwright, deviceScaleFactor 1, canonical viewport 1536x1024, the real components via the dev-only fixture",
      overlay: "reference and implementation composited in a page at 50% opacity, then screenshotted",
      heatmap: "mix-blend-mode: difference with a brightness boost, then screenshotted",
      maskedFromJudgement: [
        "player portrait pixels (no approved art exists yet)",
        "coach portrait pixels (same)",
        "dynamic player and coach names",
        "dynamic score, MVP and result text",
      ],
      graded: ["background", "panels", "card frames", "card positions", "borders", "header", "right rail", "CTA", "coach section", "spacing"],
      declaredBefore: "any overlay was generated",
    },
    reference, screens: `${SHOTS}/`, notes,
  }, null, 2) + "\n");

  await browser.close();
  console.log(`\nvisual QA written to ${OUT}/`);
};

run().catch((e) => { console.error(e); process.exit(1); });
