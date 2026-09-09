// ── Legend CPU ───────────────────────────────────────────────────────────────
// There is exactly ONE CPU policy and it is always Legend (locked decisions
// #2-#5). There is no difficulty selector anywhere in the product, and the CPU
// is never weakened for a new user — new users get guidance, not a worse
// opponent.
//
// FAIRNESS ARCHITECTURE
// The CPU draws from the same probability model, over the same pool, with the
// same roll count, the same burn rules and the same era. It gets no simulation
// bonus and no better odds. Two properties make "no peeking" provable rather
// than merely asserted:
//
//   1. STRUCTURAL — cpuHoldDecision() accepts a frozen VisibleState. Future
//      draws, hidden branches, future coach offers, the simulation result and
//      the user's unsubmitted holds are not fields on it, and assertVisibleState
//      throws if a forbidden key is ever added.
//
//   2. BEHAVIOURAL — the lookahead samples the PROBABILITY MODEL on a policy-only
//      RNG stream seeded from visible state alone. It never touches the draw
//      stream, so changing the run's draw seed changes every actual future card
//      while leaving the CPU's decision bit-identical. A test asserts exactly
//      that.
import { POSITIONS, PLAYERS } from "../players.js";
import { finalWeight, heldTierCensus } from "./draftOdds.js";
import { talentScore, constructionScore } from "./construction.js";
import { eraTranslationScore, eraAdaptability } from "./eraTranslation.js";
import { hashString, mulberry32, deriveSeed } from "../v3/seed.js";

export const LEGEND_CPU_VERSION = "1.0.0";

/** The ONLY fields a CPU decision may read. */
export const VISIBLE_STATE_KEYS = Object.freeze([
  "side", "roll", "roster", "held", "opponentRoster", "burnedIds", "revealedEraId",
]);

/** Fields that would constitute cheating if they ever appeared. */
export const FORBIDDEN_STATE_KEYS = Object.freeze([
  "futureDraws", "nextCards", "seedId", "serverSeed", "result", "winner", "finalScore",
  "userHolds", "opponentHeldSlots", "coachOffers", "branches", "rngSteps",
]);

export const assertVisibleState = (s) => {
  for (const k of Object.keys(s || {})) {
    if (FORBIDDEN_STATE_KEYS.includes(k)) {
      throw new Error(`legendCpu: forbidden field "${k}" reached the CPU decision function`);
    }
    if (!VISIBLE_STATE_KEYS.includes(k)) {
      throw new Error(`legendCpu: unknown field "${k}" reached the CPU decision function`);
    }
  }
  return s;
};

// ── Objective ────────────────────────────────────────────────────────────────
const opponentInteraction = (mine, theirs) => {
  if (!theirs) return 0.5;
  const d = (constructionScore(mine) - constructionScore(theirs)) * 0.5
    + (talentScore(mine) - talentScore(theirs)) * 0.5;
  return Math.max(0, Math.min(1, 0.5 + d));
};

/**
 * Roster value. Before the era is revealed the CPU cannot know which environment
 * it is building for, so it prices ADAPTABILITY — expected translation across
 * every era it might face. After the reveal it prices the actual environment.
 */
export const rosterValue = (roster, { opponentRoster = null, revealedEraId = null } = {}) => {
  const t = talentScore(roster), c = constructionScore(roster);
  const o = opponentInteraction(roster, opponentRoster);
  if (revealedEraId) {
    return t * 0.36 + c * 0.28 + eraTranslationScore(roster, revealedEraId) * 0.24 + o * 0.12;
  }
  return t * 0.42 + c * 0.30 + eraAdaptability(roster) * 0.16 + o * 0.12;
};

// ── Policy-only sampling ─────────────────────────────────────────────────────
// Seeded from VISIBLE STATE ONLY. Deliberately excludes the run's draw seed so
// the decision is provably independent of what the next cards actually are.
const policySeed = (s, tag) =>
  hashString([
    "legend", LEGEND_CPU_VERSION, s.side, String(s.roll), String(s.revealedEraId || ""),
    POSITIONS.map((p) => s.roster?.[p]?.id || "-").join(","),
    POSITIONS.map((p) => (s.opponentRoster?.[p]?.id) || "-").join(","),
    [...(s.burnedIds || [])].sort().join(","),
    tag,
  ].join("~"));

const sampleSlot = (rng, { slot, roll, heldCensus, burned, usedNames }) => {
  let pool = PLAYERS.filter(
    (p) => p.positions.includes(slot) && !burned.has(p.id) && !usedNames.has(p.name)
  );
  if (!pool.length) pool = PLAYERS.filter((p) => p.positions.includes(slot) && !usedNames.has(p.name));
  if (!pool.length) return null;
  const w = pool.map((p) => finalWeight(p, slot, roll, heldCensus));
  const total = w.reduce((a, b) => a + b, 0);
  let t = rng() * total;
  for (let i = 0; i < pool.length; i++) { t -= w[i]; if (t <= 0) return pool[i]; }
  return pool[pool.length - 1];
};

const LOOKAHEAD_SAMPLES = 14;

/**
 * Expected value of holding exactly `holdSlots`, integrated over the probability
 * distribution of the remaining draws. This is EV lookahead over the MODEL — it
 * never materializes or inspects the run's actual next cards.
 */
