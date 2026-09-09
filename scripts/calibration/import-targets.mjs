#!/usr/bin/env node
// ── Historical calibration target ingestion ─────────────────────────────────
// Builds the calibration target store from AUTHORIZED sources only, and
// records where every single number came from.
//
//   npm run calibration:import-targets     -- build/refresh the store
//   npm run calibration:verify-targets     -- validate provenance and schema
//   npm run calibration:coverage           -- the coverage gate report
//
// Authorized sources, and why:
//   Wikipedia    CC BY-SA 4.0 explicitly permits reuse with attribution.
//   Player cards In-repo data, already verified against published sources.
//
// Deliberately NOT used: basketball-reference. It is technically reachable, but
// its terms forbid using its statistics "for purposes of training, fine-tuning,
// prompting, or instructing artificial intelligence models or technologies in
// any manner". Calibrating a model against that data is squarely inside that
// prohibition. Reaching it is not the same as being allowed to use it.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { FIXTURES, fixtureById } from "../../data/calibration/fixtures.mjs";
import { FIXTURE_SOURCES, byBasis, unmappedFixtures } from "../../data/calibration/sourceMap.mjs";
import { CALIBRATION_FIXTURE_IDS, HOLDOUT_FIXTURE_IDS } from "../../data/calibration/split.mjs";
import { PLAYERS } from "../../src/players.js";
import { fetchArticle, parsePlayerTable, parseRecord, PUBLISHER, LICENSE_NOTE } from "./adapters/wikipedia.mjs";
import { validateTargetRecord, coverageOf, notRecordedInEra, AVAILABILITY, TEAM_TARGET_FIELDS,
         HISTORICAL_TARGET_SCHEMA_VERSION, HISTORICAL_TARGET_DATA_VERSION } from "../../src/v3/calibration/targetSchema.js";
import { versionOf } from "../../src/versions.js";

export const TARGET_STORE = "data/calibration/targets.json";

const CARD = new Map(PLAYERS.map((p) => [p.id, p]));
const round4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

/** Normalise a name for matching a card against an article row. */
const normName = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

// A handful of cards carry the name the player used in a DIFFERENT season from
// the one the article covers. These are documented facts about the person, not
// guesses, and each is a rename rather than a substitution.
const NAME_EQUIVALENTS = Object.freeze({
  "kareem abduljabbar": ["lew alcindor"],
  "metta world peace": ["ron artest"],
});

const matchesRow = (cardName, rowName) => {
  const a = normName(cardName);
  const b = normName(rowName);
  if (a === b) return true;
  for (const [k, alts] of Object.entries(NAME_EQUIVALENTS)) {
    if ((a === k && alts.includes(b)) || (b === k && alts.includes(a))) return true;
  }
  // Exact or documented alias only. A last-name-plus-first-initial rule matched
  // "Draymond Green" to Danny Green, which in a historical corpus is a
  // fabrication rather than a convenience.
  return false;
};

/** Normalise a set of values into shares that sum to exactly 1. */
const sharesOf = (entries) => {
  const total = entries.reduce((a, [, v]) => a + (v ?? 0), 0);
  if (!(total > 0)) return null;
  const out = {};
  for (const [k, v] of entries) out[k] = round4((v ?? 0) / total);
  // Rounding can leave the sum a hair off 1. Absorb the remainder into the
  // largest share, which is where it is proportionally smallest.
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum !== 1) {
    const biggest = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
    out[biggest] = round4(out[biggest] + (1 - sum));
  }
  return out;
};

// ── Adapters ────────────────────────────────────────────────────────────────

/**
 * Selected-five shares from the SAME SEASON the fixture represents.
 *
 * This is the stronger of the two proxies: it uses the players' actual output
 * in that season rather than a decade average. It is still a PROXY — five
 * players' season averages are not the same as their output in a five-man unit
 * with no bench — and it is labelled as one.
 */
const seasonMatch = (fixture, table) => {
  const matched = [];
  const unmatched = [];
  for (const r of fixture.roster) {
    const card = CARD.get(r.playerCardId);
    const row = table.players.find((p) => matchesRow(card.name, p.name));
    if (row) matched.push({ cardId: r.playerCardId, name: row.name, gp: row.gp, ppg: row.ppg, rpg: row.rpg, apg: row.apg, fgPct: row.fgPct });
    else unmatched.push({ cardId: r.playerCardId, name: card.name });
  }
  return {
    matched, unmatched,
    // How much of this lineup actually played that season. Measured, not
    // assumed from the fixture's own label — and the two disagree sharply.
    lineupFidelity: matched.length / fixture.roster.length,
    // Season shares are only meaningful over the WHOLE unit. Normalising two
    // matched players to 100% would invent a two-man team.
    shares: matched.length === fixture.roster.length ? {
      playerScoringShares: sharesOf(matched.map((x) => [x.cardId, x.ppg])),
      playerReboundShares: sharesOf(matched.map((x) => [x.cardId, x.rpg])),
      playerAssistShares: sharesOf(matched.map((x) => [x.cardId, x.apg])),
    } : null,
  };
};

