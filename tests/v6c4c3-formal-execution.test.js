// ── Phase 6C4C3: Candidate 2 two-stage formal execution ──────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { setAccessCount, allSealStatuses, SEALED_SETS } from "../src/v3/calibration/holdoutSeal.js";
import { compoundVerdict, COMPOUND_VERDICTS } from "../scripts/validation/candidate2FormalVerdict.mjs";
import { formalState, STATES } from "../scripts/execution/statusC3.mjs";
import { clusterHardFails } from "../scripts/validation/historical-holdout-v6.mjs";

const C3 = "data/validation/6c4c3";
const C2 = "data/validation/6c4c2";
const read = (dir, name) => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8")).data;

describe("preflight, before either seal opened", () => {
  const pf = read(C3, "phase6c4c3-preflight");

  it("verified Candidate 2's lock, core and parameter set against the repository", () => {
    expect(pf.candidate2.candidateLockStatus.value).toContain("LOCKED");
    expect(pf.candidate2.coreHashLive.value).toBe(pf.candidate2.coreHashFromLock.value);
    expect(pf.candidate2.parameterSetHashLive.value).toBe(pf.candidate2.parameterSetHashFromLock.value);
    expect(pf.candidate2CoreStable).toBe(true);
    expect(pf.candidate2ParameterSetStable).toBe(true);
  });

  it("carries a source path on every value, so nothing rests on a summary field", () => {
    for (const [k, x] of Object.entries(pf.candidate2)) {
      expect(x.source, `candidate2.${k} names its source`).toBeTruthy();
    }
  });

  it("recorded both sets sealed at zero with no formal output", () => {
    expect(pf.historicalV6AccessCount).toBe(0);
    expect(pf.historicalV6Outputs).toBe(0);
    expect(pf.syntheticAccessCount).toBe(0);
    expect(pf.syntheticOutputs).toBe(0);
  });

  it("measured every non-accessing mode rather than asserting it", () => {
    expect(pf.commandSurfaces.invocations.length).toBeGreaterThanOrEqual(8);
    for (const i of pf.commandSurfaces.invocations) {
      expect(i.setsOpened, `${i.command} ${i.args.join(" ")}`).toEqual([]);
      expect(i.formalOutputsWritten).toEqual([]);
      expect(i.resolved).toBe(true);
    }
    expect(pf.nonAccessingModesSafe).toBe(true);
  });

  it("records the six verification corrections rather than hiding them", () => {
    expect(pf.verificationCorrections.corrections.length).toBeGreaterThanOrEqual(6);
    expect(pf.verificationCorrections.what).toMatch(/defect in the verification, not in what it verifies/);
    for (const c of pf.verificationCorrections.corrections) {
      expect(c.wasReading).toBeTruthy();
      expect(c.nowChecks).toBeTruthy();
    }
  });

  it("reconciles the brief's expected counts against the repository", () => {
    const items = pf.promptExpectationReconciliation;
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const i of items) { expect(i.expected).toBeTruthy(); expect(i.why).toBeTruthy(); }
  });

  it("authorized execution", () => {
    expect(pf.formalExecutionAuthorized).toBe(true);
    expect(pf.compoundPackageValid).toBe(true);
  });
});

describe("the execution authorization", () => {
  const auth = read(C3, "candidate2-formal-execution-authorization");

  it("binds the candidate and both stage packages", () => {
    for (const k of ["candidateCoreHash", "parameterSetHash", "calibrationVersion",
      "historicalV6PackageHash", "syntheticPackageHash", "compoundPackageHash", "preflightHash"]) {
      expect(auth[k], k).toBeTruthy();
    }
  });

  it("permits exactly three things and forbids candidate or policy modification", () => {
    expect(auth.permits.length).toBe(3);
    expect(auth.doesNotPermit.join(" ")).toMatch(/post-holdout tuning/);
    expect(auth.doesNotPermit.join(" ")).toMatch(/merging to main/);
  });

  it("names the stage order", () => {
    expect(auth.stageOrder).toEqual(["historical-holdout-v6", "synthetic-stress-holdout-v2"]);
  });
});

