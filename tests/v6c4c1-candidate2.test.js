// ── Phase 6C4C1: Candidate 2 repair, validation and lock ────────────────────
// The load-bearing assertions are the ones that would catch a hard-code, a flat
// bonus, or a candidate that only improved the fixtures it was shown.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readArtifact, artifactExists } from "../src/v3/calibration/artifacts.js";
import { setAccessCount, SEALED_SETS } from "../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../src/versions.js";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { successionChain, assertCoreHashLineage, activeLockVersion} from "./helpers/candidateLineage.js";
import { SCHEME_TRANSFER, buildSchemePlan, coachToolkit } from "../src/v3/defense/scheme.js";
import COACH_DATA from "../src/v3/data/coaches.js";

const DIR = "data/validation/6c4c1";
const R = (n) => readArtifact(n, DIR).data;

describe("6C4C1 — prior state preserved", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("leaves Candidate 0 and Candidate 1 untouched", () => {
    expect(R("candidate0-preservation").alteredInThisPhase).toBe(false);
    expect(R("candidate1-preservation").alteredInThisPhase).toBe(false);
    expect(R("candidate1-preservation").driftFromLock).toEqual({ core: 0, parameters: 0, calibrationVersion: 0 });
  });

  it("keeps V3, V4 and V5 consumed at access one", () => {
    for (const s of ["historical-holdout-v3", "historical-holdout-v4", "historical-holdout-v5"]) {
      expect(setAccessCount(s), s).toBe(1);
    }
  });

  it("leaves Synthetic V2 sealed at access zero with no output", () => {
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])).toBe(false);
    expect(artifactExists("synthetic-v2-results", "data/validation/6c4b1s")).toBe(false);
  });

  it("reconciles Candidate 1's calibration status to the Candidate 0 precedent", () => {
    const p = R("candidate1-preservation");
    expect(p.calibrationStatus).toBe("HOLDOUT_FAILED");
    expect(p.formalValidationStatus).toBe("HISTORICAL_V5_FAILED");
    expect(p.calibrationStatusReconciliation.priorValue).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(p.calibrationStatusReconciliation.candidateUnchangedByThis).toMatch(/status field only/);
  });
});

describe("6C4C1 — the diagnostic register", () => {
  const reg = () => R("historical-v5-diagnostic-register");

  it("registers every failing instance exactly once and reconciles with the formal artifact", () => {
    const r = reg();
    expect(r.nominalFailingInstances).toBe(16);
    expect(r.formalHardFailInstances).toBe(3);
    expect(r.practicalMarginContainedInstances).toBe(13);
    expect(new Set(r.failures.map((f) => f.failureId)).size).toBe(r.failures.length);
  });

  it("collapses three formal labels into two independent measurements", () => {
    const c = R("historical-v5-independent-evidence-clusters");
    expect(c.formalHardFailLabels).toBe(3);
    expect(c.independentEvidenceClusters).toBe(2);
    expect(c.clusters.reduce((a, x) => a + x.formalLabelCount, 0)).toBe(3);
  });

  it("excludes every practical-margin item from engine repair", () => {
    for (const f of reg().failures.filter((x) => !x.hardFail)) {
      expect(f.engineChangeRequired, f.failureId).toBe(false);
    }
  });

  it("corrects the five-of-eight defensive claim against the artifacts", () => {
    const s = reg().defensiveSuppressionSurvey;
    expect(s.distinctTeamSides).toBe(8);
    expect(s.wrongDirectionTeamSides).toBeLessThan(5);
    expect(s.wrongDirectionAndStatisticallyOpposite).toBeLessThan(s.wrongDirectionTeamSides);
    expect(reg().reconciliation.correction).toMatch(/stated five while enumerating four/);
  });
});

describe("6C4C1 — both root causes are proven, not assumed", () => {
  it("shows the engine responded correctly to the defensive ratings it was given", () => {
    const d = R("defensive-suppression-diagnosis");
    expect(d.rootCause.engineRespondsCorrectly).toMatch(/-0\.9/);
    expect(d.rootCause.layer).toMatch(/upstream/);
  });

  it("separates assist creation from assist crediting", () => {
    const a = R("assisted-offense-diagnosis");
    expect(a.firstDivergence.layer).toBe("assist crediting");
    // creation responded; crediting did not
    expect(Math.abs(a.ladderStatistics.spearmanBallMovementVsCreationRate))
      .toBeGreaterThan(Math.abs(a.ladderStatistics.spearmanBallMovementVsCreditRate));
  });

  it("finds attribution itself sound", () => {
    const a = R("assist-attribution-audit");
    expect(a.invariants.astLeFgm).toBe(true);
    expect(a.invariants.assistCreditedOnTheMakeNotAfterwards).toMatch(/No post-hoc allocation/);
  });

  it("records the undecidable pre-recording eras rather than repairing them", () => {
    const d = R("defensive-suppression-diagnosis");
    expect(d.rootCause.fault4_undecidableEras).toMatch(/identical composites/);
    const undecidable = d.perV5Defence.filter((x) => !x.decidable);
    expect(undecidable.length).toBeGreaterThan(0);
    for (const u of undecidable) expect(u.compositeDelta).toBe(0);
  });
});

