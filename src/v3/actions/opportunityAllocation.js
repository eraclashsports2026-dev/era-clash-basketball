// ── Opportunity allocation ──────────────────────────────────────────────────
// Who receives this offensive opportunity.
//
// The defect this replaces: three action families selected their shooter with
//     mism ? mism.player : rng.weighted(...)
// which is not a bias but a REPLACEMENT. A 7'2" centre has a post mismatch
// against most lineups, so the condition held nearly always and one player took
// 100.0% of post-ups and 99.9% of isolations — 57% of the team's shots.
//
// The model here:
//
//     team usage plan
//   + role fit for THIS action
//   + bounded mismatch bias
//   + coach system
//   + game state
//   + seeded game form
//   - soft opportunity saturation
//   = selection weight
//
// Every term is bounded and multiplicative, so no single term can drive a
// weight to zero or to infinity, and a player is never made ineligible.
import { versionOf } from "../../versions.js";
import { perimeterSelectionWeight } from "../data/shooting.js";

export const OPPORTUNITY_ALLOCATION_VERSION = versionOf("opportunityAllocationVersion");

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r4 = (x) => Math.round(x * 10000) / 10000;

/**
 * The offensive dimensions a player can carry. Kept separate because they are
 * genuinely different: a passing hub creates without shooting, a movement
 * shooter shoots without creating, a screener neither creates nor shoots and is
 * still essential.
 */
export const OPPORTUNITY_DIMENSIONS = Object.freeze([
  "touch",        // how often the ball reaches him at all
  "creation",     // how often he initiates
  "shotAttempt",  // how often he finishes with a shot
  "finishing",    // how often he converts someone else's creation
  "passing",      // how often he is the assist source
  "offBall",      // how often he is the off-ball action target
]);

// How much a mismatch may raise the target share for the relevant action.
// Bounded, and severity-graded: a severe mismatch is worth exploiting hard, and
// still not worth exploiting exclusively.
export const MISMATCH_BIAS = Object.freeze({ SEVERE: 2.6, MAJOR: 2.0, MODERATE: 1.55, MINOR: 1.25 });

// How hard saturation pushes back. At `SATURATION_STRENGTH`, a player at twice
// his target share is weighted about a third as heavily as at target. Strong
// enough to matter, gentle enough that an extraordinary game survives.
export const SATURATION = Object.freeze({
  strength: 1.35,
  // Never fully suppress: a player at four times his target is still eligible,
  // because a real mismatch late in a real game is a reason to keep going.
  floor: 0.16,
  // Under-target teammates get a modest lift, not a windfall. An over-corrected
  // lift would simply invert the problem.
  underTargetCeiling: 1.35,
  // Below this many possessions the sample is too small for a share to mean
  // anything, so saturation stays off and the plan alone decides.
  warmupPossessions: 8,
});

// Seeded game form: a hot or cold night. Derived from the seed BEFORE any
// outcome, so it can never become a "he made two, feed him" runaway.
export const FORM_BAND = Object.freeze({ lo: 0.82, hi: 1.18 });

/**
 * Per-action role fit, on a 0-2ish scale. Deliberately shallow: this describes
 * WHO SUITS the action, and the usage plan describes how often he should be
 * involved at all. Mixing the two is how fit came to dominate usage.
 */
const FIT = {
  POST_UP: (p) => 0.15 + (p.postThreat ?? 5) * 0.17,
  ISOLATION: (p) => 0.15 + (p.selfCreation ?? 5) * 0.15,
  PICK_AND_ROLL: (p) => 0.2 + (p.selfCreation ?? 5) * 0.13,
  SPOT_UP: (p) => 0.1 + perimeter(p) * 0.55,
  CUT: (p) => 0.15 + (p.profile?.offense?.offBallMovement ?? 5) * 0.11 + (p.rimThreat ?? 5) * 0.07,
  OFF_BALL_SCREEN: (p) => 0.1 + (p.profile?.offense?.offBallMovement ?? 5) * 0.13 + perimeter(p) * 0.25,
  HANDOFF: (p) => 0.15 + (p.selfCreation ?? 5) * 0.09 + perimeter(p) * 0.3,
  TRANSITION: (p) => 0.2 + (p.rimThreat ?? 5) * 0.1 + (p.selfCreation ?? 5) * 0.06,
  ZONE_ATTACK: (p) => 0.2 + perimeter(p) * 0.3 + (p.postThreat ?? 5) * 0.06,
  GENERIC_HALF_COURT: (p) => 0.35 + (p.selfCreation ?? 5) * 0.06,
};

// The canonical scale, not a local copy. A private table here was how the
// phantom vocabulary spread in the first place.
const perimeter = (p) => perimeterSelectionWeight(p.profile?.shooting?.perimeterSkill);

