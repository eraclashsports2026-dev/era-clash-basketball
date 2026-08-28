// ── Phase 6C5 — protected-preview activation surface ──────────────────────────
// The access gate, the preview-environment flag source, production-shaped
// preview records, structured preview feedback, and the deployed-preview
// telemetry vocabulary.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { verifyPreviewKey, presentedKey, readCookie, COOKIE_NAME } from "../api/_lib/previewAccessCheck.js";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { PREVIEW_ENV } from "../config/previewEnv.js";
import { flags } from "../api/_lib/flags.js";
import { computeResultPreview, PREVIEW_CANDIDATE_CORE_HASH, previewCandidateIdentity } from "../api/_lib/previewEngine.js";
import { validatePreviewFeedback } from "../api/feedback.js";
import { ALLOWED_PREVIEW_EVENTS, previewEvent } from "../api/_lib/previewTelemetry.js";
import { PLAYERS } from "../src/players.js";

const LOCK = JSON.parse(readFileSync("data/validation/6c4d0/candidate3-lock.json", "utf8")).data;
const team = (ids) => ids.map((id) => ({ id, ...PLAYERS.find((p) => p.id === id) }));
const A = team(["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"]);
const B = team(["curry-10s", "klay-10s", "lebron-10s", "kg-00s", "shaq-90s"]);

afterEach(() => { delete process.env.VERCEL_ENV; delete process.env.PREVIEW_SIM_ENGINE_ENABLED; });

describe("preview access control", () => {
  it("stores only sha256 hashes, never keys", () => {
    for (const k of PREVIEW_ACCESS.keys) {
      expect(k.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.keys(k).sort()).toEqual(["label", "sha256"]);
    }
    const src = readFileSync("config/previewAccess.js", "utf8");
    expect(src).not.toMatch(/@/); // no email addresses in source
  });

  it("rejects wrong, malformed, oversized and empty keys", async () => {
    for (const bad of ["", "0".repeat(32), "x".repeat(32), "a".repeat(31), "a".repeat(33), "abc; DROP", null, 42]) {
      expect((await verifyPreviewKey(bad)).ok, String(bad)).toBe(false);
    }
  });

  it("reads the key from header or cookie, header first", () => {
    expect(presentedKey({ "x-preview-key": "h", cookie: `${COOKIE_NAME}=c` })).toBe("h");
    expect(presentedKey({ cookie: `a=1; ${COOKIE_NAME}=c; b=2` })).toBe("c");
    expect(presentedKey({})).toBeNull();
    expect(readCookie("evil=pv_access%3Dx", COOKIE_NAME)).toBeNull();
  });

  it("the gate is declared on and scoped to preview deployments", () => {
    expect(PREVIEW_ENV.requireAccess).toBe(true);
    const mw = readFileSync("middleware.js", "utf8");
    expect(mw).toMatch(/VERCEL_ENV !== "preview"[\s\S]*return;/);
    expect(mw).toMatch(/preview_access_required/);
    expect(mw).toMatch(/noindex/);
  });
});

describe("preview flag source", () => {
  it("stays false locally and in production regardless of the repo config", () => {
    expect(flags().previewSimEngine).toBe(false);
    process.env.VERCEL_ENV = "production";
    expect(flags().previewSimEngine).toBe(false);
  });

  it("in a preview deployment follows the repo config, and an env var always wins", () => {
    process.env.VERCEL_ENV = "preview";
    expect(flags().previewSimEngine).toBe(PREVIEW_ENV.previewSimEngine === true);
    process.env.PREVIEW_SIM_ENGINE_ENABLED = "false";
    expect(flags().previewSimEngine).toBe(false);
    process.env.PREVIEW_SIM_ENGINE_ENABLED = "true";
    expect(flags().previewSimEngine).toBe(true);
  });
});

