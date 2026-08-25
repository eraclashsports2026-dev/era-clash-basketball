// ── The official Daily configuration: one per UTC date, immutable ─────────────
// A Daily is a shared puzzle whose whole value is that everyone played the same
// one. That guarantee has to survive a deployment.
//
// The failure this exists to prevent: api/game.js used to call dailyConfig()
// directly, rebuilding the configuration from whatever versions were live at
// that moment, and the cache key itself carried the data versions. Ship a
// player-data change at 14:00 UTC and the afternoon's players got a different
// era, different coach options and a different derived seed than the morning's
// — one date, two official challenges, one meaningless leaderboard.
//
// So: the FIRST request of a UTC date creates the record and stores it. Every
// later read returns that stored record, versions and all. Generation is a
// creation event, not a lookup.
import { getJSON, setJSON, setNX, hasStore } from "./store.js";
import { cacheKeys } from "./cacheKeys.js";
import { dailyConfig, DAILY_FIRST_REVISION } from "../../src/v3/dailyCoachEra.js";

// Long enough to outlive the UTC day plus clock skew and a late leaderboard
// read; short enough that configs do not accumulate forever.
export const DAILY_CONFIG_TTL_SEC = 60 * 60 * 30;
export const DAILY_POINTER_TTL_SEC = 60 * 60 * 30;

export const DAILY_SOURCE = {
  STORED: "STORED",              // read back the record created earlier today
  CREATED: "CREATED",            // this request created it
  CREATED_ELSEWHERE: "CREATED_ELSEWHERE", // lost the creation race; using the winner
  EPHEMERAL: "EPHEMERAL",        // no store configured (local/dev) — cannot persist
};

/** Which revision is authoritative for this UTC date. */
export const readPointer = async (utcDate) => {
  if (!hasStore()) return null;
  const p = await getJSON(cacheKeys.dailyPointer({ utcDate }));
  const r = Number(p?.revision);
  return Number.isFinite(r) && r >= 1 ? r : null;
};

/**
 * The authoritative configuration for a UTC date.
 *
 * Concurrency: the pointer is claimed with SET NX, so when several first
 * requests arrive together exactly one of them decides the revision. The
 * config record is written the same way, so two workers can never disagree
 * about today's era or coach options — the loser reads the winner's record
 * rather than trusting its own freshly generated one.
 */
export const officialDailyConfig = async (utcDate) => {
  if (!hasStore()) {
    // Nothing to be authoritative WITH. Generate, and say so plainly rather
    // than implying persistence that did not happen.
    return { config: dailyConfig(utcDate), revision: DAILY_FIRST_REVISION, source: DAILY_SOURCE.EPHEMERAL, cached: false };
  }

  const ptrKey = cacheKeys.dailyPointer({ utcDate });
  let revision = await readPointer(utcDate);

  if (revision == null) {
    const claimed = await setNX(ptrKey, { revision: DAILY_FIRST_REVISION, createdAt: Date.now() }, DAILY_POINTER_TTL_SEC);
    revision = claimed ? DAILY_FIRST_REVISION : (await readPointer(utcDate)) ?? DAILY_FIRST_REVISION;
  }

  const cfgKey = cacheKeys.dailyConfig({ utcDate, revision });
  const stored = await getJSON(cfgKey);
  if (stored) return { config: stored, revision, source: DAILY_SOURCE.STORED, cached: true };

  // Build it. SET NX again: the record is immutable once written, so a second
  // worker that generated a different one must defer to what is already there.
  const fresh = { ...dailyConfig(utcDate, { revision }), createdAt: Date.now() };
  const won = await setNX(cfgKey, fresh, DAILY_CONFIG_TTL_SEC);
  if (won) return { config: fresh, revision, source: DAILY_SOURCE.CREATED, cached: false };

  const winner = await getJSON(cfgKey);
  return { config: winner ?? fresh, revision, source: DAILY_SOURCE.CREATED_ELSEWHERE, cached: true };
};

/**
 * Issue an EXPLICIT emergency replacement for a UTC date.
 *
 * Never called by a deployment, a version change, or any automatic path — only
 * by an operator who has decided the day's Daily must be replaced. The prior
 * revision's record is left exactly where it is, so its results and its
 * leaderboard remain readable and attributable.
 */
export const issueEmergencyRevision = async ({ utcDate, reason, operator, at = Date.now() }) => {
  if (!hasStore()) throw new Error("emergency revision requires a configured store");
  if (!reason || String(reason).trim().length < 10) throw new Error("an emergency revision requires a stated reason");
  if (!operator) throw new Error("an emergency revision requires a named operator");

  const current = (await readPointer(utcDate)) ?? DAILY_FIRST_REVISION;
  const next = current + 1;

  const priorKey = cacheKeys.dailyConfig({ utcDate, revision: current });
  const prior = await getJSON(priorKey);

  const record = {
    ...dailyConfig(utcDate, { revision: next }),
    createdAt: at,
    replaces: prior?.officialDailyId ?? null,
    replacementReason: String(reason).slice(0, 500),
    replacedBy: String(operator).slice(0, 120),
    replacedAt: at,
  };
  // Written with a plain SET: an operator issuing revision N+1 is asserting
  // authority, and NX would silently no-op on a retry of the same revision.
  await setJSON(cacheKeys.dailyConfig({ utcDate, revision: next }), record, DAILY_CONFIG_TTL_SEC);
  await setJSON(cacheKeys.dailyPointer({ utcDate }), { revision: next, createdAt: at, reason: record.replacementReason, operator: record.replacedBy }, DAILY_POINTER_TTL_SEC);

  return { config: record, revision: next, previousRevision: current, priorPreserved: Boolean(prior) };
};

/** Read a specific revision, including superseded ones. */
export const dailyConfigRevision = async (utcDate, revision) =>
  hasStore() ? getJSON(cacheKeys.dailyConfig({ utcDate, revision })) : null;
