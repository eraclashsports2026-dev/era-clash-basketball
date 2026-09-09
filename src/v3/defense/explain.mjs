// ── Assignment plan explanation (internal development diagnostic) ────────────
// Makes the optimizer AUDITABLE. Not exposed by any route.
//
// The optimizer chooses among 120 permutations by a single total, and a single
// total is not an explanation. When a plan looks wrong — Bill Russell chasing
// Klay Thompson while Moncrief is available — the only way to tell a modelling
// error from a genuine tradeoff is to see what each credible alternative would
// have cost and why it lost.
import { scorePlan } from "./optimizer.js";
import { permutations } from "./optimizer.js";

const r1 = (x) => Math.round(x * 10) / 10;
const pad = (s, n) => String(s).padEnd(n);

/** Build the pair list for one explicit defender→offence mapping. */
export const pairsFor = ({ matrix, mapping }) => {
  const { defenders, threats, cells } = matrix;
  return Object.entries(mapping).map(([defId, offId]) => {
    const di = defenders.findIndex((d) => d.playerCardId === defId);
    const ti = threats.findIndex((t) => t.playerCardId === offId);
    if (di < 0) throw new Error(`unknown defender "${defId}"`);
    if (ti < 0) throw new Error(`unknown offensive player "${offId}"`);
    return { defender: defenders[di], threat: threats[ti], cell: cells[di][ti] };
  });
};

/** Score an explicit alternative mapping against the same objectives. */
export const scoreAlternative = ({ plan, mapping }) => {
  const pairs = pairsFor({ matrix: plan.matrix, mapping });
  const seenD = new Set(pairs.map((p) => p.defender.playerCardId));
  const seenT = new Set(pairs.map((p) => p.threat.playerCardId));
  if (seenD.size !== 5 || seenT.size !== 5) throw new Error("an alternative must be a complete one-to-one mapping");
  return { pairs, score: scorePlan({ pairs, defenders: plan.matrix.defenders, threats: plan.matrix.threats, scheme: plan.scheme }) };
};

/**
 * Full explanation of a chosen plan, with every cost component that produced
 * it and a ranked list of alternatives.
 */
export const explainAssignmentPlan = (plan, { alternatives = [], topN = 5 } = {}) => {
  const chosenPairs = plan.baselineAssignments.map((a) => {
    const di = plan.matrix.defenders.findIndex((d) => d.playerCardId === a.defenderId);
    const ti = plan.matrix.threats.findIndex((t) => t.playerCardId === a.offensivePlayerId);
    return { defender: plan.matrix.defenders[di], threat: plan.matrix.threats[ti], cell: plan.matrix.cells[di][ti] };
  });

  const pairwise = chosenPairs.map(({ defender, threat, cell }) => ({
    defender: defender.name, defenderId: defender.playerCardId,
    offense: threat.name, offenseId: threat.playerCardId,
    cost: cell.cost, shortfallCost: cell.shortfallCost, mismatchCost: cell.mismatchCost,
    usageWeight: cell.usageWeight,
    defensiveDemand: cell.defensiveDemand ?? null,
    // The dimensions that actually cost something, largest first.
    drivers: Object.entries(cell.dimensions)
      .filter(([, d]) => d.shortfall > 0.15)
      .sort((a, b) => b[1].shortfall - a[1].shortfall)
      .slice(0, 4)
      .map(([k, d]) => ({ dimension: k, shortfall: d.shortfall, demand: d.demand, fit: d.fit })),
    mismatches: cell.mismatches.map((m) => `${m.severity}:${m.type}`),
  }));

  // Every permutation, so "was there anything better" is answerable.
  const { defenders, threats, cells } = plan.matrix;
  const ranked = permutations(5).map((perm) => {
    const pairs = perm.map((ti, di) => ({ defender: defenders[di], threat: threats[ti], cell: cells[di][ti] }));
    return {
      total: scorePlan({ pairs, defenders, threats, scheme: plan.scheme }).total,
      mapping: Object.fromEntries(pairs.map((p) => [p.defender.playerCardId, p.threat.playerCardId])),
      label: pairs.map((p) => `${p.defender.name.split(" ").slice(-1)[0]}→${p.threat.name.split(" ").slice(-1)[0]}`).join(", "),
    };
  }).sort((a, b) => a.total - b.total);

  const named = alternatives.map((alt) => {
    const { pairs, score } = scoreAlternative({ plan, mapping: alt.mapping });
    return {
      name: alt.name, total: score.total, delta: r1(score.total - plan.optimization.total),
      components: score.components,
      // WHY it lost, component by component, rather than one number.
      worseBy: Object.entries(score.components)
        .filter(([k, v]) => typeof v === "number" && v !== plan.optimization.components[k])
        .map(([k, v]) => ({ component: k, alternative: v, chosen: plan.optimization.components[k], delta: r1(v - plan.optimization.components[k]) })),
      pairwise: pairs.map((p) => ({ defender: p.defender.name, offense: p.threat.name, cost: p.cell.cost })),
    };
  });

  return {
    side: plan.side, coachId: plan.coachId, eraStyleId: plan.eraStyleId,
    scheme: { shellType: plan.scheme.shellType, switchingFrequency: plan.scheme.switchingFrequency, helpAggression: plan.scheme.helpAggression, zoneUsage: plan.scheme.zoneUsage },
    chosen: { total: plan.optimization.total, components: plan.optimization.components },
    pairwise,
    wholePlanCosts: {
      severeMismatchCost: r1(plan.optimization.components.severeMismatches * 6),
      majorMismatchCost: r1(plan.optimization.components.majorMismatches * 1.5),
      rimPenalty: plan.optimization.components.rimPenalty,
      rimPreservation: plan.optimization.components.rimPreservation,
      creatorPenalty: plan.optimization.components.creatorPenalty,
      reboundShortfallCost: r1(plan.optimization.components.reboundShortfall * 0.6),
      hideCredit: plan.optimization.components.hideCredit,
      severeBaselineViolations: plan.optimization.components.severeBaselineViolations,
    },
    alternatives: named,
    bestAlternatives: ranked.slice(1, topN + 1),
    rank: ranked.findIndex((r) => Object.entries(r.mapping).every(([d, o]) => plan.baselineAssignments.find((a) => a.defenderId === d)?.offensivePlayerId === o)),
  };
};

