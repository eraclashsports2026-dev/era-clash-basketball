#!/usr/bin/env node
// ── EraClash player-image discovery (Wikimedia Commons) ───────────────────────
// Searches the MediaWiki Action API on commons.wikimedia.org for candidate
// images for every player-decade entry, captures license + provenance from
// imageinfo/extmetadata, applies the license whitelist, scores era match, and
// writes a PENDING-review candidate registry.
//
// This tool NEVER approves anything for production. Humans do that
// (see review.mjs / approve.mjs). Metadata only — no image files are
// downloaded here; originals are fetched at approval time by approve.mjs.
//
// License whitelist (production): Public Domain, CC0, CC BY (attribution
// fulfilled via /credits). CC BY-SA candidates are kept but flagged
// license_flag:"by-sa" — they require an explicit share-alike compliance
// decision and are NOT approvable until that decision is documented.
// Unknown/NC/ND/fair-use → rejected automatically (counted, not kept).
//
// Usage: node image-pipeline/discover.mjs [--limit N] [--delay MS]
import { PLAYERS } from "../src/players.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const OUT = new URL("./candidates.json", import.meta.url).pathname;
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "EraClashBasketball/2.2 (image research tool; contact: site owner via eraclashsports.com)";

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i > -1 ? Number(args[i + 1]) : d; };
const LIMIT = argVal("--limit", Infinity);
const DELAY = argVal("--delay", 400);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LICENSE_OK = /^(public domain|pd(-[\w-]+)?|cc0(\s|$)|cc[\s-]?by(\s|-)?\d?(\.\d)?$)/i;
const LICENSE_BYSA = /^cc[\s-]?by[\s-]?sa/i;
const LICENSE_REJECT = /(nc|nd|non[\s-]?commercial|no[\s-]?deriv|fair[\s-]?use|copyright)/i;

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export const classifyLicense = (short) => {
  const s = String(short || "").trim();
  if (!s) return "reject_unknown";
  if (LICENSE_REJECT.test(s)) return "reject_terms";
  if (LICENSE_BYSA.test(s)) return "flag_by_sa";
  if (LICENSE_OK.test(s)) return "ok";
  return "reject_unknown";
};

const decadeRange = (decade) => {
  const start = Number(decade.slice(0, 4));
  return [start, start + 9];
};

export const eraMatch = (dateStr, decade) => {
  const m = String(dateStr || "").match(/(19|20)\d{2}/);
  if (!m) return "unknown";
  const y = Number(m[0]);
  const [lo, hi] = decadeRange(decade);
  if (y >= lo && y <= hi) return "exact";
  if (y >= lo - 3 && y <= hi + 3) return "near";
  return "off_era";
};

const identityScore = (p, title, desc) => {
  const hay = `${title} ${desc}`.toLowerCase();
  const tokens = p.name.toLowerCase().split(/\s+/);
  const nameHit = tokens.every((t) => hay.includes(t));
  const lastHit = hay.includes(tokens[tokens.length - 1]);
  const bball = /basket|nba|dunk|guard|forward|center|game|court/i.test(hay);
  let score = 0;
  if (nameHit) score += 5; else if (lastHit) score += 2; else return { score: 0, verdict: "reject" };
  if (bball) score += 2;
  return { score, verdict: nameHit ? "plausible" : "ambiguous" };
};

