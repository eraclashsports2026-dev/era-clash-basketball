#!/usr/bin/env node
// ── Era research runner ───────────────────────────────────────────────────────
//   npm run research:eras
//   npm run research:refresh-era -- --era=1990s
import { ensureCacheDirs, verificationReport, parseArgs, retrieveSource, recordFacts } from "./lib.mjs";

// ── Era source manifest ───────────────────────────────────────────────────────
// Two source classes per era, kept separate because they answer different
// questions and carry different reliability:
//   RULES        what was LEGAL. Discrete, checkable, and stable.
//   ENVIRONMENT  what was TYPICAL. Continuous league averages at the anchor
//                season, which are estimates for the earliest eras.
// Conflating them is the failure mode this whole layer exists to avoid: a
// statistical trend is not a rule, and a stereotype is neither.
const wiki = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

const E = (eraId, season, { rulesTitle = "Rules of basketball", seasonTitle } = {}) => ({
  eraId, anchorSeason: season,
  sources: [
    { url: wiki(rulesTitle), title: rulesTitle, publisher: "Wikipedia (NBA rule history)", tier: 3, kind: "rules" },
    { url: wiki(seasonTitle), title: seasonTitle, publisher: "Wikipedia NBA season page", tier: 3, kind: "environment" },
  ],
});

export const ERA_SOURCES = [
  E("1950s", "1957-58", { seasonTitle: "1957–58 NBA season" }),
  E("1960s", "1966-67", { seasonTitle: "1966–67 NBA season" }),
  E("1970s", "1976-77", { seasonTitle: "1976–77 NBA season" }),
  E("1980s", "1986-87", { seasonTitle: "1986–87 NBA season" }),
  E("1990s", "1992-93", { seasonTitle: "1992–93 NBA season" }),
  E("2000s", "2005-06", { seasonTitle: "2005–06 NBA season" }),
  E("2010s", "2015-16", { seasonTitle: "2015–16 NBA season" }),
  E("2020s", "2025-26", { seasonTitle: "2025–26 NBA season" }),
];

export const eraSources = (eraId) => ERA_SOURCES.find((e) => e.eraId === eraId) || null;

export const httpFetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "EraClash-Research/1.0 (build-time research cache)" } });
  return { status: res.status, body: await res.text() };
};

export const parseEraSummary = (body) => {
  let j;
  try { j = JSON.parse(body); } catch { return null; }
  if (!j || !j.title) return null;
  return { title: j.title, description: j.description ?? null, extract: typeof j.extract === "string" ? j.extract.slice(0, 1200) : null };
};

export const runEraResearch = async ({ fetcher = httpFetcher, only = null, force = false, log = console.log } = {}) => {
  ensureCacheDirs();
  let subjects = only ? ERA_SOURCES.filter((e) => e.eraId === only) : ERA_SOURCES;
  if (only && subjects.length === 0) throw new Error(`research:eras — unknown era "${only}"`);

  const stats = { subjects: 0, fetched: 0, cacheHits: 0, failures: 0 };
  for (const era of subjects) {
    stats.subjects++;
    for (const src of era.sources) {
      try {
        const r = await retrieveSource({
          subjectType: "eras", subjectId: era.eraId, url: src.url,
          title: src.title, publisher: src.publisher, tier: src.tier, fetcher, force,
        });
        if (r.cacheHit) { stats.cacheHits++; log(`  cache  ${era.eraId} (${src.kind})`); continue; }
        stats.fetched++;
        const parsed = r.body ? parseEraSummary(r.body) : null;
        if (parsed) recordFacts("eras", era.eraId, { [src.kind]: parsed, anchorSeason: era.anchorSeason }, { verification: "SOURCE_VERIFIED" });
        log(`  fetch  ${era.eraId} (${src.kind})  ${r.entry.httpStatus}, hash ${r.entry.contentHash.slice(0, 8)}`);
      } catch (err) {
        stats.failures++;
        log(`  FAIL   ${era.eraId} (${src.kind}): ${String(err?.message).slice(0, 100)}`);
      }
    }
  }
  return { stats, sources: ERA_SOURCES.length, report: verificationReport("eras") };
};

const main = async () => {
  const args = parseArgs();
  const { stats, report } = await runEraResearch({ only: args.era || null, force: args.force });
  console.log(`\neras ${stats.subjects} · fetched ${stats.fetched} · cache hits ${stats.cacheHits} · failures ${stats.failures}`);
  console.log(`verification: ${report.sourceVerified} source-verified · ${report.unverified} unverified\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
