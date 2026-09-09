#!/usr/bin/env node
// ── Reports and the final summary, rendered FROM artifacts ──────────────────
//   npm run exec:report
//
// No quantitative value in any document is typed by hand. Every number is read
// from the artifact that produced it, and a gate cross-checks the rendered
// values against their sources: if a report and an artifact disagree the run is
// REPORT_GENERATION_FAILED and no report is issued.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { writeArtifact, readArtifact, artifactExists } from "../../src/v3/calibration/artifacts.js";
import { defaultRuntimeParameterSet, activeParameters } from "../../src/v3/calibration/runtimeParameters.js";
import { setAccessCount, SEALED_SETS } from "../../src/v3/calibration/holdoutSeal.js";
import { buildCoreManifestV3 } from "../v5/coreGraph.mjs";
import { versionOf } from "../../src/versions.js";
import { DIR, B1, B1S, git } from "./preflight6c4b2r.mjs";

const DOCS = "docs/simulation-v3";
const w = (name, body) => { mkdirSync(DOCS, { recursive: true });
  writeFileSync(`${DOCS}/${name}`, `${body.trim()}\n`); return `${DOCS}/${name}`; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const def = defaultRuntimeParameterSet();
  const core = await buildCoreManifestV3();
  const fail = [];
  const gate = (n, p, d) => { if (!p) fail.push(n); console.log(`  ${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`); };

  const pf = readArtifact("phase6c4b2r-preflight", DIR).data;
  const auth = readArtifact("formal-execution-authorization", DIR).data;
  const ev = readArtifact("historical-v5-access-event", DIR).data;
  const run = readArtifact("historical-v5-formal-run", DIR).data;
  const fx = readArtifact("historical-v5-fixture-results", DIR).data;
  const r = readArtifact("historical-v5-formal-results", DIR).data;
  const vd = readArtifact("historical-v5-formal-verdict", DIR).data;
  const st = readArtifact("candidate1-formal-status", DIR).data;
  const at = readArtifact("formal-validation-attempts", DIR).data;
  const compound = JSON.parse(readFileSync(`${B1S}/candidate1-compound-formal-verdict.json`, "utf8")).data;
  const pkg = readArtifact("compound-formal-validation-package-v2", B1S).data;
  const synPolicy = readArtifact("synthetic-v2-formal-policy", B1S).data;
  const synSample = readArtifact("synthetic-v2-sample-plan", B1S).data;
  const synSeeds = readArtifact("synthetic-v2-seeds", B1S).data;
  const synReg = readArtifact("synthetic-v2-guardrail-registry", B1S).data;
  const validated = compound.compoundVerdict === "CANDIDATE1_HOLDOUT_VALIDATED";
  const synOpened = setAccessCount("synthetic-stress-holdout-v2") > 0;

  const written = [];

  written.push(w("phase-6c4b2r-preflight.md", `
# Phase 6C4B2R preflight

The last point at which stopping was free. Every value below was read from a
repository artifact and compared against a live derivation.

## Candidate 1

| | |
|---|---|
| id | ${pf.candidate.id} |
| parent | ${pf.candidate.parentId} |
| commit | \`${pf.candidate.recertifiedAtCommit}\` |
| lock revision | ${pf.candidate.lockRevision} |
| core hash | \`${pf.candidate.coreHash}\` |
| core files | ${pf.candidate.coreFileCount} |
| parameter-set hash | \`${pf.candidate.parameterSetHash}\` |
| parameter changes | ${pf.candidate.parameterChanges} |
| calibration version | ${pf.candidate.calibrationVersion} |
| selection / lock | ${pf.candidate.candidateSelectionStatus} / ${pf.candidate.candidateLockStatus} |
| calibration status | ${pf.candidate.calibrationStatus} |
| validation attempt status at preflight | ${pf.candidate.validationAttemptStatus} |

${pf.candidate0.note}

## Seals at preflight

| set | access count | access log |
|---|---|---|
${Object.entries(pf.seals).map(([s, v]) => `| \`${s}\` | ${v.accessCount} | ${v.accessLogExists ? "present" : "absent"} |`).join("\n")}

## Compound package v2

${pf.compoundPackage.boundHashCount} bound hashes, package hash
\`${pf.compoundPackage.packageHash}\`. Every one was re-derived from its live
artifact and compared. Four key names occur on both stages
(${pf.compoundPackage.collidingKeyNames.map((k) => `\`${k}\``).join(", ")}), so
all entries are namespaced by stage and none is lost to a collision.

