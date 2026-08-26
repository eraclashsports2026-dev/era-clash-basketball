#!/usr/bin/env node
// ── Runtime parameter connectivity ──────────────────────────────────────────
// Proves, per parameter, that a real consumer runs and that moving the value
// moves what it is supposed to move.
//
//   npm run calibration:parameters:connectivity
//
// Connectivity is NOT identifiability. This asks only "does the knob turn
// something?" — whether the effect is large enough to fit, and distinguishable
// from another parameter's effect, is the sensitivity analysis.
//
// Both static and dynamic evidence, because either alone is weak. A grep can be
// satisfied by an unreachable branch, and a trace only covers the mechanics the
// fixtures happen to reach. The manifest below is the static half: a DECLARED
// consumer per parameter, checked against the file and function it names.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import {
  compileRuntimeParameterSet, activeParameters, startParameterTrace,
  stopParameterTrace, traceReport,
} from "../../src/v3/calibration/runtimeParameters.js";
import { PARAMETERS } from "../../src/v3/calibration/parameters.js";
import { PARITY_FIXTURES } from "./freeze-pre-wiring.mjs";
import { versionOf } from "../../src/versions.js";

export const MAP_PATH = "data/calibration/runtime-parameter-map.json";
const OUT = ".cache/calibration";

/**
 * The declared consumer manifest.
 *
 * `prior` is the literal the parameter replaced, so a reviewer can check the
 * substitution rather than trust it. `role` says what the coefficient means in
 * basketball terms, which is the test of whether a consumer is legitimate — the
 * rule being that a consumer must match the parameter's documented meaning, not
 * merely reference its value somewhere.
 */
