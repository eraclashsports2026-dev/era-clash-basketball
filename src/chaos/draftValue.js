// ── Draft Value ───────────────────────────────────────────────────────────────
// An internal, DRAFT-ONLY rarity axis. Draft Value decides how OFTEN a card is
// offered in Chaos Draft. It never reaches the simulation: nothing in this file
// is imported by src/v3/**, and a regression test asserts that. A card's
// on-court capability is decided entirely by Candidate 3 from the card's real
// statistics, exactly as it was before Chaos Clash existed.
//
// WHY IT IS NOT DISPLAY OVR
// Display OVR answers "how good is this player?". Draft Value answers "how much
// does this card compress the space of good rosters?" — which is a different
// question. A hyper-versatile two-way wing who can be slotted anywhere and
// coexists with any star constrains a draft far more than a high-volume scorer
// who needs the ball and only plays one position. The two axes correlate but
// deliberately disagree, and that disagreement is what lets elite *players*
// stay reachable while elite *construction* stays rare.
//
// Model: 60% position-relative talent, 25% versatility & role breadth,
//        15% capability scarcity.  Weights are declared here, measured in
//        scripts/chaos/calibrate.mjs, and versioned below.
import { PLAYERS, POSITIONS } from "../players.js";
import { slotRating, POS_WEIGHTS } from "../rating.js";

export const DRAFT_VALUE_VERSION = "1.0.0";

// Component weights. Changing any of these REQUIRES a version bump: the frozen
// calibration and every stored chaos run reference this version.
export const DRAFT_VALUE_WEIGHTS = Object.freeze({
  positionTalent: 0.60,
  versatility: 0.25,
  scarcity: 0.15,
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Percentile of `v` within an ASCENDING sorted array (fraction strictly below).
const pctOf = (sortedAsc, v) => {
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedAsc[mid] < v) lo = mid + 1; else hi = mid; }
  return sortedAsc.length ? lo / sortedAsc.length : 0;
};

// ── Pool statistics (computed once, from canonical data only) ────────────────
let _stats = null;
const stats = () => {
  if (_stats) return _stats;
  // Position-relative talent baselines: one sorted ladder per position, built
  // from the cards ELIGIBLE at that position. This is what stops a position
  // from being systematically starved — a centre is ranked against centres.
  const ladders = {};
  for (const pos of POSITIONS) {
    ladders[pos] = PLAYERS.filter((p) => p.positions.includes(pos))
      .map((p) => slotRating(p, pos))
      .sort((a, b) => a - b);
  }
  // Category baselines, per position, for role-breadth and scarcity.
  const cats = ["pts", "reb", "ast", "stl", "blk"];
  const catLadders = {};
  for (const pos of POSITIONS) {
    catLadders[pos] = {};
    const pool = PLAYERS.filter((p) => p.positions.includes(pos));
    for (const c of cats) catLadders[pos][c] = pool.map((p) => p[c]).sort((a, b) => a - b);
  }
  // Capability scarcity: how RARE is it to be genuinely good at each category
  // across the whole pool? Blocks and steals are scarce; points are abundant.
  // Measured, never hardcoded — the 1950s/60s cards legitimately carry 0.0
  // stl/blk (the NBA did not record them), which makes those capabilities
  // scarcer in exactly the way the draft should reflect.
  const scarcity = {};
  for (const c of cats) {
    const vals = PLAYERS.map((p) => p[c]).sort((a, b) => a - b);
    const p75 = vals[Math.floor(vals.length * 0.75)];
    const share = PLAYERS.filter((p) => p[c] >= p75 && p[c] > 0).length / PLAYERS.length;
    scarcity[c] = share > 0 ? 1 / share : 1;
  }
  const scMax = Math.max(...Object.values(scarcity));
  for (const c of cats) scarcity[c] /= scMax; // normalise to (0,1]
  _stats = { ladders, catLadders, scarcity, cats };
  return _stats;
};

// ── Components ───────────────────────────────────────────────────────────────

// 1. Position-relative talent — the card's best position percentile.
export const positionTalent = (p) => {
  const s = stats();
  let best = 0, bestPos = p.pos;
  for (const pos of p.positions) {
    const q = pctOf(s.ladders[pos], slotRating(p, pos));
    if (q > best) { best = q; bestPos = pos; }
  }
  return { value: best, bestPos };
};

