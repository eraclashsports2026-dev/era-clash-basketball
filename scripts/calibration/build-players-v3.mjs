#!/usr/bin/env node
// ── Calibration-only player-season builder ──────────────────────────────────
// Fetches each fixture player's own article, reads THAT SEASON's row from the
// career table, verifies the team matches, and emits a calibration profile.
//
// Nothing is accepted on assertion. If a player's season row does not exist, or
// exists for a different team, the player is UNRESOLVED and the fixture that
// needs him fails. That is the point: a corpus whose members are asserted
// rather than verified is not evidence.
//
//   npm run calibration:players:build
//   npm run calibration:players:verify
//   npm run calibration:players:coverage
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, playerSeason, parsePlayerTable, parseRosterTable, PUBLISHER, LICENSE_NOTE } from "./adapters/wikipedia.mjs";
import { CORPUS_V3_SPEC, TEAM_ALIASES } from "../../data/calibration/corpus-v3-spec.mjs";
import {
  calibrationPlayerId, personSlug, validateCalibrationPlayer, notRecordedIn,
  normalisePct, CALIBRATION_PLAYER_SCHEMA_VERSION, CALIBRATION_PLAYER_DATA_VERSION,
} from "../../src/v3/calibration/calibrationPlayerSchema.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";

export const PLAYERS_V3_PATH = "data/calibration/calibration-players-v3.json";

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

/** Exact name or documented alias only. No fuzzy fallback, ever. */
const NAME_ALIASES = Object.freeze({
  "kareem abdul jabbar": ["lew alcindor"],
  "metta world peace": ["ron artest"],
  "nate archibald": ["tiny archibald"],
});

export const namesMatch = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  for (const [k, alts] of Object.entries(NAME_ALIASES)) {
    if ((x === k && alts.includes(y)) || (y === k && alts.includes(x))) return true;
  }
  return false;
};

export const teamMatches = (teamId, sourceTeam) => {
  if (!sourceTeam) return false;
  const aliases = TEAM_ALIASES[teamId] ?? [];
  // Career tables qualify a label when a player appeared in two leagues:
  // Julius Erving's 1982-83 row reads "Philadelphia (NBA)". The qualifier is
  // information about the league, not about the franchise.
  const s = norm(String(sourceTeam).replace(/\s*\((NBA|ABA)\)\s*/gi, " "));
  return aliases.some((a) => norm(a) === s);
};

/** The public person this calibration player corresponds to, if any. */
const publicLink = (name) => {
  const card = PLAYERS.find((c) => namesMatch(c.name, name));
  return card ? { publicPersonId: personIdForCard(card.id), publicCardId: card.id } : { publicPersonId: null, publicCardId: null };
};

/** Season shooting identity, graded from what the source actually shows. */
const shootingProfileFrom = (row, seasonStartYear) => {
  const threeEra = notRecordedIn("threePointAttempts", seasonStartYear) ? "NONE" : "FULL";
  const tp = threeEra === "NONE" ? null : normalisePct(row.threePct);
  // Categorical, from measured percentage where one exists. UNKNOWN where the
  // source gives nothing — never a guess dressed as a judgement.
  let perimeterSkill = "UNKNOWN";
  // An extreme percentage is uninformative without volume, and the career
  // table carries no attempt counts. Andrew Bogut shot 1.000 from three in
  // 2015-16 on one attempt; reading that as ELITE would be the Mark Eaton
  // problem in reverse. Extremes fall through to the free-throw proxy.
  const meaningfulThree = tp != null && tp > 0.05 && tp < 0.65;
  if (meaningfulThree) perimeterSkill = tp >= 0.38 ? "ELITE" : tp >= 0.35 ? "GOOD" : tp >= 0.31 ? "AVERAGE" : "LIMITED";
  else if (row.ftPct != null) perimeterSkill = row.ftPct >= 0.85 ? "GOOD" : row.ftPct >= 0.75 ? "AVERAGE" : row.ftPct >= 0.65 ? "LIMITED" : "NONE";
  return {
    perimeterSkill,
    threeVolume: threeEra === "NONE" ? "NOT_APPLICABLE" : tp != null ? "MODERATE" : "UNKNOWN",
    threePointEra: threeEra,
    basis: tp != null ? "MEASURED_THREE_POINT_PCT" : row.ftPct != null ? "FREE_THROW_PROXY" : "SOURCE_BLOCKED",
  };
};

/**
 * Membership and season line, from whichever authorized route can supply them.
 *
 * Route 1 — the player's own career table. Preferred: it carries the season's
 * statistics as well as the team.
 *
 * Route 2 — the team-season article. Needed because some player articles carry
 * no career table at all (Luc Longley's has only navboxes), and because a
 * mid-season trade shows only the ORIGIN team on the player's page — Rasheed
 * Wallace's 2003-04 row reads Portland, though he finished the season in
 * Detroit and won a title there.
 *
 * Route 2 proves membership. Whether it also supplies statistics depends on
 * whether that article has a statistics table, and confidence follows.
 */