export const rawFit = (family, p) => (FIT[family] ?? FIT.GENERIC_HALF_COURT)(p);

/**
 * Fit is a BOUNDED MODULATOR of the plan, never a competitor to it.
 *
 * Raw fit spans roughly 3.6x between an elite post player and a poor one, while
 * usage shares are compressed by design — a five-creator stack runs 0.177 to
 * 0.213, a ratio of 1.20. Multiplying by raw fit therefore lets fit decide the
 * distribution outright, and the bottom-usage player out-shot the top-usage one.
 *
 * This is the same trap an earlier phase had already fixed for the old shooter
 * draw, and re-creating it here is exactly why that fix carried a comment.
 * Raw fit is normalised against the best fit in THIS lineup and mapped into a
 * bounded band, so a great post player gets more post-ups than a poor one and
 * still does not get more TOUCHES than the primary creator.
 */
/**
 * The band is PER FAMILY, because how much suitability should matter differs by
 * action. A spot-up is almost entirely about who can shoot; a generic half-court
 * possession is almost entirely about whose turn it is. One global band gets
 * both wrong — a narrow band let a non-shooter take 16% of spot-ups, and a wide
 * one let fit override the usage plan outright.
 */
export const FIT_BANDS = Object.freeze({
  SPOT_UP: { lo: 0.2, hi: 2.4 },          // the action IS the shooting
  OFF_BALL_SCREEN: { lo: 0.25, hi: 2.2 }, // likewise, plus movement
  POST_UP: { lo: 0.3, hi: 2.1 },          // a guard does not post up a centre
  HANDOFF: { lo: 0.35, hi: 2.0 },
  ZONE_ATTACK: { lo: 0.4, hi: 1.9 },
  CUT: { lo: 0.4, hi: 1.9 },
  ISOLATION: { lo: 0.5, hi: 1.8 },        // creation matters, usage matters more
  PICK_AND_ROLL: { lo: 0.55, hi: 1.7 },
  TRANSITION: { lo: 0.6, hi: 1.6 },
  GENERIC_HALF_COURT: { lo: 0.75, hi: 1.35 }, // mostly whose turn it is
});
export const DEFAULT_FIT_BAND = Object.freeze({ lo: 0.55, hi: 1.7 });
export const FIT_BAND = DEFAULT_FIT_BAND;

export const boundedFit = (family, player, pool) => {
  const band = FIT_BANDS[family] ?? DEFAULT_FIT_BAND;
  const raw = rawFit(family, player);
  const best = Math.max(...pool.map((p) => rawFit(family, p)), 1e-6);
  return band.lo + clamp(raw / best, 0, 1) * (band.hi - band.lo);
};

// Kept for callers that want the unbounded shape (diagnostics, profiles).
export const fitFor = (family, p) => rawFit(family, p);

/**
 * The pregame target profile for one player.
 *
 * These are EXPECTATIONS, not limits. Nothing in the engine refuses a player an
 * opportunity for exceeding them; they set the point at which saturation begins
 * to push back.
 */
export const buildOpportunityProfile = ({ player, teamPlan = null, coach = null }) => {
  const usage = player.usageShare ?? 0.2;
  const tier = player.creationTier;
  const creationWeight = tier === "PRIMARY" ? 2.1 : tier === "SECONDARY" ? 1.2 : 0.45;
  const pass = (player.passing ?? 5) / 10;
  const offBall = (player.profile?.offense?.offBallMovement ?? 5) / 10;

  return {
    playerCardId: player.cardId,
    // Touches follow usage plus playmaking: a hub touches the ball more often
    // than his shot share suggests, which is the whole point of a hub.
    touchShareTarget: r4(usage * (0.75 + pass * 0.5)),
    creationShareTarget: r4(usage * creationWeight),
    // Shot attempts are the dimension this phase is about, and they are NOT
    // the same as touches. A passing hub with a high touch share may have a
    // modest shot share, and forcing them equal is what produced a shot
    // monopoly for the best interior player.
    shotAttemptShareTarget: r4(usage),
    finishingShareTarget: r4(usage * (0.6 + (player.rimThreat ?? 5) * 0.06)),
    passingShareTarget: r4(usage * (0.5 + pass * 1.3)),
    offBallActionShareTarget: r4(usage * (0.5 + offBall * 1.1)),
    actionEligibility: Object.fromEntries(Object.keys(FIT).map((k) => [k, r4(fitFor(k, player))])),
    roleScalability: player.profile?.fit?.roleScalability ?? null,
    coachFit: coach?.id ?? null,
    confidence: player.profile?.provenance?.confidence?.offense ?? null,
    opportunityAllocationVersion: OPPORTUNITY_ALLOCATION_VERSION,
  };
};

