// Shared rig for the handoff experiments. Deterministic throughout: every seed
// is a stated function of the experiment's own indices, so any row can be
// re-derived without this file.
import { simulateGameV3, resolveCoach, resolveEra } from "../../src/v3/engine.js";
import { PLAYERS, POSITIONS } from "../../src/players.js";
import { displayOVR } from "../../src/rating.js";
import erasData from "../../src/v3/data/eras.js";

export const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
export const DECADES = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
export const NEUTRAL = resolveCoach("neutral");
export const cards = (ids) => ids.map((i) => {
  const c = BY_ID.get(i);
  if (!c) throw new Error(`unknown card ${i}`);
  return c;
});

/** The highest-displayOVR card at each position within a decade, no repeats. */
export const topFiveOfDecade = (decade) => {
  const taken = new Set();
  return POSITIONS.map((slot) => {
    const pool = PLAYERS
      .filter((p) => p.decade === decade && p.positions.includes(slot) && !taken.has(p.id))
      .sort((a, b) => displayOVR(b, slot) - displayOVR(a, slot) || a.id.localeCompare(b.id));
    if (!pool.length) throw new Error(`${decade} has no card for ${slot}`);
    taken.add(pool[0].id);
    return pool[0];
  });
};

export const run = (gold, blue, eraId, seed, cg = NEUTRAL, cb = NEUTRAL) =>
  simulateGameV3(gold, blue, cg, cb, resolveEra(eraId), seed);

export const eraRecord = (id) => erasData.eras.find((e) => e.id === id) ?? null;
export const eraTargets = (id) => erasData.eras.find((e) => e.id === id)?.environment ?? {};

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
export const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : 0);
export const r2 = (n) => Math.round(n * 100) / 100;
export const r3 = (n) => Math.round(n * 1000) / 1000;
export const deciles = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return Array.from({ length: 9 }, (_, i) => s[Math.min(s.length - 1, Math.floor((i + 1) * s.length / 10))]);
};
/** Sum of a five's displayOVR at the slot each occupies. */
export const teamOvr = (five) => five.reduce((n, p, i) => n + displayOVR(p, POSITIONS[i]), 0);

export const table = (headers, rows) => {
  const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join("  ");
  return [line(headers), w.map((n) => "-".repeat(n)).join("  "), ...rows.map(line)].join("\n");
};
