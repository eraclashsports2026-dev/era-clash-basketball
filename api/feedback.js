// ── Simulation believability feedback ─────────────────────────────────────────
// "Did this result feel believable?" — stored per simulation so we can later
// find players/lineups/rating versions with high disbelief rates. Anonymous
// (uid) — no login required. Without a store: accepted and dropped (204).
import { hasStore, pipeline, setNX, rateLimit, clientIp, dayKey, getJSON, setJSON } from "./_lib/store.js";
import { previewIdentity } from "./_lib/previewAccessCheck.js";
import { previewCandidateIdentity } from "./_lib/previewEngine.js";
import { sameOrigin } from "./_lib/session.js";
import { flags } from "./_lib/flags.js";
import { cleanText } from "./_lib/validate.js";
import { previewEvent } from "./_lib/previewTelemetry.js";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { WAVE2, WAVE2_TASKS, WAVE2_RATINGS, WAVE2_ISSUE_CATEGORIES, WAVE2_COMMENT_MAX, cohortOf } from "../src/wave2.js";

const CATEGORIES = new Set([
  "player_rating_wrong", "chemistry_wrong", "result_unrealistic",
  "box_score_wrong", "player_data_wrong", "other",
]);

// ── Structured preview feedback (Wave 1, schema v2) ──────────────────────────
// Same route, same rate limits — a separate, stricter shape stored ONLY under
// the preview-feedback namespace. Tester and candidate identity are SERVER
// authoritative (session cookie / lock constants); client-sent values for
// those fields are ignored. Pure validator, exported for tests.
export const FEEDBACK_SCHEMA_VERSION = 2;
// The Wave 1 shape is kept verbatim for the frozen wave1 branch's records; on
// this branch the wave id is the deployment's (config/previewAccess.js).
export const WAVE_ID = PREVIEW_ACCESS.waveId;
export const PREVIEW_ISSUE_CATEGORIES = new Set(["NONE", "CRASH_OR_ERROR", "IMPOSSIBLE_RESULT",
  "BASKETBALL_CREDIBILITY", "TEAM_IDENTITY", "COACH_IDENTITY", "ERA_STYLE",
  "POSTGAME_EXPLANATION", "UI_FRICTION", "MOBILE", "PERFORMANCE", "OTHER"]);
const RATING_FIELDS = ["resultBelievability", "teamIdentityFeltAccurate", "coachDifferenceFeltMeaningful",
  "eraStyleFeltMeaningful", "postgameExplanationHelpful"];
const SCENARIO_SHAPE = /^w1-s[1-8]$/;
export const validatePreviewFeedback = (b) => {
  if (!b || typeof b !== "object") return null;
  if (typeof b.resultId !== "string" || !/^pv_[a-z0-9]{6,16}$/.test(b.resultId)) return null;
  const rec = { resultId: b.resultId };
  for (const f of RATING_FIELDS) {
    const v = b[f];
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    rec[f] = v;
  }
  if (typeof b.wouldRematchOrShare !== "boolean") return null;
  rec.wouldRematchOrShare = b.wouldRematchOrShare;
  rec.scenarioId = SCENARIO_SHAPE.test(b.scenarioId) ? b.scenarioId : "FREE_FORM";
  rec.gameMode = typeof b.gameMode === "string" && b.gameMode.length <= 16 ? b.gameMode : "single";
  const cat = String(b.issueCategory ?? "NONE").toUpperCase();
  rec.issueCategory = PREVIEW_ISSUE_CATEGORIES.has(cat) ? cat : "NONE";
  if (b.optionalComment != null) {
    if (typeof b.optionalComment !== "string" || b.optionalComment.length > 500) return null;
    rec.optionalComment = cleanText(b.optionalComment, 500);
  }
  return rec;
};

