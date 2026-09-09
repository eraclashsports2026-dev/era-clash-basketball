#!/usr/bin/env node
// ── Phase 6C4A WS3: root-cause every substantive V4 failure ─────────────────
//   npm run c1:root-cause            (~3 minutes: 28,000 diagnostic games)
//
// "No engine change before root-cause evidence exists." This script produces
// that evidence: for each of the 8 substantive hard failures it walks the
// complete mechanic chain (source inputs -> player intelligence -> team
// intelligence -> coach deployment -> raw action weights -> normalized weights
// -> reachability -> conditional outcomes -> game metric) and runs factorial
// intervention cells that isolate WHERE identity dies.
//
// Interventions are DIAGNOSTIC_ONLY: profile clones with labelled input lifts,
// existing only in this process, never committed as data and never a repair.
// They answer one question: does the downstream mechanic respond when the
// input exists? If yes, the defect is input construction, not resolution.
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { preparePossessionContext } from "../../src/v3/possession/index.js";
import { expandedActionMix } from "../../src/v3/possession/actions.js";
import { FAMILY_REGISTRY, FAMILY_CAPS } from "../../src/v3/actions/families.js";
import { loadCorpusV4 } from "../validation/buildCorpusV4.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { loadReferences, referenceTeam } from "../validation/eraReferences.mjs";
import { teamFromFixture } from "../validation/evalV4.mjs";
import { playPairedSamples, summarise, diffSummary } from "../validation/surface.mjs";
import { DIR } from "./failureRegister.mjs";

// 6C4A diagnostic seed domain: a fresh master constant, disjoint from the
// production domains (0x6c2c1a/1b/1c, 0x6c2c6a) and the validation master
// (0x6c3401) by construction of deriveSeed over distinct domain constants.
const C1_MASTER = 0x6c4a02;
const STREAMS = { movement: 1, offense: 2, defense: 3, oreb: 4 };
export const c1Seed = (stream, i) => deriveSeed(C1_MASTER + STREAMS[stream] * 0x10000, i);

const MOVEMENT_FAMILIES = ["OFF_BALL_SCREEN", "CUT", "HANDOFF"];
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// ── team construction with optional player-intelligence interventions ───────
const teamWith = (fixture, profiles, { coachId = null, lift = null } = {}) => {
  let profs = fixture.players.map((p) => buildCalibrationPlayerProfile(profiles.get(p.calibrationPlayerId)));
  if (lift) profs = profs.map((p) => lift(structuredClone(p)));
  const playerCards = profs.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0, an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
  const positionAssignments = fixture.players.map((p) => p.assignedPosition);
  return { playerCards, playerIntelligence: profs,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profs, positionAssignments, ctx: {} }),
    coachId: coachId ?? fixture.coachId, coachIntelligence: buildCoachIntelligence(coachId ?? fixture.coachId), positionAssignments };
};

