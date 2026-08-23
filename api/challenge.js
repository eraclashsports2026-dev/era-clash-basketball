// ── Persistent challenge entities ─────────────────────────────────────────────
// A challenge is a server-side rivalry record, not just a URL payload:
//   POST {action:"create", challenger:{uid?, name?, teamIds, record?}}      → {id}
//   GET  ?id=<id>                                                           → challenge
//   POST {action:"complete", id, opponent:{uid?, name?, teamIds}, game:{winner, score, mvp?}}
//        appends a game to the rivalry chain ("Run It Back" = another complete)
// Guests are first-class: uid/name optional everywhere. Without a store the
// endpoint returns 503 and the client falls back to the v2 URL-encoded links.
import { hasStore, getJSON, setJSON, newId, rateLimit, clientIp } from "./_lib/store.js";
import { PLAYERS } from "../src/players.js";

const TTL = 60 * 60 * 24 * 90; // 90 days
const KEY = (id) => `ch:${id}`;

const validTeamIds = (ids) =>
  Array.isArray(ids) && ids.length === 5 && ids.every((id) => PLAYERS.some((p) => p.id === id));

const cleanParty = (p = {}) => ({
  uid: typeof p.uid === "string" ? p.uid.slice(0, 64) : null,
  name: typeof p.name === "string" ? p.name.slice(0, 24) : null,
  teamIds: p.teamIds,
  record: typeof p.record === "string" ? p.record.slice(0, 16) : null,
});

export default async function handler(req, res) {
  if (!hasStore()) return res.status(503).json({ error: "Challenge service not configured." });

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: "Bad id." });
    const ch = await getJSON(KEY(id));
    if (!ch) return res.status(404).json({ error: "Challenge not found or expired." });
    return res.status(200).json(ch);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(`ch:${clientIp(req)}`, 30, 60))) {
    return res.status(429).json({ error: "Too many requests." });
  }

  const b = req.body || {};

  if (b.action === "create") {
    const challenger = cleanParty(b.challenger);
    if (!validTeamIds(challenger.teamIds)) return res.status(400).json({ error: "Invalid team." });
    const id = newId(10);
    const ch = {
      v: 1,
      id,
      status: "open",
      created_at: Date.now(),
      challenger,
      opponent: null,
      games: [],
      record: { challenger: 0, opponent: 0 },
    };
    await setJSON(KEY(id), ch, TTL);
    return res.status(200).json({ id });
  }

  if (b.action === "complete") {
    const id = String(b.id || "");
    if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: "Bad id." });
    const ch = await getJSON(KEY(id));
    if (!ch) return res.status(404).json({ error: "Challenge not found or expired." });

    const game = b.game || {};
    if (game.winner !== "challenger" && game.winner !== "opponent") {
      return res.status(400).json({ error: "Invalid game result." });
    }
    if (typeof game.score !== "string" || !/^\d{2,3}\s*-\s*\d{2,3}$/.test(game.score)) {
      return res.status(400).json({ error: "Invalid score." });
    }
    if (!ch.opponent) {
      const opponent = cleanParty(b.opponent);
      if (!validTeamIds(opponent.teamIds)) return res.status(400).json({ error: "Invalid opponent team." });
      ch.opponent = opponent;
    }
    if (ch.games.length >= 50) return res.status(400).json({ error: "Rivalry is full." });

    ch.games.push({
      winner: game.winner,
      score: game.score.replace(/\s/g, ""),
      mvp: typeof game.mvp === "string" ? game.mvp.slice(0, 40) : null,
      ts: Date.now(),
    });
    ch.record[game.winner] += 1;
    ch.status = "played";
    await setJSON(KEY(id), ch, TTL);
    return res.status(200).json(ch);
  }

  return res.status(400).json({ error: "Unknown action." });
}
