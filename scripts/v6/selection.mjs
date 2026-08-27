#!/usr/bin/env node
// ── WS5 + WS6: freeze the selection rule, then apply it ─────────────────────
//   npm run v6:selection
//
// The policy is written and hashed BEFORE any pair is scored, and the artifact
// records that no selection artifact existed at the time. Selection reads the
// frozen pool and nothing else: no Candidate 2 output, no simulation, no
// similarity to Candidate 1's Historical V5 failures.
//
// The rule is a total order over fully-enumerated pairs, so reorder stability
// holds by construction — permuting the pool cannot change the argmax. WS6
// proves it empirically anyway, because "by construction" is a claim and the
// permutation test is evidence.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR } from "./reconcile.mjs";
import { ERAS } from "./eligibility.mjs";
import { V6_SPEC_ALL } from "./buildPlayersV6.mjs";
import { POOL_V4_SPEC } from "../../data/validation/corpus-v4-spec.mjs";
import { NEW_V5_SPEC } from "../../data/validation/pool-v5-spec.mjs";

/** The frozen selection rule. Source characteristics only, no outputs. */
/**
 * The two mechanisms Phase 6C4C1 repaired, and therefore the two a Historical V6
 * verdict has to be able to observe. Version 1 of this policy did not require
 * coverage, and its selection covered NEITHER: the preference order maximised
 * tactical distance and freshness, which happened to pass over every pool team
 * carrying an assistedRate or refPppVsTeam claim. A holdout that cannot observe
 * the repair cannot validate it — V6 would have been a weaker test than the V5
 * it replaces, on exactly the two metrics V5 failed.
 */
export const REQUIRED_METRIC_COVERAGE = Object.freeze([
  { metric: "assistedRate", repairedBy: "c2-01/c2-02 assisted-offense movement lift",
    v5Failure: "ASSISTED_OFFENSE_EXPRESSION cluster, v5m-2000s teamB" },
  { metric: "refPppVsTeam", repairedBy: "c2-03 defensive help suppression and scheme transfer",
    v5Failure: "DEFENSIVE_SUPPRESSION cluster, v5m-2020s teamA" },
]);

export const SELECTION = Object.freeze({
  historicalV6SelectionPolicyVersion: "2.0.0",
  supersedes: { version: "1.0.0", artifact: "superseded/historical-v6-selection-policy-v1.json",
    whatChanged: "adds a scoreable-trait constraint per side and whole-selection coverage of both repaired mechanisms, plus a metric-breadth preference. Version 1's selection covered neither repaired mechanism and included three sides with no scoreable trait. Found before any V6 game was played, so nothing here is result-aware.",
    notOverwritten: true },
  shape: { matchups: 8, oneMatchupPerEraStyle: true, distinctTeamSeasons: 16,
    bothSidesSameEraStyle: true,
    whySameEra: "an Era Style matchup tests that era's construction against itself. Cross-era pairing would confound the era rules with the roster comparison, and Historical V5 was built the same way." },
  hardConstraints: [
    "both sides drawn from the frozen eligible pool",
    "both sides in the same Era Style as the matchup",
    "the two sides are different franchises",
    "the two sides have different coaches",
    "no team-season appears in more than one matchup",
    "every Era Style receives exactly one matchup",
    "every selected side has at least one scoring-eligible identity trait",
    "the sixteen selected sides together claim every metric in REQUIRED_METRIC_COVERAGE",
  ],
  /**
   * Applied in order. Every term is a source characteristic. Higher is better;
   * the first non-zero difference decides, so this is a strict lexicographic
   * preference, not a weighted sum whose weights could be tuned to an outcome.
   */
  preferenceOrder: [
    { key: "tacticalDistance", direction: "MAXIMISE",
      what: "count of differing identity descriptors — pace, offense, defense, and symmetric difference of style tags",
      why: "a matchup between two teams that play the same way cannot separate offensive from defensive attribution. This is the mirror-fixture problem that cost Historical V5 a one-time holdout." },
    { key: "freshness", direction: "MAXIMISE",
      what: "10 minus the summed shared-person count of both sides against their nearest seen lineup",
      why: "prefer the two team-seasons furthest from anything any prior set has seen." },
    { key: "coachDistinctnessAcrossSelection", direction: "MAXIMISE",
      what: "1 if neither coach already appears in an earlier-era selection, else 0",
      why: "spreads coach identity across the set instead of concentrating it." },
    { key: "newMetricCoverage", direction: "MAXIMISE",
      what: "count of certified metrics this pair claims that no earlier-era selection already claims",
      why: "spreads the scored metrics across the set instead of testing pace eight times. Eras are processed in fixed chronological order, so this term is deterministic." },
    { key: "sourceCompleteness", direction: "MAXIMISE",
      what: "count of profiles across both sides at MEDIUM_HIGH confidence",
      why: "prefer the better-sourced pair when the preceding terms tie." },
  ],
  coverageRepair: {
    when: "the per-era preference pass leaves a REQUIRED_METRIC_COVERAGE metric unclaimed by all sixteen sides",
    how: "for each uncovered metric, every era and every valid pair in that era that would cover it is enumerated with the rank it holds in its own era's preference ordering. The substitution with the smallest rank loss is applied, tie-broken by chronological era order then by the pair's tie hash. Repeat until covered or no pair can cover it.",
    why: "the constraint is on the selection as a whole, so it cannot be enforced by a per-era greedy pass. Minimising rank loss keeps the deviation from the preference order as small as the constraint allows, and the enumeration is total so the repair is reorder-stable like the rest.",
    ifImpossible: "SELECTION_CANNOT_COVER_REPAIRED_MECHANISM — a hard failure, not a waiver. It would mean the pool cannot observe the repair, which is a pool defect to fix before sealing.",
  },
  tieBreak: {
    rule: "sha256 of `${eraStyleId}|${keyA}|${keyB}` with the two keys sorted, compared as a hex string, lowest wins",
    why: "a total order that depends only on identity, so it is stable under any input permutation and cannot be steered by a result.",
  },
  eraOrder: "eras are selected in fixed chronological order so that coachDistinctnessAcrossSelection is deterministic rather than order-dependent",
  forbidden: [
    "any Candidate 2 output", "any simulation", "expected margin", "expected win rate",
    "similarity to a Historical V5 failing matchup", "operator choice at selection time",
    "randomness of any kind",
  ],
  candidate2SimulationsPermitted: 0,
});