/** Human-readable rendering for the CLI. */
export const renderExplanation = (x) => {
  const L = [];
  L.push(`── assignment plan: ${x.side} (${x.coachId}, ${x.eraStyleId}) ─────────────────`);
  L.push(`   scheme ${x.scheme.shellType}  switch ${x.scheme.switchingFrequency}  help ${x.scheme.helpAggression}  zone ${x.scheme.zoneUsage}`);
  L.push(`   TOTAL ${x.chosen.total}   (ranked #${x.rank + 1} of 120)`);
  L.push("");
  L.push("   ── pairwise ──");
  for (const p of x.pairwise) {
    L.push(`   ${pad(p.defender, 18)} → ${pad(p.offense, 18)} cost ${String(p.cost).padStart(6)}  (shortfall ${p.shortfallCost}, mismatch ${p.mismatchCost}, weight ${p.usageWeight}${p.defensiveDemand != null ? `, demand ${p.defensiveDemand}` : ""})`);
    for (const d of p.drivers) L.push(`        ${pad(d.dimension, 22)} shortfall ${String(d.shortfall).padStart(5)}  (demand ${d.demand} vs fit ${d.fit})`);
    if (p.mismatches.length) L.push(`        ${p.mismatches.join(", ")}`);
  }
  L.push("");
  L.push("   ── whole-plan costs ──");
  for (const [k, v] of Object.entries(x.wholePlanCosts)) L.push(`   ${pad(k, 26)} ${v}`);
  if (x.alternatives.length) {
    L.push("");
    L.push("   ── named alternatives ──");
    for (const a of x.alternatives) {
      L.push(`   ${pad(a.name, 34)} total ${String(a.total).padStart(7)}  (${a.delta >= 0 ? "+" : ""}${a.delta} vs chosen)`);
      for (const w of a.worseBy) L.push(`        ${pad(w.component, 24)} ${w.alternative} vs ${w.chosen}  (${w.delta >= 0 ? "+" : ""}${w.delta})`);
      for (const p of a.pairwise) L.push(`        ${pad(p.defender, 18)} → ${pad(p.offense, 18)} ${p.cost}`);
    }
  }
  L.push("");
  L.push("   ── next best permutations ──");
  for (const b of x.bestAlternatives) L.push(`   ${String(b.total).padStart(7)}  ${b.label}`);
  return L.join("\n");
};
