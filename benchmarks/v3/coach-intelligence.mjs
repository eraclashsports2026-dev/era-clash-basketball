#!/usr/bin/env node
// ── EraClash Labs: Coach Intelligence benchmark ───────────────────────────────
// Runs the full coach pool against every canonical Team Intelligence lineup.
//
// The question this benchmark exists to answer is NOT "who is the best coach?"
// — it is "does coach fit actually respond to roster construction?". If one
// coach won everywhere, that would be evidence of a structurally biased fit
// model, not of a great coach.
//
//   node benchmarks/v3/coach-intelligence.mjs [--json]
import { COACHES } from "../../src/v3/coaches.js";
import { buildCoachFit, recommendCoaches, RECOMMENDATION_CATEGORIES, COACH_INTELLIGENCE_VERSION } from "../../src/v3/coachIntelligence.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { LINEUPS } from "./team-intelligence.mjs";

export const runCoachBenchmark = () => {
  const out = {};
  for (const [name, spec] of Object.entries(LINEUPS)) {
    const team = buildTeamIntelligence({ playerCards: spec.cards, positionAssignments: spec.slots });
    const fits = COACHES.map((c) => buildCoachFit({ coach: c, teamIntelligence: team }));
    out[name] = {
      team,
      recommendations: recommendCoaches(team),
      categoryLeaders: Object.fromEntries(RECOMMENDATION_CATEGORIES.map((cat) => {
        const best = fits.map((f) => ({ id: f.coachId, name: f.coachName, s: cat.pick(f) })).sort((a, b) => b.s - a.s)[0];
        return [cat.key, best];
      })),
      fits,
    };
  }
  return out;
};

const pad = (s, n) => String(s).padEnd(n);

const main = () => {
  const results = runCoachBenchmark();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { recommendations: v.recommendations, categoryLeaders: v.categoryLeaders }])), null, 2));
    return;
  }

  console.log(`\nCoach Intelligence benchmark — model v${COACH_INTELLIGENCE_VERSION}, pool ${COACHES.length}\n`);

  for (const [name, r] of Object.entries(results)) {
    console.log(`── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
    for (const rec of r.recommendations) {
      console.log(`   ${pad(rec.categoryLabel, 28)} ${pad(rec.coachName, 20)} ${pad(rec.band, 10)} conf ${rec.confidence}`);
      console.log(`      why: ${rec.why}`);
      if (rec.concern) console.log(`      concern: ${rec.concern}`);
    }
    console.log("");
  }

  // ── dominance analysis ──
  const appearances = {};
  for (const r of Object.values(results)) for (const rec of r.recommendations) appearances[rec.coachName] = (appearances[rec.coachName] || 0) + 1;
  const lineupCount = Object.keys(results).length;
  console.log("── recommendation spread ─────────────────────────────────────");
  Object.entries(appearances).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`   ${pad(n, 22)} ${c}/${lineupCount} lineups`));

  const categoryWins = {};
  for (const r of Object.values(results)) for (const [, best] of Object.entries(r.categoryLeaders)) categoryWins[best.name] = (categoryWins[best.name] || 0) + 1;
  const totalCategories = lineupCount * RECOMMENDATION_CATEGORIES.length;
  const top = Object.entries(categoryWins).sort((a, b) => b[1] - a[1])[0];
  console.log("\n── category dominance ───────────────────────────────────────");
  console.log(`   distinct category leaders: ${Object.keys(categoryWins).length}`);
  console.log(`   most dominant: ${top[0]} wins ${top[1]}/${totalCategories} categories (${Math.round((top[1] / totalCategories) * 100)}%)`);
  console.log(top[1] / totalCategories > 0.4
    ? "   ⚠ one coach leads a large share of categories — investigate the fit model for structural bias"
    : "   ✓ no universal winner — fit responds to construction\n");
};

if (import.meta.url === `file://${process.argv[1]}`) main();