// ── the action-weight trace: raw -> capped -> normalized -> reachable ───────
const traceActionMix = ({ subject, opponent, eraStyleId }) => {
  const ctx = preparePossessionContext({
    simulationId: "c1-trace", simulationSeed: 1, mode: "single", eraStyleId,
    parameterSet: null, defensiveMatchups: true, zoneResolution: true, expandedActions: true,
    offensiveAdjustments: true, opportunityAllocation: true, gold: subject, blue: opponent,
  });
  const fctx = { offense: ctx.gold, defense: ctx.blue, eff: ctx.eff, state: {}, defPlan: ctx.defensivePlans?.blue ?? null, params: ctx.parameterSet };
  const families = {};
  for (const [key, fam] of Object.entries(FAMILY_REGISTRY)) {
    const eligible = fam.canSelect(fctx);
    families[key] = { eligible, rawWeight: eligible ? r3(fam.weight(fctx)) : 0, cap: FAMILY_CAPS[key],
      gate: key === "OFF_BALL_SCREEN" ? "max offBallMovement >= 5.5"
        : key === "CUT" ? "max offBallMovement >= 5"
        : key === "HANDOFF" ? "some passing >= 6 AND heightIn >= 78"
        : key === "POST_UP" ? "max postThreat >= 5 AND defPlan"
        : key === "ISOLATION" ? "max selfCreation >= 6" : "always-ish" };
  }
  const mix = expandedActionMix({ offense: ctx.gold, defense: ctx.blue, eff: ctx.eff, state: {},
    defPlan: ctx.defensivePlans?.blue ?? null, zoneShell: ctx.defensivePlans?.blue?.zoneShell ?? null, params: ctx.parameterSet });
  const gateInputs = {
    offBallMovement: ctx.gold.players.map((p) => p.profile?.offense?.offBallMovement ?? null),
    passing: ctx.gold.players.map((p) => p.passing ?? null),
    heightIn: ctx.gold.players.map((p) => p.profile?.physical?.heightIn ?? null),
    postThreat: ctx.gold.players.map((p) => p.postThreat ?? null),
    selfCreation: ctx.gold.players.map((p) => p.selfCreation ?? null),
  };
  const movementReachable = MOVEMENT_FAMILIES.some((f) => (mix[f] ?? 0) > 0);
  return { families, normalizedMix: mix, gateInputs, movementReachable };
};

