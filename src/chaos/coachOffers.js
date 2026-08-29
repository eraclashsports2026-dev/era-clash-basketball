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

/**
 * The coach's OFFENSIVE IDENTITY: whichever dimension stands furthest above
 * that coach's own average. An earlier version walked a fixed priority cascade
 * (post >= 7, then transition >= 8, ...) and labelled three genuinely different
 * staffs "pick-and-roll offense" because each happened to clear the same early
 * threshold. Reading the argmax instead makes the label describe the coach.
 */
const OFFENSE_AXES = [
  { key: "POST", dim: "post", label: "post-up", verb: "works through the post" },
  { key: "PACE", dim: "transition", label: "transition", verb: "runs at every opportunity" },
  { key: "SPACING", dim: "threeEmphasis", label: "perimeter-spacing", verb: "plays through the arc" },
  { key: "MOVEMENT", dim: "motion", label: "motion", verb: "keeps the ball and bodies moving" },
  { key: "PNR", dim: "pnr", label: "pick-and-roll", verb: "lives in ball screens" },
  { key: "STAR", dim: "iso", label: "isolation", verb: "clears out for its best scorer" },
];

export const offenseIdentity = (coach) => {
  const o = coach.offense || {};
  const vals = OFFENSE_AXES.map((a) => o[a.dim] ?? 5);
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  let best = OFFENSE_AXES[0], bestLift = -Infinity;
  OFFENSE_AXES.forEach((a, i) => {
    // Lift above the coach's own mean, tie-broken by raw level.
    const lift = (vals[i] - mean) * 10 + vals[i];
    if (lift > bestLift) { bestLift = lift; best = a; }
  });
  return best;
};

/** Family = the offensive identity, so diversity is enforced on what is READ. */
export const systemFamily = (coach) => offenseIdentity(coach).key;

