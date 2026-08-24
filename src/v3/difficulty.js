// ── Opponent difficulty (Win 82 / Tournament) ──────────────────────────────────
// The V3 engine is honest: it never fakes a result. But WHO you play is a
// product choice, and before this module every Win-82 opponent was drawn from
// the top-8 at each position — i.e. 82 straight games against all-time
// superteams. That made a stacked five a ~.500 team and an ordinary five a
// 2-80 team, which is neither fun nor informative.
//
// Instead of bending the simulation, we bend the SCHEDULE: each difficulty
// draws opponents from a different depth of the player pool, exactly the way a
// real league has contenders, playoff teams, and lottery teams. The games
// themselves are simulated with the same possession engine and the same rules
// at every setting — only the strength of who you face changes.
//
// `eliteN` = how deep into the position-sorted pool an opponent is drawn from.
// Smaller = stronger opponents (top-8 is an all-time starting five).
import { purePickPlayer } from "../draft.js";
import { POSITIONS } from "../players.js";

export const DIFFICULTIES = {
  // id            label            eliteN band   description shown in the UI
  rookie:   { id: "rookie",   label: "Rookie",   min: 55, max: 140, blurb: "Deep-pool opponents. Room to experiment." },
  pro:      { id: "pro",      label: "Pro",      min: 26, max: 80,  blurb: "A real league: contenders, middle, and lottery teams." },
  allstar:  { id: "allstar",  label: "All-Star", min: 12, max: 36,  blurb: "Playoff-caliber opponents every night." },
  legend:   { id: "legend",   label: "Legend",   min: 5,  max: 14,  blurb: "All-time teams, 82 nights straight. Brutal." },
};
export const DEFAULT_DIFFICULTY = "pro";
export const validDifficulty = (id) => (Object.hasOwn(DIFFICULTIES, id) ? id : DEFAULT_DIFFICULTY);

// Build an opponent generator for a difficulty. Each opponent's strength is
// drawn from the band, so a season contains a SPREAD of teams (some nights you
// face a juggernaut, some nights you don't) rather than 82 clones.
export const opponentGenerator = (difficultyId) => {
  const d = DIFFICULTIES[validDifficulty(difficultyId)];
  return (rng = Math.random) => {
    // this opponent's depth: uniform across the band, rounded
    const eliteN = Math.round(d.min + rng() * (d.max - d.min));
    const roster = [];
    const names = [];
    for (const pos of POSITIONS) {
      const p = purePickPlayer(pos, rng, { eliteN, excludeNames: names });
      roster.push(p);
      names.push(p.name);
    }
    return roster;
  };
};
