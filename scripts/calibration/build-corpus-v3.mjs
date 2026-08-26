#!/usr/bin/env node
// ── Historical corpus v3 ────────────────────────────────────────────────────
// 32 source-valid fixtures, four per Era Style, built from verified
// calibration-only player-season profiles.
//
//   npm run calibration:build-corpus-v3
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { CORPUS_V3_SPEC } from "../../data/calibration/corpus-v3-spec.mjs";
import { loadPlayers } from "./build-players-v3.mjs";
import { calibrationPlayerId, personSlug, SLOTS } from "../../src/v3/calibration/calibrationPlayerSchema.js";
import COACHES from "../../src/v3/data/coaches.js";
import { versionOf } from "../../src/versions.js";

export const CORPUS_V3_PATH = "data/calibration/historical-corpus-v3.json";

const COACH_IDS = new Set((COACHES.coaches ?? COACHES).map((c) => c.id));

/** Every claim a fixture makes, checked before it is accepted. */
export const validateFixture = (spec, byId) => {
  const errs = [];
  const L = spec.fixtureId;
  if (!COACH_IDS.has(spec.coachId)) errs.push(`${L}: coach "${spec.coachId}" is not in the pool`);
  if (spec.five.length !== 5) errs.push(`${L}: needs exactly five players`);
  if (spec.five.map((p) => p.slot).join(",") !== SLOTS.join(",")) errs.push(`${L}: slots must be PG,SG,SF,PF,C in order`);

  const people = new Set();
  for (const p of spec.five) {
    const id = calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: spec.seasonStartYear, personSlug: personSlug(p.name) });
    const prof = byId.get(id);
    if (!prof) { errs.push(`${L}: ${p.name} has no verified calibration profile`); continue; }
    if (prof.teamId !== spec.teamId) errs.push(`${L}: ${p.name} belongs to ${prof.teamId}`);
    if (prof.seasonStartYear !== spec.seasonStartYear) errs.push(`${L}: ${p.name} is from a different season`);
    if (prof.primaryPosition !== p.slot) errs.push(`${L}: ${p.name} is assigned ${p.slot} but profiled at ${prof.primaryPosition}`);
    // The same person twice would be a lineup that never existed.
    if (people.has(prof.calibrationPersonId)) errs.push(`${L}: ${p.name} appears twice`);
    people.add(prof.calibrationPersonId);
  }
  return errs;
};

export const buildCorpus = () => {
  const store = loadPlayers();
  if (!store) throw new Error("calibration player store not built");
  const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));

  const fixtures = [];
  const rejected = [];
  for (const spec of CORPUS_V3_SPEC) {
    const errs = validateFixture(spec, byId);
    if (errs.length) { rejected.push({ fixtureId: spec.fixtureId, errors: errs }); continue; }

    const players = spec.five.map((p) => {
      const id = calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: spec.seasonStartYear, personSlug: personSlug(p.name) });
      const prof = byId.get(id);
      return {
        calibrationPlayerId: id,
        name: prof.name,
        assignedPosition: p.slot,
        historicalRole: p.role,
        membershipSource: prof.provenance.membershipRoute,
        confidence: prof.confidence,
      };
    });

    // Fixture confidence is the WEAKEST of its members. A five is only as
    // verified as its least-verified player.
    const RANK = { HIGH: 4, MEDIUM_HIGH: 3, MEDIUM: 2, LOW: 1, SOURCE_BLOCKED: 0 };
    const weakest = players.reduce((a, p) => (RANK[p.confidence] < RANK[a] ? p.confidence : a), "HIGH");

    fixtures.push({
      fixtureId: spec.fixtureId,
      teamId: spec.teamId,
      teamName: spec.teamName,
      season: spec.season,
      seasonStartYear: spec.seasonStartYear,
      coachId: spec.coachId,
      eraStyleId: spec.eraStyleId,
      fixtureType: spec.fixtureType,
      lineupBasis: spec.fixtureType === "HISTORICAL_LINEUP" ? "DOCUMENTED_STARTING_FIVE"
        : spec.fixtureType === "HISTORICAL_STARTER_PROXY" ? "DOCUMENTED_STARTING_OR_CLOSING_FIVE"
        : "SOURCE_BACKED_PRINCIPAL_FIVE",
      players,
      qualitativeIdentity: spec.identity,
      teamArticle: spec.teamArticle,
      confidence: {
        lineupConfidence: spec.fixtureType === "HISTORICAL_LINEUP" ? "HIGH" : "MEDIUM_HIGH",
        playerDataConfidence: weakest,
        styleIdentityConfidence: "MEDIUM",
        overallFixtureConfidence: weakest === "LOW" ? "MEDIUM" : weakest,
      },
      historicalCorpusVersion: versionOf("historicalCorpusVersion"),
      calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
      historicalTargetDataVersion: versionOf("historicalTargetDataVersion"),
    });
  }
  return { fixtures, rejected };
};

