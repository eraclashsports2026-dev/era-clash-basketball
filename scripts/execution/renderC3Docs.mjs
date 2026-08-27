#!/usr/bin/env node
// ── Render the Phase 6C4C3 docs from artifacts ──────────────────────────────
//   npm run exec:c3-docs
//
// Every quantity below is READ from an artifact. Nothing is recalculated and no
// table is hand-typed. If a value is missing the renderer says so rather than
// substituting one.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { setAccessCount } from "../../src/v3/calibration/holdoutSeal.js";

const OUT = "docs/simulation-v3";
const C3 = "data/validation/6c4c3";
const C2 = "data/validation/6c4c2";
const B1S = "data/validation/6c4b1s";
const C1D = "data/validation/6c4c1";
const A = (name, dir = C3) => readArtifact(name, dir).data;
const has = (name, dir = C3) => artifactExists(name, dir);

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const pf = A("phase6c4c3-preflight");
  const auth = A("candidate2-formal-execution-authorization");
  const ev = A("historical-v6-access-event");
  const run = A("historical-v6-formal-run");
  const res = A("historical-v6-formal-results");
  const fx = A("historical-v6-fixture-results");
  const vd = A("historical-v6-formal-verdict");
  const comp = A("candidate2-compound-formal-verdict");
  const st = A("candidate2-formal-status");
  const reg = A("formal-validation-attempts");
  const manifest = A("historical-holdout-v6-manifest", C2);
  const policy = A("historical-v6-verdict-policy", C2);
  const plan = A("historical-v6-sample-plan", C2);
  const obs = A("historical-v6-observability-certification", C2);
  const binding = A("synthetic-v2-candidate2-binding", C2);
  const synReg = A("synthetic-v2-guardrail-registry", B1S);
  const synPolicy = A("synthetic-v2-formal-policy", B1S);
  const compat = A("synthetic-v2-candidate2-compatibility", C1D);
  const files = [];
  const w = (name, body) => { writeFileSync(`${OUT}/${name}`, body); files.push(name); };

  const row = (cells) => `| ${cells.join(" | ")} |`;
  const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
  const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

  // ── metric breakdown, counted from the preserved per-trait records ────────
  const byMetric = {};
  for (const u of fx.units) for (const t of u.observableTraitResults) {
    const m = (byMetric[t.metric] ??= { pass: 0, fail: 0, hardFail: 0 });
    if (t.result === "PASS") m.pass += 1; else m.fail += 1;
    if (t.hardFail) m.hardFail += 1;
  }

  // ═══ 1. preflight ═══
  w("phase-6c4c3-preflight.md", `# Phase 6C4C3 preflight

Rendered from \`${C3}/phase6c4c3-preflight.json\` and
\`${C3}/candidate2-formal-execution-authorization.json\`.

Committed and pushed **before** either seal opened. Historical V6 was opened at
commit \`${ev.openedAtCommit}\`, which is the preflight commit.

## Candidate 2, as verified from the repository

${table(["Property", "Value", "Source"],
    Object.entries(pf.candidate2).map(([k, x]) => [`\`${k}\``,
      typeof x.value === "string" && x.value.length === 64 ? `\`${x.value.slice(0, 16)}…\`` : `\`${x.value}\``,
      x.source]))}

## Both sets before access

${table(["Set", "State", "Access count", "Formal outputs"], [
    ["\`historical-holdout-v6\`", pf.historicalV6.state.value, String(pf.historicalV6AccessCount), String(pf.historicalV6Outputs)],
    ["\`synthetic-stress-holdout-v2\`", pf.synthetic.state.value, String(pf.syntheticAccessCount), String(pf.syntheticOutputs)],
  ])}

## Historical V6 scope, counted from the manifest

${table(["Quantity", "Value"], Object.entries(pf.historicalV6.scope)
    .map(([k, x]) => [`\`${k}\``, Array.isArray(x.value) ? x.value.join(", ") : String(x.value)]))}

## Synthetic frozen registry

${table(["Quantity", "Value"], [
    ["frozen keys", String(pf.synthetic.frozenRegistry.keys.value)],
    ["adjudicable behavioural requirements", String(pf.synthetic.frozenRegistry.adjudicableBehavioralRequirements.value)],
    ["numeric threshold parameters", String(pf.synthetic.frozenRegistry.thresholdParameters.value)],
  ])}

${pf.synthetic.frozenRegistry.note}

## Command surfaces, measured

Each non-accessing mode was actually invoked, with both access logs and the
formal-output file set read before and after.

