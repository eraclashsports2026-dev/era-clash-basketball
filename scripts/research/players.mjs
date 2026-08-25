#!/usr/bin/env node
// ── Player research runner ────────────────────────────────────────────────────
//   npm run research:players
//   npm run research:players -- --limit=6
//   npm run research:refresh-player -- --player=kyle-lowry
//   npm run research:verify-players
//
// Cache-first: a present, fresh source is not refetched. Only missing or stale
// sources hit the network.
//
// ── WHAT THIS RUNNER DOES AND DOES NOT DO ────────────────────────────────────
// It fetches and HASHES each configured source, giving every downstream fact a
// verifiable provenance trail. It does NOT attempt to machine-parse per-season
// career tables out of article HTML: that parse is fragile, and a silently
// mis-parsed rebounding column is worse than no parse at all. Per-season
// extraction is recorded as HUMAN_VERIFIED facts against the same hashed
// source, so a reader can always tell which claims a machine made and which a
// person made.
import { retrieveSource, recordFacts, readRecord, verificationReport, ensureCacheDirs, parseArgs, DEFAULT_MAX_AGE_DAYS } from "./lib.mjs";
import { ALL_PLAYER_SOURCES, playerSources } from "./player-sources.mjs";

export const httpFetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "EraClash-Research/1.0 (build-time research cache)" } });
  return { status: res.status, body: await res.text() };
};

export const parsePlayerSummary = (body) => {
  let j;
  try { j = JSON.parse(body); } catch { return null; }
  if (!j || !j.title) return null;
  return {
    title: j.title,
    description: j.description ?? null,
    extract: typeof j.extract === "string" ? j.extract.slice(0, 1200) : null,
    canonicalUrl: j.content_urls?.desktop?.page ?? null,
  };
};

export const runPlayerResearch = async ({ fetcher = httpFetcher, only = null, force = false, limit = null, maxAgeDays = DEFAULT_MAX_AGE_DAYS, summaryOnly = true, log = console.log } = {}) => {
  ensureCacheDirs();
  let subjects = only ? ALL_PLAYER_SOURCES.filter((p) => p.personId === only) : ALL_PLAYER_SOURCES;
  if (only && subjects.length === 0) throw new Error(`research:players — unknown player "${only}"`);
  if (limit) subjects = subjects.slice(0, Number(limit));

  const stats = { subjects: 0, fetched: 0, cacheHits: 0, failures: 0, changed: 0 };
  for (const subject of subjects) {
    stats.subjects++;
    // Only the summary endpoint is fetched automatically. The career-table
    // source is registered for provenance and refreshed on demand.
    const sources = summaryOnly ? subject.sources.filter((s) => s.kind === "summary") : subject.sources;
    for (const src of sources) {
      try {
        const r = await retrieveSource({
          subjectType: "players", subjectId: subject.personId, url: src.url,
          title: src.title, publisher: src.publisher, tier: src.tier, fetcher, force, maxAgeDays,
        });
        if (r.cacheHit) { stats.cacheHits++; log(`  cache  ${subject.personId}`); continue; }
        stats.fetched++;
        if (r.entry.changedSinceLastFetch) stats.changed++;
        const parsed = r.body ? parsePlayerSummary(r.body) : null;
        if (parsed) recordFacts("players", subject.personId, { summary: parsed, cardIds: subject.cardIds }, { verification: "SOURCE_VERIFIED" });
        log(`  fetch  ${subject.personId}  (${r.entry.httpStatus}, ${r.entry.contentBytes}B, hash ${r.entry.contentHash.slice(0, 8)})`);
      } catch (err) {
        stats.failures++;
        log(`  FAIL   ${subject.personId}: ${String(err?.message).slice(0, 120)}`);
      }
    }
  }
  return { stats, report: verificationReport("players") };
};

/** Coverage/provenance audit — what is verified, what is still missing. */
export const verifyPlayers = () => {
  const rows = ALL_PLAYER_SOURCES.map((s) => {
    const rec = readRecord("players", s.personId);
    const sources = Object.values(rec?.sources ?? {});
    return {
      personId: s.personId, cardIds: s.cardIds,
      sourceCount: sources.length,
      verification: rec?.verification ?? "UNVERIFIED",
      hasSeasonFacts: Boolean(rec?.facts?.seasons),
      hasPhysical: Boolean(rec?.facts?.physical),
      hasShooting: Boolean(rec?.facts?.shooting),
    };
  });
  return {
    subjects: rows.length,
    withSources: rows.filter((r) => r.sourceCount > 0).length,
    withSeasonFacts: rows.filter((r) => r.hasSeasonFacts).length,
    withPhysical: rows.filter((r) => r.hasPhysical).length,
    withShooting: rows.filter((r) => r.hasShooting).length,
    rows,
  };
};

const main = async () => {
  const args = parseArgs();
  if (args["verify-players"] || args.verify) {
    const v = verifyPlayers();
    console.log(`\nplayer research coverage: ${v.withSources}/${v.subjects} with sources · ${v.withSeasonFacts} with season facts · ${v.withPhysical} physical · ${v.withShooting} shooting\n`);
    for (const r of v.rows.filter((x) => x.sourceCount === 0)) console.log(`  NO SOURCES  ${r.personId}`);
    return;
  }
  const { stats, report } = await runPlayerResearch({ only: args.player || null, force: args.force, limit: args.limit });
  console.log(`\nsubjects ${stats.subjects} · fetched ${stats.fetched} · cache hits ${stats.cacheHits} · changed ${stats.changed} · failures ${stats.failures}`);
  console.log(`verification: ${report.sourceVerified} source-verified · ${report.humanVerified} human-verified · ${report.unverified} unverified\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
