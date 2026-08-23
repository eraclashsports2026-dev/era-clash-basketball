// ── /api/game — THE authoritative simulation endpoint ─────────────────────────
// The client sends player IDs, a mode, and a request id. The server validates
// against canonical data, runs the deterministic engine, stores an IMMUTABLE
// result, and applies every record update (daily claim, challenge game,
// leaderboard) from its own stored result. Client-supplied winners, scores,
// stats, ratings, uids, or streaks are never read.
//
// Reliability: this endpoint has NO AI dependency. Narration is a separate,
// optional call (/api/narrative). An AI outage cannot fail a game here.
import { hasStore, getJSON, setJSON, setNX, cmd, pipeline, rateLimit, clientIp, newId } from "./_lib/store.js";
import { getOrCreateSession, sameOrigin } from "./_lib/session.js";
import { sendError, newRequestId, logReq } from "./_lib/errors.js";
import { flags, limits } from "./_lib/flags.js";
import { tooLarge, MODES, validateTeamIds, validSimId, validChallengeId, cleanName } from "./_lib/validate.js";
import { computeResult, dailyScore, newSeed } from "./_lib/game-core.js";
import { computeResultV3 } from "./_lib/game-core-v3.js";
import { validCoachId, validEraId } from "./_lib/validate.js";
import { utcDateKey, verifyDailyLineup } from "../src/dailyChallenge.js";

const RESULT_TTL = 60 * 60 * 24 * 180;
const IDEM_TTL = 60 * 60 * 24;

const chaosHeader = (req) =>
  process.env.ENABLE_CHAOS_TESTS === "true" && process.env.NODE_ENV !== "production"
    ? String(req.headers["x-chaos"] || "") : "";

// Public, sanitized view of a stored result (never expose the owner session).
const publicResult = (r) => { const { session, ...rest } = r; return rest; };

