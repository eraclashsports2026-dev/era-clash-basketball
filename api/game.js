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
import { computeResultPreview, PREVIEW_NAMESPACES, PREVIEW_RESULT_ID_PREFIX } from "./_lib/previewEngine.js";
import { previewIdentity } from "./_lib/previewAccessCheck.js";
import { previewEvent } from "./_lib/previewTelemetry.js";
import { validCoachId, validEraId } from "./_lib/validate.js";
import { validDifficulty } from "../src/v3/difficulty.js";
import { findDuplicatePerson } from "../src/v3/persons.js";
import { utcDateKey, verifyDailyLineup, dailyOpponent } from "../src/dailyChallenge.js";
// NOTE: dailyConfig is deliberately NOT imported here. Building a config in
// the game route is what split the Daily across a mid-day deploy; the route
// must read the stored record via officialDailyConfig().
import { dailySimulationSeed, validateDailySelection, validateDailyVersions } from "../src/v3/dailyCoachEra.js";
import { officialDailyConfig } from "./_lib/dailyOfficial.js";

const RESULT_TTL = 60 * 60 * 24 * 180;
const IDEM_TTL = 60 * 60 * 24;

const chaosHeader = (req) => {
  const v = String(req.headers["x-chaos"] || "");
  if (process.env.ENABLE_CHAOS_TESTS === "true" && process.env.NODE_ENV !== "production") return v;
  // A deployed Preview permits ONLY the preview-scoped failure injection so
  // the fallback drill can run against the real deployment. Production never
  // honors any chaos value.
  if (process.env.VERCEL_ENV === "preview" && v === "preview-fail") return v;
  return "";
};

// Public, sanitized view of a stored result (never expose the owner session).
const publicResult = (r) => { const { session, ...rest } = r; return rest; };

