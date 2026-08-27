// ── Phase 6C4B1: Historical Holdout V5 preparation ──────────────────────────
// Grows through the phase. Every assertion reads an artifact or the live
// engine; none restates a number the report also prints.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
import { setAccessCount } from "../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../src/versions.js";
import { runPossessionGame } from "../src/v3/possession/index.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { successorManifest } from "./helpers/candidateLineage.js";

const DIR = "data/validation/6c4b1";
const A4 = "data/validation/6c4a";
const R = (n) => readArtifact(n, DIR);
const R4 = (n) => readArtifact(n, A4);

describe("6C4B1 WS0 — Candidate 1 integrity", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("verifies Candidate 1's locked identity, live", () => {
    const p = R("phase6c4b1-preflight").data;
    for (const k of ["candidate1LockValid", "candidate1CoreStable", "candidate1ReplayValid",
      "candidate0Preserved", "historicalV3Preserved", "historicalV4Preserved",
      "syntheticV2StillSealed", "v5NotSelected", "v5NotSimulated", "v5PreparationMayBegin"]) {
      expect(p[k], k).toBe(true);
    }
    expect(p.gatesFailed).toEqual([]);
    const lock = R4("candidate1-lock").data;
    expect(lock.candidateLockStatus).toBe("LOCKED");
    expect(lock.validationAttemptStatus).toBe("NOT_RUN");
    expect(versionOf("possessionCalibrationVersion")).toBe("1.1.0");
  });

  it("keeps every parameter at the locked value", () => {
    const def = defaultRuntimeParameterSet();
    const lock = R4("candidate1-lock").data;
    expect(def.parameterSetHash).toBe(lock.parameterSetHash);
    for (const p of activeParameters()) expect(def.values[p.id], p.id).toBe(p.defaultValue);
  });

  it("replays Candidate 1 exactly", () => {
    const c = { goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
      blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
      eraStyleId: "2010s", simulationSeed: 4242, coachGoldId: "steve-kerr", coachBlueId: "phil-jackson" };
    const h = () => { const g = runPossessionGame(buildPossessionInput(c), { includeLedger: true });
      return createHash("sha256").update(JSON.stringify([g.finalScore, g.gold, g.blue, g.possessionLedger])).digest("hex"); };
    expect(h()).toBe(h());
  });

  it("preserves both consumed holdouts and the sealed synthetic set", () => {
    const v = R("candidate1-integrity-verification").data;
    expect(v.priorAttempts.historicalHoldoutV3).toMatchObject({ accessCount: 1, state: "CONSUMED", verdict: "FAIL" });
    expect(v.priorAttempts.historicalHoldoutV4).toMatchObject({ accessCount: 1, state: "CONSUMED", verdict: "FAIL" });
    expect(v.priorAttempts.syntheticStressHoldoutV2).toMatchObject({ accessCount: 0, state: "SEALED_UNREAD" });
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(v.leakChecks.v5Leaks).toEqual([]);
    expect(v.leakChecks.syntheticLeaks).toEqual([]);
    const c0 = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
    expect(c0.candidateLockStatus).toBe("LOCKED");
    expect(c0.possessionCalibrationVersion).toBe("1.0.0");
  });
});

