#!/usr/bin/env node
// ── Write the two owner-facing brand documents from the measured artifacts ───
//   node scripts/ui/theme-docs.mjs
// docs/brand/basketball-theme-options.md   — the four candidates, with measured facts
// docs/brand/basketball-theme-owner-scorecard.md — objective fields filled, owner fields blank
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CANDIDATE_THEME_IDS, PRODUCTION_THEME_ID, getTheme } from "../../src/theme/themeResolver.js";
// Phase 9A.1 artifacts describe the FOUR candidates; the production hybrid has its own harness.
const THEME_IDS = CANDIDATE_THEME_IDS;

const OUT = "data/validation/9a1";
const json = (f) => (existsSync(`${OUT}/${f}`) ? JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")) : null);
const color = json("color-area-audit.json"), acc = json("theme-accessibility-and-fatigue.json"), comp = json("competitive-color-differentiation.json"), por = json("portrait-theme-compatibility.json"), perf = json("theme-performance-qa.json"), dom = json("theme-dom-invariant.json"), score = json("theme-decision-scorecard.json");
const base = process.env.PREVIEW_BASE || "<branch-preview>";
const pct = (v) => (v == null ? "—" : `${v}%`);

const optionBlock = (id) => {
  const t = getTheme(id), c = color?.summary?.find((s) => s.theme === id), a = acc?.perTheme?.[id], k = comp?.matrix?.find((r) => r.theme === id), p = por?.perTheme?.[id], pf = perf?.perTheme?.[id];
  const lf = acc?.longFormPostgame?.[id];
  const pairsTotal = a ? Object.values(a.fixtures).reduce((n, f) => n + f.textCount, 0) : null, pairsPass = a ? Object.values(a.fixtures).reduce((n, f) => n + f.passCount, 0) : null;
  return `## ${t.role} — ${t.label}

**Character:** ${t.character.join(" · ")}

| Layer | Family | Values |
|---|---|---|
| 60% dominant | ${t.families.dominant.name} | ${t.families.dominant.colors.join(", ")} |
| 30% secondary | ${t.families.secondary.name} | ${t.families.secondary.colors.slice(0, 5).join(", ")}${t.families.secondary.colors.length > 5 ? ", …" : ""} |
| 10% accent | ${t.families.accent.name} | ${t.families.accent.colors.join(", ")}${t.families.accent.split ? ` (gold ≈ ${t.families.accent.split.gold * 100}%, cobalt ≈ ${t.families.accent.split.cobalt * 100}%)` : ""} |
| semantic | Team Gold / Team Blue / Coach Violet / Success / Danger | ${t.semantic.teamGold} / ${t.semantic.teamBlue} / ${t.semantic.coachViolet} / ${t.semantic.success} / ${t.semantic.danger} |

**Measured (1536×1024 averages across the six fixtures):** dominant ${pct(c?.dominantPct)} · secondary ${pct(c?.secondaryPct)} · decorative accent ${pct(c?.decorativeAccentPct)}${c?.flags?.length ? ` · flags: ${c.flags.join(", ")}` : " · no colour flags"}.

**Contrast:** ${pairsPass ?? "—"}/${pairsTotal ?? "—"} visible text pairs pass WCAG AA across the six fixtures at desktop and phone; every named token pair ${a?.namedPairsAllPassAA ? "passes" : "does NOT all pass"} AA. Long-form Postgame: average ${lf?.avgContrast ?? "—"}:1, lowest passing ${lf?.lowestPassing ?? "—"}:1, ${lf?.paragraphs?.count ?? "—"} paragraphs, line-height ${lf?.paragraphs?.avgLineHeight ?? "—"}, minimum ${lf?.paragraphs?.minFontPx ?? "—"}px.

**Fatigue risk (thresholded, not a preference):** ${a?.fatigue?.risk ?? "—"} — ${a ? Object.entries(a.fatigue.factors).map(([k, v]) => `${k} ${v}`).join(", ") : "—"}.

**Competitive differentiation:** ${k?.classification ?? "—"}${k?.risks?.length ? ` — ${k.risks.join("; ")}` : ""}.

**Portrait compatibility:** silhouette-to-frame ${p?.silhouetteContrastToFrame ?? "—"}:1; uniform swatches with blend risk: ${p ? Object.values(p.uniformSwatches).filter((r) => r.blendRisk).length : "—"} of 5.

**Rendering:** first paint ${pf?.fcpMs ?? "—"}ms · LCP ${pf?.lcpMs ?? "—"}ms · CLS ${pf?.cls ?? "—"} · theme switch ≤ ${pf ? Math.max(...pf.themeSwitchMs) : "—"}ms.

**Preview:** \`${base}/dev/basketball-theme-lab?theme=${id}\`
`;
};

const options = `# EraClash Basketball — theme options

**Status:** THEME LAB COMPLETE — AWAITING OWNER PALETTE SELECTION. No option is
selected here. The four candidates share one DOM, one layout, one set of
deterministic fixtures and one measurement harness; the numbers below are what
the harness measured on the theme-lab build. Screens:
\`data/validation/9a1/screens/<theme>/\`; contact sheets:
\`data/validation/9a1/screens/comparisons/\`; comparison index:
\`data/validation/9a1/theme-comparison-index.html\`.

DOM invariant across themes: ${dom ? `${dom.passed}/${dom.checks} checks (±2px primary regions, ±3px text)` : "—"}.
Master brand shared by all four: obsidian, platinum, graphite, Fracture Gold,
Fracture Cobalt; a controlled diagonal Era Fracture; EraClash Logo Mk1.

${THEME_IDS.map(optionBlock).join("\n")}
## How to decide

Open the comparison index or the four preview links, look at the same fixture
in each theme at 1536×1024, 1440×900 and 390×844, and read the long-form
Postgame in each. Then reply in the decision format:

\`\`\`
SELECT:
Fracture Core
Night Court Editorial
Modern Court Light
Hardwood Luxe
or Hybrid: [precise combination]
\`\`\`
`;
writeFileSync("docs/brand/basketball-theme-options.md", options);

const rows = score?.rows || [];
const scorecard = `# EraClash Basketball — theme owner scorecard

**Decision:** ${score?.decision ?? "AWAITING OWNER PALETTE SELECTION"}.
Objective fields are filled from the measured artifacts. **Owner-judgment fields
are blank on purpose** — they are yours, not the harness's.

## Objective

| Field | ${rows.map((r) => r.label).join(" | ")} |
|---|${rows.map(() => "---").join("|")}|
| WCAG AA pass rate (text pairs) | ${rows.map((r) => (r.objective.wcagPassRate == null ? "—" : `${(r.objective.wcagPassRate * 100).toFixed(1)}%`)).join(" | ")} |
| Geometry drift vs control (px) | ${rows.map((r) => r.objective.geometryDriftPx ?? "—").join(" | ")} |
| Dominant / secondary / accent | ${rows.map((r) => (r.objective.colorArea ? `${r.objective.colorArea.dominant} / ${r.objective.colorArea.secondary} / ${r.objective.colorArea.accent}` : "—")).join(" | ")} |
| 60–30–10 within targets | ${rows.map((r) => (r.objective.colorAreaCompliance ? Object.entries(r.objective.colorAreaCompliance).filter(([, v]) => v).map(([k]) => k).join(",") || "none" : "—")).join(" | ")} |
| Accent-overuse flags | ${rows.map((r) => (r.objective.accentOveruseFlags?.length ? r.objective.accentOveruseFlags.join(",") : "none")).join(" | ")} |
| Long-form contrast (avg / lowest passing) | ${rows.map((r) => (r.objective.longFormContrast ? `${r.objective.longFormContrast.avgContrast} / ${r.objective.longFormContrast.lowestPassing}` : "—")).join(" | ")} |
| Mobile contrast (390px, pass/of) | ${rows.map((r) => (r.objective.mobileContrast ? Object.values(r.objective.mobileContrast).map((m) => `${m.pass}/${m.of}`).join(" ") : "—")).join(" | ")} |
| Portrait compatibility (blend risks / silhouette) | ${rows.map((r) => (r.objective.portraitCompatibility ? `${r.objective.portraitCompatibility.uniformBlendRisks} / ${r.objective.portraitCompatibility.silhouetteContrast}:1` : "—")).join(" | ")} |
| Competitor differentiation | ${rows.map((r) => r.objective.competitorDifferentiation ?? "—").join(" | ")} |
| Asset weight (shared theme CSS) | ${rows.map((r) => (r.objective.assetWeight ? `${(r.objective.assetWeight.themeCssBytesShared / 1024).toFixed(1)} KB` : "—")).join(" | ")} |
| Rendering (FCP / LCP / CLS) | ${rows.map((r) => (r.objective.renderingPerformance ? `${r.objective.renderingPerformance.fcpMs} / ${r.objective.renderingPerformance.lcpMs} / ${r.objective.renderingPerformance.cls}` : "—")).join(" | ")} |
| Fatigue risk (thresholded) | ${rows.map((r) => r.objective.fatigueRisk ?? "—").join(" | ")} |

## Owner judgment — leave your marks here

| Field | Fracture Core | Night Court Editorial | Modern Court Light | Hardwood Luxe |
|---|---|---|---|---|
| Most premium | | | | |
| Most distinct | | | | |
| Most "EraClash" | | | | |
| Best Basketball identity | | | | |
| Most comfortable for long use | | | | |
| Best player portrait presentation | | | | |
| Best future multisport fit | | | | |

## Decision format

\`\`\`
SELECT:
Fracture Core
Night Court Editorial
Modern Court Light
Hardwood Luxe
or Hybrid: [precise combination]
\`\`\`
`;
writeFileSync("docs/brand/basketball-theme-owner-scorecard.md", scorecard);
console.log("wrote docs/brand/basketball-theme-options.md and docs/brand/basketball-theme-owner-scorecard.md");
