#!/usr/bin/env node
// ── WS4: ingest the seven gap team-seasons ──────────────────────────────────
//   npm run v6:players
//
// Reuses the certified V4 adapter path unchanged — same fetch, same career-table
// parse, same schema validation, same provenance. Only the spec differs, so a
// V6 profile is built exactly the way a V4 profile was. Nothing is fabricated:
// a player-season that will not resolve from its own career table is recorded
// as unresolved and the team-season is then not eligible.
//
// The alias table is passed explicitly. The first run of this script defined
// TEAM_ALIASES_V6 but never handed it to the adapter, which read TEAM_ALIASES_V4
// directly; DEN and ORL therefore matched nothing and Denver 1984-85 resolved
// five profiles with null stats off the roster path alone.
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { buildPlayerV4, verifyCoach } from "../validation/buildPlayersV4.mjs";
import { POOL_V6_SPEC, POOL_V6_EXPANSION, POOL_V6_WAVE3, TEAM_ALIASES_V6,
  V6_SPEC_RATIONALE } from "../../data/validation/corpus-v6-spec.mjs";

/**
 * Both waves. Wave one closed the era gaps; the frozen near-overlap rule then
 * excluded five of its seven as adjacent-season proxies for consumed rosters.
 * Wave two was pre-screened against every consumed lineup first. Wave one is
 * kept and still ingested — its rows belong in the audit as excluded, with the
 * reason recorded, rather than deleted so the rule appears never to have fired.
 */
export const V6_SPEC_ALL = Object.freeze([...POOL_V6_SPEC, ...POOL_V6_EXPANSION, ...POOL_V6_WAVE3]);
import { validateCalibrationPlayer, personSlug, CALIBRATION_PLAYER_SCHEMA_VERSION,
  CALIBRATION_PLAYER_DATA_VERSION } from "../../src/v3/calibration/calibrationPlayerSchema.js";

export const PLAYERS_V6_PATH = "data/validation/6c4c2/calibration-players-v6.json";
export const loadPlayersV6 = () => (existsSync(PLAYERS_V6_PATH) ? JSON.parse(readFileSync(PLAYERS_V6_PATH, "utf8")) : null);

if (import.meta.url === `file://${process.argv[1]}`) {
  const refresh = process.argv.includes("--refresh");
  const profiles = []; const unresolved = []; const coachChecks = []; const seen = new Set();
  for (const spec of V6_SPEC_ALL) {
    const coach = await verifyCoach(spec, { refresh });
    coachChecks.push({ fixtureId: spec.fixtureId, ...coach });
    process.stdout.write(`\n  ${spec.fixtureId.padEnd(24)} coach ${coach.named ? "named" : "NOT NAMED"}  `);
    for (const player of spec.five) {
      const key = `${spec.teamId}:${spec.seasonStartYear}:${personSlug(player.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const r = await buildPlayerV4({ spec, player, refresh, aliasTable: TEAM_ALIASES_V6 });
        if (r.unresolved) { unresolved.push(r.unresolved); process.stdout.write("x"); continue; }
        const errs = validateCalibrationPlayer(r.profile);
        if (errs.length) { unresolved.push({ name: player.name, fixtureId: spec.fixtureId, reason: `schema: ${errs.join("; ")}` }); process.stdout.write("!"); continue; }
        profiles.push(r.profile);
        process.stdout.write(".");
      } catch (e) {
        unresolved.push({ name: player.name, fixtureId: spec.fixtureId, reason: e.message.slice(0, 160) });
        process.stdout.write("E");
      }
    }
  }
  const byFixture = Object.fromEntries(V6_SPEC_ALL.map((s) => [s.fixtureId,
    profiles.filter((p) => p.teamId === s.teamId && p.seasonStartYear === s.seasonStartYear).length]));
  const store = {
    calibrationPlayerStoreV6Version: "1.0.0",
    calibrationPlayerSchemaVersion: CALIBRATION_PLAYER_SCHEMA_VERSION,
    calibrationPlayerDataVersion: CALIBRATION_PLAYER_DATA_VERSION,
    purpose: "the seven team-seasons that close the measured Historical V6 pool gap. Built with the certified V4 adapter path unchanged.",
    rationale: V6_SPEC_RATIONALE,
    specFixtures: V6_SPEC_ALL.length,
    profileCount: profiles.length, unresolvedCount: unresolved.length,
    profilesPerFixture: byFixture,
    fixturesWithFiveProfiles: Object.values(byFixture).filter((n) => n === 5).length,
    coachChecks, profiles, unresolved,
    noFabrication: "every value came from the player's own per-season career table or the team-season statistics table. Statistics not recorded in a season stay null; none is filled with zero.",
  };
  store.storeHash = createHash("sha256").update(JSON.stringify(profiles.map((p) => [p.calibrationPlayerId, p.basicStats.pointsPerGame, p.games]))).digest("hex");
  mkdirSync("data/validation/6c4c2", { recursive: true });
  writeFileSync(PLAYERS_V6_PATH, `${JSON.stringify(store, null, 2)}\n`);
  console.log(`\n\nprofiles ${profiles.length}/${V6_SPEC_ALL.length * 5} · unresolved ${unresolved.length}`);
  console.log(`fixtures with a complete five: ${store.fixturesWithFiveProfiles}/${V6_SPEC_ALL.length}`);
  console.log(`coach pages naming the coach: ${coachChecks.filter((c) => c.named).length}/${coachChecks.length}`);
  for (const u of unresolved) console.log(`  UNRESOLVED  ${u.fixtureId}  ${u.name}: ${u.reason}`);
  for (const c of coachChecks.filter((x) => !x.named)) console.log(`  COACH?      ${c.fixtureId}  ${c.coachName}: not named on the season page`);
  console.log(`\nwrote ${PLAYERS_V6_PATH}  storeHash ${store.storeHash.slice(0, 16)}...`);
}