const H = (s) => createHash("sha256").update(s).digest("hex");
const norm = (v) => String(v ?? "").trim().toLowerCase();

/** Differing identity descriptors between two teams. Source-side only. */
export const tacticalDistance = (a, b) => {
  let d = 0;
  for (const f of ["pace", "offense", "defense"]) if (norm(a.identity?.[f]) !== norm(b.identity?.[f])) d += 1;
  const ta = new Set((a.identity?.tags ?? []).map(norm)), tb = new Set((b.identity?.tags ?? []).map(norm));
  for (const t of ta) if (!tb.has(t)) d += 1;
  for (const t of tb) if (!ta.has(t)) d += 1;
  return d;
};

/** The lexicographic score vector for a candidate pair. */
export const pairMetrics = (a, b) => [...new Set([...(a.scoreableMetrics ?? []), ...(b.scoreableMetrics ?? [])])];

export const scorePair = (a, b, coachesUsed, metricsUsed) => [
  tacticalDistance(a, b),
  10 - ((a.sharedWithNearestSeenLineup ?? 0) + (b.sharedWithNearestSeenLineup ?? 0)),
  (coachesUsed.has(a.coachId) || coachesUsed.has(b.coachId)) ? 0 : 1,
  pairMetrics(a, b).filter((m) => !metricsUsed.has(m)).length,
  (a.mediumHighProfiles ?? 0) + (b.mediumHighProfiles ?? 0),
];

const cmp = (x, y) => { for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };

/**
 * Deterministic selection. `teams` may arrive in any order; the result cannot
 * depend on it, because every era's pairs are fully enumerated and reduced by a
 * total order whose final term is a hash of identity alone.
 */
/** Every valid pair in one era, fully enumerated and totally ordered. */
const rankedPairs = (teams, era, coachesUsed, metricsUsed) => {
  const pool = teams.filter((t) => t.era === era);
  const out = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const [a, b] = [pool[i], pool[j]];
      if (a.teamId === b.teamId) continue;                                  // same franchise
      if (a.coachId === b.coachId) continue;                                // same coach
      if (!(a.scoreableTraits ?? []).length || !(b.scoreableTraits ?? []).length) continue;
      const [k1, k2] = [a.key, b.key].sort();
      out.push({ era, a, b, score: scorePair(a, b, coachesUsed, metricsUsed), tie: H(`${era}|${k1}|${k2}`) });
    }
  }
  out.sort((x, y) => cmp(x.score, y.score) || (x.tie < y.tie ? -1 : x.tie > y.tie ? 1 : 0));
  return out;
};

/**
 * Deterministic selection. `teams` may arrive in any order; the result cannot
 * depend on it, because every era's pairs are fully enumerated and reduced by a
 * total order whose final term is a hash of identity alone. The coverage repair
 * is enumerated the same way, so it is reorder-stable too.
 */
