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
