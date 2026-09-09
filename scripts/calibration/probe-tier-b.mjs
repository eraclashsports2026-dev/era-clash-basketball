#!/usr/bin/env node
// ── Tier B derivability probe ───────────────────────────────────────────────
// Asks one question of every corpus team-season article: does the authorized
// source actually publish the RAW TOTALS that the Tier B formulas consume?
//
// This has to be answered before any Tier B target is written, because the
// alternative to knowing is guessing, and a rating derived from a guessed
// possession count is a guess wearing a formula.
//
// Tier B inputs, by metric:
//   pace, ORtg, DRtg, netRtg   need team FGA, FTA, TOV, ORB (+ opponent) and games
//   eFG%                       needs FGM, 3PM, FGA
//   TS%                        needs PTS, FGA, FTA
//   TOV%                       needs TOV and possessions
//   ORB% / DRB%                need ORB, DRB and opponent DRB, ORB
//   FTr                        needs FTA, FGA
//   3PAr                       needs 3PA, FGA
//   assistRate                 needs AST, FGM
//
//   npm run calibration:probe-tier-b
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchArticle } from "./adapters/wikipedia.mjs";
import { loadCorpusV3 } from "./build-corpus-v3.mjs";

const OUT = ".cache/calibration";

/** The raw counting totals every Tier B formula ultimately needs. */
const REQUIRED_TOTALS = ["FGM", "FGA", "3PM", "3PA", "FTM", "FTA", "ORB", "DRB", "TRB", "AST", "TOV", "PTS"];

const stripTags = (x) => x.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");

const analyseArticle = (html) => {
  const tables = html.split(/<table/i).slice(1);
  const found = { totalsRow: false, opponentTable: false, columns: new Set(), teamTotalsTable: false };

  for (const t of tables) {
    const cells = [...t.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]).trim());
    const headerish = cells.slice(0, 24).map((c) => c.toUpperCase());
    // A totals row is the tell: it means team-level counting stats exist.
    if (cells.some((c) => /^(team\s+)?totals?$/i.test(c))) found.totalsRow = true;
    if (cells.some((c) => /^opponents?$/i.test(c))) found.opponentTable = true;
    for (const h of headerish) {
      // Count columns only — a percentage is not a total and cannot be summed.
      if (/^(FGM|FGA|3PM|3PA|3P|FTM|FTA|ORB|DRB|TRB|REB|AST|TOV|TO|STL|BLK|PTS|MP|MIN)$/.test(h)) found.columns.add(h);
    }
    if (found.totalsRow && found.columns.size >= 6) found.teamTotalsTable = true;
  }
  const plain = stripTags(html);
  found.mentionsTurnovers = /turnover/i.test(plain);
  found.mentionsOffensiveRebounds = /offensive rebound/i.test(plain);
  found.columns = [...found.columns];
  return found;
};

const derivable = (f) => {
  const has = (c) => f.columns.includes(c);
  return {
    // Only true when EVERY input the formula consumes is actually published.
    efgPct: has("FGM") && has("FGA") && (has("3PM") || has("3P")),
    tsPct: has("PTS") && has("FGA") && has("FTA"),
    ftr: has("FTA") && has("FGA"),
    threePar: has("3PA") && has("FGA"),
    assistRate: has("AST") && has("FGM"),
    tovPct: has("TOV") || has("TO"),
    orbPct: has("ORB") && f.opponentTable,
    drbPct: has("DRB") && f.opponentTable,
    pace: has("FGA") && has("FTA") && (has("TOV") || has("TO")) && has("ORB"),
    offensiveRating: has("PTS") && has("FGA") && has("FTA") && (has("TOV") || has("TO")) && has("ORB"),
    defensiveRating: f.opponentTable && has("PTS") && has("FGA"),
    netRating: f.opponentTable && has("PTS") && has("FGA"),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const corpus = loadCorpusV3();
  if (!corpus) throw new Error("corpus v3 not built");

  const rows = [];
  for (const fx of corpus.fixtures) {
    let res;
    try {
      const r = await fetchArticle(fx.teamArticle);
      const html = String(r.html ?? r.text ?? r);
      const f = analyseArticle(html);
      res = { fixtureId: fx.fixtureId, era: fx.eraStyleId, article: fx.teamArticle,
        ok: true, ...f, derivable: derivable(f) };
    } catch (e) {
      res = { fixtureId: fx.fixtureId, era: fx.eraStyleId, article: fx.teamArticle,
        ok: false, error: String(e.message).slice(0, 120) };
    }
    rows.push(res);
    process.stdout.write(`\r  probed ${rows.length}/${corpus.fixtures.length}`);
  }

  console.log(`\n\nTIER B DERIVABILITY PROBE — ${rows.length} authorized team-season articles\n`);
  const okRows = rows.filter((r) => r.ok);
  console.log(`  fetched successfully      ${okRows.length}/${rows.length}`);
  console.log(`  with a team totals row    ${okRows.filter((r) => r.totalsRow).length}`);
  console.log(`  with an opponent table    ${okRows.filter((r) => r.opponentTable).length}`);
  console.log(`  mentioning turnovers      ${okRows.filter((r) => r.mentionsTurnovers).length}`);
  console.log(`  mentioning off. rebounds  ${okRows.filter((r) => r.mentionsOffensiveRebounds).length}`);

  const cols = {};
  for (const r of okRows) for (const c of r.columns) cols[c] = (cols[c] ?? 0) + 1;
  console.log(`\n  count columns published anywhere in the article:`);
  const entries = Object.entries(cols).sort((a, b) => b[1] - a[1]);
  if (!entries.length) console.log(`    (none)`);
  for (const [c, n] of entries) console.log(`    ${c.padEnd(6)} ${n}/${okRows.length}`);
  console.log(`\n  required totals absent everywhere: ${REQUIRED_TOTALS.filter((c) => !cols[c]).join(", ") || "(none)"}`);

  console.log(`\n  metrics derivable from this source, by fixture count:`);
  const metrics = Object.keys(derivable({ columns: [], opponentTable: false }));
  for (const m of metrics) {
    const n = okRows.filter((r) => r.derivable?.[m]).length;
    console.log(`    ${m.padEnd(18)} ${String(n).padStart(3)}/${okRows.length}${n === 0 ? "   NOT DERIVABLE" : ""}`);
  }

  const byEra = {};
  for (const r of okRows) {
    byEra[r.era] = byEra[r.era] ?? { n: 0, totals: 0 };
    byEra[r.era].n++; if (r.totalsRow) byEra[r.era].totals++;
  }
  console.log(`\n  by era (articles with a totals row):`);
  for (const [e, v] of Object.entries(byEra).sort()) console.log(`    ${e}  ${v.totals}/${v.n}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/tier-b-derivability-probe.json`, JSON.stringify({
    purpose: "Whether the authorized source publishes the raw totals the Tier B formulas consume.",
    publisher: "Wikipedia (Wikimedia Foundation), CC BY-SA 4.0",
    requiredTotals: REQUIRED_TOTALS, articles: rows,
  }, null, 2) + "\n");
  console.log(`\nwrote ${OUT}/tier-b-derivability-probe.json`);
}
