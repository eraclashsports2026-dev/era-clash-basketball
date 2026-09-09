#!/usr/bin/env node
// ── Phase 6C4A WS4: movement & coach-saturation repair — acceptance gate ────
//   npm run c1:movement-repair       (~3 minutes)
//
// The repair (Candidate 1 draft) made three engine changes, each tied to a
// root-caused defect:
//   1. movement/isolation eligibility: binary canSelect gates became a low
//      floor + continuous taper (ELIGIBILITY_STARVATION, v4f-09)
//   2. adapter offBallMovement: era-honest inputs, not a three-point grade
//   3. zone use: per-possession and continuous in the coach's zone scale,
//      replacing the per-game 0%-or-100% step (saturation class)
//
// This gate REFUSES the repair unless all of the brief's conditions hold:
// nonzero reachability, coach differentiation, roster sensitivity, no
// efficiency guarantee, no era flattening.
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { isMovementFamilyAction, MOVEMENT_FAMILY_ACTIONS } from "../../src/v3/actions/families.js";
import { loadCorpusV4 } from "../validation/buildCorpusV4.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { loadReferences, referenceTeam } from "../validation/eraReferences.mjs";
import { teamFromFixture } from "../validation/evalV4.mjs";
import { playPairedSamples, summarise, diffSummary } from "../validation/surface.mjs";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { buildTeamInput } from "../../src/v3/possession/testContext.js";
import { c1Seed } from "./rootCause.mjs";
import { DIR } from "./failureRegister.mjs";