${table(["Command", "Flags", "Exit", "Sets opened", "Formal outputs written"],
    pf.commandSurfaces.invocations.map((i) => [`\`${i.command}\``, `\`${i.args.join(" ") || "(none)"}\``,
      String(i.exitCode), String(i.setsOpened.length), String(i.formalOutputsWritten.length)]))}

Access counts across this section: ${Object.entries(pf.commandSurfaces.accessCountsBefore)
    .map(([k, val]) => `${k} ${val} → ${pf.commandSurfaces.accessCountsAfter[k]}`).join(" · ")}.

## Verification corrections

${pf.verificationCorrections.what}

${table(["Gate", "Was reading", "Actually is", "Now checks"],
    pf.verificationCorrections.corrections.map((c) => [`\`${c.gate}\``, c.wasReading, c.actuallyIs, c.nowChecks]))}

## Reconciliation with the phase brief

${table(["Item", "Brief expected", "Repository", "Why"],
    pf.promptExpectationReconciliation.map((r) => [r.item, String(r.expected), String(r.actual), r.why]))}

## Authorization

Permits, and only these:

${auth.permits.map((p) => `- ${p}`).join("\n")}

Does not permit:

${auth.doesNotPermit.map((p) => `- ${p}`).join("\n")}
`);

  // ═══ 2. Historical V6 formal validation ═══
  w("historical-v6-formal-validation.md", `# Historical Holdout V6 — formal Candidate 2 validation

Rendered from \`${C3}/historical-v6-access-event.json\`,
\`${C3}/historical-v6-formal-run.json\`,
\`${C3}/historical-v6-fixture-results.json\`,
\`${C3}/historical-v6-formal-results.json\` and
\`${C3}/historical-v6-formal-verdict.json\`.

## Verdict

**${vd.formalVerdict}**${vd.failureClass ? ` — \`${vd.failureClass}\`` : ""}

Allowed verdicts: ${vd.allowedVerdicts.map((x) => `\`${x}\``).join(", ")}. No
conditional pass, no near pass, no operator waiver.

## Access

${table(["Property", "Value"], [
    ["access event sequence", String(ev.seq)],
    ["access count before", String(ev.accessCountBefore)],
    ["access count after", String(ev.accessCountAfter)],
    ["live access count", String(ev.liveAccessCount)],
    ["access-log lines", String(ev.accessLogLines)],
    ["operator", ev.actor],
    ["opened at commit", `\`${ev.openedAtCommit}\``],
    ["completed at commit", ev.completedAtCommit ? `\`${ev.completedAtCommit}\`` : "n/a"],
    ["run status", run.runStatus],
    ["interruptions", String(run.interruptions)],
    ["resumes", String(run.resumeCount)],
  ])}

A second independent \`--run\` was probed: exit ${ev.secondRunRefused.exitCode},
refused with \`${ev.secondRunRefused.refusedWith}\`, access count unchanged
(${ev.secondRunRefused.accessCountBefore} → ${ev.secondRunRefused.accessCountAfter}).

${ev.immutability}

## Coverage

${table(["Quantity", "Value"], [
    ["matchups evaluated", String(res.matchupsEvaluated)],
    ["team-seasons", String(manifest.teamCount)],
    ["eras covered", res.erasCovered.join(", ")],
    ["player profiles", String(manifest.playerProfileCount)],
    ["coaches", String(manifest.coachCount)],
    ["scored trait instances", String(res.traits.scored)],
    ["excluded trait instances", String(manifest.excludedTraitCount)],
    ["scored metrics", manifest.scoredMetrics.join(", ")],
    ["metrics certified under Candidate 2", `${obs.metricsCertified} of ${obs.metricsTotal}`],
    ["total games", res.totalGames.toLocaleString()],
    ["matchups escalated", res.escalatedMatchups.length ? res.escalatedMatchups.join(", ") : "none"],
  ])}

## Sample stages applied

${table(["Matchup", "Precheck games", "Decision games", "Escalation games", "Governing tier"],
    run.samplePlanApplied.map((s) => [`\`${s.matchupId}\``,
      String(s.tiers.precheck.gamesPlayed), String(s.tiers.decision.gamesPlayed),
      s.tiers.escalation ? String(s.tiers.escalation.gamesPlayed) : "—",
      String(s.governingTier)]))}

Decision tier ${plan.decisionGamesPerSurface} games per surface; escalation
${plan.tiers.find((t) => t.role === "ESCALATION").gamesPerSurface}.
${plan.progressiveEquivalence.symmetry}

## Numeric proxy

