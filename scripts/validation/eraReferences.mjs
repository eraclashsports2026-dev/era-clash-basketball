#!/usr/bin/env node
// ── Frozen era-reference opponents ──────────────────────────────────────────
//   npm run validation:6c3r:references [-- --pairs=2500]
//
// One reference team per Era Style: a frozen measuring instrument, not
// historical truth. Offence quality is a team's PPP against this instrument's
// defence; defence quality is the instrument's PPP against the team; pace is
// the joint game pace against the instrument compared with the instrument's
// own self-baseline. All of that only works if the instrument itself is frozen,
// neutral, side-stable and variance-adequate — which is what this certifies.
//
// Construction is deterministic and uses NO Candidate 0 output: for each era,
// from the historical-calibration-v3 players of that era (never a holdout
// fixture), each slot takes the median-scoring eligible player. Median, not
// best, because the instrument must sit in the middle of its era.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { buildCalibrationPlayerProfile } from "../../src/v3/calibration/calibrationPlayerAdapter.js";
import { buildTeamIntelligence } from "../../src/v3/teamIntelligence.js";
import { buildCoachIntelligence } from "../../src/v3/coachIntelligence.js";
import { NEUTRAL_COACH } from "../../src/v3/coaches.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { loadPlayers } from "../calibration/build-players-v3.mjs";
import { historicalCalibrationV3Ids, HISTORICAL_HOLDOUT_V3_IDS, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { playPairedSamples, summarise, METRICS } from "./surface.mjs";
import { v4Seed } from "./v4seeds.mjs";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";

const DIR = "data/validation/6c3r";
const SLOTS = ["PG", "SG", "SF", "PF", "C"];
export const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

/** Deterministic reference five for one era, from calibration-set players only. */
export const buildReferenceFive = (era, profiles, corpus) => {
  const calibIds = new Set(historicalCalibrationV3Ids());
  const eraFixtures = corpus.fixtures.filter((f) => f.eraStyleId === era && calibIds.has(f.fixtureId));
  const pool = [];
  for (const f of eraFixtures) for (const p of f.players) {
    const prof = profiles.get(p.calibrationPlayerId);
    if (prof) pool.push({ id: p.calibrationPlayerId, slot: p.assignedPosition, person: prof.calibrationPersonId, ppg: prof.basicStats.pointsPerGame ?? 0, name: prof.name });
  }
  const usedPersons = new Set();
  const five = [];
  for (const slot of SLOTS) {
    const cands = pool.filter((p) => p.slot === slot && !usedPersons.has(p.person))
      .sort((a, b) => a.ppg - b.ppg || a.id.localeCompare(b.id));
    if (!cands.length) throw new Error(`era ${era}: no eligible ${slot}`);
    const pick = cands[Math.floor((cands.length - 1) / 2)]; // the median scorer
    usedPersons.add(pick.person);
    five.push(pick);
  }
  return { era, five, poolSize: pool.length, sourceFixtures: eraFixtures.map((f) => f.fixtureId) };
};

export const referenceTeam = (refDef, profiles) => {
  const profs = refDef.five.map((p) => buildCalibrationPlayerProfile(profiles.get(p.id)));
  const playerCards = profs.map((p) => ({ id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: p.positions,
    pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mvp: 0, fmvp: 0, dpoy: 0, an1: 0, an2: 0, an3: 0, ad1: 0, ad2: 0, win: 0, pop: 0 }));
  const positionAssignments = refDef.five.map((p) => p.slot);
  return {
    playerCards, playerIntelligence: profs,
    teamIntelligence: buildTeamIntelligence({ playerCards, playerIntelligence: profs, positionAssignments, ctx: {} }),
    // "neutral" is the supported neutral-coach id: the possession context maps
    // it to NEUTRAL_COACH for the coach record, and the ACTION layer re-resolves
    // coaches from that record, so an invented id fails deep inside
    // pick-and-roll evaluation. coachRecord is passed explicitly as well so no
    // downstream consumer has to repeat the mapping.
    coachId: "neutral",
    coachRecord: NEUTRAL_COACH,
    coachIntelligence: buildCoachIntelligence(NEUTRAL_COACH),
    positionAssignments,
  };
};

export const loadReferences = () => JSON.parse(readFileSync(`${DIR}/era-reference-opponents.json`, "utf8"));

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  // 2500 pairs = 5000 paired games per reference at stage 1. The first run
  // certified 7 of 8: the 1950s reference showed a gold rate of 0.528 (2.8
  // sigma). The predeclared response is UNIFORM escalation on CUMULATIVE seed
  // indices — every era to 4x, the original 2,500 pairs kept as the prefix —
  // never a re-roll of the failing era alone, which would be seed shopping. A
  // fluke passes at the larger sample; a real asymmetry fails certification and
  // forces a construction change.
  const pairs = arg("pairs", 10000);

  const store = loadPlayers();
  const profiles = new Map(store.profiles.map((p) => [p.calibrationPlayerId, p]));
  const corpus = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const sealed = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);

  const references = [];
  console.log(`ERA REFERENCES — ${pairs * 2} paired games each\n`);
  for (const [e, era] of ERAS.entries()) {
    const def = buildReferenceFive(era, profiles, corpus);
    for (const src of def.sourceFixtures) if (sealed.has(src)) throw new Error(`reference for ${era} touched sealed fixture ${src}`);
    const persons = new Set(def.five.map((p) => p.person));
    const team = referenceTeam(def, profiles);
    const t0 = performance.now();
    const run = playPairedSamples({ subject: team, opponent: team, eraStyleId: era,
      seedAt: (i) => v4Seed("era-reference-cert", e * 100000 + i), pairs });
    const gold = run.samples.filter((s) => s.orientation === "GOLD");
    const winRate = gold.reduce((a, s) => a + s.win, 0) / gold.length;
    const se = Math.sqrt(0.25 / gold.length);
    const baselines = {};
    for (const [id, m] of Object.entries(METRICS)) baselines[id] = summarise(run.samples, m.field);
    const ppgs = def.five.map((p) => p.ppg);
    const ref = {
      era, five: def.five, poolSize: def.poolSize, sourceFixtures: def.sourceFixtures,
      coach: "NEUTRAL_REFERENCE",
      construction: "median-scoring eligible player per slot from historical-calibration-v3 players of this era; persons deduplicated; ties broken by id",
      neutrality: {
        distinctPersons: persons.size === 5,
        positionLegal: true,
        ppgSpread: { min: Math.min(...ppgs), max: Math.max(...ppgs) },
        topScoringShareBaseline: baselines.topScoringShare?.mean ?? null,
      },
      sideStability: {
        pairedGames: run.games, goldWinRate: Math.round(winRate * 100000) / 100000,
        ci95: { lower: Math.round((winRate - 1.96 * se) * 100000) / 100000, upper: Math.round((winRate + 1.96 * se) * 100000) / 100000 },
        containsHalf: winRate - 1.96 * se <= 0.5 && winRate + 1.96 * se >= 0.5,
        invariantViolations: run.invariantViolations, ties: run.ties,
      },
      varianceSufficiency: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, v.sd != null && v.sd > 0])),
      selfBaselines: baselines,
      referenceHash: createHash("sha256").update(JSON.stringify({ era, five: def.five })).digest("hex"),
    };
    references.push(ref);
    console.log(`  ${era}  five [${def.five.map((p) => p.name).join(", ")}]`);
    console.log(`        gold ${ref.sideStability.goldWinRate} ci [${ref.sideStability.ci95.lower}, ${ref.sideStability.ci95.upper}] · pace ${baselines.gamePace.mean} · ppp ${baselines.pppVsReference.mean} · inv ${run.invariantViolations} · ties ${run.ties} · ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  }

  const certified = references.filter((r) => r.sideStability.containsHalf && r.sideStability.invariantViolations === 0
    && r.sideStability.ties === 0 && r.neutrality.distinctPersons);
  const payload = {
    historicalReferenceOpponentVersion: VALIDATION_VERSIONS.historicalReferenceOpponentVersion,
    pairsPerReference: pairs, gamesPerReference: pairs * 2,
    references, erasCovered: references.map((r) => r.era),
    certified: certified.length, total: references.length,
    allCertified: certified.length === references.length,
    holdoutOverlap: 0,
    frozenBeforeV4Selection: true,
    role: "A frozen measuring instrument, never historical truth. Every V4 trait criterion compares against these self-baselines.",
  };
  const { path } = writeArtifact("era-reference-opponents", payload, {
    generationCommand: "npm run validation:6c3r:references",
    sourceArtifacts: ["data/calibration/historical-corpus-v3.json", "data/calibration/calibration-players-v3.json"],
    extra: { parameterSetHash: defaultRuntimeParameterSet().parameterSetHash },
    dir: DIR,
  });
  console.log(`\n  certified ${certified.length}/${references.length}`);
  console.log(`wrote ${path}`);
  process.exit(payload.allCertified ? 0 : 2);
}
