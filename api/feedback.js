// ── Simulation believability feedback ─────────────────────────────────────────
// "Did this result feel believable?" — stored per simulation so we can later
// find players/lineups/rating versions with high disbelief rates. Anonymous
// (uid) — no login required. Without a store: accepted and dropped (204).
import { hasStore, pipeline, setNX, rateLimit, clientIp, dayKey } from "./_lib/store.js";
import { sameOrigin } from "./_lib/session.js";
import { flags } from "./_lib/flags.js";
import { cleanText } from "./_lib/validate.js";
import { previewEvent } from "./_lib/previewTelemetry.js";

const CATEGORIES = new Set([
  "player_rating_wrong", "chemistry_wrong", "result_unrealistic",
  "box_score_wrong", "player_data_wrong", "other",
]);

// ── Structured preview feedback (Candidate 3 protected preview) ──────────────
// Same route, same rate limits, same anonymity — a separate, stricter shape
// stored ONLY under the preview-feedback namespace. Pure validator, exported
// for tests. Returns the clean record or null.
const RATING_FIELDS = ["resultBelievability", "teamIdentityFeltAccurate", "coachDifferenceFeltMeaningful",
  "eraStyleFeltMeaningful", "postgameExplanationHelpful"];
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
  rec.issueCategory = b.issueCategory === "none" || CATEGORIES.has(b.issueCategory) ? b.issueCategory : "none";
  if (b.optionalComment != null) {
    if (typeof b.optionalComment !== "string" || b.optionalComment.length > 500) return null;
    rec.optionalComment = cleanText(b.optionalComment, 500);
  }
  return rec;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!flags().feedback || flags().maintenance) return res.status(204).end();
  if (!sameOrigin(req)) return res.status(403).json({ error: "Forbidden" });

  const b = req.body || {};

  if (b.kind === "preview") {
    const rec = validatePreviewFeedback(b);
    if (!rec) return res.status(400).json({ error: "Invalid feedback." });
    if (!hasStore()) return res.status(204).end();
    if (!(await rateLimit(`pvfb:${clientIp(req)}`, 10, 60))) return res.status(204).end();
    const uid = typeof b.uid === "string" ? b.uid.slice(0, 64) : "anon";
    const first = await setNX(`preview-feedback:seen:${rec.resultId}:${uid}`, 1, 60 * 60 * 24 * 30);
    if (!first) return res.status(204).end();
    await pipeline([
      ["LPUSH", "preview-feedback:log", JSON.stringify({ ...rec, uid, ts: Date.now() })],
      ["LTRIM", "preview-feedback:log", 0, 9999],
      ["HINCRBY", "preview-feedback:categories", rec.issueCategory, 1],
    ]);
    previewEvent("preview_feedback_submitted", { resultId: rec.resultId,
      feedbackCategory: rec.issueCategory, feedbackRating: rec.resultBelievability });
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