const resolveSeason = async ({ spec, player, refresh }) => {
  const art = await fetchArticle(player.article, { refresh });
  const found = playerSeason(art.html, spec.seasonStartYear);
  if (found) {
    const row = found.rows.find((r) => teamMatches(spec.teamId, r.team));
    if (row) return { row, article: art, route: "PLAYER_CAREER_TABLE", confidence: "MEDIUM_HIGH" };
  }

  // Route 2.
  if (!spec.teamArticle) {
    return { unresolved: `no ${spec.season} row for ${spec.teamName} in the career table, and no team-season article to fall back to` };
  }
  const teamArt = await fetchArticle(spec.teamArticle, { refresh });
  const table = parsePlayerTable(teamArt.html);
  const roster = parseRosterTable(teamArt.html);

  const statRow = table?.players.find((r) => namesMatch(r.name, player.name));
  if (statRow) {
    return {
      row: { season: spec.season, seasonStartYear: spec.seasonStartYear, team: spec.teamName,
             gp: statRow.gp, gs: statRow.gs, mpg: statRow.mpg, fgPct: statRow.fgPct,
             threePct: statRow.threePct, ftPct: statRow.ftPct,
             rpg: statRow.rpg, apg: statRow.apg, ppg: statRow.ppg, spg: statRow.spg, bpg: statRow.bpg },
      article: teamArt, route: "TEAM_SEASON_STATISTICS", confidence: "MEDIUM_HIGH",
    };
  }

  const rosterRow = roster?.players.find((r) => namesMatch(r.name, player.name));
  if (rosterRow) {
    // Membership only. Every statistic stays null rather than being borrowed
    // from an adjacent season, which would silently describe a different year.
    return {
      row: { season: spec.season, seasonStartYear: spec.seasonStartYear, team: spec.teamName,
             gp: null, gs: null, mpg: null, fgPct: null, threePct: null, ftPct: null,
             rpg: null, apg: null, ppg: null, spg: null, bpg: null },
      article: teamArt, route: "TEAM_SEASON_ROSTER_ONLY", confidence: "LOW",
    };
  }
  return { unresolved: `not found in the ${spec.season} ${spec.teamName} career table, statistics table or roster` };
};

export const buildPlayer = async ({ spec, player, refresh = false }) => {
  const resolved = await resolveSeason({ spec, player, refresh });
  if (resolved.unresolved) {
    return { unresolved: { name: player.name, fixtureId: spec.fixtureId, reason: resolved.unresolved } };
  }
  const { row, article: art, route } = resolved;

  const year = spec.seasonStartYear;
  const link = publicLink(player.name);
  const slug = personSlug(player.name);
  const id = calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: year, personSlug: slug });

  const profile = {
    calibrationPlayerId: id,
    calibrationPersonId: `cal-person:${slug}`,
    publicPersonId: link.publicPersonId,
    publicCardId: link.publicCardId,
    season: spec.season,
    seasonStartYear: year,
    teamId: spec.teamId,
    teamName: spec.teamName,
    league: "NBA",
    eraStyleId: spec.eraStyleId,
    name: player.name,
    primaryPosition: player.slot,
    secondaryPositions: [],
    lineupRole: player.role,
    minutesRole: row.mpg == null ? null : row.mpg >= 34 ? "HEAVY" : row.mpg >= 26 ? "STARTER" : row.mpg >= 16 ? "ROTATION" : "LIMITED",
    games: row.gp ?? null,
    starts: row.gs ?? null,
    minutesPerGame: row.mpg ?? null,
    basicStats: {
      pointsPerGame: row.ppg ?? null,
      fieldGoalAttempts: null,
      fieldGoalPct: normalisePct(row.fgPct),
      twoPointAttempts: null,
      twoPointPct: null,
      // A statistic that did not exist stays null. Zero would mean "he never
      // made one", which is a different and false claim.
      threePointAttempts: null,
      threePointPct: notRecordedIn("threePointPct", year) ? null : normalisePct(row.threePct),
      freeThrowAttempts: null,
      freeThrowPct: normalisePct(row.ftPct),
      offensiveRebounds: null,
      defensiveRebounds: null,
      rebounds: row.rpg ?? null,
      assists: row.apg ?? null,
      steals: notRecordedIn("steals", year) ? null : (row.spg ?? null),
      blocks: notRecordedIn("blocks", year) ? null : (row.bpg ?? null),
      turnovers: null,
      personalFouls: null,
    },
    rateStats: {
      usagePct: null, trueShootingPct: null, assistPct: null,
      turnoverPct: null, offensiveReboundPct: null, defensiveReboundPct: null,
    },
    shootingProfile: shootingProfileFrom(row, year),
    offensiveRoles: [],
    defensiveEvidence: notRecordedIn("steals", year)
      ? { documentedRole: null, note: "Steals and blocks were not recorded in this season. A categorical band is derived; no exact value is created." }
      : null,
    physicalProfile: { heightIn: null, weightLb: null, wingspanIn: null, basis: "SOURCE_BLOCKED", confidence: "SOURCE_BLOCKED" },
    provenance: {
      sourceType: "AUTHORIZED_PUBLIC_API",
      publisher: PUBLISHER,
      sourceUrl: art.sourceUrl,
      revisionId: art.revisionId,
      contentHash: art.contentHash,
      retrievedAt: art.retrievedAt,
      licenseNote: LICENSE_NOTE,
      attribution: "Wikipedia contributors, CC BY-SA 4.0",
      verificationStatus: route,
      membershipRoute: route,
      sourceTeamLabel: row.team,
      derivation: "Per-season row from the player's own career table; percentages normalised; unrecorded statistics preserved as null.",
    },
    confidence: resolved.confidence,
    publicEligibility: false,
    calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
    calibrationPlayerDataVersion: CALIBRATION_PLAYER_DATA_VERSION,
  };
  return { profile };
};

