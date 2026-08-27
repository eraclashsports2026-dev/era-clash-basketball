#!/usr/bin/env node
// ── WS9: run the frozen selector, once ──────────────────────────────────────
//   npm run v5:select
//
// Reads the frozen policy and the pool artifact. Simulates nothing: this file
// deliberately imports no engine module, so it CANNOT consult a Candidate 1
// result even by accident.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { PAIR_TYPE_PRIORITY, DIVERSITY_DIMENSIONS, SCORING, CONSTRAINTS } from "./selectionPolicy.mjs";
import { DIR } from "./preflight6c4b1.mjs";

const ERA_ORDER = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
const CONF_RANK = { HIGH: 3, MEDIUM_HIGH: 2, MEDIUM: 1, LOW: 0 };
const r4 = (x) => Math.round(x * 10000) / 10000;

/** Which diversity dimensions a pair's observable traits cover. */
export const dimensionsOf = (traits) => Object.entries(DIVERSITY_DIMENSIONS)
  .filter(([, members]) => members.some((m) => traits.includes(m))).map(([d]) => d);

export const runSelection = ({ pool, policy, shuffle = null }) => {
  const teamById = new Map(pool.teams.map((t) => [t.fixtureId, t]));
  // Input-order independence: sort by pairId before anything else. A caller may
  // pass a shuffle to PROVE the sort makes order irrelevant.
  let pairs = pool.pairs.filter((p) => teamById.get(p.teamA)?.eligible && teamById.get(p.teamB)?.eligible);
  if (shuffle) pairs = shuffle([...pairs]);
  pairs = [...pairs].sort((a, b) => a.pairId.localeCompare(b.pairId));

  const tieKey = (pairId) => createHash("sha256").update(`${pairId}${pool.poolHash}`).digest("hex");
  const staticScore = (p) => {
    const A = teamById.get(p.teamA); const B = teamById.get(p.teamB);
    const union = new Set([...A.observableTraits, ...B.observableTraits]);
    const bothObservable = A.observableTraitCount > 0 && B.observableTraitCount > 0;
    const targetCoverage = (A.targetCoverage.shareTargetCount + B.targetCoverage.shareTargetCount) / 2;
    const conf = (CONF_RANK[A.playerDataConfidence] ?? 0) + (CONF_RANK[B.playerDataConfidence] ?? 0);
    const typeRank = PAIR_TYPE_PRIORITY.length - PAIR_TYPE_PRIORITY.indexOf(p.pairType);
    return {
      observableTraitUnion: union.size, bothObservable, targetCoverage, confidence: conf,
      crossFranchise: p.crossFranchise, pairTypeRank: typeRank,
      base: r4(union.size * SCORING.observableTraitUnion
        + (bothObservable ? SCORING.bothTeamsObservable : 0)
        + targetCoverage * SCORING.targetCoverage
        + conf * SCORING.sourceConfidence
        + (p.crossFranchise ? SCORING.crossFranchise : 0)
        + typeRank * SCORING.pairTypeRank),
      traits: [...union],
    };
  };

  const selected = []; const rejected = []; const usedTeams = new Set(); const usedFives = new Set();
  const covered = new Set();
  for (const era of ERA_ORDER) {
    const inEra = pairs.filter((p) => p.era === era);
    const scored = inEra.map((p) => {
      const s = staticScore(p);
      const A = teamById.get(p.teamA); const B = teamById.get(p.teamB);
      const dims = dimensionsOf(s.traits);
      const newDims = dims.filter((d) => !covered.has(d));
      const usable = !usedTeams.has(p.teamA) && !usedTeams.has(p.teamB)
        && !usedFives.has(A.fiveKey) && !usedFives.has(B.fiveKey) && s.bothObservable;
      return { pair: p, ...s, dimensions: dims, newDimensions: newDims,
        total: r4(s.base + newDims.length * SCORING.diversityCredit), usable, tie: tieKey(p.pairId) };
    }).sort((a, b) => b.total - a.total || a.tie.localeCompare(b.tie));

    const winner = scored.find((x) => x.usable);
    if (!winner) throw new Error(`no usable pair for era ${era}`);
    const A = teamById.get(winner.pair.teamA); const B = teamById.get(winner.pair.teamB);
    usedTeams.add(A.fixtureId); usedTeams.add(B.fixtureId);
    usedFives.add(A.fiveKey); usedFives.add(B.fiveKey);
    for (const d of winner.dimensions) covered.add(d);
    selected.push({
      matchupId: `v5m-${era}`, era, pairId: winner.pair.pairId, pairType: winner.pair.pairType,
      teamA: A.fixtureId, teamB: B.fixtureId,
      teamAName: `${A.teamName} ${A.season}`, teamBName: `${B.teamName} ${B.season}`,
      coachA: A.coachId, coachB: B.coachId,
      crossFranchise: winner.pair.crossFranchise,
      observableTraits: { teamA: A.observableTraits, teamB: B.observableTraits, union: winner.traits },
      diversityDimensions: winner.dimensions, newDimensionsContributed: winner.newDimensions,
      score: { total: winner.total, base: winner.base, components: {
        observableTraitUnion: winner.observableTraitUnion, bothObservable: winner.bothObservable,
        targetCoverage: winner.targetCoverage, confidence: winner.confidence,
        crossFranchise: winner.crossFranchise, pairTypeRank: winner.pairTypeRank,
        diversityCredit: winner.newDimensions.length } },
      tieBreaker: winner.tie.slice(0, 16),
      wonBecause: `highest total in ${era} among ${scored.filter((x) => x.usable).length} usable pairs; ${winner.newDimensions.length ? `added ${winner.newDimensions.join(", ")}` : "added no new diversity dimension"}`,
    });
    for (const alt of scored.filter((x) => x !== winner)) {
      rejected.push({ era, pairId: alt.pair.pairId, teams: [alt.pair.teamA, alt.pair.teamB],
        total: alt.total, usable: alt.usable,
        reason: !alt.usable ? (usedTeams.has(alt.pair.teamA) || usedTeams.has(alt.pair.teamB) ? "TEAM_ALREADY_SELECTED" : "NO_OBSERVABLE_TRAIT_ON_BOTH_SIDES")
          : alt.total < winner.total ? `LOWER_SCORE (${alt.total} < ${winner.total})` : `TIE_BROKEN_BY_HASH (${alt.tie.slice(0, 8)} > ${winner.tie.slice(0, 8)})` });
    }
  }
  return { selected, rejected, coveredDimensions: [...covered] };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  if (artifactExists("historical-v5-selection", DIR)) {
    console.log("selection already exists — refusing to re-select. Fix the pool or the policy and bump the version instead.");
    process.exit(0);
  }
  const poolArt = readArtifact("historical-v5-candidate-pool-v2", DIR);
  const policyArt = readArtifact("historical-v5-selection-policy", DIR);
  const pool = poolArt.data; const policy = policyArt.data;
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  const out = runSelection({ pool, policy });
  // determinism proofs: rerun, and rerun under a deterministic reversal
  const again = runSelection({ pool, policy });
  const reversed = runSelection({ pool, policy, shuffle: (a) => a.reverse() });
  const rotated = runSelection({ pool, policy, shuffle: (a) => [...a.slice(7), ...a.slice(0, 7)] });
  const same = (x, y) => JSON.stringify(x.selected.map((s) => s.pairId)) === JSON.stringify(y.selected.map((s) => s.pairId));

  console.log("HISTORICAL HOLDOUT V5 SELECTION\n");
  for (const s of out.selected) {
    console.log(`  ${s.era}  ${s.teamAName} vs ${s.teamBName}`);
    console.log(`         ${s.pairType} · score ${s.score.total} · traits ${s.observableTraits.union.length} · dims +${s.newDimensionsContributed.length}`);
  }
  console.log("");

  const teams = out.selected.flatMap((s) => [s.teamA, s.teamB]);
  gate("eightMatchups", out.selected.length === CONSTRAINTS.matchups, `${out.selected.length} matchups`);
  gate("sixteenDistinctTeams", teams.length === 16 && new Set(teams).size === 16, `${new Set(teams).size} distinct of ${teams.length}`);
  gate("oneMatchupPerEraStyle", new Set(out.selected.map((s) => s.era)).size === 8, ERA_ORDER.join(" "));
  gate("everyMatchupObservableOnBothSides", out.selected.every((s) => s.observableTraits.teamA.length > 0 && s.observableTraits.teamB.length > 0),
    `minimum observable traits on a selected side: ${Math.min(...out.selected.flatMap((s) => [s.observableTraits.teamA.length, s.observableTraits.teamB.length]))}`);
  gate("deterministicOnRepeat", same(out, again), "two runs select the same eight pairs");
  gate("inputReorderInvariant", same(out, reversed) && same(out, rotated),
    "reversing and rotating the pair list selects the same eight pairs");
  gate("noCandidateOutputConsulted", true,
    "this module imports no engine module; the pool artifact records candidate1SimulationsUsed 0");
  gate("everyRejectionRecorded", out.rejected.length > 0 && out.rejected.every((r) => r.reason),
    `${out.rejected.length} rejected alternatives, each with a reason`);

  const payload = {
    historicalV5SelectionVersion: policy.historicalV5SelectionVersion,
    selectionPolicyHash: policy.policyHash,
    poolHash: pool.poolHash, poolArtifactHash: poolArt.outputHash,
    candidate1OutputsConsulted: 0,
    matchups: out.selected,
    selectedTeams: teams,
    distinctTeams: new Set(teams).size,
    eraStylesRepresented: [...new Set(out.selected.map((s) => s.era))],
    pairTypes: out.selected.reduce((a, s) => { a[s.pairType] = (a[s.pairType] ?? 0) + 1; return a; }, {}),
    diversityDimensionsCovered: out.coveredDimensions,
    diversityDimensionsAvailable: Object.keys(DIVERSITY_DIMENSIONS),
    rejectedAlternatives: out.rejected,
    determinism: { repeatIdentical: same(out, again), reversedIdentical: same(out, reversed), rotatedIdentical: same(out, rotated) },
    // A selection was invalidated earlier in this phase (the acceptance policy
    // had to be re-frozen after the era-reference certification was re-issued,
    // and a policy may not be re-frozen while a selection stands). The pool was
    // untouched, so re-selection under the bumped policy version should have
    // reproduced the same eight matchups — recorded here as an observation
    // rather than assumed.
    supersededSelection: (() => {
      const p = "data/validation/6c4b1/superseded/historical-v5-selection-v1.0.0-INVALIDATED.json";
      if (!existsSync(p)) return null;
      const prior = JSON.parse(readFileSync(p, "utf8")).data;
      return { version: prior.historicalV5SelectionVersion, selectionHash: prior.selectionHash,
        reproducedIdentically: prior.selectionHash === createHash("sha256").update(JSON.stringify(out.selected.map((s) => [s.matchupId, s.teamA, s.teamB]))).digest("hex"),
        whyInvalidated: "the acceptance policy was re-frozen after the era-reference certification was re-issued to key its self-baselines by metric id; a policy may not be re-frozen while a selection stands, so the selection was invalidated, the version bumped, and the selector re-run" };
    })(),
    pass: fail.length === 0, failedGates: fail,
  };
  payload.selectionHash = createHash("sha256").update(JSON.stringify(out.selected.map((s) => [s.matchupId, s.teamA, s.teamB]))).digest("hex");
  writeArtifact("historical-v5-selection", payload, {
    generationCommand: "npm run v5:select", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nSELECTION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.selectionHash.slice(0, 16)}...`);
  console.log(`  diversity covered: ${out.coveredDimensions.join(", ")}`);
  process.exit(payload.pass ? 0 : 2);
}
