// ── The possession engine ──────────────────────────────────────────────────────
// Every point in a V3 game is scored by a simulated basketball event: a
// possession produces a turnover, a shot (rim/mid/three where legal), free
// throws, and on misses a contested rebound. The final score is the SUM of
// these events — the winner is never chosen in advance. Variance lives inside
// the events (shooting nights, rebound bounces, turnovers), bounded by each
// player's own distribution, never as noise painted onto a final score.
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
  oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0,
});

// skill (0-10) → multiplier on a base rate; 5 = league average
const skillMult = (skill, spread = 0.5) => 0.75 + (skill / 10) * spread * 2;

// One team's per-game precomputation
export const prepareSide = (alloc, plan, era, oppCtx, assignments, rng) => {
  const balance = creationBalance(alloc);
  const spacing = alloc.reduce((s, a) => s + a.dna.outsideShooting, 0) / 5; // gravity survives all eras
  // spacing opens the interior more in eras that reward perimeter attention
  const spacingBonus = 1 + (spacing - 5) * (era.rules.threePoint ? 0.016 : 0.010);
  return {
    alloc, plan, balance,
    spacingBonus,
    form: alloc.map((a) => nightlyForm(rng, a.dna.consistency)),
    lines: alloc.map((a) => emptyLine(a.dna)),
    assignments, // offIdx -> {defenderIdx, quality}
    oppCtx,      // defensive context of the OTHER team
  };
};

// zone selection for a shooter under this plan/era. The era environment scales
// three-point VOLUME (a 1987 game and a 2026 game live in different shot
// economies) — value-per-shot then decides who benefits.
const chooseZone = (rng, dna, plan, era, oppCtx) => {
  const eraThreeVolume = era.rules.threePoint ? Math.max(0.25, era.environment.tpaPerGame / 20) : 0;
  let three = dna.threeTendency * (0.5 + plan.threeEmphasis * 0.09) * eraThreeVolume;
  let rim = dna.rimPressure * (0.6 + plan.transitionEmphasis * 0.04) * (oppCtx.rimWall > 6.5 ? 0.85 : 1);
  let mid = dna.midrange * (0.55 + plan.postEmphasis * 0.045) * (era.environment.tpaPerGame >= 20 ? 0.75 : 1);
  if (!era.rules.threePoint) mid += dna.outsideShooting * 0.35; // deep skill → long twos
  const i = pickWeighted(rng, [rim + 0.1, mid + 0.1, three]);
  return ["rim", "mid", "three"][i];
};

const BASE_MAKE = { rim: 0.565, mid: 0.385, three: 0.335 };
const ZONE_SKILL = { rim: "finishing", mid: "midrange", three: "outsideShooting" };
const CLAMPS = { rim: [0.28, 0.72], mid: [0.20, 0.54], three: [0.15, 0.44] };

const makeProbability = (side, offIdx, zone, era) => {
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
  return clamp(p, CLAMPS[zone][0], CLAMPS[zone][1]);
};

