#!/usr/bin/env node
// ── V4 calibration-only player-season builder ───────────────────────────────
//   npm run validation:6c3r:players [-- --refresh]
//
// The v3 builder verbatim in method — player career table first, team-season
// statistics table second, roster membership last, nothing accepted on
// assertion — pointed at the V4 pool spec and writing to a NEW store, because
// every v3 data file is under the pre-calibration freeze and must stay
// byte-identical. The only reimplemented pieces are the team-alias table
// (the frozen v3 file cannot learn new franchises) and the coach-season check
// the v3 builder lacked.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, playerSeason, parsePlayerTable, parseRosterTable, PUBLISHER, LICENSE_NOTE } from "../calibration/adapters/wikipedia.mjs";
import { POOL_V4_SPEC, TEAM_ALIASES_V4 } from "../../data/validation/corpus-v4-spec.mjs";
import { namesMatch } from "../calibration/build-players-v3.mjs";
import {
  calibrationPlayerId, personSlug, validateCalibrationPlayer, notRecordedIn,
  normalisePct, CALIBRATION_PLAYER_SCHEMA_VERSION, CALIBRATION_PLAYER_DATA_VERSION,
} from "../../src/v3/calibration/calibrationPlayerSchema.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

export const PLAYERS_V4_PATH = "data/validation/6c3r/calibration-players-v4.json";
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const teamMatchesV4 = (teamId, sourceTeam) => {
  if (!sourceTeam) return false;
  const aliases = TEAM_ALIASES_V4[teamId] ?? [];
  const s = norm(String(sourceTeam).replace(/\s*\((NBA|ABA)\)\s*/gi, " "));
  return aliases.some((a) => norm(a) === s);
};

const publicLink = (name) => {
  const card = PLAYERS.find((c) => namesMatch(c.name, name));
  return card ? { publicPersonId: personIdForCard(card.id), publicCardId: card.id } : { publicPersonId: null, publicCardId: null };
};

const shootingProfileFrom = (row, seasonStartYear) => {
  const threeEra = notRecordedIn("threePointAttempts", seasonStartYear) ? "NONE" : "FULL";
  const tp = threeEra === "NONE" ? null : normalisePct(row.threePct);
  let perimeterSkill = "UNKNOWN";
  const meaningfulThree = tp != null && tp > 0.05 && tp < 0.65;
  if (meaningfulThree) perimeterSkill = tp >= 0.38 ? "ELITE" : tp >= 0.35 ? "GOOD" : tp >= 0.31 ? "AVERAGE" : "LIMITED";
  else if (row.ftPct != null) perimeterSkill = row.ftPct >= 0.85 ? "GOOD" : row.ftPct >= 0.75 ? "AVERAGE" : row.ftPct >= 0.65 ? "LIMITED" : "NONE";
  return { perimeterSkill,
    threeVolume: threeEra === "NONE" ? "NOT_APPLICABLE" : tp != null ? "MODERATE" : "UNKNOWN",
    threePointEra: threeEra,
    basis: tp != null ? "MEASURED_THREE_POINT_PCT" : row.ftPct != null ? "FREE_THROW_PROXY" : "SOURCE_BLOCKED" };
};

