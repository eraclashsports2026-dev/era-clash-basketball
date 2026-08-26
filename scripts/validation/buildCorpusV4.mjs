#!/usr/bin/env node
// ── V4 corpus, targets and candidate-pool builder ───────────────────────────
//   npm run validation:6c3r:pool
//
// Assembles verified fixtures from the V4 player store (v3 method, v4 spec),
// derives Tier A/C/D targets with full provenance, and evaluates ELIGIBILITY
// for every team and pair from source facts alone:
//
//   - the team-season is UNSEEN (not in historical corpus v3, either set)
//   - the five-person lineup duplicates no prior fixture's five
//   - the coach-season is source-verified and the coach is modeled
//   - every profile verified, positions legal, no duplicate person
//   - at least one identity trait is scoring-eligible after certification
//
// No Candidate 0 output exists for any of these fixtures. The pool is committed
// before the selection algorithm runs, so selection can be audited against it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fetchArticle, parseRecord, PUBLISHER, LICENSE_NOTE } from "../calibration/adapters/wikipedia.mjs";
import { POOL_V4_SPEC, PRIMARY_PAIRS_V4 } from "../../data/validation/corpus-v4-spec.mjs";
import { loadPlayersV4 } from "./buildPlayersV4.mjs";
import { calibrationPlayerId, personSlug } from "../../src/v3/calibration/calibrationPlayerSchema.js";
import { notRecordedInEra, TEAM_TARGET_FIELDS } from "../../src/v3/calibration/targetSchema.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, SYNTHETIC_DEVELOPMENT_V2 } from "../../data/calibration/sets-v3.mjs";
import { COACHES } from "../../src/v3/coaches.js";
import { PLAYERS } from "../../src/players.js";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
export const CORPUS_V4_PATH = `${DIR}/historical-corpus-v4.json`;
export const TARGETS_V4_PATH = `${DIR}/historical-targets-v4.json`;
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);
const SLOTS = ["PG", "SG", "SF", "PF", "C"];

const sharesOf = (entries) => {
  if (entries.some(([, v]) => v == null)) return null;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!(total > 0)) return null;
  const out = Object.fromEntries(entries.map(([k, v]) => [k, r4(v / total)]));
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum !== 1) { const big = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0]; out[big] = r4(out[big] + (1 - sum)); }
  return out;
};
const entry = (value, availability, provenance, formula = null) => ({ value, availability, provenance: value == null ? null : provenance, formula });