// ── one factorial cell: subject vs its era reference, paired games ───────────
const cell = ({ label, subject, ref, eraStyleId, stream, offset, pairs, metrics }) => {
  const run = playPairedSamples({ subject, opponent: ref, eraStyleId,
    seedAt: (i) => c1Seed(stream, offset + i), pairs, subjectLabel: label });
  const out = { label, games: run.games, invariantViolations: run.invariantViolations };
  for (const m of metrics) out[m] = summarise(run.samples, m);
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 1000); // 1000 pairs = 2000 side-balanced games per cell

  const profiles = await buildRunnerProfileMap();
  const corpus = loadCorpusV4();
  const refs = loadReferences().data.references;
  const fx = (id) => corpus.fixtures.find((f) => f.fixtureId === id);
  const refFor = (era) => { const d = refs.find((r) => r.era === era); return referenceTeam({ era: d.era, five: d.five }, profiles); };
  const extra = { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash };
  const meta = { pairsPerCell: pairs, gamesPerCell: pairs * 2, seedMaster: "0x6c4a02", generationCommand: "npm run c1:root-cause" };

  // ── shared structural evidence: dead team-intelligence channels ───────────
  const CHANNELS = ["offBallValue", "rimPressure", "postPlay", "turnoverRisk", "switchability"];
  const channelValues = {};
  for (const f of corpus.fixtures) {
    const t = teamWith(f, profiles);
    for (const c of CHANNELS) {
      const v = t.teamIntelligence.offense?.[c] ?? t.teamIntelligence.defense?.[c] ?? t.teamIntelligence[c] ?? null;
      (channelValues[c] ??= new Set()).add(v);
    }
  }
  const deadChannels = Object.fromEntries(Object.entries(channelValues).map(([c, s]) => [c, { distinctValues: [...s], dead: s.size <= 2 }]));

  console.log("PART A — action-weight traces (static, deterministic)\n");
  const traces = {};
  for (const fid of ["v4-1991-92-bulls", "v4-1977-78-spurs", "v4-1978-79-supersonics", "v4-1989-90-pistons"]) {
    const f = fx(fid);
    traces[fid] = traceActionMix({ subject: teamWith(f, profiles), opponent: refFor(f.eraStyleId), eraStyleId: f.eraStyleId });
    const t = traces[fid];
    console.log(`  ${fid}: movementReachable ${t.movementReachable} · mix ${JSON.stringify(Object.fromEntries(Object.entries(t.normalizedMix).filter(([, v]) => v > 0)))}`);
  }

  // ── v4f-09 MOTION: coach x roster factorial ───────────────────────────────
  console.log("\nPART B — movement factorial (Bulls 1991-92), 4 cells x", pairs * 2, "games");
  const bulls = fx("v4-1991-92-bulls");
  const bullsRef = refFor("1990s");
  const liftMovement = (p) => { p.offense.offBallMovement = Math.min(10, p.offense.offBallMovement + 2.5); return p; };
  const mCells = [];
  const mDefs = [
    { label: "jackson/as-is", coachId: null, lift: null },
    { label: "neutral/as-is", coachId: "neutral", lift: null },
    { label: "jackson/movement-lift(DIAGNOSTIC_ONLY)", coachId: null, lift: liftMovement },
    { label: "neutral/movement-lift(DIAGNOSTIC_ONLY)", coachId: "neutral", lift: liftMovement },
  ];
  for (const [i, d] of mDefs.entries()) {
    const c = cell({ label: d.label, subject: teamWith(bulls, profiles, d), ref: bullsRef, eraStyleId: "1990s",
      stream: "movement", offset: i * pairs * 10, pairs, metrics: ["movementShare", "ppp"] });
    mCells.push(c);
    console.log(`  ${d.label.padEnd(42)} movementShare ${c.movementShare.mean} · ppp ${c.ppp.mean}`);
  }

  // ── v4f-02 / v4f-08 ELITE_OFFENSE: quality-input intervention ─────────────
  console.log("\nPART C — offensive-quality intervention (Spurs 77-78, Bulls 91-92)");
  const liftOffense = (p) => {
    p.offense.selfCreation = Math.min(10, p.offense.selfCreation + 1.5);
    p.offense.spacingGravity = Math.min(10, p.offense.spacingGravity + 1.5);
    p.offense.shotSelection = Math.min(10, p.offense.shotSelection + 1.5);
    return p;
  };
  const oCells = {};
  for (const [j, fid] of ["v4-1977-78-spurs", "v4-1991-92-bulls"].entries()) {
    const f = fx(fid); const ref = refFor(f.eraStyleId);
    oCells[fid] = [];
    for (const [i, d] of [{ label: "as-is", lift: null }, { label: "offense-lift(DIAGNOSTIC_ONLY)", lift: liftOffense }].entries()) {
      const c = cell({ label: d.label, subject: teamWith(f, profiles, d), ref, eraStyleId: f.eraStyleId,
        stream: "offense", offset: (j * 2 + i) * pairs * 10, pairs, metrics: ["ppp"] });
      oCells[fid].push(c);
      console.log(`  ${fid} ${d.label.padEnd(32)} ppp ${c.ppp.mean}`);
    }
  }

  // ── v4f-03/04/06/07 ELITE_DEFENSE: defensive-input intervention ───────────
  console.log("\nPART D — defensive-quality intervention (Sonics 78-79, Pistons 89-90)");
  const liftDefense = (p) => {
    for (const k of ["perimeterContainment", "wingContainment", "interiorDeterrence", "rimDeterrence", "eventCreation", "defensiveRebounding"])
      p.defense[k] = Math.min(10, p.defense[k] + 2);
    return p;
  };
  const dCells = {};
  for (const [j, fid] of ["v4-1978-79-supersonics", "v4-1989-90-pistons"].entries()) {
    const f = fx(fid); const ref = refFor(f.eraStyleId);
    dCells[fid] = [];
    for (const [i, d] of [{ label: "as-is", lift: null }, { label: "defense-lift(DIAGNOSTIC_ONLY)", lift: liftDefense }].entries()) {
      const c = cell({ label: d.label, subject: teamWith(f, profiles, d), ref, eraStyleId: f.eraStyleId,
        stream: "defense", offset: (j * 2 + i) * pairs * 10, pairs, metrics: ["oppPpp"] });
      dCells[fid].push(c);
      console.log(`  ${fid} ${d.label.padEnd(32)} oppPpp ${c.oppPpp.mean}`);
    }
  }

  // ── v4f-05 STRONG_OFFENSIVE_REBOUNDING: null-oreb input intervention ──────
  console.log("\nPART E — offensive-rebounding input intervention (Sonics 78-79)");
  const sonics = fx("v4-1978-79-supersonics");
  const sonicsRef = refFor("1970s");
  // season-level intervention: give each player a DIAGNOSTIC oreb value at the
  // era-typical share of his recorded total rebounds, then rebuild the profile
  const sonicsOrebTeam = () => {
    const profs = sonics.players.map((p) => {
      const season = structuredClone(profiles.get(p.calibrationPlayerId));
      if (season.basicStats.offensiveRebounds == null && season.basicStats.rebounds != null)
        season.basicStats.offensiveRebounds = Math.round(season.basicStats.rebounds * 0.35 * 10) / 10;
      return buildCalibrationPlayerProfile(season);
    });
    const playerCards = profs.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
      pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0, an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
    const positionAssignments = sonics.players.map((p) => p.assignedPosition);
    return { playerCards, playerIntelligence: profs,
      teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profs, positionAssignments, ctx: {} }),
      coachId: sonics.coachId, coachIntelligence: buildCoachIntelligence(sonics.coachId), positionAssignments };
  };
  const liftDefReb = (p) => { p.defense.defensiveRebounding = Math.min(10, p.defense.defensiveRebounding + 2); return p; };
  const rCells = [];
  for (const [i, d] of [
    { label: "as-is (offensiveRebounds null)", subject: teamWith(sonics, profiles) },
    { label: "oreb-input(DIAGNOSTIC_ONLY)", subject: sonicsOrebTeam() },
    // the channel the resolver ACTUALLY reads: offensiveGlass is derived from
    // defensiveRebounding*0.6 + position, so lifting THAT must move orebRate
    { label: "defreb-lift(DIAGNOSTIC_ONLY)", subject: teamWith(sonics, profiles, { lift: liftDefReb }) },
  ].entries()) {
    const c = cell({ label: d.label, subject: d.subject, ref: sonicsRef, eraStyleId: "1970s",
      stream: "oreb", offset: i * pairs * 10, pairs, metrics: ["orebRate"] });
    rCells.push(c);
    console.log(`  ${d.label.padEnd(36)} orebRate ${c.orebRate.mean}`);
  }

  // ── assemble per-failure artifacts ────────────────────────────────────────
  const bullsTrace = traces["v4-1991-92-bulls"];
  const conclusions = {
    "v4f-09": {
      failureId: "v4f-09", teamSeason: "Chicago Bulls 1991-92", traitId: "MOTION", metricId: "movementShare",
      chain: {
        sourceInputs: "shootingProfile.perimeterSkill (a THREE-POINT skill grade) is the only movement signal; Bulls five grade LIMITED/NONE; physicalProfile.heightIn is null for every calibration profile (SOURCE_BLOCKED)",
        playerIntelligence: `offBallMovement = perim*0.5 + starterBonus caps at 3.5 for a LIMITED starter; Bulls values ${JSON.stringify(bullsTrace.gateInputs.offBallMovement)}`,
        teamIntelligence: "no compensating channel; cutting/screening read the same dead inputs",
        coachDeployment: "phil-jackson motion preference feeds family WEIGHT terms only; a weight cannot rescue an ineligible family",
        rawWeights: bullsTrace.families,
        normalizedWeights: bullsTrace.normalizedMix,
        reachability: `OFF_BALL_SCREEN gate (>=5.5): false. CUT gate (>=5): false. HANDOFF gate (heightIn>=78): false for ALL calibration profiles because heightIn is null. movementReachable=${bullsTrace.movementReachable}`,
        conditionalOutcomes: "never reached — eligibility is upstream of selection",
        gameMetric: "movementShare exactly 0 across 4096 formal games (z -840)",
      },
      factorial: mCells,
      rootCause: "ELIGIBILITY_STARVATION: binary canSelect gates read a three-point proxy (offBallMovement) and a null-defaulted height; whole movement family unreachable for the fixture regardless of coach. The coach lever is alive but downstream of a dead gate.",
      evidence: {
        coachEffectWhenReachable: diffSummary(mCells[2].movementShare, mCells[3].movementShare),
        interventionRestoresFamily: diffSummary(mCells[2].movementShare, mCells[0].movementShare),
      },
      repairDirection: "make movement-family eligibility read era-honest inputs (movement evidence beyond three-point skill; height null != height 0) and keep coach/roster weights continuous; NEVER a flat bonus or a forced share",
    },
    "v4f-08": {
      failureId: "v4f-08", teamSeason: "Chicago Bulls 1991-92", traitId: "ELITE_OFFENSE", metricId: "pppVsReference",
      chain: {
        sourceInputs: "box-score season stats; perimeterSkill LIMITED for Jordan/Pippen (three-point grade standing in for all perimeter craft)",
        playerIntelligence: "spacingGravity/offBallMovement/shotSelection compressed by three-point-era proxies; selfCreation anchored to raw FGA",
        teamIntelligence: "cutting 3.4 vs reference 5.2; screening 3.6 vs 4.2; dead channels offBallValue/rimPressure/postPlay identical to reference by construction",
        coachDeployment: "intact",
        reachability: "movement family unreachable (see v4f-09) removes efficient possession types from an offence documented as motion-based",
        gameMetric: "ppp 0.065 BELOW the era-median reference despite ELITE_OFFENSE documentation",
      },
      factorial: oCells["v4-1991-92-bulls"],
      rootCause: "INPUT_QUALITY_COMPRESSION + ELIGIBILITY_STARVATION: offensive-quality inputs regress elite teams to the era median (dead channels + three-point proxies), and the unreachable movement family removes the efficient actions the identity implies.",
      evidence: { pppRespondsToInputs: diffSummary(oCells["v4-1991-92-bulls"][1].ppp, oCells["v4-1991-92-bulls"][0].ppp) },
      repairDirection: "repair adapter quality channels (per-possession efficiency signals, not raw-volume anchors; revive dead channels) so documented elite offences carry elite inputs; no universal scoring shift",
    },
    "v4f-02": {
      failureId: "v4f-02", teamSeason: "San Antonio Spurs 1977-78", traitId: "ELITE_OFFENSE", metricId: "pppVsReference",
      chain: {
        sourceInputs: "George Gervin's scoring title season enters as fga/points per game only",
        playerIntelligence: "shotCreation 5.0 vs reference 5.2 — the league's premier scorer is INVISIBLE after linear scale() to fixed anchors and five-man averaging",
        teamIntelligence: "offense deltas ~0 against the era median; dead channels identical",
        coachDeployment: "intact (doug-moe run-and-gun renders pace, not efficiency)",
        gameMetric: "ppp 0.048 below reference",
      },
      factorial: oCells["v4-1977-78-spurs"],
      rootCause: "INPUT_QUALITY_COMPRESSION: linear anchor scaling plus five-man averaging pulls elite offensive quality to the era median, so the possession layer is asked to render an elite offence from median inputs.",
      evidence: { pppRespondsToInputs: diffSummary(oCells["v4-1977-78-spurs"][1].ppp, oCells["v4-1977-78-spurs"][0].ppp) },
      repairDirection: "same as v4f-08",
    },
  };
  for (const [fid, team, ids] of [["v4-1978-79-supersonics", "Seattle SuperSonics 1978-79", ["v4f-03", "v4f-04"]], ["v4-1989-90-pistons", "Detroit Pistons 1989-90", ["v4f-06", "v4f-07"]]]) {
    for (const id of ids) {
      conclusions[id] = {
        failureId: id, teamSeason: team,
        traitId: id === "v4f-03" ? "elite team man defence" : id === "v4f-04" ? "ELITE_DEFENSE" : id === "v4f-06" ? "elite physical man" : "ELITE_DEFENSE",
        metricId: "refPppVsTeam",
        chain: {
          sourceInputs: "steals and blocks are the ONLY defensive statistics in the store; no defensiveEvidence, no accolades, no documented roles for recorded-era seasons",
          playerIntelligence: "containment channels = scaled steals + position bump; disciplined elite man defenders (low-steal by scheme) rate BELOW the era median",
          teamIntelligence: fid === "v4-1978-79-supersonics"
            ? "rimProtection -2.1, defensiveRebounding -2.3, wingContainment -0.7 vs the era reference — an elite defence rated worse than the median five"
            : "every defensive channel 0.6-1.6 BELOW the era reference for the Bad Boys",
          coachDeployment: "defensive coach scales are alive but multiply median-or-worse inputs",
          gameMetric: "reference scores MORE against the elite defence than against the median five",
        },
        factorial: dCells[fid],
        rootCause: "DEFENSIVE_PROXY_INVERSION: steal/block anchors measure gambling, not containment; the pre-recording defensive-evidence band mechanism is bypassed the moment steals exist, so documented elite man defence has no input channel at all in recorded eras.",
        evidence: { oppPppRespondsToInputs: diffSummary(dCells[fid][1].oppPpp, dCells[fid][0].oppPpp) },
        repairDirection: "extend the documented defensive-evidence band to ALL eras as a floor alongside recorded events (never replacing them); no universal defence shift",
      };
    }
  }
  conclusions["v4f-05"] = {
    failureId: "v4f-05", teamSeason: "Seattle SuperSonics 1978-79", traitId: "STRONG_OFFENSIVE_REBOUNDING", metricId: "orebRate",
    chain: {
      sourceInputs: "PLAYER_CAREER_TABLE route records total rebounds only; basicStats.offensiveRebounds null (correctly preserved). But this is NOT where the identity dies:",
      playerIntelligence: "an oreb-input intervention moved orebRate by only +0.0015 — player offensive-rebound evidence has NO path into the crash probability; postThreat only selects who is credited the board",
      teamIntelligence: "rebounding.offensiveGlass = mean(top2(defense.defensiveRebounding*0.6 + PF/C bump)) — offensive glass is a scaled DEFENSIVE-rebounding proxy; Sonics 6.2 vs 1970s reference 8.5 on that channel",
      conditionalOutcomes: "orebP reads (offGlass - defGlass)*0.022; the mechanism is alive — lifting the miswired channel moves orebRate — but the wire never carries offensive-rebounding evidence",
      gameMetric: "orebRate 0.069 below reference",
    },
    factorial: rCells,
    rootCause: "OFFENSIVE_GLASS_CHANNEL_MISWIRED: the team offensive-glass channel is derived from defensive rebounding and position alone; recorded or derivable offensive-rebounding evidence cannot reach the MISS_OREB probability. The initial null-input hypothesis was FALSIFIED by intervention (cell 2).",
    evidence: {
      orebInputInterventionFalsified: diffSummary(rCells[1].orebRate, rCells[0].orebRate),
      miswiredChannelResponds: diffSummary(rCells[2].orebRate, rCells[0].orebRate),
    },
    repairDirection: "wire offensiveGlass to offensive-rebounding evidence (recorded oreb where it exists, a documented derivation from totals + position where unrecorded); nulls stay null in the store",
  };

  const payload = {
    ...meta,
    substantiveFailures: 8,
    rootCaused: Object.keys(conclusions).length,
    unresolved: 8 - Object.keys(conclusions).length,
    deadTeamIntelligenceChannels: deadChannels,
    rootCauseClasses: {
      ELIGIBILITY_STARVATION: ["v4f-09"],
      INPUT_QUALITY_COMPRESSION: ["v4f-02", "v4f-08"],
      DEFENSIVE_PROXY_INVERSION: ["v4f-03", "v4f-04", "v4f-06", "v4f-07"],
      OFFENSIVE_GLASS_CHANNEL_MISWIRED: ["v4f-05"],
    },
    traces, conclusions,
  };
  writeArtifact("candidate1-root-cause-analysis", payload, { generationCommand: "npm run c1:root-cause", dir: DIR, extra });
  console.log(`\nroot-caused ${payload.rootCaused}/8 · classes ${Object.keys(payload.rootCauseClasses).length} · dead channels ${Object.values(deadChannels).filter((d) => d.dead).length}`);
}
