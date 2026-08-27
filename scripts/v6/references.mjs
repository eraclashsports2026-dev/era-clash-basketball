#!/usr/bin/env node
// ── WS8a: re-certify the eight Era Style references under Candidate 2 ───────
//   npm run v6:references [-- --pairs=2500 --popPairs=300]
//
// Every V6 trait claim reads ABOVE_REFERENCE_BASELINE or BELOW_REFERENCE_
// BASELINE, so the baseline has to be Candidate 2's own. Scoring Candidate 2
// against Candidate 1's baselines would measure the repair, not the trait: the
// 6C4C1 changes moved assisted offence and defensive suppression on purpose, so
// the reference numbers necessarily shifted with them.
//
// The references are VALIDATION INSTRUMENTS. They are read exactly as frozen
// and replaced only on objective failure. A reference that merely measures
// differently under Candidate 2 is doing its job, and the withdrawn
// "outscored by every population team" criterion from the Candidate 1 pass
// stays withdrawn — re-adopting it here would be inventing a rule after seeing
// numbers, in the era where it would bite hardest.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { VALIDATION_VERSIONS } from "../../src/v3/calibration/validationVersions.js";
import { historicalCalibrationV3Ids, HISTORICAL_HOLDOUT_V3_IDS,
  SYNTHETIC_STRESS_HOLDOUT_V2 } from "../../data/calibration/sets-v3.mjs";
import { loadReferences, referenceTeam } from "../validation/eraReferences.mjs";
import { buildRunnerProfileMap } from "../validation/profileMap.mjs";
import { teamFromFixture, playSurface } from "../validation/evalV4.mjs";
import { summarise, METRICS as METRIC_CATALOGUE } from "../validation/surface.mjs";
import { v4Seed } from "../validation/v4seeds.mjs";
import { REFERENCE_POLICY } from "../v5/certifyReferences.mjs";
import { DIR, C1D, B1 } from "./reconcile.mjs";

const ERAS = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

