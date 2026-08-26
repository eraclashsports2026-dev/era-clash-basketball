// ── Phase 6C4A: Candidate 1 trait-fidelity repair — preservation & register ──
// Grows through the phase. Part 1 locks what the phase must never disturb:
// Candidate 0's identity, both FAIL verdicts, the synthetic seal, and the
// machine-generated V4 failure register the repairs are driven by.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { readArtifact, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
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
