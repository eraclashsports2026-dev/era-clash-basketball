#!/usr/bin/env node
// ── Persistent-cluster probe: measure the first failing layer ────────────────
//   npm run d0:probe
import { readArtifact } from "../../src/v3/calibration/artifacts.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { referenceTeam, loadReferences } from "../validation/eraReferences.mjs";
import { teamFromSide } from "../candidate3/remeasure.mjs";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { C2D, r2 } from "./paths.mjs";

const map = await buildRunnerProfileMap();
const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
const refs = loadReferences().data.references;

const CASES = [
  { era: "2000s", side: "teamB", label: "Houston 2007-08 (postUp/pace)" },
  { era: "2020s", side: "teamB", label: "San Antonio 2020-21 (movement)" },
  { era: "2000s", side: "teamA", label: "Boston 2007-08 (assist/defense)" },
  { era: "1970s", side: "teamB", label: "Portland 1974-75 (orebRate)" },
];
for (const c of CASES) {
  const x = manifest.matchups.find((m) => m.eraStyleId === c.era);
  const s = x[c.side];
  const team = teamFromSide(s, map);
  const refDef = refs.find((r) => r.era === c.era);
  const ref = referenceTeam({ era: c.era, five: refDef.five }, map);
  const coach = buildCoachIntelligence(s.coachId);
  console.log(`\n── ${c.label} · coach ${s.coachId}`);
  console.log(`  coach.offense: ${JSON.stringify(coach.offense)}`);
  const cap = (t, tag) => {
    const ps = t.playerIntelligence;
    const g = (f, sec = "offense") => ps.map((p) => p[sec]?.[f]).map((v) => v ?? "-").join(",");
    console.log(`  ${tag} postThreat [${g("postThreat")}] offBall [${g("offBallMovement")}] passing [${g("passingVision")}] selfCr [${g("selfCreation")}]`);
    console.log(`  ${tag} TI offense: postPlay ${t.teamIntelligence.offense?.postPlay} shotCreation ${t.teamIntelligence.offense?.shotCreation} passing ${t.teamIntelligence.offense?.passing} spacing ${JSON.stringify(t.teamIntelligence.offense?.spacing?.floorSpacing)}`);
    console.log(`  ${tag} TI rebounding: ${JSON.stringify(t.teamIntelligence.rebounding && {og:t.teamIntelligence.rebounding.offensiveGlass,dg:t.teamIntelligence.rebounding.defensiveGlass})}`);
    console.log(`  ${tag} TI defense: ${JSON.stringify(t.teamIntelligence.defense && {poa:t.teamIntelligence.defense.pointOfAttack,rim:t.teamIntelligence.defense.rimProtection,help:t.teamIntelligence.defense.helpDefense})}`);
  };
  cap(team, "SUBJ");
  cap(ref, " REF");
}
const neutral = buildCoachIntelligence("neutral");
console.log(`\nneutral coach.offense: ${JSON.stringify(neutral?.offense ?? "n/a")}`);