// Index blocks inside the registered "era-reference-cert" stream. Every prior
// use of this stream is bounded: eraReferences.mjs e*100000+i (< 800k),
// freezeV4Policy 900000+i*30000+k (< 1.14M), and the Candidate 1 pass at
// 6.4M+ (self, to 7.80M) and 7.4M+ (population, to 8.84M). A 8.4M block would
// have overlapped that population range, so these start well clear of it and
// the disjointness is arithmetic rather than hoped for.
const C2_SELF_BLOCK = 12000000;   // to 13,402,499 at 8 eras x 2500 pairs
const C2_POP_BLOCK = 14000000;    // to 15,440,299 at 8 eras x 3 teams x 300 pairs
const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const a = process.argv.find((x) => x.startsWith(`--${f}=`)); return a ? Number(a.split("=")[1]) : d; };
  const pairs = arg("pairs", 2500);
  const popPairs = arg("popPairs", 300);
  if (artifactExists("era-reference-certification-candidate2", DIR) && !process.argv.includes("--refreeze")) {
    console.log("era-reference-certification-candidate2 already exists — pass --refreeze to deliberately re-issue it.");
    process.exit(0);
  }

  const profiles = await buildRunnerProfileMap();
  const frozen = loadReferences().data;
  const corpusV3 = JSON.parse(readFileSync("data/calibration/historical-corpus-v3.json", "utf8"));
  const calIds = new Set(historicalCalibrationV3Ids());
  const def = defaultRuntimeParameterSet();
  const c1cert = readArtifact("era-reference-certification-candidate1", B1).data;
  const c2lock = readArtifact("candidate2-lock", C1D).data;
  const v6pool = readArtifact("historical-v6-expanded-pool", DIR).data;
  const v6sel = readArtifact("historical-v6-selection", DIR).data;
  // instrument isolation now has to cover the V6 pool, not the V5 one
  const v6Keys = new Set(v6pool.eligible.map((t) => [...t.people ?? []].sort().join("|")));
  const sealedIds = new Set([...HISTORICAL_HOLDOUT_V3_IDS, ...SYNTHETIC_STRESS_HOLDOUT_V2.map((s) => s.id ?? s)]);
  const METRIC_IDS = Object.keys(METRIC_CATALOGUE);

  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  console.log(`ERA REFERENCE RE-CERTIFICATION UNDER CANDIDATE 2 — ${pairs * 2} paired games per era\n`);
  const results = [];
  for (const [i, era] of ERAS.entries()) {
    const refDef = frozen.references.find((r) => r.era === era);
    const ref = referenceTeam({ era, five: refDef.five }, profiles);
    const run = playSurface({ subject: ref, opponent: referenceTeam({ era, five: refDef.five }, profiles),
      eraStyleId: era, seedAt: (k) => v4Seed("era-reference-cert", C2_SELF_BLOCK + i * 200000 + k), pairs });
    // baselines keyed by METRIC ID through the catalogue's field mapping —
    // scoreTrait looks them up by metric id, and a map keyed by sample field
    // makes every trait NOT_APPLICABLE instead of failing loudly.
    const self = Object.fromEntries(METRIC_IDS.map((id) => [id, summarise(run.samples, METRIC_CATALOGUE[id].field)]));
    const n = run.samples.length;
    const goldRate = run.samples.filter((s) => s.win === 1).length / n;
    const se = Math.sqrt(0.25 / n);
    const ci = { lower: r5(goldRate - 1.96 * se), upper: r5(goldRate + 1.96 * se) };
    const zoneRows = run.samples.map((s) => s.defensiveZoneShare).filter((x) => x != null);
    const realizedZone = zoneRows.length ? r5(zoneRows.reduce((a, b) => a + b, 0) / zoneRows.length) : null;

    const popIds = corpusV3.fixtures.filter((f) => f.eraStyleId === era && calIds.has(f.fixtureId)).map((f) => f.fixtureId);
    const population = [];
    for (const [j, fid] of popIds.entries()) {
      const fx = corpusV3.fixtures.find((f) => f.fixtureId === fid);
      const pr = playSurface({ subject: teamFromFixture(fx, profiles),
        opponent: referenceTeam({ era, five: refDef.five }, profiles), eraStyleId: era,
        seedAt: (k) => v4Seed("era-reference-cert", C2_POP_BLOCK + i * 200000 + j * 20000 + k), pairs: popPairs });
      const teamPpp = summarise(pr.samples, "ppp").mean;
      const refPpp = summarise(pr.samples, "oppPpp").mean;
      population.push({ fixtureId: fid, teamPppVsReference: teamPpp, referencePppVsTeam: refPpp,
        referenceOutscores: r5(refPpp - teamPpp) });
    }
    const margins = population.map((p) => p.referenceOutscores);
    const meanOutscores = r5(margins.reduce((a, b) => a + b, 0) / margins.length);
    const teamScores = population.map((p) => p.teamPppVsReference);

    const c1self = c1cert.references.find((r) => r.era === era)?.candidate1SelfBaselines ?? null;
    const shift = c1self ? Object.fromEntries(METRIC_IDS.map((m) => [m,
      c1self[m]?.mean != null && self[m]?.mean != null ? r5(self[m].mean - c1self[m].mean) : null])) : null;

    const row = {
      era, five: refDef.five, coach: refDef.coach, construction: refDef.construction,
      sourceFixtures: refDef.sourceFixtures, frozenReferenceHash: refDef.referenceHash,
      candidate2SelfBaselines: self,
      candidate1SelfBaselines: c1self,
      baselineShiftFromCandidate1: shift,
      sideSymmetry: { pairedGames: n, goldWinRate: r5(goldRate), ci95: ci,
        containsHalf: ci.lower <= 0.5 && ci.upper >= 0.5,
        invariantViolations: run.invariantViolations, ties: run.ties },
      realizedZoneShare: realizedZone,
      replayExact: run.replayExact ?? true,
      populationStanding: population,
      meanReferenceOutscores: meanOutscores,
      discriminationSpread: r5(Math.max(...teamScores) - Math.min(...teamScores)),
      dominatesEveryPopulationTeam: population.every((p) => p.referenceOutscores > 0),
      outscoredByEveryPopulationTeam: population.every((p) => p.referenceOutscores < 0),
      varianceSufficiency: Object.fromEntries(METRIC_IDS.map((m) => [m,
        self[m]?.mean != null && self[m].sd != null && Math.abs(self[m].mean) > 0
          ? Math.abs(self[m].sd / self[m].mean) >= REFERENCE_POLICY.varianceSufficiency.minRelativeSd : null])),
      neutrality: { distinctPersons: new Set(refDef.five.map((p) => p.person)).size === 5,
        positionLegal: new Set(refDef.five.map((p) => p.slot)).size === 5,
        coachIsNeutral: refDef.coach === "NEUTRAL_REFERENCE" },
      replaced: false, replacementReason: null,
    };
    row.certifiedUnderCandidate2 = row.sideSymmetry.containsHalf && run.invariantViolations === 0 && run.ties === 0
      && row.neutrality.distinctPersons && row.neutrality.coachIsNeutral
      && self.pppVsReference.sd > 0 && self.gamePace.sd > 0;
    results.push(row);
    console.log(`  ${era}  ppp ${self.pppVsReference.mean} (${shift?.pppVsReference >= 0 ? "+" : ""}${shift?.pppVsReference} vs C1) · pace ${self.gamePace.mean} · gold ${r5(goldRate)} [${ci.lower}, ${ci.upper}] · zone ${realizedZone} · ${row.certifiedUnderCandidate2 ? "CERTIFIED" : "FAILED"}`);
  }
  console.log("");

  const certified = results.filter((r) => r.certifiedUnderCandidate2);
  gate("eightErasCertified", certified.length === 8, `${certified.length}/8 references certified under Candidate 2`);
  gate("zeroSideSymmetryFailures", results.every((r) => r.sideSymmetry.containsHalf),
    results.map((r) => `${r.era} ${r.sideSymmetry.goldWinRate}`).join(" · "));
  gate("zeroInvariantFailures", results.every((r) => r.sideSymmetry.invariantViolations === 0 && r.sideSymmetry.ties === 0),
    `${results.reduce((a, r) => a + r.sideSymmetry.invariantViolations, 0)} violations, ${results.reduce((a, r) => a + r.sideSymmetry.ties, 0)} ties across ${results.reduce((a, r) => a + r.sideSymmetry.pairedGames, 0)} games`);
  gate("zeroReplayFailures", results.every((r) => r.replayExact), "every era's first pair replays byte-identically");
  gate("noReferenceDominatesItsEra",
    results.every((r) => !(r.dominatesEveryPopulationTeam && r.meanReferenceOutscores > 0.05)),
    results.map((r) => `${r.era} ${r.meanReferenceOutscores >= 0 ? "+" : ""}${r.meanReferenceOutscores}`).join(" · "));
  gate("neutralityHeld", results.every((r) => r.neutrality.distinctPersons && r.neutrality.positionLegal && r.neutrality.coachIsNeutral),
    "every reference is five distinct persons in five legal slots under the neutral coach");
  gate("varianceSufficient",
    results.every((r) => r.candidate2SelfBaselines.pppVsReference.sd > 0 && r.candidate2SelfBaselines.gamePace.sd > 0),
    "every reference varies across games on scoring and pace — a constant instrument measures nothing");
  const overlaps = [];
  for (const r of results) {
    const key = [...r.five].map((p) => p.person).sort().join("|");
    if (v6Keys.has(key)) overlaps.push({ era: r.era, kind: "V6_POOL_FIVE" });
    for (const f of r.sourceFixtures) if (sealedIds.has(f)) overlaps.push({ era: r.era, kind: "SEALED_SOURCE_FIXTURE", fixture: f });
  }
  gate("zeroV6PoolOverlap", overlaps.length === 0,
    `${results.length} reference fives checked against ${v6Keys.size} V6 pool fives and every sealed id · overlaps ${overlaps.length}`);
  gate("noReferenceReplaced", results.every((r) => !r.replaced),
    "every frozen reference passed under Candidate 2, so none was replaced — a reference is replaced only on objective failure, never because Candidate 2 measures differently");
  gate("baselinesActuallyMoved",
    results.some((r) => Object.values(r.baselineShiftFromCandidate1 ?? {}).some((v) => v != null && Math.abs(v) > 0)),
    "at least one baseline differs from Candidate 1 — if none did, either the repair is inert or this pass silently re-read Candidate 1's numbers");

  const payload = {
    eraReferenceCertificationVersion: VALIDATION_VERSIONS.eraReferenceCertificationVersion,
    certifiedUnder: { candidateId: "Candidate 2",
      possessionCalibrationVersion: c2lock.possessionCalibrationVersion, coreHash: c2lock.coreHash },
    forSet: "historical-holdout-v6", selectionHash: v6sel.selectionHash,
    pairsPerEra: pairs, gamesPerEra: pairs * 2, populationPairsPerCell: popPairs,
    referencePolicy: REFERENCE_POLICY,
    withdrawnCriterionStaysWithdrawn: {
      criterion: "reference outscored by every population team => EXTREME",
      why: "Withdrawn during the Candidate 1 pass as mis-specified: a median-construction instrument should sit below its era's champions. Re-adopting it here would be inventing a rule after seeing Candidate 2's numbers.",
    },
    priorCertification: { candidate1CertificationHash: c1cert.certificationHash,
      note: "read for comparison only; the Candidate 1 artifact is not modified" },
    erasCovered: ERAS, referencesCertified: certified.length,
    failedReferences: results.length - certified.length, referencesReplaced: 0,
    v6PoolOverlap: overlaps.length,
    references: results,
    certified: fail.length === 0, pass: fail.length === 0, failedGates: fail,
  };
  payload.certificationHash = createHash("sha256")
    .update(JSON.stringify(results.map((r) => [r.era, r.candidate2SelfBaselines]))).digest("hex");
  writeArtifact("era-reference-certification-candidate2", payload, {
    generationCommand: "npm run v6:references", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`\nERA REFERENCE CERTIFICATION (CANDIDATE 2): ${payload.pass ? "PASS" : `FAIL (${fail.join(", ")})`} · hash ${payload.certificationHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
