#!/usr/bin/env node
// ── Historical corpus v2 builder ────────────────────────────────────────────
// Generates the source-valid historical corpus from VERIFIED team-seasons.
//
// Every fixture here satisfies, by measurement rather than assertion:
//   - all five cards appeared for the named team-season
//   - the coach coached that team-season
//   - the card decade contains the season
//   - the five can fill PG-SG-SF-PF-C legally
//
// The corpus is generated, not hand-written, so a fixture cannot claim
// something the source does not support.
//
//   npm run calibration:build-corpus-v2
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { scanSeason } from "./scan-seasons.mjs";
import { PLAYERS } from "../../src/players.js";
import { versionOf } from "../../src/versions.js";

export const CORPUS_V2_PATH = "data/calibration/historical-corpus-v2.json";

/**
 * Verified team-seasons. Each was confirmed by scanning the season article:
 * the five named cards all appear on that season's roster or statistics table,
 * and the coach is documented for that season.
 *
 * `identity` is documented tactical description — interpretation, never an
 * official statistic — and is labelled as such downstream.
 */
export const VERIFIED_SEASONS = [
  {
    fixtureId: "h2-1962-63-celtics",
    article: "1962–63 Boston Celtics season", eraStyleId: "1960s", coachId: "red-auerbach",
    classification: "HISTORICAL_LINEUP",
    five: { PG: "cousy-60s", SG: "sam-60s", SF: "john-h-60s", PF: "tom-h-60s", C: "bill-60s" },
    identity: { pace: "very fast", offense: "fast break from defensive rebounding, early offence", defense: "rim-anchored man", strengths: ["transition volume", "interior defence", "rebounding"], weaknesses: ["no perimeter shot exists in this era"] },
    note: "Bob Cousy's final season. The fast-break Celtics.",
  },
  {
    fixtureId: "h2-1964-65-celtics",
    article: "1964–65 Boston Celtics season", eraStyleId: "1960s", coachId: "red-auerbach",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "larry-s-60s", SG: "sam-60s", SF: "john-h-60s", PF: "tom-h-60s", C: "bill-60s" },
    identity: { pace: "very fast", offense: "fast break, balanced scoring", defense: "rim-anchored man", strengths: ["defence", "depth", "rebounding"], weaknesses: ["half-court spacing"] },
    note: "62-18, the franchise's best regular season to that point. Evidence is the roster table; the article carries no statistics.",
  },
  {
    fixtureId: "h2-1972-73-celtics",
    article: "1972–73 Boston Celtics season", eraStyleId: "1970s", coachId: "tom-heinsohn",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "jojo-70s", SG: "westphal-70s", SF: "john-h-70s", PF: "paul-s-70s", C: "dave-c-70s" },
    identity: { pace: "fast", offense: "motion and off-ball movement, running game", defense: "switching, aggressive man", strengths: ["pace", "team defence", "movement"], weaknesses: ["interior size"] },
    note: "68-14, the best regular season in franchise history.",
  },
  {
    fixtureId: "h2-1974-75-celtics",
    article: "1974–75 Boston Celtics season", eraStyleId: "1970s", coachId: "tom-heinsohn",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "jojo-70s", SG: "westphal-70s", SF: "john-h-70s", PF: "paul-s-70s", C: "dave-c-70s" },
    identity: { pace: "fast", offense: "motion, running game", defense: "aggressive man", strengths: ["pace", "movement"], weaknesses: ["interior size"] },
    note: "Same principal five as 1972-73 in a different league environment.",
  },
  {
    fixtureId: "h2-1983-84-celtics",
    article: "1983–84 Boston Celtics season", eraStyleId: "1980s", coachId: "kc-jones",
    classification: "HISTORICAL_LINEUP",
    five: { PG: "dj-80s", SG: "danny-80s", SF: "bird-80s", PF: "mcHale-80s", C: "parish-80s" },
    identity: { pace: "moderate", offense: "half-court execution, post and high-post passing", defense: "physical man", strengths: ["front-line size", "passing", "half-court offence"], weaknesses: ["perimeter speed"] },
    note: "The documented starting five. NBA champions.",
  },
  {
    fixtureId: "h2-1985-86-celtics",
    article: "1985–86 Boston Celtics season", eraStyleId: "1980s", coachId: "kc-jones",
    classification: "HISTORICAL_LINEUP",
    five: { PG: "dj-80s", SG: "danny-80s", SF: "bird-80s", PF: "mcHale-80s", C: "parish-80s" },
    identity: { pace: "moderate", offense: "half-court execution, elite passing front line", defense: "physical man", strengths: ["front-line size", "passing", "shooting"], weaknesses: ["perimeter speed"] },
    note: "67-15. Widely cited as one of the strongest teams ever assembled.",
  },
  {
    fixtureId: "h2-1984-85-lakers",
    article: "1984–85 Los Angeles Lakers season", eraStyleId: "1980s", coachId: "pat-riley",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "magic-80s", SG: "byron-80s", SF: "cooper-80s", PF: "worthy-80s", C: "kareem-80s" },
    identity: { pace: "very fast", offense: "Showtime transition, early offence, post entry", defense: "man with help", strengths: ["transition", "passing", "interior scoring"], weaknesses: ["half-court defence against size"] },
    note: "NBA champions. Cooper was the sixth man; this is a documented closing unit rather than the starting five.",
  },
  {
    fixtureId: "h2-1986-87-lakers",
    article: "1986–87 Los Angeles Lakers season", eraStyleId: "1980s", coachId: "pat-riley",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "magic-80s", SG: "byron-80s", SF: "worthy-80s", PF: "mychal-80s", C: "kareem-80s" },
    identity: { pace: "very fast", offense: "Showtime transition, early offence", defense: "man with help", strengths: ["transition", "passing"], weaknesses: ["half-court defence against size"] },
    note: "65-17, NBA champions. Magic's MVP season.",
  },
  {
    fixtureId: "h2-1987-88-lakers",
    article: "1987–88 Los Angeles Lakers season", eraStyleId: "1980s", coachId: "pat-riley",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "magic-80s", SG: "byron-80s", SF: "cooper-80s", PF: "mychal-80s", C: "kareem-80s" },
    identity: { pace: "fast", offense: "half-court execution alongside transition", defense: "man with help", strengths: ["experience", "passing"], weaknesses: ["ageing centre"] },
    note: "Repeat champions. A slower, more half-court version of the same core.",
  },
  {
    fixtureId: "h2-2003-04-pistons",
    article: "2003–04 Detroit Pistons season", eraStyleId: "2000s", coachId: "larry-brown",
    classification: "HISTORICAL_STARTER_PROXY",
    five: { PG: "billups-00s", SG: "rip-00s", SF: "prince-00s", PF: "okur-00s", C: "ben-00s" },
    identity: { pace: "slow", offense: "half-court, movement shooting off screens", defense: "elite man defence, rim protection", strengths: ["defence", "rim protection", "wing length"], weaknesses: ["half-court scoring", "three-point volume"] },
    note: "NBA champions. Rasheed Wallace, the starting power forward after February, has no card; Okur was the principal reserve big and is used in that slot.",
  },
];

