// ── Daily Challenge server side ────────────────────────────────────────────────
// One official attempt per uid per day (enforced with SET NX — a refresh or
// duplicate submit can't double-enter), plus a per-day leaderboard.
//   POST {action:"submit", uid, name?, date, won, margin, score}  → {rank, entries}
//   GET  ?date=YYYYMMDD                                           → {board, count}
// The official attempt is only recorded HERE, after a simulation successfully
// completed — a failed API call never consumes it. Without a store: 503 and
// the client keeps its local-only daily behavior.
import { hasStore, cmd, pipeline, setNX, rateLimit, clientIp, dayKey } from "./_lib/store.js";

const TTL = 60 * 60 * 24 * 40;
const validDate = (d) => /^\d{8}$/.test(d);

export default async function handler(req, res) {
  if (!hasStore()) return res.status(503).json({ error: "Daily service not configured." });

  if (req.method === "GET") {
    const date = String(req.query?.date || dayKey());
    if (!validDate(date)) return res.status(400).json({ error: "Bad date." });
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
    return res.status(200).json({ date, board, count: Number(count) || 0 });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(`dl:${clientIp(req)}`, 10, 60))) return res.status(429).json({ error: "Too many requests." });

  const b = req.body || {};
  if (b.action !== "submit") return res.status(400).json({ error: "Unknown action." });
  const uid = typeof b.uid === "string" && b.uid.length <= 64 ? b.uid : null;
  const date = String(b.date || "");
  if (!uid || !validDate(date)) return res.status(400).json({ error: "Invalid submission." });
  // Only today (UTC) may be submitted — no back-filling streaks.
  if (date !== dayKey()) return res.status(400).json({ error: "That challenge day is closed." });

  const won = b.won === true;
  const margin = Math.max(-50, Math.min(50, Number(b.margin) || 0));
  const score = (won ? 1000 : 0) + 500 + margin;

  // One official attempt per uid per day.
  const first = await setNX(`dl:${date}:user:${uid}`, { won, margin, ts: Date.now() }, TTL);
  if (!first) return res.status(409).json({ error: "Official attempt already recorded today." });

  const name = (typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 24) : "Anonymous")
    .replace(/[:\n\r]/g, "");
  await pipeline([
    ["ZADD", `dl:${date}:board`, score, `${name}::${uid.slice(0, 12)}`],
    ["EXPIRE", `dl:${date}:board`, TTL],
  ]);
  const rank = await cmd("ZREVRANK", `dl:${date}:board`, `${name}::${uid.slice(0, 12)}`);
  return res.status(200).json({ ok: true, score, rank: rank == null ? null : Number(rank) + 1 });
}
