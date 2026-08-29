// ── Talent, Construction and Matchup Fit ─────────────────────────────────────
// Three SEPARATE concepts, deliberately never collapsed into one "99 EXCELLENT"
// number (locked decision #31, #32):
//
//   Talent Tier        how strong are the individual players?
//   Roster Construction how coherently do they fit together, intrinsically?
//   Matchup Fit        how does this roster interact with THIS opponent and era?
//
// Roster Construction is scored against percentiles of the SIMULATED CHAOS
// ROSTER POPULATION — the distribution of rosters this draft actually produces —
// so "Elite Build" means a rare percentile outcome rather than five famous names.
// The cut points live in constructionBands.json, produced by the calibration run.
import { POSITIONS } from "../players.js";
import { analyzeBalance, slotRating } from "../rating.js";
import { attributeInsights } from "../attributes.js";
import { draftPctAt } from "./draftValue.js";
import BANDS from "./constructionBands.json" with { type: "json" };

export const CONSTRUCTION_VERSION = "1.0.0";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const asFive = (roster) => (Array.isArray(roster) ? roster : POSITIONS.map((s) => roster[s])).filter(Boolean);

// ── Talent ───────────────────────────────────────────────────────────────────
/** Mean position-relative Draft-Value talent percentile across the five slots. */
export const talentScore = (roster) => {
  const five = Array.isArray(roster) ? roster : POSITIONS.map((s) => roster[s]);
  const vals = five.map((p, i) => (p ? draftPctAt(p, POSITIONS[i]) : 0));
  return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
};

export const TALENT_TIERS = Object.freeze(["LOADED", "STRONG", "SOLID", "SCRAPPY", "THIN"]);
export const talentTier = (roster) => {
  const s = talentScore(roster);
  const c = BANDS.talent;
  if (s >= c.LOADED) return "LOADED";
  if (s >= c.STRONG) return "STRONG";
  if (s >= c.SOLID) return "SOLID";
  if (s >= c.SCRAPPY) return "SCRAPPY";
  return "THIN";
};

// ── Construction ─────────────────────────────────────────────────────────────
// Intrinsic coherence only. No opponent, no era. Built from the same real card
// statistics the rest of the app uses; nothing here is invented.
export const constructionScore = (roster) => {
  const five = asFive(roster);
  if (five.length < 5) return 0;
  const slots = POSITIONS;
  const bal = analyzeBalance(five, slots);
  const t = bal.totals;

  // Coherence is BALANCE, so the components that measure it are two-sided:
  // a roster can have too much of a thing as easily as too little. One-sided
  // ramps saturate — an early version of this score pinned 100% of rosters at
  // full marks for positional fit and 81% for usage, which made the top tiers
  // indistinguishable from each other.
  const band = (x, lo, hi) => {
    if (x >= lo && x <= hi) return 1;
    const d = x < lo ? (lo - x) / (lo || 1) : (x - hi) / (1 - hi || 1);
    return clamp01(1 - d * 1.35);
  };

  // 1. Category coverage — does the five cover a basketball team's jobs?
  const cover =
    clamp01(t.ast / 26) * 0.28 +
    clamp01(t.blk / 5.5) * 0.22 +
    clamp01(t.reb / 52) * 0.26 +
    clamp01(t.stl / 7.5) * 0.24;

  // 2. Usage coherence — a roster needs a go-to option AND someone to defer.
  //    Five ball-dominant scorers is a worse roster than four plus a connector,
  //    however famous the five are; so is five players with nobody to close.
  const scorers = five.filter((p) => p.pts >= 24).length;
  const topShare = Math.max(...five.map((p) => p.pts)) / (t.pts || 1);
  const usage = band(topShare, 0.24, 0.31) * (1 - clamp01(Math.max(0, scorers - 2) * 0.22));

  // 3. Positional fit — only bites when a card is in a slot it never played.
  //    Chaos Draft always fills legal slots, so this is dormant here and live
  //    in Dream Matchup, where the user can build anything.
  const fit = five.reduce((s, p, i) => s + (p.positions.includes(slots[i]) ? 1 : 0), 0) / 5;

  // 4. Creation — someone has to run it, and one passer is fragile.
  const astSorted = [...five.map((p) => p.ast)].sort((a, b) => b - a);
  const creation = clamp01(astSorted[0] / 11) * 0.6 + clamp01(astSorted[1] / 7) * 0.4;

  // 5. Inside/outside balance — the share of scoring supplied from the
  //    perimeter. The cards carry no three-point rate, so perimeter scoring
  //    share is the honest proxy and is labelled as such wherever it surfaces.
  const perim = five.filter((p, i) => ["PG", "SG", "SF"].includes(slots[i])).reduce((s, p) => s + p.pts, 0);
  const mix = band(perim / (t.pts || 1), 0.52, 0.70);

  const raw = cover * 0.30 + usage * 0.22 + fit * 0.12 + creation * 0.20 + mix * 0.16;
  // No clamp to 1: the bands are percentiles of the simulated population, so
  // the score must keep its spread at the top rather than pile up on a ceiling.
  return raw * bal.multiplier;
};

