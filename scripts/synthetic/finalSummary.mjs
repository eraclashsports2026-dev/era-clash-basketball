#!/usr/bin/env node
// ── WS13: the phase summary ─────────────────────────────────────────────────
//   npm run syn:summary
//
// What was built, what was found by measuring rather than by reasoning, what is
// now executable, and what this phase does not claim.
import { createHash } from "node:crypto";
import { writeArtifact, readArtifact } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";
import { DIR, git } from "./preflight.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const R = (n) => readArtifact(n, DIR).data;
  const rdy = R("phase6c4b1s-final-readiness");
  const pol = R("synthetic-v2-formal-policy");
  const mar = R("synthetic-v2-practical-margins");
  const sed = R("synthetic-v2-seeds");
  const dry = R("synthetic-v2-dry-run");
  const pkg = R("compound-formal-validation-package-v2");
  const ev = R("synthetic-v2-margin-evidence");
  const lad = R("synthetic-v2-talent-gap-ladder");

  const payload = {
    phase: "6C4B1S", phaseType: "PREPARATION_ONLY",
    title: "Synthetic Stress Holdout V2 formal policy, seeds, runner and execution-package certification",
    outcome: rdy.pass ? "PACKAGE_COMPLETE_AND_CERTIFIED" : "INCOMPLETE",

    whatWasBuilt: [
      `a machine-readable registry of all ${pol.guardrails.frozenKeyCount} frozen guardrail keys, ${pol.guardrails.adjudicableCount} adjudicable and ${pol.guardrails.thresholdParameterCount} threshold parameters, mapped to fixtures, metrics and surfaces`,
      "five measurement surfaces, each chosen because the guardrail it decides is decidable there",
      `practical margins derived by a stated rule from ${ev.fixtures.length} non-holdout development fixtures plus a ${lad.cells.length}-cell role-matched upgrade ladder`,
      "a per-fixture verdict schema and a frozen aggregation rule over sixteen fixtures",
      `a sample plan of ${pol.protocol.totalGames.toLocaleString()} games, frozen before any synthetic observation`,
      `a dedicated seed domain, ${sed.volume.plannedAddresses.toLocaleString()} addressed seeds, zero overlap across ${sed.disjointnessProof.comparisons} comparisons against ${sed.disjointnessProof.priorPopulationsChecked} prior populations`,
      "a transactional runner on the same runSealedSetOnce path V4 and V5 use, with stage-order enforcement before the seal is touched",
      `a non-holdout mock stress set and a ${dry.checkCount}-check dry run of the exact runner`,
      "three registered npm commands, certified non-accessing by execution rather than by inspection",
      `a compound package binding ${pkg.boundHashCount} hashes across both stages`,
    ],

    whatMeasurementFoundThatReasoningHadMissed: [
      { finding: "the rating basis was wrong",
        detail: "the guardrails speak of OVR, which is src/rating.js — the position-weighted rating the product computes and displays. An earlier draft used a summed-stat proxy invented for this phase. A calibration ladder exposed it: a five the proxy rated 1.75x higher lost about 60% of games in all three eras, because the proxy tracked accolade counts while the engine responds to position-weighted production and balance.",
        consequence: "every surface, control and threshold moved to teamRating and slotRating" },
      { finding: "the talent surface could not isolate talent",
        detail: "targeting a rating level lets the search return a differently CONSTRUCTED five, and construction is the other axis under test. The strong side is now built by upgrading the fixture slot by slot, preserving position and functional role.",
        consequence: "13 of 14 development upgrades win; the one exception has the smallest upgrade in the set and falls below the 1.25x precondition" },
      { finding: "a mirror cannot decide the shell guardrail",
        detail: "with one coach on both sides both defences draw zone with equal probability, so the zoning side is noise. Measured on four development fixtures the win rate came back 0.499, 0.521, 0.523 and 0.505 — pinned to 0.5, where the frozen band can neither fail nor pass.",
        consequence: "the guardrail moved to an asymmetric coach-pair surface with a zone-ablation twin to separate the coach confound from the shell" },
      { finding: "coherence has to be a hard constraint of the control search, not a tie-break",
        detail: "interior scoring is the scarce requirement — 16 of 292 non-holdout cards reach postThreat 5.5 — and a rating-targeted beam prunes those cards away before coherence is evaluated. The first version returned 0 of 5 coherent controls.",
        consequence: "the search anchors on the scarce requirements first and keeps only fully coherent fives" },
      { finding: "a control can land on the wrong side of the rating it is meant to be below",
        detail: "sd2-extreme-small is rated below what a coherent five can cost, so an unconstrained search returned a control at ratio 1.143 with a 0.777 win rate that would have read as construction beating talent when it was the better team winning.",
        consequence: "the builder refuses and reports CONTROL_PRECONDITION_UNREACHABLE; the guardrail becomes NOT_APPLICABLE on that fixture" },
      { finding: "the compound package silently dropped four hashes",
        detail: "the two stages share four hash key names, so a flat merge bound stage two's values under stage one's names and left stage one unbound. The package hash covered 16 entries where it should have covered 20 — the same class of silent binding gap the blocker was raising.",
        consequence: "entries are namespaced by stage, with gates on the count and on each stage-one value" },
      { finding: "a dry run at 16 games per surface fails on noise",
        detail: "six of eleven mock members FAILed win-rate bands with zero failures on the count-based structural gates; a win rate carries a standard error near 0.125 there. At 128 games per surface every member passes.",
        consequence: "the default volume moved to 64 pairs and the check now names which gates failed and why" },
    ],

    judgementCallsRecordedRatherThanHidden: [
      { call: "eleven guardrail keys registered, not ten",
        why: "the frozen object holds eleven: eight boolean requirements and three numeric thresholds. Both the brief and the blocker's own note say ten. Merging the thresholds into their parents would reach ten but would silently reinterpret the frozen object, so all eleven are registered, the numerics are classified THRESHOLD_PARAMETER, and the discrepancy is recorded." },
      { call: "the construction floor is weak, and says so",
        why: `on non-holdout fixtures a coherent control at 80% of the fixture's teamRating won between ${mar.derivedThresholds.constructionWinRateFloor.evidence.min} and ${mar.derivedThresholds.constructionWinRateFloor.evidence.max}, a spread driven by which construction it faced. Any floor high enough to be demanding would fail legitimate constructions. The substantive claim moved to a set-level existential bar at ${mar.derivedThresholds.constructionExistentialBar.value}, because the frozen key says construction CAN beat higher OVR.` },
      { call: "the talent floor was clamped to 0.5",
        why: `the derivation rule produced ${mar.derivedThresholds.talentWinRateFloor.rawDerivedValue}, which would have said a substantially upgraded five is allowed to lose. Both the raw value and the clamp are recorded.` },
      { call: "zero fixture failures tolerated on every guardrail",
        why: "a failure budget would weaken a frozen numeric threshold, which this phase may not do. Noise is handled by the practical margin instead: an observation inside the margin is INDETERMINATE, never a failure." },
      { call: "the distinct-scoreline ratio never adjudicates",
        why: "it read about 0.486 at 102 games and 0.356 to 0.399 at 2,048 on the same fixtures, so one frozen floor cannot serve two volumes. The combined-score standard deviation adjudicates instead." },
      { call: "the shell guardrail maps to all sixteen fixtures, not the two labelled ZONE_EDGE_CASE",
        why: "a purpose label says what a fixture was designed to stress; a guardrail applies wherever its claim is decidable, and 'universally' cannot be judged from one fixture. Era legality narrows it to nine." },
      { call: "three development fixtures excluded from the mock set",
        why: "each shares four of five people with a sealed five, putting it one substitution away. Running those at volume would produce a close proxy for a sealed result." },
    ],

    whatWasNotDone: {
      holdoutsOpened: 0,
      historicalV5AccessCount: setAccessCount("historical-holdout-v5"),
      syntheticV2AccessCount: setAccessCount("synthetic-stress-holdout-v2"),
      sealedFixturesSimulated: 0,
      candidate1FilesChanged: 0,
      frozenThresholdsChanged: 0,
      membershipChanged: false,
      historicalV5PackageChanged: false,
      previewDeployments: 0, productionDeployments: 0, mergedToMain: false,
    },

    statusesNotClaimed: rdy.statusesNotClaimed,
    stillNotTrue: rdy.stillNotTrue,

    nextPhase: {
      shape: "an execution phase, in this order",
      steps: [
        'npm run validation:historical-v5 -- --unlock-holdout --unlock-historical-holdout-v5 --operator="..." --reason="..."',
        "if and only if stage one returns PASS: npm run validation:synthetic-v2 with its own unlock flags",
        "npm run validation:candidate1-formal-verdict",
      ],
      preconditionAlreadyEnforced: "stage two's runner refuses with SYNTHETIC_ACCESS_REFUSED unless stage one returned PASS on the same candidate core and parameter set, so the order cannot be got wrong by accident",
    },

    hashes: rdy.hashes,
    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    pass: rdy.pass,
  };
  payload.summaryHash = createHash("sha256").update(JSON.stringify({
    outcome: payload.outcome, hashes: payload.hashes, notDone: payload.whatWasNotDone })).digest("hex");
  writeArtifact("phase6c4b1s-final-summary", payload, {
    generationCommand: "npm run syn:summary", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  console.log("PHASE 6C4B1S SUMMARY\n");
  console.log(`  outcome: ${payload.outcome}\n`);
  console.log("  what measurement found that reasoning had missed:");
  for (const f of payload.whatMeasurementFoundThatReasoningHadMissed) console.log(`    · ${f.finding}`);
  console.log("\n  judgement calls recorded rather than hidden:");
  for (const j of payload.judgementCallsRecordedRatherThanHidden) console.log(`    · ${j.call}`);
  console.log(`\n  holdouts opened: ${payload.whatWasNotDone.holdoutsOpened} · sealed fixtures simulated: ${payload.whatWasNotDone.sealedFixturesSimulated} · deployments: ${payload.whatWasNotDone.previewDeployments + payload.whatWasNotDone.productionDeployments}`);
  console.log(`  summaryHash ${payload.summaryHash.slice(0, 16)}...`);
  process.exit(payload.pass ? 0 : 2);
}
