// ── Global assignment optimizer ──────────────────────────────────────────────
// EXHAUSTIVE over all 5! = 120 permutations, deliberately.
//
// A greedy optimizer assigns the best defender to the biggest threat, then the
// next, and leaves whatever is left over — which is exactly how a 6'9" point
// guard ends up on a 7'1" centre while a real interior defender guards a spot-up
// shooter. At five-on-five the whole space is 120 candidates and costs well
// under a millisecond to evaluate, so there is no reason to accept a leftover.
// A Hungarian solver would give the same answer for the linear part, but it
// cannot express the NON-LINEAR objectives here — rim-protector preservation
// and severe-mismatch count are properties of the whole plan, not sums of
// pairwise costs. Exhaustive evaluation handles them directly and stays
// readable.
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** All 120 orderings of [0..4]. Generated in a fixed order for determinism. */
export const permutations = (n = 5) => {
  const out = [];
  const walk = (prefix, rest) => {
    if (!rest.length) { out.push(prefix); return; }
    for (let i = 0; i < rest.length; i++) {
      walk([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  walk([], Array.from({ length: n }, (_, i) => i));
  return out;
};

const PERMS_5 = permutations(5);

// ── The severe-baseline-mismatch guard (PART 9) ──────────────────────────────
// A knowledgeable user must not routinely see Magic Johnson baseline-guarding
// David Robinson while a real interior defender stands next to him. That
// matchup is legitimate as a temporary switch, a scramble or a transition
// cross-match — never as the PLAN.
//
// The penalty is deliberately large enough to dominate every other term, so it
// cannot be outweighed by accumulating small fits elsewhere. It only applies
// when a credible alternative actually exists: with no interior defender on the
// roster, someone has to guard the centre and that is not an error.
export const SEVERE_BASELINE_PENALTY = 400;

const isBigThreat = (t) => t.threats.postScoring >= 6.5 || (t.threats.rimPressure >= 7 && t.threats.postScoring >= 5);
const isNonInteriorDefender = (d) => d.capabilities.postDefense <= 5.5 && d.capabilities.interiorDefense <= 5.5;

export const severeBaselineViolations = ({ pairs, defenders, threats }) => {
  const credibleInterior = defenders.filter((d) => d.roleAvailability.canGuardPost || d.capabilities.postDefense >= 6.5);
  const out = [];
  for (const { threat, defender } of pairs) {
    if (!isBigThreat(threat) || !isNonInteriorDefender(defender)) continue;
    // Is a credible interior defender available who is NOT already handling
    // another big threat? If not, this is forced, not a planning error.
    const otherBigs = threats.filter((t) => t.playerCardId !== threat.playerCardId && isBigThreat(t)).length;
    if (credibleInterior.length > otherBigs) {
      out.push({
        offensivePlayerId: threat.playerCardId, offensivePlayerName: threat.name,
        defenderId: defender.playerCardId, defenderName: defender.name,
        reason: "SEVERE_BASELINE_MISMATCH",
        detail: `${defender.name} (post defence ${defender.capabilities.postDefense}) planned on ${threat.name} (post scoring ${threat.threats.postScoring}) while ${credibleInterior.length} credible interior defender(s) were available`,
      });
    }
  }
  return out;
};

/**
 * Score one complete plan. Objectives beyond the sum of pairwise costs, because
 * team defence is not the sum of five one-on-one matchups.
 */
export const scorePlan = ({ pairs, defenders, threats, scheme }) => {
  const pairCost = pairs.reduce((a, p) => a + p.cell.cost, 0);
  const severeMismatches = pairs.reduce((a, p) => a + p.cell.severeCount, 0);
  const majorMismatches = pairs.reduce((a, p) => a + p.cell.majorCount, 0);

  // ── rim-protector preservation (PART 12) ───────────────────────────────────
  // Assigning the best rim protector to a movement shooter may win that pairing
  // and lose the paint. Measured, not assumed: the cost is how much rim
  // protection is left effectively near the basket.
  const rimProtectors = defenders.filter((d) => d.roleAvailability.canProtectRim);
  const preserved = pairs.filter(({ defender, threat }) =>
    defender.roleAvailability.canProtectRim && (threat.threats.postScoring >= 4.5 || threat.threats.rimPressure >= 6 || threat.threats.spotUpShooting <= 5.5));
  const rimPreservation = rimProtectors.length === 0 ? 1 : preserved.length / rimProtectors.length;
  const paintWeight = scheme ? clamp(scheme.paintPriority / 10, 0.2, 1) : 0.6;
  const rimPenalty = (1 - rimPreservation) * 26 * paintWeight;

  // ── primary-creator containment (PART 11) ──────────────────────────────────
  // The single most important assignment on the floor. A position-matched plan
  // that leaves an elite stopper on a 12%-usage shooter is penalised here.
  const primary = [...threats].sort((a, b) => b.usageShare - a.usageShare)[0];
  const onPrimary = pairs.find((p) => p.threat.playerCardId === primary.playerCardId);
  const bestAvailable = Math.max(...defenders.map((d) => d.capabilities.pointOfAttack * 0.6 + d.capabilities.wingContainment * 0.4));
  const assignedQuality = onPrimary.defender.capabilities.pointOfAttack * 0.6 + onPrimary.defender.capabilities.wingContainment * 0.4;
  const creatorPenalty = clamp(bestAvailable - assignedQuality, 0, 10) * 2.2;

  // ── weak-defender hiding (PART 10) ─────────────────────────────────────────
  const hidden = pairs.filter((p) => p.cell.isHide);
  const hideCredit = scheme?.weakDefenderHidePolicy === "ACTIVE" ? hidden.length * 3.5 : hidden.length * 1.5;

  // ── team rebounding ────────────────────────────────────────────────────────
  const reboundShortfall = pairs.reduce((a, p) => a + p.cell.dimensions.reboundingPosition.shortfall, 0);

  const violations = severeBaselineViolations({ pairs, defenders, threats });

  const total = pairCost
    + severeMismatches * 6
    + majorMismatches * 1.5
    + rimPenalty
    + creatorPenalty
    + reboundShortfall * 0.6
    - hideCredit
    + violations.length * SEVERE_BASELINE_PENALTY;

  return {
    total: r1(total),
    components: {
      pairCost: r1(pairCost), severeMismatches, majorMismatches,
      rimPreservation: r1(rimPreservation * 100) / 100, rimPenalty: r1(rimPenalty),
      creatorPenalty: r1(creatorPenalty), hideCredit: r1(hideCredit),
      reboundShortfall: r1(reboundShortfall),
      severeBaselineViolations: violations.length,
    },
    violations,
  };
};

/**
 * The best valid global plan.
 *
 * Tie-breaking is explicit and deterministic: lowest total, then fewest severe
 * mismatches, then fewest major, then the lexicographically smallest
 * defender→offence card-id pairing. Never array order, and never an accident of
 * iteration.
 */
export const optimizeAssignments = ({ matrix, scheme }) => {
  const { defenders, threats, cells } = matrix;
  let best = null;
  let evaluated = 0;

  for (const perm of PERMS_5) {
    const pairs = perm.map((threatIndex, defenderIndex) => ({
      defender: defenders[defenderIndex],
      threat: threats[threatIndex],
      cell: cells[defenderIndex][threatIndex],
    }));
    const score = scorePlan({ pairs, defenders, threats, scheme });
    evaluated++;
    const key = pairs.map((p) => `${p.defender.playerCardId}>${p.threat.playerCardId}`).sort().join("|");

    if (!best) { best = { perm, pairs, score, key }; continue; }
    const better = score.total < best.score.total
      || (score.total === best.score.total && score.components.severeMismatches < best.score.components.severeMismatches)
      || (score.total === best.score.total && score.components.severeMismatches === best.score.components.severeMismatches
          && score.components.majorMismatches < best.score.components.majorMismatches)
      || (score.total === best.score.total && score.components.severeMismatches === best.score.components.severeMismatches
          && score.components.majorMismatches === best.score.components.majorMismatches && key < best.key);
    if (better) best = { perm, pairs, score, key };
  }

  return { ...best, evaluated, searchSpace: PERMS_5.length };
};

/** A deliberately greedy plan, kept ONLY so tests can prove the optimizer beats it. */
export const greedyAssignments = ({ matrix }) => {
  const { defenders, threats, cells } = matrix;
  // Biggest threat first, best remaining defender for it — the classic mistake.
  const order = threats.map((t, i) => ({ t, i })).sort((a, b) => b.t.usageShare - a.t.usageShare);
  const takenDefenders = new Set();
  const pairs = [];
  for (const { t, i } of order) {
    let bestD = -1, bestCost = Infinity;
    for (let d = 0; d < defenders.length; d++) {
      if (takenDefenders.has(d)) continue;
      if (cells[d][i].cost < bestCost) { bestCost = cells[d][i].cost; bestD = d; }
    }
    takenDefenders.add(bestD);
    pairs.push({ defender: defenders[bestD], threat: t, cell: cells[bestD][i] });
  }
  return { pairs };
};