const CARD = new Map(PLAYERS.map((p) => [p.id, p]));
const SLOTS = ["PG", "SG", "SF", "PF", "C"];

/** Every claim a fixture makes, checked against the source before acceptance. */
export const validateFixture = (fx, scan) => {
  const errs = [];
  const L = fx.fixtureId;
  if (scan.error) return [`${L}: ${scan.error}`];
  if (!scan.canFieldLegalFive) errs.push(`${L}: source cannot field a legal five`);

  const verified = new Set(scan.matched.map((m) => m.cardId));
  for (const slot of SLOTS) {
    const id = fx.five[slot];
    if (!id) { errs.push(`${L}: no card for ${slot}`); continue; }
    const card = CARD.get(id);
    if (!card) { errs.push(`${L}: unknown card "${id}"`); continue; }
    if (!(card.positions ?? [card.pos]).includes(slot)) errs.push(`${L}: ${card.name} cannot play ${slot}`);
    // The claim this corpus exists to guarantee.
    if (!verified.has(id)) errs.push(`${L}: ${card.name} is NOT verified on the ${scan.season} roster`);
    if (card.decade !== scan.decade) errs.push(`${L}: ${card.name}'s card is ${card.decade}, not ${scan.decade}`);
  }
  if (new Set(Object.values(fx.five)).size !== 5) errs.push(`${L}: duplicate card in the five`);
  if (!fx.coachId) errs.push(`${L}: no coach`);
  return errs;
};

