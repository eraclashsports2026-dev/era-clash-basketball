import { describe, it, expect } from "vitest";
import { assertCoreHashLineage } from "./helpers/candidateLineage.js";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyArtifact, ARTIFACT_DIR_6C3 } from "../src/v3/calibration/artifacts.js";
import { VALIDATION_VERSIONS, validationVersionOf } from "../src/v3/calibration/validationVersions.js";
import { setAccessCount, SEALED_SETS, allSealStatuses } from "../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifest, coreClosure } from "../scripts/validation/preflight.mjs";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../src/versions.js";

const DIR = "data/validation/6c3r";
const A = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, "utf8"));
const V3 = (n) => JSON.parse(readFileSync(`data/validation/6c3/${n}.json`, "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("V3 preservation", () => {
  it("keeps the V3 access count at exactly 1 and the verdict at FAIL", () => {
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
    expect(V3("historical-holdout-results").data.verdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(V3("formal-holdout-verdict").data.combinedVerdict).toBe("HISTORICAL_HOLDOUT_FAILED");
  });

  it("proves the V3 artifacts have not changed since the preservation manifest was taken", () => {
    const p = A("historical-v3-preservation-manifest").data;
    expect(sha("data/validation/6c3/historical-holdout-results.json")).toBe(p.resultsFileSha256);
    expect(sha("data/validation/6c3/formal-holdout-verdict.json")).toBe(p.verdictFileSha256);
    expect(sha("data/calibration/historical-holdout-v3-access-log.jsonl")).toBe(p.accessLogSha256);
    expect(p.state).toBe("CONSUMED");
    expect(p.neverRescored).toBe(true);
    expect(p.failureClass).toBe("NONIDENTIFIABLE_MEASUREMENT_SURFACE");
  });

  it("classifies the failure without revising the verdict", () => {
    const d = A("historical-v3-failure-diagnosis").data;
    expect(d.formalVerdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(d.candidatePerformanceFailureEstablished).toBe(false);
    expect(d.validationSurfaceFailureEstablished).toBe(true);
    expect(d.failureClass).toBe("NONIDENTIFIABLE_MEASUREMENT_SURFACE");
    expect(d.replacementValidationRequired).toBe(true);
    expect(d.evidenceBasis).toMatch(/not re-run on any V3 fixture/);
    expect(d.whyTheVerdictRemainsFail).toMatch(/stays refused/);
  });

  it("supports the diagnosis only from what V3 itself recorded", () => {
    const d = A("historical-v3-failure-diagnosis").data;
    const v = V3("formal-holdout-verdict").data.diagnosis;
    expect(d.surface.maxSeparationAcrossFixtures).toBe(v.maxPointsPerPossessionGapAcrossFixtures);
    expect(d.traits.scored).toBe(v.scoredTraits);
    expect(d.traits.failedOnMirrorAmbiguousMetrics).toBe(v.traitsFailedOnMirrorAmbiguousMetrics);
    expect(d.traits.failedOnObservableMetrics).toBe(v.traitsFailedOnValidMetrics);
  });
});

describe("validation-attempt status model", () => {
  it("keeps Candidate 0 locked through the failed attempt", () => {
    const r = A("formal-validation-attempts").data;
    expect(r.candidateStatus.candidateLockStatus).toBe("LOCKED");
    expect(r.candidateStatus.candidateSelectionStatus).toBe("SELECTED");
    expect(r.candidateStatus.possessionCalibrationVersion).toBe("1.0.0");
    expect(r.candidateStatus.parameterChanges).toBe(0);
  });

  it("records the V3 attempt immutably with its full identity", () => {
    const a = A("formal-validation-attempts").data.attempts.find((x) => x.attemptId === "attempt-1-historical-v3");
    expect(a.formalVerdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(a.failureClass).toBe("NONIDENTIFIABLE_MEASUREMENT_SURFACE");
    expect(a.immutable).toBe(true);
    for (const k of ["candidateCommit", "candidateCoreHash", "parameterSetHash", "policyHash", "seedVersion", "accessEvent"]) {
      expect(a[k], k).toBeTruthy();
    }
    expect(a.candidateCoreHash).toBe(V3("historical-holdout-results").data.identity.coreHash);
  });

  it("tracks the replacement attempt through its lifecycle with synthetic V2 sealed", () => {
    // PENDING before V4 opened; after the V4 run this must be a terminal state
    // backed by the artifacts that justify it. It moved to FAILED when V4
    // legitimately failed, so the assertion is the coupling, not the snapshot.
    const r = A("formal-validation-attempts").data;
    expect(["PENDING", "FAILED", "VALIDATED"]).toContain(r.replacementValidationStatus);
    if (r.replacementValidationStatus !== "PENDING") {
      const v4 = A("historical-holdout-v4-results").data;
      const verdict = A("replacement-formal-verdict").data;
      expect(v4.runStatus).toBe("COMPLETE");
      if (r.replacementValidationStatus === "FAILED") {
        expect(v4.verdict).toBe("HISTORICAL_HOLDOUT_V4_FAIL");
        expect(verdict.combinedVerdict).toBe("HISTORICAL_V4_FAILED");
        expect(r.candidateStatus.calibrationStatus).toBe("HOLDOUT_FAILED");
      }
      const a2 = r.attempts.find((x) => x.attemptId === "attempt-2-historical-v4");
      expect(a2.immutable).toBe(true);
      expect(a2.candidateCoreHash).toBe(v4.identity.coreHash);
    }
    expect(r.syntheticHoldoutV2Status).toBe("SEALED_UNREAD");
  });
});

describe("candidate immutability through this phase", () => {
  it("keeps the core identical to both prior holdout records, or an attributable successor", () => {
    const live = buildCoreManifest().aggregateCoreHash;
    const recorded = V3("candidate-core-manifest").data.aggregateCoreHash;
    expect(recorded).toBe(V3("historical-holdout-results").data.identity.coreHash);
    assertCoreHashLineage(recorded, live, "V3/V4 candidate core");
  });

  it("keeps every parameter at its registry default", () => {
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
    expect(versionOf("possessionCalibrationVersion")).toBe("1.0.0");
  });

  it("keeps the validation version registry OUTSIDE the candidate core", () => {
    // src/versions.js is one of the 52 frozen core files, so validation keys
    // live in a separate registry that the engine never imports. If this file
    // ever enters the closure, the next holdout run would be invalidated by
    // any validation-version change.
    expect(coreClosure().files).not.toContain("src/v3/calibration/validationVersions.js");
    expect(validationVersionOf("historicalHoldoutSetVersion")).toBe("4.0.0");
    expect(validationVersionOf("historicalHoldoutSeedSetVersion")).toBe("2.0.0");
    expect(() => validationVersionOf("nope")).toThrow(/unknown key/);
    expect(Object.isFrozen(VALIDATION_VERSIONS)).toBe(true);
  });
});

describe("the V4 seal", () => {
  it("is registered with its own log, opened at most once, independent of V3", () => {
    expect(SEALED_SETS["historical-holdout-v4"]).toBe("data/calibration/historical-holdout-v4-access-log.jsonl");
    const n = setAccessCount("historical-holdout-v4");
    expect(n).toBeLessThanOrEqual(1);
    if (n === 1) {
      // the opening must be attributable and transactional
      const log = readFileSync("data/calibration/historical-holdout-v4-access-log.jsonl", "utf8").trim().split("\n");
      expect(log.length).toBe(1);
      const e = JSON.parse(log[0]);
      expect(e.actor).toBeTruthy();
      expect(String(e.reason).length).toBeGreaterThan(20);
      const run = JSON.parse(readFileSync("data/validation/6c3r/historical-holdout-v4-run.json", "utf8"));
      expect(run.status).toBe("COMPLETE");
      expect(run.accessCountBefore).toBe(0);
    }
    // opening v4 must not have touched v3's log
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
  });

  it("reports v4 in the combined seal status, consistent with its log", () => {
    const all = allSealStatuses();
    expect(all["historical-holdout-v4"].accessCount).toBe(setAccessCount("historical-holdout-v4"));
    expect(["SEALED_UNREAD", "UNSEALED"]).toContain(all["historical-holdout-v4"].status);
  });
});

describe("preflight", () => {
  it("verifies and authorises replacement validation", () => {
    expect(verifyArtifact("phase6c3r-preflight", DIR).valid).toBe(true);
    const d = A("phase6c3r-preflight").data;
    expect(d.candidateLockValid).toBe(true);
    expect(d.candidateCoreUnchanged).toBe(true);
    expect(d.historicalV3Preserved).toBe(true);
    expect(d.syntheticV2StillSealed).toBe(true);
    expect(d.replacementValidationMayBegin).toBe(true);
    expect(d.failedGates).toEqual([]);
  });
});

// ── WS2: trait observability framework ──────────────────────────────────────
describe("historical trait registry", () => {
  const reg = () => A("historical-trait-registry").data;

  it("classifies the complete vocabulary, every trait exactly once", async () => {
    const { readFileSync } = await import("node:fs");
    const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8"));
    const vocab = new Set();
    for (const r of targets.records) for (const t of r.identityTargets ?? []) vocab.add(t.value);
    const rows = reg().traits;
    const ids = rows.map((t) => t.traitId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of vocab) expect(ids, `vocabulary trait "${v}" must be classified`).toContain(v);
    expect(rows.length).toBe(vocab.size);
    const c = reg().counts;
    expect(Object.values(c.byClass).reduce((a, b) => a + b, 0)).toBe(c.total);
  });

  it("gives every trait exactly one observability class", async () => {
    const { OBSERVABILITY_CLASSES } = await import("../scripts/validation/traitRegistry.mjs");
    for (const t of reg().traits) expect(OBSERVABILITY_CLASSES).toContain(t.observabilityClass);
  });

  it("never lets an unobservable trait be scoring-eligible", () => {
    for (const t of reg().traits.filter((x) => x.observabilityClass === "UNOBSERVABLE_ON_THIS_SURFACE")) {
      expect(t.scoringEligibility, t.traitId).toBe(false);
      expect(t.primaryMetrics).toEqual([]);
    }
  });

  it("classifies championship identities as unobservable rather than stretching a proxy", () => {
    const bc = reg().traits.find((t) => t.traitId === "BALANCED_CHAMPION");
    const nc = reg().traits.find((t) => t.traitId === "NON_CHAMPION");
    expect(bc.observabilityClass).toBe("UNOBSERVABLE_ON_THIS_SURFACE");
    expect(nc.observabilityClass).toBe("UNOBSERVABLE_ON_THIS_SURFACE");
  });

  it("requires opponent-paired surfaces for offence and defence quality", () => {
    const eo = reg().traits.find((t) => t.traitId === "ELITE_OFFENSE");
    const ed = reg().traits.find((t) => t.traitId === "ELITE_DEFENSE");
    expect(eo.requiredMeasurementSurface).toBe("VS_ERA_REFERENCE");
    expect(ed.requiredMeasurementSurface).toBe("REFERENCE_VS_TEAM");
  });

  it("was built without candidate output", () => {
    expect(A("historical-trait-registry").data.builtFrom).toMatch(/No Candidate 0 output/);
  });
});

describe("metric dependency graph", () => {
  it("flags the mirror PPP identity and rejects the V3 rubric", async () => {
    const d = A("metric-dependency-graph").data;
    const g = d.dependencyGroups.find((x) => x.id === "MIRROR_PPP");
    expect(g.members).toEqual(["pppVsReference", "refPppVsTeam"]);
    expect(g.kind).toBe("ALGEBRAIC_IDENTITY_ON_MIRROR");
    expect(d.v3RubricRejection.problems.length).toBeGreaterThanOrEqual(3);
    expect(d.v3RubricRejection.problems.join(" ")).toMatch(/the exact V3 defect/);
  });

  it("hard-fails contradictory dependent criteria", async () => {
    const { detectContradictions } = await import("../scripts/validation/traitRegistry.mjs");
    // same metric both directions
    expect(detectContradictions([
      { traitId: "a", metric: "gamePace", direction: "ABOVE_REFERENCE_BASELINE", surface: "VS_ERA_REFERENCE" },
      { traitId: "b", metric: "gamePace", direction: "BELOW_REFERENCE_BASELINE", surface: "VS_ERA_REFERENCE" },
    ]).join(" ")).toMatch(/contradictory directions/);
    // complementary shot mix both ABOVE
    expect(detectContradictions([
      { traitId: "a", metric: "threeShare", direction: "ABOVE_REFERENCE_BASELINE", surface: "VS_ERA_REFERENCE" },
      { traitId: "b", metric: "interiorShotShare", direction: "ABOVE_REFERENCE_BASELINE", surface: "VS_ERA_REFERENCE" },
    ]).join(" ")).toMatch(/near-complementary/);
    // a clean rubric passes
    expect(detectContradictions([
      { traitId: "a", metric: "pppVsReference", direction: "ABOVE_REFERENCE_BASELINE", surface: "VS_ERA_REFERENCE" },
      { traitId: "b", metric: "refPppVsTeam", direction: "BELOW_REFERENCE_BASELINE", surface: "REFERENCE_VS_TEAM" },
    ])).toEqual([]);
  });

  it("keeps every scored metric identifiable only on declared surfaces", async () => {
    const { METRICS } = await import("../scripts/validation/surface.mjs");
    expect(METRICS.pppVsReference.identifiableOn).toEqual(["VS_ERA_REFERENCE"]);
    expect(METRICS.refPppVsTeam.identifiableOn).toEqual(["REFERENCE_VS_TEAM"]);
    expect(METRICS.gamePace.identifiableOn).toEqual(["VS_ERA_REFERENCE"]);
    for (const [id, m] of Object.entries(METRICS)) {
      expect(m.identifiableOn.length, id).toBeGreaterThan(0);
    }
  });

  it("scoredTraits ∩ unobservableTraits = empty, as a set operation", () => {
    const rows = A("trait-metric-observability").data.rows;
    const scored = new Set(rows.filter((r) => r.scoringEligibility).map((r) => r.traitId));
    const unobservable = new Set(rows.filter((r) => r.observabilityClass === "UNOBSERVABLE_ON_THIS_SURFACE").map((r) => r.traitId));
    expect([...scored].filter((t) => unobservable.has(t))).toEqual([]);
  });
});

// ── V4 run and replacement verdict ──────────────────────────────────────────
describe("Historical Holdout V4 run", () => {
  const v4 = () => A("historical-holdout-v4-results").data;

  it("was opened exactly once, attributably, and completed", () => {
    expect(setAccessCount("historical-holdout-v4")).toBe(1);
    expect(v4().accessCountBefore).toBe(0);
    expect(v4().accessCountAfter).toBe(1);
    expect(v4().runStatus).toBe("COMPLETE");
    expect(v4().accessEvent.actor).toMatch(/Phase 6C3R/);
  });

  it("evaluated 8 matchups, 8 eras, at the frozen volume", () => {
    expect(v4().matchupsEvaluated).toBe(8);
    expect(v4().erasCovered.length).toBe(8);
    expect(v4().totalGames).toBe(98304);
  });

  it("ran the frozen identity", () => {
    const id = v4().identity;
    const policy = A("historical-holdout-v4-policy").data;
    expect(id.coreHash).toBe(policy.hashes.candidateCoreHash);
    expect(id.parameterSetHash).toBe(policy.hashes.parameterSetHash);
    expect(id.policyHash).toBe(policy.policyHash);
    expect(id.holdoutManifestHash).toBe(policy.hashes.holdoutManifestHash);
    expect(id.calibrationVersion).toBe("1.0.0");
  });

  it("passed the numeric generalisation gate decisively", () => {
    const n = v4().numeric;
    expect(n.ratio).toBeLessThan(1.5);
    expect(n.ratio).toBeLessThan(1.0);
    expect(n.catastrophicTeams).toEqual([]);
    expect(v4().gates.compositeRatioWithinPolicy).toBe(true);
  });

  it("passed every structural gate", () => {
    const g = v4().gates;
    for (const k of ["everyMatchupExecuted", "zeroInvariantFailures", "zeroFinalTies", "zeroImpossibleScores",
      "zeroPreThreeEraThreePointAttempts", "replayExactEverywhere"]) expect(g[k], k).toBe(true);
  });

  it("reports its FAIL honestly on the trait gates", () => {
    expect(v4().verdict).toBe("HISTORICAL_HOLDOUT_V4_FAIL");
    expect(v4().gates.zeroTraitHardFails).toBe(false);
    expect(v4().traits.hardFails.length).toBeGreaterThan(0);
    expect(v4().gates.traitPassRateMet).toBe(true);
  });

  it("scored no unobservable or uncertified trait", async () => {
    const eligible = new Set(A("observability-control-results").data.finalTraitEligibility
      .filter((t) => t.scoringEligibility).map((t) => t.traitId));
    for (const r of v4().results) for (const team of [r.teamA, r.teamB]) {
      for (const t of team.traits) expect(eligible.has(t.traitId), t.traitId).toBe(true);
      for (const t of team.traits) expect(["VS_ERA_REFERENCE", "REFERENCE_VS_TEAM"]).toContain(t.surface);
    }
  });

  it("used sixteen distinct, previously unseen team-seasons", async () => {
    const m = A("historical-holdout-v4-manifest").data;
    expect(m.teamCount).toBe(16);
    expect(m.distinctLineups).toBe(16);
    const { readFileSync } = await import("node:fs");
    const v3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
    const used = new Set(v3.fixtures.map((f) => `${f.teamName}|${f.season}`));
    for (const x of m.matchups) for (const t of [x.teamA, x.teamB]) {
      expect(used.has(`${t.teamName}|${t.season}`), `${t.teamName} ${t.season}`).toBe(false);
    }
  });
});

describe("replacement formal verdict", () => {
  const verdict = () => A("replacement-formal-verdict").data;

  it("is HISTORICAL_V4_FAILED with HOLDOUT_FAILED status", () => {
    expect(verdict().combinedVerdict).toBe("HISTORICAL_V4_FAILED");
    expect(verdict().calibrationStatusAfterVerdict).toBe("HOLDOUT_FAILED");
    expect(verdict().possessionCalibrationVersion).toBe("1.0.0");
  });

  it("preserves V3 while superseding it as the valid attempt", () => {
    expect(verdict().historicalV3.verdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(verdict().historicalV3.preserved).toBe(true);
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
  });

  it("kept the synthetic holdout sealed after the failure", () => {
    expect(verdict().syntheticHoldoutV2.verdict).toBe("NOT_OPENED");
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
  });

  it("proves no post-holdout tuning, live", () => {
    const c = verdict().candidateImmutability;
    expect(c.coreUnchanged).toBe(true);
    expect(c.parameterUnchanged).toBe(true);
    expect(c.postHoldoutTuning).toBe("NONE");
    // The V4 verdict recorded the hash that RAN; the live core is either that
    // hash or an attributable successor. "Tuning" means changing the candidate
    // that was judged — a successor candidate is a new candidate, not tuning.
    assertCoreHashLineage(c.coreHashAtV4, buildCoreManifest().aggregateCoreHash, "V4 verdict core");
    const def = defaultRuntimeParameterSet();
    for (const p of activeParameters()) expect(def.values[p.id]).toBe(p.defaultValue);
  });

  it("separates substantive findings from margin artifacts without rescoring", () => {
    const d = verdict().diagnosis;
    expect(d.substantiveCount).toBeGreaterThan(0);
    expect(d.substantiveCount + d.marginalCount).toBe(12);
    expect(d.wouldTheVerdictChangeWithPracticalMargins).toBe(false);
    expect(d.marginalReading).toMatch(/NOT used to re-score/);
  });

  it("prepared no preview package after the failure", () => {
    expect(existsSync("data/validation/6c3r/replacement-preview-package.json")).toBe(false);
    expect(verdict().consequences.join(" ")).toMatch(/No preview package/);
  });

  it("records the invalid-run recovery as one access event, not two attempts", () => {
    expect(verdict().historicalV4.invalidRunRecovery).toMatch(/RESUMED under the same event/);
    expect(setAccessCount("historical-holdout-v4")).toBe(1);
  });
});

describe("attempt registry, final", () => {
  it("lists all three attempts with correct verdicts", () => {
    const r = A("formal-validation-attempts").data;
    const byId = Object.fromEntries(r.attempts.map((a) => [a.attemptId, a]));
    expect(byId["attempt-1-historical-v3"].formalVerdict).toBe("HISTORICAL_HOLDOUT_FAIL");
    expect(byId["attempt-2-historical-v4"].formalVerdict).toBe("HISTORICAL_HOLDOUT_V4_FAIL");
    expect(byId["synthetic-v2"].formalVerdict).toBe("NOT_OPENED");
    expect(r.replacementValidationStatus).toBe("FAILED");
    expect(r.candidateStatus.candidateLockStatus).toBe("LOCKED");
    expect(r.candidateStatus.parameterChanges).toBe(0);
  });
});