/**
 * Normalises a set of targets so they sum to 1. Without this the targets would
 * be a set of independent guesses, and "over target" would mean nothing.
 */
export const normaliseTargets = (profiles, dimension) => {
  const key = `${dimension}ShareTarget`;
  const total = profiles.reduce((a, p) => a + (p[key] ?? 0), 0);
  if (!(total > 0)) {
    const even = 1 / profiles.length;
    return Object.fromEntries(profiles.map((p) => [p.playerCardId, even]));
  }
  const out = Object.fromEntries(profiles.map((p) => [p.playerCardId, r4((p[key] ?? 0) / total)]));
  // Absorb rounding drift into the largest share, where it is proportionally
  // smallest, so the targets sum to exactly 1.
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum !== 1) {
    const biggest = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
    out[biggest] = r4(out[biggest] + (1 - sum));
  }
  return out;
};

/**
 * Live ledger of what each player has actually received. Deterministic: it is
 * driven only by the possessions that happened, in order.
 */
export const createOpportunityLedger = (playerCardIds) => {
  const counts = Object.fromEntries(playerCardIds.map((id) => [id, { shotAttempt: 0, touch: 0, creation: 0, offBall: 0, passing: 0, finishing: 0 }]));
  let totals = { shotAttempt: 0, touch: 0, creation: 0, offBall: 0, passing: 0, finishing: 0 };
  return {
    record(cardId, dimension) {
      if (!counts[cardId]) return;
      counts[cardId][dimension] += 1;
      totals[dimension] += 1;
    },
    realizedShare(cardId, dimension) {
      const t = totals[dimension];
      return t > 0 ? counts[cardId][dimension] / t : 0;
    },
    total: (dimension) => totals[dimension],
    counts: () => JSON.parse(JSON.stringify(counts)),
    snapshot: () => ({ counts: JSON.parse(JSON.stringify(counts)), totals: { ...totals } }),
  };
};

/**
 * Opportunity pressure: how far above or below target a player currently sits.
 *
 * Returns a multiplier, not a verdict. Smooth, bounded, monotone, and it never
 * reaches zero — a saturated player stays eligible, because a genuine mismatch
 * late in a game is a reason to keep going to him.
 */
export const saturationMultiplier = ({ realized, target, totalSoFar, cfg = SATURATION }) => {
  if (totalSoFar < cfg.warmupPossessions) return 1;
  if (!(target > 0)) return 1;
  const ratio = realized / target;
  if (ratio <= 1) {
    // Under target: a modest lift that grows as the gap grows, capped so that
    // an under-used player cannot suddenly dominate.
    return clamp(1 + (1 - ratio) * (cfg.underTargetCeiling - 1), 1, cfg.underTargetCeiling);
  }
  // Over target: a smooth power decay. At twice target this is about 0.35, at
  // four times about 0.16 — the floor.
  return clamp(Math.pow(ratio, -cfg.strength), cfg.floor, 1);
};

/**
 * A bounded, reasoned mismatch bias.
 *
 * Replaces the old override. A mismatch multiplies the relevant player's weight
 * rather than deleting everyone else's, so exploitation is real but not total.
 */
export const mismatchMultiplier = ({ player, mismatch, family }) => {
  if (!mismatch || mismatch.playerCardId !== player.cardId) return { mult: 1, reason: null };
  // Action-specific: a post mismatch is a reason to post up, not a reason to
  // shoot a spot-up three.
  const RELEVANT = {
    POST_UP: ["SIZE_MISMATCH", "POST_MISMATCH", "STRENGTH_MISMATCH"],
    ISOLATION: ["SPEED_MISMATCH", "CREATION_MISMATCH", "SIZE_MISMATCH"],
    OFF_BALL_SCREEN: ["CHASE_MISMATCH", "SPEED_MISMATCH"],
    PICK_AND_ROLL: ["SPEED_MISMATCH", "SIZE_MISMATCH"],
    ZONE_ATTACK: [],
  };
  const kinds = RELEVANT[family];
  if (kinds && kinds.length && mismatch.type && !kinds.includes(mismatch.type)) return { mult: 1, reason: null };
  const mult = MISMATCH_BIAS[mismatch.severity] ?? 1;
  return { mult, reason: `${mismatch.severity} ${mismatch.type ?? "mismatch"} exploited via ${family}` };
};

/**
 * Seeded game form. Derived from the seed and the player, BEFORE any outcome,
 * so a hot start can never feed itself more shots.
 */
export const formMultiplier = ({ player, rng, band = FORM_BAND }) => {
  if (!rng?.formFor) return 1;
  const raw = rng.formFor(player.cardId);
  const volatility = clamp(1 - (player.profile?.fit?.roleScalability ?? 5) / 20, 0.6, 1);
  const spread = (band.hi - band.lo) * volatility;
  return clamp(band.lo + raw * spread, band.lo, band.hi);
};

