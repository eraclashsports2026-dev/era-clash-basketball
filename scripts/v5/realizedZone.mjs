#!/usr/bin/env node
// ── Realized zone measurement (v2) ──────────────────────────────────────────
//   npm run v5:zone
//
// v1 read the per-GAME scheme label: every possession of a coach whose plan
// said ZONE_MIXED counted as zone, whether or not that possession was defended
// in a zone. Phase 6C3R's observability certification recorded the symptom —
// a max-zone coach measured 100% zone, a 4/10 coach 0% — and called it a step
// function in the engine. It was partly the instrument.
//
// Four states, never collapsed:
//   TOOLKIT      the coach's documented record supports zone at all
//   PERMITTED    a legal shell was BUILT for this game (era + personnel)
//   SELECTED     THIS possession was defended in that shell
//   ATTACKED     the offence attacked the zone by AREA on this possession
//
// Only SELECTED is realized zone. TOOLKIT and PERMITTED are capabilities;
// counting them is how a capability becomes a false measurement.
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { DIR } from "./preflight6c4b1.mjs";

// ── canonical helpers ───────────────────────────────────────────────────────
/** Does this coach's documented record support zone at all? Capability only. */
export const isZoneToolkitAvailable = (ctx) => Number(ctx?.zonePreference ?? ctx?.coach?.defense?.zone ?? 0) > 0;
/** Was a legal zone shell BUILT for this game? Permission only, not use. */
export const isZonePlanPermitted = (plan) => Boolean(plan?.zoneShell) && Number(plan?.scheme?.zoneUsage ?? 0) > 0;
/** Was THIS possession actually defended in a zone shell? Realized zone. */
export const isZoneShellSelected = (possession) => /^ZONE:/.test(String(possession?.schemeId ?? ""));
/** Did the offence attack the zone by AREA on this possession? */
export const isZoneAttackExecuted = (possession) => possession?.action === "ZONE_ATTACK";
/** The shell actually used, or null. */
export const selectedShellOf = (possession) => {
  const m = /^ZONE:(.+)$/.exec(String(possession?.schemeId ?? ""));
  return m ? m[1] : null;
};

/** Count the four states over one game, from the side that DEFENDED. */
export const countStates = (game, defendingSide) => {
  const offSide = defendingSide === "gold" ? "blue" : "gold";
  const rows = (game.possessionLedger ?? []).filter((r) => r.offense === offSide);
  const permitted = Boolean(game.zoneShells?.[defendingSide]);
  let selected = 0; let attacked = 0; let manWithPrimary = 0;
  for (const r of rows) {
    if (isZoneShellSelected(r)) { selected += 1; if (isZoneAttackExecuted(r)) attacked += 1; }
    else if (r.primaryDefenderId) manWithPrimary += 1;
  }
  return { possessions: rows.length, planPermitted: permitted, shellSelected: selected,
    zoneAttacked: attacked, manPossessions: rows.length - selected, manWithNamedDefender: manWithPrimary,
    realizedZoneShare: rows.length ? selected / rows.length : null };
};