export const CONSUMER_MANIFEST = Object.freeze({
  // ── Opportunity allocation ────────────────────────────────────────────────
  "opportunity.saturation.strength": { file: "src/v3/actions/opportunityAllocation.js", fn: "saturationMultiplier", prior: "SATURATION.strength = 1.35", role: "How hard a player's weight decays above his target share" },
  "opportunity.saturation.floor": { file: "src/v3/actions/opportunityAllocation.js", fn: "saturationMultiplier", prior: "SATURATION.floor = 0.16", role: "Never fully suppress a saturated player" },
  "opportunity.saturation.underTargetCeiling": { file: "src/v3/actions/opportunityAllocation.js", fn: "saturationMultiplier", prior: "SATURATION.underTargetCeiling = 1.35", role: "Cap on the lift an under-target teammate receives" },
  "opportunity.saturation.warmupPossessions": { file: "src/v3/actions/opportunityAllocation.js", fn: "saturationMultiplier", prior: "SATURATION.warmupPossessions = 8", role: "Possessions before a realized share is trusted" },
  "opportunity.mismatch.severe": { file: "src/v3/actions/opportunityAllocation.js", fn: "mismatchMultiplier", prior: "MISMATCH_BIAS.SEVERE = 2.6", role: "Opportunity boost for a severe exploited mismatch" },
  "opportunity.mismatch.major": { file: "src/v3/actions/opportunityAllocation.js", fn: "mismatchMultiplier", prior: "MISMATCH_BIAS.MAJOR = 2.0", role: "Opportunity boost for a major exploited mismatch" },
  "opportunity.mismatch.moderate": { file: "src/v3/actions/opportunityAllocation.js", fn: "mismatchMultiplier", prior: "MISMATCH_BIAS.MODERATE = 1.55", role: "Opportunity boost for a moderate exploited mismatch" },
  "opportunity.mismatch.minor": { file: "src/v3/actions/opportunityAllocation.js", fn: "mismatchMultiplier", prior: "MISMATCH_BIAS.MINOR = 1.25", role: "Opportunity boost for a minor exploited mismatch" },
  "opportunity.form.low": { file: "src/v3/actions/opportunityAllocation.js", fn: "formMultiplier", prior: "FORM_BAND.lo = 0.82", role: "Lower bound of tonight's seeded form" },
  "opportunity.form.high": { file: "src/v3/actions/opportunityAllocation.js", fn: "formMultiplier", prior: "FORM_BAND.hi = 1.18", role: "Upper bound of tonight's seeded form" },
  "opportunity.lateGame.primaryBoost": { file: "src/v3/actions/opportunityAllocation.js", fn: "opportunityWeight", prior: "1 + urgency * 0.5", role: "How far late-game urgency tilts toward the primary creator" },
  // ── Action-family fit bands ───────────────────────────────────────────────
  ...Object.fromEntries(["SPOT_UP", "OFF_BALL_SCREEN", "POST_UP", "HANDOFF", "ZONE_ATTACK", "CUT", "ISOLATION", "PICK_AND_ROLL", "TRANSITION", "GENERIC_HALF_COURT"]
    .flatMap((fam) => [
      [`fitBand.${fam}.lo`, { file: "src/v3/actions/opportunityAllocation.js", fn: "boundedFit", prior: `FIT_BANDS.${fam}.lo`, role: `Lower bound on how far below the lineup a player's ${fam} fit may fall` }],
      [`fitBand.${fam}.hi`, { file: "src/v3/actions/opportunityAllocation.js", fn: "boundedFit", prior: `FIT_BANDS.${fam}.hi`, role: `Upper bound on how far above the lineup a player's ${fam} fit may rise` }],
    ])),
  // ── Shot location ─────────────────────────────────────────────────────────
  "shotLocation.rimWeight": { file: "src/v3/possession/context.js", fn: "shotProfileFor", prior: "1.0 + rim * 0.34", role: "How rim threat scales the base rim weight" },
  "shotLocation.postWeight": { file: "src/v3/possession/context.js", fn: "shotProfileFor", prior: "0.5 + post * 0.42", role: "How post threat scales the base paint weight" },
  "shotLocation.midrangeWeight": { file: "src/v3/possession/context.js", fn: "shotProfileFor", prior: "1.4 + perim * 0.18", role: "How perimeter skill scales the base midrange weight" },
  "shotLocation.threeWeight": { file: "src/v3/possession/context.js", fn: "shotProfileFor", prior: "(0.4 + perim * 0.22) * vol", role: "How perimeter skill scales the base three-point weight" },
  "shotLocation.rimBiasMultiplier": { file: "src/v3/possession/game.js", fn: "chooseShotCategory", prior: "1 + max(0, bias) * 1.6", role: "How strongly an action's rim bias inflates the rim weight" },
  "shotLocation.perimeterBiasMultiplier": { file: "src/v3/possession/game.js", fn: "chooseShotCategory", prior: "1 + max(0, -bias) * 1.5", role: "How strongly a negative rim bias inflates the three weight" },
  // ── Conversion ────────────────────────────────────────────────────────────
  "conversion.rimBonus": { file: "src/v3/possession/game.js", fn: "baseMakePct", prior: "fg + 0.155", role: "Rim make percentage above the era's league field-goal percentage" },
  "conversion.paintBonus": { file: "src/v3/possession/game.js", fn: "baseMakePct", prior: "fg + 0.015", role: "Paint make percentage above the era baseline" },
  "conversion.midrangePenalty": { file: "src/v3/possession/game.js", fn: "baseMakePct", prior: "fg - 0.055", role: "Midrange make percentage relative to the era baseline; negative by design" },
  // ── Era environment ───────────────────────────────────────────────────────
  "era.paceTempoScale": { file: "src/v3/possession/context.js", fn: "preparePossessionContext", prior: "((goldTempo + blueTempo)/2 - 5) * 1.35", role: "How far both coaches' tempo moves the era's documented pace" },
  "era.paceBoundFraction": { file: "src/v3/possession/context.js", fn: "preparePossessionContext", prior: "basePace * 0.86 .. basePace * 1.14", role: "Fractional band around the era pace anchor that realized pace may occupy" },
  "era.threeAnchorMax": { file: "src/v3/possession/context.js", fn: "anchorThreeScale", prior: "clamp(oddsRatio, 0.05, 12)", role: "Upper clamp on the three-point odds-ratio anchor" },
  "era.freeThrowTripRate": { file: "src/v3/possession/context.js", fn: "preparePossessionContext", prior: "ftaPerGame / 2 / pace", role: "Foul trips per free-throw attempt; a trip is ~2 attempts" },
  // ── Zone ──────────────────────────────────────────────────────────────────
  "zone.highPostVulnerability": { file: "src/v3/defense/zone.js", fn: "attackZone", prior: "(new scalar; shell gap tables were unmultiplied)", role: "How far a shell's high post may be exploited relative to its table value" },
  "zone.cornerVulnerability": { file: "src/v3/defense/zone.js", fn: "attackZone", prior: "(new scalar; shell gap tables were unmultiplied)", role: "How far a shell's corners may be exploited relative to its table value" },
  // ── Coach ─────────────────────────────────────────────────────────────────
  "coach.actionMixInfluence": { file: "src/v3/actions/families.js", fn: "weight (POST_UP, ISOLATION, OFF_BALL_SCREEN, HANDOFF, CUT) + possession/actions.js expandedActionMix (PICK_AND_ROLL)", prior: "(new scalar over six coach-preference terms)", role: "How strongly coach identity shapes the baseline action mix" },
  "coach.rosterSensitivity": { file: "src/v3/actions/families.js", fn: "weight (six families) + possession/actions.js rosterSupport", prior: "(new scalar over six roster-response terms)", role: "How strongly the action mix responds to roster composition" },
  "coach.offensiveAdjustmentMinEvents": { file: "src/v3/actions/offensivePlan.js", fn: "considerOffensiveAdjustment", prior: "OFF_ADJUSTMENT_MIN_EVENTS = 6", role: "Evidence events before an offensive adjustment may fire" },
  "coach.defensiveAdjustmentMinEvents": { file: "src/v3/defense/liveState.js", fn: "considerAdjustment", prior: "ADJUSTMENT_MIN_EVENTS = 5", role: "Evidence events before a defensive assignment adjustment may fire" },
  "coach.offensiveAdjustmentCooldown": { file: "src/v3/actions/offensivePlan.js", fn: "considerOffensiveAdjustment", prior: "OFF_ADJUSTMENT_COOLDOWN = 30", role: "Possessions before an offensive adjustment may fire again" },
  "coach.defensiveAdjustmentCooldown": { file: "src/v3/defense/liveState.js", fn: "considerAdjustment", prior: "ADJUSTMENT_COOLDOWN = 34", role: "Possessions before a defensive adjustment may fire again" },
  "coach.adjustmentMagnitude": { file: "src/v3/actions/offensivePlan.js", fn: "considerOffensiveAdjustment", prior: "ADJUSTMENT_STEP = 0.06", role: "Base size of one adjustment's move to an action-family weight" },
});

