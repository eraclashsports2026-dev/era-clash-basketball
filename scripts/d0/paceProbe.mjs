#!/usr/bin/env node
import { readArtifact } from "../../src/v3/calibration/artifacts.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { referenceTeam, loadReferences } from "../validation/eraReferences.mjs";
import { teamFromSide } from "../candidate3/remeasure.mjs";
import { playSurface } from "../validation/evalV4.mjs";
import { v6SurfaceSeed } from "../v6/seeds.mjs";
import { C2D, r2 } from "./paths.mjs";

const map = await buildRunnerProfileMap();
const manifest = readArtifact("historical-holdout-v6-manifest", C2D).data;
const refs = loadReferences().data.references;
const x = manifest.matchups.find((m) => m.eraStyleId === "2000s");
const hou = teamFromSide(x.teamB, map);
const refDef = refs.find((r) => r.era === "2000s");
const mk = () => referenceTeam({ era: "2000s", five: refDef.five }, map);
const stats = (run, tag) => {
  const s = run.samples;
  const mean = (f) => r2(s.reduce((a, x2) => a + (f(x2) ?? 0), 0) / s.length);
  const poss = s.map((g) => g.possessions).sort((a, b) => a - b);
  const q = (f) => poss[Math.floor(f * (poss.length - 1))];
  const otish = poss.filter((x2) => x2 > q(0.5) + 6).length;
  console.log(`${tag}: poss mean ${mean((g) => g.possessions)} p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)} · games >p50+6 (OT-ish): ${otish}/${poss.length} · transition ${mean((g) => g.transitionShare)}`);
};
const A = playSurface({ subject: hou, opponent: mk(), eraStyleId: "2000s", seedAt: (k) => v6SurfaceSeed({ tier: 1, matchupIndex: 0, surfaceIndex: 0, pairIndex: k }), pairs: 256 });
stats(A, "HOU vs REF");
const B = playSurface({ subject: mk(), opponent: mk(), eraStyleId: "2000s", seedAt: (k) => v6SurfaceSeed({ tier: 1, matchupIndex: 1, surfaceIndex: 0, pairIndex: k }), pairs: 256 });
stats(B, "REF vs REF");
