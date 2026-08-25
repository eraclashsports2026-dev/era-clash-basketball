// ── Research cache ────────────────────────────────────────────────────────────
// Build-time only. Never imported by the app, never served to a user.
//
// ── WHY A CACHE AT ALL ───────────────────────────────────────────────────────
// Researching ~30 coaches across multiple sources means hundreds of network
// reads. Without a cache every re-run re-fetches the same unchanged pages —
// slow, rude to the sources, and non-reproducible, because a run in March and a
// run in June silently disagree. The cache makes research REPRODUCIBLE: the
// content hash pins exactly what was read, so a conclusion can always be traced
// to the bytes it came from.
//
// ── COPYRIGHT POLICY (the important part) ────────────────────────────────────
// The raw fetched body is written under .cache/ which is GIT-IGNORED. What gets
// COMMITTED is the structured extraction: parsed facts, source URLs, retrieval
// timestamps, content hashes, and verification state. Full third-party article
// text, scraped HTML archives, and copyrighted images are never committed.
//
// The content hash is what makes this safe AND useful: it proves which bytes a
// fact came from without redistributing those bytes.
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE_ROOT = join(ROOT, ".cache", "research");
export const SUBJECT_DIRS = ["players", "coaches", "eras", "sources"];

export const PARSER_VERSION = "1.0.0";
export const RETRIEVAL_TOOL_VERSION = "1.0.0";
/** Sources older than this are refetched. */
export const DEFAULT_MAX_AGE_DAYS = 90;

export const ensureCacheDirs = () => {
  for (const d of SUBJECT_DIRS) mkdirSync(join(CACHE_ROOT, d), { recursive: true });
};

export const contentHash = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 32);

const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
const recordPath = (subjectType, subjectId) => join(CACHE_ROOT, subjectType, `${safe(subjectId)}.json`);

export const readRecord = (subjectType, subjectId) => {
  const p = recordPath(subjectType, subjectId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};

export const writeRecord = (subjectType, subjectId, record) => {
  ensureCacheDirs();
  writeFileSync(recordPath(subjectType, subjectId), JSON.stringify(record, null, 2));
  return record;
};

const ageDays = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

export const isStale = (sourceEntry, maxAgeDays = DEFAULT_MAX_AGE_DAYS) =>
  !sourceEntry || !sourceEntry.retrievedAt || ageDays(sourceEntry.retrievedAt) > maxAgeDays ||
  sourceEntry.parserVersion !== PARSER_VERSION;

/**
 * Retrieve one source, using cache unless forced.
 *
 * @param fetcher  injectable async (url) => { status, body }. Injected rather
 *                 than hard-wired so tests exercise cache behaviour without
 *                 network access, and so a run can be replayed offline.
 */
export const retrieveSource = async ({ subjectType, subjectId, url, title = null, publisher = null, tier = 3, fetcher, force = false, maxAgeDays = DEFAULT_MAX_AGE_DAYS, now = () => new Date().toISOString() }) => {
  const record = readRecord(subjectType, subjectId) || { subjectType, subjectId, sources: {}, facts: {}, verification: "UNVERIFIED" };
  const existing = record.sources[url];

  if (!force && existing && !isStale(existing, maxAgeDays)) {
    return { record, entry: existing, cacheHit: true, fetched: false };
  }

  const res = await fetcher(url);
  const body = res?.body ?? "";
  const hash = contentHash(body);
  const changed = !existing || existing.contentHash !== hash;

  const entry = {
    url, title, publisher, sourceTier: tier,
    httpStatus: res?.status ?? null,
    retrievedAt: now(),
    contentHash: hash,
    contentBytes: body.length,
    parserVersion: PARSER_VERSION,
    retrievalToolVersion: RETRIEVAL_TOOL_VERSION,
    lastVerifiedAt: now(),
    changedSinceLastFetch: changed,
    // Usage note travels with the record so a later reader knows the terms the
    // material was read under.
    usageNote: "Structured facts extracted for internal research. Raw body is cached locally under .cache/ (git-ignored) and never committed or redistributed.",
  };
  record.sources[url] = entry;
  writeRecord(subjectType, subjectId, record);
  return { record, entry, cacheHit: false, fetched: true, body };
};

/** Attach parsed facts + verification state to a subject record. */
export const recordFacts = (subjectType, subjectId, facts, { verification = "VERIFIED", notes = null } = {}) => {
  const record = readRecord(subjectType, subjectId) || { subjectType, subjectId, sources: {}, facts: {} };
  record.facts = { ...record.facts, ...facts };
  record.verification = verification;
  record.notes = notes ?? record.notes ?? null;
  record.factsUpdatedAt = new Date().toISOString();
  return writeRecord(subjectType, subjectId, record);
};

export const listSubjects = (subjectType) => {
  const dir = join(CACHE_ROOT, subjectType);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
};

/** Coverage/provenance summary for a subject type. */
/** Verification vocabulary. SOURCE_VERIFIED means "we fetched it from a listed
 *  source and hashed it"; HUMAN_VERIFIED means "a person checked the extracted
 *  facts against that source". They are different claims and the report keeps
 *  them apart — conflating them would let an automated fetch masquerade as
 *  human review. */
export const VERIFICATION_STATES = ["UNVERIFIED", "SOURCE_VERIFIED", "HUMAN_VERIFIED"];

export const verificationReport = (subjectType) => {
  const subjects = listSubjects(subjectType);
  const rows = subjects.map((id) => {
    const r = readRecord(subjectType, id) || {};
    const sources = Object.values(r.sources || {});
    return {
      subjectId: id,
      sourceCount: sources.length,
      tiers: [...new Set(sources.map((s) => s.sourceTier))].sort(),
      oldestRetrievedAt: sources.map((s) => s.retrievedAt).sort()[0] ?? null,
      factCount: Object.keys(r.facts || {}).length,
      verification: r.verification || "UNVERIFIED",
    };
  });
  return {
    subjectType,
    subjects: rows.length,
    sourceVerified: rows.filter((r) => r.verification === "SOURCE_VERIFIED").length,
    humanVerified: rows.filter((r) => r.verification === "HUMAN_VERIFIED").length,
    unverified: rows.filter((r) => r.verification === "UNVERIFIED" || !r.verification).length,
    withoutSources: rows.filter((r) => r.sourceCount === 0).length,
    rows,
  };
};

/** Parse `--coach=phil-jackson` style flags. */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const out = { _: [], force: false };
  for (const a of argv) {
    const m = /^--([A-Za-z0-9-]+)(?:=(.*))?$/.exec(a);
    if (!m) { out._.push(a); continue; }
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  out.force = Boolean(out.force || out.refresh);
  return out;
};
