// ── Centralized request validation ─────────────────────────────────────────────
// Strict allowlists: unknown modes, malformed ids, oversized payloads, and
// client-supplied "authority" fields never reach game logic. Mass-assignment
// safe: handlers read ONLY the fields validated here.
import { PLAYERS } from "../../src/players.js";
import { CARD_ID_ALIASES } from "../../src/v3/data/cardAliases.js";

// Alias keys are included so a stored result or challenge link containing a
// RETIRED card id still validates. Without this, renaming a card would reject
// every old record that mentions it.
const byId = (() => {
  const m = new Map(PLAYERS.map((p) => [p.id, p]));
  for (const [oldId, canonicalId] of Object.entries(CARD_ID_ALIASES)) {
    const card = m.get(canonicalId);
    if (card) m.set(oldId, card);
  }
  return m;
})();

export const MODES = new Set(["single", "best7", "82", "tournament", "daily", "challenge"]);

// Payload guard: call before any processing. Returns byte-ish length check.
export const tooLarge = (req, maxBytes) => {
  const cl = Number(req.headers["content-length"]);
  if (Number.isFinite(cl) && cl > maxBytes) return true;
  try { return JSON.stringify(req.body ?? {}).length > maxBytes; } catch { return true; }
};

// Team = exactly 5 valid player-entry ids, no duplicate entries, and no
// duplicate person (same player from two decades) — matching draft rules.
export const validateTeamIds = (ids) => {
  if (!Array.isArray(ids) || ids.length !== 5) return null;
  const players = [];
  const seenEntry = new Set();
  const seenPerson = new Set();
  for (const id of ids) {
    if (typeof id !== "string") return null;
    // Calibration-only player-season profiles live in the `cal:` namespace and
    // must never reach the public product. They would already fail the lookup
    // below, but an explicit rejection makes the isolation intentional and
    // testable rather than a side effect of them being absent from PLAYERS.
    if (id.startsWith("cal:")) return null;
    const p = byId.get(id);
    if (!p) return null;
    if (seenEntry.has(id)) return null;
    if (seenPerson.has(p.name)) return null;
    seenEntry.add(id);
    seenPerson.add(p.name);
    players.push(p);
  }
  return players;
};

export const validCoachId = (s) =>
  typeof s === "string" && /^[a-z][a-z-]{2,40}$/.test(s) ? s : null;
export const validEraId = (s) =>
  typeof s === "string" && /^(19[5-9]0s|20[0-2]0s)$/.test(s) ? s : null;

export const validSimId = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(s) ? s : null;

export const validChallengeId = (s) =>
  typeof s === "string" && /^[a-z0-9]{6,16}$/.test(s) ? s : null;

export const validResultId = validChallengeId;

// A shared narrative identity, as written onto our OWN result record (see
// narrativeKeyId in api/game.js). Deliberately a separate, wider shape from
// validResultId: result ids are public handles and stay short and opaque,
// while this is a content address built from a daily id and a seed. Validated
// anyway — a corrupted record must not be able to author a cache key.
export const validNarrativeKeyId = (s) =>
  typeof s === "string" && /^[a-z0-9][a-z0-9._-]{5,120}$/.test(s) ? s : null;

// Display names: plain text only. Strips angle brackets and control chars so
// nothing executable can reach UI, OG metadata, logs, or admin tools.
export const cleanName = (s, max = 24) =>
  typeof s === "string"
    ? s.replace(/[<>\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

export const cleanText = (s, max = 280) =>
  typeof s === "string"
    ? s.replace(/[<>\x00-\x1f\x7f]/g, "").slice(0, max)
    : "";
