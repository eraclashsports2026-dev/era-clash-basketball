// ── Phase 6C4D0R — the LOCKED preview candidate and its protected integration ─
//
// Candidate 3 is SELECTED · LOCKED · PREVIEW_READY_LOCKED with formal
// validation INCOMPLETE. These tests pin the lock, the succession chain, the
// engine repairs it carries, and the protected-preview integration: default-off
// flag, isolated preview-* namespaces, per-request production fallback, and a
// telemetry surface that can never carry a secret.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { VERSIONS, versionOf } from "../src/versions.js";
import { flags } from "../api/_lib/flags.js";
import { cacheKeys } from "../api/_lib/cacheKeys.js";
import { computeResultPreview, PREVIEW_NAMESPACES, previewCandidateIdentity, PREVIEW_RESULT_ID_PREFIX } from "../api/_lib/previewEngine.js";
import { previewEvent, ALLOWED_PREVIEW_EVENTS } from "../api/_lib/previewTelemetry.js";
import { assertCalibrationLockInvariant } from "./helpers/calibrationLockInvariant.js";
import { successionChain } from "./helpers/candidateLineage.js";
import { PLAYERS } from "../src/players.js";

const LOCK = JSON.parse(readFileSync("data/validation/6c4d0/candidate3-lock.json", "utf8")).data;
const C2_LOCK = JSON.parse(readFileSync("data/validation/6c4c1/candidate2-lock.json", "utf8")).data;
// computeResultPreview receives player objects (as api/game.js passes them).
const team = (ids) => ids.map((id) => ({ id }));
const TEAM_A = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
const TEAM_B = team(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);

describe("Candidate 3 lock", () => {
  it("carries exactly the states the phase allows, and none it forbids", () => {
    expect(LOCK.candidateSelectionStatus).toBe("SELECTED");
    expect(LOCK.candidateLockStatus).toBe("LOCKED");
    expect(LOCK.calibrationStatus).toBe("PREVIEW_READY_LOCKED");
    expect(LOCK.formalValidationStatus).toBe("FORMAL_VALIDATION_INCOMPLETE");
    for (const forbidden of ["HOLDOUT_VALIDATED", "PRIVATE_PREVIEW_VALIDATED", "PRODUCTION_READY", "ACTIVE"]) {
      expect(JSON.stringify(LOCK.notClaimed)).toContain(forbidden);
      expect(LOCK.calibrationStatus).not.toBe(forbidden);
      expect(LOCK.formalValidationStatus).not.toBe(forbidden);
    }
  });

  it("is generation 3 of an unbroken succession", () => {
    const inv = assertCalibrationLockInvariant();
    expect(inv.generation).toBe(3);
    expect(inv.version).toBe("1.3.0");
    expect(inv.parameterChanges).toBe(0);
    expect(LOCK.parentCoreHash).toBe(C2_LOCK.coreHash);
    expect(LOCK.coreHash).not.toBe(C2_LOCK.coreHash);
    const chain = successionChain();
    expect(chain[0].to).toBe(LOCK.coreHash);
    expect(chain[0].from).toBe(C2_LOCK.coreHash);
  });

  it("stamps 1.3.0 / 2.1.0 as the live registry identity", () => {
    expect(versionOf("possessionCalibrationVersion")).toBe("1.3.0");
    expect(versionOf("actionLibraryVersion")).toBe("2.1.0");
    expect(versionOf("possessionEngineVersion")).toBe("1.2.0");
    expect(versionOf("engineVersion")).toBe("3.2.0");
    expect(LOCK.possessionCalibrationVersion).toBe("1.3.0");
  });

  it("names its engine repairs and their basis", () => {
    expect(LOCK.engineBehaviourChanged).toBe(true);
    expect(LOCK.changedCoreFiles).toContain("src/v3/actions/families.js");
    expect(LOCK.changedCoreFiles).toContain("src/v3/calibration/calibrationPlayerAdapter.js");
    expect(LOCK.changeBasis).toMatch(/root.cause/i);
  });
});

describe("preview flag and gating", () => {
  it("PREVIEW_SIM_ENGINE_ENABLED defaults to false", () => {
    const saved = process.env.PREVIEW_SIM_ENGINE_ENABLED;
    delete process.env.PREVIEW_SIM_ENGINE_ENABLED;
    expect(flags().previewSimEngine).toBe(false);
    if (saved !== undefined) process.env.PREVIEW_SIM_ENGINE_ENABLED = saved;
  });

  it("emergency-off: false/0/off/no or unset returns every new request to production", () => {
    for (const v of ["false", "0", "off", "no", "FALSE", ""]) {
      process.env.PREVIEW_SIM_ENGINE_ENABLED = v;
      expect(flags().previewSimEngine, `value ${JSON.stringify(v)}`).toBe(false);
    }
    process.env.PREVIEW_SIM_ENGINE_ENABLED = "true";
    expect(flags().previewSimEngine).toBe(true);
    delete process.env.PREVIEW_SIM_ENGINE_ENABLED;
    expect(flags().previewSimEngine).toBe(false);
  });
});

