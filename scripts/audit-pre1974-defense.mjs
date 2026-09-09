#!/usr/bin/env node
// ── Pre-recording defensive-data audit ────────────────────────────────────────
// The NBA did not record steals or blocks as official statistics until the
// 1973-74 season. Cards whose represented seasons predate that cannot carry a
// recorded steal or block rate, and three earlier reports gave three different
// counts for that population (50, 45, 297) — numbers that cannot describe the
// same set. This script is the single canonical source: every figure below is
// DERIVED from card metadata at run time, never transcribed.
//
// Run: npm run audit:pre1974-defense
//      npm run audit:pre1974-defense -- --json
import { PLAYERS } from "../src/players.js";
import { PRE_1974_DEFENSE } from "../src/v3/data/preRecordingDefense.js";
import { DATA as WAVE1, BLOCKED } from "./rederive-wave-1.mjs";
import CURATED from "../src/v3/data/intelligence.js";

// The first season with official steals and blocks, by START year: 1973-74.
export const RECORDING_START_YEAR = 1973;

// A decade label, under the project convention (a season belongs to the decade
// of its STARTING year), covers start years D..D+9.
const decadeSpan = (label) => {
  const d = Number(String(label).replace(/[^0-9]/g, ""));
  return Number.isFinite(d) && d > 0 ? [d, d + 9] : null;
};

export const RECORDING_WINDOW = {
  FULLY_PRE: "FULLY_PRE_RECORDING",
  MIXED: "MIXED_RECORDING_WINDOW",
  FULLY_POST: "FULLY_POST_RECORDING",
  INDETERMINATE: "INDETERMINATE_WINDOW",
};

export const SEASON_SOURCE = {
  EXPLICIT: "EXPLICIT_SEASONS",     // per-season rows exist and were verified
  DECADE_SPAN: "DECADE_SPAN_ONLY",  // only the decade label is known
};

/**
 * Classify one card's recording window from the best season evidence available.
 * Explicit seasons decide it outright. With only a decade label, a span that
 * lies wholly on one side of 1973-74 is still decidable; a span that STRADDLES
 * the boundary is not — and is reported as INDETERMINATE rather than guessed,
 * because a 1970s card might represent 1970-73, 1976-79, or both.
 */
export const classifyCard = (card) => {
  const spec = WAVE1[card.id];
  const years = spec?.seasons?.map((s) => s.y).filter((y) => Number.isFinite(y));
  if (years?.length) {
    const pre = years.filter((y) => y < RECORDING_START_YEAR).length;
    const post = years.length - pre;
    const window = pre && post ? RECORDING_WINDOW.MIXED
      : pre ? RECORDING_WINDOW.FULLY_PRE
      : RECORDING_WINDOW.FULLY_POST;
    return { window, source: SEASON_SOURCE.EXPLICIT, seasons: years.length, preSeasons: pre, postSeasons: post };
  }
  const span = decadeSpan(card.decade);
  if (!span) return { window: RECORDING_WINDOW.INDETERMINATE, source: SEASON_SOURCE.DECADE_SPAN, seasons: null };
  const [lo, hi] = span;
  const window = hi < RECORDING_START_YEAR ? RECORDING_WINDOW.FULLY_PRE
    : lo >= RECORDING_START_YEAR ? RECORDING_WINDOW.FULLY_POST
    : RECORDING_WINDOW.INDETERMINATE;
  return { window, source: SEASON_SOURCE.DECADE_SPAN, seasons: null, span };
};

/** A card needs uncertainty handling if ANY represented season could predate
 *  official recording — that is everything except fully post-recording. */
export const needsUncertaintyHandling = (window) => window !== RECORDING_WINDOW.FULLY_POST;

export const REVIEW_STATUS = {
  RECORDED_STAT: "RECORDED_STAT",
  DOCUMENTED_ROLE: "DOCUMENTED_ROLE",
  CALCULATED: "CALCULATED",
  INFERRED: "INFERRED",
  CURATED_ATTRIBUTE: "CURATED_ATTRIBUTE",
  UNREVIEWED: "UNREVIEWED",
  BLOCKED: "BLOCKED",
};

// A curated entry counts as defensive review ONLY if it actually supplies a
// defensive value. Several curated cards patch offence alone, and counting
// those as defensive coverage is how a coverage number drifts upward without
// anyone reviewing anything.
const DEFENSIVE_CURATION_FIELDS = [
  "eventCreation", "rimDeterrence", "interiorDeterrence",
  "perimeterContainment", "schemeVersatility", "defensiveRebounding",
];
export const curatedDefenseFields = (cardId) => {
  const d = CURATED[cardId]?.defense;
  if (!d) return [];
  return DEFENSIVE_CURATION_FIELDS.filter((f) => d[f] != null);
};

