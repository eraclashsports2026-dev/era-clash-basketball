#!/usr/bin/env node
// ── WS4: per-fixture verdict schema and the aggregation rule ─────────────────
//   npm run syn:verdict-policy
//
// The blocker's second missing component: "NO frozen rule turns per-fixture
// guardrail outcomes into a set verdict. The guardrails are per-fixture
// predicates; the pass/fail arithmetic over 16 fixtures is undefined."
//
// Both artifacts are frozen here, before any Synthetic V2 result exists, so the
// arithmetic cannot be chosen once a marginal number is on the table.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { buildRegistry } from "./guardrailRegistry.mjs";
import { DIR } from "./preflight.mjs";

/** The only outcomes a single guardrail on a single fixture may take. */
export const CELL_OUTCOMES = Object.freeze({
  PASS: "measured, decided, and inside the frozen threshold by at least the practical margin",
  FAIL: "measured, decided, and outside the frozen threshold by at least the practical margin",
  INDETERMINATE: "measured but not decidable — the observation sits inside the practical margin of the threshold, or the surface result is confounded beyond attribution. Contributes no pass credit and no failure.",
  NOT_APPLICABLE: "the surface does not exist for this fixture, so the claim cannot be posed at all. Contributes no pass credit and no failure, and is never recorded as zero.",
  NOT_MEASURED: "the run did not produce the games this cell needs. An apparatus fault, not a candidate result.",
});
/** The only verdicts a fixture may take. */
export const FIXTURE_VERDICTS = Object.freeze({
  PASS: "every adjudicable guardrail mapped to this fixture is PASS or NOT_APPLICABLE, at least one is PASS, and no cell is FAIL or NOT_MEASURED",
  FAIL: "at least one adjudicable guardrail mapped to this fixture is FAIL",
  INVALID_RUN: "the fixture's games are missing, incomplete, or inconsistent with the frozen seed addressing — the apparatus failed, so the fixture carries no candidate verdict",
});
/** The only verdicts the set may take. */
export const SET_VERDICTS = Object.freeze({
  SYNTHETIC_HOLDOUT_V2_PASS: "no fixture FAILed, no fixture was INVALID_RUN, and every required guardrail was decided PASS on at least its minimum number of applicable fixtures",
  SYNTHETIC_HOLDOUT_V2_FAIL: "at least one fixture FAILed",
  SYNTHETIC_HOLDOUT_V2_INVALID_RUN: "no fixture FAILed but the run cannot support a PASS — a fixture was INVALID_RUN, or a required guardrail was never decided on enough fixtures",
});

/**
 * The two definitions the brief requires be frozen rather than left to the
 * runner's judgement.
 */
export const FROZEN_DEFINITIONS = Object.freeze({
  universalDominance: {
    term: "universal dominance",
    definition: "A single action family or a single defensive shell is dominant on a fixture when its measured share (action family: share of that side's possessions; shell: win rate of the zoning side) lies outside the frozen threshold for that fixture by at least the practical margin. Dominance is UNIVERSAL when it occurs on a fixture at all: the frozen thresholds maxSingleActionFamilyShare, maxSingleShellWinRate and minSingleShellWinRate are per-fixture ceilings and floors, so the guardrail is evaluated per fixture and no fixture is permitted to breach one.",
    whyNotAFailureBudget: "A failure budget — 'k of 16 fixtures may breach' — would weaken a frozen numeric threshold, which this phase may not do. The protection against a noise-driven failure is the practical margin, not a tolerance for real breaches: an observation within the margin of the threshold is INDETERMINATE, never FAIL. So the strict reading costs nothing in robustness and invents no allowance the frozen policy does not contain.",
    measuredOn: "action-family share on MIRROR; shell win rate on ZONE_ASYMMETRIC. A mirror cannot decide the shell claim: with the same coach on both sides both defences draw zone with equal probability, so the zoning side is whichever side happened to draw more and the win rate is pinned to 0.5 by construction.",
  },
  constructionBeatingHigherOvr: {
    term: "better construction beating higher card rating",
    definition: "On the VS_COHERENT_LOWER_CONTROL surface a coherent five whose summed card rating is strictly below the fixture's, under the neutral coach on both sides and side-balanced, wins at least the frozen construction floor share of decided games. Coherence is the six-check functional definition in the surface plan (a lead creator, creation not collided, spacing, rim protection, interior scoring, a passer) evaluated on the intelligence profile rather than on card accolades.",
    whatItDoesNotClaim: "It does not require the weaker roster to WIN the matchup. The claim is that construction is CAPABLE of overcoming a card-rating deficit — a floor on the lower-rated side's win rate — not that it usually does. A rule that required the weaker five to win outright would fail an engine in which talent correctly matters.",
    itsMirrorImage: "requireExtremeTalentRemainsMeaningful is the same axis measured at the other end, on VS_TALENT_GAP_CONTROL: a large rating gap must still move the win rate clearly away from a coin flip. The two guardrails bracket the axis, so an engine cannot satisfy both by flattening talent or by making talent absolute.",
  },
});

