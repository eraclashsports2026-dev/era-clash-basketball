// ── Shareable result records ───────────────────────────────────────────────────
// Stores a public, immutable snapshot of a finished game so /result/{id} can be
// opened by anyone (no auth). Without a store: 503 — the client then shares a
// plain challenge link instead.
//   POST {result:{...}} → {id}
//   GET  ?id=<id>       → result snapshot
import { hasStore, getJSON, setJSON, newId, rateLimit, clientIp } from "./_lib/store.js";
import { PLAYERS } from "../src/players.js";

const TTL = 60 * 60 * 24 * 180;
const KEY = (id) => `re:${id}`;

const validIds = (ids) =>
  Array.isArray(ids) && ids.length === 5 && ids.every((id) => PLAYERS.some((p) => p.id === id));

const sanitize = (r = {}) => {
  if (!validIds(r.teamIds)) return null;
  return {
    v: 1,
    kind: ["single", "best7", "82", "daily", "challenge", "tournament"].includes(r.kind) ? r.kind : "single",
    teamIds: r.teamIds,
    oppIds: validIds(r.oppIds) ? r.oppIds : null,
    won: !!r.won,
    scoreline: typeof r.scoreline === "string" ? r.scoreline.slice(0, 20) : "",
    mvp: typeof r.mvp === "string" ? r.mvp.slice(0, 40) : null,
    mvpLine: typeof r.mvpLine === "string" ? r.mvpLine.slice(0, 60) : null,
    headline: typeof r.headline === "string" ? r.headline.slice(0, 80) : "",
    insight: typeof r.insight === "string" ? r.insight.slice(0, 200) : "",
    rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
    chemistry: typeof r.chemistry === "string" ? r.chemistry.slice(0, 10) : null,
    name: typeof r.name === "string" ? r.name.replace(/[<>]/g, "").slice(0, 24) : null,
    challengeId: typeof r.challengeId === "string" && /^[a-z0-9]{6,16}$/.test(r.challengeId) ? r.challengeId : null,
    ts: Date.now(),
  };
};

export default async function handler(req, res) {
  if (!hasStore()) return res.status(503).json({ error: "Result sharing not configured." });

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: "Bad id." });
    const r = await getJSON(KEY(id));
    if (!r) return res.status(404).json({ error: "Result not found or expired." });
    return res.status(200).json(r);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(`re:${clientIp(req)}`, 20, 60))) return res.status(429).json({ error: "Too many requests." });

  const clean = sanitize(req.body?.result);
  if (!clean) return res.status(400).json({ error: "Invalid result." });
  const id = newId(10);
  await setJSON(KEY(id), clean, TTL);
  return res.status(200).json({ id });
}
