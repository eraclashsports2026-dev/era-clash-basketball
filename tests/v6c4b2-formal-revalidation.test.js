// ── Phase 6C4B2: formal revalidation, blocked before access ─────────────────
// The most important assertions in this file are the ones that prove nothing
// happened: both holdouts are still sealed at zero, and no formal result
// artifact exists to be mistaken for a verdict.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { readArtifact, artifactExists, ARTIFACT_DIR_C6 } from "../src/v3/calibration/artifacts.js";
import { setAccessCount, SEALED_SETS } from "../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { HOLDOUT } from "../src/v3/calibration/acceptancePolicy.js";
import { versionOf } from "../src/versions.js";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";

const DIR = "data/validation/6c4b2";
const B1 = "data/validation/6c4b1";
const R = (n) => readArtifact(n, DIR);
const RB1 = (n) => readArtifact(n, B1);

describe("6C4B2 — nothing was opened", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("leaves Historical V5 sealed and unread at access zero", () => {
    expect(setAccessCount("historical-holdout-v5")).toBe(0);
    expect(existsSync(SEALED_SETS["historical-holdout-v5"]), "no V5 access log may exist").toBe(false);
    expect(RB1("historical-holdout-v5-seal").data.state).toBe("SEALED_UNREAD");
  });

  it("leaves Synthetic Stress Holdout V2 sealed and unread at access zero", () => {
    expect(setAccessCount("synthetic-stress-holdout-v2")).toBe(0);
    expect(existsSync(SEALED_SETS["synthetic-stress-holdout-v2"])).toBe(false);
  });

  it("creates no formal result, run, access-event or verdict artifact", () => {
    for (const n of ["historical-v5-access-event", "historical-v5-formal-run", "historical-v5-fixture-results",
      "historical-v5-formal-results", "historical-v5-formal-verdict",
      "synthetic-v2-access-event", "synthetic-v2-formal-run", "synthetic-v2-fixture-results",
      "synthetic-v2-formal-results", "synthetic-v2-formal-verdict",
      "candidate1-formal-holdout-verdict", "candidate1-formal-status", "candidate1-protected-preview-package"]) {
      expect(artifactExists(n, DIR), `${n} must not exist`).toBe(false);
    }
  });

  it("records zero executions of every prepared command", () => {
    const s = R("phase6c4b2-final-summary").data;
    expect(s.commandsExecuted).toEqual({ historicalV5: 0, syntheticV2: 0, formalVerdict: 0, previewDeployment: 0 });
    expect(R("synthetic-v2-package-blocker").data.holdoutsOpenedInThisPhase).toEqual({ historicalV5: 0, syntheticV2: 0 });
  });

  it("asserts no verdict about Candidate 1's generalisation", () => {
    const s = R("phase6c4b2-final-summary").data;
    expect(s.historicalV5.formalVerdict).toBe("NOT_OPENED");
    expect(s.syntheticV2.formalVerdict).toBe("NOT_OPENED");
    for (const claim of s.claimsNotMade) expect(claim.length).toBeGreaterThan(10);
    expect(s.claimsNotMade.join(" ")).toContain("HOLDOUT_VALIDATED");
    expect(versionOf("possessionCalibrationVersion")).toBe("1.1.0");
    expect(RB1("candidate1-lock-recertification").data.calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(RB1("candidate1-lock-recertification").data.validationAttemptStatus).toBe("NOT_RUN");
  });
});

