// ── Official Daily Challenge — shared authoritative module ────────────────────
// ONE deterministic implementation used by BOTH the client (to display the
// draft) and the server (to verify submitted lineups). Pure: no module state,
// no variety guard, no Math.random — so the same UTC date produces the same
// rolls for every player on Earth, and the server can replay any submitted
// decision sequence and confirm the final five was legally reachable.
//
// v2.3.1 fixes two defects:
//   1. The old daily used the local-timezone date and the session-scoped
//      variety guard — different users (and even the same user after other
//      games) got DIFFERENT "official" rolls. Now: UTC date + pure generator.
//   2. The server never verified lineup legality. Now: the client submits its
//      keep/re-spin decisions and the server replays them; a lineup that the
//      official draft could not produce is rejected (DAILY_INVALID_LINEUP)
//      without consuming the official attempt.
import { PLAYERS, POSITIONS } from "./players.js";
import { slotRating } from "./rating.js";
import { mulberry32 } from "./engine.js";

// Server-authoritative date/seed (UTC — never the browser's local timezone).
export const utcDateKey = (d = new Date()) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
export const dailySeed = (dateKey) => Number(dateKey) | 0;

// Pure pick: identical semantics to the draft generator minus the session
// variety guard. Consumes exactly one rng() call per pick.
const purePick = (slotPos, rng, { era = null, eliteN = 10, excludeNames = [] } = {}) => {
  let pool = PLAYERS;
  if (slotPos) pool = pool.filter((p) => p.positions.includes(slotPos));
  if (era) pool = pool.filter((p) => p.decade === era);
  if (excludeNames.length) pool = pool.filter((p) => !excludeNames.includes(p.name));
  if (pool.length === 0) pool = PLAYERS.filter((p) => !excludeNames.includes(p.name));
  const sorted = [...pool].sort((a, b) => slotRating(b, slotPos || b.pos) - slotRating(a, slotPos || a.pos));
  const top = sorted.slice(0, Math.min(eliteN, sorted.length));
  return top[Math.floor(rng() * top.length)];
};

// Roll 1: the day's opening five (one person per lineup).
export const dailyRoll1 = (seed) => {
  const rng = mulberry32(seed);
  const roster = [];
  const names = [];
  for (const pos of POSITIONS) {
    const p = purePick(pos, rng, { eliteN: 12, excludeNames: names });
    roster.push(p);
    names.push(p.name);
  }
  return roster;
};

// Apply one roll transition (rollNum = 1 produces roll 2; rollNum = 2 produces
// roll 3 / the final five). keeps: bool[5]; respins: (null|"era"|"position")[5].
// Semantics mirror the live draft exactly:
//   keep            → same player
//   respin "position" → same decade, any position (eliteN 10)
//   respin "era"      → same slot position, any decade (eliteN 10)
//   default           → same slot position re-roll (eliteN 12)
export const applyDailyRoll = (seed, rollNum, roster, keeps, respins) => {
  const rng = mulberry32(seed + rollNum * 7919);
  const names = roster.filter((_, i) => keeps[i]).map((p) => p.name);
  return roster.map((p, i) => {
    if (keeps[i]) return p;
    const opts = { excludeNames: [...names] };
    const next = respins[i] === "position" ? purePick(null, rng, { ...opts, era: p.decade, eliteN: 10 })
      : respins[i] === "era" ? purePick(POSITIONS[i], rng, { ...opts, eliteN: 10 })
      : purePick(POSITIONS[i], rng, { ...opts, eliteN: 12 });
    names.push(next.name);
    return next;
  });
};

// decisions = [{keeps, respins} × 3] — the draft has THREE transitions: the
// rolls at 1→2 and 2→3, plus the Finalize click, which re-rolls any unkept
// slot one final time (that is Yahtzee roll 3 in the live game).
const boolArr5 = (a) => Array.isArray(a) && a.length === 5 && a.every((v) => typeof v === "boolean");
const respinArr5 = (a) => Array.isArray(a) && a.length === 5 && a.every((v) => v === null || v === "era" || v === "position");
export const validDecisions = (d) =>
  Array.isArray(d) && d.length === 3 &&
  d.every((step) => step && boolArr5(step.keeps) && respinArr5(step.respins));

// Full replay: seed + decisions → the only legal final five for that path.
export const replayDaily = (seed, decisions) => {
  let roster = dailyRoll1(seed);
  for (let roll = 1; roll <= 3; roll++) {
    const step = decisions[roll - 1];
    roster = applyDailyRoll(seed, roll, roster, step.keeps, step.respins);
  }
  return roster;
};

// Server-side legality check: does this decision path reproduce the submitted
// lineup exactly (slot order matters)?
export const verifyDailyLineup = (dateKey, decisions, submittedIds) => {
  if (!validDecisions(decisions)) return { ok: false, reason: "bad_decisions" };
  if (!Array.isArray(submittedIds) || submittedIds.length !== 5) return { ok: false, reason: "bad_lineup" };
  const final = replayDaily(dailySeed(dateKey), decisions);
  const ok = final.every((p, i) => p.id === submittedIds[i]);
  return ok ? { ok: true } : { ok: false, reason: "lineup_not_reachable" };
};