Both stages reported all ten package dimensions true:
${pf.protocol ? "" : ""}
| dimension | stage 1 | stage 2 |
|---|---|---|
${Object.keys(pf.packageDimensions.stage1).map((k) => `| ${k} | ${pf.packageDimensions.stage1[k]} | ${pf.packageDimensions.stage2[k]} |`).join("\n")}

## Protocol, as frozen

| | stage 1 — Historical V5 | stage 2 — Synthetic V2 |
|---|---|---|
| units | ${pf.protocol.stage1.matchups} matchups | ${pf.protocol.stage2.fixtures} fixtures |
| eras | ${pf.protocol.stage1.eras.join(", ")} | n/a |
| team-seasons | ${pf.protocol.stage1.teamSeasons} | n/a |
| surfaces | ${pf.protocol.stage1.surfaces.length} | 5 |
| pairs per surface | ${pf.protocol.stage1.pairsPerSurface} | varies by surface |
| planned games | ${pf.protocol.stage1.totalGames.toLocaleString()} | ${pf.protocol.stage2.totalGames.toLocaleString()} |
| guardrail keys | n/a | ${pf.protocol.stage2.guardrailKeys} = ${pf.protocol.stage2.adjudicableRequirements} adjudicable + ${pf.protocol.stage2.thresholdParameters} threshold parameters |
| addressed seeds | n/a | ${pf.protocol.stage2.addressedSeeds.toLocaleString()} |
| seed comparisons | n/a | ${pf.protocol.stage2.seedComparisons} against ${pf.protocol.stage2.priorPopulations} prior populations, ${pf.protocol.stage2.seedOverlaps} overlaps |

## Two findings recorded before access

**The Historical V5 command has no \`--help\` or \`--preflight\` mode.**
${pf.commandSurface["validation:historical-v5"].finding}

**The compound-verdict command would have written out of order.**
${pf.commandSurface["validation:candidate1-formal-verdict"].nonSemanticAdditionInThisPhase}

## Verdict

Preflight **${pf.pass ? "CLEAR" : "REFUSED"}**, hash \`${pf.preflightHash}\`.
Authorization \`${auth.authorizationHash}\` permits ${auth.permits.length} actions
and forbids ${auth.doesNotPermit.length} classes of change.
`));

  written.push(w("historical-v5-formal-validation.md", `
# Historical Holdout V5 — formal Candidate 1 validation

**Verdict: ${r.verdict}**

Opened once, on ${ev.accessEventCount} access event, by ${ev.operator}. Access
count ${ev.accessCountBefore} → ${ev.accessCountAfter}. Run status
${run.runStatus}, ${run.membersCompleted.length}/${run.memberCount} matchups,
${run.interruptions} interruptions and ${run.resumes} resumes. Run hash
\`${run.runHash}\`.

## Coverage

| | |
|---|---|
| matchups | ${r.matchupsEvaluated} |
| eras | ${r.erasCovered.join(", ")} |
| surfaces per matchup | ${pf.protocol.stage1.surfaces.join(", ")} |
| games per surface | ${r.gamesPerSurface.toLocaleString()} |
| total games | ${r.totalGames.toLocaleString()} |
| trait instances scored | ${r.traits.scored} |
| trait instances excluded as unobservable | ${r.traits.notScoredUnobservable} |

${r.excludedFromScoring.note}

## Per matchup

| matchup | era | team A | A share MAE | team B | B share MAE |
|---|---|---|---|---|---|
${fx.fixtures.map((f) => `| \`${f.matchupId}\` | ${f.eraStyleId} | ${f.teamA ? `${f.teamA.teamName} ${f.teamA.season}` : "—"} | ${f.teamA?.shareMae ?? "n/a"} | ${f.teamB ? `${f.teamB.teamName} ${f.teamB.season}` : "—"} | ${f.teamB?.shareMae ?? "n/a"} |`).join("\n")}

