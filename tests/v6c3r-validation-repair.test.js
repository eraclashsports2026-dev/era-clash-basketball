import { describe, it, expect } from "vitest";
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

  it("starts the replacement attempt as PENDING with synthetic V2 sealed", () => {
    const r = A("formal-validation-attempts").data;
    expect(r.replacementValidationStatus).toBe("PENDING");
    expect(r.syntheticHoldoutV2Status).toBe("SEALED_UNREAD");
  });
});

describe("candidate immutability through this phase", () => {
  it("keeps the core hash byte-identical to both prior holdout records", () => {
    const live = buildCoreManifest().aggregateCoreHash;
    expect(live).toBe(V3("candidate-core-manifest").data.aggregateCoreHash);
    expect(live).toBe(V3("historical-holdout-results").data.identity.coreHash);
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
  it("is registered with its own log, unread, independent of V3", () => {
    expect(SEALED_SETS["historical-holdout-v4"]).toBe("data/calibration/historical-holdout-v4-access-log.jsonl");
    expect(setAccessCount("historical-holdout-v4")).toBe(0);
    expect(existsSync("data/calibration/historical-holdout-v4-access-log.jsonl")).toBe(false);
    // registering v4 must not have touched v3's log
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
  });

  it("reports v4 in the combined seal status", () => {
    const all = allSealStatuses();
    expect(all["historical-holdout-v4"].status).toBe("SEALED_UNREAD");
    expect(all["historical-holdout-v4"].accessCount).toBe(0);
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