/**
 * Selected-five shares from the players' own decade cards.
 *
 * The fallback for a synthetic lineup, where no single season applies. Weaker
 * than a season match — a decade average smooths across years — so it carries
 * LOW confidence.
 */
const cardShares = (fixture) => {
  const cards = fixture.roster.map((r) => ({ id: r.playerCardId, c: CARD.get(r.playerCardId) }));
  if (cards.some((x) => !x.c)) return null;
  return {
    playerScoringShares: sharesOf(cards.map((x) => [x.id, x.c.pts])),
    playerReboundShares: sharesOf(cards.map((x) => [x.id, x.c.reb])),
    playerAssistShares: sharesOf(cards.map((x) => [x.id, x.c.ast])),
  };
};

// ── Record construction ─────────────────────────────────────────────────────
const teamEntry = (value, availability, provenance) => ({ value, availability, provenance: value == null ? null : provenance });

const buildRecord = async ({ fixture, refresh }) => {
  const src = FIXTURE_SOURCES[fixture.fixtureId];
  const teamTargets = {};
  const notes = [];
  let article = null;
  let table = null;

  if (src?.wikipedia) {
    article = await fetchArticle(src.wikipedia, { refresh });
    table = parsePlayerTable(article.html);
  }

  const wikiProv = article && {
    sourceType: "AUTHORIZED_PUBLIC_API",
    publisher: PUBLISHER,
    sourceUrl: article.sourceUrl,
    revisionId: article.revisionId,
    contentHash: article.contentHash,
    retrievedAt: article.retrievedAt,
    licenseNote: LICENSE_NOTE,
    verificationStatus: "PARSED_FROM_SOURCE",
  };

  // ── Tier A: recorded team basics ──
  const record = article ? parseRecord(article.html) : null;
  if (record) {
    teamTargets.games = teamEntry(record.games, "RECORDED_STATISTIC", wikiProv);
    teamTargets.wins = teamEntry(record.wins, "RECORDED_STATISTIC", wikiProv);
    teamTargets.losses = teamEntry(record.losses, "RECORDED_STATISTIC", wikiProv);
  }

  // ── Everything else: say WHY it is missing, in the right terms ──
  const basis = src?.basis ?? "SYNTHETIC_LINEUP";
  for (const m of TEAM_TARGET_FIELDS) {
    if (teamTargets[m]) continue;
    let availability;
    if (notRecordedInEra(m, fixture.eraStyleId)) availability = "NOT_RECORDED_IN_ERA";
    else if (basis === "SYNTHETIC_LINEUP") availability = "NOT_APPLICABLE_SYNTHETIC_LINEUP";
    else availability = "SOURCE_BLOCKED_LICENSING";
    teamTargets[m] = teamEntry(null, availability, null);
  }

  // ── Tier C: selected-five distribution ──
  //
  // Card-derived shares are the PRIMARY method, not a fallback. Measuring the
  // corpus showed only ONE of 26 fixtures is actually the documented starting
  // five of its named season — "2015-16 Warriors" contains LeBron James and
  // Nikola Jokic — so a season-based share would describe a unit that did not
  // exist. The players' own decade averages apply uniformly to all 26.
  const match = table ? seasonMatch(fixture, table) : null;
  const cs = cardShares(fixture);
  let unitTargets = null;
  if (cs) {
    unitTargets = {
      unitType: "SELECTED_FIVE",
      selectedFiveOnly: true,
      availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
      confidence: "LOW",
      basis,
      ...cs,
      // Field-goal-attempt share is NOT derivable from published per-game
      // scoring: points cannot be split into field goals and free throws
      // without attempt counts. Scoring share is the closest available surface
      // and is a related but distinct quantity — an efficient player scores
      // more per attempt.
      playerOpportunityShares: null,
      playerUsageShares: null,
      opportunityShareNote: "Field-goal-attempt share is not derivable from published per-game scoring. Scoring share is the validation surface; it is related but not the same quantity.",
      provenance: {
        sourceType: "IN_REPO_VERIFIED",
        publisher: "EraClash player card data",
        sourceFile: `src/players.js@playerDataVersion=${versionOf("playerDataVersion")}`,
        retrievedAt: new Date().toISOString().slice(0, 10),
        licenseNote: "Own data, verified against published per-season sources in earlier phases.",
        verificationStatus: "IN_REPO_VERIFIED",
        formula: "share_i = stat_i / sum(stat over the five selected cards)",
      },
    };
  }

  // The season data becomes a CROSS-CHECK rather than the target: it says how
  // much of this lineup really played that season, and what those players
  // actually produced. Both are useful; neither is a unit target.
  const seasonCrossCheck = match && {
    season: src.season,
    lineupFidelity: round4(match.lineupFidelity),
    matchedCount: match.matched.length,
    rosterSize: fixture.roster.length,
    matchedPlayers: match.matched,
    unmatchedPlayers: match.unmatched,
    fullUnitShares: match.shares,
    availability: match.shares ? "SELECTED_FIVE_SEASON_SHARE_PROXY" : "NOT_APPLICABLE_SYNTHETIC_LINEUP",
    note: match.shares
      ? "All five cards played this season for this team, so a season-based unit share is meaningful."
      : `Only ${match.matched.length} of ${fixture.roster.length} cards played this season for this team. A season-based unit share would describe a unit that never existed.`,
    provenance: wikiProv,
  };

  return {
    fixtureId: fixture.fixtureId,
    teamSeasonId: fixture.teamSeasonId ?? null,
    season: src?.season ?? null,
    seasonBasis: basis,
    targetDataVersion: HISTORICAL_TARGET_DATA_VERSION,
    targetSchemaVersion: HISTORICAL_TARGET_SCHEMA_VERSION,
    set: HOLDOUT_FIXTURE_IDS.includes(fixture.fixtureId) ? "holdout" : "calibration",
    teamTargets,
    unitTargets,
    seasonCrossCheck,
    // Tactical identity is interpretation, never an official statistic, so it
    // is labelled as a style comparison wherever it is used.
    identityTargets: fixture.qualitativeIdentity
      ? Object.entries(fixture.qualitativeIdentity).filter(([, v]) => v).map(([k, v]) => ({
          trait: k, value: v, kind: "DOCUMENTED_STYLE_COMPARISON", confidence: fixture.sourceConfidence }))
      : [],
    confidence: fixture.sourceConfidence,
    notes,
  };
};