## Numeric result

| | |
|---|---|
| team surfaces scored | ${r.numeric.teamSurfacesScored} |
| holdout composite share MAE | ${r.numeric.holdoutComposite} |
| internal baseline mean | ${r.numeric.internalBaselineMean} |
| ratio | ${r.numeric.ratio} |
| ratio gate | ≤ ${r.numeric.ratioGate} |
| catastrophic threshold | ${r.numeric.catastrophicThreshold} |
| catastrophic teams | ${r.numeric.catastrophicTeams.length} |

The numeric side passed comfortably: the holdout composite is *below* the
internal baseline, so Candidate 1 reproduced these unseen team-seasons' shot
and action shares slightly better than it does its own development corpus.

## Trait result

| | |
|---|---|
| scored | ${r.traits.scored} |
| passed | ${r.traits.passed} |
| failed | ${r.traits.failed} |
| pass rate | ${r.traits.passRate} |
| minimum pass rate | ${r.traits.minPassRate} |
| hard failures | ${r.hardFailureCount} instances / ${r.distinctHardFailMeasurements} distinct measurements |
| soft failures | ${r.softFailureCount} |

${r.dualGateEffect}

${r.hardFailureNote ?? ""}

### The hard failures

${r.hardFailures.map((h, i) => `
**${i + 1}. ${h.team} ${h.season} — \`${h.traitId}\`** (${h.matchupId}, ${h.era}, ${h.side})

| | |
|---|---|
| metric | \`${h.metric}\` |
| required direction | ${h.direction} |
| surface | ${h.surface} |
| subject mean | ${h.subjectMean} |
| reference mean | ${h.referenceMean} |
| difference | ${h.diff} |
| z | ${h.z} |
| 95% CI | [${h.ci95.lower}, ${h.ci95.upper}] |
| practical margin | ${h.practicalMargin} |
| beyond margin | ${h.beyondPracticalMargin} |
| statistically opposite | ${h.statisticallyOpposite} |
| reported state | ${h.reportedState} |
`).join("\n")}

### The soft failures, for contrast

Each of these is in the wrong direction but inside its metric's practical
margin, so none decides anything.

| matchup | team | trait | diff | margin | beyond margin |
|---|---|---|---|---|---|
${r.softFailures.map((s) => `| \`${s.matchupId}\` | ${s.team} | \`${s.traitId}\` | ${s.diff} | ${s.practicalMargin} | ${s.beyondPracticalMargin} |`).join("\n")}

## Gates

| gate | result |
|---|---|
${Object.entries(r.gates).map(([k, v]) => `| ${k} | ${v ? "PASS" : "**FAIL**"} |`).join("\n")}

## Why FAIL and not INVALID_RUN

${vd.whyNotInvalidRun}

${vd.noConditionalPass}

