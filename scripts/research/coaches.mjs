#!/usr/bin/env node
// ── Coach research runner ─────────────────────────────────────────────────────
//   npm run research:coaches                      # cache-first over the manifest
//   npm run research:coaches -- --limit=5
//   npm run research:refresh -- --coach=phil-jackson   # force ONE subject
//
// Cache-first by default: a source that is present and fresh is not refetched.
// Only missing or stale sources hit the network, and --coach scopes a refresh
// to one subject so a single correction never re-reads the whole corpus.
import { retrieveSource, verificationReport, ensureCacheDirs, parseArgs, readRecord, DEFAULT_MAX_AGE_DAYS } from "./lib.mjs";
import { ALL_COACH_SOURCES, coachSources } from "./coach-sources.mjs";

/** Real network fetcher. Injectable so tests never touch the network. */
export const httpFetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "EraClash-Research/1.0 (build-time research cache)" } });
  const body = await res.text();
  return { status: res.status, body };
};

/** Structured extraction from the Wikipedia REST summary payload. */
export const parseCoachSummary = (body) => {
  let j;
  try { j = JSON.parse(body); } catch { return null; }
  if (!j || !j.title) return null;
  return {
    title: j.title,
    description: j.description ?? null,
    // the lead extract only — a short factual summary, not the article body
    extract: typeof j.extract === "string" ? j.extract.slice(0, 1200) : null,
    canonicalUrl: j.content_urls?.desktop?.page ?? null,
  };
};

export const runCoachResearch = async ({ fetcher = httpFetcher, only = null, force = false, limit = null, maxAgeDays = DEFAULT_MAX_AGE_DAYS, log = console.log } = {}) => {
  ensureCacheDirs();
  let subjects = only ? ALL_COACH_SOURCES.filter((c) => c.id === only) : ALL_COACH_SOURCES;
  if (only && subjects.length === 0) throw new Error(`research:coaches — unknown coach "${only}"`);
  if (limit) subjects = subjects.slice(0, Number(limit));

  const stats = { subjects: 0, fetched: 0, cacheHits: 0, failures: 0, changed: 0 };
  for (const subject of subjects) {
    stats.subjects++;
    for (const src of subject.sources) {
      try {
        const r = await retrieveSource({
          subjectType: "coaches", subjectId: subject.id, url: src.url,
          title: src.title, publisher: src.publisher, tier: src.tier,
          fetcher, force, maxAgeDays,
        });
        if (r.cacheHit) { stats.cacheHits++; log(`  cache  ${subject.id}`); continue; }
        stats.fetched++;
        if (r.entry.changedSinceLastFetch) stats.changed++;
        const parsed = r.body ? parseCoachSummary(r.body) : null;
        if (parsed) {
          const { recordFacts } = await import("./lib.mjs");
          recordFacts("coaches", subject.id, { summary: parsed }, { verification: "SOURCE_VERIFIED" });
        }
        log(`  fetch  ${subject.id}  (${r.entry.httpStatus}, ${r.entry.contentBytes}B, hash ${r.entry.contentHash.slice(0, 8)})`);
      } catch (err) {
        stats.failures++;
        log(`  FAIL   ${subject.id}: ${String(err?.message).slice(0, 120)}`);
      }
    }
  }
  return { stats, report: verificationReport("coaches") };
};

const main = async () => {
  const args = parseArgs();
  const only = args.coach || null;
  const { stats, report } = await runCoachResearch({ only, force: args.force, limit: args.limit });
  console.log(`\nsubjects ${stats.subjects} · fetched ${stats.fetched} · cache hits ${stats.cacheHits} · changed ${stats.changed} · failures ${stats.failures}`);
  console.log(`verification: ${report.sourceVerified} source-verified · ${report.humanVerified} human-verified · ${report.unverified} unverified · ${report.withoutSources} without sources\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
