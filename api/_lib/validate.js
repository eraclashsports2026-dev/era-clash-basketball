// ── Centralized request validation ─────────────────────────────────────────────
// Strict allowlists: unknown modes, malformed ids, oversized payloads, and
// client-supplied "authority" fields never reach game logic. Mass-assignment
// safe: handlers read ONLY the fields validated here.
import { PLAYERS } from "../../src/players.js";

const byId = new Map(PLAYERS.map((p) => [p.id, p]));

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

export const validSimId = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(s) ? s : null;

export const validChallengeId = (s) =>
  typeof s === "string" && /^[a-z0-9]{6,16}$/.test(s) ? s : null;

export const validResultId = validChallengeId;

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