const coachSwap = (team, coachId) => ({ ...team, coachId, coachIntelligence: buildCoachIntelligence(coachId) });

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000);
  const profiles = await buildRunnerProfileMap();
  const corpus = loadCorpusV4();
  const refs = loadReferences().data.references;
  const fx = (id) => corpus.fixtures.find((f) => f.fixtureId === id);
  const refFor = (era) => { const d = refs.find((r) => r.era === era); return referenceTeam({ era: d.era, five: d.five }, profiles); };
  const cell = (label, subject, opponent, era, offset, metrics, p = pairs) => {
    const run = playPairedSamples({ subject, opponent, eraStyleId: era, seedAt: (i) => c1Seed("movement", 900000 + offset + i), pairs: p });
    const out = { label, games: run.games };
    for (const m of metrics) out[m] = summarise(run.samples, m);
    console.log(`  ${label.padEnd(46)} ${metrics.map((m) => `${m} ${out[m].mean}`).join(" · ")}`);
    return out;
  };
  const gates = {}; const failed = [];
  const gate = (name, pass) => { gates[name] = pass; if (!pass) failed.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n`); };

  console.log("1 — REACHABILITY: every V4 diagnostic fixture and era reference\n");
  const reach = [];
  for (const fid of ["v4-1991-92-bulls", "v4-1977-78-spurs", "v4-1978-79-supersonics", "v4-1989-90-pistons"]) {
    const f = fx(fid);
    reach.push(cell(fid, teamFromFixture(f, profiles), refFor(f.eraStyleId), f.eraStyleId, reach.length * 20000, ["movementShare"], 400));
  }
  const eraCells = [];
  for (const [i, r] of refs.entries()) {
    const ref = refFor(r.era);
    eraCells.push({ era: r.era, ...cell(`reference-${r.era}`, ref, ref, r.era, 100000 + i * 20000, ["movementShare", "isolationShare"], 400) });
  }
  gate("nonzeroReachabilityEverywhere", [...reach, ...eraCells].every((c) => c.movementShare.mean > 0.02));

  console.log("2 — COACH DIFFERENTIATION on one fixed roster (Bulls 1991-92)\n");
  const bulls = teamFromFixture(fx("v4-1991-92-bulls"), profiles);
  const ref90 = refFor("1990s");
  const cJack = cell("phil-jackson (motion 9)", bulls, ref90, "1990s", 300000, ["movementShare", "ppp"]);
  const cNeut = cell("neutral (motion 5)", coachSwap(bulls, "neutral"), ref90, "1990s", 320000, ["movementShare", "ppp"]);
  // lowest combined movement toolkit (cut+handoff+offBall) in the coach set —
  // "motion" alone is not the lever; handoffs ride on insideOut too
  const cLow = cell("mike-dantoni (movement toolkit min)", coachSwap(bulls, "mike-dantoni"), ref90, "1990s", 340000, ["movementShare", "ppp"]);
  const dHighNeut = diffSummary(cJack.movementShare, cNeut.movementShare);
  const dNeutLow = diffSummary(cNeut.movementShare, cLow.movementShare);
  gate("coachDifferentiation", dHighNeut.diff > 0 && dHighNeut.significant && dNeutLow.diff > 0 && dNeutLow.significant);

  console.log("3 — ROSTER SENSITIVITY under one fixed coach (neutral)\n");
  const sonics = teamFromFixture(fx("v4-1978-79-supersonics"), profiles);
  const rBulls = cell("bulls five (better movers)", coachSwap(bulls, "neutral"), ref90, "1990s", 360000, ["movementShare"]);
  const rSonics = cell("sonics five (weaker movers)", coachSwap(sonics, "neutral"), refFor("1970s"), "1970s", 380000, ["movementShare"]);
  const dRoster = diffSummary(rBulls.movementShare, rSonics.movementShare);
  gate("rosterSensitivity", dRoster.diff > 0 && dRoster.significant);

  console.log("4 — NO EFFICIENCY GUARANTEE: max motion on a weak-mover roster\n");
  const eNeut = cell("sonics x neutral", coachSwap(sonics, "neutral"), refFor("1970s"), "1970s", 400000, ["movementShare", "ppp"]);
  const eMoe = cell("sonics x doug-moe (motion 10)", coachSwap(sonics, "doug-moe"), refFor("1970s"), "1970s", 420000, ["movementShare", "ppp"]);
  const dEff = diffSummary(eMoe.ppp, eNeut.ppp);
  const dShare = diffSummary(eMoe.movementShare, eNeut.movementShare);
  gate("noEfficiencyGuarantee", dShare.diff > 0.01 && dEff.diff < 0.02);

  console.log("5 — NO ERA FLATTENING: reference movement shares still differ across eras\n");
  const shares = eraCells.map((c) => c.movementShare.mean);
  const spread = Math.max(...shares) - Math.min(...shares);
  console.log(`  era movement spread ${spread.toFixed(4)} (${eraCells.map((c) => `${c.era}:${c.movementShare.mean}`).join(" ")})\n`);
  gate("noEraFlattening", spread > 0.02);

  console.log("6 — ISOLATION FLOOR: a median five under a neutral coach can isolate\n");
  gate("isolationReachableAtNeutral", eraCells.every((c) => c.isolationShare.mean > 0));

  console.log("7 — ZONE CONTINUITY: zone share graded in the coach scale, never 0/1 step\n");
  // Public-card rosters: the 0%-or-100% step was recorded on public cards
  // (6C3R observability), and zone shells are personnel-gated — calibration
  // fives cannot reach them until the WS6 defensive-input decompression, so
  // measuring continuity there would measure reachability instead.
  const PUB_OFF = ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"];
  const PUB_DEF = ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"];
  const zCells = [];
  for (const [i, cid] of ["erik-spoelstra", "rick-carlisle", "neutral", "jerry-sloan"].entries()) {
    // the COACHED team is the subject: defensiveZoneShare reads the subject's own defence
    zCells.push({ coachId: cid, ...cell(`defence coached by ${cid}`, buildTeamInput(PUB_DEF, cid), buildTeamInput(PUB_OFF, "neutral"), "2010s", 500000 + i * 20000, ["defensiveZoneShare"]) });
  }
  const z = zCells.map((c) => c.defensiveZoneShare.mean);
  gate("zoneContinuity", z[0] > z[1] && z[1] > z[2] && z[2] >= z[3] && z[0] < 0.9 && z[0] > 0.2 && z[2] < 0.2);

  const payload = {
    movementFamily: MOVEMENT_FAMILY_ACTIONS, helper: "isMovementFamilyAction (src/v3/actions/families.js)",
    helperSelfTest: MOVEMENT_FAMILY_ACTIONS.every(isMovementFamilyAction) && !isMovementFamilyAction("POST_UP"),
    pairsPerCell: pairs, gates, failedGates: failed, pass: failed.length === 0,
    reachability: { fixtures: reach, eraReferences: eraCells },
    coachDifferentiation: { cells: [cJack, cNeut, cLow], highVsNeutral: dHighNeut, neutralVsLow: dNeutLow },
    rosterSensitivity: { cells: [rBulls, rSonics], diff: dRoster },
    noEfficiencyGuarantee: { cells: [eNeut, eMoe], shareDiff: dShare, pppDiff: dEff,
      reading: "forcing maximum motion preference onto a weak-mover roster raises the SHARE modestly and buys no material efficiency — the lever is the mix, never the outcome" },
    eraSpread: { spread, perEra: Object.fromEntries(eraCells.map((c) => [c.era, c.movementShare.mean])) },
    zoneContinuity: { cells: zCells, reading: "zone share is graded in the coach zone scale; the per-game 0%-or-100% step is gone" },
  };
  writeArtifact("candidate1-movement-repair", payload, { generationCommand: "npm run c1:movement-repair", dir: DIR,
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash } });
  console.log(`\nMOVEMENT REPAIR GATE: ${payload.pass ? "PASS" : `FAIL (${failed.join(", ")})`}`);
  process.exit(payload.pass ? 0 : 2);
}
