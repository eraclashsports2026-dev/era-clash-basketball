#!/usr/bin/env node
// ── Assignment plan explainer (internal development tool) ────────────────────
//   npm run defense:explain -- --scenario=russell-klay
//   npm run defense:explain -- --scenario=magic-klay-bird
//   npm run defense:explain -- --scenario=shaq-jokic
//   npm run defense:explain -- --all
import { buildDefensivePlan } from "../src/v3/defense/plan.js";
import { explainAssignmentPlan, renderExplanation } from "../src/v3/defense/explain.mjs";
import { preparePossessionContext } from "../src/v3/possession/context.js";
import { buildPossessionInput } from "../src/v3/possession/testContext.js";
import { getEra } from "../src/v3/eraStyles.js";

// The three benchmark plans that looked wrong, each with credible alternatives
// a coach would actually consider. Fixtures may name players; the OPTIMIZER
// may not (a test enforces that).
export const SCENARIOS = {
  "russell-klay": {
    label: "Scenario A — Russell chasing Klay while Moncrief/Pippen are available",
    defenders: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
    offense: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
    era: "2010s", coach: "tom-thibodeau",
    alternatives: [
      { name: "Moncrief chases Klay", mapping: { "gary-90s": "curry-10s", "moncrief-80s": "klay-10s", "pippen-90s": "bird-80s", "kg-00s": "dirk-00s", "bill-60s": "jokic-20s" } },
      { name: "Pippen chases Klay", mapping: { "gary-90s": "curry-10s", "moncrief-80s": "bird-80s", "pippen-90s": "klay-10s", "kg-00s": "dirk-00s", "bill-60s": "jokic-20s" } },
      { name: "Russell on Jokic, Garnett on Dirk", mapping: { "gary-90s": "curry-10s", "moncrief-80s": "klay-10s", "pippen-90s": "bird-80s", "kg-00s": "dirk-00s", "bill-60s": "jokic-20s" } },
    ],
  },
  "magic-klay-bird": {
    label: "Scenario B — Magic chasing Klay while Jordan guards Bird",
    defenders: ["magic-80s", "jordan-90s", "pippen-90s", "duncan-00s", "hak-90s"],
    offense: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "rob-90s"],
    era: "1990s", coach: "pat-riley",
    alternatives: [
      { name: "Option 1: Magic on Klay (chosen shape)", mapping: { "pippen-90s": "curry-10s", "jordan-90s": "bird-80s", "magic-80s": "klay-10s", "duncan-00s": "rob-90s", "hak-90s": "dirk-00s" } },
      { name: "Option 2: Jordan on Klay, Magic on Bird", mapping: { "pippen-90s": "curry-10s", "jordan-90s": "klay-10s", "magic-80s": "bird-80s", "duncan-00s": "rob-90s", "hak-90s": "dirk-00s" } },
      { name: "Option 3: Jordan on Curry, Pippen on Klay", mapping: { "jordan-90s": "curry-10s", "pippen-90s": "klay-10s", "magic-80s": "bird-80s", "duncan-00s": "rob-90s", "hak-90s": "dirk-00s" } },
    ],
  },
  "shaq-jokic": {
    label: "Scenario C — Shaq on Jokic labelled PRESERVE_RIM_PROTECTION",
    defenders: ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"],
    offense: ["curry-10s", "klay-10s", "lebron-10s", "dirk-00s", "jokic-20s"],
    era: "1990s", coach: "jerry-sloan",
    alternatives: [
      { name: "Garnett on Jokic, Shaq on Dirk", mapping: { "magic-80s": "klay-10s", "jordan-90s": "curry-10s", "bird-80s": "lebron-10s", "kg-00s": "jokic-20s", "shaq-90s": "dirk-00s" } },
      { name: "Shaq on Jokic (chosen shape)", mapping: { "magic-80s": "klay-10s", "jordan-90s": "curry-10s", "bird-80s": "lebron-10s", "kg-00s": "dirk-00s", "shaq-90s": "jokic-20s" } },
      { name: "Bird on Klay, Magic on LeBron", mapping: { "magic-80s": "lebron-10s", "jordan-90s": "curry-10s", "bird-80s": "klay-10s", "kg-00s": "jokic-20s", "shaq-90s": "dirk-00s" } },
    ],
  },
};

export const explainScenario = (key) => {
  const s = SCENARIOS[key];
  if (!s) throw new Error(`unknown scenario "${key}" — try ${Object.keys(SCENARIOS).join(", ")}`);
  const ctx = preparePossessionContext(buildPossessionInput({
    goldIds: s.defenders, blueIds: s.offense, eraStyleId: s.era,
    simulationSeed: 1, coachGoldId: s.coach, coachBlueId: "phil-jackson",
  }));
  const plan = buildDefensivePlan({ defendingTeam: ctx.gold, offensiveTeam: ctx.blue, era: getEra(s.era) });
  return { scenario: s, plan, explanation: explainAssignmentPlan(plan, { alternatives: s.alternatives }) };
};

const main = () => {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--scenario="));
  const keys = process.argv.includes("--all") || !arg ? Object.keys(SCENARIOS) : [arg.slice(11)];
  for (const k of keys) {
    const { scenario, explanation } = explainScenario(k);
    console.log(`\n════ ${scenario.label} ════\n`);
    console.log(renderExplanation(explanation));
  }
};

if (import.meta.url === `file://${process.argv[1]}`) main();
