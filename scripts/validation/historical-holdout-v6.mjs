#!/usr/bin/env node
// ── Historical Holdout V6 — ONE-TIME formal validation of Candidate 2 ───────
//   npm run validation:historical-v6 -- --help
//   npm run validation:historical-v6 -- --preflight
//   npm run validation:historical-v6 -- --dry-run
//   npm run validation:historical-v6 -- --run --unlock-holdout \
//     --unlock-historical-holdout-v6 --operator="..." --reason="..."
//
// Four things V6 does that V5 did not:
//   · MODES ARE EXPLICIT. V5 ran the real thing when given no mode, so a
//     mistyped flag was one keystroke from a one-time access. Here the seal is
//     reachable only from --run, and an unknown flag is refused outright —
//     Phase 6C4B2R found the compound-verdict command accepting unknown flags
//     and writing an artifact out of order.
//   · AGGREGATION IS BY INDEPENDENT CLUSTER, not by trait label. V5 reported 3
//     hard fails; two were one observation. A naming decision must not change a
//     verdict.
//   · PROGRESSIVE EQUIVALENCE. Each matchup runs at the precheck tier and the
//     decision tier; a cluster is declared only where the two agree, and an
//     indeterminate or disagreeing cluster escalates. Escalation triggers on
//     indeterminacy alone, never on the sign of the difference.
//   · The escalation tier draws from its own pre-allocated seed block, so it
//     cannot reuse a decision-tier seed and manufacture agreement.
//
// This file is imported by the dry run so the rehearsal exercises the EXACT
// code path the real run takes.
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { runSealedSetOnce, realSeal, mockSeal, RunRefused, RUN_OUTCOMES } from "./runner.mjs";
import { teamFromFixture, playSurface, shareMae, scoreTrait } from "./evalV4.mjs";
import { referenceTeam } from "./eraReferences.mjs";
import { registryHash, detectContradictions } from "./traitRegistry.mjs";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { v6SurfaceSeed, proveDisjoint } from "../v6/seeds.mjs";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { versionOf } from "../../src/versions.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

export const DIR = "data/validation/6c4c2";
export const SET = "historical-holdout-v6";
export const RUN_PATH = `${DIR}/historical-holdout-v6-run.json`;
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

export const KNOWN_FLAGS = Object.freeze([
  "--help", "--preflight", "--dry-run", "--run", "--resume",
  "--unlock-holdout", `--unlock-${SET}`, "--operator", "--reason", "--refreeze",
]);

export const USAGE = `Historical Holdout V6 — one-time formal validation of Candidate 2

MODES (exactly one required)
  --help        print this and exit. Touches nothing.
  --preflight   verify every frozen identity read-only. Writes no artifact,
                opens no seal, plays no game. Safe to run any number of times.
  --dry-run     rehearse the full runner against MOCK fixtures and a disposable
                seal log. Exercises every refusal branch. The real set is never
                touched.
  --run         the one-time formal run. Requires --unlock-holdout,
                --unlock-${SET}, --operator and --reason.
                Opens the seal exactly once.

  --resume      with --run only: continue an interrupted run under the SAME
                access event. Refused if the recorded identity has moved.

Any unrecognised flag is refused. The seal is reachable only from --run.`;

/** Cluster key: one independent measurement, whatever it is labelled. */
export const clusterKey = (matchupId, side, t) =>
  [matchupId, side, t.metric, t.surface, t.direction, r5(t.observed), r5(t.reference)].join("|");

/**
 * Collapse hard-failing traits onto independent measurements. Every label is
 * preserved; only the evidence count collapses.
 */
