#!/usr/bin/env node
// ── Phase 6C4A WS5: shooting backfill for null-fg% profiles ─────────────────
//   npm run c1:backfill-shooting
//
// Seven profiles (3 in the V4 store, 4 in the v3 store) carry null shooting
// percentages because their membership route was a team-season page whose
// statistics table had no FG% column. Root-caused consequence: shotSelection
// falls to the population default while every complete-data player is
// measured, so ONE fixture (1977-78 Spurs, three null profiles) reads as a
// below-median offence while documented ELITE_OFFENSE.
//
// The backfill reads each player's OWN career table through the existing
// authorized pipeline (Wikipedia, CC BY-SA 4.0, extracted numeric facts only),
// verifies the season row's team against the profile, fills ONLY null
// shooting fields, and records the supplemental source. Values already
// present are never overwritten. Percentages only — volume fields the source
// does not carry stay null.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, playerSeason } from "../calibration/adapters/wikipedia.mjs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR } from "./failureRegister.mjs";

// Exact article titles (disambiguated where 6C3R resolution established it).
const TARGETS = [
  { store: "v4", id: "cal:SAS:1977:mike-gale", article: "Mike Gale", teamLabel: /San Antonio/i },
  { store: "v4", id: "cal:SAS:1977:mark-olberding", article: "Mark Olberding", teamLabel: /San Antonio/i },
  { store: "v4", id: "cal:SAS:1977:billy-paultz", article: "Billy Paultz", teamLabel: /San Antonio/i },
  { store: "v3", id: "cal:BOS:1962:sam-jones", article: "Sam Jones (basketball, born 1933)", teamLabel: /Boston/i },
  { store: "v3", id: "cal:BOS:1964:sam-jones", article: "Sam Jones (basketball, born 1933)", teamLabel: /Boston/i },
  { store: "v3", id: "cal:POR:1976:dave-twardzik", article: "Dave Twardzik", teamLabel: /Portland/i },
  { store: "v3", id: "cal:POR:1976:maurice-lucas", article: "Maurice Lucas", teamLabel: /Portland/i },
];
const STORE_PATHS = { v4: "data/validation/6c3r/calibration-players-v4.json", v3: "data/calibration/calibration-players-v3.json" };

if (import.meta.url === `file://${process.argv[1]}`) {
  const stores = Object.fromEntries(Object.entries(STORE_PATHS).map(([k, p]) => [k, JSON.parse(readFileSync(p, "utf8"))]));
  const results = [];
  for (const t of TARGETS) {
    const profile = stores[t.store].profiles.find((p) => p.calibrationPlayerId === t.id);
    if (!profile) throw new Error(`${t.id} not in ${t.store} store`);
    const art = await fetchArticle(t.article);
    const season = playerSeason(art.html, profile.seasonStartYear);
    if (!season) {
      // The article has no parseable career table. The nulls are a recorded
      // limitation of the authorized source, never estimated around.
      results.push({ id: t.id, name: profile.name, season: profile.season, article: t.article,
        outcome: "SOURCE_LACKS_CAREER_TABLE", filled: [] });
      console.log(`${profile.name.padEnd(18)} ${profile.season} <- SOURCE_LACKS_CAREER_TABLE (${t.article})`);
      continue;
    }
    const row = season.rows.find((r) => t.teamLabel.test(r.team ?? "")) ?? null;
    if (!row) throw new Error(`${t.article}: no ${profile.seasonStartYear} row for ${t.teamLabel}`);
    const filled = [];
    const fill = (field, value) => {
      if (value == null || profile.basicStats[field] != null) return;
      profile.basicStats[field] = value; filled.push({ field, value });
    };
    fill("fieldGoalPct", row.fgPct);
    fill("freeThrowPct", row.ftPct);
    if (profile.seasonStartYear >= 1979) fill("threePointPct", row.threePct);
    profile.provenance.shootingBackfill = {
      sourceUrl: art.sourceUrl, revisionId: art.revisionId, contentHash: art.contentHash,
      retrievedAt: art.retrievedAt, route: "PLAYER_CAREER_TABLE_SUPPLEMENT",
      teamVerified: row.team, fieldsFilled: filled.map((f) => f.field),
      note: "Null shooting percentages filled from the player's own career table; recorded values never overwritten.",
    };
    results.push({ id: t.id, name: profile.name, season: profile.season, article: t.article,
      outcome: "FILLED", teamVerified: row.team, filled, revisionId: art.revisionId });
    console.log(`${profile.name.padEnd(18)} ${profile.season} <- ${filled.map((f) => `${f.field}=${f.value}`).join(", ") || "nothing to fill"} (${row.team})`);
  }
  for (const [k, p] of Object.entries(STORE_PATHS)) {
    stores[k].shootingBackfillVersion = "1.0.0";
    writeFileSync(p, `${JSON.stringify(stores[k], null, 2)}\n`);
  }
  writeArtifact("calibration-shooting-backfill", {
    shootingBackfillVersion: "1.0.0",
    profilesBackfilled: results.filter((r) => r.outcome === "FILLED").length,
    sourceLacksCareerTable: results.filter((r) => r.outcome === "SOURCE_LACKS_CAREER_TABLE").length,
    results,
    discipline: "only null fields filled; team-verified season rows; existing values never overwritten; volume fields stay null when unrecorded",
  }, { generationCommand: "npm run c1:backfill-shooting", dir: DIR,
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash } });
  console.log(`\nfilled ${results.filter((r) => r.outcome === "FILLED").length} · source lacks table ${results.filter((r) => r.outcome !== "FILLED").length}`);
}