// ── Wave 2 structured feedback (Phase 9A.3, schema v3) ───────────────────────
// Task-aware: the client sends the task it completed and ONLY that task's
// ratings; anything else about identity — wave, study, tester, cohort, session,
// candidate, theme, build — is SERVER authoritative and any client value for
// those fields is ignored. Stored only under the wave2-* namespace. Pure
// validator, exported for tests.
export const WAVE2_FEEDBACK_SCHEMA_VERSION = WAVE2.feedbackSchemaVersion;
const RESULT_SHAPE = /^pv_[a-z0-9]{6,16}$/;
export const validateWave2Feedback = (b) => {
  if (!b || typeof b !== "object") return null;
  const task = WAVE2_TASKS[b.taskId];
  if (!task) return null;
  const rec = { taskId: b.taskId, ratings: {} };
  for (const f of task.ratings) {
    const v = b.ratings?.[f];
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    rec.ratings[f] = v;
  }
  for (const f of Object.keys(b.ratings || {})) if (!(f in WAVE2_RATINGS)) return null;
  if (b.resultId != null) { if (typeof b.resultId !== "string" || !RESULT_SHAPE.test(b.resultId)) return null; rec.resultId = b.resultId; }
  if (task.needsResult && !rec.resultId) return null;
  rec.mode = typeof b.mode === "string" && /^[a-z0-9-]{1,16}$/.test(b.mode) ? b.mode : null;
  const cat = String(b.issueCategory ?? "NONE").toUpperCase();
  rec.issueCategory = WAVE2_ISSUE_CATEGORIES.includes(cat) ? cat : "NONE";
  if (b.optionalComment != null) {
    if (typeof b.optionalComment !== "string" || b.optionalComment.length > WAVE2_COMMENT_MAX) return null;
    rec.optionalComment = cleanText(b.optionalComment, WAVE2_COMMENT_MAX);
  }
  rec.clientBuildStamp = typeof b.clientBuildStamp === "string" && /^[A-Za-z0-9.:_-]{1,48}$/.test(b.clientBuildStamp) ? b.clientBuildStamp : null;
  return rec;
};
const serverBuildStamp = () => (process.env.VERCEL_GIT_COMMIT_SHA ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12) : "local");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!flags().feedback || flags().maintenance) return res.status(204).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: "Forbidden" });

  const b = req.body || {};

  if (b.kind === "wave2") {
    if (PREVIEW_ACCESS.waveId !== WAVE2.waveId) return res.status(404).json({ error: "not_this_wave" });
    const rec = validateWave2Feedback(b);
    if (!rec) return res.status(400).json({ error: "Invalid feedback." });
    const who = await previewIdentity(req.headers);
    if (!who.ok) return res.status(401).json({ error: "preview_access_required" });
    if (!hasStore()) return res.status(204).end();
    if (!(await rateLimit(`w2fb:${clientIp(req)}`, 10, 60))) return res.status(204).end();
    if (rec.resultId && !(await getJSON(`preview-result:${rec.resultId}`))) return res.status(404).json({ error: "unknown_preview_result" });
    const identity = previewCandidateIdentity();
    const primaryKey = `wave2-feedback:primary:${who.testerId}:${rec.taskId}${rec.resultId ? `:${rec.resultId}` : ""}`;
    const prior = await getJSON(primaryKey);
    const record = {
      feedbackSchemaVersion: WAVE2_FEEDBACK_SCHEMA_VERSION, waveId: WAVE2.waveId, studyVersion: WAVE2.studyVersion,
      testerId: who.testerId, cohort: who.cohort ?? cohortOf(who.testerId), sessionId: who.sid ?? null,
      candidateId: identity.candidateId, calibrationVersion: identity.possessionCalibrationVersion, candidateCoreHash: identity.coreHash,
      themeVersion: WAVE2.themeVersion, buildStamp: serverBuildStamp(),
      ...rec,
      revision: (prior?.revision ?? 0) + 1, createdAt: prior?.createdAt ?? Date.now(), submittedAt: Date.now(),
    };
    await setJSON(primaryKey, record, 60 * 60 * 24 * 180);
    await pipeline([
      ["LPUSH", "wave2-feedback:log", JSON.stringify(record)], ["LTRIM", "wave2-feedback:log", 0, 9999],
      ["HINCRBY", "wave2-feedback:categories", record.issueCategory, prior ? 0 : 1],
      ["HINCRBY", "wave2-metrics:counters", prior ? "feedback_resubmitted" : "feedback_submitted", 1],
      ["HINCRBY", `wave2-metrics:tasks:${WAVE2.waveId}:${record.cohort ?? "unknown"}`, record.taskId, prior ? 0 : 1],
    ]);
    previewEvent("preview_feedback_submitted", { waveId: WAVE2.waveId, testerId: who.testerId, taskId: rec.taskId, feedbackCategory: record.issueCategory, revision: record.revision });
    return res.status(204).end();
  }

  if (b.kind === "preview") {
    const rec = validatePreviewFeedback(b);
    if (!rec) return res.status(400).json({ error: "Invalid feedback." });
    // Tester identity is the SESSION's, never the payload's.
    const who = await previewIdentity(req.headers);
    if (!who.ok) return res.status(401).json({ error: "preview_access_required" });
    if (!hasStore()) return res.status(204).end();
    if (!(await rateLimit(`pvfb:${clientIp(req)}`, 10, 60))) return res.status(204).end();
    // The result must exist in the PREVIEW namespace (known + preview-only).
    const stored = await getJSON(`preview-result:${rec.resultId}`);
    if (!stored) return res.status(404).json({ error: "unknown_preview_result" });
    const identity = previewCandidateIdentity();
    const primaryKey = `preview-feedback:primary:${rec.resultId}:${who.testerId}`;
    const prior = await getJSON(primaryKey);
    const record = {
      feedbackSchemaVersion: FEEDBACK_SCHEMA_VERSION,
      waveId: WAVE_ID,
      testerId: who.testerId,
      sid: who.sid,
      ...rec,
      candidateId: identity.candidateId,
      calibrationVersion: identity.possessionCalibrationVersion,
      revision: (prior?.revision ?? 0) + 1,   // resubmission REPLACES the primary record
      createdAt: prior?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await setJSON(primaryKey, record, 60 * 60 * 24 * 120);
    await pipeline([
      ["LPUSH", "preview-feedback:log", JSON.stringify(record)],
      ["LTRIM", "preview-feedback:log", 0, 9999],
      ["HINCRBY", "preview-feedback:categories", record.issueCategory, prior ? 0 : 1],
      ["SADD", "preview-feedback:results", rec.resultId],
      ["HINCRBY", "preview-metrics:counters", prior ? "feedback_resubmitted" : "feedback_submitted", 1],
      ["HINCRBY", "preview-metrics:scenario-feedback", record.scenarioId, prior ? 0 : 1],
      ["HINCRBY", "preview-metrics:counters", record.wouldRematchOrShare ? "would_rematch_yes" : "would_rematch_no", 1],
    ]);
    previewEvent("preview_feedback_submitted", { resultId: rec.resultId, testerId: who.testerId,
      scenarioId: record.scenarioId, feedbackCategory: record.issueCategory, feedbackRating: record.resultBelievability });
    return res.status(204).end();
  }

  const believable = b.believable === true || b.believable === false ? b.believable : null;
  if (believable === null || typeof b.simulation_id !== "string" || b.simulation_id.length > 64) {
    return res.status(400).json({ error: "Invalid feedback." });
  }
  if (!hasStore()) return res.status(204).end();
  if (!(await rateLimit(`fb:${clientIp(req)}`, 20, 60))) return res.status(204).end();

  // One feedback per simulation per user
  const uid = typeof b.uid === "string" ? b.uid.slice(0, 64) : "anon";
  const first = await setNX(`fb:seen:${b.simulation_id}:${uid}`, 1, 60 * 60 * 24 * 7);
  if (!first) return res.status(204).end();

  const record = {
    simulation_id: b.simulation_id,
    uid,
    believable,
    category: CATEGORIES.has(b.category) ? b.category : undefined,
    comment: typeof b.comment === "string" ? cleanText(b.comment, 280) : undefined,
    mode: typeof b.mode === "string" ? b.mode.slice(0, 24) : undefined,
    my_team: Array.isArray(b.my_team) ? b.my_team.slice(0, 5).map(String) : undefined,
    opp_team: Array.isArray(b.opp_team) ? b.opp_team.slice(0, 5).map(String) : undefined,
    versions: typeof b.versions === "object" && b.versions ? b.versions : undefined,
    ts: Date.now(),
  };

  const day = dayKey();
  const cmds = [
    ["LPUSH", "fb:log", JSON.stringify(record)],
    ["LTRIM", "fb:log", 0, 99999],
    ["HINCRBY", `fb:counts:${day}`, believable ? "yes" : "no", 1],
  ];
  // Per-player disbelief counters — the calibration signal
  if (!believable && record.my_team) {
    for (const id of [...(record.my_team || []), ...(record.opp_team || [])]) {
      cmds.push(["ZINCRBY", "fb:player_disbelief", 1, id]);
    }
  }
  if (!believable && record.category) cmds.push(["HINCRBY", "fb:categories", record.category, 1]);
  await pipeline(cmds);
  return res.status(204).end();
}
