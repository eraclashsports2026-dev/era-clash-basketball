// ── Offensive action families ───────────────────────────────────────────────
// actionLibraryVersion 2.0.0 — a MAJOR bump because the library's contract
// changed: it went from one detailed action plus a generic fallback to a set of
// families with a shared interface, and Phase 6B1 results are not comparable
// to Phase 6B2 results.
//
// Each family implements:
//   canSelect(ctx)   is this action legal and possible at all?
//   weight(ctx)      how often is it attempted? frequency ONLY
//   prepare(ctx)     who is involved, and what does the defence look like?
//   resolve(ctx,rng) structured consequences — never a score, never a winner
//
// The point of post-up and isolation coming first: they are what turn a
// DETECTED mismatch into actual exploitation. Before them the engine could
// identify a post mismatch and had no way to attack it.
import { selectForOpportunity } from "./opportunityAllocation.js";
import { perimeterSelectionWeight } from "../data/shooting.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

// ── Shooter selection: usage is the BASE, family fit is a bounded multiplier ─
// Finite usage is the guarantee the whole offence rests on, so it cannot be one
// term among several. Adding fit to usage let a low-usage specialist out-shoot
// a primary creator by fitting one family well — measured, the top-usage player
// took FEWER attempts than the bottom-usage player. Multiplying by a nearly
// constant usage factor was no better, because usage shares are compressed by
// design (17-21% across a superstar stack) and fit still dominated.
//
// So: usage sets the base rate, and fit modulates it within a bounded band. A
// great post player gets more post-ups than a poor one; he does not get more
// TOUCHES than the primary creator.
const FIT_BAND = { lo: 0.55, hi: 1.7 };
export const usageWeighted = (players, fitOf) => {
  const maxFit = Math.max(...players.map(fitOf), 0.0001);
  // Keyed by the PLAYER, not by an index. rng.weighted invokes the weight
  // function with the item alone, so an index parameter arrives undefined and
  // every weight became NaN — which rng.weighted floors to 0, making it return
  // the first player in the array every single time. One player took 3,749
  // attempts in an 80-game sample before this was caught.
  return (p) => p.usageShare * (FIT_BAND.lo + clamp(fitOf(p) / maxFit, 0, 1) * (FIT_BAND.hi - FIT_BAND.lo));
};
/**
 * Selection through the opportunity allocator, with a legacy path retained so
 * the before/after comparison can be run.
 *
 * The mismatch is passed as CONTEXT, not used as an override. The old form —
 *     const poster = mism ? mism.player : rng.weighted(...)
 * — replaced the draw entirely, so a player with a standing mismatch took
 * 100.0% of post-ups and 99.9% of isolations. Exploiting a mismatch is real
 * basketball; taking every single possession is not.
 */
export const allocate = ({ family, dimension = "shotAttempt", offense, alloc, rng, mismatch = null, state = null, exclude = [], legacy }) => {
  if (!alloc) return legacy();
  return selectForOpportunity({
    players: offense.players, family, dimension,
    targets: alloc.targets[dimension], ledger: alloc.ledger,
    rng, mismatch, state, exclude,
  }).player;
};

export const ACTION_FAMILIES = [
  "POST_UP", "ISOLATION", "SPOT_UP", "CUT", "OFF_BALL_SCREEN", "HANDOFF",
  "PICK_AND_ROLL", "TRANSITION", "ZONE_ATTACK", "GENERIC_HALF_COURT",
];

// Bounded frequency priors. No family may crowd the others out simply because
// it has more fields — a cap per family, and generic remains a truthful
// fallback rather than being suppressed by randomly picking something else.
export const FAMILY_CAPS = {
  POST_UP: 0.30, ISOLATION: 0.28, SPOT_UP: 0.26, CUT: 0.20,
  OFF_BALL_SCREEN: 0.26, HANDOFF: 0.22, PICK_AND_ROLL: 0.46,
  TRANSITION: 1.0, ZONE_ATTACK: 0.75, GENERIC_HALF_COURT: 1.0,
};

