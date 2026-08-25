import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { loadBaseline, captureBaseline, diffBaseline, hashBaseline, usageEntropy, BASELINE_PATH } from "../scripts/calibration/freeze-structural.mjs";
import { calibrationFixtures } from "../data/calibration/split.mjs";

describe("pre-6C2A structural baseline", () => {
  const frozen = loadBaseline();

  it("exists and is committed", () => {
    expect(existsSync(BASELINE_PATH), "the before half of every before/after is missing").toBe(true);
    expect(frozen).toBeTruthy();
  });

  it("covers every calibration fixture", () => {
    expect(frozen.fixtures).toHaveLength(calibrationFixtures().length);
    for (const f of calibrationFixtures()) {
      expect(frozen.fixtures.find((x) => x.fixtureId === f.fixtureId), `${f.fixtureId} missing`).toBeTruthy();
    }
  });

  it("is not silently regenerated", () => {
    // The whole value of a baseline is that it stops moving. Regenerating it
    // must be a deliberate act (--write) that prints an explicit before/after,
    // not something a test run does quietly on the way past.
    const fresh = captureBaseline({ sims: frozen.sims });
    const drift = diffBaseline(frozen, fresh);
    expect(drift, `structural drift in ${drift.length} field(s):\n${drift.slice(0, 15).map((d) => `  ${d.path}: ${d.before} -> ${d.after}`).join("\n")}`).toEqual([]);
    expect(hashBaseline(fresh)).toBe(hashBaseline(frozen));
  });

  it("records the module versions it was captured under", () => {
    // A baseline whose engine version is unknown cannot anchor anything.
    for (const d of ["possessionEngineVersion", "actionLibraryVersion", "defensiveMatchupVersion", "benchmarkSeedSetVersion"]) {
      expect(frozen.versions[d], d).toBeTruthy();
    }
    expect(frozen.calibrationManifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not claim historical correctness", () => {
    // It freezes known defects on purpose. Saying otherwise would turn a
    // measurement of a bug into an assertion that the bug is right.
    expect(frozen.purpose).toMatch(/NOT a claim of historical correctness/);
  });

  it("captures the concentration defect this phase exists to fix", () => {
    // These assertions describe the BROKEN state deliberately. When Phase 6C2A
    // fixes allocation they are expected to fail, and the fix must rewrite the
    // baseline with an explicit before/after rather than loosen them.
    expect(frozen.rollup.leadingShareMean).toBeGreaterThan(0.35);
    expect(frozen.rollup.leadingShareMax).toBeGreaterThan(0.6);
    expect(frozen.rollup.totalInvariantViolations, "conservation was never the problem").toBe(0);
  });

  it("computes usage entropy correctly", () => {
    // Five equal shares is the maximum spread; one player taking everything is
    // zero. A single number that separates a shared offence from a carried one.
    expect(usageEntropy([0.2, 0.2, 0.2, 0.2, 0.2])).toBeCloseTo(Math.log2(5), 6);
    expect(usageEntropy([1, 0, 0, 0, 0])).toBeCloseTo(0, 6);
    expect(usageEntropy([0.6, 0.1, 0.1, 0.1, 0.1])).toBeLessThan(Math.log2(5));
    expect(usageEntropy([])).toBe(0);
    expect(frozen.rollup.entropyMean).toBeLessThan(Math.log2(5));
  });
});
