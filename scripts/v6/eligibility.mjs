#!/usr/bin/env node
// ── WS3 + WS4: freeze V6 eligibility, then build an output-blind pool ───────
//   npm run v6:eligibility
//
// The policy is frozen in this file and hashed into its artifact BEFORE any
// selection runs. Eligibility reads only source characteristics — never a
// Candidate 2 result.
//
// Phase 6C4C1's pool had a real defect this corrects. It added the calibration
// and Historical V3 exclusion lists as raw fixture ids ("h3-1956-57-celtics")
// while keying candidate rows as "Boston Celtics|1956-57", so those two
// exclusions could never match and 24 calibration team-seasons plus 8 consumed
// V3 team-seasons stayed in the pool. Its very first "eligible" row was
// h3-1956-57-celtics, a calibration corpus team. Ids are normalised here.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_DEVELOPMENT_V2, SYNTHETIC_STRESS_HOLDOUT_V2,
  historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { personIdForCard } from "../../src/v3/data/persons.js";
import { POOL_V4_SPEC } from "../../data/validation/corpus-v4-spec.mjs";
import { NEW_V5_SPEC } from "../../data/validation/pool-v5-spec.mjs";
import { POOL_V6_SPEC, POOL_V6_EXPANSION, POOL_V6_WAVE3 } from "../../data/validation/corpus-v6-spec.mjs";
import { TRAIT_TABLE } from "../validation/traitRegistry.mjs";
import { DIR, C1D, B1, B1S, B2R, git, sha } from "./reconcile.mjs";

