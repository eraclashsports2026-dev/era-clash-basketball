// ── Player DNA (V3 simulation profile) ─────────────────────────────────────────
// Separates HISTORICAL PRODUCTION (the trusted per-game stats in players.js)
// from BASKETBALL CAPABILITY (what the possession engine needs). Nothing in
// the verified dataset is overwritten — this layer DERIVES capabilities and
// records provenance per field group:
//   VERIFIED        — read directly from the trusted stat/accolade dataset
//   HUMAN_REVIEWED  — from the curated attribute file (93 players, hand-set)
//   CALCULATED      — deterministic transforms of verified data
//   INFERRED        — era/position priors where no direct evidence exists
//                     (documented; conservative; confidence LOW)
// The dataset has NO shooting-split data (no FG%/3P%/FT%), so all shooting
// skill for non-curated players is INFERRED from position, era, scoring
// volume, and accolades — that uncertainty is explicit, not hidden.
import { PLAYERS } from "../players.js";
import { getAttrs } from "../attributes.js";

const clamp10 = (v) => Math.max(0, Math.min(10, v));

// Era priors for outside shooting inference (perimeter shot-making skill —
// NOT three-point line usage; the era environment decides shot VALUE).
const ERA_OUTSIDE_PRIOR = { "1950s": 3, "1960s": 3, "1970s": 3.5, "1980s": 4, "1990s": 4.5, "2000s": 5, "2010s": 5.5, "2020s": 6 };
const GUARDY = { PG: 1, SG: 1, SF: 0.6, PF: 0.25, C: 0.1 };
const BIGY = { PG: 0.05, SG: 0.1, SF: 0.35, PF: 0.8, C: 1 };

const accoladeStar = (p) => p.mvp * 3 + p.fmvp * 2 + p.an1 * 1.2 + p.an2 * 0.6 + p.an3 * 0.3;
const defPedigree = (p) => p.dpoy * 3 + p.ad1 * 1.5 + p.ad2 * 0.75;

// Build the full DNA for one player entry. Deterministic; cached.
const cache = new Map();
export const playerDNA = (p) => {
  if (cache.has(p.id)) return cache.get(p.id);
  const a = getAttrs(p.id); // curated (93) or null
  const g = GUARDY[p.pos], b = BIGY[p.pos];
  const star = accoladeStar(p);
  const dped = defPedigree(p);

  // — offense —
  const usageTendency = a ? a.usage : clamp10(p.pts / 3.4 + star * 0.15);
  const ballDominance = a ? a.ballDom : clamp10(p.ast * 0.55 + p.pts * 0.12 + g * 1.5);
  const creation = a ? a.shotCreation : clamp10(p.pts * 0.18 + p.ast * 0.45 + star * 0.35);
  const passing = a ? a.playmaking : clamp10(p.ast * 0.85 + g * 1);
  const outsideShooting = a ? a.outsideGravity : clamp10(ERA_OUTSIDE_PRIOR[p.decade] * (0.55 + g * 0.55) + (p.pts > 20 ? 1 : 0));
  const rimPressure = a ? a.rimPressure : clamp10(p.pts * 0.14 + b * 3 + (p.decade <= "1970s" ? 0.5 : 0));
  const finishing = clamp10(rimPressure * 0.6 + b * 2 + p.blk * 0.3);
  const postScoring = a?.shotProfile === "post" ? clamp10(rimPressure + 1) : clamp10(b * 4 + p.pts * 0.08);
  const midrange = a
    ? clamp10((a.shotCreation + (a.shotProfile === "mid" ? 3 : 0)) * 0.8 + 2)
    : clamp10(3.5 + p.pts * 0.12 + star * 0.2);
  const offBall = a ? a.offBall : clamp10(6 - ballDominance * 0.35 + outsideShooting * 0.25);
  const threeTendency = a
    ? clamp10(a.shotProfile === "three" ? 8 : a.outsideGravity * 0.7)
    : clamp10((ERA_OUTSIDE_PRIOR[p.decade] - 2.5) * g * 1.6); // pre-3PT eras ≈ 0
  const ftSkill = clamp10(4 + outsideShooting * 0.35 + g * 1.2 + star * 0.1); // INFERRED (no FT% data)
  const ftPressure = clamp10(rimPressure * 0.7 + usageTendency * 0.25);
  const ballSecurity = a
    ? clamp10(7 - a.usage * 0.25 + (a.playmaking > 7 ? 1 : 0))
    : clamp10(6.5 - usageTendency * 0.2 + (star > 4 ? 1 : 0));
  const transition = a ? clamp10(a.pace) : clamp10(4 + g * 1 + p.stl * 1.2);

  // — rebounding — split the verified REB by position economics
  const orebShare = 0.28 + b * 0.14; // bigs harvest more of their boards offensively
  const offReb = a ? clamp10(a.rebounding * 0.75 * (0.5 + b * 0.5)) : clamp10(p.reb * orebShare * 0.8);
  const defReb = a ? a.rebounding : clamp10(p.reb * 0.55);

  // — defense —
  const poaDef = a ? a.poaDef : clamp10(p.stl * 2.2 + dped * 0.5 * g + g * 1.2);
  const wingDef = a ? clamp10((a.poaDef + a.switchability) / 2) : clamp10(p.stl * 1.5 + dped * 0.4 + 2);
  const interiorDef = a ? a.interiorDef : clamp10(p.blk * 1.8 + dped * 0.5 * b + b * 2);
  const rimProtection = a ? a.rimProt : clamp10(p.blk * 2.6 + b * 1.4);
  const helpDef = clamp10((interiorDef + wingDef) * 0.4 + dped * 0.4);
  const switchability = a ? a.switchability : clamp10(4 + p.stl * 1 - b * 1.2 + dped * 0.2);
  const defPlaymaking = clamp10(p.stl * 2.6 + p.blk * 1.2);

  // — intangibles —
  const consistency = clamp10(4.5 + star * 0.45 + p.win * 0.15); // stars/winners steadier (CALCULATED proxy)
  const iq = a ? clamp10((a.playmaking + a.offBall) / 2 + 2) : clamp10(4 + p.ast * 0.4 + p.win * 0.2);

  const dna = {
    id: p.id, name: p.name, pos: p.pos, positions: p.positions, decade: p.decade,
    usageTendency, ballDominance, creation, passing, outsideShooting, rimPressure,
    finishing, postScoring, midrange, offBall, threeTendency, ftSkill, ftPressure,
    ballSecurity, transition, offReb, defReb,
    poaDef, wingDef, interiorDef, rimProtection, helpDef, switchability, defPlaymaking,
    consistency, iq,
    provenance: {
      productionStats: "VERIFIED",
      curatedAttributes: a ? "HUMAN_REVIEWED" : null,
      derivedCapabilities: "CALCULATED",
      shootingSkill: a ? "HUMAN_REVIEWED" : "INFERRED (position/era/volume priors — no shooting-split data in dataset)",
      ftSkill: "INFERRED (no FT data in dataset)",
      confidence: a ? "MEDIUM-HIGH" : "MEDIUM-LOW",
    },
  };
  cache.set(p.id, dna);
  return dna;
};

export const teamDNA = (team) => team.map(playerDNA);
export const findPlayer = (id) => PLAYERS.find((p) => p.id === id);