/** The defensive identity, so two offers never describe the same shell. */
export const defenseIdentity = (coach) => {
  const d = coach.defense || {};
  if ((d.zone ?? 1) >= 6) return { key: "ZONE", label: "zone principles" };
  if ((d.switching ?? 5) >= 7) return { key: "SWITCH", label: "switching ball screens" };
  if ((d.pressure ?? 5) >= 8) return { key: "PRESSURE", label: "pressuring the ball full court" };
  if ((d.drop ?? 5) >= 7) return { key: "DROP", label: "dropping the big in coverage" };
  if ((d.helpAggression ?? 5) >= 7) return { key: "HELP", label: "loading up help early" };
  return { key: "CONTAIN", label: "containing without gambling" };
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
  const taken = new Set(), families = new Set(), shells = new Set();
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
        shell: defenseIdentity(c).key,
      }))
      .sort((a, b) => b.s - a.s);
    // Distinctness is enforced on what the user actually READS: a different
    // offensive identity first, and failing that a different defensive shell.
    // Without this, one coach who scores well in several categories yields
    // three offers that describe the same game in the same words.
    const chosen = ranked.find((r) => !families.has(r.fam) && !shells.has(r.shell))
      || ranked.find((r) => !families.has(r.fam))
      || ranked.find((r) => !shells.has(r.shell))
      || ranked[0];
    if (!chosen) continue;
    taken.add(chosen.c.id); families.add(chosen.fam); shells.add(chosen.shell);
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
  const ident = offenseIdentity(coach);
  const def = defenseIdentity(coach);
  const oppSup = opponentRoster ? rosterSupply(opponentRoster) : null;
  const oppFive = opponentRoster ? five(opponentRoster) : [];

  const bigs = t.filter((p, i) => ["PF", "C"].includes(slots[i]));
  const guards = t.filter((p, i) => ["PG", "SG"].includes(slots[i]));
  const wings = t.filter((p, i) => ["SG", "SF"].includes(slots[i]));
  const top = (arr, k) => [...arr].sort((a, b) => b[k] - a[k])[0] || null;
  const passer = top(t, "ast"), scorer = top(t, "pts");

  // WHO becomes central depends on the SYSTEM, not just on who is best. Three
  // coaches handed the same five should elevate different players, which is
  // the entire reason the choice is interesting.
  const central = (() => {
    switch (ident.key) {
      case "POST": {
        const hub = top(bigs, "pts") || scorer;
        return hub ? `${hub.name} works from the block; the other four space and cut off him.` : "";
      }
      case "PACE": {
        const push = top(t, "stl") || passer;
        const finish = top(wings, "pts") || scorer;
        return push && finish ? `${push.name} pushes off every miss, with ${finish.name} running the lane.` : "";
      }
      case "SPACING": {
        const eng = passer, shooters = wings.filter((p) => p !== eng).slice(0, 2);
        if (!eng) return "";
        // Agreement: one shooter "spaces", two "space".
        const who = shooters.map((p) => p.name).join(" and ");
        const verb = shooters.length === 1 ? "spaces" : "space";
        return who
          ? `${eng.name} creates the advantage; ${who} ${verb} the floor behind it.`
          : `${eng.name} creates the advantage and the rest of the five spaces the floor behind it.`;
      }
      case "MOVEMENT": {
        const hub = top(t, "ast");
        return hub ? `Nobody stands still — ${hub.name} is the connector rather than the ball-stopper.` : "";
      }
      case "PNR": {
        const handler = passer, roller = top(bigs, "reb");
        return handler && roller ? `${handler.name} handles, ${roller.name} rolls; everything starts from that two-man game.` : "";
      }
      default: {
        return scorer ? `${scorer.name} gets the ball and the other four get out of the way.` : "";
      }
    }
  })();

  // WHAT the offer is FOR differs by role: the maximizer sells the fit, the
  // counter names the opponent problem, the adapter names the era lever.
  const pitch = (() => {
    if (offer.role === "OPPONENT_COUNTER") {
      if (!oppFive.length) return "";
      const oppCreator = [...oppFive].sort((a, b) => b.ast - a.ast)[0];
      const oppScorer = [...oppFive].sort((a, b) => b.pts - a.pts)[0];
      const weakGlass = (oppSup?.defenders ?? 1) < 0.45;
      if (weakGlass) return `Attacks the other side's softest point: they do not defend well enough to survive ${(top(t, "pts") || {}).name || "this attack"} getting downhill.`;
      // When one player is both their creator and their scorer, name them once.
      if (oppCreator && oppScorer && oppCreator.name === oppScorer.name) {
        return `Built around one job: make ${oppCreator.name} give the ball up, and live with whoever is left.`;
      }
      return `Built to take ${oppCreator?.name || "their creator"} out of it and make ${oppScorer?.name || "their scorer"} finish over a set defense.`;
    }
    if (offer.role === "ERA_ADAPTER") {
      if (!era) return "";
      return !era.rules.threePoint
        ? "Every shot pays two here, and this staff already builds its offense inside the arc."
        : era.environment.tpaPerGame >= 20
          ? "This staff wants the volume and spacing this environment rewards."
          : "This staff's structure travels into this rule set without needing to be rebuilt.";
    }
    const supply = rosterSupply(roster);
    const strongest = supply ? Object.entries(supply).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
    const HUMAN = {
      traditionalCenters: "a genuine interior anchor", passingBigs: "a big who can pass",
      shootingBigs: "a big who can score facing up", primaryCreators: "a lead creator",
      multipleCreators: "more than one player who can make a play", switchableWings: "switchable wings",
      shooters: "perimeter scoring", defenders: "real defenders", transitionAthletes: "players who run",
    };
    return `This roster's best asset is ${HUMAN[strongest] || "its balance"}, and this staff is built to use it.`;
  })();

  const sacrifice = (() => {
    switch (ident.key) {
      case "PACE": return "Playing this fast concedes shot quality and offensive-rebounding position.";
      case "POST": return "Feeding the post slows the game and invites help to load up inside.";
      case "SPACING": return "If the shots do not fall, there is no second way to score.";
      case "MOVEMENT": return "Constant movement asks a lot of the legs and can get sloppy late.";
      case "STAR": return "Concentrating usage leaves the supporting four watching.";
      default: return "Ball-screen heavy offense lets a disciplined defense load to one side.";
    }
  })();

  const defLine = `${(d.man ?? 5) >= (d.zone ?? 1) ? "Man-to-man" : "Zone-based"} defense`
    + (era && !era.rules.zoneLegal ? " under the era's illegal-defense rules" : "")
    + `, ${def.label}.`;

  const eraLine = !era ? "" : !era.rules.threePoint
    ? ((o.threeEmphasis ?? 5) >= 6
      ? "Perimeter shooting keeps its gravity, but deep shots only pay two — this system loses its main lever."
      : "With every shot worth two, this system's interior emphasis holds its value.")
    : era.environment.tpaPerGame >= 20
      ? ((o.threeEmphasis ?? 5) >= 6 ? "A high-volume perimeter environment is exactly what this system is built for."
        : "This system generates its offense inside a league that is shooting from deep.")
      : "This environment sits between the extremes, and the system translates without major friction.";

  return {
    role: offer.role,
    roleLabel: ROLE_LABEL[offer.role],
    roleBlurb: ROLE_BLURB[offer.role],
    coachId: coach.id,
    name: coach.name,
    span: coach.span,
    family: ident.key,
    systemTags: (coach.systemTags || []).slice(0, 3),
    offense: `Runs a ${ident.label} offense — ${ident.verb}.`,
    central,
    targets: pitch,
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
