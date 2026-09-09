#!/usr/bin/env node
// ── Phase 6C4A WS11: build and verify the Historical Holdout V5 pool ────────
//   npm run c1:pool-v5
//
// Source-only, output-blind. Reuses the V4 pipeline's own resolvers, so a
// profile in this pool is built by exactly the code that built the V4 store —
// a second implementation would let the two disagree silently.
//
// Every exclusion is enforced here, in code:
//   · no team-season from historical corpus v3 (calibration OR holdout)
//   · no team-season consumed by Historical Holdout V4
//   · no team-season used in Candidate 1 development (the V4 diagnostic six)
//   · no five duplicating any prior fixture's five, at PERSON level
// No fixture in this pool is simulated. Selection of the V5 matchups is NOT
// part of this phase.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { buildPlayerV4, verifyCoach, loadPlayersV4 } from "../validation/buildPlayersV4.mjs";
import { loadCorpusV4 } from "../validation/buildCorpusV4.mjs";
import { NEW_V5_SPEC } from "../../data/validation/pool-v5-spec.mjs";
import { HISTORICAL_HOLDOUT_V3_IDS } from "../../data/calibration/sets-v3.mjs";
import { DIR } from "./failureRegister.mjs";

export const PLAYERS_V5_PATH = "data/validation/6c4a/calibration-players-v5.json";
export const POOL_V5_PATH = "data/validation/6c4a/historical-v5-candidate-pool.json";
const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const personKey = (five) => [...five].map((p) => p.calibrationPersonId ?? `cal-person:${p.name.toLowerCase().replace(/[^a-z]+/g, "-")}`).sort().join("|");

