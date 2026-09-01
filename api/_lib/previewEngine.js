// ── Protected-preview simulation path (Candidate 3 possession engine) ────────
//
// DEFAULT OFF. Selected only when PREVIEW_SIM_ENGINE_ENABLED is explicitly
// true; every other request takes the production path (engine 3.2.0 line via
// computeResultV3), which remains byte-identical when the flag is off. Any
// failure inside this path falls back to production for THAT request and emits
// fallback_invoked — a preview defect can never take the product down.
//
// The record this module returns is PRODUCTION-SHAPED (core.teamAStats etc.,
// the same postgame contract computeResultV3 fulfils) so the deployed client
// renders a preview game with zero client changes. Every derived field below
// comes from the possession engine's own output or from the engine-agnostic
// pregame analysis module — never from the production simulation engine, so
// one result never mixes engines.
//
// Every preview result carries the candidate identity (the possession
// fingerprint already embeds possessionCalibrationVersion and
// actionLibraryVersion), is cached only under preview-* namespaces, and is
// persisted with a pv_ result-id prefix so production namespaces never hold a
// preview record.
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { resolveCoach, resolveEra, V3_VERSIONS } from "../../src/v3/engine.js";
import { expectedWinPct, matchupPreviewV3, classifyOutcome, edgeBand } from "../../src/v3/analysis.js";
import { versionOf } from "../../src/versions.js";
import { previewEvent } from "./previewTelemetry.js";
import { deriveKeyMoments, derivePatterns } from "./previewKeyMoments.js";
import { deriveSalientMoments, deriveQuarterFlow } from "./postgameStory.js";
import { deriveCoaching } from "./previewCoaching.js";
import { PLAYERS } from "../../src/players.js";

/** Result-id prefix for preview results — production ids never carry it. */
export const PREVIEW_RESULT_ID_PREFIX = "pv_";

export const PREVIEW_NAMESPACES = Object.freeze({
  result: "preview-result", probability: "preview-probability", narrative: "preview-narrative",
  competition: "preview-competition", daily: "preview-daily", challenge: "preview-challenge",
});

// The locked Candidate 4 core identity. The literal is bound to
// data/validation/8d/candidate4-lock.json by test; it is lock output, not
// configuration — a new candidate means a new lock and a new literal.
// Candidate 3 was 6a423d4fedf45bef3889b9425651e815c95da4f6e573a2c51a3f0ef713360b69.
export const PREVIEW_CANDIDATE_CORE_HASH = "55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff";

export const previewCandidateIdentity = () => ({
  candidateId: "Candidate 4",
  coreHash: PREVIEW_CANDIDATE_CORE_HASH,
  possessionCalibrationVersion: versionOf("possessionCalibrationVersion"),
  actionLibraryVersion: versionOf("actionLibraryVersion"),
  possessionEngineVersion: versionOf("possessionEngineVersion"),
  fallbackEngine: `production engineVersion ${versionOf("engineVersion")}`,
});

const CARD_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));

const boxLine = (p) => ({ id: p.cardId ?? p.id, name: p.name, pos: p.position, pts: p.pts ?? 0,
  fgm: p.fgm ?? 0, fga: p.fga ?? 0, tpm: p.tpm ?? 0, tpa: p.tpa ?? 0, ftm: p.ftm ?? 0, fta: p.fta ?? 0,
  oreb: p.oreb ?? 0, dreb: p.dreb ?? 0, ast: p.ast ?? 0, stl: p.stl ?? 0, blk: p.blk ?? 0,
  to: p.to ?? p.tov ?? 0, pf: p.pf ?? 0 });
const compatRow = (l) => ({ name: l.name, pts: l.pts, reb: l.oreb + l.dreb, ast: l.ast, stl: l.stl, blk: l.blk });

// Preview MVP: the same deterministic composite production uses for a series
// MVP (points + 0.7 assists + 0.5 rebounds), applied to the winning side.
const mvpOf = (lines) => [...lines].sort((a, b) =>
  (b.pts + b.ast * 0.7 + (b.oreb + b.dreb) * 0.5) - (a.pts + a.ast * 0.7 + (a.oreb + a.dreb) * 0.5))[0];

const previewSummary = (g, mvp, exp) => {
  const lead = g.winner === "Gold" ? "Team Gold" : "Team Blue";
  const read = exp >= 0.55 ? "the pre-game read favored Gold" : exp <= 0.45 ? "the pre-game read favored Blue" : "the pre-game read was even";
  const margin = Math.abs(g.finalScore.gold - g.finalScore.blue);
  const kind = margin >= 15 ? "pulled away for a comfortable win" : margin >= 6 ? "controlled the closing stretch" : "survived a game that stayed close to the end";
  return `${lead} ${kind}, ${g.finalScore.gold}-${g.finalScore.blue}${g.overtimes ? ` in ${g.overtimes} overtime${g.overtimes > 1 ? "s" : ""}` : ""}. ${mvp.name} led the winners with ${mvp.pts} points, and ${read}.`;
};

const mvpText = (mvp, possessions) => {
  const eff = mvp.fga ? ` on ${mvp.fgm}-of-${mvp.fga} shooting` : "";
  const extra = mvp.ast >= 5 ? ` and ${mvp.ast} assists` : (mvp.oreb + mvp.dreb) >= 9 ? ` and ${mvp.oreb + mvp.dreb} rebounds` : "";
  return `${mvp.name} earned it with ${mvp.pts} points${eff}${extra}. In a ${possessions}-possession game, nobody converted their share of the offense into more value.`;
};