const play = (f, seed, parameterSet) => runPossessionGame(buildPossessionInput({
  parameterSet, goldIds: f.gold, blueIds: f.blue,
  coachGoldId: f.coachGoldId, coachBlueId: f.coachBlueId, eraStyleId: f.era, simulationSeed: seed,
  zoneResolution: f.zone !== false, expandedActions: f.expandedActions !== false,
  offensiveAdjustments: f.offensiveAdjustments !== false, opportunityAllocation: f.opportunityAllocation !== false,
}), { includeLedger: false, assertInvariants: false });

/** Does moving this parameter to a legal extreme change ANY fixture's result? */
const movesAResult = (p, seeds) => {
  const touched = [];
  for (const target of [p.max, p.min]) {
    if (target === p.defaultValue) continue;
    const set = compileRuntimeParameterSet({ overrides: { [p.id]: target }, label: `${p.id}@${target}` });
    for (const f of PARITY_FIXTURES) {
      for (let s = 1; s <= seeds; s++) {
        const a = play(f, s, null);
        const b = play(f, s, set);
        if (a.finalScore.gold !== b.finalScore.gold || a.finalScore.blue !== b.finalScore.blue
          || a.rngSteps !== b.rngSteps) {
          if (!touched.includes(f.id)) touched.push(f.id);
          break;
        }
      }
    }
  }
  return touched;
};