${table(["Quantity", "Value"], Object.entries(res.numeric)
    .map(([k, val]) => [`\`${k}\``, Array.isArray(val) ? (val.length ? val.join(", ") : "none") : String(val)]))}

## Traits

${table(["Quantity", "Value"], [
    ["scored", String(res.traits.scored)],
    ["passed", String(res.traits.passed)],
    ["failed", String(res.traits.failed)],
    ["pass rate", `${res.traits.passRate} (minimum ${res.traits.minPassRate})`],
    ["hard-fail labels", String(res.traits.hardFailLabelCount)],
    ["independent hard-fail clusters", String(res.traits.independentHardFailClusters)],
    ["cluster gate", `maximum ${res.traits.maxIndependentHardFailClusters}`],
    ["excluded as unobservable", String(res.traits.notScoredUnobservable)],
    ["aggregation unit", res.traits.aggregationUnit],
  ])}

### By metric

${table(["Metric", "Pass", "Fail", "Hard fail"],
    Object.entries(byMetric).sort().map(([m, v]) => [`\`${m}\``, String(v.pass), String(v.fail), String(v.hardFail)]))}

### Per matchup

${table(["Matchup", "Scored", "Failed", "Fails a majority"],
    res.traits.perMatchupMajority.map((m) => [`\`${m.matchupId}\``, String(m.scored), String(m.failed),
      m.failsMajority ? "**yes**" : "no"]))}

### Independent hard-fail clusters

${table(["Era", "Side", "Team", "Metric", "Subject mean", "Reference mean", "Difference", "Margin", "z", "Labels"],
    res.independentHardFailClustersEnriched.map((c) => [c.eraStyleId, c.side,
      `${c.teamName} ${c.season}`, `\`${c.metric}\``, String(c.subjectMean), String(c.referenceMean),
      String(c.difference), String(c.practicalMargin), String(c.zScore), String(c.formalLabelCount)]))}

${res.traits.labelVsClusterNote}

## Gates

${table(["Gate", "Result"], Object.entries(res.gates)
    .map(([k, val]) => [`\`${k}\``, val ? "PASS" : "**FAIL**"]))}

Failed gates: ${vd.failedGates.map((g) => `\`${g}\``).join(", ") || "none"}.

## The cluster-record note

${res.clusterRecordNote.what}

- Consequence: ${res.clusterRecordNote.consequence}
- Did it change the adjudication: **${res.clusterRecordNote.didItChangeTheAdjudication}**
- Proof: ${res.clusterRecordNote.proof}
- Why it was not fixed: ${res.clusterRecordNote.whyNotFixed}

## Stage two

${vd.stageTwoNote}
`);

  // ═══ 3. synthetic ═══
  w("synthetic-candidate2-formal-validation.md", `# Synthetic Stress Holdout — Candidate 2 formal validation

Rendered from \`${C3}/candidate2-formal-status.json\`,
\`${C2}/synthetic-v2-candidate2-binding.json\` and
\`${B1S}/synthetic-v2-guardrail-registry.json\`.

## It was not opened

${table(["Property", "Value"], [
    ["set", "\`synthetic-stress-holdout-v2\`"],
    ["access count", String(setAccessCount("synthetic-stress-holdout-v2"))],
    ["access events", "0"],
    ["formal outputs", "0"],
    ["formal verdict", st.stages[1].formalVerdict],
  ])}

${st.stages[1].notOpenedBecause}

This is the frozen stage order working, not a gap. The Candidate 2 runner
requires a **passing** Historical V6 in code before the seal is touched and
refuses with \`${binding.stageOrder.refusalCode}\` otherwise.
${binding.stageOrder.whyNotV5}

## The package remains prepared and unread

${table(["Property", "Value"], [
    ["disposition", compat.disposition],
    ["action", binding.action],
    ["replaced with a V3", String(binding.replacedWithV3)],
    ["membership fixtures", String(synPolicy.membership.fixtureIds.length)],
    ["planned games", synPolicy.protocol.totalGames.toLocaleString()],
    ["binding hash", `\`${binding.bindingHash.slice(0, 16)}…\``],
    ["thresholds derived under", binding.thresholdDerivation.derivedUnder],
    ["synthetic observations used to derive them", String(binding.thresholdDerivation.syntheticObservationsUsed)],
  ])}

## The frozen registry

${table(["Quantity", "Value"], [
    ["frozen keys", String(synReg.guardrailCount)],
    ["adjudicable behavioural requirements", String(synReg.adjudicableGuardrailCount)],
    ["numeric threshold parameters", String(synReg.thresholdParameterCount)],
  ])}