// ── helpers ─────────────────────────────────────────────────────────────────
const threatOf = (defPlan, cardId) => defPlan?.threats.find((t) => t.playerCardId === cardId) ?? null;
const defenderProfileOf = (defPlan, cardId) => defPlan?.defenders.find((d) => d.playerCardId === cardId) ?? null;

/** The mismatch the offence would be attacking, if any, for this pairing. */
export const targetedMismatch = ({ defPlan, offCardId, defCardId, kinds }) => {
  if (!defPlan) return null;
  const row = defPlan.matrix.cells[defPlan.matrix.defenders.findIndex((d) => d.playerCardId === defCardId)];
  const cell = row?.find((c) => c.offensivePlayerId === offCardId);
  if (!cell) return null;
  const rank = { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 };
  const hits = cell.mismatches.filter((m) => kinds.includes(m.type)).sort((a, b) => rank[b.severity] - rank[a.severity]);
  return hits[0] ?? null;
};

// ── POST_UP ─────────────────────────────────────────────────────────────────
export const POST_UP = {
  key: "POST_UP",
  canSelect: ({ offense, defPlan }) => offense.players.some((p) => p.postThreat >= 5) && Boolean(defPlan),
  weight: ({ offense, defPlan, eff, state }) => {
    // Frequency from coach post tendency, roster post skill, and era interior
    // value — then RAISED by an actual detected post mismatch, which is the
    // whole point of this family existing.
    const best = Math.max(...offense.players.map((p) => p.postThreat));
    const coachPost = offense.postPref ?? 5;
    const eraInterior = eff.interiorDensity ?? 5;
    let w = (coachPost / 10) * 0.16 + (best / 10) * 0.12 + clamp((eraInterior - 4) * 0.014, -0.03, 0.06);
    // A detected mismatch RAISES the frequency — but scaled by how willing this
    // coach is to post at all. A coach whose documented system never posts does
    // not become a post team because a mismatch appeared; he posts a little
    // more. Without the scaling, a severe mismatch pinned every coach to the
    // cap and erased coach identity for this family entirely.
    const mism = postMismatchFor({ offense, defPlan });
    if (mism) {
      const willingness = clamp(0.25 + (coachPost / 10) * 0.9, 0.25, 1.15);
      w += (({ SEVERE: 0.13, MAJOR: 0.08, MODERATE: 0.04, MINOR: 0.015 })[mism.mismatch.severity] ?? 0) * willingness;
    }
    // Late and trailing, a team hunts a creator rather than a post entry.
    w *= 1 - (state?.lateGameUrgency ?? 0) * 0.35;
    return clamp(w, 0, FAMILY_CAPS.POST_UP);
  },
  prepare: ({ offense, defense, defPlan, defState, rng, pickDefender, state, alloc }) => {
    const mism = postMismatchFor({ offense, defPlan });
    const poster = allocate({
      family: "POST_UP", offense, alloc, rng, state,
      mismatch: mism ? { playerCardId: mism.player.cardId, type: mism.mismatch?.type, severity: mism.mismatch?.severity } : null,
      legacy: () => (mism ? mism.player : rng.weighted(offense.players, usageWeighted(offense.players, (p) => 0.2 + p.postThreat * 0.6))),
    });
    const defender = pickDefender(defense, poster, defState);
    // The entry passer is a DIFFERENT job from the shot. Keeping them separate
    // is what stops a passing hub becoming a shot monopoly.
    const entryPasser = allocate({
      family: "POST_UP", dimension: "passing", offense, alloc, rng, state, exclude: [poster.index],
      legacy: () => rng.weighted(offense.players.filter((p) => p.index !== poster.index), (p) => 0.4 + p.passing * 0.6),
    });
    const helper = defPlan?.help.responsibilities.find((h) => h.role === "LOW_MAN" || h.role === "RIM_HELPER") ?? null;
    return { poster, defender, entryPasser, helper, mismatch: mism?.mismatch ?? null };
  },
};