export const clusterHardFails = (results) => {
  const map = new Map();
  for (const r of results) {
    for (const side of ["teamA", "teamB"]) {
      for (const t of (r[side].traits ?? [])) {
        if (!t.hardFail) continue;
        const key = clusterKey(r.matchupId, side, t);
        if (!map.has(key)) {
          map.set(key, { clusterKey: key, matchupId: r.matchupId, eraStyleId: r.eraStyleId, side,
            teamName: r[side].teamName, season: r[side].season,
            metric: t.metric, surface: t.surface, direction: t.direction,
            observed: r5(t.observed), reference: r5(t.reference), difference: r5(t.diff),
            practicalMargin: t.practicalMargin, zScore: t.z ?? null, ci95: t.ci95 ?? null,
            formalTraitLabels: [] });
        }
        map.get(key).formalTraitLabels.push(t.traitId);
      }
    }
  }
  return [...map.values()].map((c) => ({ ...c, formalLabelCount: c.formalTraitLabels.length,
    independentMeasurements: 1,
    duplicateLabelNote: c.formalTraitLabels.length > 1
      ? `${c.formalTraitLabels.length} formal trait labels (${c.formalTraitLabels.map((x) => `"${x}"`).join(", ")}) report ONE observation: identical matchup, side, metric, surface, direction, observed and reference values. Both labels are preserved; the evidence count is 1.`
      : null }));
};

/** The per-trait dual gate, plus the reported state vocabulary. */
export const applyDualGate = (scored, metric, margin) => {
  const diff = scored.diff ?? null;
  const beyondMargin = margin != null && diff != null && Math.abs(diff) > margin;
  const statistical = scored.hardFail === true;
  const hardFail = statistical && beyondMargin;
  return { ...scored, metric, practicalMargin: margin, beyondPracticalMargin: beyondMargin,
    statisticallyOpposite: statistical, hardFail,
    indeterminate: statistical && !beyondMargin,
    reportedState: scored.result === "PASS" ? "PASS"
      : hardFail ? "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED"
        : statistical ? "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT"
          : scored.result === "FAIL" ? "INCONCLUSIVE" : scored.result };
};

/** Everything the run needs, loaded and cross-checked. Read-only. */
export const loadPackage = async () => {
  const manifest = readArtifact("historical-holdout-v6-manifest", DIR);
  const verdictArt = readArtifact("historical-v6-verdict-policy", DIR);
  const marginArt = readArtifact("historical-v6-practical-margins", DIR);
  const planArt = readArtifact("historical-v6-sample-plan", DIR);
  const seedArt = readArtifact("historical-v6-seeds", DIR);
  const obsArt = readArtifact("historical-v6-observability-certification", DIR);
  const refsArt = readArtifact("era-reference-certification-candidate2", DIR);
  const lockArt = readArtifact("candidate2-lock", "data/validation/6c4c1");
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  return { manifest, verdictArt, marginArt, planArt, seedArt, obsArt, refsArt, lockArt, def, core,
    verdict: verdictArt.data, margins: marginArt.data, plan: planArt.data, seeds: seedArt.data,
    obs: obsArt.data, refs: refsArt.data, lock: lockArt.data, m: manifest.data };
};