export const select = (teams) => {
  const chosen = [], coachesUsed = new Set(), metricsUsed = new Set(), used = new Set();
  const ranked = {};
  for (const era of ERAS) {
    const rp = rankedPairs(teams.filter((t) => !used.has(t.key)), era, coachesUsed, metricsUsed);
    ranked[era] = rp;
    const best = rp[0] ?? null;
    if (!best) { chosen.push({ era, unsatisfiable: true }); continue; }
    const [sa, sb] = [best.a, best.b].sort((x, y) => (x.key < y.key ? -1 : 1));
    chosen.push({ era, teamA: sa, teamB: sb, score: best.score, tieHash: best.tie, rankInEra: 0 });
    used.add(sa.key); used.add(sb.key);
    coachesUsed.add(sa.coachId); coachesUsed.add(sb.coachId);
    for (const m of pairMetrics(sa, sb)) metricsUsed.add(m);
  }

  // ── coverage repair ─────────────────────────────────────────────────────
  const repairs = [];
  const covered = () => new Set(chosen.filter((c) => !c.unsatisfiable)
    .flatMap((c) => pairMetrics(c.teamA, c.teamB)));
  for (const req of REQUIRED_METRIC_COVERAGE) {
    if (covered().has(req.metric)) continue;
    // every (era, pair) that would cover it, with the rank it holds in its era
    const options = [];
    for (const [ei, era] of ERAS.entries()) {
      const rp = rankedPairs(teams, era, new Set(), new Set());   // era-local ordering
      for (const [rank, cand] of rp.entries()) {
        if (!pairMetrics(cand.a, cand.b).includes(req.metric)) continue;
        options.push({ era, eraIndex: ei, rank, cand });
      }
    }
    options.sort((x, y) => x.rank - y.rank || x.eraIndex - y.eraIndex
      || (x.cand.tie < y.cand.tie ? -1 : x.cand.tie > y.cand.tie ? 1 : 0));
    const pick = options[0] ?? null;
    if (!pick) { repairs.push({ metric: req.metric, applied: false, reason: "SELECTION_CANNOT_COVER_REPAIRED_MECHANISM" }); continue; }
    const slot = chosen.findIndex((c) => c.era === pick.era);
    const before = chosen[slot];
    const [sa, sb] = [pick.cand.a, pick.cand.b].sort((x, y) => (x.key < y.key ? -1 : 1));
    chosen[slot] = { era: pick.era, teamA: sa, teamB: sb, score: pick.cand.score,
      tieHash: pick.cand.tie, rankInEra: pick.rank, coverageRepaired: req.metric };
    repairs.push({ metric: req.metric, applied: true, era: pick.era, rankLoss: pick.rank,
      replaced: before.unsatisfiable ? null : `${before.teamA.key} vs ${before.teamB.key}`,
      with: `${sa.key} vs ${sb.key}` });
  }
  // a repair may have introduced a team-season already used in another era; with
  // one matchup per era and eras disjoint by construction this cannot happen,
  // but assert it rather than trust it
  const keys = chosen.filter((c) => !c.unsatisfiable).flatMap((c) => [c.teamA.key, c.teamB.key]);
  const duplicated = keys.length !== new Set(keys).size;
  return Object.assign(chosen, { coverageRepairs: repairs, duplicatedAfterRepair: duplicated });
};

