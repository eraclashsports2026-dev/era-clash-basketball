// ── The possession engine ──────────────────────────────────────────────────────
// Every point in a V3 game is scored by a simulated basketball event: a
// possession produces a turnover, a shot (rim/mid/three where legal), free
// throws, and on misses a contested rebound. The final score is the SUM of
// these events — the winner is never chosen in advance. Variance lives inside
// the events (shooting nights, rebound bounces, turnovers), bounded by each
// player's own distribution, never as noise painted onto a final score.
//
// Addendum mechanics (each one is a basketball TRADEOFF, never free value):
// · GAME STATE: late-game score context changes shot selection, urgency,
//   glass-crashing and intentional fouling — automatically, never user-tuned.
// · FATIGUE: fast pace and pressure defense buy early value and cost late-game
//   efficiency, scaled by each player's usage load. Bounded (≤6%) so fatigue
//   can never overpower a real talent gap. No bench exists, so no rotations.
// · CRASH vs GET BACK: crashing the offensive glass buys second chances and
//   concedes transition; get-back teams trade boards for a set defense.
// · SHOT QUALITY vs SHOT MAKING: xPts accumulates the expected value of every
//   attempt so postgame can honestly separate good process from a hot night.
// · FOULS: shooting fouls are attributed to real defenders (PF in the box
//   score). Foul-outs are NOT modeled — five players and no bench makes
//   disqualification structurally unsolvable for now; documented limitation.
// · OVERTIME: ties play real extra basketball until a winner exists. There is
//   no cap and no tie-breaking roll.
import { nightlyForm } from "./seed.js";
import { creationBalance } from "./roles.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pickWeighted = (rng, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
};

const emptyLine = (dna) => ({
  id: dna.id, name: dna.name, pos: dna.pos,
  pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
});

// skill (0-10) → multiplier on a base rate; 5 = league average
const skillMult = (skill, spread = 0.5) => 0.75 + (skill / 10) * spread * 2;

// One team's per-game precomputation
export const prepareSide = (alloc, plan, era, oppCtx, assignments, rng, meta = {}) => {
  const balance = creationBalance(alloc);
  const spacing = alloc.reduce((s, a) => s + a.dna.outsideShooting, 0) / 5; // gravity survives all eras
  // spacing opens the interior more in eras that reward perimeter attention
  const spacingBonus = 1 + (spacing - 5) * (era.rules.threePoint ? 0.016 : 0.010);
  // fatigue pressure this side GENERATES on itself: playing fast and pressing
  // full court costs energy. Bounded; scaled per player by usage load below.
  const fatigueRate = clamp((plan.paceTarget - 5) * 0.010 + (plan.scheme.pressure - 5) * 0.007, 0, 0.10);
  return {
    alloc, plan, balance,
    spacingBonus,
    fatigueRate,
    form: alloc.map((a) => nightlyForm(rng, a.dna.consistency)),
    lines: alloc.map((a) => emptyLine(a.dna)),
    assignments, // offIdx -> {defenderIdx, quality}
    oppCtx,      // defensive context of the OTHER team (mutable: coach adjustments)
    coachName: meta.coachName || null,
    adjustments: [],      // in-game coaching adjustments actually made (for postgame)
    transitionNext: false, // set when this side secures a board against a crashing offense
    xPts: 0,               // expected points generated (shot quality ledger)
  };
};

// ── game state: what the scoreboard and clock do to decision-making ───────────
// t = fraction of regulation elapsed; diff = this offense's score minus opponent's.
const gameState = (t, diff) => {
  if (t < 0.82) return "normal";
  if (diff <= -10) return "trailBig";
  if (diff < 0) return "trailClose";
  if (diff >= 5) return "protectLead";
  return "closeLate";
};

