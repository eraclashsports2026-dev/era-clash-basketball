// ── V3 seed architecture ───────────────────────────────────────────────────────
// One server-generated game seed per simulation. Same (simulationId, seed,
// engine version, data version) → byte-identical game. A rematch gets a new
// simulationId → new seed → a different, bounded-variance game.
// Series/seasons derive INDEPENDENT child seeds from the parent so each game
// is its own reproducible basketball night.
export { mulberry32 } from "../engine.js";
import { mulberry32 } from "../engine.js";

// splitmix32-style avalanche hash: parent seed + stream index → child seed.
export const deriveSeed = (parent, index) => {
  let h = (parent ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = (h + Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x735a2d97) >>> 0;
  return (h ^ (h >>> 16)) | 0;
};

// Small deterministic hash for strings (daily fairness seeds, etc.).
export const hashString = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
};

// Bounded "tonight's form" multiplier for a player: centered on 1, tighter for
// consistent players, wider for volatile ones. Never exceeds [0.72, 1.32].
export const nightlyForm = (rng, consistency /* 0-10 */) => {
  const sigma = 0.055 + (10 - consistency) * 0.012; // 0.055 (rock) → 0.175 (volatile)
  // sum of 3 uniforms ≈ bell shape, cheap and seeded
  const z = (rng() + rng() + rng()) / 1.5 - 1; // ~[-1, 1] bell
  const form = 1 + z * sigma * 2;
  return Math.max(0.72, Math.min(1.32, form));
};