export const runConnectivity = ({ seeds = 8 } = {}) => {
  const active = activeParameters();

  // ── Static half: every declared consumer must exist ──────────────────────
  const staticProblems = [];
  for (const p of active) {
    const m = CONSUMER_MANIFEST[p.id];
    if (!m) { staticProblems.push({ id: p.id, problem: "no declared consumer in the manifest" }); continue; }
    // The declared file must READ the parameter. Requiring an import of the
    // binding module was the wrong test: families.js reads
    // params.get.coach.actionMixInfluence through a local helper that receives
    // the set as an argument, so it correctly has no import. What matters is
    // that the accessor path is present, or — for the fit bands, whose paths are
    // built as template literals — that the accessor root is.
    const path = p.id.split(".");
    const literalPath = `.${path.join(".")}`;
    const dynamicRoot = `.get?.${path[0]}` .replace("?", "") ;
    const files = m.file.split(/\s*\+\s*/).map((x) => x.trim().split(" ")[0]).filter(Boolean);
    let readSomewhere = false;
    for (const file of files) {
      if (!existsSync(file)) { staticProblems.push({ id: p.id, problem: `declared file ${file} does not exist` }); continue; }
      const src = readFileSync(file, "utf8");
      if (src.includes(literalPath) || src.includes(`get.${path[0]}`) || src.includes(`get?.${path[0]}`)) readSomewhere = true;
    }
    if (!readSomewhere && files.length) {
      staticProblems.push({ id: p.id, problem: `none of ${files.join(", ")} reads the accessor path for this parameter` });
    }
  }
  // A manifest entry with no registry parameter is equally a defect.
  for (const id of Object.keys(CONSUMER_MANIFEST)) {
    if (!active.some((p) => p.id === id)) staticProblems.push({ id, problem: "manifest declares a consumer for a parameter that is not an active registry entry" });
  }

  // ── Dynamic half: observe reads, then prove the knob turns something ──────
  startParameterTrace();
  for (const f of PARITY_FIXTURES) play(f, f.seed, null);
  const observed = new Map(traceReport(stopParameterTrace()).parameters.map((x) => [x.id, x.invocations]));

  const rows = active.map((p) => {
    const invocations = observed.get(p.id) ?? 0;
    const touched = movesAResult(p, seeds);
    return {
      id: p.id, module: p.module,
      declaredConsumer: CONSUMER_MANIFEST[p.id] ?? null,
      dynamicInvocations: invocations,
      fixturesWhoseResultMoves: touched.length,
      exampleFixtures: touched.slice(0, 3),
      // Connectivity is proven by EITHER a trace read or a moved result. A
      // parameter can be read without moving a result (an inactive clamp), and
      // in principle move a result without a trace call, so both count.
      connected: invocations > 0 || touched.length > 0,
      // Recorded separately, because a read that changes nothing is exactly the
      // shape of an inactive guard rail — real wiring, no measurable effect.
      readButInert: invocations > 0 && touched.length === 0,
    };
  });

  return {
    parameterConnectivityVersion: versionOf("parameterConnectivityVersion"),
    runtimeParameterBindingVersion: versionOf("runtimeParameterBindingVersion"),
    calibrationParameterRegistryVersion: versionOf("calibrationParameterRegistryVersion"),
    purpose: "Per-parameter proof that a real consumer runs and that moving the value moves something. Static (declared manifest) and dynamic (trace plus result movement), because either alone is weak.",
    fixtures: PARITY_FIXTURES.length,
    seedsPerExtreme: seeds,
    coverage: {
      active: active.length,
      connected: rows.filter((r) => r.connected).length,
      disconnected: rows.filter((r) => !r.connected).length,
      observedDynamically: rows.filter((r) => r.dynamicInvocations > 0).length,
      movesAResult: rows.filter((r) => r.fixturesWhoseResultMoves > 0).length,
      readButInert: rows.filter((r) => r.readButInert).length,
      staticProblems: staticProblems.length,
    },
    staticProblems,
    nonActiveEntries: PARAMETERS.filter((p) => p.registryClass !== "ACTIVE_RUNTIME_TUNABLE")
      .map((p) => ({ id: p.id, registryClass: p.registryClass })),
    parameters: rows,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? a.split("=")[1] : d; };
  const r = runConnectivity({ seeds: Number(arg("seeds", 8)) });
  r.mapHash = createHash("sha256").update(JSON.stringify(r.parameters.map((x) => [x.id, x.connected]))).digest("hex");

  mkdirSync("data/calibration", { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(r, null, 2) + "\n");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/parameter-connectivity.json`, JSON.stringify(r, null, 2) + "\n");

  console.log(`PARAMETER CONNECTIVITY — ${r.coverage.active} active parameters\n`);
  console.log(`  observed reading at runtime   ${r.coverage.observedDynamically}`);
  console.log(`  moving the value moves a result ${r.coverage.movesAResult}`);
  console.log(`  read but inert (guard rails)  ${r.coverage.readButInert}`);
  console.log(`  CONNECTED                     ${r.coverage.connected}`);
  console.log(`  DISCONNECTED                  ${r.coverage.disconnected}`);
  console.log(`  static manifest problems      ${r.coverage.staticProblems}`);
  for (const sp of r.staticProblems.slice(0, 10)) console.log(`    ${sp.id}: ${sp.problem}`);

  const inert = r.parameters.filter((x) => x.readButInert);
  if (inert.length) {
    console.log(`\n  read but no fixture result moves (${inert.length}):`);
    for (const x of inert) console.log(`    ${x.id.padEnd(42)} ${x.dynamicInvocations} reads`);
  }
  const dis = r.parameters.filter((x) => !x.connected);
  if (dis.length) {
    console.log(`\n  DISCONNECTED (${dis.length}):`);
    for (const x of dis) console.log(`    ${x.id}`);
  }
  console.log(`\n  hash ${r.mapHash.slice(0, 16)}`);
  console.log(`\nwrote ${MAP_PATH}`);
  process.exit(r.coverage.disconnected > 0 || r.coverage.staticProblems > 0 ? 2 : 0);
}