if (import.meta.url === `file://${process.argv[1]}`) {
  const refresh = process.argv.includes("--refresh");
  const def = defaultRuntimeParameterSet();

  // ── prior fixtures: what the pool must not reuse ─────────────────────────
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const corpusV4 = loadCorpusV4();
  const v4Manifest = JSON.parse(readFileSync("data/validation/6c3r/historical-holdout-v4-manifest.json", "utf8")).data;
  const consumedV4 = new Set(v4Manifest.matchups.flatMap((m) => [m.teamA.fixtureId, m.teamB.fixtureId]));
  const candidate1Development = new Set(["v4-1991-92-bulls", "v4-1977-78-spurs", "v4-1978-79-supersonics",
    "v4-1989-90-pistons", "v4-2021-22-heat", "v4-1969-70-supersonics"]);
  // "Prior" means SEEN: every historical-corpus-v3 fixture (calibration and
  // holdout alike) plus the V4 fixtures actually consumed by the formal run.
  // The unconsumed V4 pool teams are NOT prior — they have never been
  // simulated, and they ARE this pool's carried-forward members. Counting them
  // as prior would have disqualified all fifteen for duplicating themselves.
  const priorTeamSeasons = new Set();
  const priorFives = new Set();
  for (const f of corpusV3.fixtures) {
    priorTeamSeasons.add(`${f.teamId}|${f.season}`);
    priorFives.add(personKey(f.players));
  }
  for (const f of corpusV4.fixtures) {
    priorTeamSeasons.add(`${f.teamId}|${f.season}`);
    if (consumedV4.has(f.fixtureId) || candidate1Development.has(f.fixtureId)) priorFives.add(personKey(f.players));
  }
  console.log(`prior team-seasons ${priorTeamSeasons.size} · prior fives ${priorFives.size}`);
  console.log(`V4 consumed ${consumedV4.size} · Candidate 1 development ${candidate1Development.size}\n`);

  // ── carried-forward V4 pool teams (unconsumed, never simulated) ───────────
  const carried = corpusV4.fixtures.filter((f) => !consumedV4.has(f.fixtureId) && !candidate1Development.has(f.fixtureId));
  console.log(`carried forward from the V4 pool: ${carried.length}`);
  for (const f of carried) console.log(`  ${f.fixtureId.padEnd(28)} ${f.eraStyleId} ${f.teamName} ${f.season}`);

  // ── build the new team-seasons through the V4 pipeline ────────────────────
  console.log(`\nbuilding ${NEW_V5_SPEC.length} new team-seasons from source\n`);
  const profiles = []; const unresolved = []; const newFixtures = []; const coachChecks = [];
  for (const spec of NEW_V5_SPEC) {
    if (priorTeamSeasons.has(`${spec.teamId}|${spec.season}`)) throw new Error(`${spec.fixtureId} reuses a prior team-season`);
    if (HISTORICAL_HOLDOUT_V3_IDS.includes(spec.fixtureId)) throw new Error(`${spec.fixtureId} is a sealed V3 id`);
    const cc = await verifyCoach(spec, { refresh });
    coachChecks.push({ fixtureId: spec.fixtureId, ...cc });
    const built = [];
    for (const player of spec.five) {
      const r = await buildPlayerV4({ spec, player, refresh });
      if (r.unresolved) { unresolved.push(r.unresolved); continue; }
      built.push(r.profile);
      profiles.push(r.profile);
    }
    const confidences = built.map((p) => p.confidence);
    const weakest = ["LOW", "MEDIUM", "MEDIUM_HIGH", "HIGH"].find((c) => confidences.includes(c)) ?? "LOW";
    newFixtures.push({
      fixtureId: spec.fixtureId, teamId: spec.teamId, teamName: spec.teamName, season: spec.season,
      seasonStartYear: spec.seasonStartYear, eraStyleId: spec.eraStyleId,
      coachId: spec.coachId, coachName: spec.coachName, coachVerification: cc.verification,
      fixtureType: spec.fixtureType, qualitativeIdentity: spec.identity, teamArticle: spec.teamArticle,
      players: built.map((p, i) => ({ calibrationPlayerId: p.calibrationPlayerId, calibrationPersonId: p.calibrationPersonId,
        name: p.name, assignedPosition: spec.five[i]?.slot ?? p.primaryPosition })),
      resolvedPlayers: built.length,
      startersWithoutScoring: built.filter((p) => p.basicStats.pointsPerGame == null).length,
      playerDataConfidence: weakest,
      source: "NEW_IN_V5",
    });
    console.log(`  ${spec.fixtureId.padEnd(26)} ${built.length}/5 players · coach ${cc.named ? "verified" : "NOT FOUND"}`);
  }

  // ── eligibility ──────────────────────────────────────────────────────────
  const v4Profiles = new Map(loadPlayersV4().profiles.map((p) => [p.calibrationPlayerId, p]));
  const allTeams = [
    ...carried.map((f) => ({ fixtureId: f.fixtureId, teamId: f.teamId, teamName: f.teamName, season: f.season,
      eraStyleId: f.eraStyleId, coachId: f.coachId, coachVerification: f.coachVerification?.verification ?? f.coachVerification,
      players: f.players, fixtureType: f.fixtureType, qualitativeIdentity: f.qualitativeIdentity,
      resolvedPlayers: f.players.length,
      startersWithoutScoring: f.players.filter((p) => (v4Profiles.get(p.calibrationPlayerId)?.basicStats?.pointsPerGame ?? null) == null).length,
      playerDataConfidence: f.confidence?.playerDataConfidence ?? null, source: "CARRIED_FROM_V4_POOL" })),
    ...newFixtures,
  ];
  const teams = allTeams.map((t) => {
    const fiveKey = personKey(t.players);
    const reasons = [];
    if (t.resolvedPlayers !== 5) reasons.push("INCOMPLETE_FIVE");
    // A starter with no recorded scoring cannot carry the offensive identity
    // the holdout scores, so the fixture is ineligible rather than quietly
    // entering the engine at a median default.
    if (t.startersWithoutScoring > 0) reasons.push("STARTER_WITHOUT_RECORDED_SCORING");
    if (String(t.coachVerification) !== "SEASON_PAGE_NAMES_COACH") reasons.push("COACH_NOT_VERIFIED");
    if (priorFives.has(fiveKey)) reasons.push("FIVE_DUPLICATES_A_PRIOR_FIXTURE");
    if (consumedV4.has(t.fixtureId)) reasons.push("CONSUMED_BY_V4");
    if (candidate1Development.has(t.fixtureId)) reasons.push("USED_IN_CANDIDATE_1_DEVELOPMENT");
    if (priorTeamSeasons.has(`${t.teamId}|${t.season}`) && t.source === "NEW_IN_V5") reasons.push("TEAM_SEASON_SEEN");
    return { ...t, fiveKey, eligible: reasons.length === 0, ineligibleReasons: reasons };
  });
  // intra-pool five duplication (two pool teams sharing a five)
  const seenKeys = new Map();
  for (const t of teams) {
    if (seenKeys.has(t.fiveKey)) { t.eligible = false; t.ineligibleReasons.push(`FIVE_DUPLICATES_${seenKeys.get(t.fiveKey)}`); }
    else seenKeys.set(t.fiveKey, t.fixtureId);
  }

  const eligible = teams.filter((t) => t.eligible);
  const pairsByEra = {};
  const pairs = [];
  for (const era of ERAS) {
    const inEra = eligible.filter((t) => t.eligibleness !== false && t.eraStyleId === era);
    let n = 0;
    for (let i = 0; i < inEra.length; i++) {
      for (let j = i + 1; j < inEra.length; j++) {
        // a pair needs distinct franchises OR distinct seasons; both hold by construction
        pairs.push({ era, teamA: inEra[i].fixtureId, teamB: inEra[j].fixtureId,
          crossFranchise: inEra[i].teamId !== inEra[j].teamId });
        n += 1;
      }
    }
    pairsByEra[era] = n;
  }
  const crossFranchiseByEra = Object.fromEntries(ERAS.map((era) =>
    [era, pairs.filter((p) => p.era === era && p.crossFranchise).length]));

  const store = {
    calibrationPlayerStoreV5Version: "1.0.0",
    calibrationPlayerSchemaVersion: profiles[0]?.calibrationPlayerSchemaVersion ?? null,
    profileCount: profiles.length, unresolvedCount: unresolved.length,
    coachChecks, profiles, unresolved,
    storeHash: createHash("sha256").update(JSON.stringify(profiles.map((p) => [p.calibrationPlayerId, p.basicStats.pointsPerGame, p.games]))).digest("hex"),
  };
  writeFileSync(PLAYERS_V5_PATH, `${JSON.stringify(store, null, 2)}\n`);

  const payload = {
    historicalV5CandidatePoolVersion: "1.0.0",
    selectionBasis: "SOURCE_ONLY_OUTPUT_BLIND — team-season identity, documented five, documented coach, documented style. No Candidate 0 or Candidate 1 output consulted; no pool fixture simulated.",
    teamCount: teams.length,
    eligibleTeamCount: eligible.length,
    newTeamSeasons: newFixtures.length,
    carriedFromV4Pool: carried.length,
    eligibleByEra: Object.fromEntries(ERAS.map((e) => [e, eligible.filter((t) => t.eraStyleId === e).length])),
    eligiblePairsByEra: pairsByEra,
    crossFranchisePairsByEra: crossFranchiseByEra,
    erasWithAtLeastTwoEligiblePairs: ERAS.filter((e) => pairsByEra[e] >= 2).length,
    erasWithAtLeastThreeEligiblePairs: ERAS.filter((e) => pairsByEra[e] >= 3).length,
    meetsMinimum: eligible.length >= 24 && ERAS.every((e) => pairsByEra[e] >= 2),
    exclusions: {
      historicalCorpusV3: corpusV3.fixtures.length,
      historicalHoldoutV3: HISTORICAL_HOLDOUT_V3_IDS.length,
      consumedByV4: [...consumedV4],
      usedInCandidate1Development: [...candidate1Development],
      priorFivesBlocked: priorFives.size,
    },
    playerStore: { path: PLAYERS_V5_PATH, profiles: profiles.length, unresolved: unresolved.length, storeHash: store.storeHash },
    teams, pairs,
    notSelected: "V5 matchup selection is explicitly NOT part of Phase 6C4A. This artifact is the POOL only.",
  };
  payload.poolHash = createHash("sha256").update(JSON.stringify({ teams: teams.map((t) => [t.fixtureId, t.eligible]), pairs })).digest("hex");
  writeArtifact("historical-v5-candidate-pool", payload, {
    generationCommand: "npm run c1:pool-v5", dir: DIR,
    extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\npool: ${teams.length} teams · eligible ${eligible.length} · new ${newFixtures.length} · carried ${carried.length}`);
  console.log(`eligible by era: ${JSON.stringify(payload.eligibleByEra)}`);
  console.log(`eligible pairs by era: ${JSON.stringify(pairsByEra)}`);
  console.log(`eras with >=2 pairs: ${payload.erasWithAtLeastTwoEligiblePairs}/8 · >=3 pairs: ${payload.erasWithAtLeastThreeEligiblePairs}/8`);
  console.log(`meets minimum (24+ eligible, >=2 pairs every era): ${payload.meetsMinimum}`);
  if (unresolved.length) { console.log(`\nunresolved (${unresolved.length}):`); for (const u of unresolved) console.log(`  ${u.fixtureId} ${u.name}: ${u.reason}`); }
  const ineligible = teams.filter((t) => !t.eligible);
  if (ineligible.length) { console.log(`\nineligible (${ineligible.length}):`); for (const t of ineligible) console.log(`  ${t.fixtureId}: ${t.ineligibleReasons.join(", ")}`); }
  process.exit(payload.meetsMinimum ? 0 : 2);
}
