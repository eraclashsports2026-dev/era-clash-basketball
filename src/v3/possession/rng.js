// ── Counted deterministic randomness ─────────────────────────────────────────
// One PRNG per game, and every draw is counted. The count is the deterministic
// event id recorded in the possession ledger: two runs of the same game must
// consume the same draws in the same order, so a divergence shows up as a step
// mismatch at the exact possession where it started rather than as a mysterious
// score difference at the end.
//
// Math.random() is never used anywhere in the engine. A test greps for it.
import { mulberry32, deriveSeed } from "../seed.js";

export const createRng = (seed) => {
  const next = mulberry32(seed | 0);
  let steps = 0;
  const r = () => { steps++; return next(); };

  /** Uniform integer in [0, n). */
  r.int = (n) => Math.floor(r() * Math.max(1, n));
  /** True with probability p, clamped so nothing is ever certain by accident. */
  r.chance = (p) => r() < Math.min(0.999, Math.max(0.001, p));
  /** Bell-ish deviate in ~[-1, 1] from three uniforms — cheap and seeded. */
  r.bell = () => (r() + r() + r()) / 1.5 - 1;
  /**
   * Weighted pick. Weights are clamped non-negative; an all-zero weight vector
   * falls back to the first item rather than returning undefined, because a
   * possession must always produce an action.
   */
  r.weighted = (items, weightOf) => {
    let total = 0;
    const w = items.map((it) => { const x = Math.max(0, Number(weightOf(it)) || 0); total += x; return x; });
    if (total <= 0) return items[0];
    let t = r() * total;
    for (let i = 0; i < items.length; i++) { t -= w[i]; if (t <= 0) return items[i]; }
    return items[items.length - 1];
  };

  r.steps = () => steps;
  r.seed = seed | 0;
  return r;
};

/**
 * Child seeds for a series or a season.
 *
 * Each game gets an INDEPENDENT deterministic seed derived from the parent, so
 * one unlucky draw cannot repeat itself across all seven games — which is what
 * happens when a single "game form" modifier is reused for a whole series.
 */
export const childSeeds = (parentSeed, count) =>
  Array.from({ length: count }, (_, i) => deriveSeed(parentSeed | 0, i));

export { deriveSeed };
