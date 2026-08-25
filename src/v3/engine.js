// ── V3 game orchestrator ───────────────────────────────────────────────────────
// PLAYER DNA → TEAM CONSTRUCTION → COACH SYSTEM → ERA ENVIRONMENT → DEFENSIVE
// MATCHUPS → POSSESSION SIMULATION → REALIZED BOX SCORE → WINNER.
// The winner is read off the scoreboard after the basketball happens.
import { mulberry32, deriveSeed } from "./seed.js";
import { teamDNA } from "./playerProfile.js";
import { allocateUsage, roleLabel } from "./roles.js";
import { assignDefense, defenseContext } from "./defense.js";
import { buildGamePlan } from "./gameplan.js";
import { prepareSide, playGame } from "./possession.js";
import { getCoach, NEUTRAL_COACH } from "./coaches.js";
import { getEra, DEFAULT_ERA_ID } from "./eraStyles.js";
import { versionOf } from "../versions.js";

// DERIVED from the canonical registry (src/versions.js) rather than declared
// here. Two independently-declared version lists is exactly how "V3" came to
// mean both the live engine and the unbuilt possession engine at the same time.
// The model-shape fields below are local to this engine and have no registry
// domain, so they stay here.
export const V3_VERSIONS = {
  engine: versionOf("engineVersion"),
  possessionModel: "2",       // game state + fatigue + transition tradeoff + PF + xPts
  gameStateModel: "1",
  fatigueModel: "1",
  playerData: versionOf("playerDataVersion"),
  coachData: versionOf("coachDataVersion"),
  eraData: versionOf("eraDataVersion"),
  calibration: versionOf("calibrationVersion"),
};

// A stored result carries this complete fingerprint so EraClash Labs can
// reproduce the exact game later (see benchmarks/v3/replay.mjs). Old results
// are never recomputed with newer engine versions.
export const fingerprint = (seed) => ({ seed, ...V3_VERSIONS });

// Simulate ONE game. All inputs are canonical server-side objects; seed is the
// server-generated game seed (deterministic replay guaranteed).
export const simulateGameV3 = (goldTeam, blueTeam, coachGold, coachBlue, era, seed) => {
  const rng = mulberry32(seed);
  const gDna = teamDNA(goldTeam);
  const bDna = teamDNA(blueTeam);

  const gPlan = buildGamePlan(coachGold, gDna, era, bDna);
  const bPlan = buildGamePlan(coachBlue, bDna, era, gDna);

  const gAlloc = allocateUsage(gDna, { concentration: gPlan.concentration });
  const bAlloc = allocateUsage(bDna, { concentration: bPlan.concentration });

  const gAssign = assignDefense(gAlloc, bDna, bPlan.scheme); // Blue defenders vs Gold threats
  const bAssign = assignDefense(bAlloc, gDna, gPlan.scheme); // Gold defenders vs Blue threats

  const gCtx = defenseContext(gDna, gPlan.scheme, era); // Gold's defense (faced by Blue)
  const bCtx = defenseContext(bDna, bPlan.scheme, era); // Blue's defense (faced by Gold)

  const gSide = prepareSide(gAlloc, gPlan, era, bCtx, gAssign, rng, { coachName: coachGold.name });
  const bSide = prepareSide(bAlloc, bPlan, era, gCtx, bAssign, rng, { coachName: coachBlue.name });

  const [gRes, bRes] = playGame(rng, gSide, bSide, era);
  const winner = gRes.totals.pts > bRes.totals.pts ? "Gold" : "Blue";

  return {
    engine: "v3-possession",
    versions: { ...V3_VERSIONS },
    fingerprint: fingerprint(seed),
    seed,
    eraId: era.id,
    coachIds: { gold: coachGold.id, blue: coachBlue.id },
    winner,
    finalScore: { gold: gRes.totals.pts, blue: bRes.totals.pts },
    seriesResult: winner === "Gold"
      ? `${gRes.totals.pts}-${bRes.totals.pts}`
      : `${bRes.totals.pts}-${gRes.totals.pts}`,
    possessions: gRes.possessions,
    overtimes: gRes.overtimes,
    gold: { lines: gRes.lines, totals: gRes.totals, xPts: gRes.xPts, adjustments: gRes.adjustments, usage: gAlloc.map((a) => ({ id: a.dna.id, share: a.share, natural: a.natural, role: roleLabel(a) })), plan: publicPlan(gPlan) },
    blue: { lines: bRes.lines, totals: bRes.totals, xPts: bRes.xPts, adjustments: bRes.adjustments, usage: bAlloc.map((a) => ({ id: a.dna.id, share: a.share, natural: a.natural, role: roleLabel(a) })), plan: publicPlan(bPlan) },
    assignments: {
      // who guarded whom, by name — referenced in Postgame
      onGold: gAlloc.map((a, i) => ({ scorer: a.dna.name, defender: bDna[gAssign[i].defenderIdx].name, quality: Math.round(gAssign[i].quality * 10) / 10 })),
      onBlue: bAlloc.map((a, i) => ({ scorer: a.dna.name, defender: gDna[bAssign[i].defenderIdx].name, quality: Math.round(bAssign[i].quality * 10) / 10 })),
    },
    mvp: pickMvp(winner === "Gold" ? gRes.lines : bRes.lines),
  };
};