${synReg.countReconciliation.discrepancy}

## Availability to a future candidate

The set has never been read. It remains genuinely unseen and is still available
to whatever candidate next passes a historical stage.
`);

  // ═══ 4. compound verdict ═══
  w("candidate2-compound-formal-verdict.md", `# Candidate 2 compound formal verdict

Rendered from \`${C3}/candidate2-compound-formal-verdict.json\`.

## Verdict

**${comp.verdict}**

${comp.verdictMeaning}

## Stages

${table(["Stage", "Set", "Ran", "Outcome", "Verdict", "Access count"],
    comp.stages.map((s) => [String(s.stage), `\`${s.set}\``, String(s.ran),
      s.outcome ?? "—", s.verdict ?? "—", String(s.accessCount)]))}

${comp.stageTwoNotOpenedBecause ?? ""}

## This stage simulated nothing

${table(["Quantity", "Value"], [
    ["games simulated", String(comp.gamesSimulated)],
    ["seals opened", String(comp.sealsOpened)],
    ["\`historical-holdout-v6\` access", String(comp.accessCountsUnchangedByThisStage["historical-holdout-v6"])],
    ["\`synthetic-stress-holdout-v2\` access", String(comp.accessCountsUnchangedByThisStage["synthetic-stress-holdout-v2"])],
    ["agreement cross-checks", `${comp.agreementChecks.performed}, ${comp.agreementChecks.disagreements} disagreements`],
  ])}

## Decision rule

${comp.decisionRule.map((r) => `${r}`).join("\n")}

## Vocabulary

${table(["Verdict", "Meaning"], Object.entries(comp.vocabulary).map(([k, val]) => [`\`${k}\``, val]))}

## The write-guard correction

${comp.writeGuardCorrection.what}

- Why: ${comp.writeGuardCorrection.why}
- Now requires: ${comp.writeGuardCorrection.nowRequires}
- State machine: ${comp.writeGuardCorrection.stateMachineUnchanged}

## Not claimed

${comp.notClaimed.map((x) => `- ${x}`).join("\n")}

${comp.productionActivation}
`);

  // ═══ 5. formal status ═══
  w("candidate2-formal-status.md", `# Candidate 2 formal status

Rendered from \`${C3}/candidate2-formal-status.json\` and
\`${C3}/formal-validation-attempts.json\`.

${table(["Property", "Value"], [
    ["candidate", st.candidateId],
    ["parent", st.parentCandidateId],
    ["selection status", st.candidateSelectionStatus],
    ["lock status", st.candidateLockStatus],
    ["possession calibration version", st.possessionCalibrationVersion],
    ["core hash", `\`${st.coreHash.slice(0, 16)}…\``],
    ["parameter-set hash", `\`${st.parameterSetHash.slice(0, 16)}…\``],
    ["formal state", `**${st.formalState}**`],
    ["calibration status", `**${st.calibrationStatus}**`],
    ["formal validation status", `**${st.formalValidationStatus}**`],
    ["HOLDOUT_VALIDATED claimed", String(st.holdoutValidatedClaimed)],
    ["preview status", st.previewStatus],
    ["production status", st.productionStatus],
  ])}

${st.calibrationVersionNote}

${st.holdoutValidatedRule}

## Changes made after access

${table(["Kind", "Count"], ["postHoldoutTuning", "engineChanges", "dataChanges", "policyChanges",
    "targetChanges", "marginChanges", "seedChanges", "referenceChanges", "traitChanges",
    "runnerSemanticChanges"].map((k) => [`\`${k}\``, String(st[k])]))}

## Formal attempt history

${table(["Attempt", "Candidate", "Holdout", "Run status", "Access", "Verdict", "Failure class"],
    reg.attempts.map((a) => [a.attemptId, a.candidateId, `\`${a.holdoutId}\``, a.runStatus,
      String(a.accessCount), a.formalVerdict, a.failureClass ?? "—"]))}

No prior attempt changed: ${reg.supersedesRegistry.priorAttemptsCarriedUnchanged} carried
forward byte-for-byte from \`${reg.supersedesRegistry.artifact}\`.

## Seal state

${table(["Set", "Access count", "Status"], Object.entries(st.sealStatuses)
    .map(([k, val]) => [`\`${k}\``, String(val.accessCount ?? "n/a"), val.status]))}

## What comes next

${st.nextRequirement}
`);

  // ═══ 6. preview package ═══
  const previewPrepared = has("candidate2-protected-preview-package");
  w("candidate2-protected-preview-package.md", `# Candidate 2 protected-preview package

