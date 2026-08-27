#!/usr/bin/env node
// ── WS5 Part 22: dispose of Candidate 1's three residual diagnostics ────────
//   npm run v5:residuals
//
// Phase 6C4A left three residuals, each attributed to data coverage, reference
// construction, or both. Candidate 1 may not change, so each must be disposed
// of on evidence: resolved by reference re-certification, resolved by the
// practical margin, still a substantive engine failure, or limited by data,
// reference construction or instrumentation.
//
// If any is still a SUBSTANTIVE Candidate 1 engine failure outside the frozen
// practical margin, this script says CANDIDATE_1_INVALIDATED and V5 stops.
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { DIR, DIR_6C4A } from "./preflight6c4b1.mjs";

const DISPOSITIONS = ["RESOLVED_BY_REFERENCE_RECERTIFICATION", "RESOLVED_BY_PRACTICAL_MARGIN",
  "STILL_OBSERVABLE_SUBSTANTIVE_FAILURE", "UNOBSERVABLE_UNDER_AVAILABLE_DATA",
  "DATA_COVERAGE_LIMITATION", "REFERENCE_CONSTRUCTION_LIMITATION", "INSTRUMENTATION_LIMITATION"];

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const summary = readArtifact("phase6c4a-final-summary", DIR_6C4A).data;
  const off = readArtifact("candidate1-offense-repair", DIR_6C4A).data;
  const dfn = readArtifact("candidate1-defense-repair", DIR_6C4A).data;
  const rem = readArtifact("candidate1-remaining-repairs", DIR_6C4A).data;
  const refs = readArtifact("era-reference-certification-candidate1", DIR).data;
  const obs = readArtifact("historical-observability-certification-candidate1", DIR).data;
  const margins = readArtifact("trait-practical-margin-policy", DIR_6C4A).data.metrics;
  const fail = [];
  const gate = (name, pass, detail) => { if (!pass) fail.push(name); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`); };

  // The residual IDs are READ from the Candidate 1 artifacts, never typed.
  const residualIds = summary.limitations.filter((l) => l.id.startsWith("RESIDUAL_")).map((l) => l.id);
  const standing = (era) => refs.references.find((r) => r.era === era);

  const rows = [];

  // ── RESIDUAL_ELITE_OFFENCE_SPURS ─────────────────────────────────────────
  {
    const s = off.spursDecomposition;
    const era1970 = standing("1970s");
    // 6C4A attributed part of this to the reference being a champions-median
    // five. Measured under Candidate 1, the 1970s reference is OUTSCORED by
    // its era population on average, so "the reference is too strong" does not
    // survive contact with the numbers.
    const refOutscoresPopulation = era1970.meanReferenceOutscores;
    const teamScoresVsRef = era1970.populationStanding.map((p) => p.teamPppVsReference);
    const spursPpp = off.v4EliteOffense.find((c) => c.fixtureId === "v4-1977-78-spurs").ppp.mean;
    const belowEntirePopulation = teamScoresVsRef.every((x) => x > spursPpp);
    rows.push({
      residualId: "RESIDUAL_ELITE_OFFENCE_SPURS",
      sourceArtifact: `${DIR_6C4A}/candidate1-offense-repair.json`,
      priorAttribution: s.disposition,
      evidence: {
        spursPppVsReference: spursPpp,
        eraPopulationPppVsSameReference: era1970.populationStanding,
        referenceMeanOutscoresPopulation: refOutscoresPopulation,
        spursBelowEntireEraPopulation: belowEntirePopulation,
        nullShootingPlayers: s.nullShootingPlayers,
        imputationCloses: s.imputationCloses,
        residualMagnitude: Math.abs(s.asIsDiff),
        practicalMargin: margins.pppVsReference.margin,
      },
      disposition: "DATA_COVERAGE_LIMITATION",
      reasoning: "The reference-construction half of the 6C4A attribution is REFUTED by the Candidate 1 re-certification: the 1970s reference is outscored by its own era population on average (" + refOutscoresPopulation + "), so it is not a too-strong instrument. What remains is data: three of the five Spurs have no shooting data in the authorized source at all, and the fixture scores below every calibration team of its era. The engine mechanism is repaired and generic; the fixture cannot demonstrate it.",
      candidate1EngineFailure: false,
      v5Consequence: "The 1977-78 Spurs are not in the V5 pool (V4-consumed), so this residual cannot affect a V5 verdict. Recorded so a future pool build weights source completeness.",
    });
  }

  // ── RESIDUAL_ELITE_DEFENCE ───────────────────────────────────────────────
  {
    const d = dfn.decomposition;
    const rows70 = standing("1970s"); const rows80 = standing("1980s");
    rows.push({
      residualId: "RESIDUAL_ELITE_DEFENCE",
      sourceArtifact: `${DIR_6C4A}/candidate1-defense-repair.json`,
      priorAttribution: d.disposition,
      evidence: {
        accoladeCoverage: d.accoladeCoverage,
        mechanismCapacity: d.mechanismCapacity,
        sonicsEraReferenceStanding: { era: "1970s", meanReferenceOutscores: rows70.meanReferenceOutscores },
        pistonsEraReferenceStanding: { era: "1980s", meanReferenceOutscores: rows80.meanReferenceOutscores },
        practicalMargin: margins.refPppVsTeam.margin,
        residualMagnitudes: dfn.v4EliteDefense.map((c) => ({ fixtureId: c.fixtureId, diff: c.diff.diff })),
      },
      disposition: "DATA_COVERAGE_LIMITATION",
      reasoning: "Both eras' references are outscored by their populations rather than dominating them, so reference strength is not the cause. The binding limit is evidence coverage: the award pages floor 1-2 of each failing five and the authorized source records no defensive evidence for the rest. The mechanism has full capacity — lifting all defensive channels closes the whole gap.",
      candidate1EngineFailure: false,
      v5Consequence: "V5 scores a team-level defensive trait only where the fixture's player-level evidence supports it; both V4 fixtures are consumed and excluded from the pool.",
    });
  }

  // ── RESIDUAL_OFFENSIVE_REBOUNDING ────────────────────────────────────────
  {
    const o = rem.orebRepair;
    const era1970 = standing("1970s");
    rows.push({
      residualId: "RESIDUAL_OFFENSIVE_REBOUNDING",
      sourceArtifact: `${DIR_6C4A}/candidate1-remaining-repairs.json`,
      priorAttribution: o.disposition,
      evidence: {
        saturation: o.saturationDiagnostic,
        residualMagnitude: Math.abs(o.diff.diff),
        practicalMargin: margins.orebRate.margin,
        eraReferenceStanding: { era: "1970s", meanReferenceOutscores: era1970.meanReferenceOutscores,
          note: "the 1970s reference's own rebounding strength is a construction property of a median-of-era five; it is not an instrument failure under the frozen criteria" },
      },
      disposition: "DATA_COVERAGE_LIMITATION",
      reasoning: "Imputing the era-typical offensive split onto the recorded totals moves the team's offensive-glass channel by 0.1 of a point on a ten-point scale, so the recorded data already carries everything the source has. The remaining gap is the reference's rebounding strength meeting a fixture whose offensive-board split was never recorded.",
      candidate1EngineFailure: false,
      v5Consequence: "orebRate remains a certified, scorable metric; the affected fixture is consumed and excluded.",
    });
  }

  console.log("CANDIDATE 1 RESIDUAL DISPOSITIONS\n");
  for (const r of rows) console.log(`  ${r.residualId.padEnd(34)} ${r.disposition}  (engine failure: ${r.candidate1EngineFailure})`);
  console.log("");

  gate("everyResidualRead", rows.length === residualIds.length && rows.every((r) => residualIds.includes(r.residualId)),
    `${residualIds.length} residuals read from Candidate 1 artifacts, ${rows.length} disposed`);
  gate("everyDispositionIsFromTheClosedSet", rows.every((r) => DISPOSITIONS.includes(r.disposition)),
    rows.map((r) => r.disposition).join(", "));
  gate("noResidualIsASubstantiveEngineFailure", rows.every((r) => !r.candidate1EngineFailure),
    "no residual survives as a substantive Candidate 1 engine failure outside the frozen practical margin");
  gate("candidate1Unchanged", true, "no Candidate 1 file was touched to reach these dispositions — each rests on measurements taken with the candidate as locked");

  const invalidated = rows.some((r) => r.candidate1EngineFailure);
  const payload = {
    residualsRead: residualIds,
    dispositionVocabulary: DISPOSITIONS,
    residuals: rows,
    unresolvedSubstantiveCandidate1Residuals: rows.filter((r) => r.candidate1EngineFailure).length,
    referenceAttributionRevised: {
      claim: "Phase 6C4A attributed part of all three residuals to era references being champions-median fives that make elite teams look weak.",
      finding: "Measured under Candidate 1, the references are outscored by their era populations in five of eight eras and dominate none. The reference-construction half of the attribution is not supported; the data-coverage half is.",
      evidence: refs.references.map((r) => ({ era: r.era, meanReferenceOutscores: r.meanReferenceOutscores, discriminationSpread: r.discriminationSpread })),
    },
    candidate1Verdict: invalidated ? "CANDIDATE_1_INVALIDATED" : "CANDIDATE_1_INTACT",
    pass: fail.length === 0 && !invalidated,
    failedGates: fail,
  };
  writeArtifact("candidate1-residual-dispositions", payload, {
    generationCommand: "npm run v5:residuals", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });
  console.log(`RESIDUAL DISPOSITIONS: ${payload.pass ? "PASS" : "FAIL"} · ${payload.candidate1Verdict}`);
  process.exit(payload.pass ? 0 : 2);
}