/** The best available post mismatch, or null. General — no player ids. */
export const postMismatchFor = ({ offense, defPlan, defState = null }) => {
  if (!defPlan) return null;
  const rank = { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 };
  let best = null;
  for (const p of offense.players) {
    if (p.postThreat < 4.5) continue;
    const defId = defState ? defState.currentAssignments.get(p.cardId) : defPlan.baselineAssignments.find((a) => a.offensivePlayerId === p.cardId)?.defenderId;
    if (!defId) continue;
    const m = targetedMismatch({ defPlan, offCardId: p.cardId, defCardId: defId, kinds: ["POST_MISMATCH", "SIZE_MISMATCH", "STRENGTH_MISMATCH"] });
    if (!m) continue;
    if (!best || rank[m.severity] > rank[best.mismatch.severity]) best = { player: p, mismatch: m, defenderId: defId };
  }
  return best;
};

// ── ISOLATION ───────────────────────────────────────────────────────────────
export const ISOLATION = {
  key: "ISOLATION",
  canSelect: ({ offense }) => offense.players.some((p) => p.selfCreation >= 6),
  weight: ({ offense, defPlan, eff, state }) => {
    const best = Math.max(...offense.players.map((p) => p.selfCreation));
    const coachIso = offense.isoPref ?? 5;
    let w = (coachIso / 10) * 0.15 + (best / 10) * 0.1;
    const mism = speedMismatchFor({ offense, defPlan });
    if (mism) {
      const willingness = clamp(0.3 + (coachIso / 10) * 0.85, 0.3, 1.15);
      w += (({ SEVERE: 0.11, MAJOR: 0.07, MODERATE: 0.035, MINOR: 0.015 })[mism.mismatch.severity] ?? 0) * willingness;
    }
    // Isolation is the late-game action, so urgency RAISES it — the opposite of
    // the post entry. Neither is universally efficient.
    w *= 1 + (state?.lateGameUrgency ?? 0) * 0.6;
    // Crowded paint makes driving isolation worse; spacing makes it better.
    w *= clamp(0.7 + offense.offense.spacing * 0.06, 0.7, 1.3);
    return clamp(w, 0, FAMILY_CAPS.ISOLATION);
  },
  prepare: ({ offense, defense, defPlan, defState, rng, pickDefender, state, alloc }) => {
    const mism = speedMismatchFor({ offense, defPlan });
    const creator = allocate({
      family: "ISOLATION", offense, alloc, rng, state,
      mismatch: mism ? { playerCardId: mism.player.cardId, type: mism.mismatch?.type, severity: mism.mismatch?.severity } : null,
      legacy: () => (mism && !(state?.lateGameUrgency > 0.5) ? mism.player
        : rng.weighted(offense.players, usageWeighted(offense.players, (p) => 0.15 + p.selfCreation * 0.5 * (1 + (state?.lateGameUrgency ?? 0))))),
    });
    const defender = pickDefender(defense, creator, defState);
    const helper = defPlan?.help.responsibilities.find((h) => h.role === "NAIL_HELPER" || h.role === "RIM_HELPER") ?? null;
    return { creator, defender, helper, mismatch: mism?.mismatch ?? null };
  },
};

/** The best available speed / on-ball mismatch. */
export const speedMismatchFor = ({ offense, defPlan, defState = null }) => {
  if (!defPlan) return null;
  const rank = { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 };
  let best = null;
  for (const p of offense.players) {
    if (p.selfCreation < 5.5) continue;
    const defId = defState ? defState.currentAssignments.get(p.cardId) : defPlan.baselineAssignments.find((a) => a.offensivePlayerId === p.cardId)?.defenderId;
    if (!defId) continue;
    const m = targetedMismatch({ defPlan, offCardId: p.cardId, defCardId: defId, // SIZE_MISMATCH belongs here: a size advantage on the perimeter IS an
    // isolation opportunity, and it is what the POST_CONVERSION variant
    // attacks. Omitting it made that variant dead code — the conversion branch
    // could never fire because a size mismatch was never the iso mismatch.
    kinds: ["SPEED_MISMATCH", "PULLUP_SHOOTING_MISMATCH", "FOUL_RISK_MISMATCH", "SIZE_MISMATCH"] });
    if (!m) continue;
    if (!best || rank[m.severity] > rank[best.mismatch.severity]) best = { player: p, mismatch: m, defenderId: defId };
  }
  return best;
};