export default async function handler(req, res) {
  const requestId = newRequestId();
  const started = Date.now();
  const f = flags();

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (!/^[a-z0-9]{6,16}$/.test(id)) return sendError(res, "VALIDATION_FAILURE", requestId);
    const r = hasStore() ? await getJSON(`result:${id}`) : null;
    if (!r) return sendError(res, "NOT_FOUND", requestId);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(publicResult(r));
  }

  if (req.method !== "POST") return sendError(res, "VALIDATION_FAILURE", requestId);
  if (f.maintenance) return sendError(res, "MAINTENANCE", requestId);
  if (!sameOrigin(req)) return sendError(res, "FORBIDDEN", requestId);
  if (tooLarge(req, 4096)) return sendError(res, "PAYLOAD_TOO_LARGE", requestId);

  const session = getOrCreateSession(req, res);
  const chaos = chaosHeader(req);
  const L = limits();

  try {
    const b = req.body || {};
    const mode = MODES.has(b.mode) ? b.mode : null;
    const simulationId = validSimId(b.simulationId);
    if (!mode || !simulationId) return sendError(res, "VALIDATION_FAILURE", requestId);
    if (mode === "daily" && !f.daily) return sendError(res, "FEATURE_DISABLED", requestId);
    if (mode === "challenge" && !f.challenges) return sendError(res, "FEATURE_DISABLED", requestId);

    const gold = validateTeamIds(b.goldIds);
    if (!gold) return sendError(res, "VALIDATION_FAILURE", requestId);

    // Rate limits: session + IP + global core ceiling.
    const ip = clientIp(req);
    const allowed = await Promise.all([
      rateLimit(`sim:s:${session.slice(0, 16)}`, L.simPerMinSession, 60),
      rateLimit(`sim:ip:${ip}`, L.simPerMinIp, 60),
      rateLimit("sim:global", L.maxCoreSimsPerMinute, 60),
    ]);
    if (allowed.some((a) => !a)) return sendError(res, "RATE_LIMITED", requestId, { retryAfter: 30 });

    // Opponent resolution (server decides what's legal per mode).
    let blue = null;
    let challenge = null;
    if (mode === "challenge") {
      const challengeId = validChallengeId(b.challengeId);
      if (!challengeId || !hasStore()) return sendError(res, "VALIDATION_FAILURE", requestId);
      challenge = await getJSON(`ch:${challengeId}`);
      if (!challenge) return sendError(res, "NOT_FOUND", requestId);
      if ((challenge.games || []).length >= 50) return sendError(res, "FORBIDDEN", requestId);
      blue = validateTeamIds(challenge.challenger?.teamIds); // authoritative: the stored rival five
      if (!blue) return sendError(res, "VALIDATION_FAILURE", requestId);
    } else if (mode === "single" || mode === "best7" || mode === "daily") {
      blue = validateTeamIds(b.blueIds);
      if (!blue) return sendError(res, "VALIDATION_FAILURE", requestId);
    } // 82/tournament: opponents generated server-side in computeResult

    // Daily gates: server UTC date is the ONLY date; the submitted lineup must
    // be legally reachable from today's official seeded draft (the server
    // replays the client's keep/re-spin decisions through the shared pure
    // generator). Client-supplied seeds/dates are never read. A rejected
    // lineup never consumes the official attempt.
    const today = utcDateKey();
    if (mode === "daily") {
      const legal = verifyDailyLineup(today, b.dailyDecisions, gold.map((p) => p.id));
      if (!legal.ok) {
        logReq({ requestId, route: "game", mode, status: 400, error_code: "DAILY_INVALID_LINEUP", reason: legal.reason });
        return sendError(res, "DAILY_INVALID_LINEUP", requestId);
      }
      if (hasStore()) {
        const existing = await getJSON(`daily:claim:${today}:${session}`);
        if (existing) return sendError(res, "IDEMPOTENCY_CONFLICT", requestId);
      }
    }

    // Idempotency: same simulationId → same result, exactly once.
    if (hasStore()) {
      const claimed = await setNX(`idem:${simulationId}`, { status: "pending", session, ts: Date.now() }, IDEM_TTL);
      if (!claimed) {
        const idem = await getJSON(`idem:${simulationId}`);
        if (idem?.resultId) {
          const prior = await getJSON(`result:${idem.resultId}`);
          if (prior) return res.status(200).json({ requestId, resultId: idem.resultId, result: publicResult(prior), records: idem.records || null, replayed: true });
        }
        return sendError(res, "IDEMPOTENCY_CONFLICT", requestId);
      }
    }

    if (chaos === "engine-fail") throw new Error("chaos engine failure");

    // ── Compute the authoritative result ────────────────────────────────────
    const seed = newSeed();
    // V3 possession engine (flag-gated; preview-only by default). Coach and
    // Era Style ids are validated and loaded canonically server-side — the
    // browser cannot author coach attributes or era modifiers.
    const computed = f.simV3
      ? computeResultV3(mode, gold, blue, {
          coachGoldId: validCoachId(b.coachGoldId) || "neutral",
          coachBlueId: validCoachId(b.coachBlueId) || "neutral",
          eraStyleId: validEraId(b.eraStyleId) || undefined,
          dailyDate: mode === "daily" ? today : undefined,
        }, seed)
      : computeResult(mode, gold, blue, seed);
    const resultId = newId(10);
    const record = {
      v: 1,
      id: resultId,
      session,
      mode,
      goldIds: gold.map((p) => p.id),
      blueIds: blue ? blue.map((p) => p.id) : computed.blueIds || null,
      ...computed,
      challengeId: challenge ? challenge.id : null,
      dailyDate: mode === "daily" ? today : null,
      core_result_status: "complete",
      narrative_status: "not_requested",
      created_at: Date.now(),
    };

    // ── Persist immutably + apply record updates from OUR result ────────────
    const records = { persisted: false, daily: null, challenge: null };
    const kvDown = chaos === "kv-down" || !hasStore();
    if (!kvDown) {
      await setJSON(`result:${resultId}`, record, RESULT_TTL); // written once, never rewritten
      records.persisted = true;

      if (mode === "daily") {
        // atomic claim AFTER a stored, valid result — a failed request never burns it
        const claimed = await setNX(`daily:claim:${today}:${session}`, { resultId, ts: Date.now() }, 60 * 60 * 24 * 40);
        if (claimed) {
          const score = dailyScore(record);
          const name = cleanName(b.displayName) || "Anonymous";
          const member = `${name.replace(/[:\n\r]/g, "")}::${session.slice(0, 10)}`;
          await pipeline([
            ["ZADD", `dl:${today}:board`, score, member],
            ["EXPIRE", `dl:${today}:board`, 60 * 60 * 24 * 40],
          ]);
          const rank = await cmd("ZREVRANK", `dl:${today}:board`, member);
          records.daily = { claimed: true, score, rank: rank == null ? null : Number(rank) + 1, won: record.core.winner === "Gold" };
        } else {
          records.daily = { claimed: false, reason: "already_completed" };
        }
      }

      if (mode === "challenge" && challenge) {
        if (chaos !== "challenge-write-fail") {
          // append-only: completed games are immutable; rematches add new games
          const iWon = record.core.winner === "Gold";
          challenge.games = challenge.games || [];
          challenge.games.push({
            winner: iWon ? "opponent" : "challenger",
            score: record.core.seriesResult,
            mvp: record.core.mvp,
            resultId,
            ts: Date.now(),
          });
          challenge.record = challenge.record || { challenger: 0, opponent: 0 };
          challenge.record[iWon ? "opponent" : "challenger"] += 1;
          challenge.status = "played";
          if (!challenge.opponent) {
            challenge.opponent = { name: cleanName(b.displayName) || null, teamIds: record.goldIds, session: session.slice(0, 16) };
          }
          await setJSON(`ch:${challenge.id}`, challenge, 60 * 60 * 24 * 90);
          records.challenge = { record: challenge.record, games: challenge.games.length };
        } else {
          records.challenge = { record: null, error: "write_failed" }; // honest: no fabricated success
        }
      }

      await setJSON(`idem:${simulationId}`, { status: "complete", resultId, records, session }, IDEM_TTL);
    }

    logReq({ requestId, route: "game", mode, status: 200, ms: Date.now() - started, resultId, sim: simulationId.slice(0, 12), persisted: records.persisted });
    return res.status(200).json({ requestId, resultId, result: publicResult(record), records });
  } catch (err) {
    logReq({ requestId, route: "game", status: 500, ms: Date.now() - started, error_code: "ENGINE_FAILURE", msg: String(err?.message).slice(0, 200) });
    return sendError(res, "ENGINE_FAILURE", requestId);
  }
}
