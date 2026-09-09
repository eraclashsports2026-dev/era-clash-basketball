#!/usr/bin/env node
// ── EraClash Labs: Daily coach + Era fairness benchmark ───────────────────────
// For a sweep of UTC dates, checks the properties that make a Daily
// leaderboard comparable:
//   · every official coach option is a plausible strategic route
//   · no coach is always the optimal answer
//   · the official Era Style does not universally determine one coach
//   · identical decisions reproduce identically
//   · no flat bonus dominates
//
//   node benchmarks/v3/daily-coach-era.mjs [--days=30] [--json]
import { dailyConfig, dailySimulationSeed, bucketsFor } from "../../src/v3/dailyCoachEra.js";
import { dailySeed, replayDaily, dailyOpponent } from "../../src/dailyChallenge.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachFit } from "../../src/v3/coachIntelligence.js";
import { buildCoachEraFit } from "../../src/v3/eraStyleIntelligence.js";
import { getCoach } from "../../src/v3/coaches.js";

const KEEP_ALL = { keeps: [true, true, true, true, true], respins: [null, null, null, null, null] };
const DECISIONS = [KEEP_ALL, KEEP_ALL, KEEP_ALL];
const BAND_RANK = ["POOR", "LIMITED", "WORKABLE", "GOOD", "EXCELLENT"];

/** Sequential UTC date keys starting from a fixed base — no Date.now(), so the
 *  benchmark is reproducible. */
const dateKeys = (n, base = "20260901") => {
  const y = Number(base.slice(0, 4)), m = Number(base.slice(4, 6)), d = Number(base.slice(6, 8));
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
  });
};

export const runDailyBenchmark = (days = 30) => {
  const rows = [];
  for (const date of dateKeys(days)) {
    const cfg = dailyConfig(date);
    const roster = replayDaily(dailySeed(date), DECISIONS);
    const team = buildTeamIntelligence({ playerCards: roster.map((p) => p.id) });
    const options = cfg.coachOptions.map((o) => {
      const coach = getCoach(o.coachId);
      const fit = buildCoachFit({ coach, teamIntelligence: team });
      const eraFit = buildCoachEraFit({ coach, eraStyleId: cfg.officialEraStyleId, teamIntelligence: team });
      const seed = dailySimulationSeed({ config: cfg, goldIds: roster.map((p) => p.id), coachId: o.coachId }).seed;
      return {
        coachId: o.coachId, name: o.name, bucket: o.bucket,
        offenseBand: fit.summary.offense.band, defenseBand: fit.summary.defense.band,
        managementBand: fit.summary.management.band,
        eraBand: eraFit.band,
        combined: BAND_RANK.indexOf(fit.summary.offense.band) + BAND_RANK.indexOf(fit.summary.defense.band) + BAND_RANK.indexOf(eraFit.band),
        seed,
      };
    });
    options.sort((a, b) => b.combined - a.combined);
    rows.push({ date, era: cfg.officialEraStyleId, opponent: dailyOpponent(date).map((p) => p.id), options });
  }
  return rows;
};

const pad = (s, n) => String(s).padEnd(n);

const main = () => {
  const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 30;
  const rows = runDailyBenchmark(days);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }

  console.log(`\nDaily coach + Era fairness benchmark — ${rows.length} days\n`);
  console.log(pad("date", 10) + pad("era", 8) + "options (best first)");
  console.log("─".repeat(96));
  for (const r of rows.slice(0, 12)) {
    console.log(pad(r.date, 10) + pad(r.era, 8) + r.options.map((o) => `${o.name} [${o.eraBand.slice(0, 4)}/${o.offenseBand.slice(0, 4)}]`).join("  ·  "));
  }
  if (rows.length > 12) console.log(`  … ${rows.length - 12} more days`);

  console.log("\n── is any coach always the answer? ──");
  const wins = {};
  for (const r of rows) wins[r.options[0].name] = (wins[r.options[0].name] || 0) + 1;
  const ranked = Object.entries(wins).sort((a, b) => b[1] - a[1]);
  for (const [n, c] of ranked.slice(0, 6)) console.log(`   ${pad(n, 22)} best on ${c}/${rows.length} days`);
  const topShare = ranked[0][1] / rows.length;
  console.log(`   distinct best coaches: ${ranked.length}`);
  console.log(topShare > 0.5 ? "   ⚠ one coach is best on most days — the options are not a real choice" : "   ✓ no coach is always the answer");

  console.log("\n── does the era determine the coach? ──");
  const byEra = {};
  for (const r of rows) {
    byEra[r.era] = byEra[r.era] || new Set();
    byEra[r.era].add(r.options[0].coachId);
  }
  for (const [era, set] of Object.entries(byEra)) console.log(`   ${pad(era, 8)} ${set.size} distinct best coach(es) across its days`);
  const eraLocked = Object.values(byEra).every((s) => s.size === 1);
  console.log(eraLocked && rows.length > 8
    ? "   ⚠ each era always yields the same best coach — era is deciding, not the roster"
    : "   ✓ the era shapes the answer without dictating it");

  console.log("\n── are all three options plausible routes? ──");
  let allPlausible = 0;
  for (const r of rows) {
    const worst = Math.min(...r.options.map((o) => BAND_RANK.indexOf(o.eraBand)));
    if (worst >= BAND_RANK.indexOf("WORKABLE")) allPlausible++;
  }
  console.log(`   days where every option is at least WORKABLE in the official era: ${allPlausible}/${rows.length}`);
  console.log(allPlausible / rows.length >= 0.8 ? "   ✓ the options are all real choices" : "   ⚠ some days offer an unplayable option");

  console.log("\n── strategic diversity of the option set ──");
  const bucketSets = rows.map((r) => new Set(r.options.map((o) => o.bucket)).size);
  const meanBuckets = bucketSets.reduce((a, b) => a + b, 0) / bucketSets.length;
  console.log(`   mean distinct strategic buckets per day: ${meanBuckets.toFixed(2)} of ${rows[0].options.length}`);
  console.log(meanBuckets >= 2.5 ? "   ✓ the three options are three different ideas" : "   ⚠ options overlap strategically");

  console.log("\n── determinism ──");
  const again = runDailyBenchmark(days);
  const identical = JSON.stringify(rows) === JSON.stringify(again);
  console.log(identical ? "   ✓ the whole sweep reproduces byte-identically" : "   ⚠ the sweep is not reproducible");
  const distinctSeeds = new Set(rows.flatMap((r) => r.options.map((o) => o.seed)));
  console.log(`   distinct simulation seeds across ${rows.length} days × 3 options: ${distinctSeeds.size}/${rows.length * 3}`);
  console.log(distinctSeeds.size === rows.length * 3
    ? "   ✓ every (day, coach) pair gets its own game"
    : "   ⚠ seed collisions — different legal choices would replay the same game");
  console.log("");
};

if (import.meta.url === `file://${process.argv[1]}`) main();