const resolveSeason = async ({ spec, player, refresh }) => {
  const art = await fetchArticle(player.article, { refresh });
  const found = playerSeason(art.html, spec.seasonStartYear);
  if (found) {
    const row = found.rows.find((r) => teamMatchesV4(spec.teamId, r.team));
    if (row) return { row, article: art, route: "PLAYER_CAREER_TABLE", confidence: "MEDIUM_HIGH" };
  }
  if (!spec.teamArticle) return { unresolved: `no ${spec.season} row for ${spec.teamName} and no team article` };
  const teamArt = await fetchArticle(spec.teamArticle, { refresh });

  // Some career tables carry the franchise in a row-spanning cell, so a season
  // row parses with team=null (Wilt Chamberlain's does). When the season has
  // exactly ONE row — no mid-season trade to mis-attribute — and the
  // team-season page's roster independently lists the player, the stats are his
  // own career row and membership is proven by the team page. Both facts are
  // sourced; only the join is ours, and the route says so.
  if (found && found.rows.length === 1 && found.rows[0].team == null) {
    const roster = parseRosterTable(teamArt.html);
    if (roster?.players.some((r) => namesMatch(r.name, player.name))) {
      return { row: found.rows[0], article: art, route: "PLAYER_CAREER_TABLE_TEAM_FROM_ROSTER", confidence: "MEDIUM" };
    }
  }
  const table = parsePlayerTable(teamArt.html);
  const roster = parseRosterTable(teamArt.html);
  const statRow = table?.players.find((r) => namesMatch(r.name, player.name));
  if (statRow) {
    return { row: { season: spec.season, seasonStartYear: spec.seasonStartYear, team: spec.teamName,
      gp: statRow.gp, gs: statRow.gs, mpg: statRow.mpg, fgPct: statRow.fgPct, threePct: statRow.threePct,
      ftPct: statRow.ftPct, rpg: statRow.rpg, apg: statRow.apg, ppg: statRow.ppg, spg: statRow.spg, bpg: statRow.bpg },
      article: teamArt, route: "TEAM_SEASON_STATISTICS", confidence: "MEDIUM_HIGH" };
  }
  const rosterRow = roster?.players.find((r) => namesMatch(r.name, player.name));
  if (rosterRow) {
    return { row: { season: spec.season, seasonStartYear: spec.seasonStartYear, team: spec.teamName,
      gp: null, gs: null, mpg: null, fgPct: null, threePct: null, ftPct: null, rpg: null, apg: null, ppg: null, spg: null, bpg: null },
      article: teamArt, route: "TEAM_SEASON_ROSTER_ONLY", confidence: "LOW" };
  }
  return { unresolved: `not found in the ${spec.season} ${spec.teamName} career table, statistics table or roster` };
};

/** The coach-season check the v3 builder lacked: the season page must name the coach. */
export const verifyCoach = async (spec, { refresh = false } = {}) => {
  const art = await fetchArticle(spec.teamArticle, { refresh });
  const text = norm(art.html.replace(/<[^>]+>/g, " "));
  const named = text.includes(norm(spec.coachName));
  return { coachId: spec.coachId, coachName: spec.coachName, named,
    verification: named ? "SEASON_PAGE_NAMES_COACH" : "COACH_NOT_FOUND_ON_SEASON_PAGE",
    sourceUrl: art.sourceUrl, revisionId: art.revisionId };
};

export const buildPlayerV4 = async ({ spec, player, refresh = false }) => {
  const resolved = await resolveSeason({ spec, player, refresh });
  if (resolved.unresolved) return { unresolved: { name: player.name, fixtureId: spec.fixtureId, reason: resolved.unresolved } };
  const { row, article: art, route } = resolved;
  const year = spec.seasonStartYear;
  const link = publicLink(player.name);
  const slug = personSlug(player.name);
  const profile = {
    calibrationPlayerId: calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: year, personSlug: slug }),
    calibrationPersonId: `cal-person:${slug}`,
    publicPersonId: link.publicPersonId, publicCardId: link.publicCardId,
    season: spec.season, seasonStartYear: year, teamId: spec.teamId, teamName: spec.teamName,
    league: "NBA", eraStyleId: spec.eraStyleId, name: player.name,
    primaryPosition: player.slot, secondaryPositions: [], lineupRole: player.role,
    minutesRole: row.mpg == null ? null : row.mpg >= 34 ? "HEAVY" : row.mpg >= 26 ? "STARTER" : row.mpg >= 16 ? "ROTATION" : "LIMITED",
    games: row.gp ?? null, starts: row.gs ?? null, minutesPerGame: row.mpg ?? null,
    basicStats: {
      pointsPerGame: row.ppg ?? null, fieldGoalAttempts: null, fieldGoalPct: normalisePct(row.fgPct),
      twoPointAttempts: null, twoPointPct: null, threePointAttempts: null,
      threePointPct: notRecordedIn("threePointPct", year) ? null : normalisePct(row.threePct),
      freeThrowAttempts: null, freeThrowPct: normalisePct(row.ftPct),
      offensiveRebounds: null, defensiveRebounds: null, rebounds: row.rpg ?? null,
      assists: row.apg ?? null,
      steals: notRecordedIn("steals", year) ? null : (row.spg ?? null),
      blocks: notRecordedIn("blocks", year) ? null : (row.bpg ?? null),
      turnovers: null, personalFouls: null,
    },
    rateStats: { usagePct: null, trueShootingPct: null, assistPct: null, turnoverPct: null, offensiveReboundPct: null, defensiveReboundPct: null },
    shootingProfile: shootingProfileFrom(row, year),
    offensiveRoles: [],
    defensiveEvidence: notRecordedIn("steals", year)
      ? { documentedRole: null, note: "Steals and blocks were not recorded in this season. A categorical band is derived; no exact value is created." }
      : null,
    physicalProfile: { heightIn: null, weightLb: null, wingspanIn: null, basis: "SOURCE_BLOCKED", confidence: "SOURCE_BLOCKED" },
    provenance: {
      sourceType: "AUTHORIZED_PUBLIC_API", publisher: PUBLISHER, sourceUrl: art.sourceUrl,
      revisionId: art.revisionId, contentHash: art.contentHash, retrievedAt: art.retrievedAt,
      licenseNote: LICENSE_NOTE, attribution: "Wikipedia contributors, CC BY-SA 4.0",
      verificationStatus: route, membershipRoute: route, sourceTeamLabel: row.team,
      derivation: "Per-season row from the player's own career table or the team-season statistics table; percentages normalised; unrecorded statistics preserved as null.",
    },
    confidence: resolved.confidence,
    publicEligibility: false,
    calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
    calibrationPlayerDataVersion: CALIBRATION_PLAYER_DATA_VERSION,
    calibrationPlayerStoreV4Version: VALIDATION_VERSIONS.calibrationPlayerStoreV4Version,
  };
  return { profile };
};