// ── OFF_BALL_SCREEN ─────────────────────────────────────────────────────────
// The family that makes movement-shooter chase burden materially real.
export const OFF_BALL_SCREEN = {
  key: "OFF_BALL_SCREEN",
  canSelect: ({ offense }) => offense.players.some((p) => (p.profile?.offense?.offBallMovement ?? 0) >= 5.5),
  weight: ({ offense, defPlan, eff, state }) => {
    const mover = Math.max(...offense.players.map((p) => p.profile?.offense?.offBallMovement ?? 0));
    const w = (offense.offBallPref ?? 5) / 10 * 0.15 + (mover / 10) * 0.13
      + clamp((eff.perimeterShotValue - 3) * 0.012, -0.02, 0.05);
    const chase = chaseMismatchFor({ offense, defPlan });
    return clamp(w + (chase ? 0.07 : 0), 0, FAMILY_CAPS.OFF_BALL_SCREEN);
  },
  prepare: ({ offense, defense, defPlan, defState, rng, pickDefender, state, alloc }) => {
    const chase = chaseMismatchFor({ offense, defPlan });
    const shooter = allocate({
      family: "OFF_BALL_SCREEN", dimension: "offBall", offense, alloc, rng, state,
      mismatch: chase ? { playerCardId: chase.player.cardId, type: chase.mismatch?.type ?? "CHASE_MISMATCH", severity: chase.mismatch?.severity } : null,
      legacy: () => (chase ? chase.player : rng.weighted(offense.players, usageWeighted(offense.players, (p) => 0.2 + (p.profile?.offense?.offBallMovement ?? 5) * 0.5))),
    });
    const screener = rng.weighted(offense.players.filter((p) => p.index !== shooter.index), (p) => 0.3 + p.postThreat * 0.3 + (p.profile?.physical?.weightLb ?? 210) / 100);
    const chaser = pickDefender(defense, shooter, defState);
    const screenerDefender = pickDefender(defense, screener, defState);
    return { shooter, screener, chaser, screenerDefender, mismatch: chase?.mismatch ?? null };
  },
};

export const chaseMismatchFor = ({ offense, defPlan, defState = null }) => {
  if (!defPlan) return null;
  const rank = { SEVERE: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 };
  let best = null;
  for (const p of offense.players) {
    const t = threatOf(defPlan, p.cardId);
    if (!t || t.threats.movementShooting < 5) continue;
    const defId = defState ? defState.currentAssignments.get(p.cardId) : defPlan.baselineAssignments.find((a) => a.offensivePlayerId === p.cardId)?.defenderId;
    if (!defId) continue;
    const m = targetedMismatch({ defPlan, offCardId: p.cardId, defCardId: defId, kinds: ["MOVEMENT_SHOOTING_MISMATCH", "SCREEN_NAVIGATION_MISMATCH"] });
    if (!m) continue;
    if (!best || rank[m.severity] > rank[best.mismatch.severity]) best = { player: p, mismatch: m, defenderId: defId };
  }
  return best;
};

