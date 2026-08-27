// ── Protected-preview simulation path (Candidate 3 possession engine) ────────
//
// DEFAULT OFF. Selected only when PREVIEW_SIM_ENGINE_ENABLED is explicitly
// true; every other request takes the production path (engine 3.2.0 line via
// computeResultV3), which remains byte-identical when the flag is off. Any
// failure inside this path falls back to production for THAT request and emits
// fallback_invoked — a preview defect can never take the product down.
//
// Every preview result carries the candidate identity (the possession
// fingerprint already embeds possessionCalibrationVersion and
// actionLibraryVersion), is cached only under preview-* namespaces, and is
// persisted with a pv_ result-id prefix so production namespaces never hold a
// preview record.
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { versionOf } from "../../src/versions.js";
import { previewEvent } from "./previewTelemetry.js";

/** Result-id prefix for preview results — production ids never carry it. */
export const PREVIEW_RESULT_ID_PREFIX = "pv_";

export const PREVIEW_NAMESPACES = Object.freeze({
  result: "preview-result", probability: "preview-probability", narrative: "preview-narrative",
  competition: "preview-competition", daily: "preview-daily", challenge: "preview-challenge",
});

export const previewCandidateIdentity = () => ({
  candidateId: "Candidate 3",
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
  actionLibraryVersion: versionOf("actionLibraryVersion"),
  possessionEngineVersion: versionOf("possessionEngineVersion"),
  fallbackEngine: `production engineVersion ${versionOf("engineVersion")}`,
});

const boxLine = (p) => ({ name: p.name, id: p.cardId ?? p.id, pts: p.pts ?? 0, fgm: p.fgm ?? 0, fga: p.fga ?? 0,
  tpm: p.tpm ?? 0, tpa: p.tpa ?? 0, ftm: p.ftm ?? 0, fta: p.fta ?? 0, oreb: p.oreb ?? 0, dreb: p.dreb ?? 0,
  ast: p.ast ?? 0, stl: p.stl ?? 0, blk: p.blk ?? 0, to: p.to ?? p.tov ?? 0, pf: p.pf ?? 0 });

/**
 * Single-game preview compute. Throws on anything unexpected; the caller's
 * fallback handles it. Modes beyond "single" intentionally stay on the
 * production path in this integration — the preview scope is the core sim.
 */
export const computeResultPreview = (mode, gold, blue, opts, seed) => {
  if (mode !== "single" || !blue) {
    const err = new Error(`preview engine scope is single-game; mode ${mode} stays on production`);
    err.code = "PREVIEW_SCOPE";
    throw err;
  }
  const t0 = Date.now();
  const g = runPossessionGame(buildPossessionInput({
    goldIds: gold.map((p) => p.id), blueIds: blue.map((p) => p.id),
    coachGoldId: opts.coachGoldId ?? "neutral", coachBlueId: opts.coachBlueId ?? "neutral",
    eraStyleId: opts.eraStyleId ?? "2010s", simulationSeed: seed >>> 0,
  }), { includeLedger: false, assertInvariants: false });
  const identity = previewCandidateIdentity();
  previewEvent("simulation_completed", { mode, latencyMs: Date.now() - t0,
    invariantViolations: (g.invariantViolations ?? []).length });
  return {
    engine: "possession-preview",
    preview: true,
    candidate: identity,
    fingerprint: g.fingerprint,
    seed: seed >>> 0,
    eraId: opts.eraStyleId ?? "2010s",
    coachIds: { gold: opts.coachGoldId ?? "neutral", blue: opts.coachBlueId ?? "neutral" },
    finalScore: g.finalScore,
    winner: g.finalScore.gold > g.finalScore.blue ? "gold" : "blue",
    gold: { totals: g.gold.totals, players: g.gold.players.map(boxLine) },
    blue: { totals: g.blue.totals, players: g.blue.players.map(boxLine) },
    periodScores: g.periodScores ?? null,
  };
};