export const loadPlayersV4 = () => (existsSync(PLAYERS_V4_PATH) ? JSON.parse(readFileSync(PLAYERS_V4_PATH, "utf8")) : null);

if (import.meta.url === `file://${process.argv[1]}`) {
  const refresh = process.argv.includes("--refresh");
  const profiles = []; const unresolved = []; const coachChecks = []; const seen = new Set();
  for (const spec of POOL_V4_SPEC) {
    const coach = await verifyCoach(spec, { refresh });
    coachChecks.push({ fixtureId: spec.fixtureId, ...coach });
    for (const player of spec.five) {
      const key = `${spec.teamId}:${spec.seasonStartYear}:${personSlug(player.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const r = await buildPlayerV4({ spec, player, refresh });
        if (r.unresolved) { unresolved.push(r.unresolved); process.stdout.write("x"); continue; }
        const errs = validateCalibrationPlayer(r.profile);
        if (errs.length) { unresolved.push({ name: player.name, fixtureId: spec.fixtureId, reason: `schema: ${errs.join("; ")}` }); process.stdout.write("!"); continue; }
        profiles.push(r.profile);
        process.stdout.write(".");
      } catch (e) {
        unresolved.push({ name: player.name, fixtureId: spec.fixtureId, reason: e.message.slice(0, 140) });
        process.stdout.write("E");
      }
    }
  }
  const store = {
    calibrationPlayerStoreV4Version: VALIDATION_VERSIONS.calibrationPlayerStoreV4Version,
    calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
    profileCount: profiles.length, unresolvedCount: unresolved.length,
    coachChecks, profiles, unresolved,
    storeHash: createHash("sha256").update(JSON.stringify(profiles.map((p) => [p.calibrationPlayerId, p.basicStats.pointsPerGame, p.games]))).digest("hex"),
  };
  mkdirSync("data/validation/6c3r", { recursive: true });
  writeFileSync(PLAYERS_V4_PATH, `${JSON.stringify(store, null, 2)}\n`);
  console.log(`\n\nprofiles ${profiles.length} · unresolved ${unresolved.length} · coach pages naming coach ${coachChecks.filter((c) => c.named).length}/${coachChecks.length}`);
  for (const u of unresolved) console.log(`  UNRESOLVED  ${u.fixtureId}  ${u.name}: ${u.reason}`);
  for (const c of coachChecks.filter((x) => !x.named)) console.log(`  COACH?      ${c.fixtureId}  ${c.coachName}: not named on season page`);
  console.log(`wrote ${PLAYERS_V4_PATH}`);
}