describe("6C4B2 — what the preflight verified before stopping", () => {
  const p = R("phase6c4b2-preflight").data;

  it("verified Candidate 1's lock, core, parameters and replay", () => {
    expect(p.candidate1LockValid).toBe(true);
    expect(p.candidate1CoreStable).toBe(true);
    expect(p.candidate1ReplayValid).toBe(true);
    expect(p.candidate.lockRevision).toBe(2);
    expect(p.candidate.coreHash).toBe(RB1("candidate1-lock-recertification").data.coreHash);
    expect(p.candidate.parameterSetHash).toBe(defaultRuntimeParameterSet().parameterSetHash);
    for (const q of activeParameters()) expect(defaultRuntimeParameterSet().values[q.id], q.id).toBe(q.defaultValue);
  });

  it("verified the entire Historical V5 package as valid", () => {
    expect(p.historicalV5PackageValid).toBe(true);
    expect(p.historicalV5.hashMismatches).toEqual([]);
    expect(Object.keys(p.historicalV5.boundHashes).length).toBeGreaterThanOrEqual(10);
    for (const [k, v] of Object.entries(p.historicalV5.boundHashes)) expect(v, k).toMatch(/^[0-9a-f]{64}$/);
    expect(p.historicalV5.dryRunChecks).toBeGreaterThanOrEqual(30);
  });

  it("preserved Candidate 0 and both consumed holdouts", () => {
    expect(p.candidate0Preserved).toBe(true);
    expect(p.historicalV3Preserved).toBe(true);
    expect(p.historicalV4Preserved).toBe(true);
    expect(p.priorHoldouts.historicalHoldoutV3).toMatchObject({ accessCount: 1, verdict: "FAIL", candidate: "Candidate 0" });
    expect(p.priorHoldouts.historicalHoldoutV4).toMatchObject({ accessCount: 1, verdict: "FAIL", candidate: "Candidate 0" });
    const c0 = readArtifact("baseline-candidate-lock", ARTIFACT_DIR_C6).data;
    expect(c0.possessionCalibrationVersion).toBe("1.0.0");
    expect(c0.candidateLockStatus).toBe("LOCKED");
  });

  it("refuses formal execution and says why", () => {
    expect(p.formalExecutionMayBegin).toBe(false);
    expect(p.gatesFailed).toEqual(["syntheticV2PackageCompatible"]);
    expect(p.blockers).toHaveLength(1);
    expect(p.blockers[0].blockerId).toBe("SYNTHETIC_V2_PACKAGE_INCOMPLETE");
    expect(p.blockers[0].detectedBefore).toBe("any holdout access");
  });
});

describe("6C4B2 — the second-stage blocker", () => {
  const b = R("synthetic-v2-package-blocker").data;

  it("was detected before any holdout access", () => {
    expect(b.detectedBeforeAnyHoldoutAccess).toBe(true);
    expect(b.severity).toContain("BLOCKS_FORMAL_EXECUTION");
  });

  it("distinguishes what the second stage has from what it lacks", () => {
    // present: fixtures, a frozen guardrail policy, a live seal
    expect(b.frozenAndPresent.fixtures.count).toBe(16);
    expect(b.frozenAndPresent.fixtures.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(b.frozenAndPresent.guardrailPolicy.guardrails).length).toBeGreaterThanOrEqual(10);
    expect(b.frozenAndPresent.seal.accessCount).toBe(0);
    // missing: everything needed to execute
    for (const k of ["seedSet", "aggregationRule", "runner", "dryRun"]) {
      expect(b.missing[k], k).toBeTruthy();
      expect(b.missing[k].length, k).toBeGreaterThan(40);
    }
  });

  it("confirms the guardrail policy really is frozen and live", () => {
    // the blocker is about executability, not about a missing policy
    expect(HOLDOUT.syntheticGuardrails.requireZeroInvariantFailures).toBe(true);
    expect(HOLDOUT.syntheticGuardrails.maxSingleActionFamilyShare).toBeGreaterThan(0);
    expect(HOLDOUT.minGamesPerHoldoutFixture).toBeGreaterThan(0);
  });

  it("proves the prepared synthetic command cannot resolve", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["validation:synthetic-v2"], "the B2 package named a script that does not exist").toBeUndefined();
    expect(Object.keys(pkg.scripts).filter((k) => /synthetic/i.test(k))).toEqual([]);
    expect(b.missing.preparedCommandResolvable).toContain("validation:synthetic-v2");
  });

  it("has no synthetic runner anywhere in the repository", () => {
    for (const p of ["scripts/validation/synthetic-stress-holdout-v2.mjs", "scripts/validation/synthetic-v2.mjs",
      "scripts/v6/synthetic-v2.mjs"]) {
      expect(existsSync(p), `${p} must not exist yet`).toBe(false);
    }
  });

  it("explains why V5 was not opened and why nothing was authored here", () => {
    expect(b.whyHistoricalV5WasNotOpened).toContain("Do not consume Historical V5");
    expect(b.whyNotBuiltInThisPhase).toContain("execution-only");
    expect(b.irreversibility).toContain("once");
  });

  it("names every artifact a preparation phase must produce, with a precedent", () => {
    expect(b.requiredToUnblock.length).toBeGreaterThanOrEqual(5);
    for (const r of b.requiredToUnblock) expect(r.length).toBeGreaterThan(40);
    for (const m of b.referenceImplementation.map) {
      expect(m.need).toBeTruthy();
      expect(m.precedent, m.need).toBeTruthy();
    }
  });

  it("leaves the Historical V5 package explicitly unaffected", () => {
    expect(b.unaffected.historicalV5Package).toContain("SEALED_UNREAD");
    expect(b.unaffected.priorVerdicts).toContain("CONSUMED");
    expect(b.unaffected.production).toContain("3.2.0");
  });
});

