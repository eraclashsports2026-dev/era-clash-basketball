#!/usr/bin/env node
// ── EraClash Labs: Team Intelligence benchmark ────────────────────────────────
// Eight canonical lineups built from real cards, run through the hidden Team
// Intelligence engine. The purpose is to EXPOSE TRADEOFFS, not to crown a
// roster type — a benchmark that always ranked one construction highest would
// be measuring a preference, not basketball.
//
//   node benchmarks/v3/team-intelligence.mjs [--json]
import { buildTeamIntelligence, TEAM_INTELLIGENCE_VERSION } from "../../src/v3/teamIntelligence.js";

export const LINEUPS = {
  "superstar-stack": {
    why: "Five ball-dominant creators. Should show enormous talent AND real usage compression.",
    cards: ["luka-20s", "harden-10s", "jordan-90s", "lebron-10s", "jokic-20s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "balanced-elite": {
    why: "One creator, elite two-way support. Should show a clean hierarchy and low usage conflict.",
    cards: ["magic-80s", "klay-10s", "pippen-90s", "duncan-00s", "hak-90s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "elite-spacing": {
    why: "Maximum floor stretch. Should show strong offensive geometry and defensive tradeoffs.",
    cards: ["curry-10s", "klay-10s", "bird-80s", "dirk-00s", "jokic-20s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "interior-heavy": {
    why: "Great players, almost no shooting. Should show real paint congestion — and NOT be called bad.",
    cards: ["magic-80s", "jordan-90s", "lebron-10s", "duncan-00s", "shaq-00s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "defense-first": {
    why: "Coverage everywhere. Should show elite defence and honest offensive limits.",
    cards: ["gary-90s", "moncrief-80s", "pippen-90s", "kg-00s", "bill-60s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "small-ball": {
    why: "Speed and switching over size. Should show high switchability and rim-protection risk.",
    cards: ["ai-00s", "curry-10s", "bowen-2ks", "draymond-10s", "rodman-90s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "size-heavy": {
    why: "Size everywhere. Should show rebounding and interior defence, with spacing and pace costs.",
    cards: ["magic-80s", "jordan-90s", "durant-10s", "duncan-00s", "shaq-00s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
  "complementary-roles": {
    why: "Lower individual talent, deliberate role coverage. Should score well on construction, not on star power.",
    cards: ["mookie-90s", "finley-00s", "prince-00s", "joshsmith-00s", "eaton-80s"],
    slots: ["PG", "SG", "SF", "PF", "C"],
  },
};

export const runBenchmark = () =>
  Object.fromEntries(
    Object.entries(LINEUPS).map(([name, spec]) => [
      name,
      buildTeamIntelligence({ playerCards: spec.cards, positionAssignments: spec.slots }),
    ])
  );

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 5) => String(v).padStart(n);

const main = () => {
  const results = runBenchmark();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nTeam Intelligence benchmark — model v${TEAM_INTELLIGENCE_VERSION}\n`);
  console.log(pad("lineup", 22) + num("space") + num("rimP") + num("poa") + num("wing") + num("switch") + num("dreb") + num("offBall") + num("retain") + "  identity");
  console.log("─".repeat(120));
  for (const [name, t] of Object.entries(results)) {
    console.log(
      pad(name, 22) +
      num(t.offense.spacing.floorSpacing) + num(t.defense.rimProtection) + num(t.defense.pointOfAttack) +
      num(t.defense.wingContainment) + num(t.defense.switchability) + num(t.rebounding.defensiveGlass) +
      num(t.offense.offBallValue, 7) + num(t.construction.usageCompression.totalValueRetained, 7) +
      "  " + t.identity.slice(0, 3).join(",")
    );
  }

  console.log("\n─── usage compression ───");
  for (const [name, t] of Object.entries(results)) {
    const c = t.construction.usageCompression.compressedPlayers;
    console.log(`\n${name}  (${t.creationHierarchy.primaryCount} primary creator${t.creationHierarchy.primaryCount === 1 ? "" : "s"}, ${c.length} compressed)`);
    for (const u of t.usagePlan.sort((a, b) => b.share - a.share)) {
      const bar = "█".repeat(Math.round(u.share * 60));
      console.log(`   ${pad(u.name, 20)} ${String((u.share * 100).toFixed(1)).padStart(5)}%  natural ${String((u.natural * 100).toFixed(1)).padStart(5)}%  retained ${String((u.valueRetained * 100).toFixed(0)).padStart(3)}%  scal ${num(u.roleScalability, 4)}  ${bar}`);
    }
  }

  console.log("\n─── strengths & concerns ───");
  for (const [name, t] of Object.entries(results)) {
    console.log(`\n${name}`);
    for (const s of t.construction.lineupStrengths) console.log(`   + ${s}`);
    for (const c of t.construction.lineupConcerns) console.log(`   − ${c}`);
    if (!t.construction.lineupStrengths.length && !t.construction.lineupConcerns.length) console.log("   (nothing notable)");
    console.log(`   confidence: overall ${t.confidence.overall} · defence ${t.confidence.defense}`);
  }

  console.log("\n─── role coverage ───");
  for (const [name, t] of Object.entries(results)) {
    const c = t.construction.roleCoverage;
    console.log(`${pad(name, 22)} covered ${num(c.covered.length, 2)}/${c.covered.length + c.missing.length}   redundant: ${c.redundant.map((r) => `${r.role}×${r.count}`).join(", ") || "none"}`);
    if (c.missing.length) console.log(`${" ".repeat(22)} missing: ${c.missing.join(", ")}`);
  }
  console.log("");
};

if (import.meta.url === `file://${process.argv[1]}`) main();
