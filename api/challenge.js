// ── Persistent challenges — create + read ─────────────────────────────────────
// v2.3: the "complete" action is GONE from this endpoint. Challenge games are
// appended ONLY by /api/game from its own stored result — the browser can no
// longer post a winner/score. Completed games are append-only and immutable;
// rematches add new games to the rivalry chain.
//
//   POST {action:"create", teamIds, record?, name?}  → {id}   (session-stamped)
//   GET  ?id=<id>                                    → public challenge view
import { hasStore, getJSON, setJSON, newId, rateLimit, clientIp } from "./_lib/store.js";
import { getOrCreateSession, sameOrigin } from "./_lib/session.js";
import { sendError, newRequestId } from "./_lib/errors.js";
import { flags, limits } from "./_lib/flags.js";
import { tooLarge, validateTeamIds, validChallengeId, cleanName } from "./_lib/validate.js";

const TTL = 60 * 60 * 24 * 90;

// Public view never exposes session identifiers.
const publicView = (ch) => ({
  v: ch.v, id: ch.id, status: ch.status, created_at: ch.created_at,
  challenger: { name: ch.challenger?.name || null, teamIds: ch.challenger?.teamIds, record: ch.challenger?.record || null },
  opponent: ch.opponent ? { name: ch.opponent.name || null, teamIds: ch.opponent.teamIds } : null,
  games: (ch.games || []).map((g) => ({ winner: g.winner, score: g.score, mvp: g.mvp, ts: g.ts })),
  record: ch.record,
});

export default async function handler(req, res) {
  const requestId = newRequestId();
  if (!hasStore()) return sendError(res, "KV_UNAVAILABLE", requestId);

  if (req.method === "GET") {
    const id = validChallengeId(String(req.query?.id || ""));
    if (!id) return sendError(res, "VALIDATION_FAILURE", requestId);
    const ch = await getJSON(`ch:${id}`);
    if (!ch) return sendError(res, "NOT_FOUND", requestId);
    res.setHeader("Cache-Control", "no-store"); // rivalry state changes
    return res.status(200).json(publicView(ch));
  }

  if (req.method !== "POST") return sendError(res, "VALIDATION_FAILURE", requestId);
  const f = flags();
  if (f.maintenance) return sendError(res, "MAINTENANCE", requestId);
  if (!f.challenges) return sendError(res, "FEATURE_DISABLED", requestId);
  if (!sameOrigin(req)) return sendError(res, "FORBIDDEN", requestId);
  if (tooLarge(req, 2048)) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);
  if (!(await rateLimit(`ch:${clientIp(req)}`, limits().challengePerMinIp, 60))) {
    return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });
  }

  const session = getOrCreateSession(req, res);
  const b = req.body || {};
  if (b.action !== "create") return sendError(res, "VALIDATION_FAILURE", requestId);
  const team = validateTeamIds(b.teamIds);
  if (!team) return sendError(res, "VALIDATION_FAILURE", requestId);

  const id = newId(10); // crypto-random, high entropy (36^10)
  const ch = {
    v: 2,
    id,
    status: "open",
    created_at: Date.now(),
    challenger: {
      session: session.slice(0, 16), // ownership stamp (never exposed publicly)
      name: cleanName(b.name) || null,
      teamIds: team.map((p) => p.id),
      record: typeof b.record === "string" ? b.record.slice(0, 16).replace(/[<>]/g, "") : null,
    },
    opponent: null,
    games: [],
    record: { challenger: 0, opponent: 0 },
  };
  await setJSON(`ch:${id}`, ch, TTL);
  return res.status(200).json({ id });
}
