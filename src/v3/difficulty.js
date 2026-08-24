// ── Opponent difficulty (Win 82 / Tournament) ──────────────────────────────────
// The V3 engine is honest: it never fakes a result, and nothing in this file
// touches the simulation. What difficulty changes is WHO you play — which is
// exactly what changes between an easy season and a hard one in real life.
//
// Two levers, both true to how basketball teams are actually good or bad:
//
//   1. TALENT DEPTH (`min`/`max`) — how deep into the position-sorted pool an
//      opponent is drawn from. Smaller = stronger. On its own this lever runs
//      out: even the 130th-best player at a position is an all-time NBA
//      player, so depth alone can never produce a genuinely soft schedule.
//
//   2. CONSTRUCTION QUALITY (`build`) — the decisive one. Real bad teams are
//      not five slightly-worse players; they are badly BUILT: nobody who can
//      create offense, no spacing, redundant skill sets, three players who all
//      need the ball. V3 already punishes exactly that, emergently (finite
//      usage, creation supply, spacing, role compression) — so we draft soft
//      opponents the way a struggling front office does and hard ones the way
//      a contender does, by generating several candidate fives from the same
//      talent band and keeping the worst-built, median, or best-built one.
//
// Nothing is fabricated and no result is bent: a Rookie opponent is a real
// five of real players that loses because it is poorly assembled — the exact
// thesis EraClash is built on, pointed at the opponent instead of the player.
import { purePickPlayer } from "../draft.js";
import { POSITIONS } from "../players.js";
import { teamDNA } from "./playerProfile.js";
import { allocateUsage, creationBalance } from "./roles.js";

export const DIFFICULTIES = {
  rookie: {
    // rank band, not "top N": the back half of the all-time pool
    id: "rookie", label: "Rookie", window: [55, 135], spread: 30, build: "worst", candidates: 5,
    blurb: "Rebuilding teams: thinner talent and messy roster fits — nobody to create, no spacing.",
  },
  pro: {
    id: "pro", label: "Pro", window: [8, 85], spread: 40, build: "median", candidates: 3,
    blurb: "A real league — contenders, middle of the pack, and lottery teams.",
  },
  allstar: {
    id: "allstar", label: "All-Star", window: [2, 32], spread: 18, build: "best", candidates: 3,
    blurb: "Playoff teams every night, built to complement each other.",
  },
  legend: {
    id: "legend", label: "Legend", window: [0, 12], spread: 8, build: "best", candidates: 4,
    blurb: "All-time teams, expertly built, 82 nights straight. Brutal.",
  },
};
export const DEFAULT_DIFFICULTY = "pro";
export const validDifficulty = (id) => (Object.hasOwn(DIFFICULTIES, id) ? id : DEFAULT_DIFFICULTY);

// How well a five is BUILT, judged by the same economics the engine plays by:
// enough on-ball creation to generate shots, spacing to make them worth
// something, and a usage hierarchy that doesn't force everyone off their
// natural diet. Higher = better constructed. This deliberately does NOT rate
// raw talent — that is the other lever.
export const constructionScore = (roster) => {
  const dnas = teamDNA(roster);
  const alloc = allocateUsage(dnas);
  const bal = creationBalance(alloc);
  const spacing = dnas.reduce((s, d) => s + d.outsideShooting, 0) / 5;
  // role friction: stars squeezed off their diet + role players stretched past it
  const friction = alloc.reduce((s, a) => s + a.compression * 1.2 + a.strain * 0.9, 0);
  const defense = dnas.reduce((s, d) => s + (d.poaDef + d.interiorDef + d.rimProtection) / 3, 0) / 5;
  return bal.supply * 1.6 + spacing * 0.9 + defense * 0.5 - friction * 1.4;
};

const drawFive = (rng, window) => {
  const roster = [];
  const names = [];
  for (const pos of POSITIONS) {
    const p = purePickPlayer(pos, rng, { rankWindow: window, excludeNames: names });
    roster.push(p);
    names.push(p.name);
  }
  return roster;
};

// Build an opponent generator for a difficulty. Deterministic for a given rng
// sequence, so seasons and brackets stay exactly reproducible from their seed.
export const opponentGenerator = (difficultyId) => {
  const d = DIFFICULTIES[validDifficulty(difficultyId)];
  return (rng = Math.random) => {
    // Talent depth is drawn per candidate, so a season faces a real spread of
    // teams rather than 82 copies of one.
    const candidates = [];
    for (let i = 0; i < d.candidates; i++) {
      // each candidate slides its own narrower window inside the tier's band,
      // so one season faces genuinely different classes of team
      const [lo, hi] = d.window;
      const start = Math.round(lo + rng() * Math.max(0, hi - lo - d.spread));
      candidates.push(drawFive(rng, [start, start + d.spread]));
    }
    if (candidates.length === 1) return candidates[0];
    const ranked = candidates
      .map((roster) => ({ roster, score: constructionScore(roster) }))
      .sort((a, b) => a.score - b.score); // worst-built first
    if (d.build === "worst") return ranked[0].roster;
    if (d.build === "best") return ranked[ranked.length - 1].roster;
    return ranked[Math.floor(ranked.length / 2)].roster; // median
  };
};