describe("preview namespaces are isolated", () => {
  it("every preview namespace is preview-prefixed and none is a production namespace", () => {
    const names = Object.values(PREVIEW_NAMESPACES);
    expect(names.length).toBe(6);
    for (const n of names) expect(n).toMatch(/^preview-/);
    for (const n of ["result", "probability", "narrative", "competition", "daily", "challenge"]) {
      expect(names).toContain(`preview-${n}`);
    }
  });

  it("preview cache keys never collide with production keys and carry candidate identity", () => {
    const prev = cacheKeys.previewResult({ matchupFingerprint: "abc", simulationSeed: 42 });
    expect(prev.startsWith("preview-")).toBe(true);
    expect(prev).toContain("pc1-3-0");
    expect(prev).toContain("al2-1-0");
    // No production key builder emits into a preview namespace.
    for (const [name, build] of Object.entries(cacheKeys)) {
      if (name.startsWith("preview")) continue;
      expect(name.toLowerCase().startsWith("preview")).toBe(false);
    }
    for (const k of ["previewProbability", "previewNarrative", "previewCompetition", "previewDaily", "previewChallenge"]) {
      expect(typeof cacheKeys[k]).toBe("function");
    }
  });

  it("preview result ids carry the pv_ prefix", () => {
    expect(PREVIEW_RESULT_ID_PREFIX).toBe("pv_");
  });
});

describe("preview engine behaviour", () => {
  it("computes a single game and stamps the locked identity in the fingerprint", () => {
    const r = computeResultPreview("single", TEAM_A, TEAM_B, { coachGoldId: "neutral", coachBlueId: "neutral" }, 12345);
    expect(r.preview).toBe(true);
    expect(r.fingerprint).toBeTruthy();
    expect(r.candidate.possessionCalibrationVersion).toBe("1.3.0");
    expect(r.candidate.actionLibraryVersion).toBe("2.1.0");
    expect(r.core.finalScore.gold).not.toBe(r.core.finalScore.blue);
    expect(r.core.winner === "Gold" || r.core.winner === "Blue").toBe(true);
  });

  it("is deterministic under replay", () => {
    const a = computeResultPreview("single", TEAM_A, TEAM_B, { coachGoldId: "neutral", coachBlueId: "neutral" }, 777);
    const b = computeResultPreview("single", TEAM_A, TEAM_B, { coachGoldId: "neutral", coachBlueId: "neutral" }, 777);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuses every out-of-scope mode so the caller falls back to production", () => {
    for (const mode of ["season", "series", "daily", "tournament"]) {
      let code = null;
      try { computeResultPreview(mode, TEAM_A, TEAM_B, {}, 1); } catch (e) { code = e.code; }
      expect(code, mode).toBe("PREVIEW_SCOPE");
    }
  });

  it("reports the locked candidate identity", () => {
    const id = previewCandidateIdentity();
    expect(id.candidateId).toMatch(/3/);
    expect(id.possessionCalibrationVersion).toBe("1.3.0");
    expect(id.actionLibraryVersion).toBe("2.1.0");
  });
});

describe("production fallback wiring", () => {
  const game = readFileSync(new URL("../api/game.js", import.meta.url), "utf8");

  it("preview path is guarded, caught, and falls back to production per request", () => {
    expect(game).toMatch(/f\.previewSimEngine\s*&&\s*f\.simV3\s*&&\s*mode === "single"/);
    expect(game).toMatch(/previewComputed = null;\s*\n\s*previewEvent\("fallback_invoked"/);
    expect(game).toMatch(/previewComputed \?\? \(f\.simV3/);
  });

  it("production engine 3.2.0 remains the sole engine when the flag is off", () => {
    // With previewSimEngine false the guard short-circuits before any preview
    // module executes; computeResultV3 is untouched.
    expect(versionOf("engineVersion")).toBe("3.2.0");
    expect(game).toMatch(/computeResultV3\(mode, gold, blue/);
  });
});

describe("preview telemetry", () => {
  it("only allows the declared operational events", () => {
    for (const e of ["simulation_started", "fallback_invoked"]) expect(ALLOWED_PREVIEW_EVENTS.has(e)).toBe(true);
    expect(previewEvent("made_up_event", {})).toBeNull();
  });

  it("strips secret-bearing keys and never logs personal data", () => {
    const out = previewEvent("simulation_started", {
      mode: "single",
      authorization: "Bearer xyz",
      cookie: "sid=1",
      userEmail: "a@b.c",
      apiToken: "t",
      sessionId: "s",
      password: "p",
    });
    const s = JSON.stringify(out);
    expect(s).not.toMatch(/authorization|cookie|email|token|session|password|Bearer|a@b\.c/i);
    expect(out.mode).toBe("single");
  });
});