// zone selection for a shooter under this plan/era/game-state. The era
// environment scales three-point VOLUME (a 1987 game and a 2026 game live in
// different shot economies) — value-per-shot then decides who benefits.
const chooseZone = (rng, dna, plan, era, oppCtx, state, transition) => {
  const eraThreeVolume = era.rules.threePoint ? Math.max(0.25, era.environment.tpaPerGame / 20) : 0;
  // roster tendency drives WHO shoots threes; the floor keeps an average
  // NBA shooter near his era's actual three volume (backtest-calibrated vs
  // 1996 Bulls / 1986 Celtics) — but ONLY for players with real shooting
  // skill: nobody designs threes for a non-shooter (no invented abilities)
  const volumeFloor = dna.outsideShooting >= 4.5 ? 1.5 : dna.outsideShooting * 0.25;
  let three = (dna.threeTendency + volumeFloor) * (0.42 + plan.threeEmphasis * 0.075) * eraThreeVolume;
  let rim = dna.rimPressure * (0.6 + plan.transitionEmphasis * 0.04) * (oppCtx.rimWall > 6.5 ? 0.85 : 1);
  let mid = dna.midrange * (0.55 + plan.postEmphasis * 0.045) * (era.environment.tpaPerGame >= 20 ? 0.75 : 1);
  if (!era.rules.threePoint) mid += dna.outsideShooting * 0.35; // deep skill → long twos
  if (transition) { rim *= 1.7; mid *= 0.7; } // fast breaks live at the rim
  // late-game urgency: trailing teams hunt threes where they exist; leading
  // teams take the safest available shot and stop settling for hero threes
  if (state === "trailBig") { three *= era.rules.threePoint ? 2.1 : 1; mid *= 0.75; }
  else if (state === "trailClose") { three *= era.rules.threePoint ? 1.35 : 1; }
  else if (state === "protectLead") { three *= 0.75; rim *= 1.15; }
  const i = pickWeighted(rng, [rim + 0.1, mid + 0.1, three]);
  return ["rim", "mid", "three"][i];
};

const BASE_MAKE = { rim: 0.565, mid: 0.385, three: 0.335 };
const ZONE_SKILL = { rim: "finishing", mid: "midrange", three: "outsideShooting" };
const CLAMPS = { rim: [0.28, 0.72], mid: [0.20, 0.54], three: [0.15, 0.44] };

const makeProbability = (side, offIdx, zone, era, fatigue, transition) => {
  const a = side.alloc[offIdx];
  const dna = a.dna;
  let p = BASE_MAKE[zone] * skillMult(dna[ZONE_SKILL[zone]], 0.36);
  // era conversion environment: shared game conditions (physicality, rules,
  // equipment) press on BOTH teams equally; player skill still separates them
  p *= 0.75 + 0.25 * (era.environment.fgPct / 0.472);
  // tonight's form + role economics (compression/strain)
  p *= side.form[offIdx] * a.effMult * side.balance.shotQuality;
  // team context: spacing opens rim/mid; ball movement & motion buy better looks
  if (zone !== "three") p *= side.spacingBonus;
  p *= 1 + (side.plan.ballMovement - 5) * 0.008 + (side.plan.motion - 5) * 0.006;
  // defense: the assigned matchup contests perimeter looks; the rim wall guards inside
  const matchup = side.assignments[offIdx];
  if (zone === "rim") p *= 1 - (side.oppCtx.rimWall - 5) * 0.034 - (side.oppCtx.help - 5) * 0.014;
  else p *= 1 - (matchup.quality - 5) * 0.022;
  // era contact environment: hand-check eras suppress perimeter efficiency
  if (era.rules.handCheckAllowed && zone !== "rim") p *= 0.965;
  // transition looks come before the defense is set
  if (transition) p *= 1.10;
  // legs: late-game fatigue shaves efficiency (bounded, load-scaled)
  p *= 1 - fatigue;
  return clamp(p, CLAMPS[zone][0], CLAMPS[zone][1]);
};

// per-player fatigue at time t: side rate × personal usage load, ramping in
// after 70% of the game. Hard cap 6% — fatigue is a tradeoff, not a cliff.
const fatigueAt = (side, idx, t) => {
  if (t < 0.7) return 0;
  const load = 0.5 + side.alloc[idx].share * 2.2;
  return Math.min(0.06, side.fatigueRate * ((t - 0.7) / 0.3) * load);
};

