// ── Phase 6C4B2R: formal two-stage execution ────────────────────────────────
// The load-bearing assertions are the ones that prove restraint: Synthetic V2
// is still sealed, no preview package exists, no validated status is claimed,
// and Candidate 1 is byte-identical to the record taken before the seal opened.
import { describe, it, expect } from "vitest";
import { activeLockVersion } from "./helpers/candidateLineage.js";
import { existsSync, readFileSync } from "node:fs";
import { readArtifact, artifactExists } from "../src/v3/calibration/artifacts.js";
import { setAccessCount, SEALED_SETS } from "../src/v3/calibration/holdoutSeal.js";
import { defaultRuntimeParameterSet, activeParameters } from "../src/v3/calibration/runtimeParameters.js";
import { versionOf } from "../src/versions.js";
import { assertSealDiscipline } from "./helpers/sealDiscipline.js";
import { COMPOUND_VERDICTS } from "../scripts/validation/candidate1FormalVerdict.mjs";

const DIR = "data/validation/6c4b2r";
const B1 = "data/validation/6c4b1";
const B1S = "data/validation/6c4b1s";
const R = (n) => readArtifact(n, DIR);
const V5 = "historical-holdout-v5";
const SYN = "synthetic-stress-holdout-v2";

describe("6C4B2R — stage one opened exactly once", () => {
  it("keeps every seal at its attributable count", () => assertSealDiscipline());

  it("has Historical V5 at access one with exactly one access event", () => {
    expect(setAccessCount(V5)).toBe(1);
    const log = readFileSync(SEALED_SETS[V5], "utf8").trim().split("\n").filter(Boolean);
    expect(log).toHaveLength(1);
    const ev = R("historical-v5-access-event").data;
    expect(ev.accessCountBefore).toBe(0);
    expect(ev.accessCountAfter).toBe(1);
    expect(ev.accessEventCount).toBe(1);
  });

  it("completed all eight matchups under that one event, with no resume", () => {
    const run = R("historical-v5-formal-run").data;
    expect(run.runStatus).toBe("COMPLETE");
    expect(run.memberCount).toBe(8);
    expect(run.membersCompleted).toHaveLength(8);
    expect(run.interruptions).toBe(0);
    expect(run.resumes).toBe(0);
    expect(run.runHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("scored the candidate the authorization named", () => {
    const auth = R("formal-execution-authorization").data;
    const r = R("historical-v5-formal-results").data;
    expect(r.identity.coreHash).toBe(auth.candidateCoreHash);
    expect(r.identity.parameterSetHash).toBe(auth.parameterSetHash);
  });

  it("refuses a second independent run", () => {
    // the seal is already at 1; the transactional runner's contract is that a
    // fresh run against an opened set is refused rather than starting a second
    const runner = readFileSync("scripts/validation/runner.mjs", "utf8");
    expect(runner).toContain("SECOND_RUN_REFUSED");
    expect(runner).toContain("A sealed set is opened ONCE");
    expect(setAccessCount(V5)).toBe(1);
  });
});

describe("6C4B2R — stage two was NOT opened", () => {
  it("leaves Synthetic V2 sealed and unread at access zero", () => {
    expect(setAccessCount(SYN)).toBe(0);
    expect(existsSync(SEALED_SETS[SYN]), "no synthetic access log may exist").toBe(false);
  });

  it("creates no synthetic formal artifact of any kind", () => {
    for (const n of ["synthetic-v2-access-event", "synthetic-v2-formal-run",
      "synthetic-v2-fixture-results", "synthetic-v2-formal-results", "synthetic-v2-formal-verdict"]) {
      expect(artifactExists(n, DIR), `${n} presupposes an opened set`).toBe(false);
    }
    expect(artifactExists("synthetic-v2-results", B1S)).toBe(false);
    expect(existsSync(`${B1S}/synthetic-v2-run.json`)).toBe(false);
  });

  it("states why it was not opened, rather than leaving it unexplained", () => {
    const st = R("candidate1-formal-status").data;
    const stage2 = st.stages.find((s) => s.stage === 2);
    expect(stage2.opened).toBe(false);
    expect(stage2.whyNotOpened).toMatch(/FAIL/);
    expect(stage2.whyNotOpened).toMatch(/one-shot|stage order|stage-one/i);
  });

  it("keeps the stage-two package intact and unconsumed", () => {
    expect(readArtifact("synthetic-v2-formal-policy", B1S).data.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(R("phase6c4b2r-final-summary").data.stages.stage2.packageStillIntact).toBe(true);
  });
});

describe("6C4B2R — the Historical V5 verdict", () => {
  const r = () => R("historical-v5-formal-results").data;
  const vd = () => R("historical-v5-formal-verdict").data;

  it("is one of the three allowed verdicts", () => {
    expect(vd().allowedVerdicts).toContain(vd().verdict);
    expect(vd().allowedVerdicts).toHaveLength(3);
  });

  it("failed on exactly the frozen gate that failed, and no other", () => {
    expect(vd().verdict).toBe("HISTORICAL_HOLDOUT_V5_FAIL");
    expect(vd().gatesFailed).toEqual(["zeroTraitHardFails"]);
    expect(vd().gatesPassed.length).toBe(10);
  });

  it("is a FAIL rather than an INVALID_RUN, because the apparatus worked", () => {
    const g = r().gates;
    expect(g.everyMatchupExecuted).toBe(true);
    expect(g.zeroInvariantFailures).toBe(true);
    expect(g.zeroFinalTies).toBe(true);
    expect(g.zeroImpossibleScores).toBe(true);
    expect(g.replayExactEverywhere).toBe(true);
    expect(r().outcome).toBe("FAIL");
  });

  it("passed the numeric gate with the holdout below its internal baseline", () => {
    const n = r().numeric;
    expect(n.ratio).toBeLessThanOrEqual(n.ratioGate);
    expect(n.holdoutComposite).toBeLessThan(n.internalBaselineMean);
    expect(n.catastrophicTeams).toEqual([]);
  });

  it("met the trait pass-rate gate and still failed on hard failures", () => {
    expect(r().traits.passRate).toBeGreaterThanOrEqual(r().traits.minPassRate);
    expect(r().hardFailureCount).toBeGreaterThan(0);
  });

  it("admits every hard failure clears both halves of the dual gate", () => {
    for (const h of r().hardFailures) {
      expect(h.beyondPracticalMargin, `${h.traitId} on ${h.team}`).toBe(true);
      expect(h.statisticallyOpposite, `${h.traitId} on ${h.team}`).toBe(true);
      expect(Math.abs(h.diff)).toBeGreaterThan(h.practicalMargin);
    }
  });

  it("keeps every soft failure inside its practical margin, deciding nothing", () => {
    for (const s of r().softFailures) {
      expect(s.beyondPracticalMargin, `${s.traitId}`).toBe(false);
      expect(Math.abs(s.diff)).toBeLessThanOrEqual(s.practicalMargin);
    }
    expect(r().softFailureCount + r().hardFailureCount).toBe(r().traits.failed);
  });

  it("does not overstate the independent evidence", () => {
    // two trait names share one metric, surface and team, so three instances
    // are two measurements — and the artifact says so rather than reporting three
    expect(r().distinctHardFailMeasurements).toBeLessThanOrEqual(r().hardFailureCount);
    if (r().distinctHardFailMeasurements < r().hardFailureCount) {
      expect(r().hardFailureNote).toMatch(/distinct measurements/);
    }
  });

  it("excluded unobservable metrics without converting any to zero", () => {
    expect(r().traits.notScoredUnobservable).toBeGreaterThan(0);
    expect(r().excludedFromScoring.note).toMatch(/never converted to zero|None was converted to zero/i);
  });

  it("recomputed nothing", () => {
    expect(r().recomputed).toBe(false);
    expect(R("historical-v5-fixture-results").data.recomputed).toBe(false);
  });
});

describe("6C4B2R — the compound verdict", () => {
  const c = () => JSON.parse(readFileSync(`${B1S}/candidate1-compound-formal-verdict.json`, "utf8")).data;

  it("is drawn from the closed vocabulary", () => {
    expect(Object.keys(COMPOUND_VERDICTS)).toContain(c().compoundVerdict);
  });

  it("names the stage that decided it", () => {
    expect(c().compoundVerdict).toBe("CANDIDATE1_HISTORICAL_V5_FAILED");
  });

  it("does not report a decisive stage-one failure as merely incomplete", () => {
    // the earlier mapping collapsed this case into INCOMPLETE
    expect(c().compoundVerdict).not.toMatch(/INCOMPLETE|NOT_YET_DETERMINED/);
    expect(c().meaning).toMatch(/correctly never opened|decided by stage one/);
  });

  it("opened no seal and simulated no game", () => {
    expect(c().sealsOpenedByThisCommand).toBe(0);
    expect(c().reScoring).toMatch(/^none/);
    expect(c().accessCounts[V5]).toBe(1);
    expect(c().accessCounts[SYN]).toBe(0);
  });

  it("requires both stages to pass for a validated verdict", () => {
    expect(c().validatedRequires).toContain("Historical V5 PASS");
    expect(c().validatedRequires).toContain("Synthetic V2 PASS");
  });
});

describe("6C4B2R — Candidate 1 was not changed or unlocked", () => {
  const st = () => R("candidate1-formal-status").data;

  it("remains SELECTED and LOCKED at calibration 1.1.0", () => {
    expect(st().candidateSelectionStatus).toBe("SELECTED");
    expect(st().candidateLockStatus).toBe("LOCKED");
    expect(st().possessionCalibrationVersion).toBe("1.1.0");
    // The registry tracks the ACTIVE candidate, not this one — this phase executed V5 against Candidate 1.
    // A literal here had to be edited at every generation; the active lock
    // says the same thing and keeps saying it.
    expect(versionOf("possessionCalibrationVersion")).toBe(activeLockVersion());
  });

  it("did not bump the calibration version for a status transition", () => {
    const lock = readArtifact("candidate1-lock-recertification", B1).data;
    expect(st().possessionCalibrationVersion).toBe(lock.possessionCalibrationVersion);
  });

  it("is byte-identical to the pre-access preflight", () => {
    const pf = R("phase6c4b2r-preflight").data;
    const def = defaultRuntimeParameterSet();
    expect(st().coreHash).toBe(pf.candidate.coreHash);
    expect(st().parameterSetHash).toBe(pf.candidate.parameterSetHash);
    expect(def.parameterSetHash).toBe(pf.candidate.parameterSetHash);
    expect(activeParameters().every((p) => def.values[p.id] === p.defaultValue)).toBe(true);
  });

  it("reports zero drift on every axis", () => {
    const d = st().noTuning;
    for (const k of ["coreDrift", "parameterDrift", "policyDrift", "seedDrift", "targetDrift", "postHoldoutTuning"]) {
      expect(d[k], k).toBe(0);
    }
  });

  it("does not claim HOLDOUT_VALIDATED anywhere", () => {
    expect(st().formalValidationStatus).toBe("HISTORICAL_HOLDOUT_V5_FAILED");
    expect(st().calibrationStatus).toBe("DEVELOPMENT_LOCKED_SCOPED");
    expect(st().statusesNotClaimed.notClaimed).toContain("HOLDOUT_VALIDATED");
    expect(st().statusesNotClaimed.notClaimed).toContain("PRODUCTION_READY");
  });
});

describe("6C4B2R — prior attempts are immutable", () => {
  const at = () => R("formal-validation-attempts").data;

  it("keeps Historical V3 and V4 consumed at access one with their failure classes", () => {
    expect(setAccessCount("historical-holdout-v3")).toBe(1);
    expect(setAccessCount("historical-holdout-v4")).toBe(1);
    const c0 = at().attempts.filter((a) => a.candidateId === "Candidate 0");
    expect(c0).toHaveLength(2);
    for (const a of c0) {
      expect(a.formalVerdict).toBe("FAIL");
      expect(a.accessCount).toBe(1);
      expect(a.immutable).toBe(true);
    }
    expect(c0.map((a) => a.failureClass)).toContain("NONIDENTIFIABLE_MEASUREMENT_SURFACE");
    expect(c0.map((a) => a.failureClass)).toContain("OBSERVABLE_HISTORICAL_TRAIT_FIDELITY_FAILURE");
  });

  it("copied the Candidate 0 rows forward verbatim", () => {
    expect(at().priorVerdictsUnchanged).toBe(true);
    const prior = readArtifact("formal-validation-attempts", "data/validation/6c4b2").data;
    const before = prior.attempts.filter((a) => a.candidateId === "Candidate 0");
    const after = at().attempts.filter((a) => a.candidateId === "Candidate 0");
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("records four attempts, two consumed by Candidate 0 and one by Candidate 1", () => {
    expect(at().attemptCount).toBe(4);
    const opened = at().attempts.filter((a) => a.accessCount > 0);
    expect(opened).toHaveLength(3);
    expect(at().notOpenedHoldouts).toEqual([SYN]);
  });
});

describe("6C4B2R — no preview and no production change", () => {
  it("prepared no preview package", () => {
    expect(artifactExists("candidate1-protected-preview-package", DIR)).toBe(false);
    expect(R("candidate1-formal-status").data.previewStatus).toBe("NOT_ELIGIBLE");
  });

  it("executed no deployment of any kind", () => {
    const s = R("phase6c4b2r-final-summary").data;
    expect(s.preview.deploymentCommandsExecuted).toBe(0);
    expect(s.preview.flagsChanged).toBe(0);
    expect(s.preview.environmentVariablesChanged).toBe(0);
    expect(s.production.previewDeployments).toBe(0);
    expect(s.production.productionDeployments).toBe(0);
    expect(s.production.mergedToMain).toBe(false);
  });

  it("left main at the production commit", () => {
    const s = R("phase6c4b2r-final-summary").data;
    expect(s.production.mainCommit).toBe("9cd95ff8797f8cdef252bbe67d63158c01b9f9bd");
    expect(s.production.unchanged).toBe(true);
  });
});

describe("6C4B2R — the report agrees with the artifacts", () => {
  it("renders the verdict, totals and every hard failure from the artifact", () => {
    const doc = readFileSync("docs/simulation-v3/historical-v5-formal-validation.md", "utf8");
    const r = R("historical-v5-formal-results").data;
    expect(doc).toContain(r.verdict);
    expect(doc).toContain(r.totalGames.toLocaleString());
    expect(doc).toContain(String(r.numeric.ratio));
    expect(doc).toContain(String(r.traits.passRate));
    for (const h of r.hardFailures) expect(doc, h.traitId).toContain(String(h.diff));
  });

  it("states plainly that the synthetic stage was not opened", () => {
    const doc = readFileSync("docs/simulation-v3/synthetic-v2-formal-validation.md", "utf8");
    expect(doc).toMatch(/not opened/i);
    expect(doc).toContain("SEALED_UNREAD");
  });

  it("carries a limitations document that scopes what was not established", () => {
    const doc = readFileSync("docs/simulation-v3/phase-6c4b2r-limitations.md", "utf8");
    expect(doc).toMatch(/Nothing about the synthetic stress axis/);
    expect(doc).toMatch(/Nothing about production/);
    expect(doc).toMatch(/unobservable/);
  });

  it("has a final summary whose answer matches the compound verdict", () => {
    const s = R("phase6c4b2r-final-summary").data;
    const c = JSON.parse(readFileSync(`${B1S}/candidate1-compound-formal-verdict.json`, "utf8")).data;
    expect(s.compoundVerdict).toBe(c.compoundVerdict);
    expect(s.finalVerdict).toBe("HISTORICAL V5 FAILED — CANDIDATE 1 REVALIDATION FAILED");
    expect(s.answer).toMatch(/^No\./);
  });
});