/**
 * The selection weight for one player, for one opportunity.
 *
 * Every factor is returned alongside the product so a selection can be
 * explained. An unexplainable allocation is not debuggable, and this system was
 * broken for a whole phase precisely because nobody could see inside it.
 */
export const opportunityWeight = ({
  player, family, dimension = "shotAttempt", targets, ledger,
  mismatch = null, state = null, rng = null, coachBias = 1, pool = null,
}) => {
  const target = targets?.[player.cardId] ?? 0;
  const realized = ledger ? ledger.realizedShare(player.cardId, dimension) : 0;
  const totalSoFar = ledger ? ledger.total(dimension) : 0;

  const plan = Math.max(target, 0.01);
  // Bounded against the lineup when a pool is supplied; raw only when a caller
  // deliberately wants the unbounded shape.
  const fit = pool ? boundedFit(family, player, pool) : rawFit(family, player);
  const sat = saturationMultiplier({ realized, target, totalSoFar });
  const { mult: mism, reason } = mismatchMultiplier({ player, mismatch, family });
  const form = formMultiplier({ player, rng });

  // Late-game urgency tilts toward creators. Bounded, and it does not stack
  // with the mismatch bias without limit.
  const urgency = state?.lateGameUrgency ?? 0;
  const tierBoost = player.creationTier === "PRIMARY" ? 1 + urgency * 0.5
    : player.creationTier === "SECONDARY" ? 1 + urgency * 0.12
    : Math.max(0.35, 1 - urgency * 0.3);

  const weight = plan * fit * sat * mism * form * tierBoost * coachBias;
  // Floor only a FINITE weight. Flooring unconditionally turned a NaN into
  // 1e-6, which kept every player selectable and made the invalid-weight guard
  // in selectForOpportunity unreachable — a safety net that cannot fire is
  // worse than none, because it reads as protection.
  return {
    weight: Number.isFinite(weight) ? Math.max(weight, 1e-6) : weight,
    factors: { plan: r4(plan), fit: r4(fit), saturation: r4(sat), mismatch: r4(mism), form: r4(form), tierBoost: r4(tierBoost), coachBias: r4(coachBias) },
    realizedShare: r4(realized),
    targetShare: r4(target),
    mismatchReason: reason,
  };
};

/**
 * Selects a player for an opportunity.
 *
 * `exclude` keeps the passer, screener and shooter distinct — those are
 * genuinely different jobs and collapsing them is how a passing hub becomes a
 * shot monopoly.
 *
 * If every weight is invalid this THROWS rather than silently returning element
 * zero. The old `rng.weighted` behaviour floored a NaN weight to 0 and returned
 * the first player, which produced 3,749 attempts for one player in an 80-game
 * sample and looked exactly like a modelling decision.
 */
export const selectForOpportunity = ({
  players, family, dimension = "shotAttempt", targets, ledger, rng,
  mismatch = null, state = null, exclude = [], coachBiasFor = null, record = true,
}) => {
  const pool = players.filter((p) => !exclude.includes(p.index) && !exclude.includes(p.cardId));
  if (!pool.length) throw new Error(`selectForOpportunity: no eligible player for ${family}`);

  const scored = pool.map((p) => ({
    player: p,
    ...opportunityWeight({ player: p, family, dimension, targets, ledger, mismatch, state, rng, coachBias: coachBiasFor?.(p) ?? 1, pool }),
  }));

  const total = scored.reduce((a, s) => a + s.weight, 0);
  if (!Number.isFinite(total) || total <= 0 || scored.some((s) => !Number.isFinite(s.weight))) {
    throw new Error(`selectForOpportunity: every weight invalid for ${family} — refusing to fall back to the first player`);
  }

  const chosen = rng.weighted(scored, (s) => s.weight);
  if (record && ledger) ledger.record(chosen.player.cardId, dimension);
  return { player: chosen.player, weight: chosen.weight, factors: chosen.factors, mismatchReason: chosen.mismatchReason };
};

/** Diagnostics for the calibration harness. Never exposed in the product UI. */
export const allocationDiagnostics = ({ profiles, targets, ledger, dimension = "shotAttempt" }) => ({
  dimension,
  players: profiles.map((p) => {
    const target = targets[p.playerCardId] ?? 0;
    const realized = ledger.realizedShare(p.playerCardId, dimension);
    return {
      playerCardId: p.playerCardId,
      targetShare: r4(target),
      realizedShare: r4(realized),
      error: r4(realized - target),
      saturation: r4(saturationMultiplier({ realized, target, totalSoFar: ledger.total(dimension) })),
    };
  }),
  total: ledger.total(dimension),
});