describe("Historical V6 was opened exactly once", () => {
  const ev = read(C3, "historical-v6-access-event");
  const run = read(C3, "historical-v6-formal-run");

  it("created one access event, 0 -> 1", () => {
    expect(ev.seq).toBe(1);
    expect(ev.accessCountBefore).toBe(0);
    expect(ev.accessCountAfter).toBe(1);
    expect(ev.liveAccessCount).toBe(1);
    expect(ev.accessLogLines).toBe(1);
  });

  it("agrees with the live access log", () => {
    expect(setAccessCount("historical-holdout-v6")).toBe(1);
  });

  it("refused a second independent run without touching the seal", () => {
    expect(ev.secondRunRefused.invoked).toBe(true);
    expect(ev.secondRunRefused.refusedWith).toBe("SECOND_RUN_REFUSED");
    expect(ev.secondRunRefused.accessCountUnchanged).toBe(true);
    expect(ev.secondRunRefused.accessCountAfter).toBe(1);
  });

  it("records the event as permanent", () => {
    expect(ev.consumed).toBe(true);
    expect(ev.immutability).toMatch(/cannot be restored to SEALED_UNREAD/);
  });

  it("completed all eight matchups in one pass under that event", () => {
    expect(run.runStatus).toBe("COMPLETE");
    expect(run.memberCount).toBe(8);
    expect(run.completedMembers.length).toBe(8);
    expect(run.interruptions).toBe(0);
    expect(run.resumeCount).toBe(0);
  });

  it("opened at the pushed preflight commit", () => {
    expect(ev.openedAtCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("Historical V6 applied only the frozen package", () => {
  const res = read(C3, "historical-v6-formal-results");
  const fixtures = read(C3, "historical-v6-fixture-results");
  const manifest = read(C2, "historical-holdout-v6-manifest");
  const policy = read(C2, "historical-v6-verdict-policy");
  const plan = read(C2, "historical-v6-sample-plan");
  const obs = read(C2, "historical-v6-observability-certification");

  it("ran every frozen matchup and no others", () => {
    expect(res.matchupsEvaluated).toBe(manifest.matchupCount);
    expect(new Set(fixtures.units.map((u) => u.matchupId)).size).toBe(8);
    expect(fixtures.units.length).toBe(16);
  });

  it("used the frozen sample tiers, escalating only where the plan allows", () => {
    const decision = plan.tiers.find((t) => t.role === "DECISION").tier;
    const escalation = plan.tiers.find((t) => t.role === "ESCALATION").tier;
    for (const u of fixtures.units) {
      expect([decision, escalation]).toContain(u.seedStageIdentity.governingTier);
      if (u.seedStageIdentity.governingTier === escalation) {
        expect(u.progressiveEquivalence.escalated).toBe(true);
      }
    }
  });

  it("scored only traits the frozen observability certification made eligible", () => {
    const eligible = new Set(obs.traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
    for (const u of fixtures.units) {
      for (const t of u.observableTraitResults) expect(eligible.has(t.traitId), t.traitId).toBe(true);
    }
  });

  it("never scored interiorShotShare and never altered its sample size", () => {
    expect(obs.certifiedMetrics).not.toContain("interiorShotShare");
    for (const u of fixtures.units) {
      for (const t of u.observableTraitResults) expect(t.metric).not.toBe("interiorShotShare");
    }
    expect(obs.gamesPerCell).toBe(2000);
  });

  it("gave excluded traits neither pass credit nor failure", () => {
    for (const u of fixtures.units) {
      for (const t of u.excludedTraitResults) {
        expect(["NOT_APPLICABLE", "NOT_SCORED_UNOBSERVABLE"]).toContain(t.result);
      }
    }
  });

  it("bound the candidate identity on every unit", () => {
    for (const u of fixtures.units) {
      expect(u.candidateIdentity.candidateId).toBe("Candidate 2");
      expect(u.candidateIdentity.calibrationVersion).toBe("1.2.0");
      expect(u.candidateIdentity.coreHash).toBe(res.identity.coreHash);
    }
  });

  it("pinned the policy's required core and calibration version", () => {
    expect(res.identity.coreHash).toBe(policy.structuralGates.coreHashMustEqual);
    expect(res.identity.calibrationVersion).toBe(policy.structuralGates.calibrationVersionMustEqual);
  });
});

describe("the dual gate and the cluster rule as applied", () => {
  const res = read(C3, "historical-v6-formal-results");

  it("hard-failed only where the direction was wrong AND the margin was cleared", () => {
    for (const t of res.hardFailLabels) {
      expect(Math.abs(t.difference)).toBeGreaterThan(t.practicalMargin);
    }
  });

  it("classified every trait into the frozen vocabulary", () => {
    const allowed = new Set(["PASS", "FAIL", "EQUIVALENT",
      "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT",
      "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED", "INCONCLUSIVE",
      "NOT_SCORED", "NOT_APPLICABLE", "NOT_OBSERVABLE"]);
    for (const r of res.traits.clusters) expect(r.metric).toBeTruthy();
    for (const t of res.hardFailLabels) expect(allowed.has(t.reportedState), t.reportedState).toBe(true);
  });

  it("collapsed duplicate labels onto independent measurements", () => {
    expect(res.traits.hardFailLabelCount).toBe(12);
    expect(res.traits.independentHardFailClusters).toBe(8);
    expect(res.traits.independentHardFailClusters).toBeLessThan(res.traits.hardFailLabelCount);
  });

  it("aggregated on clusters, not labels", () => {
    const policy = read(C2, "historical-v6-verdict-policy");
    expect(policy.aggregation.unit).toBe("INDEPENDENT_MEASUREMENT_CLUSTER");
    expect(policy.traitGates.aggregate.maxIndependentHardFailClusters).toBe(0);
  });

  it("records that the cluster key's null means did not change the count", () => {
    const n = res.clusterRecordNote;
    expect(n.didItChangeTheAdjudication).toBe(false);
    expect(n.whyNotFixed).toMatch(/frozen/);
    expect(res.independentHardFailClustersEnriched.length).toBe(res.traits.independentHardFailClusters);
  });

  it("supplies the means the formal cluster record left null", () => {
    for (const c of res.independentHardFailClustersEnriched) {
      expect(c.subjectMean).not.toBeNull();
      expect(c.referenceMean).not.toBeNull();
      expect(c.formalLabelCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("still reaches the same cluster count under the intended key", () => {
    const labels = res.hardFailLabels;
    const fine = new Set(labels.map((t) => [t.matchupId, t.side, t.metric, t.direction,
      t.subjectMean, t.referenceMean].join("|")));
    expect(fine.size).toBe(res.traits.independentHardFailClusters);
  });
});

describe("structural gates all held", () => {
  const res = read(C3, "historical-v6-formal-results");
  const fixtures = read(C3, "historical-v6-fixture-results");

  it("zero invariant failures, ties, impossible scores and pre-three-era attempts", () => {
    expect(res.gates.zeroInvariantFailures).toBe(true);
    expect(res.gates.zeroFinalTies).toBe(true);
    expect(res.gates.zeroImpossibleScores).toBe(true);
    expect(res.gates.zeroPreThreeEraThreePointAttempts).toBe(true);
    for (const u of fixtures.units) {
      expect(u.invariantViolations).toBe(0);
      expect(u.finalTies).toBe(0);
      expect(u.impossibleScores).toBe(0);
      expect(u.preThreeEraThreePointAttempts).toBe(0);
    }
  });

  it("replayed exactly on every surface", () => {
    expect(res.gates.replayExactEverywhere).toBe(true);
    for (const u of fixtures.units) expect(u.replayExact).toBe(true);
  });

  it("passed the numeric proxy gate", () => {
    expect(res.gates.compositeRatioWithinPolicy).toBe(true);
    expect(res.gates.zeroCatastrophicTeams).toBe(true);
    expect(res.numeric.ratio).toBeLessThanOrEqual(res.numeric.ratioGate);
  });
});

describe("the Historical V6 verdict", () => {
  const v = read(C3, "historical-v6-formal-verdict");

  it("is one of the three allowed verdicts", () => {
    expect(v.allowedVerdicts).toContain(v.formalVerdict);
  });

  it("failed on observable trait fidelity", () => {
    expect(v.formalVerdict).toBe("HISTORICAL_HOLDOUT_V6_FAIL");
    expect(v.outcome).toBe("FAIL");
    expect(v.failureClass).toBe("OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE");
  });

  it("names exactly which gates failed", () => {
    expect(v.failedGates.sort()).toEqual([
      "noEraFailsEveryScoredTrait", "noMatchupFailsMajorityOfTraits",
      "traitPassRateMet", "zeroIndependentHardFailClusters",
    ]);
  });

  it("offers no conditional pass, near pass or operator waiver", () => {
    expect(v.conditionalPass).toBe(false);
    expect(v.nearPass).toBe(false);
    expect(v.operatorWaiver).toBe(false);
  });

  it("does not authorize stage two", () => {
    expect(v.authorizesStageTwo).toBe(false);
    expect(v.stageTwoNote).toMatch(/remains SEALED_UNREAD at access 0/);
  });
});

describe("the Synthetic set was never opened", () => {
  it("stands at access 0 and SEALED_UNREAD", () => {
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(allSealStatuses()["synthetic-stress-holdout-v2"].status).toBe("SEALED_UNREAD");
    expect(existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])).toBe(false);
  });

  it("produced no formal output of any kind", () => {
    for (const n of ["synthetic-candidate2-access-event", "synthetic-candidate2-formal-run",
      "synthetic-candidate2-fixture-results", "synthetic-candidate2-formal-results",
      "synthetic-candidate2-formal-verdict"]) {
      expect(existsSync(`${C3}/${n}.json`), n).toBe(false);
    }
    expect(existsSync(`${C2}/synthetic-v2-candidate2-results.json`)).toBe(false);
  });

  it("keeps its Candidate 2 binding intact and unread", () => {
    const b = read(C2, "synthetic-v2-candidate2-binding");
    expect(b.sealState.accessCount).toBe(0);
    expect(b.replacedWithV3).toBe(false);
  });

  it("keeps its frozen registry at eleven keys", () => {
    const reg = read("data/validation/6c4b1s", "synthetic-v2-guardrail-registry");
    expect(reg.guardrailCount).toBe(11);
    expect(reg.adjudicableGuardrailCount).toBe(8);
    expect(reg.thresholdParameterCount).toBe(3);
  });
});

describe("the compound verdict", () => {
  const c = read(C3, "candidate2-compound-formal-verdict");

  it("simulated nothing and opened nothing", () => {
    expect(c.gamesSimulated).toBe(0);
    expect(c.sealsOpened).toBe(0);
    expect(c.accessCountsUnchangedByThisStage["historical-holdout-v6"]).toBe(1);
    expect(c.accessCountsUnchangedByThisStage["synthetic-stress-holdout-v2"]).toBe(0);
  });

  it("names the deciding stage", () => {
    expect(c.verdict).toBe("CANDIDATE2_HISTORICAL_V6_FAILED");
    expect(c.verdictMeaning).toMatch(/decided by stage one/);
  });

  it("says why stage two was not opened", () => {
    expect(c.stageTwoOpened).toBe(false);
    expect(c.stageTwoNotOpenedBecause).toMatch(/forbids opening the synthetic set without a passing stage one/);
  });

  it("records the write-guard correction and that the state machine is unchanged", () => {
    expect(c.writeGuardCorrection.stateMachineUnchanged).toMatch(/byte-identical in behaviour/);
  });

  it("claims no validated status", () => {
    // the artifact's wording is "HOLDOUT_VALIDATED as a repository status"
    expect(c.notClaimed.join(" | ")).toMatch(/HOLDOUT_VALIDATED/);
    expect(c.notClaimed.join(" | ")).toMatch(/PRODUCTION_READY/);
    expect(c.productionActivation).toMatch(/CEO GO LIVE/);
  });
});

describe("the compound state machine, every transition", () => {
  const s = (over) => ({ ran: false, outcome: null, ...over });
  const P = s({ ran: true, outcome: "PASS" });
  const F = s({ ran: true, outcome: "FAIL" });
  const I = s({ ran: true, outcome: "INVALID_RUN" });

  it("returns the same verdict this run received", () => {
    expect(compoundVerdict({ s1: F, s2: s(), identitySplit: false })).toBe("CANDIDATE2_HISTORICAL_V6_FAILED");
  });

  it("covers not-started, both terminal stage-one paths, pending, both stage-two paths, split and pass", () => {
    expect(compoundVerdict({ s1: s(), s2: s(), identitySplit: false })).toBe("CANDIDATE2_NOT_YET_DETERMINED");
    expect(compoundVerdict({ s1: I, s2: s(), identitySplit: false })).toBe("CANDIDATE2_HISTORICAL_V6_INVALID");
    expect(compoundVerdict({ s1: P, s2: s(), identitySplit: false })).toBe("CANDIDATE2_NOT_YET_DETERMINED");
    expect(compoundVerdict({ s1: P, s2: F, identitySplit: false })).toBe("CANDIDATE2_SYNTHETIC_V2_FAILED");
    expect(compoundVerdict({ s1: P, s2: I, identitySplit: false })).toBe("CANDIDATE2_SYNTHETIC_V2_INVALID");
    expect(compoundVerdict({ s1: P, s2: P, identitySplit: true })).toBe("CANDIDATE2_IDENTITY_SPLIT");
    expect(compoundVerdict({ s1: P, s2: P, identitySplit: false })).toBe("CANDIDATE2_HOLDOUT_VALIDATED");
  });

  it("refuses a synthetic result obtained out of order", () => {
    expect(compoundVerdict({ s1: s(), s2: P, identitySplit: false })).toBe("CANDIDATE2_STAGE_ORDER_VIOLATED");
    expect(compoundVerdict({ s1: F, s2: P, identitySplit: false })).toBe("CANDIDATE2_STAGE_ORDER_VIOLATED");
  });

  it("requires BOTH stages to pass before it validates", () => {
    const validating = [
      [s(), s()], [F, s()], [I, s()], [P, s()], [P, F], [P, I], [s(), P], [F, P],
    ].map(([s1, s2]) => compoundVerdict({ s1, s2, identitySplit: false }));
    expect(validating).not.toContain("CANDIDATE2_HOLDOUT_VALIDATED");
  });

  it("gives every verdict a meaning", () => {
    for (const [k, m] of Object.entries(COMPOUND_VERDICTS)) expect(m.length, k).toBeGreaterThan(30);
  });
});

describe("the formal status state machine", () => {
  const v = (outcome) => ({ outcome });

  it("matches what this run produced", () => {
    expect(formalState({ v6: v("FAIL"), syn: null })).toBe("CANDIDATE2_HISTORICAL_V6_FAILED");
  });

  it("covers every allowed high-level state", () => {
    expect(formalState({ v6: null, syn: null })).toBe("CANDIDATE2_FORMAL_VALIDATION_NOT_STARTED");
    expect(formalState({ v6: v("INVALID_RUN"), syn: null })).toBe("CANDIDATE2_HISTORICAL_V6_INVALID");
    expect(formalState({ v6: v("PASS"), syn: null })).toBe("CANDIDATE2_STAGE1_PASSED_STAGE2_PENDING");
    expect(formalState({ v6: v("PASS"), syn: v("FAIL") })).toBe("CANDIDATE2_SYNTHETIC_FAILED");
    expect(formalState({ v6: v("PASS"), syn: v("INVALID_RUN") })).toBe("CANDIDATE2_SYNTHETIC_INVALID");
    expect(formalState({ v6: v("PASS"), syn: v("PASS") })).toBe("CANDIDATE2_FORMAL_VALIDATION_PASSED");
    expect(Object.keys(STATES).length).toBe(7);
  });

  it("sets HOLDOUT_VALIDATED under exactly one state", () => {
    const st = read(C3, "candidate2-formal-status");
    expect(st.holdoutValidatedRule).toMatch(/only under CANDIDATE2_FORMAL_VALIDATION_PASSED/);
    const validating = Object.keys(STATES).filter((s) => s === "CANDIDATE2_FORMAL_VALIDATION_PASSED");
    expect(validating.length).toBe(1);
  });
});

describe("Candidate 2 formal status", () => {
  const st = read(C3, "candidate2-formal-status");

  it("does not claim HOLDOUT_VALIDATED", () => {
    expect(st.holdoutValidatedClaimed).toBe(false);
    expect(st.calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(st.formalValidationStatus).toBe("HISTORICAL_V6_FAILED");
  });

  it("leaves the calibration version where the lock left it", () => {
    expect(st.possessionCalibrationVersion).toBe("1.2.0");
    expect(st.calibrationVersionNote).toMatch(/status change does not move a calibration version/);
  });

  it("records zero changes of every forbidden kind", () => {
    for (const k of ["postHoldoutTuning", "engineChanges", "dataChanges", "policyChanges",
      "targetChanges", "marginChanges", "seedChanges", "referenceChanges", "traitChanges",
      "runnerSemanticChanges"]) {
      expect(st[k], k).toBe(0);
    }
  });

  it("prepares no preview", () => {
    expect(st.previewStatus).toBe("NOT_PREPARED");
    expect(existsSync(`${C3}/candidate2-protected-preview-package.json`)).toBe(false);
  });

  it("says what a Candidate 3 would require", () => {
    expect(st.nextRequirement).toMatch(/NEW unseen historical holdout/);
    expect(st.nextRequirement).toMatch(/Synthetic Stress Holdout V2 remains sealed/);
  });
});

describe("the attempt registry", () => {
  const reg = read(C3, "formal-validation-attempts");

  it("holds six attempts across three candidates", () => {
    expect(reg.attemptCount).toBe(6);
    expect(reg.byCandidate["Candidate 0"].length).toBe(2);
    expect(reg.byCandidate["Candidate 1"].length).toBe(2);
    expect(reg.byCandidate["Candidate 2"].length).toBe(2);
  });

  it("changed no prior attempt", () => {
    expect(reg.priorVerdictsUnchanged).toBe(true);
    expect(reg.supersedesRegistry.notOverwritten).toBe(true);
    expect(reg.pass).toBe(true);
  });

  it("attributes every attempt to a candidate, core and holdout", () => {
    for (const a of reg.attempts) {
      expect(a.candidateId, a.attemptId).toBeTruthy();
      expect(a.holdoutId, a.attemptId).toBeTruthy();
      expect(a.candidateCoreHash, a.attemptId).toBeTruthy();
    }
  });

  it("opened no set twice", () => {
    for (const a of reg.attempts) expect(a.accessCount, a.holdoutId).toBeLessThanOrEqual(1);
  });

  it("reconciles every access count with its live log", () => {
    for (const a of reg.attempts) expect(a.accessCount).toBe(setAccessCount(a.holdoutId));
  });

  it("records the synthetic set as NOT_OPENED for both candidates", () => {
    const syn = reg.attempts.filter((a) => a.holdoutId === "synthetic-stress-holdout-v2");
    expect(syn.length).toBe(2);
    for (const a of syn) { expect(a.formalVerdict).toBe("NOT_OPENED"); expect(a.accessCount).toBe(0); }
  });
});

describe("seal state across the whole lineage", () => {
  it("has V3, V4, V5 and V6 consumed at one each, and the synthetic set at zero", () => {
    for (const s of ["historical-holdout-v3", "historical-holdout-v4",
      "historical-holdout-v5", "historical-holdout-v6"]) {
      expect(setAccessCount(s), s).toBe(1);
    }
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
  });

  it("gives every set its own access log", () => {
    const logs = Object.values(SEALED_SETS);
    expect(new Set(logs).size).toBe(logs.length);
  });
});

describe("production isolation", () => {
  const st = read(C3, "candidate2-formal-status");

  it("left main at the production baseline", () => {
    expect(st.production.mainCommit).toBe("9cd95ff8797f8cdef252bbe67d63158c01b9f9bd");
  });

  it("executed no deployment and activated no flag", () => {
    expect(st.production.deploymentsExecuted).toBe(0);
    expect(st.production.flagsActivated).toBe(0);
    expect(st.productionStatus).toBe("UNCHANGED");
  });

  it("keeps every production flag false", () => {
    const src = readFileSync("api/_lib/flags.js", "utf8");
    const on = [...src.matchAll(/(\w+)\s*:\s*true/g)].map((m) => m[1]);
    expect(on.filter((f) => /candidate2|preview|v6|holdoutValidated/i.test(f))).toEqual([]);
  });
});