export const CONSTRUCTION_TIERS = Object.freeze([
  "PERFECT STORM", "ELITE BUILD", "STRONG BUILD", "COMPETITIVE", "VOLATILE", "FRAGILE",
]);

export const constructionTier = (roster) => {
  const s = constructionScore(roster);
  const c = BANDS.construction;
  if (s >= c.PERFECT_STORM) return "PERFECT STORM";
  if (s >= c.ELITE_BUILD) return "ELITE BUILD";
  if (s >= c.STRONG_BUILD) return "STRONG BUILD";
  if (s >= c.COMPETITIVE) return "COMPETITIVE";
  if (s >= c.VOLATILE) return "VOLATILE";
  return "FRAGILE";
};

export const CONSTRUCTION_BLURB = Object.freeze({
  "PERFECT STORM": "Everything fits. This roster has no obvious way in.",
  "ELITE BUILD": "A rare fit — strengths that reinforce each other.",
  "STRONG BUILD": "Coherent, with one seam an opponent can work.",
  COMPETITIVE: "A workable five with real strengths and real holes.",
  VOLATILE: "High ceiling, low floor — this can win big or lose badly.",
  FRAGILE: "Great players, but important weaknesses an opponent can exploit.",
});

/**
 * Strengths and tradeoffs in plain basketball language. Reuses the existing
 * analyzeBalance / attributeInsights vocabulary so Chaos Clash and Dream
 * Matchup describe the same roster the same way.
 */
export const constructionTags = (roster) => {
  const five = asFive(roster);
  if (five.length < 5) return { strengths: [], tradeoffs: [] };
  const bal = analyzeBalance(five, POSITIONS);
  const style = attributeInsights(five);
  const strengths = [...bal.bonuses, ...style.bonuses];
  const tradeoffs = [...bal.gaps, ...style.gaps];
  // Usage collision is a construction concept the balance layer does not name.
  const scorers = five.filter((p) => p.pts >= 24).length;
  if (scorers >= 3) {
    tradeoffs.push({
      label: "Usage collision",
      detail: `${scorers} players who need the ball to produce`,
    });
  }
  const outOfPos = five.filter((p, i) => !p.positions.includes(POSITIONS[i]));
  if (outOfPos.length) {
    tradeoffs.push({
      label: "Out of position",
      detail: `${outOfPos.map((p) => p.name).join(", ")} playing a slot they never held`,
    });
  }
  return { strengths, tradeoffs };
};

/** The single most useful strength and risk, for the roll screen. */
export const bestStrength = (roster) => constructionTags(roster).strengths[0] || null;
export const biggestRisk = (roster) => constructionTags(roster).tradeoffs[0] || null;

// ── Matchup Fit (opponent + era interaction) ─────────────────────────────────
/** Qualitative, opponent-relative read. Never a win probability. */
export const matchupFit = (mine, theirs) => {
  const a = constructionScore(mine), b = constructionScore(theirs);
  const ta = talentScore(mine), tb = talentScore(theirs);
  const d = (a - b) * 0.6 + (ta - tb) * 0.4;
  if (Math.abs(d) < 0.02) return "EVEN";
  if (d >= 0.08) return "CLEAR EDGE";
  if (d >= 0.02) return "SLIGHT EDGE";
  if (d <= -0.08) return "CLEAR DEFICIT";
  return "SLIGHT DEFICIT";
};

export const _bands = BANDS;