describe("6C4B2 — attempt registry", () => {
  const a = R("formal-validation-attempts").data;

  it("preserves both Candidate 0 failures verbatim", () => {
    const [a1, a2] = a.attempts;
    expect(a1).toMatchObject({ candidateId: "Candidate 0", holdoutId: "historical-holdout-v3",
      accessCount: 1, formalVerdict: "FAIL", failureClass: "NONIDENTIFIABLE_MEASUREMENT_SURFACE", immutable: true });
    expect(a2).toMatchObject({ candidateId: "Candidate 0", holdoutId: "historical-holdout-v4",
      accessCount: 1, formalVerdict: "FAIL", failureClass: "OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE", immutable: true });
    expect(a1.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a2.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.priorVerdictsUnchanged).toBe(true);
  });

  it("registers both Candidate 1 attempts as NOT_OPENED with the blocker", () => {
    const [, , a3, a4] = a.attempts;
    expect(a3).toMatchObject({ candidateId: "Candidate 1", holdoutId: "historical-holdout-v5",
      accessCount: 0, formalVerdict: "NOT_OPENED", runStatus: "NOT_STARTED", blockedBy: "SYNTHETIC_V2_PACKAGE_INCOMPLETE" });
    expect(a4).toMatchObject({ candidateId: "Candidate 1", holdoutId: "synthetic-stress-holdout-v2",
      accessCount: 0, formalVerdict: "NOT_OPENED", runStatus: "NOT_STARTED", blockedBy: "SYNTHETIC_V2_PACKAGE_INCOMPLETE" });
    expect(a3.verdictHash).toBeNull();
    expect(a4.policyHash, "no frozen synthetic policy hash exists to name").toBeNull();
    expect(a4.seedHash, "no frozen synthetic seed hash exists to name").toBeNull();
  });

  it("reconciles opened against not-opened", () => {
    expect(a.openedHoldouts).toEqual(["historical-holdout-v3", "historical-holdout-v4"]);
    expect(a.notOpenedHoldouts).toEqual(["historical-holdout-v5", "synthetic-stress-holdout-v2"]);
    expect(a.completedAttempts).toBe(2);
    expect(a.attemptCount).toBe(4);
    expect(a.candidate1FormalVerdictAvailable).toBe(false);
  });
});

describe("6C4B2 — phase discipline", () => {
  const s = R("phase6c4b2-final-summary").data;

  it("verifies every artifact it wrote", () => {
    expect(s.artifactsInvalid).toBe(0);
    expect(s.artifactsWritten).toBeGreaterThanOrEqual(3);
  });

  it("reaches the blocked outcome without asserting a holdout result", () => {
    expect(s.outcome).toBe("BLOCKED_BEFORE_ACCESS_SECOND_STAGE_PACKAGE_INCOMPLETE");
    expect(s.finalVerdict).toContain("NEITHER HOLDOUT OPENED");
    expect(s.notCreatedBecauseNoHoldoutOpened.length).toBeGreaterThanOrEqual(13);
  });

  it("respected every scope commitment", () => {
    for (const [k, v] of Object.entries(s.scopeRespected)) expect(v, k).toBe(true);
    expect(s.productionIsolation.engineVersion).toBe("3.2.0");
    expect(s.productionIsolation.appVersion).toBe("2.7.2");
    expect(s.productionIsolation.main).toBe("9cd95ff");
    expect(s.productionIsolation.previewDeployed).toBe(false);
    expect(s.productionIsolation.productionDeployed).toBe(false);
  });

  it("records limitations including the absence of any formal result", () => {
    const ids = s.limitations.map((l) => l.id);
    expect(ids).toContain("NO_FORMAL_CANDIDATE_1_RESULT");
    expect(ids).toContain("SECOND_STAGE_NEVER_PREPARED");
    for (const l of s.limitations) expect(l.detail.length).toBeGreaterThan(80);
  });

  it("renders every phase document from an artifact", () => {
    for (const doc of ["phase-6c4b2-preflight", "phase-6c4b2-limitations", "synthetic-v2-package-blocker"]) {
      const body = readFileSync(`docs/simulation-v3/${doc}.md`, "utf8");
      expect(body.startsWith("<!-- RENDERED FROM ARTIFACT"), `${doc} must be rendered`).toBe(true);
      expect(body, doc).toContain("outputHash:");
    }
  });
});