export const loadCorpusV3 = () => (existsSync(CORPUS_V3_PATH) ? JSON.parse(readFileSync(CORPUS_V3_PATH, "utf8")) : null);

export const corpusHash = (fixtures) =>
  createHash("sha256").update(JSON.stringify([...fixtures].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId))
    .map((f) => ({ id: f.fixtureId, era: f.eraStyleId, coach: f.coachId, five: f.players.map((p) => p.calibrationPlayerId) })))).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const { fixtures, rejected } = buildCorpus();
  const byEra = {};
  const franchisesByEra = {};
  const byType = {};
  const tags = {};
  for (const f of fixtures) {
    byEra[f.eraStyleId] = (byEra[f.eraStyleId] ?? 0) + 1;
    (franchisesByEra[f.eraStyleId] = franchisesByEra[f.eraStyleId] ?? new Set()).add(f.teamId);
    byType[f.fixtureType] = (byType[f.fixtureType] ?? 0) + 1;
    for (const t of f.qualitativeIdentity.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
  }
  for (const f of fixtures) {
    console.log(`  ${f.eraStyleId}  ${f.fixtureId.padEnd(22)} ${f.coachId.padEnd(18)} ${f.fixtureType.padEnd(34)} ${f.confidence.overallFixtureConfidence.padEnd(12)} ${f.players.map((p) => p.name.split(" ").pop()).join(", ").slice(0, 52)}`);
  }
  if (rejected.length) {
    console.log(`\nREJECTED ${rejected.length}:`);
    for (const r of rejected) console.log(`  ${r.fixtureId}: ${r.errors.join("; ")}`);
  }
  const payload = {
    historicalCorpusVersion: versionOf("historicalCorpusVersion"),
    calibrationPlayerDataVersion: versionOf("calibrationPlayerDataVersion"),
    purpose: "Source-valid historical corpus. Every player is verified against that team-season's own record through an authorized source, and every coach coached that season.",
    coverage: {
      fixtures: fixtures.length,
      byEra,
      franchisesByEra: Object.fromEntries(Object.entries(franchisesByEra).map(([k, v]) => [k, [...v]])),
      byFixtureType: byType,
      styleTags: tags,
    },
    corpusHash: corpusHash(fixtures),
    fixtures,
  };
  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(CORPUS_V3_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n${fixtures.length} fixtures · ${Object.keys(byEra).length} eras · hash ${payload.corpusHash.slice(0, 16)}`);
  console.log(`by era: ${JSON.stringify(byEra)}`);
  console.log(`franchises per era: ${JSON.stringify(Object.fromEntries(Object.entries(franchisesByEra).map(([k, v]) => [k, v.size])))}`);
  console.log(`fixture types: ${JSON.stringify(byType)}`);
  console.log(`style tags covered: ${Object.keys(tags).length}`);
}
