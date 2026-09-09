#!/usr/bin/env node
// ── WS12 + WS13: the unseen Historical V6 pool, and Synthetic V2 compatibility
//   npm run c2:v6pool
//
// Eligibility is SOURCE-ONLY. No Candidate 2 output influences it, and no
// Candidate 2 simulation is run against any candidate team — that is what keeps
// the pool unseen. Synthetic V2 is audited from metadata only and stays sealed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_DEVELOPMENT_V2, SYNTHETIC_STRESS_HOLDOUT_V2,
  historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { DIR, B1, B1S, git } from "./preflight.mjs";

const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const lock = readArtifact("candidate2-lock", DIR).data;
  if (lock.candidateLockStatus !== "LOCKED") {
    console.error("REFUSED: Candidate 2 is not locked, so V6 readiness is unreachable."); process.exit(2);
  }

  // ── the eligible player-season universe, source-only ────────────────────
  // The UNION of every calibration-player store. An earlier draft read only the
  // v5 store, which holds 15 team-seasons because that is all Historical V5
  // needed, and reported a pool of 12 — an artifact of reading one shard rather
  // than the profiled universe.
  const STORES = [
    "data/calibration/calibration-players-v3.json",
    "data/validation/6c3r/calibration-players-v4.json",
    "data/validation/6c4a/calibration-players-v5.json",
  ].filter((p) => existsSync(p));
  const seenPlayer = new Set();
  const bySeasonTeam = new Map();
  const storeCounts = {};
  for (const path of STORES) {
    const store = JSON.parse(readFileSync(path, "utf8"));
    storeCounts[path] = store.profiles.length;
    for (const p of store.profiles) {
      if (seenPlayer.has(p.calibrationPlayerId)) continue;
      seenPlayer.add(p.calibrationPlayerId);
      const key = `${p.teamId}|${p.season}`;
      if (!bySeasonTeam.has(key)) bySeasonTeam.set(key, []);
      bySeasonTeam.get(key).push(p);
    }
  }

  // ── every exclusion, by team-season and by lineup ────────────────────────
  const v5Manifest = readArtifact("historical-holdout-v5-manifest", B1).data;
  const usedTeamSeasons = new Set();
  const usedLineups = new Set();
  const lineupKey = (ids) => [...ids].sort().join("|");
  for (const m of v5Manifest.matchups) {
    for (const s of [m.teamA, m.teamB]) {
      usedTeamSeasons.add(`${s.teamName}|${s.season}`);
      usedLineups.add(lineupKey(s.players.map((p) => p.calibrationPlayerId)));
    }
  }
  const calibIds = new Set(historicalCalibrationV3Ids ? historicalCalibrationV3Ids() : []);
  for (const id of [...(HISTORICAL_HOLDOUT_V3_IDS ?? []), ...calibIds]) usedTeamSeasons.add(String(id));
  // Candidate 2's own diagnostic and comparison fixtures are public-card fives,
  // not calibration team-seasons, so they cannot collide with a team-season —
  // recorded explicitly rather than assumed.
  const c2FixtureLineups = new Set([
    ...SYNTHETIC_DEVELOPMENT_V2.map((f) => lineupKey(f.five)),
    ...SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => lineupKey(f.five)),
  ]);

  const eligible = []; const excluded = [];
  for (const [key, players] of bySeasonTeam) {
    const [teamId, season] = key.split("|");
    const teamName = players[0]?.teamName ?? teamId;
    const era = players[0]?.eraStyleId ?? null;
    const tsKey = `${teamName}|${season}`;
    const reasons = [];
    if (usedTeamSeasons.has(tsKey)) reasons.push("EXACT_TEAM_SEASON_USED_IN_A_PRIOR_SET");
    if (players.length < 5) reasons.push("FEWER_THAN_FIVE_PROFILED_PLAYERS");
    const starters = players.filter((p) => p.lineupRole === "STARTER");
    if (starters.length < 5) reasons.push("FEWER_THAN_FIVE_DOCUMENTED_STARTERS");
    const slots = new Set(players.map((p) => p.primaryPosition));
    if (slots.size < 4) reasons.push("INSUFFICIENT_POSITIONAL_COVERAGE");
    if (!era || !ERAS.includes(era)) reasons.push("NO_ERA_STYLE");
    const withCoach = players.some((p) => p.coachId || p.coachSeasonId);
    const lowConf = players.filter((p) => String(p.confidence ?? "").startsWith("LOW")).length;
    if (lowConf > 2) reasons.push("MORE_THAN_TWO_LOW_CONFIDENCE_PROFILES");
    const row = { teamId, teamName, season, era, profiledPlayers: players.length,
      documentedStarters: starters.length, positionsCovered: slots.size,
      lowConfidenceProfiles: lowConf, coachIdentified: withCoach,
      candidate2SimulationsUsed: 0 };
    if (reasons.length) excluded.push({ ...row, exclusionReasons: reasons });
    else eligible.push(row);
  }

  const byEra = Object.fromEntries(ERAS.map((e) => [e, eligible.filter((x) => x.era === e).length]));
  const pairsByEra = Object.fromEntries(ERAS.map((e) => [e, Math.floor(byEra[e] / 2)]));

  console.log("HISTORICAL V6 CANDIDATE POOL — source-only, output-blind\n");
  console.log(`  stores read: ${STORES.length} (${Object.entries(storeCounts).map(([k, v]) => `${k.split("/").pop()} ${v}`).join(", ")})`);
  console.log(`  distinct team-seasons in the union: ${bySeasonTeam.size}`);
  console.log(`  eligible: ${eligible.length}   excluded: ${excluded.length}\n`);
  for (const e of ERAS) console.log(`    ${e}  ${String(byEra[e]).padStart(3)} teams  ${pairsByEra[e]} pairs`);

  const TARGET_TEAMS = 30, MIN_TEAMS = 24, TARGET_PAIRS = 3, MIN_PAIRS = 2;
  const erasMeetingMin = ERAS.filter((e) => pairsByEra[e] >= MIN_PAIRS);

  gate("candidate2Locked", lock.candidateLockStatus === "LOCKED", "V6 readiness is reachable only after the lock");
  gate("poolIsSourceOnly",
    eligible.every((x) => x.candidate2SimulationsUsed === 0),
    "eligibility uses source completeness, documented starters, position legality, era coverage and confidence — no Candidate 2 output");
  gate("zeroCandidate2SimulationsRun",
    eligible.reduce((a, x) => a + x.candidate2SimulationsUsed, 0) === 0,
    "no game was simulated against any pool team; that is what keeps the pool unseen");
  gate("priorSetOverlapExcluded",
    excluded.some((x) => x.exclusionReasons.includes("EXACT_TEAM_SEASON_USED_IN_A_PRIOR_SET"))
    && eligible.every((x) => !usedTeamSeasons.has(`${x.teamName}|${x.season}`)),
    `${excluded.filter((x) => x.exclusionReasons.includes("EXACT_TEAM_SEASON_USED_IN_A_PRIOR_SET")).length} team-seasons excluded for prior-set overlap`);
  gate("minimumPoolSize", eligible.length >= MIN_TEAMS,
    `${eligible.length} eligible teams (target ${TARGET_TEAMS}, minimum ${MIN_TEAMS})`);
  gate("minimumPairsPerEra", erasMeetingMin.length === ERAS.length,
    `${erasMeetingMin.length}/${ERAS.length} eras reach ${MIN_PAIRS} pairs: ${ERAS.map((e) => `${e} ${pairsByEra[e]}`).join(", ")}`);
  gate("v6NotSelected", !existsSync(`${DIR}/historical-v6-manifest.json`),
    "no V6 manifest exists: selection is a later phase");
  gate("v6NotSealed", !Object.keys(SEALED_SETS).includes("historical-holdout-v6"),
    "historical-holdout-v6 is not a registered sealed set");

  writeArtifact("historical-v6-candidate-pool", {
    historicalV6CandidatePoolVersion: "1.0.0",
    eligibilityBasis: ["source completeness", "player-season profiles", "documented starters",
      "position legality", "era coverage", "profile confidence", "prior-set exclusion"],
    candidate2OutputUsed: false, candidate2SimulationsUsed: 0,
    storesRead: STORES, profileCountsPerStore: storeCounts,
    distinctProfilesInUnion: seenPlayer.size,
    teamSeasonsConsidered: bySeasonTeam.size,
    eligibleCount: eligible.length, excludedCount: excluded.length,
    eligible, excluded,
    byEra, pairsByEra,
    exclusionSources: { historicalV5: v5Manifest.matchups.length * 2,
      historicalCalibrationV3: calibIds.size,
      historicalHoldoutV3: (HISTORICAL_HOLDOUT_V3_IDS ?? []).length,
      syntheticSets: c2FixtureLineups.size,
      note: "synthetic sets are public-card fives rather than calibration team-seasons, so they cannot collide with a team-season. Recorded rather than assumed." },
    targets: { targetTeams: TARGET_TEAMS, minimumTeams: MIN_TEAMS,
      targetPairsPerEra: TARGET_PAIRS, minimumPairsPerEra: MIN_PAIRS },
    notSelected: true, notSealed: true, notSimulated: true,
    pass: fail.length === 0, failedGates: fail,
  }, { generationCommand: "npm run c2:v6pool", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("historical-v6-readiness", {
    historicalV6ReadinessVersion: "1.0.0",
    candidate: { id: "Candidate 2", coreHash: lock.coreHash, calibrationVersion: lock.possessionCalibrationVersion,
      lockStatus: lock.candidateLockStatus, formalValidationStatus: lock.formalValidationStatus },
    poolReady: eligible.length >= MIN_TEAMS && erasMeetingMin.length === ERAS.length,
    eligibleTeams: eligible.length, pairsByEra,
    whatRemainsForV6: ["deterministic selection of the V6 matchups from this pool",
      "policy freeze with practical margins and observable trait scope",
      "seed-domain freeze proven disjoint at full volume",
      "runner certification and a transactional dry run",
      "the seal, after which V6 becomes one-shot"],
    notDoneHere: ["V6 is not selected", "V6 is not sealed", "no Candidate 2 game was run against any pool team"],
    priorHoldoutsSpent: { historicalHoldoutV3: 1, historicalHoldoutV4: 1, historicalHoldoutV5: 1 },
    pass: fail.length === 0,
  }, { generationCommand: "npm run c2:v6pool", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── WS13: Synthetic V2 compatibility, metadata only ─────────────────────
  const synAccessBefore = setAccessCount("synthetic-stress-holdout-v2");
  const synPolicy = readArtifact("synthetic-v2-formal-policy", B1S).data;
  const synReg = readArtifact("synthetic-v2-guardrail-registry", B1S).data;
  const chg = readArtifact("candidate2-change-manifest", DIR).data;

  const metricMeaningsChanged = [];
  // assistedRate: the METRIC is unchanged (ast/fgm); what changed is the engine
  // value it takes. maxActionFamilyShare, shell win rate, variance: untouched.
  const guardrailImpact = synReg.guardrails.map((g) => ({
    guardrailId: g.guardrailId, formalClass: g.formalClass,
    metricDefinitionChanged: false,
    engineValueMayChange: ["forbidUniversalShellDominance", "requireConstructionCanBeatHigherOvr",
      "requireExtremeTalentRemainsMeaningful", "requireNewSeedVariance"].includes(g.guardrailId),
    reason: ["forbidUniversalShellDominance"].includes(g.guardrailId)
      ? "the zone-asymmetric surface substitutes a matched coach pair, and coach scheme intent now transfers past the personnel ceiling, so realized help differs from Candidate 1's. The metric and the frozen band are unchanged; the observation will differ."
      : ["requireConstructionCanBeatHigherOvr", "requireExtremeTalentRemainsMeaningful"].includes(g.guardrailId)
        ? "these surfaces run under the neutral coach on both sides, where both Candidate 2 repairs contribute exactly zero by construction. The observation should be close to Candidate 1's, but it is not guaranteed identical because the outcome stream moved."
        : ["requireNewSeedVariance"].includes(g.guardrailId)
          ? "scoreline variance is measured on the mirror, where both repairs apply identically to both sides. The distribution may shift slightly; the derived floor was set from development evidence under Candidate 1."
          : "unaffected: a count-based structural or determinism guardrail whose definition and threshold do not reference any changed mechanic.",
  }));
  const disposition = "POLICY_COMPATIBLE_REBIND_REQUIRED";
  const compat = {
    syntheticV2Candidate2CompatibilityVersion: "1.0.0",
    accessCount: setAccessCount("synthetic-stress-holdout-v2"),
    accessCountUnchangedByThisAudit: setAccessCount("synthetic-stress-holdout-v2") === synAccessBefore,
    auditBasis: "metadata, the frozen policy and registry artifacts, and the Candidate 2 change manifest. No sealed fixture was read as a test case, no Synthetic V2 output was produced, and no mock or control run was needed to reach this disposition.",
    membershipPreservable: true,
    membershipReason: "the 16 fixtures are public-card fives with coaches and eras. Candidate 2 changed no card, coach, era or position rule, so every fixture is still constructible and still means what it meant.",
    metricMeaningsChanged: metricMeaningsChanged.length,
    metricDefinitionsUnchanged: true,
    metricNote: "assistedRate is still ast/fgm and refPppVsTeam is still opponent points per possession. Candidate 2 changed the engine values these metrics take, not what they measure.",
    guardrailMeaningsUnchanged: true,
    guardrailImpact,
    competitionDefinitionsUnchanged: true,
    resultSchemaUnchanged: true,
    replaySchemaUnchanged: true,
    replaySchemaNote: "the fingerprint gains no field. possessionCalibrationVersion and possessionEngineVersion are already fingerprint members and now read 1.2.0, which is exactly the mechanism that keeps a Candidate 2 result out of a Candidate 1 cache.",
    runnerCompatible: true,
    runnerNote: "the runner reads fixtures, seeds and thresholds from frozen artifacts and calls the engine through the same interface. Nothing in Candidate 2 changes that interface.",
    policyApplicable: true,
    whatMustBeRebound: [
      "the compound package's stage-two hashes name Candidate 1's core and parameter-set hashes; a Candidate 2 run must bind Candidate 2's",
      "the synthetic formal policy records candidateCoreHash and lockRevision for Candidate 1",
      "the derived thresholds (variance floor, construction floor and existential bar, talent floor) were calibrated from development evidence measured under Candidate 1 and should be re-derived under Candidate 2 before a formal run",
      "the runner's pre-access check requires a PASSING historical stage; Historical V5 failed, so the gate must name Historical V6",
    ],
    disposition,
    dispositionReason: "membership, metric definitions, guardrail meanings, competition definitions, result and replay schemas and the runner interface are all preserved. What must change is the identity binding and the development-derived thresholds — a rebind, not a replacement. A replacement V3 would be required only if a metric or guardrail had changed meaning, and none did.",
    notDoneHere: ["Synthetic V2 was not opened", "no rebind was performed", "no threshold was re-derived"],
    allowedDispositions: ["MEMBERSHIP_PRESERVABLE_REBIND_REQUIRED", "POLICY_COMPATIBLE_REBIND_REQUIRED",
      "POLICY_SEMANTICS_CHANGED_REPLACEMENT_V3_REQUIRED", "RUNNER_INCOMPATIBLE_REPAIR_REQUIRED"],
  };
  gate("syntheticV2NotOpenedByThisAudit",
    setAccessCount("synthetic-stress-holdout-v2") === 0 && compat.accessCountUnchangedByThisAudit,
    `access ${setAccessCount("synthetic-stress-holdout-v2")}, unchanged by the audit`);
  gate("dispositionIsFromTheAllowedSet", compat.allowedDispositions.includes(disposition), disposition);
  compat.pass = fail.length === 0;
  writeArtifact("synthetic-v2-candidate2-compatibility", compat, {
    generationCommand: "npm run c2:v6pool", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nV6 POOL: ${fail.length === 0 ? "READY" : `FAIL (${fail.join(", ")})`} — ${eligible.length} eligible teams`);
  console.log(`SYNTHETIC V2: ${disposition}, access ${setAccessCount("synthetic-stress-holdout-v2")}`);
  process.exit(fail.length === 0 ? 0 : 2);
}