/** A deterministic permutation, so the stability proof needs no randomness. */
const permute = (arr, salt) => [...arr]
  .map((t) => ({ t, k: H(`${salt}|${t.key}`) }))
  .sort((x, y) => (x.k < y.k ? -1 : 1)).map((x) => x.t);

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const selectionExisted = artifactExists("historical-v6-selection", DIR);
  const policyPayload = { ...SELECTION, frozenBeforeSelection: true,
    noSelectionArtifactAtFreezeTime: !selectionExisted };
  policyPayload.selectionPolicyHash = H(JSON.stringify(SELECTION));
  writeArtifact("historical-v6-selection-policy", policyPayload, {
    generationCommand: "npm run v6:selection", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const pool = readArtifact("historical-v6-expanded-pool", DIR).data;
  const audit = readArtifact("historical-v6-pool-audit", DIR).data;
  const byKey = new Map(audit.perTeamNearOverlap.map((r) => [r.key, r]));
  // identity descriptors come from whichever spec first described the team, and
  // profiles from whichever store holds them. Reading only the V6 spec and the
  // V6 store would leave every pre-existing eligible team with a null identity,
  // which would silently zero its tactical distance and make the mirror gate
  // pass on absent data rather than on a real difference.
  const specByKey = new Map();
  for (const f of [...POOL_V4_SPEC, ...NEW_V5_SPEC, ...V6_SPEC_ALL]) {
    const k = `${f.teamName}|${f.season}`;
    if (!specByKey.has(k)) specByKey.set(k, f);
  }
  const profiles = [];
  for (const sp of ["data/calibration/calibration-players-v3.json",
    "data/validation/6c3r/calibration-players-v4.json",
    "data/validation/6c4a/calibration-players-v5.json",
    `${DIR}/calibration-players-v6.json`]) {
    if (!existsSync(sp)) continue;
    const raw = JSON.parse(readFileSync(sp, "utf8"));
    profiles.push(...((raw.data ?? raw).profiles ?? []));
  }

  // enrich the eligible rows with the source-side fields the rule reads
  const teams = pool.eligible.map((t) => {
    const spec = specByKey.get(`${t.teamName}|${t.season}`) ?? null;
    const prof = profiles.filter((p) => p.teamName === t.teamName && p.season === t.season);
    return { ...t, identity: spec?.identity ?? null,
      scoreableTraits: t.scoreableTraits ?? [], scoreableMetrics: t.scoreableMetrics ?? [],
      sharedWithNearestSeenLineup: byKey.get(t.key)?.sharedWithNearestSeenLineup ?? 0,
      mediumHighProfiles: prof.filter((p) => p.confidence === "MEDIUM_HIGH").length };
  });

  const chosen = select(teams);
  const ok = chosen.filter((c) => !c.unsatisfiable);

  console.log("HISTORICAL V6 SELECTION — policy frozen, then applied\n");
  for (const c of chosen) {
    if (c.unsatisfiable) { console.log(`  ${c.era}  NO SATISFYING PAIR`); continue; }
    console.log(`  ${c.era}  ${(c.teamA.teamName + " " + c.teamA.season).padEnd(30)} vs ${(c.teamB.teamName + " " + c.teamB.season).padEnd(30)} score [${c.score.join(",")}]`);
    console.log(`         ${c.teamA.coachId} vs ${c.teamB.coachId}`);
  }

  // reorder stability: eight deterministic permutations must agree exactly
  const fingerprint = (sel) => sel.map((c) => c.unsatisfiable
    ? `${c.era}:UNSAT` : `${c.era}:${c.teamA.key}:${c.teamB.key}`).join(" | ");
  const base = fingerprint(chosen);
  const perms = Array.from({ length: 8 }, (_, i) => {
    const f = fingerprint(select(permute(teams, `perm-${i}`)));
    return { permutation: i, salt: `perm-${i}`, fingerprint: f, identical: f === base };
  });

  const teamSeasons = ok.flatMap((c) => [c.teamA.key, c.teamB.key]);
  console.log("");
  gate("policyFrozenBeforeSelection", policyPayload.noSelectionArtifactAtFreezeTime,
    "the selection policy was written while no selection artifact existed");
  gate("eightMatchupsOnePerEra", ok.length === 8 && new Set(ok.map((c) => c.era)).size === 8,
    `${ok.length}/8 matchups, ${new Set(ok.map((c) => c.era)).size}/8 eras`);
  gate("sixteenDistinctTeamSeasons", teamSeasons.length === 16 && new Set(teamSeasons).size === 16,
    `${new Set(teamSeasons).size} distinct of ${teamSeasons.length} sides`);
  gate("bothSidesSameEra", ok.every((c) => c.teamA.era === c.era && c.teamB.era === c.era),
    "every side carries the matchup's own Era Style");
  gate("distinctFranchisePerMatchup", ok.every((c) => c.teamA.teamId !== c.teamB.teamId),
    "no matchup pairs a franchise against itself");
  gate("distinctCoachPerMatchup", ok.every((c) => c.teamA.coachId !== c.teamB.coachId),
    `${new Set(ok.flatMap((c) => [c.teamA.coachId, c.teamB.coachId])).size} distinct coaches across 16 sides`);
  gate("everySideHasIdentityDescriptors",
    ok.every((c) => [c.teamA, c.teamB].every((t) => t.identity && (t.identity.tags ?? []).length > 0)),
    "every selected side carries pace, offense, defense and style tags — so a zero tactical distance would mean two teams genuinely alike, not two absent descriptions");
  gate("noMirrorMatchup", ok.every((c) => tacticalDistance(c.teamA, c.teamB) > 0),
    `minimum tactical distance ${Math.min(...ok.map((c) => tacticalDistance(c.teamA, c.teamB)))} — a mirror matchup cannot separate offence from defence`);
  gate("everySideUnseen", ok.every((c) => [c.teamA, c.teamB].every((t) => t.exclusionReasons.length === 0)),
    "every selected side carries zero exclusion reasons in the frozen pool");
  gate("everySideOutputBlind", ok.every((c) => [c.teamA, c.teamB].every((t) => t.candidate2SimulationsUsed === 0)),
    "zero Candidate 2 simulations against any selected team-season");
  const coveredMetrics = new Set(ok.flatMap((c) => pairMetrics(c.teamA, c.teamB)));
  gate("everySideHasAScoreableTrait",
    ok.every((c) => [c.teamA, c.teamB].every((t) => (t.scoreableTraits ?? []).length >= 1)),
    `fewest scoreable traits on any selected side: ${Math.min(...ok.flatMap((c) => [c.teamA, c.teamB]).map((t) => (t.scoreableTraits ?? []).length))}`);
  gate("bothRepairedMechanismsCovered",
    REQUIRED_METRIC_COVERAGE.every((r) => coveredMetrics.has(r.metric)),
    REQUIRED_METRIC_COVERAGE.map((r) => `${r.metric} ${coveredMetrics.has(r.metric) ? "covered" : "NOT COVERED"}`).join(", ")
    + ` — version 1 of this policy covered neither`);
  gate("noDuplicateTeamSeasonAfterCoverageRepair", chosen.duplicatedAfterRepair === false,
    `${chosen.coverageRepairs.filter((r) => r.applied).length} coverage repairs applied, no team-season used twice`);
  gate("metricBreadth", coveredMetrics.size >= 4,
    `${coveredMetrics.size} distinct certified metrics claimed across the eight matchups: ${[...coveredMetrics].sort().join(", ")}`);
  gate("reorderStable", perms.every((p) => p.identical),
    `${perms.filter((p) => p.identical).length}/8 deterministic permutations reproduce the selection exactly`);

  const payload = {
    historicalV6SelectionVersion: "2.0.0",
    selectionPolicyHash: policyPayload.selectionPolicyHash,
    eligibilityPolicyHash: pool.eligibilityPolicyHash, poolHash: pool.poolHash,
    candidate2OutputUsed: false, candidate2SimulationsUsedForSelection: 0,
    matchups: ok.map((c, i) => ({
      matchupId: `v6m-${c.era}`, index: i + 1, eraStyleId: c.era,
      teamA: { key: c.teamA.key, teamId: c.teamA.teamId, teamName: c.teamA.teamName,
        season: c.teamA.season, coachId: c.teamA.coachId, fixtureId: c.teamA.fixtureId },
      teamB: { key: c.teamB.key, teamId: c.teamB.teamId, teamName: c.teamB.teamName,
        season: c.teamB.season, coachId: c.teamB.coachId, fixtureId: c.teamB.fixtureId },
      tacticalDistance: tacticalDistance(c.teamA, c.teamB),
      scoreableMetrics: pairMetrics(c.teamA, c.teamB),
      scoredTraits: { teamA: c.teamA.scoreableTraits ?? [], teamB: c.teamB.scoreableTraits ?? [] },
      coverageRepaired: c.coverageRepaired ?? null, rankInEra: c.rankInEra ?? null,
      scoreVector: c.score, scoreKeys: SELECTION.preferenceOrder.map((p) => p.key), tieHash: c.tieHash,
    })),
    requiredMetricCoverage: REQUIRED_METRIC_COVERAGE.map((r) => ({ ...r, covered: coveredMetrics.has(r.metric) })),
    coveredMetrics: [...coveredMetrics].sort(),
    coverageRepairs: chosen.coverageRepairs,
    reorderStability: { permutationsTested: perms.length, allIdentical: perms.every((p) => p.identical),
      baseFingerprint: base, permutations: perms,
      method: "each permutation orders the pool by sha256(salt|key), so the test needs no randomness and reproduces byte-identically" },
    pass: fail.length === 0, failedGates: fail,
  };
  payload.selectionHash = H(JSON.stringify(payload.matchups.map((m) => `${m.matchupId}:${m.teamA.key}:${m.teamB.key}`)));
  writeArtifact("historical-v6-selection", payload, {
    generationCommand: "npm run v6:selection", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nSELECTION: ${payload.pass ? "COMPLETE" : `FAIL (${fail.join(", ")})`}`);
  console.log(`  selectionPolicyHash ${policyPayload.selectionPolicyHash.slice(0, 16)}...  selectionHash ${payload.selectionHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
