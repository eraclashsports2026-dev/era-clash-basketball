import { describe, it, expect } from "vitest";
import { assertCoreHashLineage } from "./helpers/candidateLineage.js";
import { readFileSync, existsSync } from "node:fs";
import { verifyArtifact, ARTIFACT_DIR_6C3, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
import { SCOPE_POLICY, scopePolicyHash, classifyTeamField, AVAILABILITY_MAP, NOT_APPLICABLE_TEAM_METRICS } from "../src/v3/calibration/holdoutScopePolicy.js";
import { HOLDOUT } from "../src/v3/calibration/acceptancePolicy.js";
import { setAccessCount } from "../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest, coreClosure, CORE_ENTRY_POINTS } from "../scripts/validation/preflight.mjs";
import { runSealedSetOnce, mockSeal, RunRefused } from "../scripts/validation/runner.mjs";
import { activeParameters, defaultRuntimeParameterSet } from "../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../src/versions.js";
import { HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2, manifestHash } from "../data/calibration/sets-v3.mjs";

const V = (n) => JSON.parse(readFileSync(`data/validation/6c3/${n}.json`, "utf8"));
const C6 = (n) => JSON.parse(readFileSync(`data/calibration/c6/${n}.json`, "utf8"));

// Frozen before either holdout was opened. A change needs a version bump and a
// justification that does not reference a holdout result.
const FROZEN_SCOPE_HASH = "594ec258891eebfcd11cdab9190a59f944c331fc4b219261b5fc076312302bf7";

describe("supported-scope policy is frozen", () => {
  it("has not changed since it was frozen", () => {
    expect(scopePolicyHash(), [
      "The holdout supported-scope policy changed.",
      "It was frozen before either holdout was opened. A change now would be a",
      "gate moved after seeing a result, which is the one thing this phase forbids.",
    ].join("\n")).toBe(FROZEN_SCOPE_HASH);
  });

  it("declares itself frozen and forbids zero-fill", () => {
    expect(SCOPE_POLICY.frozenBeforeAnyHoldoutOpening).toBe(true);
    expect(SCOPE_POLICY.zeroFillForbidden).toBe(true);
    expect(SCOPE_POLICY.zeroFillNote).toMatch(/never be read as an observed zero/);
  });

  it("records what it may and may not inspect", () => {
    expect(SCOPE_POLICY.neverInspected.join(" ")).toMatch(/candidate holdout outputs/);
    expect(SCOPE_POLICY.inspectedOnly.join(" ")).toMatch(/target availability/);
  });

  it("maps both unavailability reasons to UNAVAILABLE", () => {
    expect(AVAILABILITY_MAP.NOT_RECORDED_IN_ERA).toBe("UNAVAILABLE");
    expect(AVAILABILITY_MAP.SOURCE_BLOCKED_LICENSING).toBe("UNAVAILABLE");
  });

  it("classifies season records as NOT_APPLICABLE with a stated reason", () => {
    for (const id of Object.keys(NOT_APPLICABLE_TEAM_METRICS)) {
      const c = classifyTeamField(id, { value: 82, availability: "RECORDED_STATISTIC" });
      expect(c.supportClass).toBe("NOT_APPLICABLE");
      expect(c.evaluated).toBe(false);
      expect(c.reason.length).toBeGreaterThan(40);
    }
  });

  it("never marks an unavailable field as evaluated", () => {
    for (const a of ["NOT_RECORDED_IN_ERA", "SOURCE_BLOCKED_LICENSING"]) {
      const c = classifyTeamField("pointsPerGame", { value: null, availability: a });
      expect(c.supportClass).toBe("UNAVAILABLE");
      expect(c.evaluated).toBe(false);
      expect(c.value).toBeNull();
    }
  });
});

describe("candidate core manifest", () => {
  it("verifies and discovers its own closure", () => {
    expect(verifyArtifact("candidate-core-manifest", ARTIFACT_DIR_6C3).valid).toBe(true);
    const d = V("candidate-core-manifest").data;
    expect(d.discovery).toMatch(/transitive import closure/);
    expect(d.fileCount).toBeGreaterThan(40);
    expect(d.missing).toEqual([]);
  });

  it("the closure hashes to the recorded value, or to an attributable successor of it", () => {
    const d = V("candidate-core-manifest").data;
    assertCoreHashLineage(d.aggregateCoreHash, buildCoreManifest().aggregateCoreHash, "V3 candidate core");
  });

  it("includes the files that actually decide a result", () => {
    const paths = coreClosure().files;
    for (const must of ["src/v3/possession/game.js", "src/v3/possession/actions.js", "src/v3/possession/rng.js",
      "src/v3/calibration/parameters.js", "src/players.js", "src/v3/teamIntelligence.js",
      "src/v3/data/eras.js", "src/versions.js"]) {
      expect(paths, `${must} must be in the core closure`).toContain(must);
    }
  });

  it("every entry point exists", () => {
    for (const e of CORE_ENTRY_POINTS) expect(existsSync(e), e).toBe(true);
  });
});

describe("preflight authorised the run", () => {
  it("verifies and permitted formal validation", () => {
    expect(verifyArtifact("phase6c3-preflight", ARTIFACT_DIR_6C3).valid).toBe(true);
    const d = V("phase6c3-preflight").data;
    expect(d.formalValidationMayBegin).toBe(true);
    expect(d.failedGates).toEqual([]);
    expect(d.candidateLockValid).toBe(true);
  });

  it("recorded both seals unread before opening", () => {
    const d = V("phase6c3-preflight").data;
    expect(d.holdoutAccessCounts.historicalHoldoutV3).toBe(0);
    expect(d.holdoutAccessCounts.syntheticStressHoldoutV2).toBe(0);
  });

  it("found no sealed fixture in committed simulation output", () => {
    const d = V("phase6c3-preflight").data;
    expect(d.sealedFixtureLeakage.leaks).toEqual([]);
    expect(d.sealedFixtureLeakage.checked).toBe(HISTORICAL_HOLDOUT_V3_IDS.length + SYNTHETIC_STRESS_HOLDOUT_V2.length);
  });

  it("measured the supported scope before opening, and it reconciles", () => {
    const c = V("phase6c3-preflight").data.supportedScopeCensus;
    expect(c.reconciliation.reconciles).toBe(true);
    expect(Object.values(c.byClass).reduce((a, b) => a + b, 0)).toBe(c.teamFieldCells);
    expect(c.byClass.SUPPORTED_NUMERIC ?? 0).toBe(0);
    expect(c.erasCovered.length).toBe(8);
  });
});

describe("the pipeline was proven on a mock before the real set", () => {
  it("verifies and passed every check", () => {
    expect(verifyArtifact("holdout-pipeline-dryrun", ARTIFACT_DIR_6C3).valid).toBe(true);
    const d = V("holdout-pipeline-dryrun").data;
    expect(d.allPass).toBe(true);
    expect(d.checksPassed).toBe(d.checksTotal);
    expect(d.mockMembersAreHoldoutFixtures).toBe(false);
  });

  it("used no holdout fixture as a mock member", () => {
    const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
    for (const m of V("holdout-pipeline-dryrun").data.mockMembers) expect(sealed.has(m)).toBe(false);
  });

  it("refuses a second independent run", () => {
    const seal = mockSeal("unit-mock", ".cache/validation/unit-mock.jsonl");
    // accessCount > 0 with no resume must refuse; simulate by a stub seal.
    const stub = { name: "stub", accessCount: () => 1, unlock: () => ({}) };
    expect(() => runSealedSetOnce({ seal: stub, identity: {}, members: ["a"], runPath: ".cache/validation/unit-run.json", reason: "r", actor: "a", evaluate: () => ({}) }))
      .toThrow(RunRefused);
    expect(seal.accessCount()).toBe(0);
  });

  it("refuses a resume whose identity moved", () => {
    const stub = { name: "stub", accessCount: () => 1, unlock: () => ({}) };
    let err = null;
    try {
      runSealedSetOnce({ seal: stub, identity: { core: "B" }, members: ["a"],
        runPath: "data/validation/6c3/historical-holdout-run.json", reason: "r", actor: "a", resume: true, evaluate: () => ({}) });
    } catch (e) { err = e; }
    // The real run is COMPLETE, so it refuses on that first — either refusal is correct.
    expect(err).toBeInstanceOf(RunRefused);
    expect(["IDENTITY_MISMATCH", "ALREADY_COMPLETE"]).toContain(err.code);
  });
});

describe("historical holdout was opened exactly once", () => {
  it("verifies as an artifact", () => {
    expect(verifyArtifact("historical-holdout-results", ARTIFACT_DIR_6C3).valid).toBe(true);
  });

  it("moved the access count from 0 to exactly 1", () => {
    const d = V("historical-holdout-results").data;
    expect(d.accessCountBefore).toBe(0);
    expect(d.accessCountAfter).toBe(1);
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
  });

  it("recorded an auditable access event", () => {
    const e = V("historical-holdout-results").data.accessEvent;
    expect(e.actor).toBeTruthy();
    expect(e.reason.length).toBeGreaterThan(20);
    expect(e.set).toBe("historical-holdout-v3");
    expect(e.openedAtCommit).toBeTruthy();
  });

  it("evaluated all 8 fixtures across all 8 eras at the frozen volume", () => {
    const d = V("historical-holdout-results").data;
    expect(d.fixturesEvaluated).toBe(8);
    expect(d.erasCovered.length).toBe(8);
    expect(d.gamesPerFixture).toBeGreaterThanOrEqual(HOLDOUT.minGamesPerHoldoutFixture);
    expect(d.totalGames).toBe(d.fixturesEvaluated * d.gamesPerFixture);
    expect(d.runStatus).toBe("COMPLETE");
  });

  it("tested the identity the preflight recorded", () => {
    const d = V("historical-holdout-results").data;
    const core = V("candidate-core-manifest").data;
    expect(d.identity.coreHash).toBe(core.aggregateCoreHash);
    expect(d.identity.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    expect(d.identity.calibrationVersion).toBe(versionOf("possessionCalibrationVersion"));
    expect(d.identity.holdoutManifestHash).toBe(manifestHash(HISTORICAL_HOLDOUT_V3_IDS, "historical-holdout-v3"));
    expect(d.identity.scopePolicyHash).toBe(scopePolicyHash());
  });

  it("used no zero-fill and excluded every unavailable metric", () => {
    const d = V("historical-holdout-results").data;
    expect(d.supportedScope.zeroFillUsed).toBe(false);
    expect(d.supportedScope.teamFieldClassTotals.SUPPORTED_NUMERIC ?? 0).toBe(0);
    expect(d.supportedScope.reconciliation.reconciles).toBe(true);
  });

  it("passed the quantitative generalisation gate", () => {
    const d = V("historical-holdout-results").data;
    expect(d.gates.compositeRatioWithinPolicy).toBe(true);
    expect(d.holdoutToInternalRatio).toBeLessThanOrEqual(d.ratioGate);
  });

  it("passed every structural guardrail", () => {
    const g = V("historical-holdout-results").data.gates;
    for (const k of ["everyFixtureExecuted", "zeroInvariantFailures", "zeroFinalTies", "replayExactEverywhere",
      "noImpossibleStatistics", "opportunityWithinBounds", "eraRulesAuthoritative", "zeroCatastrophicFixtures",
      "noHighConfidenceFixtureFails"]) {
      expect(g[k], k).toBe(true);
    }
  });

  it("reports its own failure rather than hiding it", () => {
    const d = V("historical-holdout-results").data;
    expect(d.verdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(d.gates.identityDirectionallyPreserved).toBe(false);
    expect(d.perFixture.filter((f) => !f.pass).length).toBeGreaterThan(0);
    for (const f of d.perFixture.filter((x) => !x.pass)) expect(f.failureReasons.length).toBeGreaterThan(0);
  });

  it("kept era rules authoritative in every pre-three era", () => {
    for (const r of V("historical-holdout-results").data.results) {
      if (["1950s", "1960s", "1970s"].includes(r.eraStyleId)) {
        expect(r.structural.threePointAttemptsInPreThreeEra, r.fixtureId).toBe(0);
      }
    }
  });
});

describe("formal verdict", () => {
  it("verifies and is a failure", () => {
    expect(verifyArtifact("formal-holdout-verdict", ARTIFACT_DIR_6C3).valid).toBe(true);
    const d = V("formal-holdout-verdict").data;
    expect(d.combinedVerdict).toBe("HISTORICAL_HOLDOUT_FAILED");
    expect(d.calibrationStatusAfterVerdict).toBe("HOLDOUT_FAILED");
    expect(d.combinedVerdict).not.toBe("HOLDOUT_VALIDATED");
  });

  it("did not open the synthetic holdout", () => {
    const d = V("formal-holdout-verdict").data;
    expect(d.syntheticHoldout.verdict).toBe("NOT_OPENED");
    expect(d.syntheticHoldout.accessCountAfter).toBe(0);
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(d.syntheticHoldout.notOpenedBecause).toMatch(/forbids opening the synthetic holdout/);
  });

  it("proves no post-holdout tuning", () => {
    const d = V("formal-holdout-verdict").data;
    expect(d.candidateImmutability.coreUnchanged).toBe(true);
    expect(d.candidateImmutability.parameterUnchanged).toBe(true);
    expect(d.candidateImmutability.parameterDrift).toEqual([]);
    expect(d.candidateImmutability.parameterChangesAfterHoldout).toBe(0);
    expect(d.candidateImmutability.policyChangesAfterHoldout).toBe(0);
    expect(d.candidateImmutability.postHoldoutTuning).toBe("NONE");
    // and live, not just as recorded: parameters still at defaults, and the
    // core either byte-identical to the holdout-time hash or an attributable
    // successor candidate of it (silent drift still fails).
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
    assertCoreHashLineage(d.candidateImmutability.coreHashAtHoldout, buildCoreManifest().aggregateCoreHash, "V3 holdout core");
  });

  it("records the diagnosis without substituting it for the verdict", () => {
    const d = V("formal-holdout-verdict").data;
    expect(d.diagnosis.rootCause).toBe("MY_VALIDATION_SURFACE_DEFECT_NOT_A_CANDIDATE_DEFECT");
    expect(d.diagnosis.whatWasNotReScored).toMatch(/^Nothing\./);
    expect(d.diagnosis.whyTheVerdictIsNotDowngradedToInvalidRun).toMatch(/self-serving direction/);
    // the verdict is still a failure despite the diagnosis
    expect(d.combinedVerdict).toBe("HISTORICAL_HOLDOUT_FAILED");
  });

  it("shows the mirror ambiguity with evidence", () => {
    const d = V("formal-holdout-verdict").data;
    expect(d.diagnosis.maxPointsPerPossessionGapAcrossFixtures).toBeLessThan(0.01);
    expect(d.diagnosis.traitsFailedOnMirrorAmbiguousMetrics).toBeGreaterThan(0);
    expect(d.diagnosis.mirrorAmbiguousFailures.length).toBe(d.diagnosis.traitsFailedOnMirrorAmbiguousMetrics);
  });

  it("requires a replacement holdout", () => {
    const r = V("formal-holdout-verdict").data.replacementHoldoutRecommendation;
    expect(r.required).toBe(true);
    expect(r.beforeReRunning.length).toBeGreaterThanOrEqual(4);
    expect(r.candidateDecision).toMatch(/OWNER/);
  });

  it("applies every consequence rather than describing it", () => {
    const d = V("formal-holdout-verdict").data;
    expect(d.consequences.join(" ")).toMatch(/NOT holdout validated/);
    // no preview artifacts may exist
    for (const n of ["preview-integration-manifest", "preview-deployment", "preview-smoke-results",
      "preview-soak-results", "preview-browser-qa", "preview-security-results", "private-preview-verdict"]) {
      expect(existsSync(`data/validation/6c3/${n}.json`), `${n} must not exist after a failed holdout`).toBe(false);
    }
  });
});

describe("production isolation", () => {
  it("keeps the production engine and the calibration version untouched", () => {
    expect(versionOf("engineVersion")).toBe("3.2.0");
    expect(versionOf("possessionCalibrationVersion")).toBe("1.0.0");
    expect(C6("baseline-candidate-lock").data.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
  });

  it("left every development flag defaulting to false", () => {
    const flags = readFileSync("api/_lib/flags.js", "utf8");
    for (const f of ["POSSESSION_ENGINE_ENABLED", "DEFENSIVE_MATCHUP_ENGINE_ENABLED", "ZONE_RESOLUTION_ENABLED",
      "EXPANDED_OFFENSIVE_ACTIONS_ENABLED", "OFFENSIVE_COACH_ADJUSTMENTS_ENABLED", "DAILY_COACH_ERA_ENABLED"]) {
      expect(flags).toMatch(new RegExp(`bool\\("${f}",\\s*false\\)`));
    }
  });

  it("added no public holdout or calibration endpoint", () => {
    const { readdirSync } = require("node:fs");
    const routes = readdirSync("api").filter((f) => f.endsWith(".js"));
    for (const r of routes) {
      expect(r).not.toMatch(/holdout|calibrat|parameter|probabilit/i);
    }
  });
});

describe("scripts are inert on import", () => {
  it("importing a validation script runs nothing", async () => {
    const before = setAccessCount("historical-holdout-v3");
    await import("../scripts/validation/preflight.mjs");
    await import("../scripts/validation/runner.mjs");
    await import("../scripts/validation/holdoutEval.mjs");
    await import("../scripts/validation/reference.mjs");
    await import("../scripts/validation/historical-holdout.mjs");
    await import("../scripts/validation/verdict.mjs");
    await import("../scripts/validation/report.mjs");
    expect(setAccessCount("historical-holdout-v3")).toBe(before);
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
  });
});
