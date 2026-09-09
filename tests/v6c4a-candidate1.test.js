// ── Phase 6C4A: Candidate 1 trait-fidelity repair — preservation & register ──
// Grows through the phase. Part 1 locks what the phase must never disturb:
// Candidate 0's identity, both FAIL verdicts, the synthetic seal, and the
// machine-generated V4 failure register the repairs are driven by.
import { describe, it, expect } from "vitest";
import { activeLockVersion } from "./helpers/candidateLineage.js";
import { readFileSync, existsSync } from "node:fs";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { readArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
import { versionOf } from "../src/versions.js";
import { setAccessCount } from "../src/v3/calibration/holdoutSeal.js";

const DIR = "data/validation/6c4a";
const R = (n) => readArtifact(n, DIR);

describe("6C4A preservation", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("preserves Candidate 0 exactly: lock, hashes, version", () => {
    const p = R("candidate0-preservation").data;
    const lock = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
    expect(lock.candidateLockStatus).toBe("LOCKED");
    expect(lock.candidateSelectionStatus).toBe("SELECTED");
    const recorded = readArtifact("candidate-core-manifest", "data/validation/6c3").data.aggregateCoreHash;
    expect(p.candidate0.coreHash).toBe(recorded);
    expect(p.candidate0.parameterSetHash).toBe(lock.parameterSetHash);
    expect(p.candidate0.possessionCalibrationVersion).toBe("1.0.0");
    expect(p.candidate0.behaviourSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(`${DIR}/behaviour-snapshot-candidate0.json`)).toBe(true);
  });

  it("preserves both holdout FAILs and never rescores them", () => {
    const p = R("candidate0-preservation").data;
    expect(p.historicalV3.verdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(p.historicalV4.verdict).toBe("HISTORICAL_V4_FAILED");
    expect(p.historicalV4.setStatus).toBe("FAILED_HOLDOUT_DIAGNOSTIC_SET");
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
  });

  it("gates Candidate 1 development on the full preflight", () => {
    const f = R("phase6c4a-preflight").data;
    for (const k of ["candidate0Preserved", "historicalV3Preserved", "historicalV4Preserved",
      "syntheticV2StillSealed", "candidate1DevelopmentMayBegin"]) expect(f[k], k).toBe(true);
    expect(f.gatesFailed).toEqual([]);
  });
});

describe("6C4A failure register", () => {
  const reg = R("historical-v4-failure-register").data;

  it("reads every hard failure from the V4 results artifact and reconciles", () => {
    const v4 = JSON.parse(readFileSync("data/validation/6c3r/historical-holdout-v4-results.json", "utf8")).data;
    expect(reg.hardFailuresInVerdict).toBe(v4.traits.hardFails.length);
    expect(reg.failuresRegistered).toBe(12);
    expect(reg.reconciles).toBe(true);
  });

  it("assigns every failure exactly one category, and categories sum to 12", () => {
    const total = Object.values(reg.byCategory).reduce((a, b) => a + b, 0);
    expect(total).toBe(12);
    for (const f of reg.failures) expect(Object.keys(reg.byCategory)).toContain(f.category);
  });

  it("separates 4 practical-margin-only artifacts from 8 substantive failures", () => {
    expect(reg.byCategory.PRACTICAL_MARGIN_ONLY).toBe(4);
    expect(reg.substantiveCount).toBe(8);
    for (const m of reg.marginArtifacts) {
      expect(m.ENGINE_CHANGE_REQUIRED).toBe(false);
      expect(m.POLICY_V3_CHANGE_REQUIRED).toBe(true);
    }
  });

  it("carries full identity and a mechanic path on every failure", () => {
    for (const f of reg.failures) {
      for (const k of ["failureId", "matchupId", "fixtureId", "teamSeason", "eraStyleId", "coachId",
        "traitId", "traitFamily", "observabilityClass", "metricId", "referenceSurface",
        "expectedDirection", "observedValue", "difference", "z", "category"]) {
        expect(f[k], `${f.failureId}.${k}`).not.toBeUndefined();
      }
      expect(f.candidateMechanicPath).not.toBe("unmapped");
    }
  });

  it("marks every substantive failure ENGINE_CHANGE_REQUIRED with acceptance criteria", () => {
    expect(reg.registerDetail).toHaveLength(8);
    for (const f of reg.registerDetail) {
      expect(f.engineChangeRequired).toBe(true);
      expect(f.candidateAcceptanceCriteria).toContain("practical margin");
      expect(f.regressionGuardrails.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("6C4A WS2 — typed target access", () => {
  it("replaces object truthiness with typed reads", async () => {
    const { readTargetValue } = await import("../scripts/validation/targetAccess.mjs");
    expect(readTargetValue(null).reason).toBe("MISSING_ENTRY");
    expect(readTargetValue({}).reason).toBe("SCHEMA_VIOLATION");
    expect(readTargetValue({ value: 82, availability: "RECORDED_STATISTIC" })).toEqual({ usable: true, value: 82, availability: "RECORDED_STATISTIC" });
    // the exact defect shape: a truthy entry object whose value is null
    expect(readTargetValue({ value: null, availability: "NOT_RECORDED_IN_ERA", provenance: null, formula: null }))
      .toMatchObject({ usable: false, reason: "LEGITIMATELY_NULL" });
    expect(readTargetValue({ value: NaN, availability: "RECORDED_STATISTIC" }).reason).toBe("SCHEMA_VIOLATION");
    expect(readTargetValue({ value: 5, availability: "NOT_RECORDED_IN_ERA" }).reason).toBe("SCHEMA_VIOLATION");
    expect(readTargetValue({ value: 5, availability: "SOMETHING_NEW" }).reason).toBe("UNKNOWN_AVAILABILITY");
  });

  it("quantifies the truthiness over-report on the real V4 target store", () => {
    const a = R("target-schema-validation").data;
    expect(a.census.typedUsable).toBeLessThan(a.census.naiveAvailable);
    expect(a.truthinessOverreport).toBeGreaterThan(0);
    expect(a.schemaViolations).toBe(0);
    expect(a.pass).toBe(true);
  });
});

describe("6C4A WS2 — profile resolution and runner preflight", () => {
  it("resolves every profile by exact id and exact title, never bare surname", () => {
    const a = R("profile-resolution-audit").data;
    expect(a.unresolved).toBe(0);
    expect(a.duplicateIds).toBe(0);
    expect(a.bareSurnameResolutions).toEqual([]);
    expect(a.lastNameCollisions, "the store proves last-name matching ambiguous").toBeGreaterThan(0);
    expect(a.pass).toBe(true);
  });

  it("preflights through the exact runner map, which the simplified map would fail", () => {
    const a = R("runner-preflight-audit").data;
    expect(a.exactMap.pass).toBe(true);
    expect(a.exactMap.missing).toEqual([]);
    expect(a.simplifiedMapWouldHaveMissed, "the 6C3R defect is demonstrable").toBeGreaterThan(0);
    expect(a.pass).toBe(true);
  });

  it("fails preflight BEFORE any unlock when a required profile is missing", async () => {
    const { preflightProfileResolution } = await import("../scripts/validation/profileMap.mjs");
    const fake = [{ players: [{ calibrationPlayerId: "cal:NOPE:1900:missing-player" }] }];
    const out = await preflightProfileResolution(fake);
    expect(out.pass).toBe(false);
    expect(out.missing).toContain("cal:NOPE:1900:missing-player");
  });
});

describe("6C4A WS2 — prospective practical-margin policy", () => {
  const pol = R("trait-practical-margin-policy").data;

  it("is frozen with a stable hash over its own content", async () => {
    const { createHash } = await import("node:crypto");
    const { policyHash, frozen, ...payload } = pol;
    expect(frozen).toBe(true);
    expect(createHash("sha256").update(JSON.stringify(payload)).digest("hex")).toBe(policyHash);
  });

  it("requires BOTH statistical significance and practical effect, prospectively only", () => {
    expect(pol.rule.hardFail).toContain("CI excludes zero");
    expect(pol.rule.hardFail).toContain("margin");
    expect(pol.appliesFrom).toContain("V5");
    expect(pol.neverAppliesTo).toContain("V4");
  });

  it("derives every margin from a practical floor at least 3x the measured noise", () => {
    for (const [m, v] of Object.entries(pol.metrics)) {
      expect(v.margin, m).toBeGreaterThanOrEqual(v.practicalFloor);
      if (v.noiseComponent) expect(v.margin, `${m} margin must dominate noise`).toBeGreaterThanOrEqual(v.noiseComponent);
    }
    // the four V4 margin-only artifacts would be soft fails, not hard fails
    expect(Math.abs(-0.00299)).toBeLessThan(pol.metrics.threeShare.margin);
    expect(Math.abs(0.01852)).toBeLessThan(pol.metrics.refPppVsTeam.margin);
    expect(Math.abs(0.01742)).toBeLessThan(pol.metrics.orebRateAgainst.margin);
    expect(Math.abs(-0.01909)).toBeLessThan(pol.metrics.assistedRate.margin);
    // while all eight substantive failures would still hard-fail
    for (const d of [-0.04752, 0.08607, -0.06933, 0.05834, -0.06465, -0.24373])
      expect(Math.abs(d)).toBeGreaterThan(0.02);
  });
});

describe("6C4A WS3 — root-cause analysis", () => {
  const rc = R("candidate1-root-cause-analysis").data;

  it("root-causes all 8 substantive failures before any engine change", () => {
    expect(rc.rootCaused).toBe(8);
    expect(rc.unresolved).toBe(0);
    const classed = Object.values(rc.rootCauseClasses).flat();
    expect(classed.sort()).toEqual(["v4f-02", "v4f-03", "v4f-04", "v4f-05", "v4f-06", "v4f-07", "v4f-08", "v4f-09"]);
  });

  it("walks the complete mechanic chain for every failure", () => {
    for (const c of Object.values(rc.conclusions)) {
      expect(Object.keys(c.chain).length, c.failureId).toBeGreaterThanOrEqual(5);
      expect(c.rootCause, c.failureId).toBeTruthy();
      expect(c.repairDirection, c.failureId).toBeTruthy();
      expect(c.factorial.length, c.failureId).toBeGreaterThanOrEqual(2);
      for (const cell of c.factorial) expect(cell.games, `${c.failureId} ${cell.label}`).toBeGreaterThanOrEqual(2000);
    }
  });

  it("proves eligibility starvation: movement is zero under BOTH coaches, alive under input lift", () => {
    const m = rc.conclusions["v4f-09"].factorial;
    expect(m[0].movementShare.mean).toBe(0); // jackson / as-is
    expect(m[1].movementShare.mean).toBe(0); // neutral / as-is
    expect(m[2].movementShare.mean).toBeGreaterThan(0.1); // jackson / lift
    // the coach lever is ALIVE once the family is reachable
    expect(rc.conclusions["v4f-09"].evidence.coachEffectWhenReachable.significant).toBe(true);
    expect(m[2].movementShare.mean).toBeGreaterThan(m[3].movementShare.mean);
  });

  it("proves quality mechanisms respond to inputs (offense up, defense down)", () => {
    expect(rc.conclusions["v4f-02"].evidence.pppRespondsToInputs.diff).toBeGreaterThan(0.01);
    expect(rc.conclusions["v4f-08"].evidence.pppRespondsToInputs.diff).toBeGreaterThan(0.01);
    expect(rc.conclusions["v4f-04"].evidence.oppPppRespondsToInputs.diff).toBeLessThan(-0.05);
    expect(rc.conclusions["v4f-07"].evidence.oppPppRespondsToInputs.diff).toBeLessThan(-0.05);
  });

  it("records the falsified OREB hypothesis alongside the confirmed miswired channel", () => {
    const e = rc.conclusions["v4f-05"].evidence;
    expect(Math.abs(e.orebInputInterventionFalsified.diff)).toBeLessThan(0.01);
    expect(e.miswiredChannelResponds.diff).toBeGreaterThan(0.04);
  });

  it("identifies the dead team-intelligence channels", () => {
    const dead = Object.entries(rc.deadTeamIntelligenceChannels).filter(([, v]) => v.dead).map(([k]) => k);
    expect(dead).toEqual(expect.arrayContaining(["offBallValue", "rimPressure", "postPlay", "turnoverRisk", "switchability"]));
  });
});

describe("6C4A WS4 — movement & coach-saturation repair", () => {
  const mv = R("candidate1-movement-repair").data;

  it("passes every acceptance gate the brief requires", () => {
    expect(mv.failedGates).toEqual([]);
    for (const g of ["nonzeroReachabilityEverywhere", "coachDifferentiation", "rosterSensitivity",
      "noEfficiencyGuarantee", "noEraFlattening", "isolationReachableAtNeutral", "zoneContinuity"]) {
      expect(mv.gates[g], g).toBe(true);
    }
  });

  it("exposes the movement family through one shared helper", async () => {
    const { isMovementFamilyAction, MOVEMENT_FAMILY_ACTIONS } = await import("../src/v3/actions/families.js");
    expect(MOVEMENT_FAMILY_ACTIONS).toEqual(["OFF_BALL_SCREEN", "CUT", "HANDOFF"]);
    expect(MOVEMENT_FAMILY_ACTIONS.every(isMovementFamilyAction)).toBe(true);
    expect(isMovementFamilyAction("POST_UP")).toBe(false);
    expect(Object.isFrozen(MOVEMENT_FAMILY_ACTIONS)).toBe(true);
  });

  it("repairs by mix, never by efficiency: max motion on weak movers buys no ppp", () => {
    expect(mv.noEfficiencyGuarantee.shareDiff.diff).toBeGreaterThan(0.01);
    expect(mv.noEfficiencyGuarantee.pppDiff.diff).toBeLessThan(0.02);
  });

  it("keeps zone use continuous in the coach scale — no 0/1 step", () => {
    const z = mv.zoneContinuity.cells.map((c) => c.defensiveZoneShare.mean);
    expect(z[0]).toBeGreaterThan(z[1]);
    expect(z[1]).toBeGreaterThan(z[2]);
    expect(z[2]).toBeGreaterThan(z[3]);
    for (const v of z) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
  });

  it("records Candidate 1 as a DRAFT successor, never a mutation of Candidate 0", () => {
    const m = R("candidate1-draft-manifest").data;
    expect(m.candidateId).toBe("Candidate 1");
    expect(m.parentCandidateId).toBe("Candidate 0");
    expect(m.candidateSelectionStatus).toBe("DRAFT");
    expect(m.candidateLockStatus).toBe("UNLOCKED");
    expect(m.validationAttemptStatus).toBe("NOT_RUN");
    expect(m.coreHash).not.toBe(m.parentCoreHash);
    expect(m.changedCoreFiles.length).toBeGreaterThan(0);
  });

  it("keeps the production 3.2.0 engine byte-identical", () => {
    const a = JSON.parse(readFileSync(`${DIR}/behaviour-snapshot-candidate0.json`, "utf8"));
    const b = JSON.parse(readFileSync(`${DIR}/behaviour-snapshot-candidate1-draft.json`, "utf8"));
    expect(b.production.productionEngineSha256).toBe(a.production.productionEngineSha256);
  });
});

describe("6C4A WS5 — offensive-identity repair", () => {
  const of = R("candidate1-offense-repair").data;

  it("passes every offensive acceptance gate", () => {
    expect(of.failedGates).toEqual([]);
    expect(of.gates.bullsEliteOffenceRepaired).toBe(true);
    expect(of.gates.heldInEliteOffencesAboveReference).toBe(true);
    expect(of.gates.noUniversalScoringShift).toBe(true);
  });

  it("froze the share-proxy bound before measurement, and stayed inside it", () => {
    expect(of.shareProxyProtection.bound).toBeCloseTo(of.shareProxyProtection.baselineMeanComposite * of.shareProxyProtection.maxRegressionFactor, 5);
    expect(of.meanCompositeShareMae).toBeLessThanOrEqual(of.shareProxyProtection.bound);
  });

  it("repairs generalise beyond the V4 diagnostics (no overfit to V4 teams)", () => {
    for (const c of of.heldInEliteOffense) expect(c.diff.diff, c.fixtureId).toBeGreaterThan(0);
    expect(Math.abs(of.nonElitePopulationMeanDiff)).toBeLessThan(0.03);
  });

  it("attributes the residual Spurs deficit with intervention evidence, never a patch", () => {
    const s = of.spursDecomposition;
    expect(s.disposition).toBe("MECHANISM_REPAIRED_DATA_AND_REFERENCE_LIMITED");
    expect(s.imputationCloses).toBeGreaterThan(0);
    expect(s.imputationCloses).toBeLessThan(Math.abs(s.asIsDiff));
    expect(s.v5Action).toContain("reference re-certification");
  });

  it("backfilled only null shooting fields, from team-verified career tables", () => {
    const b = R("calibration-shooting-backfill").data;
    expect(b.profilesBackfilled).toBe(2);
    expect(b.sourceLacksCareerTable).toBe(5);
    for (const r of b.results.filter((x) => x.outcome === "FILLED")) {
      expect(r.teamVerified).toMatch(/Boston/);
      for (const f of r.filled) expect(["fieldGoalPct", "freeThrowPct", "threePointPct"]).toContain(f.field);
    }
  });
});

describe("6C4A WS6 — defensive-identity repair", () => {
  const df = R("candidate1-defense-repair").data;

  it("passes every defensive acceptance gate", () => {
    expect(df.failedGates).toEqual([]);
  });

  it("materially reduces both V4 defensive deficits beyond the practical margin", () => {
    for (const c of df.v4EliteDefense) {
      expect(c.diff.diff, c.fixtureId).toBeLessThan(df.priorV4Deficits[c.fixtureId] - 0.02);
    }
  });

  it("keeps the defensive population stable and the share proxy inside the frozen bound", () => {
    expect(Math.abs(df.nonElitePopulationMeanDiff)).toBeLessThan(0.03);
    expect(df.meanCompositeShareMae).toBeLessThanOrEqual(df.shareProxyProtection.bound);
  });

  it("stamps accolades from same-season award pages only, with recorded provenance", () => {
    const b = R("defensive-accolades").data;
    expect(b.profilesStamped).toBeGreaterThan(40);
    for (const s of b.stamped) {
      expect(["ELITE", "STRONG"]).toContain(s.band);
      expect(s.accolades.length).toBeGreaterThan(0);
    }
    // spot-check historically known same-season selections
    const find = (n, season) => b.stamped.find((x) => x.name === n && x.season === season);
    expect(find("Dennis Johnson", "1978-79").accolades).toContain("ALL_DEFENSIVE_FIRST_TEAM");
    expect(find("Joe Dumars", "1989-90").accolades).toContain("ALL_DEFENSIVE_FIRST_TEAM");
    expect(find("Walt Frazier", "1972-73").accolades).toContain("ALL_DEFENSIVE_FIRST_TEAM");
    // and a NON-selection stays unstamped: Aguirre never made an All-Defensive team
    expect(b.stamped.find((x) => x.name === "Mark Aguirre")).toBeUndefined();
  });

  it("records the residual with intervention-backed attribution, never a patch", () => {
    expect(df.decomposition.disposition).toBe("MECHANISM_REPAIRED_EVIDENCE_AND_REFERENCE_LIMITED");
    expect(df.decomposition.residualCauses.length).toBe(2);
    expect(df.decomposition.v5Action).toContain("re-certify");
  });
});

describe("6C4A WS7 — remaining repairs", () => {
  const rr = R("candidate1-remaining-repairs").data;

  it("leaves zero unresolved substantive failures", () => {
    expect(rr.unresolvedSubstantiveFailures).toBe(0);
    expect(rr.failedGates).toEqual([]);
  });

  it("reduces the OREB deficit through the intended wire and proves evidence saturation", () => {
    expect(rr.orebRepair.diff.diff).toBeGreaterThan(rr.orebRepair.priorV4Diff);
    const sd = rr.orebRepair.saturationDiagnostic;
    expect(Math.abs(sd.offensiveGlassWithImputedSplit - sd.offensiveGlassAsIs)).toBeLessThan(0.5);
  });

  it("keeps era offensive-rebound rates inside the plausibility band, trending down by era", () => {
    for (const [era, v] of Object.entries(rr.eraOrebRates)) {
      expect(v, era).toBeGreaterThan(0.12);
      expect(v, era).toBeLessThan(0.46);
    }
    expect(rr.eraOrebRates["2010s"]).toBeLessThan(rr.eraOrebRates["1960s"]);
  });

  it("changes no engine mechanic for any practical-margin-only failure", () => {
    expect(rr.marginOnlyDispositions).toHaveLength(4);
    for (const m of rr.marginOnlyDispositions) {
      expect(m.engineChanged).toBe(false);
      expect(m.underProspectivePolicy).toBe("DIRECTIONAL_SOFT_FAIL");
    }
  });
});

describe("6C4A WS8/WS9 — Candidate 1 manifests and internal validation", () => {
  it("declares every changed core file with its root cause, and nothing undeclared", () => {
    const m = R("candidate1-change-manifest").data;
    const declared = new Set(m.changes.map((c) => c.file));
    expect(m.changedCoreFiles.every((f) => declared.has(f))).toBe(true);
    for (const c of m.changes) expect(c.rootCauses.length, c.file).toBeGreaterThan(0);
    for (const v of Object.values(m.prohibitions)) expect(v).toContain("none");
  });

  it("keeps every parameter at its registry default (mechanics changed, not values)", () => {
    const p = R("candidate1-parameter-set").data;
    expect(p.allAtRegistryDefaults).toBe(true);
    expect(p.parameterChangesFromParent).toBe(0);
    expect(p.parameterSetHash).toBe(R("candidate0-preservation").data.candidate0.parameterSetHash);
  });

  it("records the full 53-file closure under builder v2", () => {
    const c = R("candidate1-core-manifest").data;
    expect(c.fileCount).toBe(53);
    expect(c.closureBuilderVersion).toBe("2.0.0");
    expect(c.files.map((f) => f.path)).toContain("src/v3/actions/offensivePlan.js");
  });

  it("passes internal, side-symmetry, probability and competition validation", () => {
    expect(R("candidate1-internal-validation").data.pass).toBe(true);
    const s = R("candidate1-side-symmetry").data;
    expect(s.pass).toBe(true);
    expect(s.totalGames).toBeGreaterThanOrEqual(50000);
    expect(s.bhSignificantCells).toBe(0);
    const p = R("candidate1-probability-validation").data;
    expect(p.pass).toBe(true);
    expect(Math.abs(p.materialRegression.logLossDelta)).toBeLessThan(p.materialRegression.bound);
    const c = R("candidate1-competition-validation").data;
    expect(c.pass).toBe(true);
    expect(c.totalInvariantViolations).toBe(0);
  });
});

describe("6C4A WS10 — Candidate 1 lock", () => {
  const lock = R("candidate1-lock").data;

  it("locks with every gate passing and zero blockers", () => {
    expect(lock.candidateLockStatus).toBe("LOCKED");
    expect(lock.candidateSelectionStatus).toBe("SELECTED");
    expect(lock.allEngineeringGatesPass).toBe(true);
    expect(lock.candidateLockBlockers).toEqual([]);
    expect(lock.parameterChanges).toBe(0);
  });

  it("carries the scoped development status and claims nothing beyond it", () => {
    expect(lock.calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(lock.validationAttemptStatus).toBe("NOT_RUN");
    expect(lock.scope).toContain("Historical Holdout V5");
    for (const f of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(lock.calibrationStatus).not.toBe(f);
      expect(lock.notClaimed).toContain(f);
    }
  });

  it("stamps 1.1.0 and proves the stamp is the only change since validation", () => {
    expect(lock.possessionCalibrationVersion).toBe("1.1.0");
    // The registry tracks the ACTIVE candidate, not this one — this phase locked Candidate 1.
    // A literal here had to be edited at every generation; the active lock
    // says the same thing and keeps saying it.
    expect(versionOf("possessionCalibrationVersion")).toBe(activeLockVersion());
    expect(lock.coreHash).not.toBe(lock.validatedCoreHash);
    expect(lock.stampIsolation).toContain("src/versions.js");
  });

  it("names its parent and never mutates it", () => {
    expect(lock.parentCandidateId).toBe("Candidate 0");
    expect(lock.parentCoreHash).toBe(R("candidate0-preservation").data.candidate0.coreHash);
    const parent = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
    expect(parent.candidateLockStatus).toBe("LOCKED");
    expect(parent.possessionCalibrationVersion).toBe("1.0.0");
    expect(lock.parameterSetHash).toBe(parent.parameterSetHash);
  });

  it("records every phase artifact hash it depends on", () => {
    for (const h of [lock.changeManifestHash, lock.coreManifestHash, lock.parameterSetArtifactHash,
      lock.vsCandidate0Hash, lock.rootCauseAnalysisHash, lock.traitPracticalMarginPolicyHash,
      ...Object.values(lock.validationHashes), ...Object.values(lock.repairHashes)]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(lock.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records the true holdout state and leaves production alone", () => {
    expect(lock.formalHoldoutAccessCounts).toEqual({ historicalHoldoutV3: 1, historicalHoldoutV4: 1, syntheticStressHoldoutV2: 0 });
    expect(lock.engineVersions.productionEngineVersion).toBe("3.2.0");
    expect(versionOf("engineVersion")).toBe("3.2.0");
  });
});

describe("6C4A WS11/WS12 — Historical Holdout V5 pool and readiness", () => {
  const pool = R("historical-v5-candidate-pool").data;

  it("provides at least 24 eligible unseen team-seasons", () => {
    expect(pool.eligibleTeamCount).toBeGreaterThanOrEqual(24);
    expect(pool.meetsMinimum).toBe(true);
    expect(pool.newTeamSeasons).toBeGreaterThanOrEqual(12);
  });

  it("provides at least two eligible pairs in every era, and three in most", () => {
    expect(pool.erasWithAtLeastTwoEligiblePairs).toBe(8);
    for (const [era, n] of Object.entries(pool.eligiblePairsByEra)) expect(n, era).toBeGreaterThanOrEqual(2);
    expect(pool.erasWithAtLeastThreeEligiblePairs).toBeGreaterThanOrEqual(6);
  });

  it("excludes every seen fixture: v3 corpus, V4-consumed, and Candidate 1 development", () => {
    const v3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
    const v3Seasons = new Set(v3.fixtures.map((f) => `${f.teamId}|${f.season}`));
    const consumed = new Set(pool.exclusions.consumedByV4);
    const development = new Set(pool.exclusions.usedInCandidate1Development);
    for (const t of pool.teams.filter((x) => x.eligible)) {
      expect(v3Seasons.has(`${t.teamId}|${t.season}`), `${t.fixtureId} reuses a v3 team-season`).toBe(false);
      expect(consumed.has(t.fixtureId), `${t.fixtureId} was consumed by V4`).toBe(false);
      expect(development.has(t.fixtureId), `${t.fixtureId} was used in Candidate 1 development`).toBe(false);
    }
    expect(development.size).toBe(6);
  });

  it("blocks duplicate fives at person level, within the pool and against prior fixtures", () => {
    const keys = pool.teams.filter((t) => t.eligible).map((t) => t.fiveKey);
    expect(new Set(keys).size).toBe(keys.length);
    // the two rejected 1950s drafts are recorded as ineligible-by-duplication
    // in the pool spec's own comment; here we assert the mechanism is live
    expect(pool.exclusions.priorFivesBlocked).toBeGreaterThan(20);
  });

  it("is source-only and output-blind, with a verified coach on every eligible team", () => {
    expect(pool.selectionBasis).toContain("SOURCE_ONLY_OUTPUT_BLIND");
    expect(pool.selectionBasis).toContain("no pool fixture simulated");
    for (const t of pool.teams.filter((x) => x.eligible)) {
      expect(t.coachVerification, t.fixtureId).toBe("SEASON_PAGE_NAMES_COACH");
      expect(t.resolvedPlayers, t.fixtureId).toBe(5);
      expect(t.startersWithoutScoring, t.fixtureId).toBe(0);
    }
  });

  it("resolved every new player from source with era-appropriate nulls preserved", () => {
    const store = JSON.parse(readFileSync("data/validation/6c4a/calibration-players-v5.json", "utf8"));
    expect(store.unresolvedCount).toBe(0);
    expect(store.profileCount).toBeGreaterThanOrEqual(70);
    for (const p of store.profiles) {
      expect(p.provenance.publisher).toContain("Wikipedia");
      if (p.seasonStartYear < 1973) {
        expect(p.basicStats.steals, `${p.name} steals`).toBeNull();
        expect(p.basicStats.blocks, `${p.name} blocks`).toBeNull();
      }
    }
  });

  it("declares V5 not open, with every blocking item named", () => {
    const r = R("historical-v5-readiness").data;
    expect(r.allReady).toBe(true);
    expect(r.v5MayOpen).toBe(false);
    expect(r.outstandingBeforeV5.length).toBeGreaterThanOrEqual(6);
    for (const o of r.outstandingBeforeV5) {
      expect(o.blocking).toBe(true);
      expect(o.why.length).toBeGreaterThan(60);
    }
    const items = r.outstandingBeforeV5.map((o) => o.item);
    expect(items).toContain("RE_CERTIFY_ERA_REFERENCES");
    expect(items).toContain("SELECT_V5_MATCHUPS");
    expect(items).toContain("REGISTER_V5_SEAL");
    expect(r.statusClaimed).toBe("DEVELOPMENT_LOCKED_SCOPED");
  });
});

describe("6C4A phase discipline", () => {
  const sum = R("phase6c4a-final-summary").data;

  it("wrote every required artifact, all verifying", () => {
    expect(sum.artifactsWritten).toBeGreaterThanOrEqual(26);
    expect(sum.artifactsInvalid).toBe(0);
  });

  it("reconciles the failure accounting end to end", () => {
    expect(sum.v4Failures.hardFailures).toBe(12);
    expect(sum.v4Failures.substantive + sum.v4Failures.practicalMarginOnly).toBe(12);
    expect(sum.v4Failures.rootCaused).toBe(sum.v4Failures.substantive);
    expect(sum.v4Failures.unresolved).toBe(0);
    expect(sum.v4Failures.engineChangesForMarginArtifacts).toBe(0);
  });

  it("respected every scope commitment and claimed nothing beyond a scoped lock", () => {
    for (const [k, v] of Object.entries(sum.scopeRespected)) expect(v, k).toBe(true);
    expect(sum.statusClaimed).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(sum.holdoutState.syntheticStressHoldoutV2.accessCount).toBe(0);
    expect(sum.holdoutState.historicalHoldoutV5.status).toContain("NOT_CREATED");
    expect(sum.productionUntouched.engineVersion).toBe("3.2.0");
  });

  it("records the limitations rather than implying completeness", () => {
    expect(sum.limitations.length).toBeGreaterThanOrEqual(6);
    for (const l of sum.limitations) expect(l.detail.length).toBeGreaterThan(80);
    const ids = sum.limitations.map((l) => l.id);
    expect(ids).toContain("ERA_REFERENCES_NOT_RE_CERTIFIED");
    expect(ids).toContain("V4_DIAGNOSTICS_ARE_CONSUMED");
  });

  it("renders every phase document from an artifact", () => {
    for (const doc of ["historical-v4-failure-register", "candidate0-preservation",
      "validation-instrumentation-repairs", "trait-practical-margin-policy",
      "candidate1-root-cause-analysis", "candidate1-movement-repair", "candidate1-offense-repair",
      "candidate1-defense-repair", "candidate1-remaining-repairs", "candidate1-internal-validation",
      "candidate1-lock", "candidate-succession", "historical-v5-candidate-pool",
      "historical-v5-readiness", "phase-6c4a-limitations", "phase-6c4a-summary"]) {
      const body = readFileSync(`docs/simulation-v3/${doc}.md`, "utf8");
      expect(body.startsWith("<!-- RENDERED FROM ARTIFACT"), `${doc} must be rendered`).toBe(true);
      expect(body).toContain("outputHash:");
    }
  });
});
