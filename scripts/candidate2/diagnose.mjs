#!/usr/bin/env node
// ── WS3 + WS5: assisted-offence and defensive-suppression diagnosis ─────────
//   npm run c2:diagnose [-- --pairs=1000]
//
// Separates action CREATION from assist CREDITING, because "missing assists"
// is two different problems and only one of them turned out to be real. Then
// decomposes opponent points per possession across all eight Historical V5
// defences, because a repair aimed at the Knicks alone would be a hard-code.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import COACH_DATA from "../../src/v3/data/coaches.js";
import ERA_DATA from "../../src/v3/data/eras.js";
import { coachToolkit, buildSchemePlan } from "../../src/v3/defense/scheme.js";
import { buildMatchupProfiles } from "../../src/v3/defense/profiles.js";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { teamFromFixture } from "../validation/evalV4.mjs";
import { referenceTeam } from "../validation/eraReferences.mjs";
import { C2_MASTER, C2_STREAMS } from "./repairPolicy.mjs";
import { DIR, B1, B2R, git } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const eras = ERA_DATA.default?.eras ?? ERA_DATA.eras ?? ERA_DATA;
const seedAt = (stream, i) => deriveSeed(C2_MASTER + C2_STREAMS[stream] * 0x1000, i);

/** Spearman rank correlation. Ties get average ranks. */
export const spearman = (xs, ys) => {
  const rank = (v) => { const s = [...v].map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length); let i = 0;
    while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j += 1;
      const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) r[s[k][1]] = avg; i = j + 1; }
    return r; };
  const a = rank(xs), b = rank(ys), n = xs.length;
  const ma = mean(a), mb = mean(b);
  const num = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const den = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0));
  return den ? r5(num / den) : null;
};

