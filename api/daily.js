// ── Daily Challenge — public board reads ONLY ─────────────────────────────────
// v2.3: the POST submit path is GONE. Daily attempts are claimed atomically
// inside /api/game from the server-computed result (server UTC date, one
// SET NX claim per session). The browser can no longer submit a won/margin.
import { hasStore, pipeline, dayKey } from "./_lib/store.js";
import { sendError, newRequestId } from "./_lib/errors.js";
import { flags } from "./_lib/flags.js";

const validDate = (d) => /^\d{8}$/.test(d);

export default async function handler(req, res) {
  const requestId = newRequestId();
  if (req.method !== "GET") return sendError(res, "VALIDATION_FAILURE", requestId);
  if (!flags().leaderboard) return res.status(200).json({ date: dayKey(), board: [], count: 0, disabled: true });
  if (!hasStore()) return sendError(res, "KV_UNAVAILABLE", requestId);

  const date = String(req.query?.date || dayKey());
  if (!validDate(date)) return sendError(res, "VALIDATION_FAILURE", requestId);
  const [raw, count] = (await pipeline([
    ["ZREVRANGE", `dl:${date}:board`, 0, 19, "WITHSCORES"],
    ["ZCARD", `dl:${date}:board`],
  ])) || [null, 0];
  const board = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      const [name] = String(raw[i]).split("::");
      board.push({ name: name || "Anonymous", score: Number(raw[i + 1]) });
    }
  }
  res.setHeader("Cache-Control", "public, max-age=30");
  return res.status(200).json({ date, board, count: Number(count) || 0 });
}
