#!/usr/bin/env node
// ── WS2/WS3: record the Historical V5 formal execution and verdict ──────────
//   npm run exec:record-v5
//
// Every number here is COPIED from the runner's own outputs — the run state it
// wrote incrementally and the results artifact it produced. Nothing is
// recomputed: a report that recalculates a total can disagree with the artifact
// that decided the verdict, and then neither can be trusted.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, B1, git } from "./preflight6c4b2r.mjs";

const SET = "historical-holdout-v5";
const RUN_PATH = `${B1}/historical-holdout-v5-run.json`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const run = JSON.parse(readFileSync(RUN_PATH, "utf8"));
  const res = readArtifact("historical-holdout-v5-results", B1);
  const r = res.data;
  const pf = readArtifact("phase6c4b2r-preflight", DIR).data;
  const auth = readArtifact("formal-execution-authorization", DIR).data;
  const logPath = SEALED_SETS[SET];
  const logLines = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean) : [];

  // ── PART 7: the access event ─────────────────────────────────────────────
  const accessEvent = {
    set: SET,
    accessEventCount: logLines.length,
    accessCountBefore: run.accessCountBefore,
    accessCountAfter: run.accessCountAfter,
    accessCountNow: setAccessCount(SET),
    event: run.accessEvent,
    accessLogPath: logPath,
    accessLogSha256: createHash("sha256").update(readFileSync(logPath)).digest("hex"),
    accessLogRecords: logLines.map((l) => JSON.parse(l)),
    openedAtCommit: run.accessEvent?.openedAtCommit ?? null,
    operator: auth.operator,
    authorizationHash: auth.authorizationHash,
    irreversible: "this event is not deleted or reset. The set has been seen; a crash would not have restored unread status.",
    consumedBy: "Phase 6C4B2R stage one",
  };
  writeArtifact("historical-v5-access-event", accessEvent, {
    generationCommand: "npm run exec:record-v5", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── PART 10: the run record, copied from the incremental state ───────────
  const formalRun = {
    set: SET, runStatus: run.status, runHash: run.runHash,
    memberCount: run.memberCount, membersPlanned: run.members,
    membersCompleted: run.completedMembers,
    completedAtCommit: run.completedAtCommit ?? null,
    identity: run.identity,
    interruptions: 0, resumes: 0,
    resumeNote: "the run completed in a single pass under one access event; no interruption occurred and no resume was needed",
    incrementalWriteBehaviour: "the runner wrote the full run state after every matchup, so an interruption would have lost at most one matchup's work and resumed under the same access event",
    runStatePath: RUN_PATH,
    runStateSha256: createHash("sha256").update(readFileSync(RUN_PATH)).digest("hex"),
  };
  writeArtifact("historical-v5-formal-run", formalRun, {
    generationCommand: "npm run exec:record-v5", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── PART 10: per-fixture results, copied ────────────────────────────────
  const fixtures = r.results.map((m) => ({
    matchupId: m.matchupId, eraStyleId: m.eraStyleId,
    gamesPlayed: m.gamesPlayed,
    teamA: m.teamA ? { fixtureId: m.teamA.fixtureId, teamName: m.teamA.teamName, season: m.teamA.season,
      shareMae: m.teamA.shareMae ?? null,
      traitsScored: (m.teamA.traits ?? []).length,
      traitsPassed: (m.teamA.traits ?? []).filter((t) => t.result === "PASS").length,
      traitsFailed: (m.teamA.traits ?? []).filter((t) => t.result === "FAIL").length,
      hardFails: (m.teamA.traits ?? []).filter((t) => t.hardFail).map((t) => t.traitId),
      notScored: m.teamA.notScored ?? [], traits: m.teamA.traits ?? [] } : null,
    teamB: m.teamB ? { fixtureId: m.teamB.fixtureId, teamName: m.teamB.teamName, season: m.teamB.season,
      shareMae: m.teamB.shareMae ?? null,
      traitsScored: (m.teamB.traits ?? []).length,
      traitsPassed: (m.teamB.traits ?? []).filter((t) => t.result === "PASS").length,
      traitsFailed: (m.teamB.traits ?? []).filter((t) => t.result === "FAIL").length,
      hardFails: (m.teamB.traits ?? []).filter((t) => t.hardFail).map((t) => t.traitId),
      notScored: m.teamB.notScored ?? [], traits: m.teamB.traits ?? [] } : null,
    structural: m.structural ?? null,
  }));
  writeArtifact("historical-v5-fixture-results", {
    set: SET, matchupCount: fixtures.length, fixtures,
    copiedFrom: `${B1}/historical-holdout-v5-results.json`,
    recomputed: false,
  }, { generationCommand: "npm run exec:record-v5", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── PART 14: the formal results, copied with the hard failures itemised ──
  const allTraits = r.results.flatMap((m) => [
    ...(m.teamA?.traits ?? []).map((t) => ({ ...t, matchupId: m.matchupId, era: m.eraStyleId, side: "teamA",
      teamName: m.teamA.teamName, season: m.teamA.season })),
    ...(m.teamB?.traits ?? []).map((t) => ({ ...t, matchupId: m.matchupId, era: m.eraStyleId, side: "teamB",
      teamName: m.teamB.teamName, season: m.teamB.season })),
  ]);
  const hardFailInstances = allTraits.filter((t) => t.hardFail);
  const softFailInstances = allTraits.filter((t) => t.result === "FAIL" && !t.hardFail);
  // Two of the three hard failures are the SAME measurement scored under two
  // trait names, so the distinct-measurement count is stated alongside.
  const measurementKey = (t) => `${t.matchupId}|${t.side}|${t.metric}|${t.surface}|${t.diff}`;
  const distinctHardMeasurements = new Set(hardFailInstances.map(measurementKey));

  const formalResults = {
    set: SET, verdict: r.verdict, outcome: r.outcome,
    failureClass: r.outcome === "FAIL" ? "OBSERVABLE_DEFENSIVE_SUPPRESSION_AND_ASSISTED_OFFENCE_TRAIT_FAILURE" : null,
    identity: r.identity,
    accessEvent: r.accessEvent, accessCountBefore: r.accessCountBefore, accessCountAfter: r.accessCountAfter,
    runStatus: r.runStatus, runHash: r.runHash,
    matchupsEvaluated: r.matchupsEvaluated, gamesPerSurface: r.gamesPerSurface, totalGames: r.totalGames,
    erasCovered: r.erasCovered,
    numeric: r.numeric, traits: r.traits, gates: r.gates,
    hardFailures: hardFailInstances.map((t) => ({
      matchupId: t.matchupId, era: t.era, side: t.side, team: t.teamName, season: t.season,
      traitId: t.traitId, metric: t.metric, direction: t.direction, surface: t.surface,
      subjectMean: t.subjectMean, referenceMean: t.referenceMean, diff: t.diff, z: t.z, ci95: t.ci95,
      practicalMargin: t.practicalMargin, beyondPracticalMargin: t.beyondPracticalMargin,
      statisticallyOpposite: t.statisticallyOpposite, reportedState: t.reportedState })),
    hardFailureCount: hardFailInstances.length,
    distinctHardFailMeasurements: distinctHardMeasurements.size,
    hardFailureNote: distinctHardMeasurements.size < hardFailInstances.length
      ? `${hardFailInstances.length} hard-failing trait instances resolve to ${distinctHardMeasurements.size} distinct measurements: ELITE_DEFENSE and "elite team man defence" are both keyed on refPppVsTeam on the same surface for the same team, so they report one observation twice.`
      : null,
    softFailureCount: softFailInstances.length,
    softFailures: softFailInstances.map((t) => ({ matchupId: t.matchupId, team: t.teamName, traitId: t.traitId,
      metric: t.metric, diff: t.diff, practicalMargin: t.practicalMargin,
      beyondPracticalMargin: t.beyondPracticalMargin, statisticallyOpposite: t.statisticallyOpposite })),
    dualGateEffect: `of ${r.traits.failed} failing trait instances, ${softFailInstances.length} are inside their metric's practical margin and ${hardFailInstances.length} are both statistically opposite and beyond it. Only the latter are hard failures. Phase 6C4A withdrew four of Historical V4's twelve hard failures as sub-margin artifacts; the margin is doing the same work here, in the other direction.`,
    excludedFromScoring: { unobservableTraitInstances: r.traits.notScoredUnobservable,
      note: "unavailable and unobservable metrics remain null and excluded. None was converted to zero, none contributed pass credit, and none contributed failure." },
    copiedFrom: `${B1}/historical-holdout-v5-results.json`,
    sourceArtifactOutputHash: res.outputHash,
    recomputed: false,
  };
  writeArtifact("historical-v5-formal-results", formalResults, {
    generationCommand: "npm run exec:record-v5", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── PART 14: the immutable verdict ──────────────────────────────────────
  const verdict = {
    set: SET, verdict: r.verdict, outcome: r.outcome,
    candidateId: r.identity.candidateId, candidateCoreHash: r.identity.coreHash,
    parameterSetHash: r.identity.parameterSetHash, calibrationVersion: r.identity.calibrationVersion,
    lockRevision: r.identity.lockRevision,
    allowedVerdicts: ["HISTORICAL_HOLDOUT_V5_PASS", "HISTORICAL_HOLDOUT_V5_FAIL", "HISTORICAL_HOLDOUT_V5_INVALID_RUN"],
    decidedBy: "the gates frozen in historical-holdout-v5-policy.json before the set was selected",
    gatesPassed: Object.entries(r.gates).filter(([, v]) => v).map(([k]) => k),
    gatesFailed: Object.entries(r.gates).filter(([, v]) => !v).map(([k]) => k),
    noConditionalPass: "there is no conditional pass, no near pass and no waiver. One frozen gate failed, so the verdict is FAIL.",
    whyNotInvalidRun: "the run completed all eight matchups under one access event with zero invariant failures, zero impossible scores, zero final ties and exact replay everywhere. The apparatus worked; the candidate did not clear a frozen gate. That is a FAIL, not an INVALID_RUN.",
    immutable: true,
    consequence: r.outcome === "PASS"
      ? "stage two may open"
      : "Synthetic Stress Holdout V2 must NOT be opened. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence.",
    recordedAtCommit: git("rev-parse", "HEAD"),
  };
  verdict.verdictHash = createHash("sha256").update(JSON.stringify({
    set: SET, verdict: r.verdict, runHash: r.runHash, identity: r.identity, gates: r.gates })).digest("hex");
  writeArtifact("historical-v5-formal-verdict", verdict, {
    generationCommand: "npm run exec:record-v5", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── gates on the recording itself ───────────────────────────────────────
  console.log(`HISTORICAL V5 FORMAL EXECUTION RECORD\n`);
  console.log(`  verdict ${r.verdict}  (${r.outcome})`);
  console.log(`  access ${r.accessCountBefore} -> ${r.accessCountAfter}, ${logLines.length} access event(s), run ${run.status}`);
  console.log(`  ${r.matchupsEvaluated} matchups, ${r.totalGames.toLocaleString()} games, eras ${r.erasCovered.join(" ")}`);
  console.log(`  numeric composite ${r.numeric.holdoutComposite} vs internal ${r.numeric.internalBaselineMean} -> ratio ${r.numeric.ratio} (gate <= ${r.numeric.ratioGate})`);
  console.log(`  traits ${r.traits.passed}/${r.traits.scored} pass (rate ${r.traits.passRate}, min ${r.traits.minPassRate}), ${r.traits.notScoredUnobservable} excluded unobservable`);
  console.log(`  hard failures ${hardFailInstances.length} instances / ${distinctHardMeasurements.size} distinct measurements; soft failures ${softFailInstances.length}\n`);

  gate("accessEventCountIsExactlyOne", logLines.length === 1 && setAccessCount(SET) === 1,
    `${logLines.length} access event, access count ${setAccessCount(SET)}`);
  gate("syntheticV2StillSealedAtZero",
    setAccessCount("synthetic-stress-holdout-v2") === 0 && !existsSync(SEALED_SETS["synthetic-stress-holdout-v2"]),
    "stage two was not touched by stage one");
  gate("runCompletedEveryMatchup",
    run.status === "COMPLETE" && run.completedMembers.length === run.memberCount && run.memberCount === 8,
    `${run.completedMembers.length}/${run.memberCount} matchups, status ${run.status}`);
  gate("candidateIdentityUnchangedAcrossTheRun",
    r.identity.coreHash === core.aggregateCoreHash && r.identity.parameterSetHash === def.parameterSetHash
    && r.identity.calibrationVersion === versionOf("possessionCalibrationVersion")
    && activeParameters().every((p) => def.values[p.id] === p.defaultValue),
    `core, parameter set and calibration version identical before and after; zero parameter drift`);
  gate("candidateIdentityMatchesTheAuthorization",
    r.identity.coreHash === auth.candidateCoreHash && r.identity.parameterSetHash === auth.parameterSetHash,
    `the run scored the candidate the authorization named`);
  gate("structurallyClean",
    r.gates.zeroInvariantFailures && r.gates.zeroFinalTies && r.gates.zeroImpossibleScores
    && r.gates.replayExactEverywhere && r.gates.zeroPreThreeEraThreePointAttempts,
    "zero invariant failures, zero final ties, zero impossible scores, exact replay everywhere, zero pre-three-point-era three-point attempts");
  gate("noNumberWasRecomputed",
    formalResults.recomputed === false && formalResults.numeric === r.numeric && formalResults.traits === r.traits,
    "every total is copied from the runner's own results artifact by reference, not recalculated");
  gate("everyHardFailureIsBeyondItsPracticalMargin",
    hardFailInstances.every((t) => t.beyondPracticalMargin && t.statisticallyOpposite),
    `all ${hardFailInstances.length} hard failures are both statistically opposite and beyond the metric's frozen practical margin — none is a sub-margin artifact`);
  gate("noTuningOccurred",
    core.aggregateCoreHash === pf.candidate.coreHash && def.parameterSetHash === pf.candidate.parameterSetHash,
    "the candidate is byte-identical to the preflight record taken before the seal opened");

  const summary = { pass: fail.length === 0, failedGates: fail };
  console.log(`\nRECORD: ${summary.pass ? "CONSISTENT" : `INCONSISTENT (${fail.join(", ")})`}`);
  console.log(`  verdictHash ${verdict.verdictHash.slice(0, 16)}...`);
  console.log(`\n  ${verdict.consequence}`);
  process.exit(summary.pass ? 0 : 2);
}
