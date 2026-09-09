#!/usr/bin/env node
// ── Project the compound verdict into this phase's artifact convention ──────
//   npm run exec:c3-compound
//
// The frozen command writes to the directory it was frozen with. This copies it
// to the phase directory and CROSS-CHECKS agreement; it recomputes no verdict.
// A disagreement is REPORT_GENERATION_FAILED and writes nothing.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { compoundVerdict } from "../validation/candidate2FormalVerdict.mjs";

const DIR = "data/validation/6c4c3";
const C2D = "data/validation/6c4c2";
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const src = readArtifact("candidate2-compound-formal-verdict", C2D).data;
  const v6 = readArtifact("historical-v6-formal-verdict", DIR).data;

  const problems = [];
  const agree = (n, a, b) => { if (a !== b) problems.push(`${n}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };
  // re-derive the verdict from the SAME state machine and the same stage inputs
  const rederived = compoundVerdict({
    s1: src.stages[0], s2: src.stages[1], identitySplit: src.identitySplit });
  agree("verdict vs state machine", src.verdict, rederived);
  agree("stage one verdict", src.stages[0].verdict, v6.formalVerdict);
  agree("stage one access count", src.stages[0].accessCount, setAccessCount("historical-holdout-v6"));
  agree("stage two access count", src.stages[1].accessCount, setAccessCount("synthetic-stress-holdout-v2"));
  agree("stage two opened", src.stages[1].ran, false);
  if (problems.length) {
    console.error("REPORT_GENERATION_FAILED — the projection disagrees with the formal artifact.\n");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(2);
  }

  writeArtifact("candidate2-compound-formal-verdict", {
    ...src,
    projectedFrom: `${C2D}/candidate2-compound-formal-verdict.json`,
    projectionNote: "the frozen command writes to the directory it was frozen with. Every field here is copied from that artifact; the verdict was re-derived from the same state machine and the same stage inputs and agreed.",
    agreementChecks: { performed: 5, disagreements: 0 },
    gamesSimulated: 0, sealsOpened: 0,
    accessCountsUnchangedByThisStage: { "historical-holdout-v6": setAccessCount("historical-holdout-v6"),
      "synthetic-stress-holdout-v2": setAccessCount("synthetic-stress-holdout-v2") },
    recordedAtCommit: git("rev-parse", "HEAD"),
  }, { generationCommand: "npm run exec:c3-compound", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`AGREEMENT: 5 cross-checks, 0 disagreements`);
  console.log(`  compound verdict  ${src.verdict}`);
  console.log(`  games simulated   0 · seals opened 0`);
  console.log(`  access counts     v6 ${setAccessCount("historical-holdout-v6")} · synthetic ${setAccessCount("synthetic-stress-holdout-v2")}`);
  process.exit(0);
}