export const ERAS = Object.freeze(["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);

/** The frozen eligibility policy. Source characteristics only. */
export const ELIGIBILITY = Object.freeze({
  allowedInputs: ["team-season identity", "era", "franchise", "coach identity",
    "coach-season verification", "player-season verification", "position legality",
    "source completeness", "trait observability", "data confidence",
    "opponent availability", "style diversity", "tactical diversity", "era diversity"],
  forbiddenInputs: ["Candidate 2 win rate", "Candidate 2 points per possession",
    "Candidate 2 box scores", "Candidate 2 trait scores", "Candidate 2 action mix",
    "Candidate 2 expected margin", "Candidate 2 probability", "any Candidate 2 result output",
    "similarity to Candidate 1's Historical V5 failures as a selection preference"],
  requirements: {
    minScoreableTraits: 1,
    minProfiledPlayers: 5,
    minDocumentedStarters: 5,
    minPositionsCovered: 4,
    maxLowConfidenceProfiles: 2,
    requireEraStyle: true,
    requireCoachIdentified: true,
    requireCoachNamedOnSeasonPage: true,
    scoreableTraitNote: "a team-season with no scoring-eligible identity trait cannot be scored on any trait, so its side of a matchup would contribute only structural and numeric evidence. The V4 corpus builder already refused such a fixture; the first version of this policy omitted the rule and three selected sides had no scoreable trait at all.",
    coachNote: "coach identity is carried by the fixture spec rather than the player store, and is joined here on the canonical team-season key. Where the spec row exists, the coach must also have been verified as named on that season's own Wikipedia page at store-build time. A team-season with no resolvable, verified coach cannot be selected.",
  },
  hardExclusions: ["historical-calibration-v3", "historical-holdout-v3", "historical-holdout-v4",
    "historical-holdout-v5", "synthetic-development-v2", "synthetic-stress-holdout-v2",
    "candidate-0-calibration-fixtures", "candidate-1-development-fixtures",
    "candidate-2-diagnostic-fixtures", "candidate-2-assisted-offense-controls",
    "candidate-2-defensive-controls", "candidate-2-comparison-fixtures",
    "probability-validation-fixtures", "side-symmetry-fixtures", "era-reference-teams",
    "v6-dry-run-simulated-team-seasons"],
  nearOverlapRules: {
    fiveOfFive: "EXCLUDE — the same five people is the same lineup whatever the ids say",
    fourOfFive: "EXCLUDE — one substitution away from a seen lineup is a proxy for it",
    threeOfFive: "ALLOW, recorded — three shared people out of five is a different team",
    aliasSameTeamSeason: "EXCLUDE — normalised by canonical team and season, so an alias cannot slip through",
    sameFiveDifferentSlots: "EXCLUDE — lineup identity is the unordered person set, not the slot assignment",
    sameTeamAndCoachSeasonTrivialDifference: "EXCLUDE at 4/5 or above; below that the roster genuinely differs",
    canonicalPersonOverlap: "every comparison is made on canonical person ids, not card or calibration-player ids, so a person appearing under two ids cannot disguise an overlap",
  },
  outputBlind: true,
  candidate2SimulationsPermitted: 0,
});

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Canonical team-season key. Tolerant of both id shapes. */
export const tsKey = (teamName, season) => `${norm(teamName)}|${norm(season)}`;
export const person = (id) => personIdForCard(id) ?? id;
/** A calibration-player id carries its person in the last segment. */
export const calPerson = (id) => {
  const parts = String(id).split(":");
  return parts.length >= 4 ? parts.slice(3).join(":") : String(id);
};
export const lineupKey = (people) => [...new Set(people)].sort().join("|");

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  // ── the universe: every profiled team-season this repository holds ──────
  //
  // Phase 6C4C1 drew the universe from the corpus and the prior holdout
  // manifests alone. Every team-season in those is consumed, so applying the
  // exclusion set correctly leaves nothing: the corrected policy scored 0
  // eligible against that universe, which is the honest answer to the wrong
  // question. The player stores also hold profiled team-seasons that were
  // built but never bound into any set, and WS4 ingested 7 more to close the
  // era gaps. Those unbound team-seasons are the real candidate universe.
  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const v4man = artifactExists("historical-holdout-v4-manifest", "data/validation/6c3r")
    ? readArtifact("historical-holdout-v4-manifest", "data/validation/6c3r").data : null;
  const v5man = readArtifact("historical-holdout-v5-manifest", B1).data;
  const refs = readArtifact("era-reference-certification-candidate1", B1).data.references;

  const PLAYER_STORES = Object.freeze([
    { origin: "CALIBRATION_PLAYER_STORE_V3", path: "data/calibration/calibration-players-v3.json" },
    { origin: "CALIBRATION_PLAYER_STORE_V4", path: "data/validation/6c3r/calibration-players-v4.json" },
    { origin: "CALIBRATION_PLAYER_STORE_V5", path: "data/validation/6c4a/calibration-players-v5.json" },
    { origin: "CALIBRATION_PLAYER_STORE_V6", path: `${DIR}/calibration-players-v6.json` },
  ]);
  // fixture specs carry team, season, era and coach identity; the stores carry
  // the profiles and the season-page coach verification made when built.
  const specByKey = new Map(), specByFixture = new Map();
  for (const f of [...POOL_V4_SPEC, ...NEW_V5_SPEC, ...POOL_V6_SPEC, ...POOL_V6_EXPANSION, ...POOL_V6_WAVE3]) {
    specByKey.set(tsKey(f.teamName, f.season), f); specByFixture.set(f.fixtureId, f);
  }
  const coachVerified = new Map();

  const universe = new Map();
  const upsert = (key, seed) => {
    if (!universe.has(key)) universe.set(key, { key, ...seed, players: [], people: [], origins: [] });
    return universe.get(key);
  };
  /** One profile, in whichever shape its source uses. */
  const addPerson = (t, p) => {
    const id = calPerson(p.calibrationPlayerId);
    if (t.people.includes(id)) return;
    t.people.push(id);
    t.players.push({ person: id,
      position: p.assignedPosition ?? p.primaryPosition ?? null,
      role: p.historicalRole ?? p.lineupRole ?? null,
      confidence: p.confidence ?? null });
  };
  const addFixture = (f, origin) => {
    const t = upsert(tsKey(f.teamName, f.season), { fixtureId: f.fixtureId ?? null,
      teamId: f.teamId, teamName: f.teamName, season: f.season,
      era: f.eraStyleId, coachId: f.coachId ?? null });
    for (const p of (f.players ?? [])) addPerson(t, p);
    if (!t.origins.includes(origin)) t.origins.push(origin);
  };
  for (const f of corpus.fixtures) addFixture(f, "historical-corpus-v3");
  for (const m of v5man.matchups) for (const s of [m.teamA, m.teamB]) addFixture(s, "historical-holdout-v5");
  if (v4man) for (const m of (v4man.matchups ?? [])) for (const s of [m.teamA, m.teamB].filter(Boolean)) addFixture(s, "historical-holdout-v4");
  const storeStats = [];
  for (const st of PLAYER_STORES) {
    if (!existsSync(st.path)) { storeStats.push({ ...st, present: false, profiles: 0, teamSeasons: 0 }); continue; }
    const raw = JSON.parse(readFileSync(st.path, "utf8"));
    const store = raw.data ?? raw;
    for (const c of (store.coachChecks ?? [])) coachVerified.set(c.fixtureId, c);
    const keys = new Set();
    for (const pr of (store.profiles ?? [])) {
      const key = tsKey(pr.teamName, pr.season); keys.add(key);
      const spec = specByKey.get(key) ?? null;
      const t = upsert(key, { fixtureId: spec?.fixtureId ?? null, teamId: pr.teamId,
        teamName: pr.teamName, season: pr.season, era: pr.eraStyleId, coachId: spec?.coachId ?? null });
      t.era ??= pr.eraStyleId; t.coachId ??= spec?.coachId ?? null;
      t.fixtureId ??= spec?.fixtureId ?? null;
      addPerson(t, pr);
      if (!t.origins.includes(st.origin)) t.origins.push(st.origin);
    }
    storeStats.push({ origin: st.origin, path: st.path, present: true,
      profiles: (store.profiles ?? []).length, teamSeasons: keys.size,
      coachChecks: (store.coachChecks ?? []).length, storeHash: store.storeHash ?? null });
  }

  // Team-seasons Candidate 2 has already simulated outside a formal run. Read
  // from the recorded evidence rather than hand-listed, so the exclusion cannot
  // drift from what actually happened.
  const taintPath = `${DIR}/v6-dry-run-taint.json`;
  const taint = existsSync(taintPath) ? JSON.parse(readFileSync(taintPath, "utf8")) : null;
  const taintedKeys = new Set((taint?.taintedTeamSeasons ?? []).map((t) => t.key));

  // ── the exclusion sets, all normalised ──────────────────────────────────
  const calibIds = new Set(historicalCalibrationV3Ids());
  const v3Ids = new Set(HISTORICAL_HOLDOUT_V3_IDS);
  const seenTeamSeasons = new Map();   // key -> reasons
  const seenLineups = new Map();       // lineupKey -> {origin, teamName, season}
  const markTs = (key, reason) => {
    if (!seenTeamSeasons.has(key)) seenTeamSeasons.set(key, new Set());
    seenTeamSeasons.get(key).add(reason);
  };
  for (const f of corpus.fixtures) {
    const key = tsKey(f.teamName, f.season);
    const people = (f.players ?? []).map((p) => calPerson(p.calibrationPlayerId));
    if (calibIds.has(f.fixtureId)) { markTs(key, "HISTORICAL_CALIBRATION_V3"); seenLineups.set(lineupKey(people), { origin: "HISTORICAL_CALIBRATION_V3", teamName: f.teamName, season: f.season }); }
    if (v3Ids.has(f.fixtureId)) { markTs(key, "HISTORICAL_HOLDOUT_V3"); seenLineups.set(lineupKey(people), { origin: "HISTORICAL_HOLDOUT_V3", teamName: f.teamName, season: f.season }); }
  }
  for (const m of v5man.matchups) for (const s of [m.teamA, m.teamB]) {
    const key = tsKey(s.teamName, s.season);
    markTs(key, "HISTORICAL_HOLDOUT_V5");
    seenLineups.set(lineupKey(s.players.map((p) => calPerson(p.calibrationPlayerId))),
      { origin: "HISTORICAL_HOLDOUT_V5", teamName: s.teamName, season: s.season });
  }
  if (v4man) for (const m of (v4man.matchups ?? [])) for (const s of [m.teamA, m.teamB].filter(Boolean)) {
    const key = tsKey(s.teamName, s.season);
    markTs(key, "HISTORICAL_HOLDOUT_V4");
    seenLineups.set(lineupKey((s.players ?? []).map((p) => calPerson(p.calibrationPlayerId))),
      { origin: "HISTORICAL_HOLDOUT_V4", teamName: s.teamName, season: s.season });
  }
  // era references and every public-card development five
  for (const r of refs) seenLineups.set(lineupKey(r.five.map((p) => p.person ?? p)), { origin: "ERA_REFERENCE", teamName: `era reference ${r.era}`, season: r.era });
  for (const f of SYNTHETIC_DEVELOPMENT_V2) seenLineups.set(lineupKey(f.five.map(person)), { origin: "SYNTHETIC_DEVELOPMENT_V2", teamName: f.id, season: f.era });
  for (const f of SYNTHETIC_STRESS_HOLDOUT_V2) seenLineups.set(lineupKey(f.five.map(person)), { origin: "SYNTHETIC_STRESS_HOLDOUT_V2", teamName: f.id, season: f.era });
  // Candidate 2's own controls and comparison fixtures
  const c2measure = existsSync(`${C1D}/measurement-candidate2.json`)
    ? JSON.parse(readFileSync(`${C1D}/measurement-candidate2.json`, "utf8")) : null;
  const C2_ROSTERS = ["passingHub", "isoHeavy", "secondaryHigh", "secondaryLow", "strongDefence",
    "weakDefence", "rimStrong", "perimStrong", "rebStrong", "pressStrong", "neutralOpp"];
  const c2Src = readFileSync("scripts/candidate2/measure.mjs", "utf8");
  const c2Lineups = [];
  for (const r of C2_ROSTERS) {
    const m = c2Src.match(new RegExp(`${r}:\\s*\\[([^\\]]+)\\]`));
    if (!m) continue;
    const ids = m[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    c2Lineups.push({ roster: r, ids });
    seenLineups.set(lineupKey(ids.map(person)), { origin: "CANDIDATE_2_CONTROL_FIXTURE", teamName: r, season: "n/a" });
  }

  // Scoring eligibility comes from the Candidate 2 observability certification
  // when it exists. Before it does, the policy still records the requirement and
  // resolves it against the trait registry alone, so the field is never silently
  // absent — an unresolvable requirement would pass every team by default.
  const obsPath = `${DIR}/historical-v6-observability-certification.json`;
  const obs = existsSync(obsPath) ? JSON.parse(readFileSync(obsPath, "utf8")).data : null;
  const scoringEligible = obs
    ? new Set(obs.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId))
    : new Set(Object.entries(TRAIT_TABLE).filter(([, t]) => t.claim?.metric).map(([id]) => id));
  const traitBasis = obs ? "CANDIDATE_2_OBSERVABILITY_CERTIFICATION" : "TRAIT_REGISTRY_CLAIMS_ONLY";
  const scoreableOf = (key) => {
    const spec = specByKey.get(key) ?? null;
    if (!spec?.identity) return { traits: [], metrics: [] };
    const desc = [spec.identity.pace, spec.identity.offense, spec.identity.defense, ...(spec.identity.tags ?? [])];
    const traits = desc.filter((d) => scoringEligible.has(d));
    return { traits, metrics: [...new Set(traits.map((t) => TRAIT_TABLE[t]?.claim?.metric).filter(Boolean))] };
  };

  // ── evaluate every team-season ──────────────────────────────────────────
  const rows = [];
  for (const t of universe.values()) {
    const reasons = [...(seenTeamSeasons.get(t.key) ?? [])];
    const starters = t.players.filter((p) => p.role === "STARTER" || Boolean(p.position));
    const slots = new Set(t.players.map((p) => p.position).filter(Boolean));
    const lowConf = t.players.filter((p) => String(p.confidence ?? "").startsWith("LOW")).length;
    if (t.players.length < ELIGIBILITY.requirements.minProfiledPlayers) reasons.push("FEWER_THAN_FIVE_PROFILED_PLAYERS");
    if (starters.length < ELIGIBILITY.requirements.minDocumentedStarters) reasons.push("FEWER_THAN_FIVE_DOCUMENTED_STARTERS");
    if (slots.size < ELIGIBILITY.requirements.minPositionsCovered) reasons.push("INSUFFICIENT_POSITIONAL_COVERAGE");
    if (lowConf > ELIGIBILITY.requirements.maxLowConfidenceProfiles) reasons.push("TOO_MANY_LOW_CONFIDENCE_PROFILES");
    if (!t.era || !ERAS.includes(t.era)) reasons.push("NO_ERA_STYLE");
    if (!t.coachId) reasons.push("NO_RESOLVABLE_COACH");
    // where a fixture spec named the coach, the store must also have found the
    // coach named on that season's own page. Unverified is not a pass.
    if (t.fixtureId && specByFixture.has(t.fixtureId)
      && coachVerified.get(t.fixtureId)?.named !== true) reasons.push("COACH_NOT_VERIFIED_ON_SEASON_PAGE");
    if (taintedKeys.has(t.key)) reasons.push("SIMULATED_DURING_V6_DRY_RUN");
    const sc = scoreableOf(t.key);
    if (sc.traits.length < ELIGIBILITY.requirements.minScoreableTraits) reasons.push("NO_SCOREABLE_IDENTITY_TRAIT");

    // near-overlap against every seen lineup, on canonical people
    const mine = new Set(t.people);
    let worst = { shared: 0, origin: null, against: null };
    for (const [lk, meta] of seenLineups) {
      const shared = lk.split("|").filter((p) => mine.has(p)).length;
      if (shared > worst.shared) worst = { shared, origin: meta.origin, against: `${meta.teamName} ${meta.season}` };
    }
    if (worst.shared >= 5) reasons.push("FIVE_OF_FIVE_LINEUP_OVERLAP");
    else if (worst.shared === 4) reasons.push("FOUR_OF_FIVE_LINEUP_PROXY");

    rows.push({ ...t, players: undefined, documentedStarters: starters.length,
      scoreableTraits: sc.traits, scoreableMetrics: sc.metrics,
      positionsCovered: slots.size, lowConfidenceProfiles: lowConf,
      profiledPlayers: t.people.length,
      nearestSeenLineup: worst, exclusionReasons: [...new Set(reasons)],
      eligible: reasons.length === 0, candidate2SimulationsUsed: 0 });
  }
  const eligible = rows.filter((r) => r.eligible);
  const excluded = rows.filter((r) => !r.eligible);
  const byEra = Object.fromEntries(ERAS.map((e) => [e, eligible.filter((x) => x.era === e).length]));
  // pairs an era can form, not matchups it can host: with n eligible teams the
  // distinct unordered pairs are C(n,2), so 2 pairs needs n >= 3. An earlier
  // floor(n/2) counted simultaneous matchups instead and understated the pool.
  const pairsByEra = Object.fromEntries(ERAS.map((e) => [e, (byEra[e] * (byEra[e] - 1)) / 2]));
  const franchises = new Set(eligible.map((x) => x.teamId));
  const coaches = new Set(eligible.map((x) => x.coachId));

  console.log("HISTORICAL V6 ELIGIBILITY — policy frozen before selection\n");
  console.log(`  universe: ${universe.size} team-seasons — the corpus, every prior holdout manifest, and all ${storeStats.filter((s) => s.present).length} calibration player stores`);
  for (const s of storeStats) console.log(`    ${s.present ? " " : "-"} ${s.origin.padEnd(28)} ${String(s.profiles).padStart(4)} profiles  ${String(s.teamSeasons).padStart(3)} team-seasons`);
  console.log(`  eligible: ${eligible.length}   excluded: ${excluded.length}`);
  console.log(`  franchises ${franchises.size}, coaches ${coaches.size}\n`);
  for (const e of ERAS) console.log(`    ${e}  ${String(byEra[e]).padStart(2)} teams  ${pairsByEra[e]} pairs`);
  const reasonCounts = {};
  for (const x of excluded) for (const r of x.exclusionReasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  console.log(`\n  exclusion reasons: ${Object.entries(reasonCounts).map(([k, v]) => `${k} ${v}`).join(", ")}\n`);

  gate("policyFrozenBeforeSelection", !artifactExists("historical-v6-selection", DIR),
    "no selection artifact exists at the time this policy is written");
  gate("eligibilityIsOutputBlind",
    ELIGIBILITY.outputBlind === true && ELIGIBILITY.candidate2SimulationsPermitted === 0
    && eligible.every((x) => x.candidate2SimulationsUsed === 0),
    `${ELIGIBILITY.allowedInputs.length} allowed source inputs, ${ELIGIBILITY.forbiddenInputs.length} forbidden output inputs, 0 simulations`);
  gate("calibrationAndPriorHoldoutExclusionsActuallyFire",
    (reasonCounts.HISTORICAL_CALIBRATION_V3 ?? 0) > 0 && (reasonCounts.HISTORICAL_HOLDOUT_V3 ?? 0) > 0
    && (reasonCounts.HISTORICAL_HOLDOUT_V5 ?? 0) > 0,
    `calibration ${reasonCounts.HISTORICAL_CALIBRATION_V3 ?? 0}, V3 ${reasonCounts.HISTORICAL_HOLDOUT_V3 ?? 0}, V5 ${reasonCounts.HISTORICAL_HOLDOUT_V5 ?? 0} — the Phase 6C4C1 pool matched none of the first two because it compared raw fixture ids against name-and-season keys`);
  gate("noEligibleTeamIsASeenTeamSeason",
    eligible.every((x) => !seenTeamSeasons.has(x.key)),
    `${eligible.length} eligible team-seasons, none appearing in any prior set`);
  gate("noEligibleTeamIsAFourOfFiveProxy",
    eligible.every((x) => x.nearestSeenLineup.shared <= 3),
    `largest shared-person count against any seen lineup among eligible teams: ${Math.max(...eligible.map((x) => x.nearestSeenLineup.shared), 0)} of 5`);
  gate("everyEligibleTeamHasAResolvableCoach",
    eligible.every((x) => Boolean(x.coachId)),
    `${new Set(eligible.map((x) => x.coachId)).size} distinct coaches across ${eligible.length} teams`);
  gate("minimumPoolSize", eligible.length >= 24,
    `${eligible.length} eligible teams (target 30, minimum 24)`);
  gate("minimumPairsPerEra", ERAS.every((e) => pairsByEra[e] >= 2),
    ERAS.map((e) => `${e} ${pairsByEra[e]}`).join(", "));
  gate("everyEraRepresented", ERAS.every((e) => byEra[e] > 0), `${ERAS.filter((e) => byEra[e] > 0).length}/8 eras`);
  gate("everyEligibleTeamHasAScoreableTrait", eligible.every((x) => x.scoreableTraits.length >= 1),
    `${eligible.length} eligible teams, fewest scoreable traits on any one of them ${eligible.length ? Math.min(...eligible.map((x) => x.scoreableTraits.length)) : 0} · basis ${traitBasis}`);
  gate("everyKnownSimulatedTeamSeasonExcluded",
    [...taintedKeys].every((k) => !eligible.some((x) => x.key === k)),
    taintedKeys.size
      ? `${taintedKeys.size} team-season(s) simulated during the version-1 runner dry run are excluded: ${[...taintedKeys].join(", ")} — the V6 seal caught this and refused, and the seal's claim that Candidate 2 has never simulated a selected team-season is kept true rather than weakened`
      : "no team-season has been simulated outside a formal run");
  gate("poolCoversBothRepairedMechanisms",
    eligible.some((x) => x.scoreableMetrics.includes("assistedRate"))
    && eligible.some((x) => x.scoreableMetrics.includes("refPppVsTeam")),
    `assistedRate claimed by ${eligible.filter((x) => x.scoreableMetrics.includes("assistedRate")).length} teams, refPppVsTeam by ${eligible.filter((x) => x.scoreableMetrics.includes("refPppVsTeam")).length} — the pool must be able to observe both mechanisms 6C4C1 repaired, or selection cannot cover them`);

  const policyPayload = {
    historicalV6EligibilityPolicyVersion: "3.0.0",
    supersedes: [
      { version: "1.0.0", artifact: `${DIR}/superseded/historical-v6-eligibility-policy-v1.json`,
        whatChanged: "adds minScoreableTraits. Version 1 omitted the rule the V4 corpus builder already had, so three of the sixteen sides the first selection chose had no scoring-eligible identity trait at all.",
        notOverwritten: true },
      { version: "2.0.0", artifact: `${DIR}/superseded/historical-v6-eligibility-policy-v2.json`,
        whatChanged: "adds SIMULATED_DURING_V6_DRY_RUN. The version-1 runner dry run built its evaluator from the real first V6 matchup and played 384 games against it, so Boston Celtics 1950-51 and Minneapolis Lakers 1955-56 had been simulated by Candidate 2 outside the formal run. The V6 seal caught it and refused.",
        notOverwritten: true },
    ],
    simulatedTeamSeasonExclusion: taint
      ? { source: taintPath, excluded: [...taintedKeys], evidence: taint.evidence.artifact }
      : { source: null, excluded: [] },
    scoringEligibilityBasis: traitBasis,
    frozenBeforeSelection: true,
    ...ELIGIBILITY,
    exclusionSetsResolved: {
      historicalCalibrationV3: calibIds.size, historicalHoldoutV3: v3Ids.size,
      historicalHoldoutV4: v4man ? (v4man.matchups ?? []).length * 2 : 0,
      historicalHoldoutV5: v5man.matchups.length * 2,
      eraReferences: refs.length, syntheticDevelopmentV2: SYNTHETIC_DEVELOPMENT_V2.length,
      syntheticStressHoldoutV2: SYNTHETIC_STRESS_HOLDOUT_V2.length,
      candidate2ControlFixtures: c2Lineups.length,
      seenTeamSeasonKeys: seenTeamSeasons.size, seenLineupKeys: seenLineups.size,
    },
    universeSources: storeStats,
    scoringEligibilityBasis: traitBasis,
    universeNote: "the corpus and the prior holdout manifests supply the exclusion set; the calibration player stores supply the candidates. A universe of consumed team-seasons alone yields 0 eligible, which is what the corrected policy returned before the stores were read.",
    priorPhaseDefectCorrected: {
      what: "Phase 6C4C1's pool added the calibration and Historical V3 exclusion lists as raw fixture ids while keying candidate rows as team-name-and-season, so neither exclusion could ever match.",
      consequence: "24 calibration team-seasons and 8 consumed Historical V3 team-seasons remained in that pool. Its first eligible row was h3-1956-57-celtics, a calibration corpus team.",
      correction: "every id is normalised to a canonical team-and-season key, and every lineup comparison is made on canonical person ids.",
      alsoAdded: "near-overlap protection at 5/5 and 4/5, era-reference and Candidate 2 control-fixture lineups, and a resolvable-coach requirement.",
    },
    normalisation: { teamSeasonKey: "lowercased team name and season with non-alphanumerics stripped",
      lineupKey: "the sorted, de-duplicated set of canonical person ids",
      personResolution: "calibration-player ids resolve to their person segment; public card ids resolve through the person store" },
  };
  policyPayload.policyHash = createHash("sha256").update(JSON.stringify({
    e: ELIGIBILITY, sets: policyPayload.exclusionSetsResolved })).digest("hex");
  writeArtifact("historical-v6-eligibility-policy", policyPayload, {
    generationCommand: "npm run v6:eligibility", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const poolPayload = {
    historicalV6PoolVersion: "4.0.0",
    supersedes: { artifact: `${C1D}/historical-v6-candidate-pool.json`, version: "1.0.0",
      why: policyPayload.priorPhaseDefectCorrected.what, notOverwritten: true },
    eligibilityPolicyHash: policyPayload.policyHash,
    candidate2OutputUsed: false, candidate2SimulationsUsedForEligibility: 0,
    universeSize: universe.size, universeSources: storeStats, eligibleCount: eligible.length, excludedCount: excluded.length,
    eligible, excluded,
    byEra, pairsByEra,
    coverage: { eras: ERAS.filter((e) => byEra[e] > 0).length, franchises: franchises.size,
      coaches: coaches.size, franchiseList: [...franchises].sort(), coachList: [...coaches].sort() },
    exclusionReasonCounts: reasonCounts,
    targets: { targetTeams: 30, minimumTeams: 24, targetPairsPerEra: 3, minimumPairsPerEra: 2,
      pairsDefinition: "C(n,2) distinct unordered pairs among the n eligible teams of an era" },
    pass: fail.length === 0, failedGates: fail,
  };
  poolPayload.poolHash = createHash("sha256").update(JSON.stringify(eligible.map((x) => x.key).sort())).digest("hex");
  writeArtifact("historical-v6-expanded-pool", poolPayload, {
    generationCommand: "npm run v6:eligibility", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("historical-v6-pool-audit", {
    historicalV6PoolAuditVersion: "1.0.0",
    eligibilityPolicyHash: policyPayload.policyHash, poolHash: poolPayload.poolHash,
    perTeamNearOverlap: rows.map((r) => ({ key: r.key, teamName: r.teamName, season: r.season,
      era: r.era, coachId: r.coachId, eligible: r.eligible,
      sharedWithNearestSeenLineup: r.nearestSeenLineup.shared,
      nearestSeenOrigin: r.nearestSeenLineup.origin, nearestSeenLineup: r.nearestSeenLineup.against,
      exclusionReasons: r.exclusionReasons })),
    nearOverlapDistribution: Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) =>
      [`shared_${n}`, rows.filter((r) => r.nearestSeenLineup.shared === n).length])),
    exceptionsGranted: [],
    exceptionPolicy: "none granted. Any 4/5 or 5/5 proxy is excluded outright; a documented exception would have to name the team, the proxy it resembles and the reason, and none was needed.",
    candidate2SimulationsUsedForEligibility: 0,
  }, { generationCommand: "npm run v6:eligibility", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nELIGIBILITY: ${poolPayload.pass ? "FROZEN, POOL READY" : `FAIL (${fail.join(", ")})`}`);
  console.log(`  policyHash ${policyPayload.policyHash.slice(0, 16)}...  poolHash ${poolPayload.poolHash.slice(0, 16)}...`);
  process.exit(poolPayload.pass ? 0 : 2);
}