export const evaluateHoldSet = (state, holdSlots) => {
  const { roster, opponentRoster, revealedEraId, burnedIds, roll } = state;
  const nextRoll = Math.min(3, roll + 1);
  const held = {};
  for (const s of holdSlots) if (roster[s]) held[s] = roster[s];
  const heldCards = Object.values(held);
  const heldCensus = heldTierCensus(heldCards, (c) => POSITIONS.find((s) => held[s]?.id === c.id) || c.pos);
  const burned = new Set(burnedIds || []);
  // Rerolled cards are burned for the run — the CPU prices that cost honestly.
  for (const s of POSITIONS) if (!held[s] && roster[s]) burned.add(roster[s].id);
  const oppNames = new Set(POSITIONS.map((s) => opponentRoster?.[s]?.name).filter(Boolean));

  const rng = mulberry32(deriveSeed(policySeed(state, holdSlots.join("+")), 0));
  let acc = 0;
  for (let k = 0; k < LOOKAHEAD_SAMPLES; k++) {
    const cand = { ...held };
    const used = new Set([...heldCards.map((c) => c.name), ...oppNames]);
    for (const slot of POSITIONS) {
      if (cand[slot]) continue;
      const pick = sampleSlot(rng, { slot, roll: nextRoll, heldCensus, burned, usedNames: used });
      cand[slot] = pick;
      if (pick) used.add(pick.name);
    }
    acc += rosterValue(cand, { opponentRoster, revealedEraId });
  }
  return acc / LOOKAHEAD_SAMPLES;
};

/** All 32 hold subsets, in a fixed deterministic order. */
const HOLD_SETS = (() => {
  const out = [];
  for (let mask = 0; mask < 32; mask++) {
    out.push(POSITIONS.filter((_, i) => mask & (1 << i)));
  }
  return out;
})();

/**
 * THE Legend hold decision. Deterministic in visible state; identical inputs
 * always produce an identical answer.
 */
export const cpuHoldDecision = (state) => {
  assertVisibleState(state);
  const { roster } = state;
  const holdingAll = POSITIONS.filter((s) => roster[s]);
  // Holding everything is the terminal option and is priced like any other.
  let best = null, bestEv = -Infinity, bestIdx = -1;
  const scored = [];
  HOLD_SETS.forEach((set, idx) => {
    const valid = set.filter((s) => roster[s]);
    if (valid.length !== set.length) return;
    const ev = evaluateHoldSet(state, valid);
    scored.push({ hold: valid, ev });
    // Strict > keeps the FIRST (lowest-index, i.e. fewest-slots-then-canonical)
    // maximiser, so ties resolve identically on every machine and every replay.
    if (ev > bestEv) { bestEv = ev; best = valid; bestIdx = idx; }
  });
  return {
    hold: best || holdingAll,
    ev: bestEv,
    considered: scored.length,
    policy: "LEGEND",
    version: LEGEND_CPU_VERSION,
  };
};

/**
 * A commitment to the CPU's decision, published BEFORE the user's holds.
 *
 * The `secret` is REQUIRED and is what makes this binding rather than
 * decorative. Every other input — run id, roll, version — is published in the
 * same response, and a hold decision is one of only 32 subsets, so without a
 * secret in the pre-image the committed value can be inverted by trying all 32
 * and matching the hash. Reproduced directly: the brute force recovers the
 * exact hidden hold on the first roll of a fresh run.
 *
 * The secret is server-only until the run is SIMULATED, at which point it is
 * published so a player can verify every commitment after the fact — which is
 * the property a commitment scheme is supposed to have.
 */
export const cpuHoldCommitment = (decision, salt, secret) => {
  if (!secret) throw new Error("cpuHoldCommitment: a run secret is required — an unsalted commitment over 32 subsets is invertible");
  return String(hashString(`${salt}|${[...decision.hold].sort().join(",")}|${LEGEND_CPU_VERSION}|${secret}`) >>> 0);
};

// ── Benchmark policies (evaluation only — never shipped as opponents) ────────
export const POLICIES = {
  legend: (state) => cpuHoldDecision(state).hold,
  random: (state, rng) => POSITIONS.filter((s) => state.roster[s] && rng() < 0.5),
  ovrOnly: (state) => {
    const rated = POSITIONS.filter((s) => state.roster[s])
      .map((s) => ({ s, v: talentScore({ ...POSITIONS.reduce((a, p) => ({ ...a, [p]: null }), {}), [s]: state.roster[s] }) }));
    const mean = rated.reduce((a, r) => a + r.v, 0) / (rated.length || 1);
    return rated.filter((r) => r.v >= mean).map((r) => r.s);
  },
  constructionOnly: (state) => {
    // Hold the slots whose removal most damages intrinsic construction.
    const base = constructionScore(state.roster);
    const dmg = POSITIONS.filter((s) => state.roster[s]).map((s) => {
      const without = { ...state.roster, [s]: null };
      return { s, d: base - constructionScore(without) };
    });
    const mean = dmg.reduce((a, r) => a + r.d, 0) / (dmg.length || 1);
    return dmg.filter((r) => r.d >= mean).map((r) => r.s);
  },
};