export const buildStore = async ({ refresh = false, only = null } = {}) => {
  const targets = [];
  for (const f of FIXTURES) {
    if (only && f.fixtureId !== only) continue;
    targets.push(await buildRecord({ fixture: f, refresh }));
  }
  return {
    targetSchemaVersion: HISTORICAL_TARGET_SCHEMA_VERSION,
    targetDataVersion: HISTORICAL_TARGET_DATA_VERSION,
    authorizedSources: [
      { name: PUBLISHER, type: "AUTHORIZED_PUBLIC_API", license: "CC BY-SA 4.0", note: LICENSE_NOTE },
      { name: "EraClash player cards", type: "IN_REPO_VERIFIED", license: "own data", note: "Verified against published per-season sources in earlier phases." },
    ],
    excludedSources: [
      {
        name: "basketball-reference.com / Sports Reference LLC",
        reachable: true,
        excluded: true,
        reason: "Terms of use forbid using the site's statistics 'for purposes of training, fine-tuning, prompting, or instructing artificial intelligence models or technologies in any manner'. Calibrating a simulation model against that data falls inside that prohibition.",
        note: "The Phase 6C1 report attributed this block to HTTP 403. That was a fetch-tool artifact: the site is reachable with an honest User-Agent on robots-permitted paths. The real barrier is licensing, which a licence can lift and a workaround cannot.",
        remedy: "LICENSED_EXPORT or express written permission.",
      },
      {
        name: "stats.nba.com",
        reachable: false,
        excluded: true,
        reason: "No response from this environment; nba.com denies even robots.txt.",
        remedy: "An official data agreement.",
      },
    ],
    targets,
  };
};

export const loadStore = () => (existsSync(TARGET_STORE) ? JSON.parse(readFileSync(TARGET_STORE, "utf8")) : null);