/**
 * Single-game preview compute. Throws on anything unexpected; the caller's
 * fallback handles it. Modes beyond "single" intentionally stay on the
 * production path in this integration — the preview scope is the core sim.
 */
/** The night's leading scorer, for the "unusual performance" moment. */
const topScorerOf = (g, goldLines, blueLines) => {
  const all = [
    ...(goldLines || []).map((l) => ({ ...l, side: "gold" })),
    ...(blueLines || []).map((l) => ({ ...l, side: "blue" })),
  ];
  return all.sort((a, b) => (b.pts || 0) - (a.pts || 0))[0] || null;
};

export const computeResultPreview = (mode, gold, blue, opts, seed) => {
  if (mode !== "single" || !blue) {
    const err = new Error(`preview engine scope is single-game; mode ${mode} stays on production`);
    err.code = "PREVIEW_SCOPE";
    throw err;
  }
  const coachG = resolveCoach(opts.coachGoldId ?? "neutral");
  const coachB = resolveCoach(opts.coachBlueId ?? "neutral");
  const era = resolveEra(opts.eraStyleId);
  const t0 = Date.now();
  // includeLedger is a RECORDING flag: it changes what the engine reports, not
  // what it simulates (same seed → same fingerprint, asserted in tests). The
  // ledger is used to derive key moments and is then discarded — the stored
  // record stays small and carries only the moments.
  const g = runPossessionGame(buildPossessionInput({
    goldIds: gold.map((p) => p.id), blueIds: blue.map((p) => p.id),
    coachGoldId: coachG.id, coachBlueId: coachB.id,
    eraStyleId: era.id, simulationSeed: seed >>> 0,
  }), { includeLedger: true, assertInvariants: false });
  if (g.internalError) {
    const err = new Error(`possession engine reported an internal error: ${String(g.internalError).slice(0, 120)}`);
    err.code = "PREVIEW_ENGINE_ERROR";
    throw err;
  }

  // Engine-agnostic pregame analysis — shared with production, not a sim result.
  const pre = matchupPreviewV3(gold, blue, coachG, coachB, era);
  const exp = expectedWinPct(gold, blue, coachG, coachB, era, seed >>> 0);

  const goldLines = g.gold.players.map(boxLine);
  const blueLines = g.blue.players.map(boxLine);
  const winLines = g.winner === "Gold" ? goldLines : blueLines;
  const mvp = mvpOf(winLines);
  const minutes = 48 + (g.overtimes ?? 0) * 5;
  const possessions = Math.round((g.realized?.realizedPace ?? 95) * minutes / 48);
  const identity = previewCandidateIdentity();

  previewEvent("simulation_completed", { mode, latencyMs: Date.now() - t0,
    invariantViolations: (g.invariantViolations ?? []).length });

  return {
    versions: { v2: undefined, ...V3_VERSIONS },
    seed: seed >>> 0,
    eraId: era.id,
    coachIds: { gold: coachG.id, blue: coachB.id },
    mode,
    // Preview identity — travels with the stored record and the API response.
    preview: true,
    candidate: identity,
    fingerprint: g.fingerprint,
    core: {
      engine: "possession-preview",
      winner: g.winner,
      finalScore: g.finalScore,
      seriesResult: `${g.finalScore.gold}-${g.finalScore.blue}`,
      teamAStats: goldLines.map(compatRow),
      teamBStats: blueLines.map(compatRow),
      mvp: mvp.name,
      mvpLine: compatRow(mvp),
      edges: pre.categories.map((c) => ({ category: c.category, edge: c.edge })),
      keyEdge: [...pre.categories].sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))[0],
      slotDuels: goldLines.map((gl, i) => ({
        pos: gl.pos, gold: { ...compatRow(gl), guardedBy: blueLines[i]?.name ?? null },
        blue: { ...compatRow(blueLines[i]), guardedBy: gl.name },
      })),
      turningPoint: null,
    },
    fallbackSummary: previewSummary(g, mvp, exp),
    mvpFallback: mvpText(mvp, possessions),
    v3: {
      possessions,
      overtimes: g.overtimes ?? 0,
      expectedGoldWinPct: Math.round(exp * 100),
      expectedBand: edgeBand(exp),
      outcomeClass: classifyOutcome(g.winner === "Gold" ? exp : 1 - exp),
      fingerprint: g.fingerprint,
      // 4 = REGULATION periods, so period 5 is labeled OT (g.periods is the
      // total played, which would mislabel overtime as "Q5").
      // Salience-scored moments. The previous selector always emitted "the last
      // lead change", which surfaced trivial first-quarter swings as headline
      // moments; the scored model weights leverage, magnitude and period.
      keyMoments: deriveSalientMoments(g.possessionLedger, CARD_BY_ID, 4, {
        topScorer: topScorerOf(g, goldLines, blueLines),
      }),
      quarterFlow: deriveQuarterFlow(g.possessionLedger, CARD_BY_ID, 4),
      matchupPatterns: derivePatterns(g.possessionLedger, CARD_BY_ID),
      coaching: deriveCoaching(g, CARD_BY_ID, { gold: coachG.name, blue: coachB.name },
        { gold: gold.map((p) => p.id), blue: blue.map((p) => p.id) }, g.possessionLedger),
      periodScores: g.periodScores ?? null,
      fullBox: { gold: goldLines, blue: blueLines },
      teamTotals: { gold: g.gold.totals, blue: g.blue.totals },
      preview: pre,
    },
    periodScores: g.periodScores ?? null,
  };
};