export default async function handler(req, res) {
  const requestId = newRequestId();
  const started = Date.now();
  const f = flags();

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    const isPreviewId = /^pv_[a-z0-9]{6,16}$/.test(id);
    if (!isPreviewId && !/^[a-z0-9]{6,16}$/.test(id)) return sendError(res, "VALIDATION_FAILURE", requestId);
    const r = hasStore() ? await getJSON(`${isPreviewId ? "preview-result" : "result"}:${id}`) : null;
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
    } else if (mode === "single" || mode === "best7") {
      blue = validateTeamIds(b.blueIds);
      if (!blue) return sendError(res, "VALIDATION_FAILURE", requestId);
    } // 82/tournament: opponents generated server-side in computeResult
    // Daily: the opponent is DERIVED from the day's seed, identical for every
    // player on Earth. Client-supplied blueIds are ignored — otherwise anyone
    // could hand-pick the weakest five and bank a near-maximum daily score.

    // Daily gates: server UTC date is the ONLY date; the submitted lineup must
    // be legally reachable from today's official seeded draft (the server
    // replays the client's keep/re-spin decisions through the shared pure
    // generator). Client-supplied seeds/dates are never read. A rejected
    // lineup never consumes the official attempt.
    const today = utcDateKey();
    let dailyCfg = null;   // set only when the coach/era Daily flag is on
    if (mode === "daily") {
      blue = dailyOpponent(today);
      const legal = verifyDailyLineup(today, b.dailyDecisions, gold.map((p) => p.id));
      if (!legal.ok) {
        logReq({ requestId, route: "game", mode, status: 400, error_code: "DAILY_INVALID_LINEUP", reason: legal.reason });
        return sendError(res, "DAILY_INVALID_LINEUP", requestId);
      }
      if (hasStore()) {
        const existing = await getJSON(`daily:claim:${today}:${session}`);
        if (existing) return sendError(res, "DAILY_ALREADY_COMPLETED", requestId);
      }

      // ── Official coach + Era Style (flag-gated, default OFF) ──────────────
      // When the flag is off none of this runs and the Daily behaves exactly as
      // before, which is the rollback path.
      //
      // Everything authoritative is SERVER-GENERATED. The client may submit a
      // coachId, and only a coachId, and only one drawn from today's official
      // options. The era, the option pool, the date, the seed and the data
      // versions are never the client's to supply.
      if (f.dailyCoachEra) {
        // The STORED record for today, not a fresh build from current
        // versions. A mid-day deploy must not hand the afternoon a different
        // era, different coaches, or a different derived seed than the morning.
        dailyCfg = (await officialDailyConfig(today)).config;
        const vers = validateDailyVersions({ config: dailyCfg, submitted: b.dailyVersions });
        if (!vers.ok) {
          logReq({ requestId, route: "game", mode, status: 409, error_code: vers.code, field: vers.field });
          return sendError(res, vers.code, requestId);
        }
        const sel = validateDailySelection({ config: dailyCfg, coachId: b.coachGoldId, eraStyleId: b.eraStyleId });
        if (!sel.ok) {
          logReq({ requestId, route: "game", mode, status: 400, error_code: sel.code, submitted: String(b.coachGoldId).slice(0, 40) });
          return sendError(res, sel.code, requestId);
        }
      }
    }

    // Idempotency: same simulationId → same result, exactly once.
    if (hasStore()) {
      const claimed = await setNX(`idem:${simulationId}`, { status: "pending", session, ts: Date.now() }, IDEM_TTL);
      if (!claimed) {
        const idem = await getJSON(`idem:${simulationId}`);
        if (idem?.resultId) {
          const prior = await getJSON(`${String(idem.resultId).startsWith("pv_") ? "preview-result" : "result"}:${idem.resultId}`);
          if (prior) return res.status(200).json({ requestId, resultId: idem.resultId, result: publicResult(prior), records: idem.records || null, replayed: true });
        }
        return sendError(res, "IDEMPOTENCY_CONFLICT", requestId);
      }
    }

    if (chaos === "engine-fail") throw new Error("chaos engine failure");

    // ── Compute the authoritative result ────────────────────────────────────
    // Duplicate-person rule: one team cannot field two era-versions of the
    // same person (jordan-80s + jordan-90s). The primary gate is
    // validateTeamIds (unique person names — long-standing shared behavior);
    // this V3 check is defense-in-depth with a specific error code. ACROSS
    // teams it is allowed — 80s Jordan vs 90s Jordan is a supported matchup.
    if (f.simV3) {
      const dupG = findDuplicatePerson(gold.map((p) => p.id));
      const dupB = blue ? findDuplicatePerson(blue.map((p) => p.id)) : null;
      if (dupG || dupB) {
        logReq({ requestId, route: "game", mode, status: 400, error_code: "DUPLICATE_PERSON", person: dupG || dupB });
        return sendError(res, "DUPLICATE_PERSON", requestId);
      }
    }
    // Daily seed policy: DERIVED from the official configuration and the
    // player's legal choices, never from session, browser, or request time.
    // Same decisions must reproduce the same game, and a refresh must not
    // reroll it. Every other mode keeps server-random variance so rematches
    // stay different.
    const seed = dailyCfg
      ? dailySimulationSeed({ config: dailyCfg, goldIds: gold.map((p) => p.id), coachId: b.coachGoldId }).seed
      : newSeed();
    // V3 possession engine (flag-gated; preview-only by default). Coach and
    // Era Style ids are validated and loaded canonically server-side — the
    // browser cannot author coach attributes or era modifiers.
    // ── Protected preview (default off) ─────────────────────────────────
    // When PREVIEW_SIM_ENGINE_ENABLED is true, single games run on the LOCKED
    // preview candidate. ANY preview failure — including out-of-scope modes —
    // falls back to the production engine for that request, so the preview can
    // never take a user request down. With the flag false (the default) this
    // block is skipped entirely and the code below is byte-identical to
    // pre-preview behavior.
    let previewComputed = null;
    if (f.previewSimEngine && f.simV3 && mode === "single" && blue && !dailyCfg) {
      if (hasStore()) await pipeline([["HINCRBY", "preview-metrics:counters", "games_started", 1]]).catch(() => {});
      const pvT0 = Date.now();
      const who = await previewIdentity(req.headers).catch(() => ({ ok: false }));
      const testerId = who.ok ? who.testerId : "unattributed";
      const sid = who.ok && who.sid ? who.sid : undefined;
      try {
        previewEvent("simulation_started", { mode });
        previewEvent("preview_game_started", { mode, waveId: "candidate3-wave1", testerId, sid });
        if (chaos === "preview-fail") {
          const err = new Error("preview chaos injection");
          err.code = "PREVIEW_CHAOS";
          throw err;
        }
        previewComputed = computeResultPreview(mode, gold, blue, {
          coachGoldId: validCoachId(b.coachGoldId) || "neutral",
          coachBlueId: validCoachId(b.coachBlueId) || "neutral",
          eraStyleId: validEraId(b.eraStyleId) || undefined,
        }, seed);
        previewEvent("preview_game_completed", { mode, waveId: "candidate3-wave1", testerId, sid,
          candidateId: previewComputed.candidate.candidateId,
          calibrationVersion: previewComputed.candidate.possessionCalibrationVersion,
          simulationLatency: Date.now() - pvT0, fallbackUsed: false });
      } catch (e) {
        previewComputed = null;
        previewEvent("fallback_invoked", { mode, reason: String(e.code ?? e.message).slice(0, 80) });
        previewEvent("preview_fallback_invoked", { mode, waveId: "candidate3-wave1", testerId, sid,
          reason: String(e.code ?? e.message).slice(0, 80), fallbackUsed: true });
        if (hasStore()) await pipeline([["HINCRBY", "preview-metrics:counters", "fallback_invoked", 1]]).catch(() => {});
      }
    }
    const computed = previewComputed ?? (f.simV3
      ? computeResultV3(mode, gold, blue, {
          // In a coach/era Daily the era is the OFFICIAL one and Blue takes the
          // neutral staff, so the puzzle is identical for everyone and the only
          // variable is the player's own coach choice.
          coachGoldId: dailyCfg ? b.coachGoldId : (validCoachId(b.coachGoldId) || "neutral"),
          coachBlueId: dailyCfg ? "neutral" : (validCoachId(b.coachBlueId) || "neutral"),
          eraStyleId: dailyCfg ? dailyCfg.officialEraStyleId : (validEraId(b.eraStyleId) || undefined),
          difficulty: validDifficulty(b.difficulty),
          dailyDate: mode === "daily" ? today : undefined,
          // The coach/era Daily derives its own seed above, including the
          // active data versions, so the engine must not re-derive a
          // version-blind one. One derivation, one owner.
          dailySeedPolicy: dailyCfg ? "caller-derived" : undefined,
        }, seed)
      : computeResult(mode, gold, blue, seed));
    // Preview results are namespaced end-to-end: a pv_ id, stored only under
    // preview-result:*. Production namespaces never hold a preview record.
    const resultId = (previewComputed ? PREVIEW_RESULT_ID_PREFIX : "") + newId(10);
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
      // Narrative identity for a coach/era Daily is the GAME, not the player.
      // Everyone who makes the same official decisions gets a byte-identical
      // result, so paying a provider call per player to write the same recap
      // is pure waste. The narrative path holds no user identity (no name, no
      // session, no uid), so one text is correct for all of them. Absent on
      // every other mode, which keeps their per-result keying unchanged.
      narrativeKeyId: dailyCfg ? `d.${dailyCfg.dailyId}.s${computed.seed >>> 0}` : null,
      core_result_status: "complete",
      narrative_status: "not_requested",
      created_at: Date.now(),
    };

    // ── Persist immutably + apply record updates from OUR result ────────────
    const records = { persisted: false, daily: null, challenge: null };
    const kvDown = chaos === "kv-down" || !hasStore();
    if (!kvDown) {
      const resultKey = previewComputed ? `${PREVIEW_NAMESPACES.result}:${resultId}` : `result:${resultId}`;
      await setJSON(resultKey, record, RESULT_TTL); // written once, never rewritten
      if (previewComputed) {
        // Wave metrics: cheap counters under the preview-metrics namespace so
        // operator reports work without log access. No identity beyond the
        // pseudonymous tester id; latency in coarse buckets.
        const ms = Date.now() - started;
        const bucket = ms < 250 ? "lt250" : ms < 500 ? "lt500" : ms < 1000 ? "lt1000" : ms < 2000 ? "lt2000" : "gte2000";
        await pipeline([
          ["HINCRBY", "preview-metrics:counters", "games_completed", 1],
          ["HINCRBY", "preview-metrics:counters", "latency_ms_sum", ms],
          ["HINCRBY", "preview-metrics:counters", `latency_${bucket}`, 1],
          ["HINCRBY", "preview-metrics:games-by-tester", (await previewIdentity(req.headers).catch(() => ({})))?.testerId ?? "unattributed", 1],
        ]).catch(() => {});
      }
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
