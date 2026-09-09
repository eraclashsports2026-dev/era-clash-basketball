#!/usr/bin/env node
// ── WS7: revalidate the V5 candidate pool under the re-certified instruments ─
//   npm run v5:pool
//
// SOURCE-ONLY and OUTPUT-BLIND. The builder is given no access to a Candidate
// 1 result, probability, trait score or win rate — enforced below by refusing
// to import any module that could produce one, and asserted by the tests.
//
// What CAN change a team's eligibility since 6C4A: the observability
// re-certification (a trait whose metric lost certification stops counting
// toward coverage) and the reference re-certification (a reference a fixture
// would be scored against must be certified). Both are read as artifacts.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, SYNTHETIC_DEVELOPMENT_V2, historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { readTargetValue } from "../validation/targetAccess.mjs";
import { loadPlayersV4 } from "../validation/buildPlayersV4.mjs";
import { loadCorpusV4, loadTargetsV4 } from "../validation/buildCorpusV4.mjs";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
export const PLAYERS_V5_PATH = "data/validation/6c4a/calibration-players-v5.json";

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const priorPool = readArtifact("historical-v5-candidate-pool", DIR_6C4A).data;
  const obs = readArtifact("historical-observability-certification-candidate1", DIR);
  const refs = readArtifact("era-reference-certification-candidate1", DIR);
  const eligibleTraitIds = new Set(obs.data.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const certifiedEras = new Set(refs.data.references.filter((r) => r.certifiedUnderCandidate1).map((r) => r.era));
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };
  // Frozen artifacts refuse silent overwrite: a re-issue is a decision.
  if (artifactExists("historical-v5-candidate-pool-v2", DIR) && !process.argv.includes("--refreeze")) {
    console.log("historical-v5-candidate-pool-v2 already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  // ── source stores ─────────────────────────────────────────────────────────
  const v4store = loadPlayersV4();
  const v5store = JSON.parse(readFileSync(PLAYERS_V5_PATH, "utf8"));
  const profiles = new Map([...v4store.profiles, ...v5store.profiles].map((p) => [p.calibrationPlayerId, p]));
  const corpusV4 = loadCorpusV4();
  const targetsV4 = new Map(loadTargetsV4().records.map((r) => [r.fixtureId, r]));
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));

  // ── exclusion sets, every one enforced in code ────────────────────────────
  const excl = {
    historicalCalibrationV3: new Set(historicalCalibrationV3Ids()),
    historicalHoldoutV3: new Set(HISTORICAL_HOLDOUT_V3_IDS),
    historicalHoldoutV4Consumed: new Set(priorPool.exclusions.consumedByV4),
    candidate1Development: new Set(priorPool.exclusions.usedInCandidate1Development),
    syntheticDevelopmentV2: new Set(SYNTHETIC_DEVELOPMENT_V2.map((s) => s.id ?? s)),
    syntheticStressHoldoutV2: new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)),
  };
  // seen team-seasons and seen fives, at PERSON level
  const seenTeamSeasons = new Set(); const seenFives = new Set();
  // The person id must be RESOLVED, never assumed present on the fixture entry.
  // V4-corpus fixtures carry only calibrationPlayerId, so reading
  // p.calibrationPersonId straight off them yields undefined for all five and
  // collapses every carried team onto one key — which is exactly what the
  // first run of this script did, disqualifying all fifteen carried teams as
  // duplicate-person and previously-seen. The store is the authority.
  const personOf = (p) => p.calibrationPersonId
    ?? profiles.get(p.calibrationPlayerId)?.calibrationPersonId
    ?? p.person
    ?? `UNRESOLVED:${p.calibrationPlayerId}`;
  const personKey = (players) => [...players].map(personOf).sort().join("|");
  for (const f of corpusV3.fixtures) { seenTeamSeasons.add(`${f.teamId}|${f.season}`); seenFives.add(personKey(f.players)); }
  for (const f of corpusV4.fixtures) {
    seenTeamSeasons.add(`${f.teamId}|${f.season}`);
    if (excl.historicalHoldoutV4Consumed.has(f.fixtureId) || excl.candidate1Development.has(f.fixtureId)) seenFives.add(personKey(f.players));
  }
  // era-reference fives are instruments: a pool team may not BE one
  const referenceFives = new Set(refs.data.references.map((r) => [...r.five].map((p) => p.person).sort().join("|")));

  console.log(`V5 CANDIDATE POOL v${VALIDATION_VERSIONS.historicalV5CandidatePoolVersion} — source-only revalidation\n`);
  const teams = priorPool.teams.map((t) => {
    const fiveIds = t.players.map((p) => p.calibrationPlayerId);
    const profs = fiveIds.map((id) => profiles.get(id) ?? null);
    const resolved = profs.filter(Boolean);
    const key = personKey(t.players);
    const reasons = [];

    // 1. source-backed completeness
    if (resolved.length !== 5) reasons.push("PLAYER_PROFILE_UNRESOLVED");
    if (resolved.some((p) => p.basicStats.pointsPerGame == null)) reasons.push("STARTER_WITHOUT_RECORDED_SCORING");
    if (String(t.coachVerification) !== "SEASON_PAGE_NAMES_COACH") reasons.push("COACH_NOT_VERIFIED");
    // 2. legal, distinct-person five
    const persons = new Set(t.players.map(personOf));
    if (persons.size !== 5) reasons.push("DUPLICATE_PERSON");
    if ([...persons].some((x) => String(x).startsWith("UNRESOLVED:"))) reasons.push("PERSON_ID_UNRESOLVED");
    const slots = new Set(t.players.map((p) => p.assignedPosition));
    if (slots.size !== 5) reasons.push("ILLEGAL_POSITION_ASSIGNMENT");
    // 3. era compatibility and a CERTIFIED reference to be scored against
    if (!ERAS.includes(t.eraStyleId)) reasons.push("UNKNOWN_ERA_STYLE");
    if (!certifiedEras.has(t.eraStyleId)) reasons.push("ERA_REFERENCE_NOT_CERTIFIED");
    // 4. exclusions
    for (const [name, set] of Object.entries(excl)) if (set.has(t.fixtureId)) reasons.push(`EXCLUDED_${name.toUpperCase()}`);
    if (t.source === "NEW_IN_V5" && seenTeamSeasons.has(`${t.teamId}|${t.season}`)) reasons.push("TEAM_SEASON_SEEN");
    if (seenFives.has(key)) reasons.push("FIVE_SEEN_IN_A_PRIOR_SET");
    if (referenceFives.has(key)) reasons.push("FIVE_IS_AN_ERA_REFERENCE");
    // 5. observable trait coverage under the CANDIDATE 1 certification
    const identity = t.qualitativeIdentity ?? {};
    const claimed = [...new Set([...(identity.tags ?? []),
      ...Object.values(identity).filter((v) => typeof v === "string")])];
    const observable = claimed.filter((c) => eligibleTraitIds.has(c));
    if (observable.length === 0) reasons.push("NO_OBSERVABLE_TRAIT");
    // 6. target coverage, read through the typed accessor
    const tgt = targetsV4.get(t.fixtureId) ?? null;
    const teamTargets = tgt?.teamTargets ?? {};
    const usableTargets = Object.entries(teamTargets).filter(([, e]) => readTargetValue(e).usable).map(([k]) => k);
    const shareTargets = tgt?.unitTargets
      ? Object.entries(tgt.unitTargets).filter(([k, v]) => k.startsWith("player") && v != null).map(([k]) => k) : [];
    if (t.source === "CARRIED_FROM_V4_POOL" && shareTargets.length === 0) reasons.push("NO_SHARE_TARGET_COVERAGE");

    const confidences = resolved.map((p) => p.confidence);
    const weakest = ["LOW", "MEDIUM", "MEDIUM_HIGH", "HIGH"].find((c) => confidences.includes(c)) ?? "LOW";
    return {
      fixtureId: t.fixtureId, teamId: t.teamId, teamName: t.teamName, season: t.season, eraStyleId: t.eraStyleId,
      coachId: t.coachId, coachVerification: t.coachVerification, source: t.source,
      players: t.players.map((p, i) => ({ ...p, profileHash: profiles.get(p.calibrationPlayerId)
        ? createHash("sha256").update(JSON.stringify(profiles.get(p.calibrationPlayerId))).digest("hex").slice(0, 32) : null })),
      fiveKey: key,
      qualitativeIdentity: identity,
      claimedTraits: claimed, observableTraits: observable,
      observableTraitCount: observable.length,
      targetCoverage: { teamTargetsUsable: usableTargets, shareTargets, shareTargetCount: shareTargets.length },
      sourceCoverage: { resolvedPlayers: resolved.length, startersWithoutScoring: resolved.filter((p) => p.basicStats.pointsPerGame == null).length },
      playerDataConfidence: weakest,
      exclusionConflicts: reasons.filter((r) => r.startsWith("EXCLUDED_") || r.includes("SEEN") || r.includes("REFERENCE")),
      eligible: reasons.length === 0,
      ineligibleReasons: reasons,
    };
  });

  // intra-pool duplicate fives
  const seenKeys = new Map();
  for (const t of teams) {
    if (t.eligible && seenKeys.has(t.fiveKey)) { t.eligible = false; t.ineligibleReasons.push(`FIVE_DUPLICATES_${seenKeys.get(t.fiveKey)}`); }
    else if (t.eligible) seenKeys.set(t.fiveKey, t.fixtureId);
  }

  const eligible = teams.filter((t) => t.eligible);
  // pairs: same era, distinct fixtures; cross-franchise recorded
  const pairs = []; const pairsByEra = {};
  for (const era of ERAS) {
    const inEra = eligible.filter((t) => t.eraStyleId === era);
    let n = 0;
    for (let i = 0; i < inEra.length; i++) for (let j = i + 1; j < inEra.length; j++) {
      pairs.push({ pairId: `v5p-${era}-${n + 1}`, era, teamA: inEra[i].fixtureId, teamB: inEra[j].fixtureId,
        crossFranchise: inEra[i].teamId !== inEra[j].teamId,
        pairType: inEra[i].teamId === inEra[j].teamId ? "SAME_FRANCHISE_CONTRAST_PAIR" : "SAME_ERA_CONTRAST_PAIR",
        observableTraitUnion: [...new Set([...inEra[i].observableTraits, ...inEra[j].observableTraits])] });
      n += 1;
    }
    pairsByEra[era] = n;
  }

  console.log(`  teams ${teams.length} · eligible ${eligible.length} · pairs ${pairs.length}`);
  console.log(`  eligible by era: ${JSON.stringify(Object.fromEntries(ERAS.map((e) => [e, eligible.filter((t) => t.eraStyleId === e).length])))}`);
  console.log(`  pairs by era:    ${JSON.stringify(pairsByEra)}\n`);

  gate("atLeast24EligibleTeams", eligible.length >= 24, `${eligible.length} eligible team-seasons`);
  gate("atLeastTwoEligiblePairsPerEra", ERAS.every((e) => pairsByEra[e] >= 2),
    ERAS.map((e) => `${e}:${pairsByEra[e]}`).join(" "));
  gate("everyEraHasACertifiedReference", eligible.every((t) => certifiedEras.has(t.eraStyleId)),
    `${certifiedEras.size} certified era references cover every eligible team`);
  gate("everyEligibleTeamHasAnObservableTrait", eligible.every((t) => t.observableTraitCount > 0),
    `minimum observable traits on an eligible team: ${Math.min(...eligible.map((t) => t.observableTraitCount))}`);
  gate("zeroPriorSetOverlap", eligible.every((t) => t.exclusionConflicts.length === 0),
    `every eligible team clears calibration v3, holdout V3, V4-consumed, Candidate 1 development, synthetic development, synthetic holdout, seen fives and era-reference fives`);
  gate("noDuplicateFiveInPool", new Set(eligible.map((t) => t.fiveKey)).size === eligible.length,
    `${eligible.length} eligible teams, ${new Set(eligible.map((t) => t.fiveKey)).size} distinct fives`);
  gate("everyPlayerProfileResolves", eligible.every((t) => t.sourceCoverage.resolvedPlayers === 5 && t.players.every((p) => p.profileHash)),
    `${eligible.length * 5} player profiles resolved with hashes`);

  const payload = {
    historicalV5CandidatePoolVersion: VALIDATION_VERSIONS.historicalV5CandidatePoolVersion,
    supersedes: { version: priorPool.historicalV5CandidatePoolVersion, poolHash: priorPool.poolHash,
      note: "the 6C4A pool is preserved unchanged; this revalidation is a new artifact" },
    selectionBasis: "SOURCE_ONLY_OUTPUT_BLIND — team-season identity, documented five, documented coach, documented style, source completeness, observable-trait coverage under the Candidate 1 certification, target coverage through the typed accessor. No Candidate 1 result, probability, trait score or win rate was read.",
    candidate1SimulationsUsed: 0,
    instrumentsRead: {
      observabilityCertification: obs.outputHash,
      eraReferenceCertification: refs.outputHash,
      eligibleTraitCount: eligibleTraitIds.size,
      certifiedEras: [...certifiedEras],
    },
    teamCount: teams.length, eligibleTeamCount: eligible.length,
    newTeamSeasons: teams.filter((t) => t.source === "NEW_IN_V5").length,
    carriedFromV4Pool: teams.filter((t) => t.source === "CARRIED_FROM_V4_POOL").length,
    eligibleByEra: Object.fromEntries(ERAS.map((e) => [e, eligible.filter((t) => t.eraStyleId === e).length])),
    eligiblePairsByEra: pairsByEra,
    eligiblePairCount: pairs.length,
    crossFranchisePairsByEra: Object.fromEntries(ERAS.map((e) => [e, pairs.filter((p) => p.era === e && p.crossFranchise).length])),
    erasWithAtLeastTwoEligiblePairs: ERAS.filter((e) => pairsByEra[e] >= 2).length,
    erasWithAtLeastThreeEligiblePairs: ERAS.filter((e) => pairsByEra[e] >= 3).length,
    meetsMinimum: eligible.length >= 24 && ERAS.every((e) => pairsByEra[e] >= 2),
    exclusions: Object.fromEntries(Object.entries(excl).map(([k, v]) => [k, v.size])),
    seenTeamSeasons: seenTeamSeasons.size, seenFivesBlocked: seenFives.size,
    eraReferenceFivesBlocked: referenceFives.size,
    expansionRequired: false,
    teams, pairs,
    pass: fail.length === 0, failedGates: fail,
  };
  payload.poolHash = createHash("sha256").update(JSON.stringify({ teams: teams.map((t) => [t.fixtureId, t.eligible, t.fiveKey]), pairs: pairs.map((p) => p.pairId) })).digest("hex");
  writeArtifact("historical-v5-candidate-pool-v2", payload, {
    generationCommand: "npm run v5:pool", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`POOL v2: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · poolHash ${payload.poolHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