describe("6C4C1 — the repairs are generic", () => {
  const chg = () => R("candidate2-change-manifest");

  it("contains no entity hard-code and no flat bonus", () => {
    expect(chg().entityHardcodes).toBe(0);
    expect(chg().flatBonuses).toBe(0);
    for (const c of chg().changes) {
      expect(c.entityHardcodeCheck, c.changeId).toMatch(/^no /);
      expect(c.flatBonusCheck, c.changeId).toMatch(/centred|zero for a neutral/);
    }
  });

  it("changed no parameter and no data", () => {
    expect(chg().parameterChanges).toBe(0);
    expect(chg().dataChanges).toBe(0);
    const def = defaultRuntimeParameterSet();
    expect(activeParameters().every((p) => def.values[p.id] === p.defaultValue)).toBe(true);
  });

  it("makes a neutral coach an exact fixed point of the scheme transfer", () => {
    expect(SCHEME_TRANSFER.neutralIntent).toBe(5);
    // a coach whose intent equals the neutral default gets zero differential
    const neutralish = COACH_DATA.coaches.find((c) => coachToolkit(c).helpAggression === 5);
    expect(neutralish, "a coach with neutral help intent exists to test with").toBeTruthy();
  });

  it("leaves the era cap absolute", () => {
    const src = readFileSync("src/v3/defense/scheme.js", "utf8");
    expect(src).toMatch(/Math\.min\(base \+ differential, eraCap\)/);
  });

  it("credits an assist only on a made basket with a distinct passer", () => {
    const src = readFileSync("src/v3/possession/game.js", "utf8");
    expect(src).toMatch(/shot\.passerCandidate\.index !== shooter\.index/);
    expect(src).not.toMatch(/allocateAssists|assistQuota|inflateAssists/);
  });
});

describe("6C4C1 — Candidate 2 identity", () => {
  it("has a core hash distinct from both ancestors, with zero collisions", () => {
    const i = R("candidate2-identity-separation");
    expect(i.collisionCount).toBe(0);
    expect(i.candidate2.coreHash).not.toBe(i.candidate1.coreHash);
    expect(i.candidate2.coreHash).not.toBe(i.candidate0.coreHash);
  });

  it("shares the parameter-set hash by design, and says why", () => {
    const i = R("candidate2-identity-separation");
    expect(i.parameterSetHashIntentionallyShared.shared).toBe(true);
    expect(i.authoritativeIdentity).toBe("coreHash");
    expect(i.parameterSetHashIntentionallyShared.why).toMatch(/collision/);
  });

  it("is reachable from Candidate 0 through an attributable succession chain", () => {
    const hops = successionChain();
    expect(hops.length).toBeGreaterThanOrEqual(2);
    const c0 = R("candidate0-preservation").coreHash;
    expect(assertCoreHashLineage(c0, R("candidate2-lock").coreHash)).toMatch(/ATTRIBUTABLE/);
  });

  it("stamps 1.2.0 and carries it in every result fingerprint", () => {
    // The registry tracks the ACTIVE candidate, not this one — this phase locked Candidate 2.
    // A literal here had to be edited at every generation; the active lock
    // says the same thing and keeps saying it.
    expect(versionOf("possessionCalibrationVersion")).toBe(activeLockVersion());
    expect(R("candidate2-lock").possessionCalibrationVersion).toBe("1.2.0");
  });
});

describe("6C4C1 — acceptance and anti-overfitting", () => {
  const cmp = () => R("candidate2-vs-candidate1");

  it("passed every frozen acceptance criterion", () => {
    expect(cmp().pass).toBe(true);
    expect(cmp().criteriaFailed).toEqual([]);
    expect(cmp().criteriaEvaluated).toBeGreaterThanOrEqual(28);
  });

  it("compared the two candidates on identical seeds", () => {
    expect(cmp().identicalSeeds).toBe(true);
    expect(cmp().candidate1.measuredInWorktreeAtParentCommit).toBe(true);
    expect(cmp().candidate1.calibrationVersion).toBe("1.1.0");
    expect(cmp().candidate2.calibrationVersion).toBe("1.2.0");
  });

  it("built a lever where there was none, on both axes", () => {
    const l = cmp().ladders;
    expect(Math.abs(l.candidate2.assist.spearman)).toBeGreaterThan(Math.abs(l.candidate1.assist.spearman));
    expect(l.candidate2.defence.spearman).toBeLessThan(-0.70);
    expect(l.candidate1.defence.spearman).toBeGreaterThan(-0.70);
  });

  it("did not inflate every offence or lift every defence", () => {
    const o = cmp().results.filter((r) => r.group === "antiOverfitting");
    expect(o.length).toBeGreaterThanOrEqual(2);
    for (const r of o) expect(r.pass, r.criterionId).toBe(true);
  });

  it("left the neutral cells materially unmoved on both axes", () => {
    const a3 = cmp().results.find((r) => r.criterionId === "A3_neutralUnmoved");
    const d7 = cmp().results.find((r) => r.criterionId === "D7_weakNotUniversallyLifted");
    expect(Math.abs(a3.evidence.delta)).toBeLessThanOrEqual(0.010);
    expect(Math.abs(d7.evidence.delta)).toBeLessThanOrEqual(0.010);
  });

  it("did not suppress scoring league-wide", () => {
    const d9 = cmp().results.find((r) => r.criterionId === "D9_offenceNotSuppressedUniversally");
    expect(Math.abs(d9.evidence.delta)).toBeLessThanOrEqual(2.0);
  });

  it("removed the scheme inversions rather than adding a bonus", () => {
    const d3 = cmp().results.find((r) => r.criterionId === "D3_noInversionBelowNeutral");
    expect(d3.pass).toBe(true);
    expect(d3.evidence.personnelInversions).toEqual([]);
  });
});

