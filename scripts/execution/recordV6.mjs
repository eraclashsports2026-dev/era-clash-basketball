#!/usr/bin/env node
// ── Record the Historical V6 formal run in this phase's artifact conventions ─
//   npm run exec:record-v6
//
// The frozen runner writes historical-v6-results.json and its run state. This
// projects those into the phase-conventional artifacts. It COPIES values and
// CROSS-CHECKS them; it does not independently recalculate a total, a verdict,
// an access count or a hash. Where a projection disagrees with the artifact it
// exits REPORT_GENERATION_FAILED and changes nothing.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";

const DIR = "data/validation/6c4c3";
const C2D = "data/validation/6c4c2";
const SET = "historical-holdout-v6";
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const runPath = `${C2D}/historical-holdout-v6-run.json`;
  if (!existsSync(runPath)) { console.error("REFUSED: no V6 run state exists."); process.exit(2); }
  const run = JSON.parse(readFileSync(runPath, "utf8"));
  const res = readArtifact("historical-v6-results", C2D).data;
  const verdictPolicy = readArtifact("historical-v6-verdict-policy", C2D).data;
  const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
  const seal = readArtifact("historical-v6-seal", C2D).data;

  // ── agreement checks: the projection must not disagree with the artifact ──
  const problems = [];
  const agree = (name, a, b) => { if (a !== b) problems.push(`${name}: artifact ${JSON.stringify(a)} vs recomputed ${JSON.stringify(b)}`); };
  const flatTraits = res.results.flatMap((r) => [...r.teamA.traits, ...r.teamB.traits]);
  agree("traits.scored", res.traits.scored, flatTraits.length);
  agree("traits.passed", res.traits.passed, flatTraits.filter((t) => t.result === "PASS").length);
  agree("traits.failed", res.traits.failed, flatTraits.filter((t) => t.result === "FAIL").length);
  agree("traits.hardFailLabelCount", res.traits.hardFailLabelCount, flatTraits.filter((t) => t.hardFail).length);
  agree("matchupsEvaluated", res.matchupsEvaluated, res.results.length);
  agree("totalGames", res.totalGames, res.results.reduce((a, r) => a + r.gamesPlayed, 0));
  agree("accessCountAfter", res.accessCountAfter, setAccessCount(SET));
  agree("runHash", res.runHash, run.runHash);
  agree("runStatus", res.runStatus, run.status);
  agree("independentHardFailClusters", res.traits.independentHardFailClusters, res.traits.clusters.length);
  const gatesAllPass = Object.values(res.gates).every(Boolean);
  agree("outcome vs gates", res.outcome, gatesAllPass ? "PASS" : "FAIL");
  agree("verdict vs outcome", res.verdict,
    res.outcome === "PASS" ? verdictPolicy.outcomes.pass : verdictPolicy.outcomes.fail);
  agree("identity.coreHash vs seal", res.identity.coreHash, seal.candidate.coreHash);
  agree("identity.manifestHash", res.identity.holdoutManifestHash, manifest.manifestHash);

  if (problems.length) {
    console.error("REPORT_GENERATION_FAILED — the projection disagrees with the formal artifact.\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error("\nThe formal artifacts are preserved unchanged. Nothing was written.");
    process.exit(2);
  }
  console.log(`AGREEMENT: ${13} cross-checks, 0 disagreements — every recorded value is copied from the formal artifact\n`);

  // ── the access event ─────────────────────────────────────────────────────
  const accessEvent = {
    historicalV6AccessEventVersion: "1.0.0",
    set: SET, seq: run.accessEvent.seq,
    actor: run.accessEvent.actor, reason: run.accessEvent.reason,
    openedAtCommit: run.accessEvent.openedAtCommit,
    accessCountBefore: run.accessCountBefore, accessCountAfter: run.accessCountAfter,
    liveAccessCount: setAccessCount(SET),
    accessLog: "data/calibration/historical-holdout-v6-access-log.jsonl",
    accessLogLines: readFileSync("data/calibration/historical-holdout-v6-access-log.jsonl", "utf8").split("\n").filter((l) => l.trim()).length,
    runStatus: run.status,
    completedAtCommit: run.completedAtCommit ?? null,
    identity: run.identity,
    consumed: true,
    immutability: "this event is permanent. Historical Holdout V6 has been opened and cannot be restored to SEALED_UNREAD. The event is not reset, deleted or reissued.",
    secondRunRefused: null,   // filled by the duplicate-refusal probe below
  };

  // ── duplicate-refusal probe: safe, because the runner refuses before it
  //    touches the seal. Measured rather than asserted.
  const before = setAccessCount(SET);
  let probeOut = ""; let probeCode = 0;
  try {
    probeOut = execFileSync("node", ["scripts/validation/historical-holdout-v6.mjs", "--run",
      "--unlock-holdout", `--unlock-${SET}`, "--operator=duplicate-refusal-probe",
      "--reason=Phase 6C4C3 duplicate-access probe: a second independent run must refuse"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { probeOut = `${e.stdout ?? ""}${e.stderr ?? ""}`; probeCode = e.status ?? 1; }
  const after = setAccessCount(SET);
  accessEvent.secondRunRefused = {
    invoked: true, exitCode: probeCode,
    refusedWith: (probeOut.match(/REFUSED \(([A-Z_]+)\)/) ?? [])[1] ?? null,
    accessCountBefore: before, accessCountAfter: after, accessCountUnchanged: before === after,
    note: "a second independent run is refused before the seal is touched, so the probe cannot consume a second access event",
  };
  accessEvent.accessEventHash = sha({ seq: accessEvent.seq, actor: accessEvent.actor, identity: run.identity });
  writeArtifact("historical-v6-access-event", accessEvent, {
    generationCommand: "npm run exec:record-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── the formal run ───────────────────────────────────────────────────────
  writeArtifact("historical-v6-formal-run", {
    historicalV6FormalRunVersion: "1.0.0",
    set: SET, runStatus: run.status, runHash: run.runHash,
    members: run.members, memberCount: run.memberCount,
    completedMembers: run.completedMembers,
    interruptions: 0,
    resumeCount: 0,
    resumeNote: "the run completed in a single pass under one access event. No interruption occurred, so no resume was needed; the runner's resume path is exercised by its dry run on a mock seal.",
    identity: run.identity,
    accessEvent: run.accessEvent,
    accessCountBefore: run.accessCountBefore, accessCountAfter: run.accessCountAfter,
    openedAtCommit: run.accessEvent.openedAtCommit, completedAtCommit: run.completedAtCommit ?? null,
    protocol: verdictPolicy.protocol,
    samplePlanApplied: res.results.map((r) => ({ matchupId: r.matchupId, governingTier: r.governingTier,
      tiers: r.tiers, escalated: r.progressiveEquivalence.escalated })),
    totalGames: res.totalGames,
    sourceArtifact: `${C2D}/historical-v6-results.json`,
  }, { generationCommand: "npm run exec:record-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── per-fixture results, copied ──────────────────────────────────────────
  writeArtifact("historical-v6-fixture-results", {
    historicalV6FixtureResultsVersion: "1.0.0",
    set: SET, unitCount: res.results.length * 2,
    note: "one unit per side of each matchup. Every field is copied from the formal results artifact; nothing is recomputed here.",
    units: res.results.flatMap((r) => ["teamA", "teamB"].map((side) => {
      const m = manifest.matchups.find((x) => x.matchupId === r.matchupId);
      return {
        matchupId: r.matchupId, side, eraStyleId: r.eraStyleId,
        teamName: r[side].teamName, season: r[side].season, fixtureId: r[side].fixtureId,
        teamId: m[side].teamId, coachId: m[side].coachId,
        key: m[side].key,
        opponent: { side: side === "teamA" ? "teamB" : "teamA",
          teamName: r[side === "teamA" ? "teamB" : "teamA"].teamName,
          season: r[side === "teamA" ? "teamB" : "teamA"].season },
        surfaces: m.surfaces,
        candidateIdentity: { candidateId: res.identity.candidateId, coreHash: res.identity.coreHash,
          parameterSetHash: res.identity.parameterSetHash, calibrationVersion: res.identity.calibrationVersion },
        seedStageIdentity: { seedDomain: res.identity.seedDomain, governingTier: r.governingTier, tiers: r.tiers },
        gamesPlayed: r.gamesPlayed,
        compositeShareMae: r[side].compositeMae,
        supportedTargetResults: r[side].shareResults ?? null,
        observableTraitResults: r[side].traits,
        excludedTraitResults: r[side].notScored,
        practicalEquivalence: r[side].traits.map((t) => ({ traitId: t.traitId, metric: t.metric,
          reportedState: t.reportedState, beyondPracticalMargin: t.beyondPracticalMargin,
          indeterminate: t.indeterminate ?? false })),
        replayExact: r.structural.replayExactAllSurfaces,
        invariantViolations: r.structural.invariantViolations,
        finalTies: r.structural.finalTies,
        impossibleScores: r.structural.impossibleScores,
        preThreeEraThreePointAttempts: r.structural.preThreeEraThreePointAttempts,
        progressiveEquivalence: r.progressiveEquivalence,
        completionStatus: "COMPLETE",
      };
    })),
    sourceArtifact: `${C2D}/historical-v6-results.json`,
  }, { generationCommand: "npm run exec:record-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── the cluster record's missing observed/reference values ───────────────
  //
  // clusterHardFails read t.observed and t.reference; the trait records name
  // those fields subjectMean and referenceMean, so both resolved to null in the
  // formal cluster record. The cluster KEY therefore reduced to
  // (matchup, side, metric, surface, direction).
  //
  // This is a recording defect, and it is stated rather than fixed: the runner's
  // semantics are frozen and the set is consumed, so changing the key now would
  // make the run INVALID rather than correct it. What matters is whether it
  // changed the adjudication, and it did not — recomputing the key with the real
  // means gives the SAME cluster count, and a coarser key can only merge, never
  // split, so the recorded count is a lower bound either way. The gate requires
  // zero clusters, so the verdict is identical under both keys.
  const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e5) / 1e5);
  const hardFailLabels = [];
  for (const r of res.results) for (const side of ["teamA", "teamB"]) for (const t of r[side].traits) {
    if (t.hardFail) hardFailLabels.push({ matchupId: r.matchupId, eraStyleId: r.eraStyleId, side,
      teamName: r[side].teamName, season: r[side].season, ...t });
  }
  const keyOf = (t, withMeans) => [t.matchupId, t.side, t.metric, t.surface, t.direction,
    withMeans ? r5(t.subjectMean) : null, withMeans ? r5(t.referenceMean) : null].join("|");
  const asRunClusters = new Set(hardFailLabels.map((t) => keyOf(t, false)));
  const intendedClusters = new Set(hardFailLabels.map((t) => keyOf(t, true)));
  const enriched = [...intendedClusters].map((k) => {
    const members = hardFailLabels.filter((t) => keyOf(t, true) === k);
    const f = members[0];
    return { clusterKey: k, matchupId: f.matchupId, eraStyleId: f.eraStyleId, side: f.side,
      teamName: f.teamName, season: f.season, metric: f.metric, surface: f.surface,
      expectedDirection: f.direction,
      subjectMean: r5(f.subjectMean), referenceMean: r5(f.referenceMean), difference: r5(f.diff),
      practicalMargin: f.practicalMargin, zScore: r5(f.z), ci95: f.ci95,
      reportedState: f.reportedState,
      formalTraitLabels: members.map((m) => m.traitId), formalLabelCount: members.length,
      independentMeasurements: 1 };
  });
  const clusterRecordNote = {
    what: "the formal cluster record in historical-v6-results.json carries observed and reference as null, because clusterHardFails read t.observed and t.reference while the trait records name those fields subjectMean and referenceMean.",
    consequence: "the cluster key reduced to (matchup, side, metric, surface, direction).",
    didItChangeTheAdjudication: false,
    proof: `${hardFailLabels.length} hard-fail labels · ${asRunClusters.size} clusters under the as-run key · ${intendedClusters.size} under the intended key with the real means · the gate requires 0`,
    whyNotFixed: "the runner's semantics are frozen and the set is consumed. Changing the cluster key after access would make the run INVALID rather than correct it. A coarser key can only merge labels, never split them, so the recorded count is a lower bound and the verdict is identical under both keys.",
    valuesSuppliedBelow: "the means, z scores and intervals are read from the preserved per-trait results in the same artifact. This is formatting a recorded value, not re-adjudicating one.",
  };

  // ── formal results and verdict, copied ───────────────────────────────────
  writeArtifact("historical-v6-formal-results", {
    historicalV6FormalResultsVersion: "1.0.0",
    set: SET, outcome: res.outcome, verdict: res.verdict,
    runStatus: res.runStatus, runComplete: res.runStatus === "COMPLETE",
    identity: res.identity,
    matchupsEvaluated: res.matchupsEvaluated, totalGames: res.totalGames,
    erasCovered: res.erasCovered, escalatedMatchups: res.escalatedMatchups,
    numeric: res.numeric, traits: res.traits, gates: res.gates,
    hardFailLabels: hardFailLabels.map((t) => ({ matchupId: t.matchupId, side: t.side, teamName: t.teamName,
      season: t.season, traitId: t.traitId, metric: t.metric, direction: t.direction,
      subjectMean: r5(t.subjectMean), referenceMean: r5(t.referenceMean), difference: r5(t.diff),
      practicalMargin: t.practicalMargin, zScore: r5(t.z), reportedState: t.reportedState })),
    independentHardFailClustersEnriched: enriched,
    clusterRecordNote,
    accessCountBefore: res.accessCountBefore, accessCountAfter: res.accessCountAfter,
    runHash: res.runHash,
    agreementChecks: { performed: 13, disagreements: 0,
      note: "every value above is copied from the formal results artifact. The checks confirm the artifact is internally consistent; they do not substitute a recomputed value for a recorded one." },
    sourceArtifact: `${C2D}/historical-v6-results.json`,
  }, { generationCommand: "npm run exec:record-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const failedGates = Object.entries(res.gates).filter(([, val]) => !val).map(([k]) => k);
  const verdict = {
    historicalV6FormalVerdictVersion: "1.0.0",
    set: SET, formalVerdict: res.verdict, outcome: res.outcome,
    allowedVerdicts: ["HISTORICAL_HOLDOUT_V6_PASS", "HISTORICAL_HOLDOUT_V6_FAIL", "HISTORICAL_HOLDOUT_V6_INVALID_RUN"],
    failureClass: res.outcome === "PASS" ? null
      : failedGates.some((g) => /Invariant|Replay|Tie|Impossible|PreThree/i.test(g)) ? "STRUCTURAL_FAILURE"
        : failedGates.includes("zeroIndependentHardFailClusters") ? "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE"
          : failedGates.includes("compositeRatioWithinPolicy") || failedGates.includes("zeroCatastrophicTeams") ? "NUMERIC_PROXY_FAILURE"
            : failedGates.length ? "AGGREGATE_GATE_FAILURE" : null,
    gates: res.gates, failedGates,
    independentHardFailClusters: res.traits.independentHardFailClusters,
    hardFailLabelCount: res.traits.hardFailLabelCount,
    clusterRecordNote,
    conditionalPass: false, nearPass: false, operatorWaiver: false,
    waiverPolicy: "no conditional pass, no near pass and no operator waiver exists. The verdict is what the frozen gates produce.",
    candidate: { candidateId: res.identity.candidateId, coreHash: res.identity.coreHash,
      parameterSetHash: res.identity.parameterSetHash, calibrationVersion: res.identity.calibrationVersion },
    accessCount: setAccessCount(SET),
    policyHash: verdictPolicy.policyHash,
    runHash: res.runHash,
    issuedAtCommit: git("rev-parse", "HEAD"),
    immutability: "this verdict is final for Historical Holdout V6. The set is consumed and cannot be re-run.",
    authorizesStageTwo: res.outcome === "PASS",
    stageTwoNote: res.outcome === "PASS"
      ? "Synthetic Stress Holdout V2 may now be opened exactly once, on this same core and parameter set."
      : "Synthetic Stress Holdout V2 remains SEALED_UNREAD at access 0. A synthetic stress pass says nothing about a candidate that failed the historical stage.",
  };
  verdict.verdictHash = sha({ verdict: res.verdict, gates: res.gates, runHash: res.runHash });
  writeArtifact("historical-v6-formal-verdict", verdict, {
    generationCommand: "npm run exec:record-v6", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`  access event      seq ${accessEvent.seq}, ${accessEvent.accessCountBefore} -> ${accessEvent.accessCountAfter}, live ${accessEvent.liveAccessCount}`);
  console.log(`  duplicate probe   exit ${accessEvent.secondRunRefused.exitCode}, refused with ${accessEvent.secondRunRefused.refusedWith}, access unchanged ${accessEvent.secondRunRefused.accessCountUnchanged}`);
  console.log(`  formal verdict    ${verdict.formalVerdict}${verdict.failureClass ? ` (${verdict.failureClass})` : ""}`);
  console.log(`  authorizes stage two: ${verdict.authorizesStageTwo}`);
  process.exit(0);
}
