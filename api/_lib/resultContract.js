// ── The authoritative Chaos result record: one reader for every consumer ──────
// A completed Clash is written ONCE by api/game.js as `result:<id>` or
// `preview-result:<id>` (180-day TTL): the engine's computed result spread in,
// plus the server's own fields. This module is the single place that reads
// identity, coaches, rosters, score and MVP out of that record, so the saved
// career row (cloudAccounts.buildSavedClash), the governed Challenge
// (challenges.createChallenge) and the checks agree on one shape. It was
// written after both paths were found reading fields the record never had
// (`previewCandidate`, `pregame.cards`, `coachGold`) — a shape that exists only
// in the BROWSER's view model (src/App.jsx viewSim) and in hand-made fixtures.
//
// The shape below is pinned against a real captured Candidate 4 record
// (tests/fixtures/saved-clash/candidate4-chaos-record.json) AND a freshly
// computed one (tests/result-contract.test.js), so a fixture cannot drift from
// the builder again without a failing test.
import { findCard, PLAYERS } from "../../src/players.js";
import { getCoach, NEUTRAL_COACH, COACHES } from "../../src/v3/coaches.js";

const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
const COACH_BY_ID = new Map(COACHES.map((c) => [c.id, c]));

/** Where each fact lives on the STORED record (not the view model). */
export const RESULT_RECORD_CONTRACT = Object.freeze({
  identity: { resultId: "id", mode: "mode ('single' for a Chaos simulation)", isChaos: "chaosDraft (non-null)", createdAt: "created_at (ms)" },
  engine: {
    candidateId: "candidate.candidateId — only when preview === true",
    calibrationVersion: "candidate.possessionCalibrationVersion — only when preview === true",
    candidateCoreHash: "candidate.coreHash — only when preview === true",
    engineVersion: "versions.engine / fingerprint.engineVersion",
    parameterHash: "fingerprint — the calibration parameter-set hash (not copied into career rows)",
    simulationSeed: "seed (private: never copied into a public payload)",
  },
  setup: { goldIds: "goldIds[5]", blueIds: "blueIds[5]", coachIds: "coachIds.{gold,blue} ('neutral' = no coach)", eraId: "eraId", eraCustom: "not on the record (on the chaos run)" },
  outcome: { finalScore: "core.finalScore.{gold,blue}", winner: "core.winner", mvp: "core.mvp (name) + core.mvpLine" },
  stats: { box: "v3.fullBox.{gold,blue}[] {id,name,pos,pts,fgm,fga,tpm,tpa,ftm,fta,oreb,dreb,ast,stl,blk,to,pf}", teamTotals: "v3.teamTotals.{gold,blue}", periods: "v3.periodScores[] and periodScores[] (Candidate 4 only)", overtimes: "v3.overtimes" },
  displayNames: { players: "v3.fullBox[].name/pos, else the catalog (findCard)", coaches: "catalog by coachIds (getCoach)" },
  notOnRecord: ["previewCandidate (browser view model only)", "pregame.cards", "coachGold / coachBlue", "roster display cards"],
});

// ── engine identity ──────────────────────────────────────────────────────────
/** The candidate the preview engine stamped on its record; null for the production engine (the view model applies the same gate). */
export const candidateOf = (record) => (record?.preview === true && record?.candidate ? record.candidate : null);
export const engineIdentity = (record) => {
  const c = candidateOf(record);
  return {
    candidateId: c?.candidateId ? String(c.candidateId).slice(0, 40) : null,
    calibrationVersion: c?.possessionCalibrationVersion ? String(c.possessionCalibrationVersion).slice(0, 20) : null,
    candidateCoreHash: c?.coreHash ? String(c.coreHash).slice(0, 64) : null,
  };
};

// ── score and MVP ────────────────────────────────────────────────────────────
// The engines put the final score under `core`; older test records carry it at
// the top level. Phase 9D found the top-level read alone saved every real Clash
// as a scoreless loss.
export const finalScoreOf = (record) => record?.core?.finalScore || record?.finalScore || null;
export const mvpOf = (record) => {
  const m = record?.mvp ?? record?.core?.mvp;
  if (!m) return null;
  if (typeof m === "string") return { name: m.slice(0, 40), pts: Number(record?.core?.mvpLine?.pts) || null };
  return { name: String(m.name || "").slice(0, 40), pts: Number(m.pts) || null };
};

// ── the saved career row's roster and coach (PR #68) ─────────────────────────
/** Name and position from the game's own box score (the slot actually played), else the alias-aware catalog. */
export const savedRosterOf = (ids, record, side) => {
  const list = Array.isArray(ids) ? ids : [];
  const box = new Map((record?.v3?.fullBox?.[side] || []).map((l) => [l?.id, l]));
  return list.slice(0, 5).map((id) => {
    const c = box.get(id) || findCard(id);
    return { id: String(id).slice(0, 40), name: c?.name ? String(c.name).slice(0, 40) : null, pos: c?.pos ? String(c.pos).slice(0, 4) : null };
  });
};
/** A catalog coach, or null for the neutral staff (no coach chosen — never counted as a distinct coach). */
export const savedCoachOf = (id) => {
  if (typeof id !== "string" || !id || id === NEUTRAL_COACH.id) return null;
  const known = getCoach(id);
  return { id: id.slice(0, 40), name: known?.name ? String(known.name).slice(0, 40) : null };
};

// ── the Challenge's creator snapshot (unchanged disclosure) ──────────────────
// What a recipient sees AFTER completing: the creator's five with catalog names
// and positions, and the creator's coach by id. Kept exactly as Phase 9C shipped
// it (the dead `pregame.cards` / `coachGold` reads removed; they were always empty).
export const challengeRosterOf = (ids) => (Array.isArray(ids) ? ids : []).slice(0, 5).map((id) => {
  const c = PLAYER_BY_ID.get(id);
  return { id: String(id).slice(0, 40), name: c?.name ? String(c.name).slice(0, 40) : null, pos: (c?.pos || c?.positions?.[0]) ? String(c.pos || c.positions[0]).slice(0, 4) : null };
});
export const challengeCoachOf = (id) => {
  if (!id) return null;
  const known = COACH_BY_ID.get(id);
  return { id: String(id).slice(0, 40), name: known?.name ? String(known.name).slice(0, 40) : null };
};