describe("production-shaped preview record", () => {
  const r = computeResultPreview("single", A, B, { coachGoldId: "pat-riley", coachBlueId: "phil-jackson", eraStyleId: "1990s" }, 777);

  it("fulfils the postgame core contract the client renders", () => {
    expect(["Gold", "Blue"]).toContain(r.core.winner);
    expect(r.core.seriesResult).toMatch(/^\d{2,3}-\d{2,3}$/);
    expect(r.core.teamAStats).toHaveLength(5);
    expect(r.core.teamAStats[0]).toHaveProperty("pts");
    expect(r.core.teamAStats[0]).toHaveProperty("reb");
    expect(r.core.mvp).toBeTruthy();
    expect(r.core.mvpLine.name).toBe(r.core.mvp);
    expect(r.core.edges.length).toBeGreaterThan(0);
    expect(r.core.keyEdge).toBeTruthy();
    expect(r.fallbackSummary).toMatch(/Team (Gold|Blue)/);
    expect(r.mvpFallback).toContain(r.core.mvp);
    expect(r.v3.possessions).toBeGreaterThan(60);
    expect(r.v3.fullBox.gold).toHaveLength(5);
    expect(r.v3.expectedGoldWinPct).toBeGreaterThanOrEqual(0);
  });

  it("carries the preview identity and stays deterministic", () => {
    expect(r.preview).toBe(true);
    expect(r.candidate.coreHash).toBe(PREVIEW_CANDIDATE_CORE_HASH);
    expect(r.candidate.possessionCalibrationVersion).toBe("1.3.0");
    const again = computeResultPreview("single", A, B, { coachGoldId: "pat-riley", coachBlueId: "phil-jackson", eraStyleId: "1990s" }, 777);
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
  });

  it("the embedded core hash IS the locked core hash", () => {
    expect(PREVIEW_CANDIDATE_CORE_HASH).toBe(LOCK.coreHash);
    expect(previewCandidateIdentity().coreHash).toBe(LOCK.coreHash);
  });

  it("MVP comes from the winning side", () => {
    const winners = r.core.winner === "Gold" ? r.core.teamAStats : r.core.teamBStats;
    expect(winners.map((l) => l.name)).toContain(r.core.mvp);
  });
});

describe("structured preview feedback", () => {
  const good = { kind: "preview", resultId: "pv_abc123defg", resultBelievability: 4,
    teamIdentityFeltAccurate: 5, coachDifferenceFeltMeaningful: 3, eraStyleFeltMeaningful: 4,
    postgameExplanationHelpful: 5, wouldRematchOrShare: true, issueCategory: "none", optionalComment: "solid" };

  it("accepts the complete structured shape", () => {
    const rec = validatePreviewFeedback(good);
    expect(rec.resultId).toBe("pv_abc123defg");
    expect(rec.resultBelievability).toBe(4);
    expect(rec.wouldRematchOrShare).toBe(true);
  });

  it("rejects non-preview ids, out-of-range ratings, oversized and malformed payloads", () => {
    expect(validatePreviewFeedback({ ...good, resultId: "abc123defg" })).toBeNull();
    expect(validatePreviewFeedback({ ...good, resultId: "pv_ABC!" })).toBeNull();
    expect(validatePreviewFeedback({ ...good, resultBelievability: 0 })).toBeNull();
    expect(validatePreviewFeedback({ ...good, resultBelievability: 6 })).toBeNull();
    expect(validatePreviewFeedback({ ...good, resultBelievability: 3.5 })).toBeNull();
    expect(validatePreviewFeedback({ ...good, wouldRematchOrShare: "yes" })).toBeNull();
    expect(validatePreviewFeedback({ ...good, optionalComment: "x".repeat(501) })).toBeNull();
    expect(validatePreviewFeedback(null)).toBeNull();
    expect(validatePreviewFeedback("string")).toBeNull();
  });

  it("never stores an unknown category", () => {
    expect(validatePreviewFeedback({ ...good, issueCategory: "made_up" }).issueCategory).toBe("none");
  });
});

describe("deployed-preview telemetry vocabulary", () => {
  it("allowlists the deployed event names", () => {
    for (const e of ["preview_session_started", "preview_game_started", "preview_game_completed",
      "preview_game_failed", "preview_fallback_invoked", "preview_replay_verified",
      "preview_feedback_submitted", "preview_result_shared", "preview_rematch_started", "preview_mode_selected"]) {
      expect(ALLOWED_PREVIEW_EVENTS.has(e), e).toBe(true);
    }
  });

  it("still strips secret keys on the new events", () => {
    const out = previewEvent("preview_game_completed", { candidateId: "Candidate 3", authorization: "x", sessionToken: "y" });
    expect(JSON.stringify(out)).not.toMatch(/authorization|token/i);
  });
});

describe("preview-scoped result reads", () => {
  it("game.js resolves pv_ ids in the preview namespace and rejects malformed ids", () => {
    const game = readFileSync("api/game.js", "utf8");
    expect(game).toMatch(/\^pv_\[a-z0-9\]\{6,16\}\$/);
    expect(game).toMatch(/isPreviewId \? "preview-result" : "result"/);
  });

  it("narrative caches preview results only under preview-narrative", () => {
    const nar = readFileSync("api/narrative.js", "utf8");
    expect(nar).toMatch(/previewNarrative/);
    expect(nar).toMatch(/isPreviewId \? "preview-result" : "result"/);
  });

  it("chaos injection in deployed previews is limited to preview-fail", () => {
    const game = readFileSync("api/game.js", "utf8");
    expect(game).toMatch(/VERCEL_ENV === "preview" && v === "preview-fail"/);
  });
});