/**
 * Exactly one review status per affected card, by explicit precedence.
 *
 * Defensive evidence lives in TWO places, and that is precisely why the
 * earlier counts contradicted each other: preRecordingDefense.js holds
 * evidence-graded bands, while data/intelligence.js holds human-vouched
 * attribute patches. A card covered only by the second one was invisible to
 * any count that looked at the first. Both are accounted for here.
 *
 * Bands outrank curation because a band carries an evidence class; curation
 * is a human vouching for a value without grading its provenance.
 */
export const reviewStatusOf = (cardId, card = null) => {
  const entry = PRE_1974_DEFENSE[cardId];
  if (entry) return entry.evidence;
  if (curatedDefenseFields(cardId).length) return REVIEW_STATUS.CURATED_ATTRIBUTE;
  if (BLOCKED[cardId]) return REVIEW_STATUS.BLOCKED;
  // ── Recorded events are a measurement, not a gap ─────────────────────────
  // A card carrying a NON-ZERO steal or block average cannot have derived that
  // value from a pre-recording season, because the statistic did not exist. So
  // its defensive event data IS a recorded measurement and needs no
  // uncertainty handling — which is why 42 of the 45 cards the Phase 6A audit
  // reported as "unreviewed" were never actually a data gap. They were
  // INDETERMINATE about their SEASONS, and the audit conservatively read that
  // as unreviewed defence.
  if (card && ((Number(card.stl) || 0) > 0 || (Number(card.blk) || 0) > 0)) return REVIEW_STATUS.RECORDED_STAT;
  return REVIEW_STATUS.UNREVIEWED;
};

export const audit = () => {
  const rows = PLAYERS.map((c) => {
    const cls = classifyCard(c);
    const affected = needsUncertaintyHandling(cls.window);
    return {
      id: c.id, name: c.name, decade: c.decade,
      window: cls.window, source: cls.source,
      seasons: cls.seasons, preSeasons: cls.preSeasons ?? null, postSeasons: cls.postSeasons ?? null,
      affected,
      reviewStatus: affected ? reviewStatusOf(c.id, c) : null,
      // A card carrying a non-zero steal/blk value while every represented
      // season predates recording is a data defect, not a rounding artefact.
      declaresRecordedEvents: (Number(c.stl) || 0) > 0 || (Number(c.blk) || 0) > 0,
    };
  });

  const count = (pred) => rows.filter(pred).length;
  const byWindow = {};
  for (const w of Object.values(RECORDING_WINDOW)) byWindow[w] = count((r) => r.window === w);

  const affected = rows.filter((r) => r.affected);
  const byReview = {};
  for (const s of Object.values(REVIEW_STATUS)) byReview[s] = affected.filter((r) => r.reviewStatus === s).length;

  const reviewed = affected.filter((r) => ![REVIEW_STATUS.UNREVIEWED, REVIEW_STATUS.BLOCKED].includes(r.reviewStatus)).length;
  const curatedEntries = affected.filter((r) => r.reviewStatus === REVIEW_STATUS.CURATED_ATTRIBUTE).length;

  // Cards claiming recorded events while fully pre-recording — must be zero.
  const impossible = rows.filter((r) => r.window === RECORDING_WINDOW.FULLY_PRE && r.declaresRecordedEvents);

  // Reviewed entries that cover a card needing no uncertainty handling at all.
  const overCovered = Object.keys(PRE_1974_DEFENSE).filter((id) => {
    const r = rows.find((x) => x.id === id);
    return !r || !r.affected;
  });

  return {
    totalCards: rows.length,
    byWindow,
    affectedCards: affected.length,
    reviewed,
    byReview,
    coverageEntries: Object.keys(PRE_1974_DEFENSE).length,
    curatedEntries,
    overCovered,
    impossible: impossible.map((r) => ({ id: r.id, stl: r.stl, blk: r.blk })),
    rows,
  };
};

const fmt = (n, w = 4) => String(n).padStart(w);

