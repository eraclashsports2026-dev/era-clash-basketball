// ── Cloud career persistence ───────────────────────────────────────────────────
// "Save your EraClash career": guests play free; when they claim a name, their
// existing localStorage progress is pushed here and kept in sync.
//   GET  ?uid=<uid>          → profile or 404
//   POST {uid, profile:{..}} → merged + stored
// Identity is the anonymous uid (device-scoped). Real cross-device auth is a
// deferred CEO decision (see docs/RELEASE-v2.1.md); this schema is designed so
// an auth provider can later map user→uid without migration.
import { hasStore, getJSON, setJSON, rateLimit, clientIp } from "./_lib/store.js";

const KEY = (uid) => `pf:${uid}`;
const MAX_BYTES = 30_000;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Whitelist + clamp everything the client sends; never trust shapes.
const sanitize = (p = {}) => ({
  v: 1,
  name: typeof p.name === "string" ? p.name.slice(0, 24) : "",
  created_at: num(p.created_at) || Date.now(),
  updated_at: Date.now(),
  stats: {
    gamesPlayed: num(p.stats?.gamesPlayed),
    wins: num(p.stats?.wins),
    losses: num(p.stats?.losses),
    bestWin82: num(p.stats?.bestWin82),
    best7Wins: num(p.stats?.best7Wins),
    best7Losses: num(p.stats?.best7Losses),
    challengeWins: num(p.stats?.challengeWins),
    challengeLosses: num(p.stats?.challengeLosses),
    tournamentWins: num(p.stats?.tournamentWins),
    dailyStreak: num(p.stats?.dailyStreak),
    longestDailyStreak: num(p.stats?.longestDailyStreak),
  },
  badges: Array.isArray(p.badges) ? p.badges.slice(0, 40).map((b) => String(b).slice(0, 32)) : [],
  draftCounts: typeof p.draftCounts === "object" && p.draftCounts
    ? Object.fromEntries(Object.entries(p.draftCounts).slice(0, 400).map(([k, v]) => [String(k).slice(0, 32), num(v)]))
    : {},
  recentGames: Array.isArray(p.recentGames)
    ? p.recentGames.slice(0, 20).map((g) => ({
        w: !!g.w,
        mode: String(g.mode || "").slice(0, 20),
        score: String(g.score || "").slice(0, 12),
        mvp: String(g.mvp || "").slice(0, 40),
        vs: String(g.vs || "").slice(0, 24),
        ts: num(g.ts),
      }))
    : [],
  savedTeams: Array.isArray(p.savedTeams)
    ? p.savedTeams.slice(0, 12).map((t) => ({
        name: String(t.name || "").slice(0, 30),
        ids: Array.isArray(t.ids) ? t.ids.slice(0, 5).map((id) => String(id).slice(0, 32)) : [],
        rating: num(t.rating),
      }))
    : [],
  daily: typeof p.daily === "object" && p.daily
    ? Object.fromEntries(Object.entries(p.daily).slice(-60).map(([k, v]) => [String(k).slice(0, 8), { won: !!v?.won }]))
    : {},
});

export default async function handler(req, res) {
  if (!hasStore()) return res.status(503).json({ error: "Profile service not configured." });

  const uid = String((req.method === "GET" ? req.query?.uid : req.body?.uid) || "");
  if (!uid || uid.length > 64) return res.status(400).json({ error: "Bad uid." });

  if (req.method === "GET") {
    const profile = await getJSON(KEY(uid));
    if (!profile) return res.status(404).json({ error: "No profile." });
    return res.status(200).json(profile);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(`pf:${clientIp(req)}`, 20, 60))) return res.status(429).json({ error: "Too many requests." });

  const clean = sanitize(req.body?.profile);
  const existing = await getJSON(KEY(uid));
  if (existing?.created_at) clean.created_at = existing.created_at;
  // Server-side monotonic guards: never let a stale device downgrade records.
  if (existing?.stats) {
    for (const k of ["bestWin82", "longestDailyStreak", "tournamentWins", "gamesPlayed", "wins", "losses"]) {
      clean.stats[k] = Math.max(clean.stats[k], num(existing.stats[k]));
    }
  }
  if (JSON.stringify(clean).length > MAX_BYTES) return res.status(413).json({ error: "Profile too large." });
  await setJSON(KEY(uid), clean);
  return res.status(200).json(clean);
}
