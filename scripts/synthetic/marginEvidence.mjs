#!/usr/bin/env node
// ── WS3 evidence: measure every guardrail metric on NON-HOLDOUT fixtures ─────
//   npm run syn:margin-evidence [-- --scale=1]
//
// Practical margins have to be grounded in measured noise, not chosen. This
// runs the 14 synthetic DEVELOPMENT fixtures through the exact surfaces, at the
// exact frozen volumes, with the exact metric functions the formal runner will
// use, and reports each metric with a clustered standard error. The margins in
// synthetic-v2-practical-margins.json are then derived from these numbers.
//
// No Synthetic V2 fixture is simulated and no Synthetic V2 output is read.
import { createHash } from "node:crypto";
import { writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { SYNTHETIC_DEVELOPMENT_V2, SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { runPossessionGame } from "../../src/v3/possession/index.js";
import { buildPossessionInput } from "../../src/v3/possession/testContext.js";
import { deriveSeed } from "../../src/v3/seed.js";
import { mulberry32 } from "../../src/engine.js";
import { isZoneShellSelected, isZoneAttackExecuted } from "../v5/realizedZone.mjs";
import { planFor, person, zoneLegalIn } from "./surfaces.mjs";
import { VOLUMES } from "./samplePlan.mjs";
import { DIR } from "./preflight.mjs";

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { if (xs.length < 2) return null; const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

// ── metrics with clustered standard errors ──────────────────────────────────
// The unit of independence is the GAME, not the possession: possessions inside
// one game share a matchup and a seed. So a share is measured per game and the
// standard error comes from the spread across games, never from the possession
// count. Treating 200,000 correlated possessions as independent would understate
// the error by roughly an order of magnitude and make every margin look safe.
export const clusteredShare = (perGameValues) => {
  const xs = perGameValues.filter((x) => x != null && Number.isFinite(x));
  if (!xs.length) return { value: null, se: null, games: 0 };
  return { value: r5(mean(xs)), se: xs.length > 1 ? r5(sd(xs) / Math.sqrt(xs.length)) : null, games: xs.length };
};
export const actionMixOf = (games, side) => {
  const pooled = {}; let tot = 0;
  for (const g of games) for (const r of (g.possessionLedger ?? [])) {
    if (r.offense !== side) continue; pooled[r.action] = (pooled[r.action] ?? 0) + 1; tot += 1;
  }
  if (!tot) return { share: null, se: null, family: null, distribution: {}, games: 0 };
  const rows = Object.entries(pooled).sort((a, b) => b[1] - a[1]);
  const family = rows[0][0];
  const perGame = games.map((g) => {
    const rs = (g.possessionLedger ?? []).filter((r) => r.offense === side);
    return rs.length ? rs.filter((r) => r.action === family).length / rs.length : null;
  });
  const c = clusteredShare(perGame);
  return { share: c.value, se: c.se, family, games: c.games, pooledShare: r5(rows[0][1] / tot),
    distribution: Object.fromEntries(rows.map(([k, v]) => [k, r5(v / tot)])) };
};
export const winRateOf = (games, sideOf) => {
  const outcomes = games.map((g, i) => {
    if (g.finalScore.gold === g.finalScore.blue) return null;
    return (g.finalScore.gold > g.finalScore.blue ? "gold" : "blue") === sideOf(i) ? 1 : 0;
  }).filter((x) => x != null);
  if (!outcomes.length) return { value: null, se: null, decided: 0 };
  const p = mean(outcomes);
  return { value: r5(p), se: r5(Math.sqrt(p * (1 - p) / outcomes.length)), decided: outcomes.length };
};
export const varianceOf = (games) => {
  const combined = games.map((g) => g.finalScore.gold + g.finalScore.blue);
  const s = sd(combined);
  const distinct = new Set(games.map((g) => `${g.finalScore.gold}-${g.finalScore.blue}`)).size;
  const ratio = distinct / games.length;
  // deterministic bootstrap for the distinct-scoreline ratio, which has no
  // closed-form standard error and is strongly sample-size dependent
  const rng = mulberry32(0x5eed);
  const boots = [];
  for (let b = 0; b < 200; b++) {
    const seen = new Set();
    for (let i = 0; i < games.length; i++) {
      const g = games[Math.floor(rng() * games.length)];
      seen.add(`${g.finalScore.gold}-${g.finalScore.blue}`);
    }
    boots.push(seen.size / games.length);
  }
  return { combinedScoreSd: r5(s), combinedScoreSdSe: r5(s / Math.sqrt(2 * (games.length - 1))),
    marginSd: r5(sd(games.map((g) => Math.abs(g.finalScore.gold - g.finalScore.blue)))),
    distinctScorelineRatio: r5(ratio), distinctScorelineRatioSe: r5(sd(boots)), games: games.length };
};
export const structuralOf = (games) => {
  let inv = 0, imp = 0, nf = 0, neg = 0, ties = 0;
  for (const g of games) {
    inv += (g.invariantViolations ?? []).length;
    for (const v of [g.finalScore.gold, g.finalScore.blue]) if (v < 20 || v > 220) imp += 1;
    if (g.finalScore.gold === g.finalScore.blue) ties += 1;
    for (const s of ["gold", "blue"]) for (const v of Object.values(g[s].totals)) {
      if (typeof v === "number" && !Number.isFinite(v)) nf += 1;
      if (typeof v === "number" && v < 0) neg += 1;
    }
  }
  return { invariantViolationCount: inv, impossibleScoreCount: imp, nonFiniteStatCount: nf,
    negativeStatCount: neg, finalTieCount: ties };
};
export const realizedZoneOf = (games) => {
  let realized = 0, tot = 0, attack = 0;
  for (const g of games) for (const r of (g.possessionLedger ?? [])) {
    tot += 1; if (isZoneShellSelected(r)) { realized += 1; if (isZoneAttackExecuted(r)) attack += 1; }
  }
  return { realizedZonePossessions: realized, totalPossessions: tot,
    realizedZoneShare: tot ? r5(realized / tot) : null, zoneAttackShare: realized ? r5(attack / realized) : null };
};

/** Side-balanced paired play. `subjectSide[i]` is the side the SUBJECT held. */
export const playPaired = ({ subjectFive, subjectCoach, oppFive, oppCoach, era, seedAt, pairs, zoneResolution = true }) => {
  const games = []; const subjectSide = [];
  for (let i = 0; i < pairs; i++) {
    const seed = seedAt(i);
    games.push(runPossessionGame(buildPossessionInput({ goldIds: subjectFive, blueIds: oppFive,
      coachGoldId: subjectCoach, coachBlueId: oppCoach, eraStyleId: era, simulationSeed: seed, zoneResolution }),
      { includeLedger: true, assertInvariants: false }));
    subjectSide.push("gold");
    games.push(runPossessionGame(buildPossessionInput({ goldIds: oppFive, blueIds: subjectFive,
      coachGoldId: oppCoach, coachBlueId: subjectCoach, eraStyleId: era, simulationSeed: seed, zoneResolution }),
      { includeLedger: true, assertInvariants: false }));
    subjectSide.push("blue");
  }
  return { games, subjectSide };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const scale = arg("scale", 1);
  const def = defaultRuntimeParameterSet();
  const plan = planFor(SYNTHETIC_DEVELOPMENT_V2, { forceAllSurfaces: true });
  const holdoutIds = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.map((f) => f.id));
  const holdoutPersons = new Set(SYNTHETIC_STRESS_HOLDOUT_V2.flatMap((f) => f.five.map(person)));
  const V = (k) => Math.max(8, Math.round(VOLUMES[k] * scale));
  // preparation-only seed streams, kept away from the formal domain frozen in WS6
  const S = { mirror: 0x6c4b15, zone: 0x6c4b17, twin: 0x6c4b18, lower: 0x6c4b19, gap: 0x6c4b1a };

  console.log(`SYNTHETIC V2 MARGIN EVIDENCE — ${plan.length} non-holdout development fixtures, scale ${scale}\n`);
  const rows = [];
  for (const [i, p] of plan.entries()) {
    if (holdoutIds.has(p.fixtureId)) throw new Error(`${p.fixtureId} is a holdout member — refusing`);
    const f = SYNTHETIC_DEVELOPMENT_V2[i];
    const row = { devFixtureId: p.fixtureId, purpose: p.purpose, era: p.era, coach: p.fixtureCoach,
      fixtureTeamRating: p.fixtureSummedRating, zoneLegalEra: p.zoneLegalEra };

    // MIRROR — action mix, variance, structural, replay
    const mir = playPaired({ subjectFive: f.five, subjectCoach: f.coach, oppFive: f.five, oppCoach: f.coach,
      era: f.era, seedAt: (k) => deriveSeed(S.mirror, i * 200000 + k), pairs: V("MIRROR") });
    const replaySeeds = 64;
    let replayMismatch = 0;
    for (let k = 0; k < Math.min(replaySeeds, V("MIRROR")); k++) {
      const seed = deriveSeed(S.mirror, i * 200000 + k);
      const again = runPossessionGame(buildPossessionInput({ goldIds: f.five, blueIds: f.five,
        coachGoldId: f.coach, coachBlueId: f.coach, eraStyleId: f.era, simulationSeed: seed }),
        { includeLedger: true, assertInvariants: false });
      const a = mir.games[k * 2];
      if (again.finalScore.gold !== a.finalScore.gold || again.finalScore.blue !== a.finalScore.blue
        || JSON.stringify(again.gold.totals) !== JSON.stringify(a.gold.totals)
        || JSON.stringify(again.blue.totals) !== JSON.stringify(a.blue.totals)) replayMismatch += 1;
    }
    row.mirror = { ...actionMixOf(mir.games, "gold"), variance: varianceOf(mir.games),
      structural: structuralOf(mir.games), zone: realizedZoneOf(mir.games),
      replaySeedsChecked: Math.min(replaySeeds, V("MIRROR")), replayMismatchCount: replayMismatch,
      games: mir.games.length };

    // ZONE_ASYMMETRIC + its ablation twin — only where zone is legal
    if (p.zoneLegalEra) {
      const za = p.surfaces.ZONE_ASYMMETRIC;
      const zone = playPaired({ subjectFive: f.five, subjectCoach: za.zoneCoachId, oppFive: f.five,
        oppCoach: za.manCoachId, era: f.era, seedAt: (k) => deriveSeed(S.zone, i * 200000 + k), pairs: V("ZONE_ASYMMETRIC") });
      const twin = playPaired({ subjectFive: f.five, subjectCoach: za.zoneCoachId, oppFive: f.five,
        oppCoach: za.manCoachId, era: f.era, seedAt: (k) => deriveSeed(S.twin, i * 200000 + k),
        pairs: V("ZONE_ABLATION_TWIN"), zoneResolution: false });
      const wZone = winRateOf(zone.games, (k) => zone.subjectSide[k]);
      const wTwin = winRateOf(twin.games, (k) => twin.subjectSide[k]);
      row.zoneAsymmetric = { shellSideWinRate: wZone.value, se: wZone.se, decided: wZone.decided,
        zone: realizedZoneOf(zone.games), structural: structuralOf(zone.games), games: zone.games.length,
        twin: { coachOnlyWinRate: wTwin.value, se: wTwin.se, decided: wTwin.decided,
          zone: realizedZoneOf(twin.games), games: twin.games.length },
        shellAttribution: wZone.value != null && wTwin.value != null ? r5(wZone.value - wTwin.value) : null };
    } else row.zoneAsymmetric = { applicable: false, reason: `zone illegal in ${p.era}`,
      zeroZoneConfirmed: realizedZoneOf(mir.games).realizedZonePossessions === 0 };

    // VS_COHERENT_LOWER_CONTROL — the construction claim
    const lc = p.surfaces.VS_COHERENT_LOWER_CONTROL.applicable
      ? p.surfaces.VS_COHERENT_LOWER_CONTROL
      : { control: null };
    if (lc.control) {
      const low = playPaired({ subjectFive: lc.control.five, subjectCoach: "neutral", oppFive: f.five,
        oppCoach: "neutral", era: f.era, seedAt: (k) => deriveSeed(S.lower, i * 200000 + k), pairs: V("VS_COHERENT_LOWER_CONTROL") });
      const w = winRateOf(low.games, (k) => low.subjectSide[k]);
      row.vsCoherentLowerControl = { controlWinRate: w.value, se: w.se, decided: w.decided,
        controlTeamRating: lc.control.teamRating, ratingRatio: r5(lc.control.teamRating / p.fixtureSummedRating),
        controlCoherent: lc.control.coherence.coherent, structural: structuralOf(low.games), games: low.games.length };
    } else row.vsCoherentLowerControl = { applicable: false };

    // VS_ROLE_MATCHED_UPGRADE — the talent claim, construction held fixed
    const gc = p.surfaces.VS_ROLE_MATCHED_UPGRADE.applicable ? p.surfaces.VS_ROLE_MATCHED_UPGRADE : null;
    if (gc) {
      const up = playPaired({ subjectFive: gc.upgrade.five, subjectCoach: "neutral", oppFive: f.five,
        oppCoach: "neutral", era: f.era, seedAt: (k) => deriveSeed(S.gap, i * 200000 + k), pairs: V("VS_ROLE_MATCHED_UPGRADE") });
      const w = winRateOf(up.games, (k) => up.subjectSide[k]);
      row.vsRoleMatchedUpgrade = { strongerSideWinRate: w.value, se: w.se, decided: w.decided,
        ratingBefore: gc.upgrade.ratingBefore, ratingAfter: gc.upgrade.ratingAfter,
        achievedRatio: gc.upgrade.achievedRatio, slotsUpgraded: gc.upgrade.slotsUpgraded,
        primaryRoleMatches: gc.upgrade.primaryRoleMatches, noSlotGotWorse: gc.upgrade.noSlotGotWorse,
        slots: gc.upgrade.slots, structural: structuralOf(up.games), games: up.games.length };
    } else row.vsRoleMatchedUpgrade = { applicable: false };

    rows.push(row);
    const z = row.zoneAsymmetric;
    console.log(`  ${p.fixtureId.padEnd(28)} action ${String(row.mirror.share).padEnd(8)}±${String(row.mirror.se).padEnd(8)} sd ${String(row.mirror.variance.combinedScoreSd).padEnd(8)} distinct ${String(row.mirror.variance.distinctScorelineRatio).padEnd(8)} shell ${String(z.shellSideWinRate ?? "n/a").padEnd(8)} twin ${String(z.twin?.coachOnlyWinRate ?? "n/a").padEnd(8)} lowCtl ${String(row.vsCoherentLowerControl.controlWinRate ?? "n/a").padEnd(8)} upg ${row.vsRoleMatchedUpgrade.strongerSideWinRate ?? "n/a"}`);
  }

  const pick = (fn) => rows.map(fn).filter((x) => x != null && Number.isFinite(x));
  const stat = (xs) => xs.length ? { n: xs.length, min: r5(Math.min(...xs)), max: r5(Math.max(...xs)),
    mean: r5(mean(xs)), sd: xs.length > 1 ? r5(sd(xs)) : null } : { n: 0 };
  const summary = {
    maxActionFamilyShare: stat(pick((r) => r.mirror.share)),
    maxActionFamilyShareSe: stat(pick((r) => r.mirror.se)),
    combinedScoreSd: stat(pick((r) => r.mirror.variance.combinedScoreSd)),
    combinedScoreSdSe: stat(pick((r) => r.mirror.variance.combinedScoreSdSe)),
    distinctScorelineRatio: stat(pick((r) => r.mirror.variance.distinctScorelineRatio)),
    distinctScorelineRatioSe: stat(pick((r) => r.mirror.variance.distinctScorelineRatioSe)),
    shellSideWinRate: stat(pick((r) => r.zoneAsymmetric.shellSideWinRate)),
    shellSideWinRateSe: stat(pick((r) => r.zoneAsymmetric.se)),
    coachOnlyWinRate: stat(pick((r) => r.zoneAsymmetric.twin?.coachOnlyWinRate)),
    shellAttribution: stat(pick((r) => r.zoneAsymmetric.shellAttribution)),
    coherentLowerControlWinRate: stat(pick((r) => r.vsCoherentLowerControl.controlWinRate)),
    coherentLowerControlWinRateSe: stat(pick((r) => r.vsCoherentLowerControl.se)),
    strongerSideWinRate: stat(pick((r) => r.vsRoleMatchedUpgrade.strongerSideWinRate)),
    strongerSideWinRateSe: stat(pick((r) => r.vsRoleMatchedUpgrade.se)),
    upgradeRatio: stat(pick((r) => r.vsRoleMatchedUpgrade.achievedRatio)),
    replayMismatchTotal: rows.reduce((a, r) => a + r.mirror.replayMismatchCount, 0),
    structuralTotals: rows.reduce((a, r) => { for (const [k, v] of Object.entries(r.mirror.structural)) a[k] = (a[k] ?? 0) + v; return a; }, {}),
    zoneLegalFixtures: rows.filter((r) => r.zoneLegalEra).length,
    zeroZoneConfirmedOnIllegalEras: rows.filter((r) => !r.zoneLegalEra).every((r) => r.zoneAsymmetric.zeroZoneConfirmed),
  };
  console.log("\nSUMMARY ACROSS DEVELOPMENT FIXTURES");
  for (const [k, v] of Object.entries(summary)) {
    if (v && typeof v === "object" && "n" in v) console.log(`  ${k.padEnd(30)} n ${String(v.n).padStart(2)}  min ${String(v.min).padEnd(9)} max ${String(v.max).padEnd(9)} mean ${String(v.mean).padEnd(9)} sd ${v.sd}`);
    else console.log(`  ${k.padEnd(30)} ${JSON.stringify(v)}`);
  }

  const payload = {
    basis: "SYNTHETIC_DEVELOPMENT_V2 only — 14 non-holdout fixtures, run through the exact formal surfaces at the frozen sample volumes with the exact metric functions. No Synthetic V2 fixture was simulated and no Synthetic V2 output was read.",
    scale, volumes: VOLUMES,
    standardErrorMethod: {
      shares: "clustered on the GAME, not the possession: the dominant family is fixed at the pooled level, its share is measured per game, and the standard error is the spread across games over the square root of the game count. Possessions inside a game share a seed and a matchup, so treating them as independent would understate the error by roughly an order of magnitude.",
      winRates: "binomial on decided games, sqrt(p(1-p)/n)",
      combinedScoreSd: "analytic standard error of a standard deviation, sigma / sqrt(2(n-1))",
      distinctScorelineRatio: "deterministic bootstrap, 200 resamples seeded at 0x5eed, because the ratio has no closed form and is strongly sample-size dependent",
    },
    controlsExcludeHoldoutPersons: true,
    surfaceApplicability: "forceAllSurfaces: every control surface is built for every development fixture, so each surface is observed on 14 non-holdout constructions rather than on the handful the registry mapping would select. The holdout plan always follows the registry mapping.",
    holdoutPersonCount: holdoutPersons.size,
    fixtures: rows, summary,
    seedStreams: S,
  };
  payload.evidenceHash = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.devFixtureId,
    r.mirror.share, r.zoneAsymmetric.shellSideWinRate, r.vsCoherentLowerControl.controlWinRate,
    r.vsRoleMatchedUpgrade.strongerSideWinRate]))).digest("hex");
  writeArtifact("synthetic-v2-margin-evidence", payload, {
    generationCommand: "npm run syn:margin-evidence", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nevidenceHash ${payload.evidenceHash.slice(0, 16)}...`);
}
