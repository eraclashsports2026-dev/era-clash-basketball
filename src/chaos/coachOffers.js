// ── Three coach offers ───────────────────────────────────────────────────────
// After both rosters lock, each side is offered exactly three coaches in three
// strategically distinct roles (locked decision #25). Chaos Clash deliberately
// does NOT expose the full coach library — Dream Matchup does (#26, #27).
//
// There are no flat coach bonuses anywhere (#29). A coach's effect emerges from
// roster supply, system demands, opponent interaction and era legality, exactly
// as it already did in Dream Matchup. The scores below decide only which three
// names are OFFERED and how they are explained; the simulation still resolves
// every possession from Coach Intelligence as it always has.
import { POSITIONS } from "../players.js";
import { COACHES } from "../v3/coaches.js";
import { getEra } from "../v3/eraStyles.js";
import { rosterShape } from "./eraTranslation.js";
import { hashString, mulberry32, deriveSeed } from "../v3/seed.js";

export const COACH_OFFER_VERSION = "1.0.0";
export const OFFER_ROLES = Object.freeze(["ROSTER_MAXIMIZER", "OPPONENT_COUNTER", "ERA_ADAPTER"]);

export const ROLE_LABEL = Object.freeze({
  ROSTER_MAXIMIZER: "Roster Maximizer",
  OPPONENT_COUNTER: "Opponent Counter",
  ERA_ADAPTER: "Era Adapter",
});
export const ROLE_BLURB = Object.freeze({
  ROSTER_MAXIMIZER: "Best deploys what this roster already does well.",
  OPPONENT_COUNTER: "Built to attack the other side's biggest problem.",
  ERA_ADAPTER: "Best translates this roster into tonight's rules.",
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const five = (r) => (Array.isArray(r) ? r : POSITIONS.map((s) => r[s])).filter(Boolean);

/**
 * Roster supply, expressed in the same vocabulary as coach.rosterFit.
 * Derived from real card statistics. `shootingBigs` is intentionally
 * conservative: the cards carry no three-point rate, so it is inferred from
 * perimeter scoring share for a big and is never presented as a measurement.
 */
export const rosterSupply = (roster) => {
  const t = five(roster);
  if (t.length < 5) return null;
  const slots = POSITIONS;
  const bigs = t.filter((p, i) => ["PF", "C"].includes(slots[i]));
  const wings = t.filter((p, i) => ["SG", "SF"].includes(slots[i]));
  const sum = (k) => t.reduce((s, p) => s + p[k], 0);
  const max = (k) => Math.max(...t.map((p) => p[k]));
  return {
    traditionalCenters: clamp01(Math.max(0, ...bigs.map((p) => (p.reb + p.blk * 2) / 22)) ),
    passingBigs: clamp01(Math.max(0, ...bigs.map((p) => p.ast / 6))),
    shootingBigs: clamp01(Math.max(0, ...bigs.map((p) => p.pts / 26)) * 0.7),
    primaryCreators: clamp01(max("ast") / 10),
    multipleCreators: clamp01(t.filter((p) => p.ast >= 5).length / 3),
    switchableWings: clamp01(wings.reduce((s, p) => s + p.stl + p.reb / 8, 0) / 5),
    shooters: clamp01(rosterShape(roster).perimeter),
    defenders: clamp01((sum("stl") / 8 + sum("blk") / 6) / 2),
    transitionAthletes: clamp01((sum("stl") / 8 + sum("pts") / 120) / 2),
  };
};

/** How well the coach's demands are met by this roster's supply. */
export const rosterMaximizerScore = (coach, roster) => {
  const sup = rosterSupply(roster);
  if (!sup) return 0;
  const keys = Object.keys(sup);
  let num = 0, den = 0;
  for (const k of keys) {
    const want = (coach.rosterFit?.[k] ?? 5) / 10;
    // A coach who NEEDS something the roster lacks is penalised in proportion
    // to how badly they need it; surplus the coach does not use is neutral.
    num += want * sup[k]; den += want;
  }
  return den ? num / den : 0;
};

/** Does this coach's structure attack the opponent's most important weakness? */
export const opponentCounterScore = (coach, myRoster, oppRoster) => {
  if (!oppRoster) return 0;
  const opp = rosterShape(oppRoster), oppSup = rosterSupply(oppRoster);
  const d = coach.defense || {}, o = coach.offense || {};
  let s = 0;
  // Contain a dominant creator: pressure + switching.
  s += (oppSup?.primaryCreators ?? 0) * ((d.pressure ?? 5) + (d.switching ?? 5)) / 20 * 0.30;
  // Contain interior scoring: rim priority + drop coverage.
  s += opp.interior * ((d.rimPriority ?? 5) + (d.drop ?? 5)) / 20 * 0.26;
  // Attack a weak-rebounding opponent on the glass.
  s += (1 - opp.glass) * ((d.defRebPriority ?? 5) / 10) * 0.16;
  // Attack a slow opponent in transition.
  s += (1 - (oppSup?.transitionAthletes ?? 0.5)) * ((o.transition ?? 5) + (o.tempo ?? 5)) / 20 * 0.16;
  // Punish weak perimeter defence with movement.
  s += (1 - (oppSup?.defenders ?? 0.5)) * ((o.motion ?? 5) + (o.offBall ?? 5)) / 20 * 0.12;
  return clamp01(s);
};

/** Does this coach's system remain legal and effective in this environment? */
export const eraAdapterScore = (coach, roster, eraId) => {
  const era = getEra(eraId);
  if (!era) return 0;
  const o = coach.offense || {}, d = coach.defense || {};
  let s = 0.5;
  // Lived experience of the environment is real evidence, not a bonus.
  if ((coach.eras || []).includes(eraId)) s += 0.16;
  if (!era.rules.threePoint) {
    // A three-heavy system loses its central idea when the arc pays two.
    s -= ((o.threeEmphasis ?? 5) / 10) * 0.26;
    s += ((o.post ?? 5) / 10) * 0.16;
  } else if (era.environment.tpaPerGame >= 20) {
    s += ((o.threeEmphasis ?? 5) / 10) * 0.22;
    s -= ((o.post ?? 5) / 10) * 0.10;
  }
  if (!era.rules.zoneLegal) {
    // Zones are illegal: a zone-reliant coach must abandon their structure.
    s -= ((d.zone ?? 1) / 10) * 0.30;
    s += ((d.man ?? 5) / 10) * 0.10;
  } else {
    s += ((d.zone ?? 1) / 10) * 0.12;
  }
  if (era.rules.handCheckAllowed) s += ((d.pressure ?? 5) / 10) * 0.10;
  else s += ((d.switching ?? 5) / 10) * 0.08;
  if (era.rules.illegalDefenseRestrictions) s -= ((d.helpAggression ?? 5) / 10) * 0.12;
  return clamp01(s);
};

/** A coarse system family, so three offers are never three of the same idea. */
export const systemFamily = (coach) => {
  const o = coach.offense || {}, d = coach.defense || {};
  if ((o.post ?? 0) >= 7) return "POST";
  if ((o.transition ?? 0) >= 8 || (o.tempo ?? 0) >= 8) return "PACE";
  if ((o.threeEmphasis ?? 0) >= 7) return "SPACING";
  if ((o.motion ?? 0) >= 7 || (o.ballMovement ?? 0) >= 8) return "MOVEMENT";
  if ((o.iso ?? 0) >= 7 || (o.starFreedom ?? 0) >= 8) return "STAR";
  if ((d.zone ?? 0) >= 6 || (d.pressure ?? 0) >= 8) return "DEFENSE";
  return "BALANCED";
};

const SCORERS = {
  ROSTER_MAXIMIZER: (c, mine, opp, era) => rosterMaximizerScore(c, mine),
  OPPONENT_COUNTER: (c, mine, opp, era) => opponentCounterScore(c, mine, opp),
  ERA_ADAPTER: (c, mine, opp, era) => eraAdapterScore(c, mine, era),
};

/**
 * Generate exactly three unique, strategically distinct offers.
 * Selection is deterministic from the run seed and the locked rosters.
 */
export const generateOffers = ({ roster, opponentRoster, eraId, seedId, side }) => {
  const rng = mulberry32(deriveSeed(hashString(`offers|${seedId}|${side}|${eraId}|${COACH_OFFER_VERSION}`), 0));
  const taken = new Set(), families = new Set();
  const offers = [];
  for (const role of OFFER_ROLES) {
    const ranked = COACHES
      .filter((c) => !taken.has(c.id))
      .map((c) => ({
        c,
        // A hair of seeded jitter breaks ties without changing the ordering of
        // meaningfully different candidates, so two runs with the same rosters
        // but different seeds do not always offer an identical trio.
        s: SCORERS[role](c, roster, opponentRoster, eraId) + rng() * 0.012,
        fam: systemFamily(c),
      }))
      .sort((a, b) => b.s - a.s);
    // Prefer the best candidate whose system family is not already offered; if
    // one coach dominates several categories, the next MEANINGFULLY DISTINCT
    // coach takes the role rather than three near-identical options.
    const distinct = ranked.find((r) => !families.has(r.fam));
    const chosen = distinct || ranked[0];
    if (!chosen) continue;
    taken.add(chosen.c.id); families.add(chosen.fam);
    offers.push({ role, coachId: chosen.c.id, name: chosen.c.name, family: chosen.fam });
  }
  return offers;
};

/**
 * The qualitative explanation for one offer. No numeric hidden scores are ever
 * exposed — the user sees basketball, not a rating.
 */
export const explainOffer = ({ offer, roster, opponentRoster, eraId }) => {
  const coach = COACHES.find((c) => c.id === offer.coachId);
  if (!coach) return null;
  const t = five(roster);
  const slots = POSITIONS;
  const era = getEra(eraId);
  const o = coach.offense || {}, d = coach.defense || {};
  const byAst = [...t].sort((a, b) => b.ast - a.ast);
  const byPts = [...t].sort((a, b) => b.pts - a.pts);
  const bigs = t.filter((p, i) => ["PF", "C"].includes(slots[i])).sort((a, b) => b.pts - a.pts);
  const oppSup = opponentRoster ? rosterSupply(opponentRoster) : null;
  const oppFive = opponentRoster ? five(opponentRoster) : [];

  const primary = (o.post ?? 0) >= 7 ? "post-up" : (o.pnr ?? 0) >= 7 ? "pick-and-roll"
    : (o.motion ?? 0) >= 7 ? "motion and off-ball movement" : (o.transition ?? 0) >= 8 ? "transition"
    : (o.iso ?? 0) >= 7 ? "isolation" : "balanced half-court";

  // The opponent player this structure is aimed at.
  const target = oppFive.length
    ? (oppSup?.primaryCreators ?? 0) >= 0.6
      ? [...oppFive].sort((a, b) => b.ast - a.ast)[0]
      : [...oppFive].sort((a, b) => b.pts - a.pts)[0]
    : null;

  const sacrifice = (() => {
    if ((o.tempo ?? 5) >= 8) return "Playing this fast concedes some shot quality and offensive-rebounding position.";
    if ((d.pressure ?? 5) >= 8) return "Pressuring this high leaves the back line exposed when the first line is beaten.";
    if ((o.post ?? 5) >= 7) return "Feeding the post slows the offense and invites help to load up inside.";
    if ((d.switching ?? 5) >= 8) return "Switching everything accepts mismatches rather than fighting through screens.";
    if ((o.starFreedom ?? 5) >= 8) return "Star freedom concentrates usage — the supporting four can go cold watching.";
    return "This structure is balanced, which means it wins few possessions outright.";
  })();

  const eraLine = !era ? "" : !era.rules.threePoint
    ? ((o.threeEmphasis ?? 5) >= 6
      ? "Perimeter shooting keeps its gravity, but deep shots only pay two — this system loses its main lever."
      : "With every shot worth two, this system's interior emphasis holds its value.")
    : era.environment.tpaPerGame >= 20
      ? ((o.threeEmphasis ?? 5) >= 6 ? "A high-volume perimeter environment is exactly what this system is built for."
        : "This system generates its offense inside a league that is shooting from deep.")
      : "This environment sits between the extremes, and the system translates without major friction.";

  const defLine = `${(d.man ?? 5) >= (d.zone ?? 1) ? "Man-to-man" : "Zone-based"} defense`
    + (era && !era.rules.zoneLegal ? " under the era's illegal-defense rules" : "")
    + `, ${(d.switching ?? 5) >= 7 ? "switching ball screens" : (d.drop ?? 5) >= 7 ? "dropping the big in coverage" : "playing ball screens at the level"}`
    + `, with ${(d.helpAggression ?? 5) >= 7 ? "aggressive help" : "help kept close to home"}.`;

  return {
    role: offer.role,
    roleLabel: ROLE_LABEL[offer.role],
    roleBlurb: ROLE_BLURB[offer.role],
    coachId: coach.id,
    name: coach.name,
    span: coach.span,
    family: offer.family,
    systemTags: (coach.systemTags || []).slice(0, 3),
    offense: `Runs a ${primary} offense.`,
    central: byAst[0] && byPts[0]
      ? `${byAst[0].name} initiates; ${byPts[0].name} is the primary scoring option${bigs[0] && bigs[0] !== byPts[0] ? `, with ${bigs[0].name} working inside` : ""}.`
      : "",
    targets: target ? `Aims at ${target.name}, the opponent's most important piece.` : "",
    defense: defLine,
    era: eraLine,
    sacrifice,
  };
};

/** The Legend CPU's coach choice — pregame information only, never a result. */
export const cpuCoachChoice = ({ offers, roster, opponentRoster, eraId }) => {
  let best = null, bestScore = -Infinity;
  for (const offer of offers) {
    const c = COACHES.find((x) => x.id === offer.coachId);
    if (!c) continue;
    // Legend weighs all three considerations rather than optimising its own
    // offer role. It may NOT simulate the three coaches and pick the winner.
    const score =
      rosterMaximizerScore(c, roster) * 0.40 +
      opponentCounterScore(c, roster, opponentRoster) * 0.30 +
      eraAdapterScore(c, roster, eraId) * 0.30;
    if (score > bestScore) { bestScore = score; best = offer; }
  }
  return { coachId: best?.coachId || offers[0]?.coachId, role: best?.role || offers[0]?.role, policy: "LEGEND" };
};