export const buildAll = async ({ refresh = false } = {}) => {
  const profiles = [];
  const unresolved = [];
  const seen = new Set();
  for (const spec of CORPUS_V3_SPEC) {
    for (const player of spec.five) {
      const key = `${spec.teamId}:${spec.seasonStartYear}:${personSlug(player.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const r = await buildPlayer({ spec, player, refresh });
        if (r.unresolved) { unresolved.push(r.unresolved); continue; }
        profiles.push(r.profile);
      } catch (e) {
        unresolved.push({ name: player.name, fixtureId: spec.fixtureId, reason: e.message.slice(0, 120) });
      }
    }
  }
  return { profiles, unresolved };
};

export const loadPlayers = () => (existsSync(PLAYERS_V3_PATH) ? JSON.parse(readFileSync(PLAYERS_V3_PATH, "utf8")) : null);

export const playersHash = (profiles) =>
  createHash("sha256").update(JSON.stringify([...profiles].sort((a, b) => a.calibrationPlayerId.localeCompare(b.calibrationPlayerId))
    .map((p) => [p.calibrationPlayerId, p.basicStats.pointsPerGame, p.games]))).digest("hex");

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "build";
  if (cmd === "build") {
    const { profiles, unresolved } = await buildAll({ refresh: process.argv.includes("--refresh") });
    const errs = profiles.flatMap((p) => validateCalibrationPlayer(p));
    if (errs.length) {
      console.error(`REJECTED — ${errs.length} schema error(s):`);
      for (const e of errs.slice(0, 20)) console.error(`  ${e}`);
      process.exit(1);
    }
    const payload = {
      calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
      calibrationPlayerDataVersion: CALIBRATION_PLAYER_DATA_VERSION,
      purpose: "Calibration-only player-season profiles. NEVER eligible for the public product: not the roster builder, search, Random Team, Daily, challenges, leaderboards, profiles or any public API.",
      profileCount: profiles.length,
      unresolvedCount: unresolved.length,
      playersHash: playersHash(profiles),
      profiles, unresolved,
    };
    mkdirSync("data/calibration", { recursive: true });
    writeFileSync(PLAYERS_V3_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(`wrote ${PLAYERS_V3_PATH} — ${profiles.length} profiles, ${unresolved.length} unresolved, hash ${payload.playersHash.slice(0, 16)}`);
    if (unresolved.length) {
      console.log(`\nUNRESOLVED (these are refused, never guessed at):`);
      for (const u of unresolved) console.log(`  ${u.fixtureId.padEnd(24)} ${u.name.padEnd(22)} ${u.reason}`);
    }
  } else if (cmd === "verify") {
    const store = loadPlayers();
    if (!store) { console.error("no calibration player store"); process.exit(1); }
    const errs = store.profiles.flatMap((p) => validateCalibrationPlayer(p));
    console.log(`${store.profiles.length} profiles · schema ${store.calibrationPlayerSchemaVersion} · data ${store.calibrationPlayerDataVersion} · hash ${store.playersHash.slice(0, 16)}`);
    if (errs.length) { console.error(`\n${errs.length} error(s):`); for (const e of errs.slice(0, 20)) console.error(`  ${e}`); process.exit(1); }
    console.log("✓ every profile carries provenance; no unrecorded statistic became zero; none is publicly eligible");
  } else if (cmd === "coverage") {
    const store = loadPlayers();
    const byEra = {};
    const byPos = {};
    const byConf = {};
    let linked = 0;
    for (const p of store.profiles) {
      byEra[p.eraStyleId] = (byEra[p.eraStyleId] ?? 0) + 1;
      byPos[p.primaryPosition] = (byPos[p.primaryPosition] ?? 0) + 1;
      byConf[p.confidence] = (byConf[p.confidence] ?? 0) + 1;
      if (p.publicPersonId) linked++;
    }
    console.log(`CALIBRATION PLAYER COVERAGE — ${store.profiles.length} profiles\n`);
    console.log(`  distinct people          ${new Set(store.profiles.map((p) => p.calibrationPersonId)).size}`);
    console.log(`  linked to a public person ${linked}`);
    console.log(`  internal-only people      ${store.profiles.length - linked} profiles with no public counterpart`);
    console.log(`  by era                    ${JSON.stringify(byEra)}`);
    console.log(`  by position               ${JSON.stringify(byPos)}`);
    console.log(`  by confidence             ${JSON.stringify(byConf)}`);
    console.log(`  unresolved                ${store.unresolvedCount}`);
  }
}