export const buildPolicy = () => {
  const { guardrails, adjudicable } = buildRegistry();
  const surfacePlan = readArtifact("synthetic-v2-surface-plan", DIR).data;
  const samplePlan = readArtifact("synthetic-v2-sample-plan", DIR).data;

  // How many of a guardrail's mapped fixtures must actually be DECIDED for the
  // set to be eligible for PASS. Without this, a run in which everything came
  // back INDETERMINATE would pass by absence of failure.
  const rows = adjudicable.map((g) => {
    const mapped = g.fixtureIds;
    const applicable = mapped.filter((fid) => {
      const p = surfacePlan.holdoutFixturePlan.find((x) => x.fixtureId === fid);
      if (!p) return false;
      // a guardrail decided on ZONE_ASYMMETRIC needs a zone-legal era
      if (g.guardrailId === "forbidUniversalShellDominance") return p.zoneLegalEra;
      return true;
    });
    const minDecided = applicable.length === 0 ? 0 : Math.max(1, Math.ceil(applicable.length * 2 / 3));
    return { guardrailId: g.guardrailId, formalClass: g.formalClass, catastrophic: Boolean(g.adjudication?.catastrophic),
      mappedFixtures: mapped.length, applicableFixtures: applicable.length, applicableFixtureIds: applicable,
      minDecidedFixturesForSetPass: minDecided,
      notApplicableFixtureIds: mapped.filter((f) => !applicable.includes(f)),
      notApplicableTreatment: "NOT_APPLICABLE — no pass credit, no failure contribution, never recorded as zero" };
  });
  return { guardrails, adjudicable, rows, surfacePlan, samplePlan };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const refreeze = process.argv.includes("--refreeze");
  if (artifactExists("synthetic-v2-verdict-schema", DIR) && !refreeze) {
    console.log("verdict schema already exists — pass --refreeze to re-issue it."); process.exit(0);
  }
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };
  const { adjudicable, rows, surfacePlan, samplePlan } = buildPolicy();

  console.log("SYNTHETIC V2 VERDICT SCHEMA AND AGGREGATION RULE\n");
  for (const r of rows) {
    console.log(`  ${r.guardrailId.padEnd(38)} ${r.formalClass.padEnd(22)} applicable ${String(r.applicableFixtures).padStart(2)}/${String(r.mappedFixtures).padStart(2)}  minDecided ${r.minDecidedFixturesForSetPass}${r.catastrophic ? "  CATASTROPHIC" : ""}`);
  }
  console.log("");

  gate("everyAdjudicableGuardrailHasAnAggregationRow",
    rows.length === adjudicable.length,
    `${adjudicable.length} adjudicable guardrails, ${rows.length} aggregation rows`);
  gate("everyGuardrailHasAtLeastOneApplicableFixture",
    rows.every((r) => r.applicableFixtures >= 1),
    rows.filter((r) => r.applicableFixtures < 1).map((r) => r.guardrailId).join(", ") || "every guardrail can be decided somewhere");
  gate("minDecidedIsNeverZeroWhereApplicable",
    rows.every((r) => r.applicableFixtures === 0 || r.minDecidedFixturesForSetPass >= 1),
    "no required guardrail can be satisfied by an all-INDETERMINATE result");
  gate("shellGuardrailRestrictedToZoneLegalEras",
    rows.find((r) => r.guardrailId === "forbidUniversalShellDominance").applicableFixtures === surfacePlan.zoneDecidableFixtureCount,
    `${rows.find((r) => r.guardrailId === "forbidUniversalShellDominance").applicableFixtures} applicable fixtures matches the ${surfacePlan.zoneDecidableFixtureCount} zone-legal fixtures in the surface plan`);
  gate("noFailureBudgetWeakensAFrozenThreshold",
    FROZEN_DEFINITIONS.universalDominance.whyNotAFailureBudget.includes("weaken a frozen numeric threshold"),
    "zero fixture failures are tolerated on every guardrail; noise is handled by the practical margin, not by a tolerance for real breaches");
  gate("catastrophicGuardrailsIdentified",
    rows.filter((r) => r.catastrophic).length === 3,
    `${rows.filter((r) => r.catastrophic).map((r) => r.guardrailId).join(", ")} — a failure here also renders every non-structural cell on that fixture INDETERMINATE, so a broken game cannot grant pass credit elsewhere`);
  gate("bothRequiredDefinitionsFrozen",
    Boolean(FROZEN_DEFINITIONS.universalDominance.definition && FROZEN_DEFINITIONS.constructionBeatingHigherOvr.definition),
    "universal dominance and construction-beating-higher-rating are both defined here rather than left to the runner");
  gate("verdictVocabulariesAreClosed",
    Object.keys(CELL_OUTCOMES).length === 5 && Object.keys(FIXTURE_VERDICTS).length === 3 && Object.keys(SET_VERDICTS).length === 3,
    `${Object.keys(CELL_OUTCOMES).length} cell outcomes, ${Object.keys(FIXTURE_VERDICTS).length} fixture verdicts, ${Object.keys(SET_VERDICTS).length} set verdicts`);

  const schema = {
    syntheticVerdictSchemaVersion: "1.0.0",
    cellOutcomes: CELL_OUTCOMES, fixtureVerdicts: FIXTURE_VERDICTS,
    perFixtureRecord: {
      required: ["fixtureId", "purpose", "era", "coach", "verdict", "cells", "games", "seedAddresses",
        "measuredMetrics", "surfacesRun", "replayMismatchCount", "structural"],
      cellShape: { guardrailId: "string", outcome: "one of the five cell outcomes",
        observed: "number or null — null is never coerced to zero", standardError: "number or null",
        threshold: "the frozen threshold this cell was compared against, or null",
        practicalMargin: "number", marginSatisfied: "boolean or null",
        surface: "the surface the observation came from", reason: "why an INDETERMINATE, NOT_APPLICABLE or NOT_MEASURED outcome is that outcome" },
    },
    catastrophicRule: "if a catastrophic guardrail (requireZeroInvariantFailures, requireZeroImpossibleResults, requireSameSeedReplay) FAILs on a fixture, that fixture's verdict is FAIL and every non-structural cell on it becomes INDETERMINATE, because those observations were measured on games the engine itself contradicts. A broken game must not grant pass credit to anything measured alongside it.",
    nullPolicy: "an unmeasurable metric stays null and its cell is NOT_APPLICABLE or NOT_MEASURED. It never becomes zero, never contributes pass credit, and never contributes failure.",
    frozenDefinitions: FROZEN_DEFINITIONS,
    pass: fail.length === 0, failedGates: fail,
  };
  schema.schemaHash = createHash("sha256").update(JSON.stringify({ CELL_OUTCOMES, FIXTURE_VERDICTS, FROZEN_DEFINITIONS })).digest("hex");
  writeArtifact("synthetic-v2-verdict-schema", schema, {
    generationCommand: "npm run syn:verdict-policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  const aggregation = {
    syntheticAggregationPolicyVersion: "1.0.0",
    frozenBeforeAnyResult: true,
    setVerdicts: SET_VERDICTS,
    rule: [
      "1. Compute every guardrail-fixture cell from the frozen thresholds and the frozen practical margins. A cell is PASS or FAIL only if the observation clears the threshold by at least the practical margin; inside the margin it is INDETERMINATE.",
      "2. Apply the catastrophic rule: a failed structural or determinism guardrail makes its fixture FAIL and every non-structural cell on that fixture INDETERMINATE.",
      "3. A fixture's verdict is FAIL if any of its cells is FAIL; INVALID_RUN if any required cell is NOT_MEASURED; otherwise PASS provided at least one cell is PASS.",
      "4. The set verdict is SYNTHETIC_HOLDOUT_V2_FAIL if any fixture is FAIL.",
      "5. Otherwise the set verdict is SYNTHETIC_HOLDOUT_V2_INVALID_RUN if any fixture is INVALID_RUN, or if any adjudicable guardrail was decided PASS on fewer than its minDecidedFixturesForSetPass applicable fixtures.",
      "6. Otherwise the set verdict is SYNTHETIC_HOLDOUT_V2_PASS.",
    ],
    fixtureFailureTolerance: {
      perGuardrailAllowedFailures: 0,
      justification: FROZEN_DEFINITIONS.universalDominance.whyNotAFailureBudget,
    },
    guardrails: rows,
    indeterminateProtection: "a run cannot pass by being unmeasurable: every adjudicable guardrail must be decided PASS on at least two thirds of its applicable fixtures, rounded up, and never fewer than one.",
    inputs: { surfacePlanHash: surfacePlan.surfacePlanHash, samplePlanHash: samplePlan.samplePlanHash },
    pass: fail.length === 0, failedGates: fail,
  };
  aggregation.aggregationHash = createHash("sha256").update(JSON.stringify({ rule: aggregation.rule,
    rows: rows.map((r) => [r.guardrailId, r.applicableFixtures, r.minDecidedFixturesForSetPass]) })).digest("hex");
  writeArtifact("synthetic-v2-aggregation-policy", aggregation, {
    generationCommand: "npm run syn:verdict-policy", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log(`\nVERDICT POLICY: ${fail.length === 0 ? "PASS" : `FAIL (${fail.join(", ")})`}`);
  console.log(`  schemaHash      ${schema.schemaHash.slice(0, 16)}...`);
  console.log(`  aggregationHash ${aggregation.aggregationHash.slice(0, 16)}...`);
  process.exit(fail.length === 0 ? 0 : 2);
}