/** Identity checks. Returns rows; never exits, so --preflight can report them all. */
export const identityChecks = (pkg, { dryRunArtifactRequired = true } = {}) => {
  const { verdict, margins, seeds, obs, refs, lock, def, core, m, marginArt, obsArt, refsArt, seedArt } = pkg;
  const dryrun = dryRunArtifactRequired
    ? (() => { try { return readArtifact("historical-v6-runner-dry-run", DIR).data; } catch { return null; } })()
    : null;
  const rows = [
    ["dryRunPassed", dryRunArtifactRequired ? dryrun?.pass === true : true,
      dryRunArtifactRequired ? `dry run ${dryrun ? (dryrun.pass ? "passed" : "FAILED") : "artifact missing"}` : "not required in this mode"],
    ["candidateCoreUnchanged", core.aggregateCoreHash === verdict.hashes.candidate2CoreHash,
      `core ${core.aggregateCoreHash.slice(0, 16)} vs policy ${String(verdict.hashes.candidate2CoreHash).slice(0, 16)}`],
    ["coreMatchesCandidate2Lock", core.aggregateCoreHash === lock.coreHash,
      `the locked Candidate 2 core is ${lock.coreHash.slice(0, 16)}`],
    ["parameterSetUnchanged", def.parameterSetHash === verdict.hashes.parameterSetHash, "parameter set matches the frozen policy"],
    ["zeroParameterDrift", activeParameters().every((p) => def.values[p.id] === p.defaultValue), "no parameter drifted from its registry default"],
    ["calibrationVersionUnchanged", versionOf("possessionCalibrationVersion") === verdict.hashes.possessionCalibrationVersion,
      `calibration ${versionOf("possessionCalibrationVersion")}`],
    ["traitRegistryUnchanged", registryHash() === obs.traitRegistryHash, "the trait registry has not moved since certification"],
    ["observabilityUnchanged", obsArt.data.certificationHash === verdict.hashes.observabilityCertificationHash, "observability certification matches the policy"],
    ["referencesUnchanged", refsArt.data.certificationHash === verdict.hashes.eraReferenceCertificationHash, "era-reference certification matches the policy"],
    ["marginPolicyUnchanged", margins.policyHash === verdict.hashes.practicalMarginPolicyHash, "practical-margin policy matches the policy"],
    ["seedSetUnchanged", seeds.seedHash === seedArt.data.seedHash, "seed manifest is self-consistent"],
    ["seedsStillDisjoint", proveDisjoint(4096).totalOverlap === 0, "the V6 seed domain still touches no prior population"],
    ["manifestSelfConsistent", Boolean(m.manifestHash) && m.pass === true, "the manifest passed its own gates"],
    ["manifestPinsSameCore", m.hashes.candidate2CoreHash === core.aggregateCoreHash, "the manifest pins the core actually loaded"],
    ["bothRepairedMechanismsScored",
      m.scoredMetrics.includes("assistedRate") && m.scoredMetrics.includes("refPppVsTeam"),
      `scored metrics: ${m.scoredMetrics.join(", ")}`],
    ["everySideHasAScoredTrait",
      m.matchups.every((x) => x.teamA.scoredTraits.length >= 1 && x.teamB.scoredTraits.length >= 1),
      "no side would contribute structural evidence only"],
    ["baselinesKeyedByMetricId",
      m.matchups.every((x) => x.eraReference.selfBaselines?.pppVsReference?.mean != null),
      "self-baselines resolve by metric id, not sample field"],
  ];
  // per-matchup rubric contradiction check: the machine that rejects V3-style rules
  for (const x of m.matchups) {
    for (const side of ["teamA", "teamB"]) {
      const claims = x[side].scoredTraits.map((t) => ({ traitId: t.traitId, metric: t.metric, direction: t.direction, surface: t.surface }));
      const problems = detectContradictions(claims);
      rows.push([`rubricClean:${x.matchupId}:${side}`, problems.length === 0, problems.join("; ") || "no contradictory claim on this side"]);
    }
  }
  return rows.map(([name, ok, detail]) => ({ name, ok, detail }));
};