async function searchPlayer(p) {
  const q = `${p.name} basketball`;
  const url = `${API}?${new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrnamespace: "6",
    gsrlimit: "6",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "480",
    format: "json",
  })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; } // polite backoff
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    return Object.values(data?.query?.pages || {});
  }
  throw new Error("http 429 (rate limited after retries)");
}

const rejects = { license_unknown: 0, license_terms: 0, identity: 0, not_image: 0 };

function toCandidate(p, page) {
  const ii = page.imageinfo?.[0];
  if (!ii) { rejects.not_image++; return null; }
  if (!/\.(jpe?g|png)$/i.test(page.title)) { rejects.not_image++; return null; }
  const em = ii.extmetadata || {};
  const g = (k) => stripHtml(em[k]?.value);
  const licenseShort = g("LicenseShortName") || g("UsageTerms");
  const cls = classifyLicense(licenseShort);
  if (cls === "reject_unknown") { rejects.license_unknown++; return null; }
  if (cls === "reject_terms") { rejects.license_terms++; return null; }
  const idv = identityScore(p, page.title, g("ImageDescription"));
  if (idv.verdict === "reject") { rejects.identity++; return null; }
  const era = eraMatch(g("DateTimeOriginal") || g("DateTime"), p.decade);
  return {
    id: `${p.id}__${page.pageid}`,
    player_id: p.id,
    player_name: p.name,
    season_or_decade: p.decade,
    image_url: ii.url,
    thumbnail_url: ii.thumburl || ii.url,
    width: ii.width, height: ii.height,
    source_name: "Wikimedia Commons",
    source_page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    source_asset_id: String(page.pageid),
    file_title: page.title,
    creator: g("Artist") || null,
    credit: g("Credit") || null,
    license_name: licenseShort || null,
    license_url: g("LicenseUrl") || null,
    usage_terms: g("UsageTerms") || null,
    license_flag: cls === "flag_by_sa" ? "by-sa" : null,
    required_attribution: /by/i.test(licenseShort || "") ,
    image_date: g("DateTimeOriginal") || null,
    description: g("ImageDescription").slice(0, 300) || null,
    era_match_quality: era,
    identity_confidence: idv.verdict,
    identity_score: idv.score,
    identity_verified: false,
    license_verified: false,
    human_review_status: "pending",
    approved_for_product: false,
    discovered_at: new Date().toISOString(),
  };
}

const main = async () => {
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { candidates: [], players_done: [] };
  const done = new Set(existing.players_done);
  const players = PLAYERS.filter((p) => !done.has(p.id)).slice(0, LIMIT);
  console.log(`Discovering images for ${players.length} player entries (already done: ${done.size})`);

  let i = 0;
  for (const p of players) {
    i++;
    try {
      const pages = await searchPlayer(p);
      const cands = pages.map((pg) => toCandidate(p, pg)).filter(Boolean)
        .sort((a, b) => (b.identity_score + (b.era_match_quality === "exact" ? 3 : b.era_match_quality === "near" ? 1 : 0))
                      - (a.identity_score + (a.era_match_quality === "exact" ? 3 : a.era_match_quality === "near" ? 1 : 0)))
        .slice(0, 4);
      existing.candidates.push(...cands);
      existing.players_done.push(p.id);
      if (i % 20 === 0) {
        console.log(`  ${i}/${players.length} (${existing.candidates.length} candidates so far)`);
        writeFileSync(OUT, JSON.stringify(existing, null, 1));
      }
    } catch (e) {
      console.error(`  ${p.id}: ${e.message} (will retry next run)`);
    }
    await sleep(DELAY);
  }
  existing.reject_counts = Object.fromEntries(
    Object.entries({ ...existing.reject_counts }).map(([k, v]) => [k, (v || 0)]));
  for (const [k, v] of Object.entries(rejects)) {
    existing.reject_counts[k] = (existing.reject_counts[k] || 0) + v;
  }
  existing.updated_at = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(existing, null, 1));

  const byEra = existing.candidates.reduce((m, c) => ((m[c.era_match_quality] = (m[c.era_match_quality] || 0) + 1), m), {});
  const covered = new Set(existing.candidates.map((c) => c.player_id)).size;
  console.log(`\nDone. ${existing.candidates.length} pending candidates covering ${covered}/${PLAYERS.length} entries.`);
  console.log(`Era match: ${JSON.stringify(byEra)}  Rejected: ${JSON.stringify(existing.reject_counts)}`);
  console.log(`Next: node image-pipeline/review.mjs to generate the review page.`);
};

// Run only as a CLI — tests import classifyLicense/eraMatch without sweeping.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