export const storeHash = (store) =>
  createHash("sha256").update(JSON.stringify(store.targets)).digest("hex");

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "import";
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };

  if (cmd === "import") {
    const unmapped = unmappedFixtures();
    if (unmapped.length) { console.error(`unmapped fixtures: ${unmapped.join(", ")}`); process.exit(1); }
    const store = await buildStore({ refresh: process.argv.includes("--refresh"), only: arg("--fixture") });
    const errors = store.targets.flatMap((r) => validateTargetRecord(r, { fixtureIds: FIXTURES.map((f) => f.fixtureId) }));
    if (errors.length) {
      console.error(`REJECTED — ${errors.length} validation error(s):`);
      for (const e of errors.slice(0, 25)) console.error(`  ${e}`);
      process.exit(1);
    }
    mkdirSync("data/calibration", { recursive: true });
    writeFileSync(TARGET_STORE, JSON.stringify(store, null, 2) + "\n");
    console.log(`wrote ${TARGET_STORE} — ${store.targets.length} records, hash ${storeHash(store).slice(0, 16)}`);
    const b = byBasis();
    console.log(`\nseason basis: REAL ${b.REAL_TEAM_SEASON.length} · APPROX ${b.APPROX_TEAM_SEASON.length} · SYNTHETIC ${b.SYNTHETIC_LINEUP.length}`);
  } else if (cmd === "verify") {
    const store = loadStore();
    if (!store) { console.error(`no target store at ${TARGET_STORE} — run calibration:import-targets`); process.exit(1); }
    const ids = FIXTURES.map((f) => f.fixtureId);
    const errors = store.targets.flatMap((r) => validateTargetRecord(r, { fixtureIds: ids }));
    console.log(`${store.targets.length} records · schema ${store.targetSchemaVersion} · data ${store.targetDataVersion} · hash ${storeHash(store).slice(0, 16)}`);
    if (errors.length) { console.error(`\n${errors.length} error(s):`); for (const e of errors) console.error(`  ${e}`); process.exit(1); }
    console.log("✓ every value carries provenance; no missing metric became zero");
  } else if (cmd === "coverage") {
    const store = loadStore();
    if (!store) { console.error("no target store"); process.exit(1); }
    for (const set of ["calibration", "holdout"]) {
      const rows = store.targets.filter((r) => r.set === set);
      const cov = coverageOf(rows);
      const withUnit = rows.filter((r) => r.unitTargets).length;
      const crossChecked = rows.filter((r) => r.seasonCrossCheck);
      const fullUnit = crossChecked.filter((r) => r.seasonCrossCheck.fullUnitShares);
      console.log(`\n${set.toUpperCase()} — ${rows.length} fixtures`);
      console.log(`  Tier A (recorded team basics)   ${cov.A} fields`);
      console.log(`  Tier B (derived advanced)       ${cov.B} fields`);
      console.log(`  Tier C (selected-five shares)   ${cov.C} share maps across ${withUnit} fixtures`);
      console.log(`  Tier D (documented identity)    ${cov.D} notes`);
      console.log(`  source-blocked fields           ${cov.blockedFields}   (licensing, not access)`);
      console.log(`  source-blocked fixtures         ${cov.blockedFixtures}`);
      console.log(`  not applicable (synthetic)      ${cov.notApplicable}`);
      console.log(`  not recorded in era             ${cov.notRecorded}`);
      const conf = rows.reduce((a, r) => ({ ...a, [r.unitTargets?.confidence ?? "none"]: (a[r.unitTargets?.confidence ?? "none"] ?? 0) + 1 }), {});
      console.log(`  unit-target confidence          ${JSON.stringify(conf)}`);
      // Lineup fidelity is the finding that decides what a target can MEAN. A
      // fixture whose five never played together has no real unit behind it.
      if (crossChecked.length) {
        const avg = crossChecked.reduce((a, r) => a + r.seasonCrossCheck.lineupFidelity, 0) / crossChecked.length;
        console.log(`  lineup fidelity (measured)      ${fullUnit.length}/${crossChecked.length} fixtures are the real five; mean fidelity ${(avg * 100).toFixed(0)}%`);
        for (const r of crossChecked.sort((a, b) => a.seasonCrossCheck.lineupFidelity - b.seasonCrossCheck.lineupFidelity).slice(0, 3)) {
          console.log(`      ${r.fixtureId.padEnd(30)} ${r.seasonCrossCheck.matchedCount}/${r.seasonCrossCheck.rosterSize} played ${r.seasonCrossCheck.season}`);
        }
      }
    }
    console.log(`\nholdout engine comparisons run: 0 — this command reads targets only, never the engine`);
  } else {
    console.error(`unknown command "${cmd}"`);
    process.exit(1);
  }
}
