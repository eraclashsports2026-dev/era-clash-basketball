// ── Simulation believability feedback ─────────────────────────────────────────
// "Did this result feel believable?" — stored per simulation so we can later
// find players/lineups/rating versions with high disbelief rates. Anonymous
// (uid) — no login required. Without a store: accepted and dropped (204).
import { hasStore, pipeline, setNX, rateLimit, clientIp, dayKey } from "./_lib/store.js";

const CATEGORIES = new Set([
  "player_rating_wrong", "chemistry_wrong", "result_unrealistic",
  "box_score_wrong", "player_data_wrong", "other",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body || {};
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
    comment: typeof b.comment === "string" ? b.comment.slice(0, 280) : undefined,
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