const publicPlan = (p) => ({
  pace: Math.round(p.paceTarget * 10) / 10,
  threeEmphasis: Math.round(p.threeEmphasis * 10) / 10,
  postEmphasis: Math.round(p.postEmphasis * 10) / 10,
  ballMovement: p.ballMovement,
  scheme: { switching: p.scheme.switching, zone: p.scheme.zone, pressure: Math.round(p.scheme.pressure * 10) / 10 },
});

const gameScore = (l) =>
  l.pts + 0.7 * l.oreb + 0.3 * l.dreb + 0.7 * l.ast + l.stl + 0.7 * l.blk - 0.7 * l.to - 0.7 * (l.fga - l.fgm) - 0.4 * (l.fta - l.ftm);
const pickMvp = (lines) => {
  const best = [...lines].sort((a, b) => gameScore(b) - gameScore(a))[0];
  return { name: best.name, id: best.id, line: best };
};

// Best-of-7: independent child seeds — every game is its own basketball night.
export const simulateSeriesV3 = (goldTeam, blueTeam, coachGold, coachBlue, era, parentSeed) => {
  const games = [];
  let g = 0, b = 0, i = 0;
  while (g < 4 && b < 4) {
    const game = simulateGameV3(goldTeam, blueTeam, coachGold, coachBlue, era, deriveSeed(parentSeed, i++));
    if (game.winner === "Gold") g++; else b++;
    games.push(game);
  }
  const winner = g === 4 ? "Gold" : "Blue";
  return { winner, seriesScore: { gold: g, blue: b }, seriesResult: `${Math.max(g, b)}-${Math.min(g, b)}`, games };
};

// Win 82: independent child seeds, engine-only, no AI anywhere.
export const simulateSeasonV3 = (goldTeam, genOpponent, coachGold, coachBlue, era, parentSeed) => {
  let wins = 0, losses = 0;
  let finale = null;
  const oppRng = mulberry32(deriveSeed(parentSeed, 99991));
  for (let i = 0; i < 82; i++) {
    const opp = genOpponent(oppRng);
    const game = simulateGameV3(goldTeam, opp, coachGold, coachBlue, era, deriveSeed(parentSeed, i));
    if (game.winner === "Gold") wins++; else losses++;
    if (i === 81) finale = { game, opp };
  }
  return { wins, losses, finale };
};

// Resolve canonical inputs by id (server-side only).
export const resolveCoach = (id) => getCoach(id) || NEUTRAL_COACH;
export const resolveEra = (id) => getEra(id) || getEra(DEFAULT_ERA_ID);
