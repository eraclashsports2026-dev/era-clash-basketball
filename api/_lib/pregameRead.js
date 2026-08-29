// ── The one pregame read ─────────────────────────────────────────────────────
// Phase 7B. Ready and Postgame previously computed the matchup read separately:
// the Ready screen asked /api/v3meta for qualitative edges, while the Postgame
// rendered `core.edges` — the same model's RAW numbers. So the same matchup
// could say "Spacing: Even" before the game and "Spacing Gold +4" after it.
//
// This module is the single implementation. /api/v3meta serves it to the
// builder, /api/game stores the exact object on the result, and the Postgame
// reads the stored snapshot instead of recomputing anything.
import { matchupPreviewV3 } from "../../src/v3/analysis.js";
import { VERSIONS } from "../../src/versions.js";

export const PREGAME_SNAPSHOT_VERSION = 1;

// The model scores each category on a ±20 scale. `keyClash` treats |edge| <= 4
// as "nearly even", so that same bound defines Even here; half the cap is a
// strong edge. Numbers never leave this module.
const EVEN_BOUND = 4;
const STRONG_BOUND = 10;

const label = (edge) => {
  const a = Math.abs(edge);
  if (a <= EVEN_BOUND) return "Even";
  const side = edge > 0 ? "Gold" : "Blue";
  return a >= STRONG_BOUND ? `Strong ${side} Edge` : `${side} Edge`;
};

/** Qualitative, number-free edges plus the clash line and an overall read. */
export const buildPregameRead = (gold, blue, coachG, coachB, era) => {
  const preview = matchupPreviewV3(gold, blue, coachG, coachB, era);
  const qualitativeEdges = preview.categories.map((c) => ({
    category: c.category,
    lead: Math.abs(c.edge) <= EVEN_BOUND ? "even" : c.edge > 0 ? "gold" : "blue",
    strong: Math.abs(c.edge) >= STRONG_BOUND,
    label: label(c.edge),
  }));
  const decided = qualitativeEdges.filter((e) => e.lead !== "even");
  const goldLead = decided.filter((e) => e.lead === "gold").length;
  const blueLead = decided.length - goldLead;
  const overallRead = decided.length === 0 ? "Even matchup"
    : goldLead === blueLead ? "Split matchup"
    : `${goldLead > blueLead ? "Gold" : "Blue"} leads more categories`;
  return {
    pregameSnapshotVersion: PREGAME_SNAPSHOT_VERSION,
    qualitativeEdges,
    keyClash: preview.keyClash ?? null,
    overallRead,
    // "confidence" is about how separated the read is, never a win probability.
    confidence: decided.length >= 4 ? "clear" : decided.length >= 2 ? "mixed" : "close",
    sourceVersions: {
      possessionCalibrationVersion: VERSIONS.registry?.possessionCalibrationVersion?.version ?? null,
      teamIntelligenceVersion: VERSIONS.registry?.teamIntelligenceVersion?.version ?? null,
    },
  };
};