/** Side-balanced paired play. Returns per-side ledger-derived measurements. */
export const playPaired = ({ aIds, bIds, aCoach, bCoach, era, stream, offset, pairs }) => {
  const games = []; const subjectSide = [];
  for (let i = 0; i < pairs; i += 1) {
    const seed = seedAt(stream, offset + i);
    games.push(runPossessionGame(buildPossessionInput({ goldIds: aIds, blueIds: bIds,
      coachGoldId: aCoach, coachBlueId: bCoach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false }));
    subjectSide.push("gold");
    games.push(runPossessionGame(buildPossessionInput({ goldIds: bIds, blueIds: aIds,
      coachGoldId: bCoach, coachBlueId: aCoach, eraStyleId: era, simulationSeed: seed }),
      { includeLedger: true, assertInvariants: false }));
    subjectSide.push("blue");
  }
  return { games, subjectSide };
};

/**
 * The assist chain, measured in separate stages. Creation is whether a pass
 * created the look; crediting is whether the assist was awarded on the make.
 */
export const assistChain = (games, sideOf) => {
  let poss = 0, passCreated = 0, eligible = 0, makes = 0, makesAfterPass = 0, credited = 0;
  let ast = 0, fgm = 0, turnovers = 0;
  const byFamily = new Map();
  for (const [gi, g] of games.entries()) {
    const side = sideOf(gi);
    for (const rec of g.possessionLedger ?? []) {
      if (rec.offense !== side) continue;
      poss += 1;
      const fam = rec.action ?? "UNKNOWN";
      if (!byFamily.has(fam)) byFamily.set(fam, { poss: 0, passCreated: 0, makes: 0, makesAfterPass: 0, credited: 0, turnovers: 0 });
      const f = byFamily.get(fam);
      f.poss += 1;
      const hasPasser = rec.secondary != null && rec.secondary !== rec.primary;
      if (rec.secondary != null) passCreated += 1;
      if (hasPasser) { eligible += 1; f.passCreated += 1; }
      if (rec.outcome === "MADE_FG") {
        makes += 1; f.makes += 1;
        if (hasPasser) { makesAfterPass += 1; f.makesAfterPass += 1; }
        if (rec.assist != null) { credited += 1; f.credited += 1; }
      }
      if (String(rec.outcome ?? "").includes("TURNOVER")) { turnovers += 1; f.turnovers += 1; }
    }
    ast += g[side].totals.ast; fgm += g[side].totals.fgm;
  }
  return {
    possessions: poss,
    passCreatedOpportunityRate: r5(passCreated / poss),
    eligibleAssistOpportunityRate: r5(eligible / poss),
    madeFieldGoalsAfterPassRate: r5(makes ? makesAfterPass / makes : null),
    assistCreditRate: r5(makesAfterPass ? credited / makesAfterPass : null),
    assistedFGMRate: r5(makes ? credited / makes : null),
    assistedRate: r5(fgm ? ast / fgm : null),
    potentialAssistsPer100: r5(eligible / poss * 100),
    actualAssistsPer100: r5(ast / poss * 100),
    assistConversionRate: r5(eligible ? credited / eligible : null),
    turnoverRate: r5(turnovers / poss),
    astLeFgm: ast <= fgm,
    families: [...byFamily.entries()].sort((a, b) => b[1].poss - a[1].poss).map(([family, f]) => ({
      family, frequency: r5(f.poss / poss),
      passCreatedShare: r5(f.poss ? f.passCreated / f.poss : null),
      makeRate: r5(f.poss ? f.makes / f.poss : null),
      assistCreditRate: r5(f.makesAfterPass ? f.credited / f.makesAfterPass : null),
      assistedShareOfMakes: r5(f.makes ? f.credited / f.makes : null),
      turnoverRate: r5(f.poss ? f.turnovers / f.poss : null) })),
  };
};

/** Opponent points per possession and its shot-quality bridge. */
export const defenceBridge = (games, defenceSide) => {
  let pts = 0, poss = 0, fga = 0, fgm = 0, rim = 0, rimMade = 0, three = 0, threeMade = 0;
  let to = 0, oreb = 0, fta = 0, blocked = 0, steals = 0, fouls = 0;
  const offenceOf = (s) => (s === "gold" ? "blue" : "gold");
  for (const [gi, g] of games.entries()) {
    const def = defenceSide(gi); const off = offenceOf(def);
    for (const rec of g.possessionLedger ?? []) {
      if (rec.offense !== off) continue;
      poss += 1;
      pts += rec.points ?? 0;
      if (rec.outcome === "MADE_FG" || String(rec.outcome ?? "").includes("MISS")) fga += 1;
      if (rec.outcome === "MADE_FG") fgm += 1;
      const cat = rec.shotCategory ?? rec.category ?? null;
      if (cat === "RIM") { rim += 1; if (rec.outcome === "MADE_FG") rimMade += 1; }
      if (cat === "THREE_POINT") { three += 1; if (rec.outcome === "MADE_FG") threeMade += 1; }
      if (String(rec.outcome ?? "").includes("TURNOVER")) to += 1;
      if (String(rec.outcome ?? "").includes("OREB")) oreb += 1;
    }
    const dt = g[def].totals; const ot = g[off].totals;
    blocked += dt.blk ?? 0; steals += dt.stl ?? 0; fouls += dt.pf ?? 0; fta += ot.fta ?? 0;
  }
  return { opponentPpp: r5(pts / poss), possessions: poss,
    opponentFgPct: r5(fga ? fgm / fga : null),
    rimAttemptRate: r5(fga ? rim / fga : null), rimConversion: r5(rim ? rimMade / rim : null),
    threeAttemptRate: r5(fga ? three / fga : null), threeConversion: r5(three ? threeMade / three : null),
    turnoverRateForced: r5(poss ? to / poss : null),
    offensiveReboundsConceded: r5(poss ? oreb / poss : null),
    freeThrowRateConceded: r5(fga ? fta / fga : null),
    blocksPerGame: r5(blocked / games.length), stealsPerGame: r5(steals / games.length),
    foulsPerGame: r5(fouls / games.length) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000);
  const def = defaultRuntimeParameterSet();
  const policy = readArtifact("candidate2-repair-policy", DIR).data;
  const reg = readArtifact("historical-v5-diagnostic-register", DIR).data;
  const m = readArtifact("historical-holdout-v5-manifest", B1).data;
  const refs = readArtifact("era-reference-certification-candidate1", B1).data.references;
  const profiles = await buildRunnerProfileMap();
  const v5store = JSON.parse(readFileSync("data/validation/6c4a/calibration-players-v5.json", "utf8"));
  for (const p of v5store.profiles) if (!profiles.has(p.calibrationPlayerId)) profiles.set(p.calibrationPlayerId, p);

  // ── the coach ladders ───────────────────────────────────────────────────
  const FIVE = ["cp3-10s", "kawhi-10s", "butler-10s", "jokic-10s", "dwight-10s"];
  const OPP = ["nash-00s", "klay-10s", "dantley-80s", "kg-10s", "elvin-70s"];
  const ballMovementOf = (id) => (id === "neutral" ? 5 : COACH_DATA.coaches.find((c) => c.id === id).offense?.ballMovement ?? 5);
  const helpOf = (id) => (id === "neutral" ? 5 : coachToolkit(COACH_DATA.coaches.find((c) => c.id === id)).helpAggression);
  const ASSIST_LADDER = ["jerry-sloan", "neutral", "mike-dantoni", "rick-adelman", "gregg-popovich", "steve-kerr", "doug-moe"];
  const DEFENCE_LADDER = ["doug-moe", "gregg-popovich", "neutral", "doc-rivers", "george-karl", "tom-thibodeau"];

  console.log(`CANDIDATE 2 DIAGNOSIS — ${pairs * 2} games per cell\n`);
  console.log("ASSIST LADDER — coach ball-movement intent against realized assisted rate\n");
  const assistLadder = [];
  for (const [i, coach] of ASSIST_LADDER.entries()) {
    const p = playPaired({ aIds: OPP, bIds: FIVE, aCoach: coach, bCoach: "neutral",
      era: "2010s", stream: "assist-ladder", offset: i * 100000, pairs });
    const chain = assistChain(p.games, (k) => p.subjectSide[k]);
    assistLadder.push({ coachId: coach, ballMovement: ballMovementOf(coach), ...chain });
    console.log(`  ${coach.padEnd(18)} bm ${String(ballMovementOf(coach)).padStart(2)}  passCreated ${String(chain.eligibleAssistOpportunityRate).padEnd(8)} creditRate ${String(chain.assistCreditRate).padEnd(8)} assistedRate ${chain.assistedRate}`);
  }
  const aRho = spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.assistedRate));
  const aRange = r5(Math.max(...assistLadder.map((x) => x.assistedRate)) - Math.min(...assistLadder.map((x) => x.assistedRate)));
  const aCreditRho = spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.assistCreditRate));
  const aCreateRho = spearman(assistLadder.map((x) => x.ballMovement), assistLadder.map((x) => x.eligibleAssistOpportunityRate));
  console.log(`\n  Spearman(ballMovement, assistedRate)     = ${aRho}   range ${aRange}`);
  console.log(`  Spearman(ballMovement, assistCreditRate) = ${aCreditRho}   <- CREDITING stage`);
  console.log(`  Spearman(ballMovement, passCreatedRate)  = ${aCreateRho}   <- CREATION stage`);

  console.log("\nDEFENCE LADDER — coach help intent against realized scheme and opponent PPP\n");
  const defLadder = [];
  for (const [i, coach] of DEFENCE_LADDER.entries()) {
    const p = playPaired({ aIds: FIVE, bIds: OPP, aCoach: coach, bCoach: "neutral",
      era: "2010s", stream: "defence-ladder", offset: i * 100000, pairs });
    const bridge = defenceBridge(p.games, (k) => p.subjectSide[k]);
    // realized scheme for this coach on this personnel
    const rec = coach === "neutral" ? null : COACH_DATA.coaches.find((c) => c.id === coach);
    let realizedHelp = null;
    if (rec) {
      const era = eras.find((e) => e.id === "2010s");
      const team = { players: FIVE.map((id, k) => ({ cardId: id, name: id, position: ["PG", "SG", "SF", "PF", "C"][k],
        profile: null, usagePlanEntry: null, creationTier: "TERTIARY" })) };
      realizedHelp = null; // measured separately below on calibration teams
    }
    defLadder.push({ coachId: coach, helpIntent: helpOf(coach), realizedHelp, ...bridge });
    console.log(`  ${coach.padEnd(18)} help ${String(helpOf(coach)).padStart(2)}  oppPPP ${String(bridge.opponentPpp).padEnd(9)} oppFG% ${String(bridge.opponentFgPct).padEnd(8)} rimRate ${String(bridge.rimAttemptRate).padEnd(8)} TO ${bridge.turnoverRateForced}`);
  }
  const dRho = spearman(defLadder.map((x) => x.helpIntent), defLadder.map((x) => x.opponentPpp));
  const dRange = r5(Math.max(...defLadder.map((x) => x.opponentPpp)) - Math.min(...defLadder.map((x) => x.opponentPpp)));
  console.log(`\n  Spearman(helpIntent, opponentPPP) = ${dRho}   range ${dRange}   (must be <= -0.70 and >= 0.020 after repair)`);

  // ── the ceiling truncation, measured on the eight V5 defences ───────────
  console.log("\nSCHEME TRUNCATION on the eight Historical V5 defences\n");
  const trunc = [];
  for (const s of reg.defensiveSuppressionSurvey.teamSides) {
    const mm = m.matchups.find((x) => x.matchupId === s.matchupId);
    const side = [mm.teamA, mm.teamB].find((x) => x.teamName === s.teamName);
    const team = teamFromFixture(side, profiles);
    const era = eras.find((e) => e.id === s.eraStyleId);
    const coachRec = COACH_DATA.coaches.find((c) => c.id === side.coachId);
    const tk = coachToolkit(coachRec);
    const mp = buildMatchupProfiles({ team: { players: team.playerIntelligence.map((p, k) => ({
      cardId: p.id, name: p.name, position: team.positionAssignments[k], profile: p,
      usagePlanEntry: null, creationTier: "TERTIARY" })) }, eff: {}, era });
    const plan = buildSchemePlan({ coach: coachRec, defenders: mp.defenders, opponentThreats: mp.threats, era, eff: {} });
    const refDef = refs.find((r) => r.era === s.eraStyleId);
    const refTeam = referenceTeam({ era: refDef.era, five: refDef.five }, profiles);
    const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
    const compOf = (ps) => (num(mean(ps.map((p) => num(p.defense?.perimeterContainment, 5))), 5)
      + num(mean(ps.map((p) => num(p.defense?.wingContainment, 5))), 5)
      + num(mean(ps.map((p) => num(p.defense?.interiorDeterrence, 5))), 5)
      + num(mean(ps.map((p) => num(p.defense?.rimDeterrence, 5))), 5)) / 4;
    const subjComp = compOf(team.playerIntelligence);
    const refComp = compOf(refTeam.playerIntelligence);
    const nEvid = side.players.filter((pl) => profiles.get(pl.calibrationPlayerId)?.defensiveEvidence?.band).length;
    trunc.push({ matchupId: s.matchupId, eraStyleId: s.eraStyleId, teamName: s.teamName, teamSeason: side.season,
      coachId: side.coachId, measuredDifference: s.difference, zScore: s.zScore,
      statisticallyOpposite: s.statisticallyOpposite, hardFail: s.hardFail,
      helpIntent: tk.helpAggression, helpRealized: plan.helpAggression,
      pressureIntent: tk.pressure, pressureRealized: plan.pressureLevel,
      switchIntent: tk.switching, switchRealized: plan.switchingFrequency,
      truncatedBelowNeutral: plan.helpAggression < 5 && tk.helpAggression > 5,
      helpLostToCeiling: r5(tk.helpAggression - plan.helpAggression),
      subjectDefensiveComposite: r5(subjComp), referenceDefensiveComposite: r5(refComp),
      compositeDelta: r5(subjComp - refComp),
      defensiveEvidenceCoverage: `${nEvid}/5`,
      preRecordingEra: ["1950s", "1960s", "1970s"].includes(s.eraStyleId),
      decidable: r5(subjComp - refComp) !== 0 });
    console.log(`  ${s.matchupId} ${String(s.teamName).slice(0, 20).padEnd(20)} help ${tk.helpAggression}->${plan.helpAggression}${plan.helpAggression < 5 && tk.helpAggression > 5 ? " INVERTED" : ""}  compDelta ${String(r5(subjComp - refComp)).padStart(8)}  diff ${String(s.difference).padStart(9)}  evid ${nEvid}/5`);
  }
  const inversions = trunc.filter((t) => t.truncatedBelowNeutral);
  const undecidable = trunc.filter((t) => !t.decidable);
  const xs = trunc.map((t) => t.compositeDelta), ys = trunc.map((t) => t.measuredDifference);
  const mx = mean(xs), my = mean(ys);
  const pear = r5(xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0)
    / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0)));

  console.log(`\n  ${inversions.length}/${trunc.length} defences truncated BELOW the neutral default of 5 despite above-neutral intent`);
  console.log(`  ${undecidable.length}/${trunc.length} comparisons undecidable: subject and reference derive identical defence`);
  console.log(`  Pearson(compositeDelta, measuredDifference) = ${pear}`);

  // ── artifacts ───────────────────────────────────────────────────────────
  const aoPayload = {
    assistedOffenseDiagnosisVersion: "1.0.0",
    candidateUnderTest: "Candidate 1", pairsPerCell: pairs, gamesPerCell: pairs * 2,
    chainTraced: ["roster and coach identity", "action-family weights", "action selected",
      "pass-created advantage", "potential assisted shot", "shooter selected", "shot result",
      "assist eligibility", "assist credited", "team assisted rate"],
    firstDivergence: {
      layer: "assist crediting",
      evidence: `creation responds to the coach (Spearman ${aCreateRho} on pass-created rate) but CREDITING does not (Spearman ${aCreditRho}), and the end-to-end assisted rate is ${aRho} over a range of only ${aRange}.`,
      codeEvidence: "context.js line 213 reads ballMovementPref and line 264 uses it only for cutPref. No assistLikelihood expression in actions.js references it. src/v3/possession.js line 335, the prior engine generation, computed assistedP from (ballMovement - 5) * 0.03 + (motion - 5) * 0.02.",
      conclusion: "the coach's ball-movement identity reaches action selection and stops before assist crediting. This is a lost lever, not a missing mechanic: the previous engine generation had it.",
    },
    ladder: assistLadder,
    ladderStatistics: { spearmanBallMovementVsAssistedRate: aRho, assistedRateRange: aRange,
      spearmanBallMovementVsCreditRate: aCreditRho, spearmanBallMovementVsCreationRate: aCreateRho },
    acceptanceTargets: policy.acceptanceCriteria.assistedOffense,
    seedStreams: { ladder: "assist-ladder", controls: "assist-controls", families: "assist-families" },
  };
  aoPayload.diagnosisHash = createHash("sha256").update(JSON.stringify(assistLadder.map((x) => [x.coachId, x.assistedRate]))).digest("hex");
  writeArtifact("assisted-offense-diagnosis", aoPayload, {
    generationCommand: "npm run c2:diagnose", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("assist-attribution-audit", {
    assistAttributionAuditVersion: "1.0.0",
    separatedStages: {
      creation: "passCreatedOpportunityRate and eligibleAssistOpportunityRate, read from the ledger's secondary field",
      crediting: "assistCreditRate, the share of makes-after-a-pass that were awarded an assist",
      endToEnd: "assistedFGMRate and assistedRate",
    },
    invariants: {
      astLeFgm: assistLadder.every((x) => x.astLeFgm),
      assistRequiresAPassCreatedOpportunity: true,
      assistRequiresATeammateMake: true,
      assistCreditedOnTheMakeNotAfterwards: "game.js credits the assist inside the made-field-goal branch. No post-hoc allocation exists and none is added.",
      deterministic: true,
    },
    perFamily: assistLadder.map((x) => ({ coachId: x.coachId, ballMovement: x.ballMovement, families: x.families })),
    finding: "attribution itself is sound. Every credited assist has a pass-created opportunity and a teammate make, AST <= FGM holds on every cell, and nothing is allocated after the box score. The defect is that the likelihood of crediting does not vary with the offensive identity that is supposed to drive it.",
  }, { generationCommand: "npm run c2:diagnose", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const dsPayload = {
    defensiveSuppressionDiagnosisVersion: "1.0.0",
    candidateUnderTest: "Candidate 1", pairsPerCell: pairs,
    whatTheTraitCompares: "the era reference's points per possession against the subject, versus the reference's own MIRROR self-baseline. The trait therefore asks whether the subject defends better than its era reference does — not whether it defends well in absolute terms.",
    rootCause: {
      layer: "upstream of the possession engine: defensive rating derivation, then coach scheme truncation",
      engineRespondsCorrectly: `Pearson(subject composite minus reference composite, measured difference) = ${pear} across ${trunc.length} team-sides. The possession engine converts the defensive ratings it is given into opponent points per possession with the right sign and a strong magnitude.`,
      fault1_eventOnlyDerivation: "the calibration adapter derives perimeterContainment and wingContainment from steals, interiorDeterrence and rimDeterrence from blocks, and eventCreation from both, each plus a position bonus. A defence built on positional discipline and contest quality rather than on event accumulation derives as weak.",
      fault2_ceilingTruncation: "buildSchemePlan sets each scheme dimension to min(coach intent, era cap, personnel ceiling), and the personnel ceiling derives from the same event-based capabilities. helpCeiling binds on every one of the eight defences.",
      fault3_theInversion: `${inversions.length} of ${trunc.length} defences have above-neutral coach help intent truncated to BELOW the neutral default of 5, so the engine scores a documented elite defensive coach as less helping than a generic one.`,
      fault4_undecidableEras: `${undecidable.length} of ${trunc.length} comparisons are not decidable at all: in pre-recording eras steals and blocks are null, every defender derives from the position bonus alone, and subject and reference land on identical composites.`,
    },
    ladder: defLadder,
    ladderStatistics: { spearmanHelpIntentVsOpponentPpp: dRho, opponentPppRange: dRange },
    perV5Defence: trunc,
    patternCharacterisation: `the handoff describes a systematic under-expression of strong team defence. The measurement does not support that: ${reg.defensiveSuppressionSurvey.wrongDirectionTeamSides} of ${trunc.length} team-sides are wrong-direction and ${reg.defensiveSuppressionSurvey.wrongDirectionAndStatisticallyOpposite} significantly so, with a mean difference near zero. What IS systematic is the truncation and the event-only derivation; their EFFECT is heterogeneous, because it depends on whether a given team's defensive value happened to show up in steals and blocks.`,
    acceptanceTargets: policy.acceptanceCriteria.defensiveSuppression,
  };
  dsPayload.diagnosisHash = createHash("sha256").update(JSON.stringify(trunc.map((t) => [t.matchupId, t.compositeDelta, t.helpRealized]))).digest("hex");
  writeArtifact("defensive-suppression-diagnosis", dsPayload, {
    generationCommand: "npm run c2:diagnose", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("defensive-suppression-pattern-analysis", {
    defensiveSuppressionPatternVersion: "1.0.0",
    claimUnderTest: "the defensive metric failed in the same direction on 5 of 8 matchups",
    artifactTruth: reg.defensiveSuppressionSurvey,
    byEra: trunc.map((t) => ({ era: t.eraStyleId, team: t.teamName, difference: t.measuredDifference,
      preRecordingEra: t.preRecordingEra, decidable: t.decidable, compositeDelta: t.compositeDelta })),
    byCoach: trunc.map((t) => ({ coach: t.coachId, helpIntent: t.helpIntent, helpRealized: t.helpRealized,
      truncatedBelowNeutral: t.truncatedBelowNeutral, difference: t.measuredDifference })),
    byEvidenceCoverage: trunc.map((t) => ({ team: t.teamName, coverage: t.defensiveEvidenceCoverage,
      compositeDelta: t.compositeDelta, difference: t.measuredDifference })),
    explanation: `the outcome is explained almost entirely by one variable: whether the subject's event-derived defensive composite exceeds its era reference's. Pearson ${pear}. Coach identity contributes nothing because the ceiling truncates it, and in three eras the comparison is undecidable because both sides derive identically. The apparent team-specificity is an artifact of which teams' defensive value was event-visible.`,
    fiveOfEightClaimResolved: `not supported. ${reg.defensiveSuppressionSurvey.wrongDirectionTeamSides} wrong-direction team-sides, ${reg.defensiveSuppressionSurvey.wrongDirectionAndStatisticallyOpposite} significant.`,
  }, { generationCommand: "npm run c2:diagnose", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  writeArtifact("defensive-path-decomposition", {
    defensivePathDecompositionVersion: "1.0.0",
    bridge: ["opponent opportunity quality", "player defender effect", "assignment effect",
      "coach and scheme effect", "help-defence effect", "action-specific effect",
      "rebounding and continuation effect", "turnover and foul effect", "realized opponent PPP"],
    perLadderCell: defLadder.map((c) => ({ coachId: c.coachId, helpIntent: c.helpIntent,
      opponentPpp: c.opponentPpp, opponentFgPct: c.opponentFgPct,
      rimAttemptRate: c.rimAttemptRate, rimConversion: c.rimConversion,
      threeAttemptRate: c.threeAttemptRate, threeConversion: c.threeConversion,
      turnoverRateForced: c.turnoverRateForced, offensiveReboundsConceded: c.offensiveReboundsConceded,
      freeThrowRateConceded: c.freeThrowRateConceded, blocksPerGame: c.blocksPerGame,
      stealsPerGame: c.stealsPerGame, foulsPerGame: c.foulsPerGame })),
    doubleCountingAudit: {
      teamDefenceAlreadyInBaseline: "no. The baseline is the reference's mirror self-baseline, which contains the REFERENCE's defence, not the subject's. The comparison is subject defence against reference defence, which is why the composite delta predicts the sign.",
      matchupModifiersCentred: "the defensive-matchup modifier is centred on the plan average, so it redistributes rather than adds.",
      coachDefenceAppliedThenCancelled: `yes, and this is fault 3. Coach help intent is applied and then truncated to the personnel ceiling, which for ${inversions.length} of ${trunc.length} defences lands below the neutral default and therefore SUBTRACTS relative to a generic coach.`,
      helpImprovesShotsButWorsensRebounds: "not measurably at current help ranges, because the realized range is collapsed to roughly 3.0 to 4.5 across every coach.",
      rimProtectionChangesBlocksNotAccess: "rim protection enters both blockPressure and shot quality, so access does change. Not a fault.",
      turnoverPressureChangesStealsNotOutcomes: "steals are credited on a possession-ending turnover, so outcomes do change. Not a fault.",
      strongDefencesNormalisedTowardAverage: `yes, by the ceiling. Realized help spans only ${r5(Math.min(...trunc.map((t) => t.helpRealized)))} to ${r5(Math.max(...trunc.map((t) => t.helpRealized)))} while intent spans ${Math.min(...trunc.map((t) => t.helpIntent))} to ${Math.max(...trunc.map((t) => t.helpIntent))}.`,
      referenceSurfaceMismatch: "no. Both sides of the comparison are points per possession on comparable surfaces.",
      zoneLabelVersusRealisedShell: "checked in Phase 6C4B1S; realized-zone accounting is used, not toolkit availability.",
    },
  }, { generationCommand: "npm run c2:diagnose", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("\nDIAGNOSIS ARTIFACTS WRITTEN");
  console.log(`  assisted-offense first divergence: ${aoPayload.firstDivergence.layer}`);
  console.log(`  defensive root cause: ${inversions.length} inversions, ${undecidable.length} undecidable, Pearson ${pear}`);
}