// Run one full game between two prepared sides. Returns per-player lines +
// team totals + possession count; all invariants hold by construction.
export const playGame = (rng, sideA, sideB, era) => {
  // possessions: era anchor pace, bent by both coaches and bounded variance
  const coachPace = (sideA.plan.paceTarget + sideB.plan.paceTarget) / 2;
  const basePace = era.environment.pace * (1 + (coachPace - 5) * 0.016);
  const possessions = Math.round(basePace * (0.97 + rng() * 0.06));

  const sides = [sideA, sideB];
  for (let p = 0; p < possessions; p++) {
    for (let s = 0; s < 2; s++) runPossession(rng, sides[s], sides[1 - s], era);
  }
  // overtime: ties are broken by real extra basketball, ~5 possessions each
  let extra = 0;
  const score = (side) => side.lines.reduce((s, l) => s + l.pts, 0);
  while (score(sideA) === score(sideB) && extra < 5) {
    for (let p = 0; p < 5; p++) {
      for (let s = 0; s < 2; s++) runPossession(rng, sides[s], sides[1 - s], era);
    }
    extra++;
  }
  const otPossessions = extra * 5;
  return sides.map((side) => {
    const t = side.lines.reduce((acc, l) => {
      for (const k of ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to"]) acc[k] += l[k];
      return acc;
    }, { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0 });
    return { lines: side.lines, totals: t, possessions: possessions + otPossessions, overtimes: extra };
  });
};

function runPossession(rng, off, def, era, isSecondChance = false) {
  // 1 — turnover
  const security = off.alloc.reduce((s, a) => s + a.dna.ballSecurity * a.share, 0);
  let pTO = (era.environment.tovPerGame / era.environment.pace)
    * off.balance.turnoverFactor
    * (1 + (off.oppCtx.pressure - 5) * 0.035)
    * (1 - (security - 5) * 0.03);
  if (isSecondChance) pTO *= 0.6;
  if (rng() < clamp(pTO, 0.06, 0.24)) {
    const who = pickWeighted(rng, off.alloc.map((a) => a.share * (11 - a.dna.ballSecurity)));
    off.lines[who].to++;
    // roughly half of turnovers are live-ball steals, credited by defensive playmaking
    if (rng() < 0.52) {
      const thief = pickWeighted(rng, def.alloc.map((a) => a.dna.defPlaymaking + 1));
      def.lines[thief].stl++;
    }
    return;
  }

  // 2 — shooter & zone (finite usage: shares decide who eats)
  const shooter = pickWeighted(rng, off.alloc.map((a, i) => a.share * (isSecondChance && !["PF", "C"].includes(a.dna.pos) ? 0.5 : 1)));
  const zone = isSecondChance && rng() < 0.55 ? "rim" : chooseZone(rng, off.alloc[shooter].dna, off.plan, era, off.oppCtx);

  // 3 — shooting foul? (rim pressure draws contact; era FT environment)
  const ftEnv = era.environment.ftaPerGame / 26;
  const pFoul = clamp((zone === "rim" ? 0.16 : 0.045) * ftEnv * (0.7 + off.alloc[shooter].dna.ftPressure * 0.05), 0.01, 0.30);
  if (rng() < pFoul) {
    const line = off.lines[shooter];
    const pFT = clamp(0.52 + off.alloc[shooter].dna.ftSkill * 0.032, 0.45, 0.92);
    for (let i = 0; i < 2; i++) { line.fta++; if (rng() < pFT) { line.ftm++; line.pts++; } }
    return; // (missed final FT rebounds simplified away at this fidelity)
  }

  // 4 — the shot. Rim protection can erase it outright: a block IS a miss.
  const line = off.lines[shooter];
  line.fga++;
  if (zone === "three") line.tpa++;
  let blocked = false;
  if (zone !== "three" && rng() < clamp(off.oppCtx.rimWall * (zone === "rim" ? 0.016 : 0.004), 0, 0.18)) {
    blocked = true;
    const blocker = pickWeighted(rng, def.alloc.map((a) => Math.pow(a.dna.rimProtection, 2) + 0.5));
    def.lines[blocker].blk++;
  }
  const made = !blocked && rng() < makeProbability(off, shooter, zone, era);

  if (made) {
    line.fgm++;
    const pts = zone === "three" ? 3 : 2;
    line.pts += pts;
    if (zone === "three") line.tpm++;
    // assist: created-for shots get credited to a passer
    const assistedP = clamp(0.50 + (off.plan.ballMovement - 5) * 0.03 + (off.plan.motion - 5) * 0.02 + (zone === "three" ? 0.18 : zone === "rim" ? 0.05 : 0), 0.25, 0.78);
    if (rng() < assistedP) {
      const passers = off.alloc.map((a, i) => (i === shooter ? 0 : a.dna.passing * a.share + 0.2));
      off.lines[pickWeighted(rng, passers)].ast++;
    }
    return;
  }

  // 5 — rebound battle
  const crash = off.plan.crashGlass;
  const pOreb = clamp(era.environment.orebPct * (1 + (crash - 5) * 0.03) * (1 - (off.oppCtx.boxOut - 5) * 0.035), 0.12, 0.42);
  if (rng() < pOreb) {
    const who = pickWeighted(rng, off.alloc.map((a) => Math.pow(a.dna.offReb + 0.5, 1.7)));
    off.lines[who].oreb++;
    if (!isSecondChance) runPossession(rng, off, def, era, true); // one putback chain
  } else {
    const who = pickWeighted(rng, def.alloc.map((a) => Math.pow(a.dna.defReb + 0.5, 1.6)));
    def.lines[who].dreb++;
  }
}