// ── in-game coaching adjustments ───────────────────────────────────────────────
// Evaluated at halftime and end of Q3 from REALIZED stats — the coach reads the
// actual game, not the matchup sheet. Magnitude scales with adaptability and is
// bounded; a coach can only lean on tendencies their own profile demonstrates
// (no zone in illegal-defense eras, no help spike from a no-help profile).
const adjustCoach = (side, opp, era, label, t = 0.5) => {
  const adapt = side.plan.adapt ?? 0.5;
  const mag = 0.4 + adapt * 0.8; // 0.4 (rigid) → 1.2 (highly adaptable)
  side.adjusted ||= new Set(); // each adjustment type happens once per game
  const myDef = opp.oppCtx;      // MY defensive context is what my opponent faces
  const oppTot = opp.lines.reduce((a, l) => ({ pts: a.pts + l.pts, fga: a.fga + l.fga, fgm: a.fgm + l.fgm, tpm: a.tpm + l.tpm, oreb: a.oreb + l.oreb }), { pts: 0, fga: 0, fgm: 0, tpm: 0, oreb: 0 });
  const myTot = side.lines.reduce((a, l) => ({ to: a.to + l.to, oreb: a.oreb + l.oreb }), { to: 0, oreb: 0 });
  const made = [];
  // opponent converting too easily inside → raise the help (if this coach's
  // profile has help in it and the era's rules let help roam)
  if (!side.adjusted.has("help") && oppTot.fga > 12 && oppTot.fgm / oppTot.fga > 0.585 && myDef.help < 8 && side.plan.scheme.helpAggression >= 4) {
    side.adjusted.add("help");
    myDef.help = clamp(myDef.help + 0.45 * mag * (era.rules.illegalDefenseRestrictions ? 0.7 : 1), 0, 9);
    made.push(`${label} raised the help defense after the break`);
  }
  // getting hammered on the offensive glass → sell out on the box-out at the
  // cost of transition (crash the other way less)
  if (!side.adjusted.has("glass") && oppTot.oreb - myTot.oreb >= 4 * (t / 0.5) && myDef.boxOut < 8.5) {
    side.adjusted.add("glass");
    myDef.boxOut = clamp(myDef.boxOut + 0.5 * mag, 0, 9);
    side.plan.crashGlass = clamp(side.plan.crashGlass - 0.5 * mag, 2, 10);
    made.push(`${label} pulled shooters back to end the second-chance bleeding`);
  }
  // opponent raining threes → tighten perimeter contests, conceding a bit of rim wall
  if (!side.adjusted.has("perimeter") && oppTot.tpm >= 8 * (t / 0.5) && era.rules.threePoint) {
    side.adjusted.add("perimeter");
    for (const a of opp.assignments) a.quality = clamp(a.quality + 0.35 * mag, 0, 10);
    myDef.rimWall = clamp(myDef.rimWall - 0.2 * mag, 0, 9);
    made.push(`${label} switched coverages to chase shooters off the arc`);
  }
  // own turnovers piling up against pressure → cool the tempo, tighten the handle
  // a RATE problem, not game-length accumulation: 35%+ worse than the era's
  // expected turnover pace at this point of the game
  if (!side.adjusted.has("tempo") && myTot.to >= Math.max(8, era.environment.tovPerGame * t * 1.35)) {
    side.adjusted.add("tempo");
    side.plan.paceTarget = clamp(side.plan.paceTarget - 0.6 * mag, 1, 10);
    side.balance.turnoverFactor = clamp(side.balance.turnoverFactor * (1 - 0.05 * mag), 0.8, 1.2);
    made.push(`${label} slowed the game down to stop the turnover spiral`);
  }
  if (made.length) side.adjustments.push(...made);
};

