// ── Shareable Clash Cards V1: the server side ────────────────────────────────
// A card is drawn in the browser from a payload the SERVER built, so the
// browser cannot invent a score, an outcome, an era or an opponent. Two
// payloads, both explicit allowlists (src/cards/contract.js):
//
//   RESULT      from the authoritative result record of a Chaos run this
//               device session owns (the same ownership path the Challenge
//               creator uses). A guest's own completed run qualifies and is
//               labelled as a guest result; it never implies rated competition.
//   INVITATION  from the PUBLIC invitation view of an existing governed
//               Challenge — exactly what any recipient may already see before
//               playing. Nothing hidden (five, coach, MVP, seed, rolls, Legend
//               opponent) is on the payload because it is not on the view.
//
// Nothing here mints a Challenge, consumes an attempt or writes anything.
import { readAuthoritativeResult, cloudAccountsReady } from "./cloudAccounts.js";
import { loadRun, ownsRun } from "./chaosRun.js";
import { viewChallenge, displayNameFor } from "./challenges.js";
import { invitationUrl, STATUS } from "../../src/challenges/contract.js";
import { CARD_KINDS, CARD_VERSION, RESULT_CARD_FIELDS, INVITATION_CARD_FIELDS } from "../../src/cards/contract.js";

const scoreOf = (record) => { const f = record?.core?.finalScore || record?.finalScore || {}; return { gold: Number(f.gold), blue: Number(f.blue) }; };
const pick = (obj, fields) => Object.fromEntries(fields.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

/**
 * RESULT card payload for a Chaos run this device session owns. Closed
 * statuses: ok · not_found · not_your_result · not_simulated. Works for a
 * guest (no account) — the payload then says so and carries no name.
 */
export const resultCardPayload = async ({ chaosRunId, deviceSession, userId = null }, deps = {}) => {
  const run = deps.run !== undefined ? deps.run : await loadRun(chaosRunId);
  if (!run) return { status: "not_found" };
  if (!ownsRun(run, deviceSession)) return { status: "not_your_result" };
  if (run.status !== "SIMULATED" || !run.resultId) return { status: "not_simulated" };
  const record = deps.record !== undefined ? deps.record : await readAuthoritativeResult(run.resultId);
  if (!record || record.session !== deviceSession) return { status: "not_your_result" };
  const score = scoreOf(record);
  if (!Number.isFinite(score.gold) || !Number.isFinite(score.blue)) return { status: "not_simulated" };
  const outcome = score.gold === score.blue ? "tie" : score.gold > score.blue ? "win" : "loss";
  const displayName = userId ? (deps.displayName !== undefined ? deps.displayName : await displayNameFor(userId)) : null;
  const card = {
    kind: CARD_KINDS.RESULT, cardVersion: CARD_VERSION, score, outcome, margin: Math.abs(score.gold - score.blue),
    era: record.eraId || run.revealedEraStyleId || null, eraCustom: !!(record.eraCustom || run.eraCustom),
    guest: !userId, displayName: userId ? displayName || "Coach" : null,
    completedAt: record.createdAt || record.playedAt || null,
  };
  return { status: "ok", card: pick(card, RESULT_CARD_FIELDS) };
};

/**
 * INVITATION card payload for an existing open governed Challenge the caller
 * created. Built from the public invitation view — the creator's own headline
 * result, the era and the code — plus the trusted share link for THIS origin.
 * Closed statuses: ok · unavailable · expired · revoked · not_yours.
 */
export const invitationCardPayload = async ({ code, userId, origin }, deps = {}) => {
  if (!cloudAccountsReady()) return { status: "not_configured" };
  if (!userId) return { status: "not_yours" };
  const view = deps.view !== undefined ? deps.view : await viewChallenge({ code, userId });
  if (!view || view.status === STATUS.UNAVAILABLE) return { status: "unavailable" };
  if (!view.viewer?.isCreator) return { status: "not_yours" };
  if (view.status !== STATUS.OPEN) return { status: view.status };
  const card = {
    kind: CARD_KINDS.INVITATION, cardVersion: CARD_VERSION, code: view.code, creatorName: view.creatorName,
    creatorScore: view.creatorScore, creatorOutcome: view.creatorOutcome, era: view.era, eraCustom: !!view.eraCustom,
    expiresAt: view.expiresAt, url: invitationUrl(origin, view.code),
  };
  return { status: "ok", card: pick(card, INVITATION_CARD_FIELDS) };
};

/**
 * The origin a production export may name. The request's own host, when it is
 * one of the deployment's hosts — a Preview export names the preview host, a
 * production export the production host, and neither is written into the other.
 */
export const trustedOrigin = (req) => {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host)) return null;
  const proto = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
};
