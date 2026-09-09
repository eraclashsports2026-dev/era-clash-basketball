// ── Daily Challenge — public board reads ONLY ─────────────────────────────────
// v2.3: the POST submit path is GONE. Daily attempts are claimed atomically
// inside /api/game from the server-computed result (server UTC date, one
// SET NX claim per session). The browser can no longer submit a won/margin.
import { hasStore, pipeline } from "./_lib/store.js";
import { sendError, newRequestId } from "./_lib/errors.js";
import { flags } from "./_lib/flags.js";
import { utcDateKey, dailySeed } from "../src/dailyChallenge.js";
import { coachContrasts } from "../src/v3/dailyCoachEra.js";
import { officialDailyConfig } from "./_lib/dailyOfficial.js";
import { getEra } from "../src/v3/eraStyles.js";
import { cacheKeys } from "./_lib/cacheKeys.js";
import { getJSON, setJSON } from "./_lib/store.js";

const validDate = (d) => /^\d{8}$/.test(d);

export default async function handler(req, res) {
  const requestId = newRequestId();
  if (req.method !== "GET") return sendError(res, "VALIDATION_FAILURE", requestId);

  // Official daily configuration (read-only, server-authoritative). The seed
  // is public knowledge — everyone gets the same draft; knowing it only lets
  // a client render the same rolls the server will verify against.
  const config = { date: utcDateKey(), seed: dailySeed(utcDateKey()) };
  if (String(req.query?.config || "") === "1") {
    const f = flags();
    if (!f.dailyCoachEra) {
      // Flag off: the historical shape exactly. This is the rollback path.
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json(config);
    }

    // ── Official coach/era configuration ─────────────────────────────────────
    // Generated once per UTC date and reused all day. The cache key carries the
    // schema and data versions, so a version change produces a NEW key rather
    // than silently reinterpreting a Daily that players have already started.
    // One resolver, shared with api/game.js: the stored record for this UTC
    // date is authoritative for the rest of the day, including the data
    // versions captured when it was created. A deployment reads; it does not
    // regenerate. Concurrent first requests resolve to one record via SET NX.
    const official = await officialDailyConfig(config.date);
    const full = official.config;
    const cached = official.cached;
    // "Why these three differ" is computed at read time from the same stored
    // options, so a cached config from earlier today still renders the current
    // copy. It is a contrast between today's options, never a ranking.
    const withWhy = coachContrasts(full.coachOptions);
    const era = getEra(full.officialEraStyleId);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({
      ...config,
      dailyId: full.dailyId,
      officialDailyId: full.officialDailyId ?? full.dailyId,
      dailyRevision: full.dailyRevision ?? 1,
      officialEraStyleId: full.officialEraStyleId,
      // Documented era description for the UI: what the game looked like, in
      // words. No pace numbers, no environment coefficients, no modifiers.
      era: {
        id: era.id,
        label: era.label,
        anchorSeason: era.anchorSeason,
        summary: (era.styleSummary ?? []).slice(0, 3),
      },
      // UI support data only. Deliberately no coach ratings, no era
      // calculations, no Team Intelligence scores, no coach OVR.
      coachOptions: withWhy.map((c) => ({
        coachId: c.coachId, name: c.name,
        strategy: c.bucketLabel, systemTags: (c.systemTags ?? []).slice(0, 3),
        whyDifferent: c.whyDifferent,
      })),
      configSchemaVersion: full.configSchemaVersion,
      simulationSeedPolicy: full.simulationSeedPolicy,
      cached,
    });
  }

  if (!flags().leaderboard) return res.status(200).json({ ...config, board: [], count: 0, disabled: true });
  if (!hasStore()) return sendError(res, "KV_UNAVAILABLE", requestId);

  const date = String(req.query?.date || config.date);
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