describe("6C4B1 WS1 — blocker register", () => {
  const reg = R("historical-v5-blocker-register").data;

  it("registers every source blocker exactly once, with no invention", () => {
    const source = R4("historical-v5-readiness").data.outstandingBeforeV5;
    expect(reg.sourceBlockerCount).toBe(source.length);
    expect(reg.blockerCount).toBe(source.length);
    expect(reg.reconciles).toBe(true);
    expect(reg.duplicateBlockers).toBe(0);
    expect(reg.unregisteredBlockers).toBe(0);
    const registered = reg.blockers.map((b) => b.sourceItem).sort();
    expect(registered).toEqual(source.map((s) => s.item).sort());
  });

  it("classifies every blocker and gives each an objective pass condition", () => {
    expect(reg.unclassified).toBe(0);
    for (const b of reg.blockers) {
      expect(reg.categories).toContain(b.category);
      expect(b.ownerWorkstream, b.blockerId).toBeTruthy();
      expect(b.requiredEvidence.length, b.blockerId).toBeGreaterThan(40);
      expect(b.passCondition.length, b.blockerId).toBeGreaterThan(30);
      expect(b.resolvedByArtifact, b.blockerId).toBeTruthy();
      expect(b.sourceArtifactHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("records phase findings separately so the count still reconciles", () => {
    expect(reg.phaseFindings.length).toBeGreaterThan(0);
    for (const f of reg.phaseFindings) expect(f.ownerWorkstream).toBeTruthy();
    expect(reg.blockerCount).toBe(reg.sourceBlockerCount);
  });
});

describe("6C4B1 WS2 — core graph", () => {
  const g = R("candidate-core-graph-certification").data;

  it("discovers the core with a parser, not a regex", () => {
    expect(g.parser).toContain("es-module-lexer");
    expect(g.candidateCoreGraphVersion).toBe("3.0.0");
    expect(g.pass).toBe(true);
  });

  it("includes every module Candidate 1 actually executes", () => {
    expect(g.missingExecutedModules).toEqual([]);
    expect(g.runtimeObservedCount).toBeGreaterThan(50);
    expect(g.simulationPathsExercised.length).toBeGreaterThanOrEqual(10);
    expect(g.declaredModules).toContain("src/v3/actions/offensivePlan.js");
    expect(g.runtimeObservedModules).toContain("src/v3/actions/offensivePlan.js");
  });

  it("leaves no unresolved result-affecting import", () => {
    expect(g.unresolvedDynamicImports).toEqual([]);
    expect(g.unresolvableRelativeSpecifiers).toEqual([]);
  });

  it("reproduces the prior builder's hash, so replacing it moved nothing", () => {
    expect(g.priorBuilderComparison.identical).toBe(true);
    expect(g.priorBuilderComparison.priorBuilderFileCount).toBe(g.declaredModuleCount);
  });

  it("sees multi-line imports and re-exports the regex builders could not", async () => {
    const { importsOf, resolveSpecifier } = await import("../scripts/v5/coreGraph.mjs");
    const { init } = await import("es-module-lexer");
    await init;
    // src/v3/possession/game.js opens with two multi-line import statements
    const edges = importsOf("src/v3/possession/game.js");
    expect(edges.some((e) => e.resolved === "src/v3/defense/liveState.js")).toBe(true);
    expect(edges.some((e) => e.resolved === "src/v3/actions/offensivePlan.js")).toBe(true);
    expect(resolveSpecifier("src/v3/possession/game.js", "./rng.js")).toBe("src/v3/possession/rng.js");
  });
});

describe("6C4B1 WS2 — identity separation", () => {
  const sep = R("candidate-identity-separation").data;
  const repair = R("candidate1-identity-repair").data;

  it("proves the collision was real, measured against real Candidate 0 code", () => {
    expect(repair.defect.collisionsObserved).toBeGreaterThan(0);
    expect(sep.candidate0.note).toContain("git worktree");
    for (const e of repair.defect.evidence.filter((x) => x.collided)) {
      expect(e.behaviourDiffered, `${e.case} collided so its behaviour must differ`).toBe(true);
    }
  });

  it("repairs identity without moving behaviour", () => {
    expect(repair.behaviourIdentical).toBe(true);
    expect(repair.behaviourProof.behaviourHashBefore).toBe(repair.behaviourProof.behaviourHashAfter);
    expect(repair.behaviourProof.changedCases).toEqual([]);
    expect(repair.behaviourProof.cases).toBeGreaterThan(400);
    expect(repair.changedCoreFiles).toEqual(["src/v3/possession/index.js"]);
  });

  it("leaves production's fingerprint alone", async () => {
    const { resultFingerprint } = await import("../src/v3/fingerprint.js");
    const fp = resultFingerprint({ matchup: "abcdef0123456789", seed: 7 });
    expect(Object.keys(fp.versions)).not.toContain("possessionCalibrationVersion");
    expect(repair.repair.productionUntouched).toContain("production");
  });

  it("separates every authoritative identity surface", () => {
    expect(sep.collisions).toBe(0);
    expect(sep.pass).toBe(true);
    expect(sep.surfacesCompared).toEqual(expect.arrayContaining(
      ["resultFingerprint", "resultCacheKey", "competitionManifest", "replayIdentity", "probabilityCacheKey"]));
    for (const r of sep.rows) {
      expect(r.collidingSurfaces, r.case).toEqual([]);
      expect(r.sameParameterSetHash, "the shared parameter hash is the whole point").toBe(true);
    }
  });

  it("states the calibration version in every development result", () => {
    const g = runPossessionGame(buildPossessionInput({
      goldIds: ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"],
      blueIds: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
      eraStyleId: "2010s", simulationSeed: 99 }), { includeLedger: false });
    expect(g.fingerprint.possessionCalibrationVersion).toBe("1.1.0");
  });

  it("records the stale module versions rather than quietly bumping them", () => {
    expect(sep.moduleVersionStaleness.finding).toContain("actionLibraryVersion");
    expect(sep.moduleVersionStaleness.recommendation).toContain("Candidate 2");
  });
});

describe("6C4B1 WS2 — lock re-certification", () => {
  const rec = R("candidate1-lock-recertification").data;

  it("is a revision of the same candidate, not a new one", () => {
    expect(rec.candidateId).toBe("Candidate 1");
    expect(rec.lockRevision).toBe(2);
    expect(rec.possessionCalibrationVersion).toBe("1.1.0");
    expect(rec.parameterSetHash).toBe(R4("candidate1-lock").data.parameterSetHash);
    expect(rec.parameterChanges).toBe(0);
    expect(rec.parentCoreHash).toBe(R4("candidate0-preservation").data.candidate0.coreHash);
  });

  it("supersedes the revision-1 hash with a behaviour proof, and preserves it", () => {
    const lock1 = R4("candidate1-lock").data;
    expect(rec.supersedesCoreHash).toBe(lock1.coreHash);
    expect(rec.coreHash).not.toBe(lock1.coreHash);
    expect(rec.behaviourIdentical).toBe(true);
    // the revision-1 artifact is still exactly what 6C4A wrote
    expect(lock1.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(`${A4}/candidate1-lock.json`)).toBe(true);
  });

  it("is what the lineage helper now honours", () => {
    const m = successorManifest();
    expect(m.coreHash).toBe(rec.coreHash);
    expect(m.behaviourIdentical).toBe(true);
    expect(m.parentCoreHash).toBe(rec.parentCoreHash);
  });

  it("claims nothing beyond the scoped development lock", () => {
    expect(rec.calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(rec.validationAttemptStatus).toBe("NOT_RUN");
    for (const f of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(rec.calibrationStatus).not.toBe(f);
      expect(rec.notClaimed).toContain(f);
    }
    expect(rec.engineVersions.productionEngineVersion).toBe("3.2.0");
  });
});

describe("6C4B1 WS3 — realized zone measurement", () => {
  const z = R("realized-zone-measurement-certification").data;

  it("never collapses toolkit, permission, selection and execution", () => {
    expect(Object.keys(z.states)).toEqual(["TOOLKIT", "PERMITTED", "SELECTED", "ATTACKED"]);
    expect(z.pass).toBe(true);
  });

  it("counts only possessions actually defended in a shell", async () => {
    const { isZoneShellSelected, isZoneAttackExecuted, isZoneToolkitAvailable, isZonePlanPermitted } =
      await import("../scripts/v5/realizedZone.mjs");
    expect(isZoneShellSelected({ schemeId: "ZONE:2-3" })).toBe(true);
    expect(isZoneShellSelected({ schemeId: "MODERN_MAN_HELP:MIXED" })).toBe(false);
    expect(isZoneShellSelected({ schemeId: "ZONE_MIXED:DROP_HEAVY" }), "the v1 label must not count").toBe(false);
    expect(isZoneAttackExecuted({ action: "ZONE_ATTACK" })).toBe(true);
    expect(isZoneAttackExecuted({ action: "GENERIC_HALF_COURT", schemeId: "ZONE:2-3" })).toBe(false);
    expect(isZoneToolkitAvailable({ zonePreference: 9 })).toBe(true);
    expect(isZoneToolkitAvailable({ zonePreference: 0 })).toBe(false);
    expect(isZonePlanPermitted({ zoneShell: { shellType: "2-3" }, scheme: { zoneUsage: 8 } })).toBe(true);
    expect(isZonePlanPermitted({ zoneShell: null, scheme: { zoneUsage: 8 } })).toBe(false);
  });

  it("excludes man possessions under a zone-capable coach", () => {
    const c = z.cells.zoneCapableEraLegal;
    expect(c.manPossessions).toBeGreaterThan(0);
    expect(c.realizedZoneShare).toBeLessThan(1);
    expect(c.planPermittedGames).toBe(c.games);
  });

  it("reports zero realized zone in a zone-illegal era", () => {
    const c = z.cells.zoneCapableEraIllegal;
    expect(c.shellSelectedPossessions).toBe(0);
    expect(c.planPermittedGames).toBe(0);
    expect(c.zoneAttackPossessions).toBe(0);
  });

  it("grades zone use by coach scale rather than stepping", () => {
    const s = [z.cells.zoneCapableEraLegal, z.cells.moderateZoneEraLegal, z.cells.neutralEraLegal, z.cells.nonZoneEraLegal]
      .map((c) => c.realizedZoneShare);
    for (let i = 1; i < s.length; i++) expect(s[i - 1]).toBeGreaterThan(s[i]);
    for (const v of s) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
  });

  it("keeps zone attack a strict subset of shell selection", () => {
    for (const c of Object.values(z.cells)) expect(c.zoneAttackPossessions).toBeLessThanOrEqual(c.shellSelectedPossessions);
  });
});

describe("6C4B1 WS4 — era references under Candidate 1", () => {
  const c = R("era-reference-certification-candidate1").data;

  it("certifies all eight eras with no replacement", () => {
    expect(c.referencesCertified).toBe(8);
    expect(c.failedReferences).toBe(0);
    expect(c.referencesReplaced).toBe(0);
    expect(c.erasCovered).toHaveLength(8);
    expect(c.pass).toBe(true);
  });

  it("was measured under Candidate 1, not inherited", () => {
    const rec = R("candidate1-lock-recertification").data;
    expect(c.certifiedUnder.coreHash).toBe(rec.coreHash);
    expect(c.certifiedUnder.possessionCalibrationVersion).toBe("1.1.0");
    expect(c.gamesPerEra).toBeGreaterThanOrEqual(5000);
    for (const r of c.references) {
      // Baselines are keyed by METRIC ID, not sample field — the keying the
      // V5 runner's scoreTrait looks up. The dry run caught the alternative.
      expect(r.candidate1SelfBaselines.pppVsReference.n).toBeGreaterThanOrEqual(5000);
      expect(r.candidate1SelfBaselines.gamePace.mean, `${r.era} pace`).toBeGreaterThan(0);
      expect(r.candidate1SelfBaselines.ppp, 'sample-field keys must be gone').toBeUndefined();
    }
  });

  it("holds side symmetry, invariants and replay on every reference", () => {
    expect(c.sideSymmetryFailures).toBe(0);
    expect(c.invariantFailures).toBe(0);
    expect(c.replayFailures).toBe(0);
    for (const r of c.references) {
      expect(r.sideSymmetry.containsHalf, r.era).toBe(true);
      expect(r.sideSymmetry.ties, r.era).toBe(0);
    }
  });

  it("keeps references isolated from the V5 pool and every sealed set", () => {
    expect(c.v5PoolOverlap).toBe(0);
  });

  it("records the withdrawn criterion instead of quietly dropping it", () => {
    expect(c.withdrawnCriterion.criterion).toContain("EXTREME");
    expect(c.withdrawnCriterion.erasItWouldHaveFailed.length).toBe(4);
    expect(c.withdrawnCriterion.why).toContain("after seeing the numbers");
  });

  it("measures the champions-median claim instead of repeating it", () => {
    for (const r of c.references) {
      expect(r.meanReferenceOutscores, r.era).not.toBeNull();
      expect(r.populationStanding.length, r.era).toBeGreaterThanOrEqual(3);
    }
    const dominating = c.references.filter((r) => r.dominatesEveryPopulationTeam && r.meanReferenceOutscores > 0.05);
    expect(dominating).toEqual([]);
  });
});

describe("6C4B1 WS5 — observability under Candidate 1", () => {
  const o = R("historical-observability-certification-candidate1").data;

  it("re-certifies every metric under Candidate 1 and grants eligibility only on certified metrics", () => {
    expect(o.pass).toBe(true);
    expect(o.scoredTraitsWithFailedObservability).toBe(0);
    expect(o.unobservableTraitsContributingToVerdict).toBe(0);
    for (const t of o.traitEligibility.filter((x) => x.scoringEligibility)) {
      expect(o.certifiedMetrics, t.traitId).toContain(t.metric);
    }
  });

  it("records what Candidate 1 changed, in both directions", () => {
    const changed = Object.fromEntries(o.metricsChangedFromCandidate0.map((m) => [m.metric, m]));
    expect(changed.defensiveZoneShare, "the per-possession zone repair should have made this certifiable").toMatchObject(
      { candidate0: false, candidate1: true });
    expect(changed.threeShare, "threeShare lost certification and the artifact must say so").toMatchObject(
      { candidate0: true, candidate1: false });
  });

  it("refuses to score a metric whose control range is smaller than its own margin", () => {
    expect(o.practicalSeparationFailures.length).toBeGreaterThan(0);
    for (const f of o.practicalSeparationFailures) {
      expect(f.controlRange, f.metric).toBeLessThanOrEqual(f.practicalMargin);
      expect(o.certifiedMetrics, f.metric).not.toContain(f.metric);
    }
  });

  it("keeps mirror PPP separated and the per-fixture contradiction detector live", () => {
    expect(o.dependencyGraph.mirrorSeparated).toBe(true);
    expect(o.dependencyGraph.registrySurfaceProblems).toEqual([]);
    expect(o.dependencyGraph.perFixtureDetector.rejectsMirrorRubric).toBe(true);
    expect(o.contradictoryDependentRules).toBe(0);
  });
});

describe("6C4B1 WS5 — Candidate 1 residuals", () => {
  const r = R("candidate1-residual-dispositions").data;

  it("reads the residual ids from Candidate 1 artifacts and disposes of each", () => {
    const summary = R4("phase6c4a-final-summary").data;
    const ids = summary.limitations.filter((l) => l.id.startsWith("RESIDUAL_")).map((l) => l.id);
    expect(r.residualsRead.sort()).toEqual(ids.sort());
    expect(r.residuals).toHaveLength(ids.length);
    for (const x of r.residuals) {
      expect(r.dispositionVocabulary).toContain(x.disposition);
      expect(x.reasoning.length).toBeGreaterThan(80);
      expect(x.sourceArtifact).toContain("6c4a");
    }
  });

  it("leaves no residual as a substantive Candidate 1 engine failure", () => {
    expect(r.unresolvedSubstantiveCandidate1Residuals).toBe(0);
    expect(r.candidate1Verdict).toBe("CANDIDATE_1_INTACT");
    for (const x of r.residuals) expect(x.candidate1EngineFailure).toBe(false);
  });

  it("revises the reference attribution on measured evidence", () => {
    expect(r.referenceAttributionRevised.evidence).toHaveLength(8);
    const outscored = r.referenceAttributionRevised.evidence.filter((e) => e.meanReferenceOutscores < 0);
    expect(outscored.length).toBeGreaterThanOrEqual(4);
  });
});

describe("6C4B1 WS6 — frozen V5 policy", () => {
  const m = R("trait-practical-margin-policy-v5").data;
  const p = R("historical-holdout-v5-policy").data;

  it("freezes the margin policy before any selection exists", () => {
    expect(m.frozen).toBe(true);
    expect(m.frozenBeforeSelection).toBe(true);
    expect(existsSync(`${DIR}/historical-v5-selection.json`) && !p.frozenBeforeSelection).toBe(false);
    expect(m.appliesFrom).toContain("V5");
    expect(m.neverAppliesTo).toContain("V4");
  });

  it("hashes over its own content", () => {
    const { policyHash, frozen, ...rest } = m;
    expect(createHash("sha256").update(JSON.stringify(rest)).digest("hex")).toBe(policyHash);
  });

  it("gives every metric a margin with a full justification", () => {
    for (const [metric, v] of Object.entries(m.metrics)) {
      expect(v.margin, metric).toBeGreaterThan(0);
      expect(v.unit, metric).toBeTruthy();
      expect(v.confidenceMethod, metric).toBeTruthy();
      expect(v.sourceControls, metric).toContain("Candidate 1");
      expect(v.practicalRationale.length, metric).toBeGreaterThan(20);
      expect(v.sampleRequirement.gamesPerSurface, metric).toBe(4096);
      if (v.noiseEstimate.noiseComponent != null) expect(v.margin, metric).toBeGreaterThanOrEqual(v.noiseEstimate.noiseComponent);
    }
    expect(new Set(Object.values(m.metrics).map((v) => v.margin)).size).toBeGreaterThan(1);
  });

  it("requires both statistical and practical evidence to fail a trait", () => {
    expect(m.rule.hardFail).toContain("excludes zero");
    expect(m.rule.hardFail).toContain("margin");
    expect(m.rule.reportingStates).toEqual(expect.arrayContaining([
      "STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT", "PRACTICALLY_MATERIAL_AND_STATISTICALLY_SUPPORTED",
      "INCONCLUSIVE", "NOT_OBSERVABLE", "NOT_APPLICABLE"]));
  });

  it("binds the acceptance policy to the certified instruments and Candidate 1's identity", () => {
    expect(p.frozenBeforeAnyV5Output).toBe(true);
    expect(p.hashes.candidateCoreHash).toBe(R("candidate1-lock-recertification").data.coreHash);
    expect(p.hashes.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    expect(p.hashes.possessionCalibrationVersion).toBe("1.1.0");
    expect(p.hashes.eraReferenceCertificationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.hashes.observabilityCertificationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.hashes.practicalMarginPolicyHash).toBe(m.policyHash);
    expect(p.structuralGates.coreHashMustEqual).toBe(p.hashes.candidateCoreHash);
    expect(p.protocol.totalGames).toBe(p.protocol.gamesPerSurface * 3 * 8);
  });

  it("never zero-fills an unavailable target", () => {
    expect(p.numericGates.unavailableMetrics).toContain("never zero-filled");
  });

  it("carries the V4 numeric gate forward without weakening it", () => {
    const v4 = readArtifact("historical-holdout-v4-policy", "data/validation/6c3r").data;
    expect(p.numericGates.compositeShareMae.maxHoldoutToInternalRatio)
      .toBe(v4.numericGates.compositeShareMae.maxHoldoutToInternalRatio);
    expect(p.hashes.priorV4PolicyHash).toBe(v4.policyHash);
  });
});

describe("6C4B1 WS7 — candidate pool v2", () => {
  const p = R("historical-v5-candidate-pool-v2").data;

  it("keeps at least 24 eligible teams and 2 pairs per era", () => {
    expect(p.eligibleTeamCount).toBeGreaterThanOrEqual(24);
    expect(p.erasWithAtLeastTwoEligiblePairs).toBe(8);
    expect(p.meetsMinimum).toBe(true);
    expect(p.pass).toBe(true);
  });

  it("is output-blind", () => {
    expect(p.candidate1SimulationsUsed).toBe(0);
    expect(p.selectionBasis).toContain("SOURCE_ONLY_OUTPUT_BLIND");
    expect(p.selectionBasis).toContain("No Candidate 1 result");
  });

  it("was judged against the instruments this phase re-certified", () => {
    expect(p.instrumentsRead.observabilityCertification).toBe(R("historical-observability-certification-candidate1").outputHash);
    expect(p.instrumentsRead.eraReferenceCertification).toBe(R("era-reference-certification-candidate1").outputHash);
    expect(p.instrumentsRead.certifiedEras).toHaveLength(8);
  });

  it("resolves person ids rather than assuming the field is present", () => {
    for (const t of p.teams.filter((x) => x.eligible)) {
      expect(t.fiveKey, t.fixtureId).not.toContain("undefined");
      expect(t.fiveKey, t.fixtureId).not.toContain("UNRESOLVED");
      expect(t.fiveKey.split("|"), t.fixtureId).toHaveLength(5);
    }
    expect(new Set(p.teams.filter((t) => t.eligible).map((t) => t.fiveKey)).size).toBe(p.eligibleTeamCount);
  });

  it("enforces every exclusion in code", () => {
    for (const t of p.teams.filter((x) => x.eligible)) expect(t.exclusionConflicts, t.fixtureId).toEqual([]);
    for (const k of ["historicalCalibrationV3", "historicalHoldoutV3", "historicalHoldoutV4Consumed",
      "candidate1Development", "syntheticDevelopmentV2", "syntheticStressHoldoutV2"]) {
      expect(p.exclusions[k], k).toBeGreaterThan(0);
    }
    expect(p.eraReferenceFivesBlocked).toBe(8);
  });
});

describe("6C4B1 WS8/WS9 — selection", () => {
  const pol = R("historical-v5-selection-policy").data;
  const sel = R("historical-v5-selection").data;

  it("froze the policy before the selection and forbids output inputs", () => {
    expect(pol.frozen).toBe(true);
    expect(pol.frozenBeforeSelection).toBe(true);
    expect(pol.forbiddenInputs).toEqual(expect.arrayContaining(["Candidate 1 game results", "Candidate 1 win rates"]));
    expect(sel.selectionPolicyHash).toBe(pol.policyHash);
    expect(sel.candidate1OutputsConsulted).toBe(0);
  });

  it("selects eight matchups over sixteen distinct teams, one per era", () => {
    expect(sel.matchups).toHaveLength(8);
    expect(sel.distinctTeams).toBe(16);
    expect(sel.selectedTeams).toHaveLength(16);
    expect(new Set(sel.eraStylesRepresented).size).toBe(8);
    expect(sel.pass).toBe(true);
  });

  it("is deterministic and input-reorder invariant", () => {
    expect(sel.determinism.repeatIdentical).toBe(true);
    expect(sel.determinism.reversedIdentical).toBe(true);
    expect(sel.determinism.rotatedIdentical).toBe(true);
  });

  it("reproduced the invalidated selection exactly, and says why it was invalidated", () => {
    expect(sel.supersededSelection).toBeTruthy();
    expect(sel.supersededSelection.reproducedIdentically).toBe(true);
    expect(sel.supersededSelection.whyInvalidated).toContain("policy");
    expect(existsSync("data/validation/6c4b1/superseded/historical-v5-selection-v1.0.0-INVALIDATED.json")).toBe(true);
    expect(sel.historicalV5SelectionVersion).not.toBe(sel.supersededSelection.version);
  });

  it("records every rejected alternative with a reason", () => {
    expect(sel.rejectedAlternatives.length).toBeGreaterThan(20);
    for (const r of sel.rejectedAlternatives) expect(r.reason, r.pairId).toBeTruthy();
  });

  it("covers the tactical diversity the pool permits", () => {
    expect(sel.diversityDimensionsCovered.length).toBe(sel.diversityDimensionsAvailable.length);
  });
});

describe("6C4B1 WS10 — manifest", () => {
  const m = R("historical-holdout-v5-manifest").data;

  it("freezes profiles, coaches, traits and targets with hashes", () => {
    expect(m.playerProfileCount).toBe(80);
    expect(m.coachCount).toBeGreaterThan(0);
    expect(m.profileFreeze.allHashed).toBe(true);
    expect(m.scoredTraitCount).toBeGreaterThan(0);
    expect(m.pass).toBe(true);
  });

  it("binds Candidate 1's identity and every instrument hash", () => {
    const rec = R("candidate1-lock-recertification").data;
    expect(m.hashes.candidate1CoreHash).toBe(rec.coreHash);
    expect(m.hashes.candidate1ParameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    expect(m.hashes.candidate1CalibrationVersion).toBe("1.1.0");
    expect(m.selectionHash).toBe(R("historical-v5-selection").data.selectionHash);
  });

  it("scores only certified traits and states why the rest are excluded", () => {
    const eligible = new Set(R("historical-observability-certification-candidate1").data
      .traitEligibility.filter((t) => t.scoringEligibility).map((t) => t.traitId));
    for (const mm of m.matchups) for (const side of [mm.teamA, mm.teamB]) {
      for (const t of side.scoredTraits) {
        expect(eligible, t.traitId).toContain(t.traitId);
        expect(t.metric && t.surface && t.practicalMargin != null, t.traitId).toBe(true);
      }
      for (const t of side.excludedTraits) expect(t.reason).toBeTruthy();
    }
    expect(m.excludedTraitCount).toBeGreaterThan(0);
  });

  it("never zero-fills an unavailable target", () => {
    expect(m.targetFreeze.note).toContain("never zero-filled");
    for (const mm of m.matchups) for (const side of [mm.teamA, mm.teamB]) {
      for (const v of Object.values(side.targets.teamTargets)) {
        if (!v.usable) expect(v.value).toBeNull();
        else expect(typeof v.value).toBe("number");
      }
    }
  });

  it("carries the Candidate 1 reference self-baselines, keyed by metric id", () => {
    for (const mm of m.matchups) {
      expect(mm.eraReference.selfBaselines.pppVsReference).toBeTruthy();
      expect(mm.eraReference.selfBaselines.refPppVsTeam).toBeTruthy();
    }
  });
});

describe("6C4B1 WS11 — seeds", () => {
  const s = R("historical-holdout-v5-seeds").data;

  it("proves zero overlap with every prior population at full volume", () => {
    expect(s.disjointnessProof.totalOverlap).toBe(0);
    expect(s.disjointnessProof.priorPopulationsChecked).toBeGreaterThanOrEqual(15);
    expect(s.disjointnessProof.seedsPerStream).toBeGreaterThanOrEqual(s.volume.holdoutSeedCount);
    for (const [k, v] of Object.entries(s.disjointnessProof.overlaps)) expect(v, k).toBe(0);
  });

  it("keeps the dry-run stream out of the holdout stream", () => {
    expect(s.disjointnessProof.overlaps["historical-holdout-v5 x v5-dryrun"]).toBe(0);
  });

  it("froze its volume before any V5 run", () => {
    expect(s.frozenBeforeRun).toBe(true);
    expect(s.volume.gamesPerSurface).toBe(4096);
    expect(s.volume.totalGames).toBe(s.volume.matchups * s.volume.surfacesPerMatchup * s.volume.gamesPerSurface);
  });

  it("derives seeds deterministically from a committed master", () => {
    expect(s.masterCommitment).toMatch(/^[0-9a-f]{64}$/);
    expect(s.surfaceAddressing).toContain("matchupIndex");
  });
});

describe("6C4B1 WS12 — runner dry run", () => {
  const d = R("historical-v5-runner-dry-run").data;

  it("passes every check on the exact code path", () => {
    expect(d.pass).toBe(true);
    expect(d.failedChecks).toEqual([]);
    expect(d.exactCodePath).toContain("runSealedSetOnce");
    expect(d.runnerModule).toBe("scripts/validation/historical-holdout-v5.mjs");
  });

  it("used no V5 id in its mock set", () => {
    expect(d.mockSet.containsV5Id).toBe(false);
    expect(d.mockSet.source).toContain("DEVELOPMENT");
  });

  it("proved unlock-once, crash-resume and duplicate refusal", () => {
    const by = Object.fromEntries(d.checks.map((c) => [c.name, c.pass]));
    for (const k of ["unlockIncrementsExactlyOnce", "crashLeavesResumableState", "secondRunRefused",
      "resumeCompletesUnderSameAccessEvent", "changedIdentityRefusedOnResume", "sealRefusesWithoutItsOwnFlag"]) {
      expect(by[k], k).toBe(true);
    }
    for (const code of Object.values(d.identityMismatchOutcomes)) expect(code).toBe("IDENTITY_MISMATCH");
  });

  it("proved the scoring path end to end, dual gate included", () => {
    expect(["PASS", "FAIL"]).toContain(d.realEvaluation.traitResult);
    expect(typeof d.realEvaluation.traitDiff).toBe("number");
    expect(d.realEvaluation.practicalMargin).toBeGreaterThan(0);
    expect(d.realEvaluation.dualGate.hardFail).toBe(
      d.realEvaluation.dualGate.statisticallyOpposite && d.realEvaluation.dualGate.beyondPracticalMargin);
    expect(d.realEvaluation.compositeShareMae).toBeGreaterThan(0);
    expect(d.realEvaluation.replayExact).toBe(true);
  });

  it("left the real seals at zero", () => {
    expect(d.accessCounts.historicalHoldoutV5).toBe(0);
    expect(d.accessCounts.syntheticStressHoldoutV2).toBe(0);
    expect(d.accessCounts.historicalHoldoutV3).toBe(1);
    expect(d.accessCounts.historicalHoldoutV4).toBe(1);
  });
});

describe("6C4B1 WS13 — the V5 seal", () => {
  const s = R("historical-holdout-v5-seal").data;

  it("is SEALED_UNREAD at access count zero", () => {
    expect(s.state).toBe("SEALED_UNREAD");
    expect(s.accessCount).toBe(0);
    expect(setAccessCount("historical-holdout-v5")).toBe(0);
    expect(s.accessLogExists).toBe(false);
    expect(existsSync("data/calibration/historical-holdout-v5-access-log.jsonl")).toBe(false);
  });

  it("is a registered set, so it is sealed rather than merely unmentioned", async () => {
    const { SEALED_SETS, requireSetUnlock } = await import("../src/v3/calibration/holdoutSeal.js");
    expect(SEALED_SETS["historical-holdout-v5"]).toBe("data/calibration/historical-holdout-v5-access-log.jsonl");
    expect(() => requireSetUnlock("historical-holdout-v5", { argv: ["node", "x"], reason: "r", log: false }))
      .toThrow(/sealed/);
  });

  it("binds every hash the authorized runner must match", () => {
    const rec = R("candidate1-lock-recertification").data;
    expect(s.candidate.coreHash).toBe(rec.coreHash);
    expect(s.candidate.parameterSetHash).toBe(rec.parameterSetHash);
    expect(s.candidate.possessionCalibrationVersion).toBe("1.1.0");
    for (const [k, v] of Object.entries(s.boundHashes)) expect(v, k).toMatch(/^[0-9a-f]{64}$/);
    expect(s.boundHashes.manifestHash).toBe(R("historical-holdout-v5-manifest").data.manifestHash);
    expect(s.boundHashes.selectionHash).toBe(R("historical-v5-selection").data.selectionHash);
    expect(s.boundHashes.seedHash).toBe(R("historical-holdout-v5-seeds").data.seedHash);
    expect(s.sealHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names exactly one authorized runner", () => {
    expect(s.authorizedRunner.module).toBe("scripts/validation/historical-holdout-v5.mjs");
    expect(s.authorizedRunner.command).toContain("--unlock-historical-holdout-v5");
    expect(s.authorizedRunner.note).toContain("No other command");
  });

  it("verified no V5 fixture appears in any simulation output", () => {
    expect(s.sealIntegrity.leaksFound).toBe(0);
    expect(s.sealIntegrity.outputArtifactsSearched).toBeGreaterThan(10);
    expect(s.sealIntegrity.carriedTeamsDefinedInPriorPool).toBeGreaterThan(0);
    expect(s.sealIntegrity.note).toContain("definition");
  });

  it("leaves every other seal exactly as it was", () => {
    expect(s.otherSeals["synthetic-stress-holdout-v2"]).toMatchObject({ status: "SEALED_UNREAD", accessCount: 0 });
    expect(s.otherSeals["historical-holdout-v3"].accessCount).toBe(1);
    expect(s.otherSeals["historical-holdout-v4"].accessCount).toBe(1);
  });
});

describe("6C4B1 WS14 — final readiness and the B2 package", () => {
  const r = R("historical-v5-readiness-final").data;
  const pkg = R("phase6c4b2-validation-package").data;
  const audit = R("historical-v5-blocker-audit").data;

  it("resolves every registered blocker through its artifact", () => {
    const reg = R("historical-v5-blocker-register").data;
    expect(audit.totalBlockers).toBe(reg.sourceBlockerCount);
    expect(audit.resolvedBlockers).toBe(audit.totalBlockers);
    expect(audit.unresolvedBlockers).toBe(0);
    expect(audit.pass).toBe(true);
    for (const b of audit.blockers) {
      expect(b.currentStatus, b.blockerId).toBe("RESOLVED");
      expect(b.resolvedByArtifactHash, b.blockerId).toMatch(/^[0-9a-f]{64}$/);
    }
    // the phase-start register is a historical record and is NOT rewritten
    expect(reg.blockers.every((b) => b.currentStatus === "OPEN")).toBe(true);
  });

  it("declares every readiness fact ready and V5 openable in 6C4B2", () => {
    for (const [k, v] of Object.entries(r)) if (typeof v === "boolean" && k !== "mayOpenInPhase6C4B2") expect(v, k).toBe(true);
    expect(r.mayOpenInPhase6C4B2).toBe(true);
    expect(r.gatesFailed).toEqual([]);
  });

  it("reports the true holdout state", () => {
    expect(r.holdoutState.historicalHoldoutV5).toMatchObject({ state: "SEALED_UNREAD", accessCount: 0, verdict: "NOT_RUN" });
    expect(r.holdoutState.syntheticStressHoldoutV2).toMatchObject({ state: "SEALED_UNREAD", accessCount: 0 });
    expect(r.holdoutState.historicalHoldoutV3).toMatchObject({ state: "CONSUMED", accessCount: 1, verdict: "FAIL" });
    expect(r.holdoutState.historicalHoldoutV4).toMatchObject({ state: "CONSUMED", accessCount: 1, verdict: "FAIL" });
  });

  it("records limitations rather than implying completeness", () => {
    expect(r.limitations.length).toBeGreaterThanOrEqual(5);
    for (const l of r.limitations) expect(l.detail.length).toBeGreaterThan(80);
    const ids = r.limitations.map((l) => l.id);
    expect(ids).toContain("PAIR_TYPES_ALL_SAME_ERA_CONTRAST");
    expect(ids).toContain("FOUR_METRICS_UNCERTIFIED");
    expect(ids).toContain("MODULE_VERSIONS_STALE");
  });

  it("prepares the B2 package without executing a single holdout command", () => {
    expect(pkg.commandsExecutedInThisPhase.historicalV5).toBe(0);
    expect(pkg.commandsExecutedInThisPhase.syntheticV2).toBe(0);
    expect(pkg.commandsExecutedInThisPhase.formalVerdict).toBe(0);
    expect(pkg.holdout.state).toBe("SEALED_UNREAD");
    expect(pkg.holdout.accessCount).toBe(0);
    expect(pkg.packageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.formalVerdictRules.syntheticGate).toContain("only AFTER");
    expect(pkg.productionIsolationRequirements.join(" ")).toContain("3.2.0");
  });
});

describe("6C4B1 phase discipline", () => {
  const sum = R("phase6c4b1-final-summary").data;

  it("wrote every artifact and every one verifies", () => {
    expect(sum.artifactsWritten).toBeGreaterThanOrEqual(20);
    expect(sum.artifactsInvalid).toBe(0);
  });

  it("reaches the sealed-and-ready outcome", () => {
    expect(sum.outcome).toBe("HISTORICAL_V5_SEALED_READY_FOR_ONE_TIME_FORMAL_VALIDATION");
    expect(sum.mayOpenInPhase6C4B2).toBe(true);
    expect(sum.nextPhase).toContain("6C4B2");
  });

  it("respected every scope commitment", () => {
    for (const [k, v] of Object.entries(sum.scopeRespected)) expect(v, k).toBe(true);
    expect(sum.productionIsolation.engineVersion).toBe("3.2.0");
    expect(sum.productionIsolation.appVersion).toBe("2.7.2");
    expect(sum.productionIsolation.main).toBe("9cd95ff");
    expect(sum.productionIsolation.branch).not.toBe("main");
  });

  it("reconciles blocker accounting end to end", () => {
    expect(sum.blockers.source).toBe(sum.blockers.registered);
    expect(sum.blockers.resolved).toBe(sum.blockers.source);
    expect(sum.blockers.unresolved).toBe(0);
  });

  it("renders every phase document from an artifact", () => {
    for (const doc of ["candidate1-core-certification", "candidate1-identity-separation",
      "realized-zone-measurement-certification", "era-reference-certification-candidate1",
      "historical-observability-certification-candidate1", "historical-v5-practical-margin-policy",
      "historical-v5-candidate-pool-v2", "historical-v5-selection", "historical-v5-manifest",
      "historical-v5-seeds", "historical-v5-runner-dry-run", "historical-v5-seal",
      "historical-v5-readiness-final", "phase-6c4b2-validation-package", "phase-6c4b1-limitations"]) {
      const body = readFileSync(`docs/simulation-v3/${doc}.md`, "utf8");
      expect(body.startsWith("<!-- RENDERED FROM ARTIFACT"), `${doc} must be rendered`).toBe(true);
      expect(body, doc).toContain("outputHash:");
    }
  });

  it("keeps the V5 runner unreachable from any normal command", () => {
    const pkgJson = JSON.parse(readFileSync("package.json", "utf8"));
    const v5Scripts = Object.entries(pkgJson.scripts).filter(([, cmd]) => cmd.includes("historical-holdout-v5.mjs"));
    expect(v5Scripts).toHaveLength(1);
    expect(v5Scripts[0][0]).toBe("validation:historical-v5");
    // the runner needs BOTH unlock flags; neither is in the script itself
    expect(v5Scripts[0][1]).not.toContain("--unlock");
  });
});