// 2. Versatility & role breadth — positional flexibility, two-way breadth, and
//    off-ball scalability (can this card coexist with a high-usage star?).
export const versatility = (p) => {
  const s = stats();
  const home = p.pos;
  // Positional flexibility: 1 eligible position → 0, 3+ → 1.
  const flex = clamp01((p.positions.length - 1) / 2);
  // Two-way breadth: how many categories sit above the positional median.
  const above = s.cats.filter((c) => pctOf(s.catLadders[home][c], p[c]) >= 0.5).length;
  const breadth = above / s.cats.length;
  // Defensive breadth specifically (stl+blk are the only defensive signals the
  // card carries) — a two-way card is harder to replace than a scorer.
  const twoWay = (pctOf(s.catLadders[home].stl, p.stl) + pctOf(s.catLadders[home].blk, p.blk)) / 2;
  // Off-ball scalability: value that does NOT require the ball. A card whose
  // production is overwhelmingly scoring volume shrinks next to another star;
  // rebounding, defence and passing survive a usage cut.
  const ballDominant = p.pts * 1.0;
  const offBall = p.reb * 0.9 + p.stl * 3.0 + p.blk * 3.0 + p.ast * 0.6;
  const scal = offBall + ballDominant > 0 ? offBall / (offBall + ballDominant) : 0.5;
  return clamp01(flex * 0.34 + breadth * 0.22 + twoWay * 0.22 + scal * 0.22);
};

// 3. Capability scarcity — does this card supply something the pool rarely has?
export const capabilityScarcity = (p) => {
  const s = stats();
  const home = p.pos;
  let best = 0;
  for (const c of s.cats) {
    const q = pctOf(s.catLadders[home][c], p[c]);
    // Only genuine standouts count as supplying a scarce capability.
    if (q >= 0.8) best = Math.max(best, q * s.scarcity[c]);
  }
  return clamp01(best);
};

// ── Draft Value ──────────────────────────────────────────────────────────────
let _values = null;
const values = () => {
  if (_values) return _values;
  const W = DRAFT_VALUE_WEIGHTS;
  const raw = new Map();
  const parts = new Map();
  for (const p of PLAYERS) {
    const t = positionTalent(p);
    const v = versatility(p);
    const sc = capabilityScarcity(p);
    const score = t.value * W.positionTalent + v * W.versatility + sc * W.scarcity;
    raw.set(p.id, score);
    parts.set(p.id, { positionTalent: t.value, bestPos: t.bestPos, versatility: v, scarcity: sc, raw: score });
  }
  // Global percentile ladder over every card.
  const ladder = [...raw.values()].sort((a, b) => a - b);
  // Position-aware ladders so a position is never systematically starved of its
  // own top tier: a centre is APEX relative to centres.
  const posLadders = {};
  for (const pos of POSITIONS) {
    posLadders[pos] = PLAYERS.filter((p) => p.positions.includes(pos))
      .map((p) => raw.get(p.id)).sort((a, b) => a - b);
  }
  const out = new Map();
  for (const p of PLAYERS) {
    const r = raw.get(p.id);
    const globalPct = pctOf(ladder, r);
    const posPct = {};
    for (const pos of p.positions) posPct[pos] = pctOf(posLadders[pos], r);
    out.set(p.id, { ...parts.get(p.id), globalPct, posPct });
  }
  _values = { byId: out, ladder, posLadders };
  return _values;
};

/** Full auditable Draft Value record for one card. */
export const draftValueOf = (playerOrId) => {
  const id = typeof playerOrId === "string" ? playerOrId : playerOrId.id;
  return values().byId.get(id) || null;
};

// ── Tiers ────────────────────────────────────────────────────────────────────
// Percentile bands, evaluated POSITION-AWARE for the slot being drafted so each
// position supplies its own APEX. Global percentile is retained for auditing.
export const TIERS = Object.freeze(["APEX", "ELITE", "STAR", "SPECIALIST"]);
export const TIER_BOUNDS = Object.freeze({ APEX: 0.98, ELITE: 0.90, STAR: 0.70 });

export const tierForPct = (pct) => {
  if (pct >= TIER_BOUNDS.APEX) return "APEX";
  if (pct >= TIER_BOUNDS.ELITE) return "ELITE";
  if (pct >= TIER_BOUNDS.STAR) return "STAR";
  return "SPECIALIST";
};

/** Tier of a card AT a slot (position-aware); falls back to global percentile. */
export const tierOf = (player, slotPos = null) => {
  const dv = draftValueOf(player);
  if (!dv) return "SPECIALIST";
  const pct = slotPos && dv.posPct[slotPos] != null ? dv.posPct[slotPos] : dv.globalPct;
  return tierForPct(pct);
};

/** Percentile used for weighting at a slot. */
export const draftPctAt = (player, slotPos = null) => {
  const dv = draftValueOf(player);
  if (!dv) return 0.5;
  return slotPos && dv.posPct[slotPos] != null ? dv.posPct[slotPos] : dv.globalPct;
};

/** Every card with its components — for the outlier audit artifact. */
export const draftValueTable = () =>
  PLAYERS.map((p) => ({
    id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    ...draftValueOf(p), tier: tierOf(p, p.pos),
  }));

export const _resetDraftValueCaches = () => { _stats = null; _values = null; };