// ── HANDOFF ─────────────────────────────────────────────────────────────────
// A hub big handing off above the break is exactly what pulls a rim protector
// out of the paint, which is why this family and the paint-availability
// correction belong in the same phase.
export const HANDOFF = {
  key: "HANDOFF",
  canSelect: ({ offense }) => offense.players.some((p) => p.passing >= 6 && (p.profile?.physical?.heightIn ?? 0) >= 78),
  weight: ({ offense, eff }) => {
    const hub = Math.max(...offense.players.filter((p) => (p.profile?.physical?.heightIn ?? 0) >= 78).map((p) => p.passing), 0);
    return clamp((offense.handoffPref ?? 5) / 10 * 0.13 + (hub / 10) * 0.12 + clamp((eff.perimeterShotValue - 3) * 0.01, -0.02, 0.04), 0, FAMILY_CAPS.HANDOFF);
  },
  prepare: ({ offense, defense, defState, rng, pickDefender, state, alloc }) => {
    // The hub HANDS OFF; the receiver shoots. Two different dimensions, so a
    // tall passer does not thereby become a volume scorer.
    const hub = alloc
      ? selectForOpportunity({ players: offense.players, family: "HANDOFF", dimension: "passing",
          targets: alloc.targets.passing, ledger: alloc.ledger, rng, state }).player
      : rng.weighted(offense.players, (p) => 0.15 + p.passing * 0.45 + ((p.profile?.physical?.heightIn ?? 76) - 74) * 0.12);
    const receiver = allocate({
      family: "HANDOFF", offense, alloc, rng, state, exclude: [hub.index],
      legacy: () => rng.weighted(offense.players.filter((p) => p.index !== hub.index), (p) => (0.2 + p.selfCreation * 0.35 + (p.profile?.shooting?.perimeterSkill === "ELITE" ? 2 : 0.5)) * (0.5 + p.usageShare * 2.6)),
    });
    return { hub, receiver, hubDefender: pickDefender(defense, hub, defState), receiverDefender: pickDefender(defense, receiver, defState) };
  },
};

// ── SPOT_UP and CUT ─────────────────────────────────────────────────────────
// Both EMERGE from a creation event rather than being initiated, so their
// weight is low on its own and they are mostly reached as continuations.
export const SPOT_UP = {
  key: "SPOT_UP",
  canSelect: ({ offense, eff }) => eff.perimeterShotValue > 0 && offense.players.some((p) => perimeterSelectionWeight(p.profile?.shooting?.perimeterSkill) > 0.1),
  weight: ({ offense, eff }) => clamp(0.05 + offense.offense.spacing * 0.014 + clamp((eff.perimeterShotValue - 3) * 0.014, -0.03, 0.06), 0, FAMILY_CAPS.SPOT_UP),
  prepare: ({ offense, defense, defState, rng, pickDefender, state, alloc }) => {
    const shooter = allocate({
      family: "SPOT_UP", offense, alloc, rng, state,
      legacy: () => rng.weighted(offense.players, usageWeighted(offense.players, (p) => 0.15 + perimeterSelectionWeight(p.profile?.shooting?.perimeterSkill))),
    });
    const passer = allocate({
      family: "SPOT_UP", dimension: "passing", offense, alloc, rng, state, exclude: [shooter.index],
      legacy: () => rng.weighted(offense.players.filter((p) => p.index !== shooter.index), (p) => 0.3 + p.passing * 0.5 + (p.creationTier === "PRIMARY" ? 1.6 : 0)),
    });
    return { shooter, passer, closeoutDefender: pickDefender(defense, shooter, defState) };
  },
};

export const CUT = {
  key: "CUT",
  canSelect: ({ offense }) => offense.players.some((p) => (p.profile?.offense?.offBallMovement ?? 0) >= 5),
  weight: ({ offense }) => clamp(0.04 + (offense.cutPref ?? 5) / 10 * 0.1 + offense.offense.passing * 0.008, 0, FAMILY_CAPS.CUT),
  prepare: ({ offense, defense, defState, rng, pickDefender, state, alloc }) => {
    const cutter = allocate({
      family: "CUT", offense, alloc, rng, state,
      legacy: () => rng.weighted(offense.players, usageWeighted(offense.players, (p) => 0.2 + (p.profile?.offense?.offBallMovement ?? 5) * 0.35 + p.rimThreat * 0.25)),
    });
    const passer = allocate({
      family: "CUT", dimension: "passing", offense, alloc, rng, state, exclude: [cutter.index],
      legacy: () => rng.weighted(offense.players.filter((p) => p.index !== cutter.index), (p) => 0.3 + p.passing * 0.6),
    });
    // Cut types stay broad: the data does not support claiming an exact
    // historical play design.
    return { cutter, passer, denier: pickDefender(defense, cutter, defState), cutType: null };
  },
};

export const FAMILY_REGISTRY = { POST_UP, ISOLATION, SPOT_UP, CUT, OFF_BALL_SCREEN, HANDOFF };
