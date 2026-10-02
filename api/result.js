// Explicit public recap publication. Browser scores and names are never input.
import { hasStore, getJSON, rateLimit, clientIp } from "./_lib/store.js";
import { getSession, sameOrigin } from "./_lib/session.js";
import { publishOwnedRecap, validShareId } from "./_lib/loopShare.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasStore()) return res.status(503).json({ error: "Result sharing not configured." });
  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (!validShareId(id)) return res.status(400).json({ error: "Bad id." });
    const r = await getJSON(`re:${id}`);
    if (!r) return res.status(404).json({ error: "Result not found or expired." });
    return res.status(200).json(r);
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: "Origin mismatch." });
  if (!(await rateLimit(`re:${clientIp(req)}`, 20, 60))) return res.status(429).json({ error: "Too many requests." });
  if (req.body?.result) return res.status(400).json({ error: "Publish a completed resultId; browser snapshots are not accepted." });
  const out = await publishOwnedRecap({ resultId: req.body?.resultId, chaosRunId: req.body?.chaosRunId, session: getSession(req), consent: req.body?.publicRecap });
  const code = { published: 200, consent_required: 400, not_your_result: 403, not_found: 404, not_simulated: 409, store_unavailable: 503 }[out.status] || 503;
  return res.status(code).json(out);
}