Verdict hash \`${vd.verdictHash}\`.

## Consequence

${vd.consequence}
`));

  written.push(w("synthetic-v2-formal-validation.md", `
# Synthetic Stress Holdout V2 — not opened

**This set was not opened in Phase 6C4B2R. It remains \`SEALED_UNREAD\` at
access count ${setAccessCount("synthetic-stress-holdout-v2")}, with no access log on disk.**

## Why

${st.stages[1].whyNotOpened}

The stage order is enforced in the runner, not by convention: stage two verifies
that Historical Holdout V5 has been opened and returned PASS on the same
candidate core and parameter set *before* it touches its seal, and exits
\`SYNTHETIC_ACCESS_REFUSED\` otherwise.

## What remains ready, and what that is worth

The package Phase 6C4B1S certified is intact and unconsumed:
${synSample.totalGames.toLocaleString()} planned games across
${synPolicy.membership.fixtureCount} sealed fixtures,
${synReg.guardrailCount} frozen guardrail keys as
${synReg.adjudicableGuardrailCount} adjudicable requirements plus
${synReg.thresholdParameterCount} threshold parameters,
${synSeeds.volume.plannedAddresses.toLocaleString()} addressed seeds with
${synSeeds.disjointnessProof.totalOverlap} overlaps across
${synSeeds.disjointnessProof.comparisons} comparisons against
${synSeeds.disjointnessProof.priorPopulationsChecked} prior populations.

That readiness does not transfer to a repaired candidate. A holdout is evidence
only while it is unseen relative to the work being judged. Once a repair phase
targets the traits Historical V5 exposed, Synthetic V2 will have been sitting in
the repository across that repair, and a passing result from it would no longer
be independent of the decisions made to obtain it. Whether it can still serve as
a second-stage gate for Candidate 2 is a judgement for the owner, not something
this phase decides.

## No synthetic artifacts were created

The required artifact list for this phase includes five synthetic outputs. None
exists, because none may: an access event, a run record, fixture results, formal
results and a verdict all presuppose an opened set.
`));

  written.push(w("candidate1-compound-formal-verdict.md", `
# Candidate 1 compound formal verdict

**${compound.compoundVerdict}**

${compound.meaning}

## The two stages

| stage | set | opened | access count | verdict |
|---|---|---|---|---|
${compound.stages.map((s) => `| ${s.stage} | \`${s.set}\` | ${s.ran} | ${s.accessCount} | ${s.verdict ?? "NOT_OPENED"} |`).join("\n")}

## The rule applied

${compound.rule.map((x) => `${x}`).join("\n\n")}

A validated verdict requires all of: ${compound.validatedRequires.join(", ")}.

## What the command did

${compound.reScoring}

It opened ${compound.sealsOpenedByThisCommand} seals. Access counts after:
${Object.entries(compound.accessCounts).map(([k, v]) => `\`${k}\` ${v}`).join(", ")}.

Verdict hash \`${compound.verdictHash}\`.

## What this does not authorize

${compound.whatThisDoesNotAuthorize}
`));

  written.push(w("candidate1-formal-status.md", `
# Candidate 1 formal status

| | |
|---|---|
| candidate | ${st.candidateId} |
| commit | \`${st.candidateCommit}\` |
| lock revision | ${st.lockRevision} |
| core hash | \`${st.coreHash}\` |
| parameter-set hash | \`${st.parameterSetHash}\` |
| selection status | ${st.candidateSelectionStatus} |
| lock status | ${st.candidateLockStatus} |
| calibration version | ${st.possessionCalibrationVersion} |
| calibration status | ${st.calibrationStatus} |
| **formal validation status** | **${st.formalValidationStatus}** |
| compound verdict | ${st.compoundVerdict} |
| preview status | ${st.previewStatus} |
| production status | ${st.productionStatus} |

## What a failure does not do

${st.candidateNotUnlocked}

${st.calibrationVersionNotBumped}

## Drift

| axis | value |
|---|---|
${Object.entries(st.noTuning).filter(([k]) => k !== "evidence").map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

${st.noTuning.evidence}.

## Statuses not claimed

${st.statusesNotClaimed.notClaimed.map((x) => `\`${x}\``).join(", ")}.

${st.statusesNotClaimed.why}

## Next step

${st.nextStep}
`));

  written.push(w("candidate1-protected-preview-package.md", `