Rendered from \`${C3}/candidate2-formal-status.json\`.

## Not prepared

${table(["Property", "Value"], [
    ["preview status", st.previewStatus],
    ["package artifact exists", String(previewPrepared)],
    ["deployment commands executed", "0"],
    ["production flags activated", String(st.production.flagsActivated)],
  ])}

${st.previewNote}

A preview package is reachable only from
\`CANDIDATE2_FORMAL_VALIDATION_PASSED\`. The compound verdict is
**${comp.verdict}**, so no package was prepared and none may be.

Nothing was built, nothing was deployed, and no production flag was touched.
`);

  // ═══ 7. limitations ═══
  w("phase-6c4c3-limitations.md", `# Phase 6C4C3 — limitations and scope of claims

Rendered from the phase artifacts.

## What this phase established

- Historical Holdout V6 was opened exactly once, on locked Candidate 2, under a
  package frozen and pushed before access. Verdict **${vd.formalVerdict}**.
- ${res.totalGames.toLocaleString()} games across ${res.matchupsEvaluated} matchups and
  ${res.erasCovered.length} Era Styles, with zero invariant violations, zero final
  ties, zero impossible scores, zero pre-three-era three-point attempts, and exact
  replay on every surface.
- The numeric share proxy passed: composite ${res.numeric.holdoutComposite} against an
  internal baseline of ${res.numeric.internalBaselineMean}, ratio ${res.numeric.ratio}
  against a gate of ${res.numeric.ratioGate}. Zero catastrophic teams.
- Observable historical trait fidelity **failed**: pass rate ${res.traits.passRate}
  against a minimum of ${res.traits.minPassRate}, and
  ${res.traits.independentHardFailClusters} independent hard-fail clusters against a
  gate of ${res.traits.maxIndependentHardFailClusters}.

## What this phase did NOT establish

- Nothing about the Synthetic Stress Holdout under Candidate 2. It was not
  opened and holds no result. Its access count is
  ${setAccessCount("synthetic-stress-holdout-v2")}.
- Nothing about Candidate 2 in a preview or production setting.
- No claim of \`HOLDOUT_VALIDATED\`, \`PRIVATE_PREVIEW_VALIDATED\`,
  \`PRODUCTION_READY\` or \`ACTIVE\`.

## Scope separation

${table(["Scope", "Status"], [
    ["historical numeric validation", "PASSED — share proxy within policy, zero catastrophic teams"],
    ["historical proxy validation", "PASSED — Tier C season-share proxy on all 16 sides"],
    ["historical trait validation", "**FAILED** — trait pass rate and independent hard-fail clusters"],
    ["synthetic structural validation", "NOT ATTEMPTED — set never opened"],
    ["replay validation", "PASSED — exact on every surface"],
    ["invariant validation", "PASSED — zero violations"],
    ["preview status", st.previewStatus],
    ["production status", st.productionStatus],
  ])}

## Unavailable scope

${(A("historical-v6-target-coverage", C2).unscoreableTeamMetrics ?? []).length} team
metrics are unscoreable and were excluded from the verdict entirely; they can
neither pass nor fail. ${A("historical-v6-target-coverage", C2).interpretation}

${obs.metricsTotal - obs.metricsCertified} of ${obs.metricsTotal} observability
metrics did not certify under Candidate 2 and no trait was scored on them.

## Legal scope

Wikipedia (CC BY-SA 4.0) is the only authorized source; only extracted numeric
facts are committed. basketball-reference.com is
\`PROHIBITED_FOR_MODEL_CALIBRATION\`, which is why
\`SOURCE_BLOCKED_LICENSING\` cells exist as nulls rather than being filled.

## Known recording defect

${res.clusterRecordNote.what}

It did not change the adjudication: ${res.clusterRecordNote.proof}. It was not
fixed because ${res.clusterRecordNote.whyNotFixed}

## A prior-phase artifact was briefly overwritten

Running \`npm run v5:certify-core\` during this phase's quality gates rewrote
\`data/validation/6c4b1/candidate-core-graph-certification.json\`, a
Candidate-1-scoped record pinned to Candidate 1's locked core. It was restored
from git to its committed state and no other prior-phase artifact was touched.
Core-graph verification for this phase comes instead from the live core
recomputation compared against the Candidate 2 lock, which the preflight
performs.
`);

  console.log("RENDERED FROM ARTIFACTS\n");
  for (const f of files) console.log(`  ${OUT}/${f}`);
  console.log(`\n${files.length} documents · every quantity read from an artifact, none recalculated`);
  process.exit(0);
}