// Run one full game between two prepared sides. Returns per-player lines +
// team totals + possession count; all invariants hold by construction.
export const playGame = (rng, sideA, sideB, era) => {
  // possessions: era anchor pace, bent by both coaches and bounded variance
  const coachPace = (sideA.plan.paceTarget + sideB.plan.paceTarget) / 2;
  const basePace = era.environment.pace * (1 + (coachPace - 5) * 0.016);
  const possessions = Math.round(basePace * (0.97 + rng() * 0.06));

  const sides = [sideA, sideB];
  const score = (side) => side.lines.reduce((s, l) => s + l.pts, 0);
  const half = Math.floor(possessions / 2), q3 = Math.floor(possessions * 0.75);
  for (let p = 0; p < possessions; p++) {
    if (p === half || p === q3) {
      const prog = p / possessions;
      adjustCoach(sideA, sideB, era, sideA.coachName || "Gold's coach", prog);
      adjustCoach(sideB, sideA, era, sideB.coachName || "Blue's coach", prog);
    }
    const t = p / possessions;
    for (let s = 0; s < 2; s++) {
      const off = sides[s], def = sides[1 - s];
      const diff = score(off) - score(def);
      const state = gameState(t, diff);
      // desperation defense: down 1-9 in the final stretch, foul the worst
      // free-throw shooter on purpose — it only pays if that shooter misses
      if (state === "protectLead" && t > 0.94 && diff <= 9 && rng() < 0.55) {
        intentionalFoul(rng, off, def);
        continue;
      }
      runPossession(rng, off, def, era, t, state);
    }
  }
  // overtime: ties are broken by real extra basketball, round after round,
  // until a winner exists. No cap, no tie-breaking roll.
  let extra = 0;
  while (score(sideA) === score(sideB)) {
    for (let p = 0; p < 5; p++) {
      for (let s = 0; s < 2; s++) runPossession(rng, sides[s], sides[1 - s], era, 1, "closeLate");
    }
    extra++;
  }
  const otPossessions = extra * 5;
  return sides.map((side) => {
    const t = side.lines.reduce((acc, l) => {
      for (const k of ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to", "pf"]) acc[k] += l[k];
      return acc;
    }, { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });
    return {
      lines: side.lines, totals: t,
      possessions: possessions + otPossessions, overtimes: extra,
      xPts: Math.round(side.xPts * 10) / 10,
      adjustments: side.adjustments,
    };
  });
};

// free throws for one player; returns nothing (ledger updated in place)
const shootFreeThrows = (rng, side, idx, n) => {
  const line = side.lines[idx];
  const pFT = clamp(0.52 + side.alloc[idx].dna.ftSkill * 0.032, 0.45, 0.92);
  side.xPts += n * pFT;
  for (let i = 0; i < n; i++) { line.fta++; if (rng() < pFT) { line.ftm++; line.pts++; } }
};

// hack-a: the trailing defense fouls the offense's worst free-throw shooter
const intentionalFoul = (rng, off, def) => {
  const victim = off.alloc.reduce((worst, a, i) => (a.dna.ftSkill < off.alloc[worst].dna.ftSkill ? i : worst), 0);
  const fouler = pickWeighted(rng, def.alloc.map(() => 1));
  def.lines[fouler].pf++;
  shootFreeThrows(rng, off, victim, 2);
};

function runPossession(rng, off, def, era, t = 0.5, state = "normal", isSecondChance = false) {
  // transition possession? (earned when this side secured a board against a
  // crashing offense on the previous possession)
  const transition = !isSecondChance && off.transitionNext;
  off.transitionNext = false;

  // 1 — turnover
  const security = off.alloc.reduce((s, a) => s + a.dna.ballSecurity * a.share, 0);
  let pTO = (era.environment.tovPerGame / era.environment.pace)
    * off.balance.turnoverFactor
    * (1 + (off.oppCtx.pressure - 5) * 0.035)
    * (1 - (security - 5) * 0.03);
  if (isSecondChance) pTO *= 0.6;
  if (transition) pTO *= 0.85;                 // numbers going the other way
  if (state === "trailBig") pTO *= 1.12;       // urgency costs ball security
  if (state === "protectLead") pTO *= 0.92;    // milking the clock, safe passes
  // tired hands late: fatigue nudges turnovers up (bounded like everything else)
  const avgFatigue = (fatigueAt(off, 0, t) + fatigueAt(off, 1, t) + fatigueAt(off, 2, t) + fatigueAt(off, 3, t) + fatigueAt(off, 4, t)) / 5;
  pTO *= 1 + avgFatigue * 2;
  if (rng() < clamp(pTO, 0.06, 0.24)) {
    const who = pickWeighted(rng, off.alloc.map((a) => a.share * (11 - a.dna.ballSecurity)));
    off.lines[who].to++;
    // roughly half of turnovers are live-ball steals, credited by defensive playmaking
    if (rng() < 0.52) {
      const thief = pickWeighted(rng, def.alloc.map((a) => a.dna.defPlaymaking + 1));
      def.lines[thief].stl++;
      // a live-ball steal is the cleanest transition trigger there is
      if (rng() < 0.5) def.transitionNext = true;
    }
    return;
  }

  // 2 — shooter & zone (finite usage: shares decide who eats; late and close,
  // the ball finds the creators)
  const creatorBias = state === "trailClose" || state === "closeLate" ? 1 : 0;
  const shooter = pickWeighted(rng, off.alloc.map((a, i) => {
    let w = a.share * (isSecondChance && !["PF", "C"].includes(a.dna.pos) ? 0.5 : 1);
    if (creatorBias) w *= 1 + Math.max(0, a.dna.creation - 5) * 0.12;
    return w;
  }));
  const zone = isSecondChance && rng() < 0.55 ? "rim" : chooseZone(rng, off.alloc[shooter].dna, off.plan, era, off.oppCtx, state, transition);

  // 3 — shooting foul? (rim pressure draws contact; era FT environment).
  // The foul is charged to a real defender: the assigned matchup on the
  // perimeter, the contesting bigs at the rim. Foul-outs are NOT modeled
  // (five players, no bench) — documented V3 limitation.
  const ftEnv = era.environment.ftaPerGame / 26;
  const pFoul = clamp((zone === "rim" ? 0.16 : 0.045) * ftEnv * (0.7 + off.alloc[shooter].dna.ftPressure * 0.05) * (1 + (off.oppCtx.pressure - 5) * 0.02), 0.01, 0.30);
  if (rng() < pFoul) {
    const fouler = zone === "rim"
      ? pickWeighted(rng, def.alloc.map((a) => a.dna.rimProtection + a.dna.interiorDef + 1))
      : off.assignments[shooter].defenderIdx;
    def.lines[fouler].pf++;
    shootFreeThrows(rng, off, shooter, zone === "three" ? 3 : 2);
    return; // (missed final FT rebounds simplified away at this fidelity)
  }

  // 4 — the shot. Rim protection can erase it outright: a block IS a miss.
  const line = off.lines[shooter];
  line.fga++;
  if (zone === "three") line.tpa++;
  let blocked = false;
  if (zone !== "three" && rng() < clamp(off.oppCtx.rimWall * (zone === "rim" ? 0.016 : 0.004) * (transition ? 0.6 : 1), 0, 0.18)) {
    blocked = true;
    const blocker = pickWeighted(rng, def.alloc.map((a) => Math.pow(a.dna.rimProtection, 2) + 0.5));
    def.lines[blocker].blk++;
  }
  const fatigue = fatigueAt(off, shooter, t);
  const pMake = makeProbability(off, shooter, zone, era, fatigue, transition);
  const value = zone === "three" ? 3 : 2;
  off.xPts += pMake * value; // shot QUALITY ledger — before the make roll
  const made = !blocked && rng() < pMake;

  if (made) {
    line.fgm++;
    line.pts += value;
    if (zone === "three") line.tpm++;
    // assist: created-for shots get credited to a passer
    const assistedP = clamp(0.50 + (off.plan.ballMovement - 5) * 0.03 + (off.plan.motion - 5) * 0.02 + (zone === "three" ? 0.18 : zone === "rim" ? 0.05 : 0) + (transition ? 0.08 : 0), 0.25, 0.78);
    if (rng() < assistedP) {
      const passers = off.alloc.map((a, i) => (i === shooter ? 0 : a.dna.passing * a.share + 0.2));
      off.lines[pickWeighted(rng, passers)].ast++;
    }
    return;
  }

  // 5 — rebound battle. Crashing buys second chances AND concedes transition:
  // a defensive board against a crashing offense starts the break.
  const crash = off.plan.crashGlass * (state === "protectLead" ? 0.8 : state === "trailBig" ? 1.15 : 1);
  const pOreb = clamp(era.environment.orebPct * (1 + (crash - 5) * 0.03) * (1 - (off.oppCtx.boxOut - 5) * 0.035), 0.12, 0.42);
  if (rng() < pOreb) {
    const who = pickWeighted(rng, off.alloc.map((a) => Math.pow(a.dna.offReb + 0.5, 1.7)));
    off.lines[who].oreb++;
    if (!isSecondChance) runPossession(rng, off, def, era, t, state, true); // one putback chain
  } else {
    const who = pickWeighted(rng, def.alloc.map((a) => Math.pow(a.dna.defReb + 0.5, 1.6)));
    def.lines[who].dreb++;
    const pTrans = clamp(0.08 + (off.plan.crashGlass - 5) * 0.05 + (def.plan.transitionEmphasis - 5) * 0.025, 0.03, 0.45);
    if (rng() < pTrans) def.transitionNext = true;
  }
}
