#!/usr/bin/env node
// ── Deterministic V4 selection, manifest and seal ───────────────────────────
//   npm run validation:6c3r:select
//
// Selects exactly 8 opponent-paired matchups — one per Era Style, 16 distinct
// team-seasons — from the committed pool, using only source-derived eligibility
// fields and a stable hash tie-break. No Candidate 0 output exists for any pool
// fixture, so none can have informed this.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { loadCorpusV4 } from "./buildCorpusV4.mjs";
import { loadPlayersV4 } from "./buildPlayersV4.mjs";
import { buildCoreManifest } from "./preflight.mjs";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { execFileSync } from "node:child_process";

const DIR = "data/validation/6c3r";
const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const PAIR_PRIORITY = { ACTUAL_FINALS_OPPONENTS: 4, ACTUAL_PLAYOFF_OPPONENTS: 3, ACTUAL_REGULAR_SEASON_OPPONENTS: 2, SAME_ERA_CONTRAST_PAIR: 1 };
const CONF_RANK = { HIGH: 4, MEDIUM_HIGH: 3, MEDIUM: 2, LOW: 1 };
const stableHash = (s) => createHash("sha256").update(s).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = readArtifact("replacement-holdout-candidate-pool", DIR);
  const corpus = loadCorpusV4();
  const store = loadPlayersV4();
  const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const fixtures = new Map(corpus.fixtures.map((f) => [f.fixtureId, f]));
  const teams = new Map(pool.data.teams.map((t) => [t.fixtureId, t]));

  const fiveKey = (fid) => fixtures.get(fid).players.map((p) => p.calibrationPlayerId.split(":").pop()).sort().join("|");
  const franchise = (fid) => fixtures.get(fid).teamId;

  // ── the frozen algorithm ────────────────────────────────────────────────────
  // Per era, in fixed era order: score every eligible pair by
  //   1. pair-type priority (actual finals > playoff > regular season > contrast)
  //   2. combined team confidence
  //   3. combined count of scoring-eligible identity traits
  //   4. franchise-diversity penalty against already-selected franchises
  //   5. sha256(pairId) as the tie-break
  // subject to the hard constraints: 16 distinct team-seasons and no two
  // selected teams sharing a five-person lineup.
  const selected = [];
  const usedTeams = new Set(); const usedFives = new Set(); const usedFranchises = [];
  const log = [];
  for (const era of ERAS) {
    const candidates = pool.data.pairs.filter((p) => p.era === era && p.eligible)
      .filter((p) => !usedTeams.has(p.a) && !usedTeams.has(p.b))
      .filter((p) => !usedFives.has(fiveKey(p.a)) && !usedFives.has(fiveKey(p.b)) && fiveKey(p.a) !== fiveKey(p.b))
      .map((p) => {
        const ta = teams.get(p.a); const tb = teams.get(p.b);
        const franchisePenalty = [franchise(p.a), franchise(p.b)].filter((f) => usedFranchises.includes(f)).length;
        return { ...p,
          score: [PAIR_PRIORITY[p.type] ?? 0,
            (CONF_RANK[ta.confidence] ?? 0) + (CONF_RANK[tb.confidence] ?? 0),
            new Set([...ta.scoreableTraits, ...tb.scoreableTraits]).size,
            -franchisePenalty],
          tiebreak: stableHash(p.pairId) };
      })
      .sort((x, y) => {
        for (let i = 0; i < x.score.length; i++) if (x.score[i] !== y.score[i]) return y.score[i] - x.score[i];
        return x.tiebreak.localeCompare(y.tiebreak);
      });
    if (!candidates.length) { console.error(`SELECTION_FAILED: no eligible pair for ${era}`); process.exit(2); }
    const pick = candidates[0];
    selected.push(pick);
    usedTeams.add(pick.a); usedTeams.add(pick.b);
    usedFives.add(fiveKey(pick.a)); usedFives.add(fiveKey(pick.b));
    usedFranchises.push(franchise(pick.a), franchise(pick.b));
    log.push({ era, picked: pick.pairId, type: pick.type, score: pick.score,
      consideredInOrder: candidates.slice(0, 4).map((c) => ({ pairId: c.pairId, type: c.type, score: c.score })) });
  }

  const teamIds = selected.flatMap((p) => [p.a, p.b]);
  const distinctTeams = new Set(teamIds).size;
  const distinctFives = new Set(teamIds.map(fiveKey)).size;
  const selectionHash = stableHash(JSON.stringify(selected.map((p) => p.pairId)));

  // ── the manifest ────────────────────────────────────────────────────────────
  const eligibleTraits = new Set(JSON.parse(readFileSync(`${DIR}/observability-control-results.json`, "utf8"))
    .data.finalTraitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const matchups = selected.map((p) => {
    const fa = fixtures.get(p.a); const fb = fixtures.get(p.b);
    const traitsOf = (f) => [f.qualitativeIdentity.pace, f.qualitativeIdentity.offense, f.qualitativeIdentity.defense, ...(f.qualitativeIdentity.tags ?? [])];
    return {
      matchupId: p.pairId, eraStyleId: p.era, pairType: p.type,
      teamA: { fixtureId: p.a, teamId: fa.teamId, teamName: fa.teamName, season: fa.season, coachId: fa.coachId,
        players: fa.players.map((x) => x.calibrationPlayerId),
        scoredTraits: traitsOf(fa).filter((t) => eligibleTraits.has(t)),
        excludedTraits: traitsOf(fa).filter((t) => !eligibleTraits.has(t)) },
      teamB: { fixtureId: p.b, teamId: fb.teamId, teamName: fb.teamName, season: fb.season, coachId: fb.coachId,
        players: fb.players.map((x) => x.calibrationPlayerId),
        scoredTraits: traitsOf(fb).filter((t) => eligibleTraits.has(t)),
        excludedTraits: traitsOf(fb).filter((t) => !eligibleTraits.has(t)) },
    };
  });
  const manifestHash = stableHash(JSON.stringify(matchups));
  const core = buildCoreManifest();

  const { path } = writeArtifact("historical-holdout-v4-manifest", {
    holdoutVersion: VALIDATION_VERSIONS.historicalHoldoutSetVersion,
    historicalHoldoutManifestVersion: VALIDATION_VERSIONS.historicalHoldoutManifestVersion,
    matchups,
    matchupCount: matchups.length,
    teamCount: distinctTeams,
    distinctLineups: distinctFives,
    erasCovered: selected.map((p) => p.era),
    pairTypes: selected.reduce((a, p) => { a[p.type] = (a[p.type] ?? 0) + 1; return a; }, {}),
    selectionAlgorithm: "Per era in fixed order: rank eligible pairs by pair-type priority, combined team confidence, combined scoring-eligible trait coverage, franchise-diversity penalty, sha256(pairId) tie-break; constrained to distinct team-seasons and distinct five-person lineups across the selection.",
    selectionLog: log,
    candidatePoolHash: pool.data.poolHash,
    selectionHash,
    manifestHash,
    candidateCoreHash: core.aggregateCoreHash,
    parameterSetHash: defaultRuntimeParameterSet().parameterSetHash,
    candidateZeroOutputsUsed: 0,
    state: "SEALED_UNREAD",
    accessCount: setAccessCount("historical-holdout-v4"),
    sealLog: "data/calibration/historical-holdout-v4-access-log.jsonl",
    frozenAtCommit: git("rev-parse", "HEAD"),
  }, {
    generationCommand: "npm run validation:6c3r:select",
    sourceArtifacts: [`${DIR}/replacement-holdout-candidate-pool.json`, `${DIR}/historical-corpus-v4.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: DIR,
  });

  console.log("HISTORICAL HOLDOUT V4 — SELECTED AND SEALED\n");
  for (const m of matchups) console.log(`  ${m.eraStyleId}  ${m.teamA.teamName} ${m.teamA.season} vs ${m.teamB.teamName} ${m.teamB.season}  (${m.pairType})`);
  console.log(`\n  matchups ${matchups.length} · distinct teams ${distinctTeams} · distinct lineups ${distinctFives} · eras ${new Set(selected.map((p) => p.era)).size}`);
  console.log(`  pair types ${JSON.stringify(selected.reduce((a, p) => { a[p.type] = (a[p.type] ?? 0) + 1; return a; }, {}))}`);
  console.log(`  selectionHash ${selectionHash.slice(0, 16)}... · manifestHash ${manifestHash.slice(0, 16)}...`);
  console.log(`  seal access count ${setAccessCount("historical-holdout-v4")}`);
  console.log(`wrote ${path}`);
  process.exit(matchups.length === 8 && distinctTeams === 16 && distinctFives === 16 ? 0 : 2);
}