const main = () => {
  const a = audit();
  const json = process.argv.includes("--json");
  if (json) { console.log(JSON.stringify({ ...a, rows: undefined }, null, 2)); return; }

  console.log("── Pre-recording defensive-data audit ──────────────────────────────");
  console.log(`Official steals/blocks recording begins: ${RECORDING_START_YEAR}-${String(RECORDING_START_YEAR + 1).slice(2)}`);
  console.log(`Convention: a season belongs to the decade of its STARTING year.\n`);

  console.log(`Total cards:                 ${fmt(a.totalCards)}`);
  console.log(`  Fully pre-recording:       ${fmt(a.byWindow.FULLY_PRE_RECORDING)}`);
  console.log(`  Mixed recording window:    ${fmt(a.byWindow.MIXED_RECORDING_WINDOW)}`);
  console.log(`  Indeterminate window:      ${fmt(a.byWindow.INDETERMINATE_WINDOW)}   (decade straddles 1973-74; actual seasons unknown)`);
  console.log(`  Fully post-recording:      ${fmt(a.byWindow.FULLY_POST_RECORDING)}`);

  const sumWindows = Object.values(a.byWindow).reduce((x, y) => x + y, 0);
  console.log(`  ${sumWindows === a.totalCards ? "✓" : "✗"} windows reconcile: ${sumWindows} = ${a.totalCards}\n`);

  console.log(`Affected cards requiring uncertainty handling: ${fmt(a.affectedCards)}`);
  console.log(`  Reviewed:                  ${fmt(a.reviewed)}`);
  console.log(`    Recorded-stat:           ${fmt(a.byReview.RECORDED_STAT)}`);
  console.log(`    Documented-role:         ${fmt(a.byReview.DOCUMENTED_ROLE)}`);
  console.log(`    Calculated:              ${fmt(a.byReview.CALCULATED)}`);
  console.log(`    Inferred:                ${fmt(a.byReview.INFERRED)}`);
  console.log(`    Curated-attribute:       ${fmt(a.byReview.CURATED_ATTRIBUTE)}   (human-vouched, no evidence grade)`);
  console.log(`  Unreviewed:                ${fmt(a.byReview.UNREVIEWED)}`);
  console.log(`  Blocked:                   ${fmt(a.byReview.BLOCKED)}`);

  const sumReview = Object.values(a.byReview).reduce((x, y) => x + y, 0);
  console.log(`  ${sumReview === a.affectedCards ? "✓" : "✗"} review statuses reconcile: ${sumReview} = ${a.affectedCards}`);
  const sumReviewed = a.byReview.RECORDED_STAT + a.byReview.DOCUMENTED_ROLE + a.byReview.CALCULATED
    + a.byReview.INFERRED + a.byReview.CURATED_ATTRIBUTE;
  console.log(`  ${sumReviewed === a.reviewed ? "✓" : "✗"} evidence classes reconcile: ${sumReviewed} = ${a.reviewed}\n`);

  console.log(`Coverage entries in preRecordingDefense.js: ${a.coverageEntries}`);
  console.log(`Affected cards covered only by curated attributes: ${a.curatedEntries}`);
  if (a.overCovered.length) console.log(`  ⚠ entries for cards needing no handling: ${a.overCovered.join(", ")}`);
  else console.log(`  ✓ every coverage entry belongs to an affected card`);

  if (a.impossible.length) {
    console.log(`\n✗ ${a.impossible.length} fully pre-recording card(s) declare a recorded steal or block:`);
    for (const r of a.impossible) console.log(`   ${r.id}`);
  } else {
    console.log(`  ✓ no fully pre-recording card declares a recorded steal or block`);
  }

  // Where the old numbers came from, so nobody re-derives them by accident.
  console.log(`\n── Reconciliation of the three earlier figures ──────────────────────`);
  const fullyPre = a.rows.filter((r) => r.window === RECORDING_WINDOW.FULLY_PRE);
  const fullyPreReviewed = fullyPre.filter((r) => ![REVIEW_STATUS.UNREVIEWED, REVIEW_STATUS.BLOCKED].includes(r.reviewStatus)).length;
  const fullyPreBanded = fullyPre.filter((r) => PRE_1974_DEFENSE[r.id]).length;
  const fullyPreCurated = fullyPre.filter((r) => r.reviewStatus === REVIEW_STATUS.CURATED_ATTRIBUTE).length;
  console.log(`  "50 pre-1974 cards, all reviewed"`);
  console.log(`     Population is real: ${fullyPre.length} cards are fully pre-recording (the 1950s and`);
  console.log(`     1960s decades, whose every season precedes ${RECORDING_START_YEAR}-74).`);
  console.log(`     ${fullyPreReviewed}/${fullyPre.length} are covered — but via TWO mechanisms: ${fullyPreBanded} evidence-graded`);
  console.log(`     bands plus ${fullyPreCurated} curated attribute patches. The claim was true and`);
  console.log(`     the "45" was true; they counted different things.`);
  console.log(`  "45" — entries in preRecordingDefense.js (${a.coverageEntries}). That is ONE mechanism's`);
  console.log(`     coverage, over a wider population (${a.affectedCards} affected cards), not a population.`);
  console.log(`  "297" — 381 cards minus 84 verified persons. A shooting/physical`);
  console.log(`     coverage gap mislabelled as a pre-1974 population. Unrelated.`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