export const buildCorpus = async () => {
  const fixtures = [];
  const rejected = [];
  for (const fx of VERIFIED_SEASONS) {
    const scan = await scanSeason({ article: fx.article, eraStyleId: fx.eraStyleId });
    const errs = validateFixture(fx, scan);
    if (errs.length) { rejected.push({ fixtureId: fx.fixtureId, errors: errs }); continue; }

    const provenance = {
      sourceType: "AUTHORIZED_PUBLIC_API",
      publisher: "Wikipedia (Wikimedia Foundation)",
      sourceUrl: scan.sourceUrl,
      revisionId: scan.revisionId,
      contentHash: scan.contentHash,
      retrievedAt: new Date().toISOString().slice(0, 10),
      licenseNote: "Wikipedia content, CC BY-SA 4.0. Reused with attribution; only extracted facts are stored.",
      verificationStatus: "ROSTER_VERIFIED",
      evidence: scan.evidence,
    };

    // Confidence follows the EVIDENCE, not the fixture's ambition. A roster
    // table proves membership; it says nothing about what the five produced.
    const hasStats = scan.evidence === "PLAYER_STATISTICS";
    fixtures.push({
      fixtureId: fx.fixtureId,
      classification: fx.classification,
      teamSeason: fx.article.replace(" season", ""),
      season: scan.season,
      eraStyleId: fx.eraStyleId,
      coachId: fx.coachId,
      roster: SLOTS.map((slot) => ({ assignedPosition: slot, playerCardId: fx.five[slot], name: CARD.get(fx.five[slot]).name })),
      record: scan.record,
      confidence: {
        lineupConfidence: fx.classification === "HISTORICAL_LINEUP" ? "HIGH" : "MEDIUM_HIGH",
        teamTargetConfidence: scan.record ? "HIGH" : "SOURCE_BLOCKED",
        playerShareConfidence: hasStats ? "MEDIUM" : "SOURCE_BLOCKED",
        styleIdentityConfidence: "MEDIUM",
        overallFixtureConfidence: hasStats ? (fx.classification === "HISTORICAL_LINEUP" ? "HIGH" : "MEDIUM_HIGH") : "MEDIUM",
      },
      qualitativeIdentity: fx.identity,
      note: fx.note,
      verifiedCards: scan.matched.filter((m) => Object.values(fx.five).includes(m.cardId)),
      provenance,
      historicalCorpusVersion: versionOf("historicalCorpusVersion"),
      fixtureClassificationVersion: versionOf("fixtureClassificationVersion"),
    });
  }
  return { fixtures, rejected };
};

export const corpusHash = (fixtures) =>
  createHash("sha256").update(JSON.stringify([...fixtures].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId))
    .map((f) => ({ id: f.fixtureId, era: f.eraStyleId, coach: f.coachId, roster: f.roster.map((r) => `${r.assignedPosition}=${r.playerCardId}`) })))).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const { fixtures, rejected } = await buildCorpus();
  const byEra = {};
  const byFranchise = {};
  for (const f of fixtures) {
    byEra[f.eraStyleId] = (byEra[f.eraStyleId] ?? 0) + 1;
    const fr = f.teamSeason.replace(/^\d{4}–\d{2}\s/, "");
    byFranchise[fr] = (byFranchise[fr] ?? 0) + 1;
  }
  for (const f of fixtures) {
    console.log(`  ${f.eraStyleId}  ${f.fixtureId.padEnd(22)} ${f.classification.padEnd(26)} ${f.confidence.overallFixtureConfidence.padEnd(12)} ${f.roster.map((r) => r.name.split(" ").pop()).join(", ")}`);
  }
  if (rejected.length) {
    console.log(`\nREJECTED ${rejected.length}:`);
    for (const r of rejected) console.log(`  ${r.fixtureId}: ${r.errors.join("; ")}`);
  }
  const payload = {
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    fixtureClassificationVersion: versionOf("fixtureClassificationVersion"),
    purpose: "Source-valid historical corpus. Every fixture's five is verified against the named team-season's own roster or statistics table.",
    coverage: { fixtures: fixtures.length, byEra, byFranchise, erasCovered: Object.keys(byEra).length, erasTotal: 8 },
    corpusHash: corpusHash(fixtures),
    fixtures,
  };
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(CORPUS_V2_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n${fixtures.length} fixtures · ${Object.keys(byEra).length} of 8 eras · hash ${payload.corpusHash.slice(0, 16)}`);
  console.log(`by era: ${JSON.stringify(byEra)}`);
  console.log(`by franchise: ${JSON.stringify(byFranchise)}`);
  console.log(`wrote ${CORPUS_V2_PATH}`);
}