export const loadCorpusV4 = () => JSON.parse(readFileSync(CORPUS_V4_PATH, "utf8"));
export const loadTargetsV4 = () => JSON.parse(readFileSync(TARGETS_V4_PATH, "utf8"));

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = loadPlayersV4();
  const byId = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const coachIds = new Set(COACHES.map((c) => c.id));
  const coachCheck = new Map(store.coachChecks.map((c) => [c.fixtureId, c]));
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const eligibleTraits = new Set(JSON.parse(readFileSync(`${DIR}/observability-control-results.json`, "utf8"))
    .data.finalTraitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));

  // ── prior identities the pool must not duplicate ───────────────────────────
  const priorTeamSeasons = new Set(corpusV3.fixtures.map((f) => `${f.teamName}|${f.season}`));
  const priorFives = new Set(corpusV3.fixtures.map((f) =>
    f.players.map((p) => p.calibrationPlayerId.split(":").pop()).sort().join("|")));
  const cardPerson = (id) => personIdForCard(id) ?? id;
  for (const s of [...SYNTHETIC_DEVELOPMENT_V2, ...SYNTHETIC_STRESS_HOLDOUT_V2]) {
    priorFives.add((s.five ?? []).map(cardPerson).sort().join("|"));
  }

  // ── fixtures ───────────────────────────────────────────────────────────────
  const fixtures = []; const targets = []; const teamEligibility = [];
  for (const spec of POOL_V4_SPEC) {
    const errs = [];
    if (!coachIds.has(spec.coachId)) errs.push(`coach ${spec.coachId} not modeled`);
    const cc = coachCheck.get(spec.fixtureId);
    if (!cc?.named) errs.push("season page does not name the coach");
    if (spec.five.map((p) => p.slot).join(",") !== SLOTS.join(",")) errs.push("slots must be PG,SG,SF,PF,C");
    const persons = new Set();
    const players = [];
    for (const p of spec.five) {
      const id = calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: spec.seasonStartYear, personSlug: personSlug(p.name) });
      const prof = byId.get(id);
      if (!prof) { errs.push(`${p.name}: no verified profile`); continue; }
      if (prof.primaryPosition !== p.slot) errs.push(`${p.name}: profiled at ${prof.primaryPosition}, assigned ${p.slot}`);
      if (persons.has(prof.calibrationPersonId)) errs.push(`${p.name} appears twice`);
      persons.add(prof.calibrationPersonId);
      players.push({ calibrationPlayerId: id, name: prof.name, assignedPosition: p.slot, historicalRole: p.role,
        membershipSource: prof.provenance.membershipRoute, confidence: prof.confidence });
    }
    const fiveKey = spec.five.map((p) => personSlug(p.name)).sort().join("|");
    const publicPersonKey = spec.five.map((p) => {
      const prof = byId.get(calibrationPlayerId({ teamId: spec.teamId, seasonStartYear: spec.seasonStartYear, personSlug: personSlug(p.name) }));
      return prof?.publicPersonId ?? `cal-person:${personSlug(p.name)}`;
    }).sort().join("|");
    const teamSeasonSeen = priorTeamSeasons.has(`${spec.teamName}|${spec.season}`);
    const lineupSeen = priorFives.has(fiveKey) || priorFives.has(publicPersonKey);
    if (teamSeasonSeen) errs.push("team-season already used by historical corpus v3");
    if (lineupSeen) errs.push("five-person lineup duplicates a prior fixture");
    const scoreableTraits = [spec.identity.pace, spec.identity.offense, spec.identity.defense, ...(spec.identity.tags ?? [])]
      .filter((t) => eligibleTraits.has(t));
    if (scoreableTraits.length === 0) errs.push("no scoring-eligible identity trait");

    const RANK = { HIGH: 4, MEDIUM_HIGH: 3, MEDIUM: 2, LOW: 1, SOURCE_BLOCKED: 0 };
    const weakest = players.reduce((a, p) => (RANK[p.confidence] < RANK[a] ? p.confidence : a), "HIGH");
    teamEligibility.push({ fixtureId: spec.fixtureId, eraStyleId: spec.eraStyleId, eligible: errs.length === 0,
      reasons: errs, scoreableTraits, confidence: weakest, coachVerification: cc?.verification ?? null });
    if (errs.length) continue;

    fixtures.push({
      fixtureId: spec.fixtureId, teamId: spec.teamId, teamName: spec.teamName,
      season: spec.season, seasonStartYear: spec.seasonStartYear, coachId: spec.coachId, coachName: spec.coachName,
      eraStyleId: spec.eraStyleId, fixtureType: spec.fixtureType,
      lineupBasis: spec.fixtureType === "HISTORICAL_STARTER_PROXY" ? "DOCUMENTED_STARTING_OR_CLOSING_FIVE" : "SOURCE_BACKED_PRINCIPAL_FIVE",
      players, qualitativeIdentity: spec.identity, teamArticle: spec.teamArticle,
      coachVerification: cc.verification,
      confidence: { lineupConfidence: spec.fixtureType === "HISTORICAL_STARTER_PROXY" ? "MEDIUM_HIGH" : "MEDIUM",
        playerDataConfidence: weakest, styleIdentityConfidence: "MEDIUM",
        overallFixtureConfidence: weakest === "LOW" ? "MEDIUM" : weakest },
      historicalCorpusV4Version: VALIDATION_VERSIONS.historicalCorpusV4Version,
    });

    // ── targets ────────────────────────────────────────────────────────────
    const art = await fetchArticle(spec.teamArticle);
    const record = parseRecord(art.html);
    const prov = { sourceType: "AUTHORIZED_PUBLIC_API", publisher: PUBLISHER, sourceUrl: art.sourceUrl,
      revisionId: art.revisionId, contentHash: art.contentHash, retrievedAt: art.retrievedAt,
      licenseNote: LICENSE_NOTE, attribution: "Wikipedia contributors, CC BY-SA 4.0", verificationStatus: "PARSED_FROM_SOURCE" };
    const teamTargets = {};
    if (record) {
      teamTargets.games = entry(record.games, "RECORDED_STATISTIC", prov);
      teamTargets.wins = entry(record.wins, "RECORDED_STATISTIC", prov);
      teamTargets.losses = entry(record.losses, "RECORDED_STATISTIC", prov);
    }
    for (const m of TEAM_TARGET_FIELDS) {
      if (teamTargets[m]) continue;
      teamTargets[m] = entry(null, notRecordedInEra(m, spec.eraStyleId) ? "NOT_RECORDED_IN_ERA" : "SOURCE_BLOCKED_LICENSING", null);
    }
    const five = players.map((p) => ({ id: p.calibrationPlayerId, prof: byId.get(p.calibrationPlayerId) }));
    const stat = (k) => five.map((x) => [x.id, x.prof.basicStats[k]]);
    targets.push({
      fixtureId: spec.fixtureId, teamName: spec.teamName, season: spec.season, eraStyleId: spec.eraStyleId,
      set: "historical-holdout-v4-pool",
      historicalTargetsV4Version: VALIDATION_VERSIONS.historicalTargetsV4Version,
      teamTargets,
      unitTargets: {
        unitType: "SELECTED_FIVE", selectedFiveOnly: true,
        availability: "SELECTED_FIVE_SEASON_SHARE_PROXY",
        confidence: weakest === "LOW" ? "LOW" : "MEDIUM",
        playerScoringShares: sharesOf(stat("pointsPerGame")),
        playerReboundShares: sharesOf(stat("rebounds")),
        playerAssistShares: sharesOf(stat("assists")),
        playerStealShares: sharesOf(stat("steals")),
        playerBlockShares: sharesOf(stat("blocks")),
        playerOpportunityShares: null, playerUsageShares: null, playerTurnoverShares: null,
        formula: "share_i = stat_i / sum(stat over the five verified season profiles)",
        provenance: { ...prov, verificationStatus: "DERIVED_FROM_AUTHORIZED_TOTALS" },
      },
      identityTargets: Object.entries(spec.identity).flatMap(([trait, value]) =>
        Array.isArray(value)
          ? value.map((v) => ({ trait, value: v, kind: "DOCUMENTED_STYLE", confidence: "MEDIUM" }))
          : [{ trait, value, kind: "DOCUMENTED_STYLE", confidence: "MEDIUM" }]),
      confidence: weakest === "LOW" ? "MEDIUM" : weakest,
    });
  }

  // ── pairs: primaries plus every same-era eligible combination as backup ────
  const eligibleByEra = {};
  for (const t of teamEligibility.filter((x) => x.eligible)) (eligibleByEra[t.eraStyleId] ??= []).push(t.fixtureId);
  const primaryKeys = new Set(PRIMARY_PAIRS_V4.map((p) => [p.a, p.b].sort().join("|")));
  const pairs = PRIMARY_PAIRS_V4.map((p) => {
    const aOk = teamEligibility.find((t) => t.fixtureId === p.a)?.eligible;
    const bOk = teamEligibility.find((t) => t.fixtureId === p.b)?.eligible;
    return { ...p, source: "PRIMARY", eligible: !!(aOk && bOk),
      reason: aOk && bOk ? "both teams eligible" : `ineligible team(s): ${[!aOk && p.a, !bOk && p.b].filter(Boolean).join(", ")}` };
  });
  for (const [era, ids] of Object.entries(eligibleByEra)) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = [ids[i], ids[j]].sort().join("|");
      if (primaryKeys.has(key)) continue;
      pairs.push({ pairId: `v4p-${era}-x${i}${j}`, era, a: ids[i], b: ids[j], type: "SAME_ERA_CONTRAST_PAIR",
        source: "AUTO_BACKUP", eligible: true, reason: "auto-generated same-era combination of eligible teams" });
    }
  }
  const eligiblePairsByEra = {};
  for (const p of pairs.filter((x) => x.eligible)) eligiblePairsByEra[p.era] = (eligiblePairsByEra[p.era] ?? 0) + 1;
  const erasWithTwo = Object.values(eligiblePairsByEra).filter((n) => n >= 2).length;

  mkdirSync(DIR, { recursive: true });
  const corpus = { historicalCorpusV4Version: VALIDATION_VERSIONS.historicalCorpusV4Version,
    fixtureCount: fixtures.length, fixtures,
    corpusHash: createHash("sha256").update(JSON.stringify(fixtures.map((f) => f.fixtureId))).digest("hex") };
  writeFileSync(CORPUS_V4_PATH, `${JSON.stringify(corpus, null, 2)}\n`);
  const targetStore = { historicalTargetsV4Version: VALIDATION_VERSIONS.historicalTargetsV4Version, records: targets };
  writeFileSync(TARGETS_V4_PATH, `${JSON.stringify(targetStore, null, 2)}\n`);

  const poolHash = createHash("sha256").update(JSON.stringify({ teamEligibility, pairs })).digest("hex");
  const { path } = writeArtifact("replacement-holdout-candidate-pool", {
    replacementHoldoutSelectionVersion: VALIDATION_VERSIONS.replacementHoldoutSelectionVersion,
    teams: teamEligibility, teamCount: teamEligibility.length,
    eligibleTeams: teamEligibility.filter((t) => t.eligible).length,
    pairs, pairCount: pairs.length,
    eligiblePairs: pairs.filter((p) => p.eligible).length,
    eligiblePairsByEra, erasWithAtLeastTwoEligiblePairs: erasWithTwo,
    meetsMinimum: erasWithTwo === 8,
    candidateZeroOutputsUsed: 0,
    selectionBasis: "Source availability, roster completeness, coach verification, position legality, era coverage, trait observability, confidence, unseen-team and unseen-lineup checks. No fixture in this pool has ever been simulated.",
    poolHash,
  }, {
    generationCommand: "npm run validation:6c3r:pool",
    sourceArtifacts: [`${DIR}/calibration-players-v4.json`, `${DIR}/observability-control-results.json`],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: DIR,
  });

  console.log(`fixtures ${fixtures.length}/${POOL_V4_SPEC.length} eligible · targets ${targets.length}`);
  for (const t of teamEligibility.filter((x) => !x.eligible)) console.log(`  INELIGIBLE ${t.fixtureId}: ${t.reasons.join("; ")}`);
  console.log(`pairs ${pairs.length} (${pairs.filter((p) => p.eligible).length} eligible) · eras with >=2 eligible pairs: ${erasWithTwo}/8`);
  console.log(`by era: ${JSON.stringify(eligiblePairsByEra)}`);
  console.log(`poolHash ${poolHash.slice(0, 16)}...`);
  console.log(`wrote ${CORPUS_V4_PATH}`);
  console.log(`wrote ${TARGETS_V4_PATH}`);
  console.log(`wrote ${path}`);
  process.exit(erasWithTwo === 8 ? 0 : 2);
}