/** Build the evaluate() closure. Shared by the dry run and the real run. */
export const makeEvaluator = ({ pkg, profiles, tiers, log = () => {} }) => {
  const { m, refs, margins, obs } = pkg;
  const eligible = new Set(obs.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
  const marginOf = (metric) => margins.metrics[metric]?.margin ?? null;

  const teamFromSide = (side) => teamFromFixture({
    fixtureId: side.fixtureId, teamName: side.teamName, season: side.season, eraStyleId: side.eraStyleId,
    coachId: side.coachId,
    players: side.players.map((p) => ({ calibrationPlayerId: p.calibrationPlayerId, assignedPosition: p.assignedPosition })),
  }, profiles);

  const runTier = (x, mi, tier, pairs) => {
    const A = teamFromSide(x.teamA); const B = teamFromSide(x.teamB);
    const refDef = refs.references.find((r) => r.era === x.eraStyleId);
    const ref = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
    const blk = (surface) => (i) => v6SurfaceSeed({ tier, matchupIndex: mi, surfaceIndex: surface, pairIndex: i });
    const sAB = playSurface({ subject: A, opponent: B, eraStyleId: x.eraStyleId, seedAt: blk(0), pairs });
    const sARef = playSurface({ subject: A, opponent: ref, eraStyleId: x.eraStyleId, seedAt: blk(1), pairs });
    const sBRef = playSurface({ subject: B, opponent: ref, eraStyleId: x.eraStyleId, seedAt: blk(2), pairs });

    const evalSide = (side, run) => {
      const fixture = { fixtureId: side.fixtureId, players: side.players.map((p) => ({ calibrationPlayerId: p.calibrationPlayerId })) };
      const target = { unitTargets: Object.fromEntries(
        Object.entries(side.targets?.unitTargets ?? {}).filter(([k]) => k.startsWith("player"))) };
      const mae = shareMae({ fixture, target, profiles, games: run.subjectBoxes });
      const traits = side.scoredTraits.filter((t) => eligible.has(t.traitId)).map((t) => {
        const scored = scoreTrait({ traitId: t.traitId, vsRefSamples: run.samples,
          refBaselines: refDef.candidate2SelfBaselines, eraStyleId: x.eraStyleId });
        return { ...applyDualGate(scored, t.metric, marginOf(t.metric)), traitId: t.traitId,
          direction: t.direction, surface: t.surface };
      });
      const notScored = side.excludedTraits.map((t) => ({ traitId: t.traitId,
        result: t.reason === "NOT_IN_TRAIT_REGISTRY" ? "NOT_APPLICABLE" : "NOT_SCORED_UNOBSERVABLE", reason: t.reason }));
      return { teamName: side.teamName, season: side.season, fixtureId: side.fixtureId, ...mae, traits, notScored };
    };
    const a = evalSide(x.teamA, sARef); const b = evalSide(x.teamB, sBRef);
    const winA = sAB.samples.reduce((acc, s) => acc + s.win, 0);
    return { tier, pairs, teamA: a, teamB: b,
      headToHead: { games: sAB.games, teamAWins: winA, teamAWinRate: r5(winA / sAB.games) },
      structural: {
        invariantViolations: sAB.invariantViolations + sARef.invariantViolations + sBRef.invariantViolations,
        finalTies: sAB.ties + sARef.ties + sBRef.ties,
        impossibleScores: sAB.impossible + sARef.impossible + sBRef.impossible,
        preThreeEraThreePointAttempts: (sAB.preThreeAttempts ?? 0) + (sARef.preThreeAttempts ?? 0) + (sBRef.preThreeAttempts ?? 0),
        replayExactAllSurfaces: sAB.replayExact && sARef.replayExact && sBRef.replayExact,
      },
      gamesPlayed: sAB.games + sARef.games + sBRef.games };
  };

  return (matchupId, mi) => {
    const x = m.matchups.find((y) => y.matchupId === matchupId);
    const t0 = performance.now();
    const precheck = tiers.find((t) => t.role === "PRECHECK");
    const decision = tiers.find((t) => t.role === "DECISION");
    const escalation = tiers.find((t) => t.role === "ESCALATION");

    const pre = runTier(x, mi, precheck.tier, precheck.gamesPerSurface / 2);
    const dec = runTier(x, mi, decision.tier, decision.gamesPerSurface / 2);

    // ── progressive equivalence, per trait ────────────────────────────────
    const stateOf = (r, side, traitId) => (r[side].traits.find((t) => t.traitId === traitId)?.reportedState ?? null);
    const disagreements = []; let anyIndeterminate = false;
    for (const side of ["teamA", "teamB"]) {
      for (const t of dec[side].traits) {
        const before = stateOf(pre, side, t.traitId);
        if (before !== t.reportedState) disagreements.push({ side, traitId: t.traitId, precheck: before, decision: t.reportedState });
        if (t.indeterminate) anyIndeterminate = true;
      }
    }
    const escalated = anyIndeterminate || disagreements.length > 0;
    const esc = escalated ? runTier(x, mi, escalation.tier, escalation.gamesPerSurface / 2) : null;
    const governing = esc ?? dec;

    log(`  [${mi + 1}/${m.matchups.length}] ${matchupId.padEnd(14)} A mae ${String(governing.teamA.compositeMae ?? "n/a").padStart(8)}  B mae ${String(governing.teamB.compositeMae ?? "n/a").padStart(8)}  traits ${[...governing.teamA.traits, ...governing.teamB.traits].filter((t) => t.result === "PASS").length}/${governing.teamA.traits.length + governing.teamB.traits.length}  inv ${governing.structural.invariantViolations}${escalated ? "  ESCALATED" : ""}  ${Math.round((performance.now() - t0) / 100) / 10}s`);

    return { matchupId, eraStyleId: x.eraStyleId,
      teamA: governing.teamA, teamB: governing.teamB,
      headToHead: governing.headToHead, structural: governing.structural,
      governingTier: governing.tier,
      tiers: { precheck: { tier: pre.tier, gamesPlayed: pre.gamesPlayed }, decision: { tier: dec.tier, gamesPlayed: dec.gamesPlayed },
        escalation: esc ? { tier: esc.tier, gamesPlayed: esc.gamesPlayed } : null },
      progressiveEquivalence: { escalated, anyIndeterminateAtDecisionTier: anyIndeterminate,
        precheckVsDecisionDisagreements: disagreements,
        note: escalated
          ? "a cluster was indeterminate or the two tiers disagreed, so the escalation tier governs"
          : "the precheck and decision tiers agreed on every trait state, so the decision tier governs" },
      gamesPlayed: pre.gamesPlayed + dec.gamesPlayed + (esc?.gamesPlayed ?? 0) };
  };
};

/** Frozen gate evaluation over a completed result set. */
export const evaluateGates = ({ pkg, results }) => {
  const { verdict } = pkg;
  const teamMaes = results.flatMap((r) => [
    { id: r.teamA.fixtureId, mae: r.teamA.compositeMae }, { id: r.teamB.fixtureId, mae: r.teamB.compositeMae }])
    .filter((t) => t.mae != null);
  const composite = teamMaes.length ? teamMaes.reduce((a, t) => a + t.mae, 0) / teamMaes.length : null;
  const g = verdict.numericGates.compositeShareMae;
  const ratio = composite != null ? composite / g.internalBaselineMean : null;
  const catastrophic = teamMaes.filter((t) => t.mae > g.catastrophicThreshold);

  const allTraits = results.flatMap((r) => [...r.teamA.traits, ...r.teamB.traits]);
  const passRate = allTraits.length ? allTraits.filter((t) => t.result === "PASS").length / allTraits.length : null;
  const clusters = clusterHardFails(results);
  const hardFailLabels = allTraits.filter((t) => t.hardFail);
  const perMatchupMajority = results.map((r) => {
    const ts = [...r.teamA.traits, ...r.teamB.traits];
    const failed = ts.filter((t) => t.result === "FAIL").length;
    return { matchupId: r.matchupId, scored: ts.length, failed, failsMajority: ts.length > 0 && failed * 2 > ts.length };
  });
  const perEra = results.map((r) => {
    const ts = [...r.teamA.traits, ...r.teamB.traits];
    return { eraStyleId: r.eraStyleId, scored: ts.length,
      allFailed: ts.length > 0 && ts.every((t) => t.result === "FAIL") };
  });

  const gates = {
    everyMatchupExecuted: results.length === verdict.protocol.matchups,
    zeroInvariantFailures: results.every((r) => r.structural.invariantViolations === 0),
    zeroFinalTies: results.every((r) => r.structural.finalTies === 0),
    zeroImpossibleScores: results.every((r) => r.structural.impossibleScores === 0),
    zeroPreThreeEraThreePointAttempts: results.every((r) => r.structural.preThreeEraThreePointAttempts === 0),
    replayExactEverywhere: results.every((r) => r.structural.replayExactAllSurfaces),
    compositeRatioWithinPolicy: ratio != null && ratio <= g.maxHoldoutToInternalRatio,
    zeroCatastrophicTeams: catastrophic.length === 0,
    traitPassRateMet: passRate != null && passRate >= verdict.traitGates.aggregate.minTraitPassRate,
    zeroIndependentHardFailClusters: clusters.length <= verdict.traitGates.aggregate.maxIndependentHardFailClusters,
    noMatchupFailsMajorityOfTraits: perMatchupMajority.every((x) => !x.failsMajority),
    noEraFailsEveryScoredTrait: perEra.every((x) => !x.allFailed),
  };
  return { gates, teamMaes, composite: r5(composite), ratio: r5(ratio), catastrophic,
    allTraits, passRate: r5(passRate), clusters, hardFailLabels, perMatchupMajority, perEra };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (f, d = null) => { const a = argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=").slice(1).join("=") : d; };

  // ── unknown flags are refused, not ignored ───────────────────────────────
  // Phase 6C4B2R found the compound-verdict command accepting unknown flags and
  // writing an artifact out of order. Here a typo could cost a one-time access,
  // so it is a hard refusal before anything else happens.
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.includes(a.split("=")[0]));
  if (unknown.length) {
    console.error(`REFUSED: unrecognised flag(s) ${unknown.join(", ")}\n`);
    console.error(USAGE);
    process.exit(2);
  }

  const modes = ["--help", "--preflight", "--dry-run", "--run"].filter((mFlag) => argv.includes(mFlag));
  if (argv.includes("--help") || modes.length === 0) {
    if (modes.length === 0) console.error("REFUSED: a mode is required. The seal is reachable only from --run.\n");
    console.log(USAGE);
    process.exit(modes.length === 0 ? 2 : 0);
  }
  if (modes.length > 1) {
    console.error(`REFUSED: exactly one mode, got ${modes.join(" ")}`);
    process.exit(2);
  }
  const mode = modes[0];
  if (argv.includes("--resume") && mode !== "--run") {
    console.error("REFUSED: --resume applies to --run only.");
    process.exit(2);
  }

  const pkg = await loadPackage();
  const before = setAccessCount(SET);

  // ── --preflight: read-only ───────────────────────────────────────────────
  if (mode === "--preflight") {
    console.log("HISTORICAL HOLDOUT V6 PREFLIGHT — read-only, writes nothing, opens nothing\n");
    const rows = identityChecks(pkg, { dryRunArtifactRequired: false });
    for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);
    const bad = rows.filter((r) => !r.ok);
    console.log(`\n  ${pkg.m.matchups.length} matchups · ${pkg.m.scoredTraitCount} scored traits · metrics ${pkg.m.scoredMetrics.join(", ")}`);
    console.log(`  access count ${before} -> ${setAccessCount(SET)} (unchanged: preflight never opens the seal)`);
    console.log(`\nPREFLIGHT: ${bad.length === 0 ? "READY" : `NOT READY (${bad.map((r) => r.name).join(", ")})`}`);
    process.exit(bad.length === 0 ? 0 : 2);
  }

  // ── --dry-run: mock fixtures, disposable seal ────────────────────────────
  if (mode === "--dry-run") {
    console.log("REFUSED: run the dry run through its own command, which builds the mock set and\n" +
      "exercises every refusal branch:  npm run v6:dryrun\n" +
      "This keeps mock-fixture construction out of the file that can open the real seal.");
    process.exit(2);
  }

  // ── --run: the one-time formal run ───────────────────────────────────────
  const operator = arg("operator"); const reason = arg("reason");
  const resume = argv.includes("--resume");
  if (!operator || !reason) { console.error("REFUSED: --operator and --reason are required for --run."); process.exit(2); }

  const rows = identityChecks(pkg, { dryRunArtifactRequired: true });
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error("REFUSED: the frozen package does not verify. The seal was not touched.\n");
    for (const r of bad) console.error(`  FAIL  ${r.name}\n        ${r.detail}`);
    console.error(`\n  access count remains ${setAccessCount(SET)}`);
    process.exit(2);
  }

  const { m, verdict, plan, def, core, lock, margins, obs, refs, seeds } = pkg;
  const identity = {
    candidateId: lock.candidateId, candidateCommit: lock.lockedAtCommit,
    coreHash: core.aggregateCoreHash, parameterSetHash: def.parameterSetHash,
    calibrationVersion: versionOf("possessionCalibrationVersion"),
    verdictPolicyHash: verdict.policyHash, holdoutManifestHash: m.manifestHash,
    practicalMarginPolicyHash: margins.policyHash, traitRegistryHash: registryHash(),
    observabilityHash: obs.certificationHash, referenceCertificationHash: refs.certificationHash,
    seedSetHash: seeds.seedHash, samplePlanHash: plan.samplePlanHash,
    seedDomain: seeds.domain, decisionGamesPerSurface: verdict.protocol.gamesPerSurface,
  };

  const { buildRunnerProfileMap } = await import("./profileMap.mjs");
  const profiles = await buildRunnerProfileMap();
  // the manifest's own profiles, so a store that moved cannot change the run
  for (const x of m.matchups) for (const side of [x.teamA, x.teamB]) for (const p of side.players) {
    if (!profiles.has(p.calibrationPlayerId)) profiles.set(p.calibrationPlayerId, p);
  }

  console.log("HISTORICAL HOLDOUT V6 — ONE-TIME FORMAL VALIDATION OF CANDIDATE 2\n");
  console.log(`  operator ${operator}`);
  console.log(`  candidate ${identity.candidateId} core ${identity.coreHash.slice(0, 16)}... set ${identity.parameterSetHash.slice(0, 16)}...`);
  console.log(`  policy ${verdict.policyHash.slice(0, 16)}... manifest ${m.manifestHash.slice(0, 16)}...`);
  console.log(`  ${m.matchups.length} matchups · precheck ${plan.tiers.find((t) => t.role === "PRECHECK").gamesPerSurface} + decision ${verdict.protocol.gamesPerSurface} games per surface, escalating to ${plan.tiers.find((t) => t.role === "ESCALATION").gamesPerSurface} where indeterminate\n`);

  const seal = await realSeal(SET);
  let state;
  try {
    state = runSealedSetOnce({
      seal, identity, members: m.matchups.map((x) => x.matchupId), runPath: RUN_PATH,
      reason, actor: operator, resume,
      evaluate: makeEvaluator({ pkg, profiles, tiers: plan.tiers, log: (s) => console.log(s) }),
    });
  } catch (e) {
    if (e instanceof RunRefused || e.code === "HOLDOUT_SEALED") {
      console.error(`\nREFUSED (${e.code}): ${e.message.split("\n")[0]}`);
      console.error(`  access count remains ${seal.accessCount()}`);
      process.exit(2);
    }
    throw e;
  }

  const ev = evaluateGates({ pkg, results: state.results });
  const outcome = Object.values(ev.gates).every(Boolean) ? RUN_OUTCOMES.PASS : RUN_OUTCOMES.FAIL;
  const finalVerdict = outcome === RUN_OUTCOMES.PASS ? verdict.outcomes.pass : verdict.outcomes.fail;

  const payload = {
    formalValidationAttemptVersion: VALIDATION_VERSIONS.formalValidationAttemptVersion,
    historicalV6ResultsVersion: "1.0.0",
    set: SET, verdict: finalVerdict, outcome, identity,
    accessEvent: state.accessEvent, accessCountBefore: state.accessCountBefore,
    accessCountAfter: seal.accessCount(),
    runStatus: state.status, runHash: state.runHash,
    matchupsEvaluated: state.results.length,
    totalGames: state.results.reduce((a, r) => a + r.gamesPlayed, 0),
    erasCovered: [...new Set(state.results.map((r) => r.eraStyleId))],
    escalatedMatchups: state.results.filter((r) => r.progressiveEquivalence.escalated).map((r) => r.matchupId),
    numeric: {
      teamSurfacesScored: ev.teamMaes.length, holdoutComposite: ev.composite,
      internalBaselineMean: verdict.numericGates.compositeShareMae.internalBaselineMean,
      ratio: ev.ratio, ratioGate: verdict.numericGates.compositeShareMae.maxHoldoutToInternalRatio,
      catastrophicThreshold: verdict.numericGates.compositeShareMae.catastrophicThreshold,
      catastrophicTeams: ev.catastrophic,
    },
    traits: {
      scored: ev.allTraits.length, passed: ev.allTraits.filter((t) => t.result === "PASS").length,
      failed: ev.allTraits.filter((t) => t.result === "FAIL").length,
      passRate: ev.passRate, minPassRate: verdict.traitGates.aggregate.minTraitPassRate,
      hardFailLabels: ev.hardFailLabels.map((t) => t.traitId),
      hardFailLabelCount: ev.hardFailLabels.length,
      independentHardFailClusters: ev.clusters.length,
      maxIndependentHardFailClusters: verdict.traitGates.aggregate.maxIndependentHardFailClusters,
      clusters: ev.clusters,
      aggregationUnit: verdict.aggregation.unit,
      labelVsClusterNote: "the gate is on clusters. Labels are reported and never aggregated, so two trait names on one measurement cannot double-count.",
      notScoredUnobservable: state.results.reduce((a, r) => a + r.teamA.notScored.length + r.teamB.notScored.length, 0),
      perMatchupMajority: ev.perMatchupMajority, perEra: ev.perEra,
    },
    gates: ev.gates, results: state.results,
  };
  const { path } = writeArtifact("historical-v6-results", payload, {
    generationCommand: "npm run validation:historical-v6 -- --run",
    sourceArtifacts: [`${DIR}/historical-v6-verdict-policy.json`, `${DIR}/historical-holdout-v6-manifest.json`],
    extra: { parameterSetHash: def.parameterSetHash }, dir: DIR });

  console.log(`\n  NUMERIC   holdout composite ${ev.composite} vs internal ${verdict.numericGates.compositeShareMae.internalBaselineMean} -> ratio ${ev.ratio} (gate <= ${verdict.numericGates.compositeShareMae.maxHoldoutToInternalRatio})`);
  console.log(`  TRAITS    ${payload.traits.passed}/${payload.traits.scored} pass (${ev.passRate}) · hard-fail labels ${ev.hardFailLabels.length} -> ${ev.clusters.length} independent cluster(s) · unobservable excluded ${payload.traits.notScoredUnobservable}`);
  console.log(`\n  GATES`);
  for (const [k, v] of Object.entries(ev.gates)) console.log(`    ${v ? "PASS" : "FAIL"}  ${k}`);
  console.log(`\n  VERDICT: ${finalVerdict}`);
  console.log(`  access count: ${state.accessCountBefore} -> ${seal.accessCount()}`);
  console.log(`\nwrote ${path}`);
  process.exit(outcome === RUN_OUTCOMES.PASS ? 0 : 1);
}