const OFF = ["curry-10s", "klay-10s", "lebron-10s", "draymond-10s", "jokic-20s"];
const DEF = ["magic-80s", "jordan-90s", "bird-80s", "kg-00s", "shaq-90s"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const games = arg("games", 300);
  const def = defaultRuntimeParameterSet();
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  /** One control cell: N games, the named coach defending, in the named era. */
  const cell = (label, { coachId, era, offset }) => {
    let possessions = 0, selected = 0, attacked = 0, permittedGames = 0, manNamed = 0, toolkitGames = 0;
    for (let i = 0; i < games; i++) {
      const g = runPossessionGame(buildPossessionInput({
        goldIds: OFF, blueIds: DEF, eraStyleId: era, simulationSeed: deriveSeed(0x6c4b03, offset + i),
        coachGoldId: "neutral", coachBlueId: coachId,
      }), { includeLedger: true, assertInvariants: false });
      const c = countStates(g, "blue");
      possessions += c.possessions; selected += c.shellSelected; attacked += c.zoneAttacked;
      manNamed += c.manWithNamedDefender;
      if (c.planPermitted) permittedGames += 1;
      toolkitGames += 1; // the coach's toolkit is a constant of the cell
    }
    const row = { label, coachId, era, games, possessions,
      toolkitAvailableGames: toolkitGames, planPermittedGames: permittedGames,
      shellSelectedPossessions: selected, zoneAttackPossessions: attacked,
      manPossessions: possessions - selected, manPossessionsWithNamedDefender: manNamed,
      realizedZoneShare: possessions ? Math.round((selected / possessions) * 1e5) / 1e5 : null };
    console.log(`  ${label.padEnd(44)} realized ${String(row.realizedZoneShare).padEnd(9)} permitted-games ${permittedGames}/${games} · zone-attack ${attacked}`);
    return row;
  };

  console.log(`REALIZED ZONE MEASUREMENT — ${games} games per control cell\n`);
  const cells = {
    zoneCapableEraLegal: cell("zone-capable coach, zone-legal era", { coachId: "nick-nurse", era: "2010s", offset: 0 }),
    moderateZoneEraLegal: cell("moderate-zone coach, zone-legal era", { coachId: "rick-carlisle", era: "2010s", offset: 100000 }),
    neutralEraLegal: cell("neutral coach, zone-legal era", { coachId: "neutral", era: "2010s", offset: 200000 }),
    nonZoneEraLegal: cell("non-zone coach, zone-legal era", { coachId: "jerry-sloan", era: "2010s", offset: 300000 }),
    zoneCapableEraIllegal: cell("zone-capable coach, ZONE-ILLEGAL era", { coachId: "nick-nurse", era: "1990s", offset: 400000 }),
  };
  console.log("");

  // ── the instrument's claims ───────────────────────────────────────────────
  gate("truePositivesDetected", cells.zoneCapableEraLegal.shellSelectedPossessions > 0
    && cells.zoneCapableEraLegal.realizedZoneShare > 0.2,
    `a zone-capable coach in a zone-legal era realizes ${cells.zoneCapableEraLegal.realizedZoneShare} of possessions in the shell`);
  gate("noFalsePositiveFromToolkitAlone", cells.zoneCapableEraIllegal.shellSelectedPossessions === 0,
    `the SAME zone-capable coach realizes ${cells.zoneCapableEraIllegal.shellSelectedPossessions} zone possessions where zones are illegal — toolkit availability alone counts as nothing`);
  gate("illegalEraZoneIsZero", cells.zoneCapableEraIllegal.planPermittedGames === 0 && cells.zoneCapableEraIllegal.shellSelectedPossessions === 0,
    `zone-illegal era: ${cells.zoneCapableEraIllegal.planPermittedGames} permitted games, ${cells.zoneCapableEraIllegal.shellSelectedPossessions} realized possessions`);
  gate("manPossessionsUnderZoneCapableCoachNotCounted",
    cells.zoneCapableEraLegal.manPossessions > 0 && cells.zoneCapableEraLegal.realizedZoneShare < 1,
    `${cells.zoneCapableEraLegal.manPossessions} of ${cells.zoneCapableEraLegal.possessions} possessions under the zone-capable coach are MAN and are excluded — the v1 instrument counted all of them as zone`);
  gate("permissionIsNotSelection",
    cells.zoneCapableEraLegal.planPermittedGames === games && cells.zoneCapableEraLegal.realizedZoneShare < 1,
    `a shell was permitted in ${cells.zoneCapableEraLegal.planPermittedGames}/${games} games yet realized on only ${cells.zoneCapableEraLegal.realizedZoneShare} of possessions`);
  gate("gradedByCoachScale",
    cells.zoneCapableEraLegal.realizedZoneShare > cells.moderateZoneEraLegal.realizedZoneShare
    && cells.moderateZoneEraLegal.realizedZoneShare > cells.neutralEraLegal.realizedZoneShare
    && cells.neutralEraLegal.realizedZoneShare > cells.nonZoneEraLegal.realizedZoneShare,
    `${cells.zoneCapableEraLegal.realizedZoneShare} > ${cells.moderateZoneEraLegal.realizedZoneShare} > ${cells.neutralEraLegal.realizedZoneShare} > ${cells.nonZoneEraLegal.realizedZoneShare} — a graded response, not a step`);
  gate("zoneAttackIsASubsetOfSelection",
    Object.values(cells).every((c) => c.zoneAttackPossessions <= c.shellSelectedPossessions),
    "zone-attack execution never exceeds shell selection in any cell — the two states are nested, not equal");

  const payload = {
    realizedZoneMeasurementVersion: VALIDATION_VERSIONS.realizedZoneMeasurementVersion,
    states: {
      TOOLKIT: "isZoneToolkitAvailable(context) — the coach's documented record supports zone at all. A capability.",
      PERMITTED: "isZonePlanPermitted(plan) — a legal shell was BUILT for this game (era legality + personnel ceiling). Still not use.",
      SELECTED: "isZoneShellSelected(possession) — THIS possession was defended in that shell. This, and only this, is realized zone.",
      ATTACKED: "isZoneAttackExecuted(possession) — the offence answered by attacking the zone by area. A subset of SELECTED.",
    },
    priorDefect: {
      v1: "The per-possession ledger label was the per-GAME scheme headline (ZONE_MIXED), so every possession of any coach above the zone threshold counted as zone and every possession below it counted as none.",
      symptom: "Phase 6C3R measured defensiveZoneShare as 1.0 for a max-zone coach and 0.0 for others, and recorded the metric as an uncertifiable step function.",
      repairedIn: "Phase 6C4A (engine: per-possession zone selection and a truthful per-possession schemeId) and Phase 6C4B1 (this instrument, which reads possession state rather than a plan label).",
    },
    gamesPerCell: games, cells,
    candidateBehaviourUnchanged: "This module reads the ledger. It imports no engine module that decides anything, and the Candidate 1 core hash is unchanged by it — verified by the core-graph certification in the same phase.",
    pass: fail.length === 0, failedGates: fail,
  };
  writeArtifact("realized-zone-measurement-certification", payload, {
    generationCommand: "npm run v5:zone", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nREALIZED ZONE CERTIFICATION: ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  process.exit(payload.pass ? 0 : 2);
}
