// ── Matchup-aware defensive assignments ────────────────────────────────────────
// NOT blind PG-guards-PG. Threats are ranked by usage-weighted creation; the
// scheme assigns the most suitable available defender to each threat, where
// suitability = the right defensive skill for the threat's game, discounted by
// positional distance unless the defender's switchability (or a switching
// scheme) covers it. Assignments are explicit and surfaced in Postgame.
const POS_INDEX = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

const threatScore = (a) => a.share * 100 * (0.5 + a.dna.creation * 0.08 + a.dna.rimPressure * 0.03);

// which defensive skill matters against this offensive player
const defSkillVs = (off, def) => {
  const perimeter = off.threeTendency * 0.5 + off.creation * 0.5;
  const interior = off.postScoring * 0.6 + off.rimPressure * 0.4;
  return perimeter >= interior
    ? def.poaDef * 0.6 + def.wingDef * 0.4
    : def.interiorDef * 0.6 + def.rimProtection * 0.4;
};

export const assignDefense = (offAlloc, defDnas, scheme /* {switching 0-10} */) => {
  const threats = offAlloc
    .map((a, i) => ({ i, a, t: threatScore(a) }))
    .sort((x, y) => y.t - x.t);
  const taken = new Set();
  const assignments = new Array(5).fill(null);

  for (const { i, a } of threats) {
    let best = -1, bestScore = -Infinity;
    for (let j = 0; j < 5; j++) {
      if (taken.has(j)) continue;
      const def = defDnas[j];
      const posGap = Math.abs(POS_INDEX[a.dna.pos] - POS_INDEX[def.pos]);
      // switchable defenders (or switching schemes) pay less for cross-matches
      const switchCover = (def.switchability + (scheme?.switching ?? 4)) / 2;
      const gapPenalty = posGap * (2.2 - Math.min(2.0, switchCover * 0.18));
      const score = defSkillVs(a.dna, def) - gapPenalty;
      if (score > bestScore) { bestScore = score; best = j; }
    }
    taken.add(best);
    assignments[i] = { defenderIdx: best, quality: Math.max(0, bestScore) };
  }
  return assignments; // assignments[offIdx] = {defenderIdx, quality 0-10ish}
};

// Team-level defensive context used every possession.
export const defenseContext = (defDnas, scheme, era) => {
  const rimProt = defDnas.reduce((s, d) => s + d.rimProtection, 0) / 5;
  const help = defDnas.reduce((s, d) => s + d.helpDef, 0) / 5;
  const pressure = defDnas.reduce((s, d) => s + d.defPlaymaking, 0) / 5;
  return {
    // pre-2002 illegal-defense rules limit pre-rotated help; legal zones and
    // defensive three seconds change interior shell strength
    rimWall: rimProt * (era.rules.zoneLegal ? 1.0 : 0.88) * (1 + (scheme?.rimPriority ?? 5) * 0.012),
    help: help * (era.rules.illegalDefenseRestrictions ? 0.85 : 1.0) * (1 + (scheme?.helpAggression ?? 5) * 0.012),
    pressure: pressure * (1 + (scheme?.pressure ?? 5) * 0.02) * (era.rules.handCheckAllowed ? 1.08 : 1.0),
    boxOut: defDnas.reduce((s, d) => s + d.defReb, 0) / 5 * (1 + (scheme?.defRebPriority ?? 5) * 0.012),
  };
};
