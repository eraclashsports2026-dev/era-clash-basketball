#!/usr/bin/env node
// SA movement counterfactual: same roster vs the same reference, coach varied.
// If the coach lever moves movementShare by more than the practical margin, the
// intent-transfer mechanism works; any residual deficit is reference geometry.
import { readArtifact, writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { referenceTeam, loadReferences } from "../validation/eraReferences.mjs";
import { teamFromSide } from "../candidate3/remeasure.mjs";
import { playSurface } from "../validation/evalV4.mjs";
import { summarise, METRICS } from "../validation/surface.mjs";
import { deriveSeed } from "../../src/v3/seed.js";
import { NEUTRAL_COACH } from "../../src/v3/coaches.js";
import { DIR, C2D, r5 } from "./paths.mjs";

const M = 0x6c4d02;
const def = defaultRuntimeParameterSet();
const map = await buildRunnerProfileMap();
const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
const x = manifest.matchups.find((m) => m.eraStyleId === "2020s");
const refDef = loadReferences().data.references.find((r) => r.era === "2020s");
const mkRef = () => referenceTeam({ era: "2020s", five: refDef.five }, map);
const cells = [];
for (const coach of ["gregg-popovich", "neutral", "rudy-tomjanovich"]) {
  const subj = teamFromSide({ ...x.teamB, coachId: coach === "neutral" ? x.teamB.coachId : coach }, map);
  if (coach === "neutral") { subj.coachId = "neutral"; subj.coachRecord = NEUTRAL_COACH; delete subj.coachIntelligence; }
  let run;
  try {
    run = playSurface({ subject: subj, opponent: mkRef(), eraStyleId: "2020s",
      seedAt: (k) => deriveSeed(M, coach.length * 1e6 + k), pairs: 1024 });
  } catch (e) { console.log(`  CELL FAILED: ${coach}: ${e.message}`); throw e; }
  const mv = summarise(run.samples, METRICS.movementShare.field);
  cells.push({ coach, movementShare: r5(mv.mean) });
  console.log(`  SA + ${coach.padEnd(16)} movementShare ${r5(mv.mean)}`);
}
const refRun = playSurface({ subject: mkRef(), opponent: mkRef(), eraStyleId: "2020s",
  seedAt: (k) => deriveSeed(M, 9e6 + k), pairs: 1024 });
const base = r5(summarise(refRun.samples, METRICS.movementShare.field).mean);
console.log(`  reference self-baseline           ${base}`);
const pop = cells[0].movementShare, neu = cells[1].movementShare, low = cells[2].movementShare;
const out = { cells, referenceBaseline: base,
  coachLever: r5(pop - neu), lowMotionLever: r5(low - neu),
  rosterGapAtNeutral: r5(neu - base), residualAtPopovich: r5(pop - base),
  margin: 0.03,
  verdict: (pop - neu) > 0.03
    ? "the coach lever exceeds the practical margin on this exact roster — intent transfer works; the residual deficit is the reference five out-personnelling the subject on the movement axis"
    : "the coach lever is below the margin — a genuine engine limitation remains" };
console.log(`\n  coach lever (popovich − neutral): ${out.coachLever} · roster gap at neutral: ${out.rosterGapAtNeutral} · residual: ${out.residualAtPopovich}`);
console.log(`  ${out.verdict}`);
writeArtifact("sa-movement-counterfactual", { saMovementCounterfactualVersion: "1.0.0", ...out },
  { generationCommand: "node scripts/d0/saCounterfactual.mjs", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
