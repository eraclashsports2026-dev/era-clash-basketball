// ── Draft / roster generation (variety-guarded) ────────────────────────────────
// Unchanged v2 behavior, extracted from App.jsx so it can be unit-tested.
import { PLAYERS, POSITIONS } from "./players.js";
import { slotRating } from "./rating.js";

const recentIds = new Set();
const rememberPick = (p) => {
  recentIds.add(p.id);
  if (recentIds.size > 40) recentIds.delete(recentIds.values().next().value);
};

export const genPlayer = (slotPos = null, rng = Math.random, opts = {}) => {
  let pool = PLAYERS;
  if (slotPos) pool = pool.filter((p) => p.positions.includes(slotPos));
  if (opts.era) pool = pool.filter((p) => p.decade === opts.era);
  if (opts.excludeIds) pool = pool.filter((p) => !opts.excludeIds.includes(p.id));
  // one PERSON per lineup: the same player from two decades is not allowed
  if (opts.excludeNames) pool = pool.filter((p) => !opts.excludeNames.includes(p.name));
  if (pool.length === 0) pool = PLAYERS;
  const sorted = [...pool].sort((a, b) => slotRating(b, slotPos || b.pos) - slotRating(a, slotPos || a.pos));
  const eliteN = Math.min(opts.eliteN || 10, sorted.length);
  // variety guard: prefer players not recently seen
  const fresh = sorted.slice(0, eliteN).filter((p) => !recentIds.has(p.id));
  const pickFrom = fresh.length >= 3 ? fresh : sorted.slice(0, eliteN);
  const pick = pickFrom[Math.floor(rng() * pickFrom.length)];
  rememberPick(pick);
  return pick;
};


// Deterministic sibling of genPlayer with NO session variety guard: the same
// rng sequence always yields the same player. Used for generated opponents so
// a season/bracket is exactly reproducible from its seed (the variety guard is
// shared mutable module state and would otherwise leak between simulations).
export const purePickPlayer = (slotPos, rng, opts = {}) => {
  let pool = PLAYERS;
  if (slotPos) pool = pool.filter((p) => p.positions.includes(slotPos));
  if (opts.era) pool = pool.filter((p) => p.decade === opts.era);
  if (opts.excludeNames?.length) pool = pool.filter((p) => !opts.excludeNames.includes(p.name));
  if (pool.length === 0) pool = PLAYERS.filter((p) => !(opts.excludeNames || []).includes(p.name));
  const sorted = [...pool].sort((a, b) => slotRating(b, slotPos || b.pos) - slotRating(a, slotPos || a.pos));
  const top = sorted.slice(0, Math.max(1, Math.min(opts.eliteN || 10, sorted.length)));
  return top[Math.floor(rng() * top.length)];
};

const genFive = (rng, eliteN) => {
  const roster = [];
  const names = [];
  for (const pos of POSITIONS) {
    const p = genPlayer(pos, rng, { eliteN, excludeNames: names });
    roster.push(p);
    names.push(p.name);
  }
  return roster;
};
export const genRoster = (rng = Math.random) => genFive(rng, 12);
export const genOpponent = (rng = Math.random) => genFive(rng, 8);

// Daily seed helpers (local-date, unchanged from v2 so daily rolls stay stable)
export const todaySeed = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
export const todayKey = () => String(todaySeed());
