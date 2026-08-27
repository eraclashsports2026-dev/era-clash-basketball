#!/usr/bin/env node
// Historical-calibration share MAE under Candidate 3, vs the frozen internal baseline.
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { teamFromFixture, playSurface, shareMae } from "../validation/evalV4.mjs";
import { referenceTeam, loadReferences } from "../validation/eraReferences.mjs";
import { historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { deriveSeed } from "../../src/v3/seed.js";
import { DIR, C2D, r5 } from "./paths.mjs";

const def = defaultRuntimeParameterSet();
const map = await buildRunnerProfileMap();
const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
const targets = JSON.parse(readFileSync("data/calibration/historical-targets-v3.json", "utf8")).records;
const refs = loadReferences().data.references;
const ids = historicalCalibrationV3Ids();
const maes = [];
for (const [i, id] of ids.entries()) {
  const fx = corpus.fixtures.find((f) => f.fixtureId === id);
  const refDef = refs.find((r) => r.era === fx.eraStyleId);
  const run = playSurface({ subject: teamFromFixture(fx, map),
    opponent: referenceTeam({ era: fx.eraStyleId, five: refDef.five }, map),
    eraStyleId: fx.eraStyleId, seedAt: (k) => deriveSeed(0x6c4d03, i * 100000 + k), pairs: 256 });
  const t = targets.find((r) => r.fixtureId === id);
  const m = shareMae({ fixture: fx, target: t, profiles: map, games: run.subjectBoxes });
  maes.push({ fixtureId: id, era: fx.eraStyleId, compositeMae: m.compositeMae, inv: run.invariantViolations });
}
const mean = r5(maes.reduce((a, x) => a + (x.compositeMae ?? 0), 0) / maes.length);
const baseline = readArtifact("historical-v6-verdict-policy", C2D).data.numericGates.compositeShareMae.internalBaselineMean;
const limit = r5(baseline * 1.15);
console.log(`share MAE under Candidate 3 (enriched profiles): mean ${mean} · frozen internal baseline ${baseline} · regression limit ${limit}`);
console.log(`  ${mean <= limit ? "PASS" : "FAIL"} · invariants ${maes.reduce((a, x) => a + x.inv, 0)}`);
writeArtifact("candidate3-share-protection", { candidate3ShareProtectionVersion: "1.0.0",
  fixtures: maes.length, meanCompositeShareMae: mean, internalBaselineMean: baseline,
  regressionLimit: limit, pass: mean <= limit, perFixture: maes,
}, { generationCommand: "node scripts/d0/shareMae.mjs", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
process.exit(mean <= limit ? 0 : 2);
