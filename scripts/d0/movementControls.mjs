#!/usr/bin/env node
// ── WS11 Step 1/4: coach movement-intent transfer, on non-V6 controls ───────
//   npm run d0:movement-controls [-- --pairs=1000 --tag=candidate2]
// Mirror design: the SAME five plays itself; only the subject coach varies.
// Any movementShare difference is therefore attributable to coach intent alone.
import { readFileSync } from "node:fs";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { teamFromFixture, playSurface } from "../validation/evalV4.mjs";
import { summarise, METRICS } from "../validation/surface.mjs";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import COACHES from "../../src/v3/data/coaches.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { versionOf } from "../../src/versions.js";
import { historicalCalibrationV3Ids } from "../../data/calibration/sets-v3.mjs";
import { DIR, r2, r5 } from "./paths.mjs";

const CONTROL_MASTER = 0x6c4d01;   // preparation-only stream, disjoint by master

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const pairs = Number(arg("pairs", 1000));
  const tag = arg("tag", "candidate2");
  const def = defaultRuntimeParameterSet();
  const map = await buildRunnerProfileMap();
  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const calIds = new Set(historicalCalibrationV3Ids());
  const fixtures = corpus.fixtures.filter((f) => calIds.has(f.fixtureId));

  // deterministic roster picks by max off-ball mover
  const scored = fixtures.map((f) => {
    const movers = f.players.map((p) => buildCalibrationPlayerProfile(map.get(p.calibrationPlayerId)).offense.offBallMovement);
    return { f, maxMover: Math.max(...movers) };
  }).sort((a, b) => a.maxMover - b.maxMover || a.f.fixtureId.localeCompare(b.f.fixtureId));
  const low = scored[0];
  const modest = scored[Math.floor(scored.length / 2)];
  const strong = scored[scored.length - 1];

  // deterministic coach picks by documented motion intent
  const byMotion = COACHES.coaches.map((c) => ({ id: c.id, motion: buildCoachIntelligence(c.id).offense?.motion ?? 5 }))
    .sort((a, b) => b.motion - a.motion || a.id.localeCompare(b.id));
  const hi = byMotion[0]; const lo = byMotion[byMotion.length - 1];

  const CELLS = [
    { cell: "low+highMotion", fx: low.f, coach: hi.id },
    { cell: "low+neutral", fx: low.f, coach: "neutral" },
    { cell: "low+lowMotion", fx: low.f, coach: lo.id },
    { cell: "modest+highMotion", fx: modest.f, coach: hi.id },
    { cell: "modest+neutral", fx: modest.f, coach: "neutral" },
    { cell: "modest+lowMotion", fx: modest.f, coach: lo.id },
    { cell: "strong+highMotion", fx: strong.f, coach: hi.id },
    { cell: "strong+neutral", fx: strong.f, coach: "neutral" },
  ];
  console.log(`MOVEMENT INTENT-TRANSFER CONTROLS (${tag}) — mirror design, ${pairs * 2} games per cell`);
  console.log(`  low roster ${low.f.fixtureId} (max mover ${low.maxMover}) · modest ${modest.f.fixtureId} (${modest.maxMover}) · strong ${strong.f.fixtureId} (${strong.maxMover})`);
  console.log(`  high-motion coach ${hi.id} (motion ${hi.motion}) · low-motion ${lo.id} (motion ${lo.motion})\n`);

  const rows = [];
  for (const [i, c] of CELLS.entries()) {
    const subject = teamFromFixture({ ...c.fx, coachId: c.coach }, map);
    const opponent = teamFromFixture({ ...c.fx, coachId: "neutral" }, map);
    const run = playSurface({ subject, opponent, eraStyleId: c.fx.eraStyleId,
      seedAt: (k) => deriveSeed(CONTROL_MASTER, i * 300000 + k), pairs });
    const mv = summarise(run.samples, METRICS.movementShare.field);
    const iso = summarise(run.samples, METRICS.isolationShare.field);
    rows.push({ ...c, fixtureId: c.fx.fixtureId, era: c.fx.eraStyleId,
      movementShare: r5(mv.mean), movementSe: r5(mv.se ?? (mv.sd / Math.sqrt(mv.n))),
      isolationShare: r5(iso.mean), invariants: run.invariantViolations, games: run.games });
    console.log(`  ${c.cell.padEnd(20)} movementShare ${String(r5(mv.mean)).padEnd(8)} iso ${String(r5(iso.mean)).padEnd(8)} inv ${run.invariantViolations}`);
  }
  const g = (cell) => rows.find((r) => r.cell === cell);
  const summary = {
    lowCoachDelta: r5(g("low+highMotion").movementShare - g("low+neutral").movementShare),
    lowLowDelta: r5(g("low+lowMotion").movementShare - g("low+neutral").movementShare),
    modestCoachDelta: r5(g("modest+highMotion").movementShare - g("modest+neutral").movementShare),
    modestLowDelta: r5(g("modest+lowMotion").movementShare - g("modest+neutral").movementShare),
    strongCoachDelta: r5(g("strong+highMotion").movementShare - g("strong+neutral").movementShare),
    orderingHolds: g("modest+lowMotion").movementShare < g("modest+neutral").movementShare
      && g("modest+neutral").movementShare < g("modest+highMotion").movementShare,
  };
  console.log(`\n  LOW-roster coach delta (high − neutral):    ${summary.lowCoachDelta}`);
  console.log(`  modest-roster coach delta (high − neutral): ${summary.modestCoachDelta}`);
  console.log(`  modest-roster low-motion delta:              ${summary.modestLowDelta}`);
  console.log(`  strong-roster coach delta:                   ${summary.strongCoachDelta}`);
  writeArtifact(`movement-intent-controls-${tag}`, {
    movementIntentControlVersion: "1.0.0", engine: { tag, possessionCalibrationVersion: versionOf("possessionCalibrationVersion") },
    design: "mirror — same five both sides, subject coach varies, opponent always neutral. Attribution is coach intent alone.",
    pairs, cells: rows, summary,
  }, { generationCommand: "npm run d0:movement-controls", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  process.exit(0);
}