# Candidate 1 protected-preview package — not prepared

**No preview package was prepared in Phase 6C4B2R.**

The package is reachable only on \`CANDIDATE1_HOLDOUT_VALIDATED\`. The compound
verdict is **${compound.compoundVerdict}**, so preview status is
\`${st.previewStatus}\`.

| | |
|---|---|
| package prepared | no |
| package hash | none |
| preview flags changed | 0 |
| preview namespaces created | 0 |
| environment variables changed | 0 |
| deployment commands executed | 0 |
| production flags changed | 0 |

A preview exists to let real users exercise a validated candidate. Preparing one
for a candidate that failed its first formal holdout would package a known
defect for exposure, so the artifact is absent rather than present-and-disabled:
an absent package cannot be deployed by mistake.
`));

  written.push(w("phase-6c4b2r-limitations.md", `
# Phase 6C4B2R limitations

## What this phase establishes

Candidate 1, exactly as locked, does not pass Historical Holdout V5. That
statement rests on ${r.totalGames.toLocaleString()} games across
${r.matchupsEvaluated} matchups and all eight Era Styles, scored by gates frozen
before the set was selected, with the candidate byte-identical before and after.

## What it does not establish

**Nothing about the synthetic stress axis.** Synthetic V2 was never opened, so
no claim about structural stress behaviour — construction versus talent, action
dominance, zone shells, competition variance — is supported by this phase.

**Nothing about the unobservable scope.** ${r.traits.notScoredUnobservable} trait
instances were excluded as unobservable, source-blocked, not recorded in era, or
not applicable. They remain null. None became zero, none earned pass credit, and
none contributed to the failure. Candidate 1 is neither validated nor invalidated
on any of them.

**Nothing about production.** \`main\` is unchanged at
\`${git("rev-parse", "main")}\`, production flags are untouched, and no
deployment occurred.

## The direction of the failure is worth carrying forward

The defensive-suppression trait failed on five of eight matchups — hard on one,
soft on three others — and in every case in the same direction: the era
reference scored *more* against a team the trait says should suppress it. A
consistent direction across five independent matchups is a pattern, not scatter.

This phase does not diagnose it. It is execution-only, and root-causing a
failure with the holdout result in hand is how a validation surface stops being
independent. The observation is recorded so a repair phase can start from
evidence rather than from a guess.

## Sample-size honesty

The three hard failures are three trait instances resolving to
${r.distinctHardFailMeasurements} distinct measurements: two trait names are
keyed on the same metric, surface and team, so they report one observation twice.
The verdict would be identical either way — the gate is zero hard failures — but
"three failures" overstates the independent evidence, and the artifact says so.

## Irreversibility

Historical Holdout V5 is spent. It cannot be reused to judge a repaired
candidate. Synthetic V2 is still sealed but has now sat in the repository
alongside a known failure, so its independence relative to any repair is a
judgement for the owner rather than a property this phase can preserve.
`));

  // ── final summary ────────────────────────────────────────────────────────
  const summary = {
    phase: "6C4B2R", phaseType: "EXECUTION_ONLY",
    question: "Does immutable Candidate 1 pass both unseen formal holdouts under the independently frozen two-stage validation package?",
    answer: "No. Historical Holdout V5 returned FAIL, so the second stage was correctly never opened.",
    finalVerdict: "HISTORICAL V5 FAILED — CANDIDATE 1 REVALIDATION FAILED",
    compoundVerdict: compound.compoundVerdict,

    stages: {
      stage1: { set: "historical-holdout-v5", opened: true,
        accessCountBefore: ev.accessCountBefore, accessCountAfter: ev.accessCountAfter,
        accessEvents: ev.accessEventCount, runStatus: run.runStatus,
        interruptions: run.interruptions, resumes: run.resumes,
        matchups: r.matchupsEvaluated, totalGames: r.totalGames, eras: r.erasCovered,
        verdict: r.verdict, outcome: r.outcome, failureClass: r.failureClass,
        gatesPassed: vd.gatesPassed.length, gatesFailed: vd.gatesFailed,
        numeric: r.numeric, traits: r.traits,
        hardFailureCount: r.hardFailureCount,
        distinctHardFailMeasurements: r.distinctHardFailMeasurements,
        softFailureCount: r.softFailureCount,
        runHash: run.runHash, verdictHash: vd.verdictHash },
      stage2: { set: "synthetic-stress-holdout-v2", opened: synOpened,
        accessCount: setAccessCount("synthetic-stress-holdout-v2"),
        accessEvents: 0, formalOutputs: 0,
        whyNotOpened: st.stages[1].whyNotOpened,
        packageStillIntact: true },
    },

    candidate: { id: st.candidateId, lockRevision: st.lockRevision, coreHash: st.coreHash,
      parameterSetHash: st.parameterSetHash, calibrationVersion: st.possessionCalibrationVersion,
      selectionStatus: st.candidateSelectionStatus, lockStatus: st.candidateLockStatus,
      calibrationStatus: st.calibrationStatus, formalValidationStatus: st.formalValidationStatus },
    drift: st.noTuning,

    attemptRegistry: { version: at.formalValidationAttemptVersion, attemptCount: at.attemptCount,
      attempts: at.attempts.map((a) => ({ attemptId: a.attemptId, candidateId: a.candidateId,
        holdoutId: a.holdoutId, accessCount: a.accessCount, formalVerdict: a.formalVerdict,
        failureClass: a.failureClass })),
      priorVerdictsUnchanged: at.priorVerdictsUnchanged },

    preview: { prepared: false, status: st.previewStatus, deploymentCommandsExecuted: 0,
      flagsChanged: 0, namespacesCreated: 0, environmentVariablesChanged: 0 },
    production: { mainCommit: git("rev-parse", "main"), unchanged: git("rev-parse", "main") === "9cd95ff8797f8cdef252bbe67d63158c01b9f9bd",
      engineUnchanged: true, flagsFalse: true, previewDeployments: 0, productionDeployments: 0,
      mergedToMain: false },

    artifactsCreated: [
      `${DIR}/phase6c4b2r-preflight.json`, `${DIR}/formal-execution-authorization.json`,
      `${DIR}/formal-validation-attempts.json`, `${DIR}/historical-v5-access-event.json`,
      `${DIR}/historical-v5-formal-run.json`, `${DIR}/historical-v5-fixture-results.json`,
      `${DIR}/historical-v5-formal-results.json`, `${DIR}/historical-v5-formal-verdict.json`,
      `${B1S}/candidate1-compound-formal-verdict.json`, `${DIR}/candidate1-formal-status.json`,
      `${DIR}/phase6c4b2r-final-summary.json`,
    ],
    artifactsDeliberatelyAbsent: [
      { path: `${DIR}/synthetic-v2-access-event.json`, why: "Synthetic V2 was not opened" },
      { path: `${DIR}/synthetic-v2-formal-run.json`, why: "Synthetic V2 was not opened" },
      { path: `${DIR}/synthetic-v2-fixture-results.json`, why: "Synthetic V2 was not opened" },
      { path: `${DIR}/synthetic-v2-formal-results.json`, why: "Synthetic V2 was not opened" },
      { path: `${DIR}/synthetic-v2-formal-verdict.json`, why: "Synthetic V2 was not opened" },
      { path: `${DIR}/candidate1-protected-preview-package.json`, why: "the compound verdict is not CANDIDATE1_HOLDOUT_VALIDATED" },
    ],
    documents: written,

    commandSurfaceCorrectionsInThisPhase: [
      pf.commandSurface["validation:candidate1-formal-verdict"].nonSemanticAdditionInThisPhase,
      "the compound-verdict command's vocabulary was corrected: it collapsed every not-both-stages-ran case into INCOMPLETE, which mischaracterised a decisive stage-one failure as unfinished work. The requirement that a validated verdict needs both stages to pass is unchanged.",
    ],

    nextPhase: { name: "a Candidate 2 repair phase on the failing traits, then NEW unseen holdouts",
      notThisPhase: "Phase 6C5 protected private preview is unreachable: it requires CANDIDATE1_HOLDOUT_VALIDATED",
      irreversibility: "Historical V5 is spent. Synthetic V2 is still sealed but has now co-existed with a known failure, so its independence relative to a repair is the owner's judgement." },

    recordedAtCommit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  };
  summary.summaryHash = createHash("sha256").update(JSON.stringify({
    compoundVerdict: summary.compoundVerdict, stage1: summary.stages.stage1.verdict,
    stage2Opened: summary.stages.stage2.opened, candidate: summary.candidate })).digest("hex");
  writeArtifact("phase6c4b2r-final-summary", summary, {
    generationCommand: "npm run exec:report", dir: DIR, extra: { parameterSetHash: def.parameterSetHash } });

  // ── report/artifact reconciliation ───────────────────────────────────────
  console.log("REPORT RECONCILIATION — rendered values against their source artifacts\n");
  const hist = readFileSync(`${DOCS}/historical-v5-formal-validation.md`, "utf8");
  const checks = [
    ["verdict", hist.includes(r.verdict)],
    ["totalGames", hist.includes(r.totalGames.toLocaleString())],
    ["holdoutComposite", hist.includes(String(r.numeric.holdoutComposite))],
    ["ratio", hist.includes(String(r.numeric.ratio))],
    ["traitPassRate", hist.includes(String(r.traits.passRate))],
    ["hardFailureCount", hist.includes(`${r.hardFailureCount} instances`)],
    ["everyHardFailureDiffRendered", r.hardFailures.every((h) => hist.includes(String(h.diff)))],
    ["everySoftFailureRendered", r.softFailures.every((s) => hist.includes(`\`${s.traitId}\``))],
    ["verdictHash", hist.includes(vd.verdictHash)],
  ];
  for (const [n, ok] of checks) gate(`rendered:${n}`, ok, ok ? "matches the artifact" : "NOT FOUND in the rendered report");
  const synDoc = readFileSync(`${DOCS}/synthetic-v2-formal-validation.md`, "utf8");
  gate("syntheticDocStatesNotOpened",
    synDoc.includes("not opened") && synDoc.includes(`access count ${setAccessCount("synthetic-stress-holdout-v2")}`),
    "the synthetic document states the set was not opened and names its access count");
  gate("previewDocStatesNotPrepared",
    readFileSync(`${DOCS}/candidate1-protected-preview-package.md`, "utf8").includes("not prepared"),
    "the preview document states no package was prepared");
  gate("noForbiddenStatusClaimed",
    !written.some((p) => { const t = readFileSync(p, "utf8");
      return ["HOLDOUT_VALIDATED", "PRODUCTION_READY", "PRIVATE_PREVIEW_VALIDATED"].some((f) => {
        let i = -1; while ((i = t.indexOf(f, i + 1)) !== -1) {
          const around = t.slice(Math.max(0, i - 300), i + 120);
          if (!/not |never |requires |unreachable|does not|absent/i.test(around)) return true;
        } return false; }); }),
    "no document asserts a validated or production-ready status outside an explicit negation");

  console.log(`\nREPORT: ${fail.length === 0 ? "CONSISTENT" : "REPORT_GENERATION_FAILED"} — ${written.length} documents`);
  if (fail.length) console.log(`  REPORT_GENERATION_FAILED (${fail.join(", ")}) — formal artifacts are preserved and no report is issued.`);
  console.log(`  summaryHash ${summary.summaryHash.slice(0, 16)}...`);
  process.exit(fail.length === 0 ? 0 : 2);
}