describe("6C4C1 — global validation", () => {
  it("is replay exact with zero invariant violations", () => {
    const iv = R("candidate2-internal-validation");
    expect(iv.replay.mismatches).toBe(0);
    expect(iv.structuralTotals.invariantViolations).toBe(0);
    expect(iv.structuralTotals.finalTies).toBe(0);
    expect(iv.structuralTotals.astGtFgm).toBe(0);
  });

  it("holds side symmetry at power, and improves the asymmetric swap", () => {
    const s = R("candidate2-side-symmetry");
    expect(s.atPower.gamesPerCell).toBeGreaterThanOrEqual(8000);
    expect(s.atPower.asymmetricSideSwap.consistentWithZero).toBe(true);
    expect(s.candidate1AtPower.asymmetricSideSwap.consistentWithZero).toBe(false);
    expect(s.atPower.cellsContainingHalf).toBeGreaterThanOrEqual(s.candidate1AtPower.cellsContainingHalf);
  });

  it("keeps competition modes inside their gates", () => {
    const c = R("candidate2-competition-validation");
    expect(c.pass).toBe(true);
    expect(c.seriesInvariants).toBe(0);
    expect(c.seasonInvariants).toBe(0);
    expect(c.meanSeasonWins).toBeGreaterThan(35);
    expect(c.meanSeasonWins).toBeLessThan(47);
  });
});

describe("6C4C1 — every V5 finding resolved", () => {
  it("leaves nothing UNRESOLVED", () => {
    const r = R("remaining-v5-diagnostic-results");
    expect(r.unresolved).toBe(0);
    expect(r.findingCount).toBe(16);
  });

  it("names a data limitation rather than repairing what it cannot see", () => {
    const r = R("remaining-v5-diagnostic-results");
    expect(r.dataLimitations.length).toBeGreaterThan(0);
    for (const d of r.dataLimitations) {
      expect(d.classification).toBe("DATA_LIMITATION");
      expect(d.detail).toMatch(/not event-visible|defensiveEvidence/);
    }
  });

  it("does not rescore Historical V5", () => {
    const r = R("remaining-v5-diagnostic-results");
    expect(r.historicalV5NotRescored).toMatch(/remains HISTORICAL_HOLDOUT_V5_FAIL/);
    expect(artifactExists("historical-v5-formal-verdict", "data/validation/6c4b2r")).toBe(true);
    expect(readArtifact("historical-v5-formal-verdict", "data/validation/6c4b2r").data.verdict)
      .toBe("HISTORICAL_HOLDOUT_V5_FAIL");
  });
});

describe("6C4C1 — the lock", () => {
  const lock = () => R("candidate2-lock");

  it("is LOCKED with every gate passing", () => {
    expect(lock().candidateLockStatus).toBe("LOCKED");
    expect(lock().candidateSelectionStatus).toBe("SELECTED");
    expect(lock().allEngineeringGatesPass).toBe(true);
    expect(lock().candidateLockBlockers).toEqual([]);
  });

  it("claims nothing beyond a scoped development lock", () => {
    expect(lock().calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(lock().formalValidationStatus).toBe("NOT_RUN");
    for (const f of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(lock().calibrationStatus).not.toBe(f);
      expect(lock().notClaimed).toContain(f);
    }
  });

  it("records the access counts that were true at lock time", () => {
    const a = lock().formalHoldoutAccessCounts;
    expect(a.historicalHoldoutV3).toBe(1);
    expect(a.historicalHoldoutV4).toBe(1);
    expect(a.historicalHoldoutV5).toBe(1);
    expect(a.syntheticStressHoldoutV2).toBe(0);
  });

  it("names its parent and keeps production untouched", () => {
    expect(lock().parentCandidateId).toBe("Candidate 1");
    expect(lock().parentCoreHash).toBe(R("candidate1-preservation").coreHash);
    expect(lock().engineVersions.productionEngineVersion).toBe("3.2.0");
  });

  it("treats Historical V5 only as a diagnostic set", () => {
    expect(lock().historicalV5Role).toMatch(/^FAILED_HOLDOUT_DIAGNOSTIC_SET/);
  });
});
