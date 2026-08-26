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
    // No silent first-item fallback. The old `return items[0]` turned every
    // invalid weight into "pick the first player", which is indistinguishable
    // from a modelling decision and hid a NaN bug that gave one player 3,749
    // attempts in an 80-game sample. A development engine should fail loudly.
    if (!(total > 0)) {
      throw new Error(`rng.weighted: all ${items.length} weights are zero or invalid — refusing to fall back to the first item`);
    }
    let t = r() * total;
    for (let i = 0; i < items.length; i++) { t -= w[i]; if (t <= 0) return items[i]; }
    return items[items.length - 1];
  };

  /**
   * Seeded game form: this player's hot-or-cold night, as a value in [0,1).
   *
   * Derived from the game seed and the player id ONLY — never from anything
   * that has already happened — so a player who makes his first two shots
   * cannot thereby earn more shots. That runaway loop is the thing this design
   * exists to prevent.
   *
   * Memoised, so form is one draw per player per game rather than a fresh
   * value on every read, and so it does not consume the possession RNG stream
   * (which would make form draws shift every later possession).
   */
  const form = new Map();
  r.formFor = (cardId) => {
    if (form.has(cardId)) return form.get(cardId);
    let h = seed | 0;
    const key = String(cardId);
    for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
    // A separate stream from the possession RNG, so adding form cannot change
    // any other draw's sequence.
    const v = (createRng(deriveSeed(h, 0x40524d))());
    form.set(cardId, v);
    return v;
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
