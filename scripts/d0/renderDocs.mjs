// Render Phase 6C4D0R docs from artifacts — docs never assert what an artifact doesn't.
import { readFileSync, writeFileSync } from "node:fs";
const A = (n) => JSON.parse(readFileSync(`data/validation/6c4d0/${n}.json`, "utf8")).data;
const lock = A("candidate3-lock"), ready = A("protected-preview-readiness"),
  summary = A("phase6c4d0-final-summary"), ledger = A("idea101-resolution-ledger");

writeFileSync("docs/simulation-v3/protected-preview.md", `# Protected preview — Candidate 3

Rendered from \`data/validation/6c4d0/\` artifacts. Status: **${ready.previewStatus}**.

## The candidate

| | |
|---|---|
| Candidate | ${ready.candidate.candidateId} (core \`${lock.coreHash.slice(0, 16)}…\`) |
| States | ${summary.successorCandidate.lockStates.join(" · ")} |
| Calibration identity | possessionCalibration **${lock.possessionCalibrationVersion}** · actionLibrary **2.1.0** |
| Parent | Candidate 2 (core \`${lock.parentCoreHash.slice(0, 16)}…\`) |
| Engine changes | ${summary.successorCandidate.changes.map((c) => c.split(" (")[0]).join("; ")} |
| Not claimed | ${lock.notClaimed.join(", ")} |

## The integration

- **Flag**: \`${ready.featureFlag.name}\` — default **false**. ${ready.featureFlag.emergencyOff}.
- **Scope**: ${ready.scope}.
- **Fallback**: ${ready.productionFallback}.
- **Namespaces**: ${Object.values(ready.namespaces).join(", ")} — result ids carry the \`${ready.resultIdPrefix}\` prefix. Preview records never enter a production namespace.
- **Telemetry**: ${ready.telemetry.events}; ${ready.telemetry.filter}.

## Verification

| Command | Result |
|---|---|
| \`npm run preview:preflight\` | ${ready.verification.previewPreflight} |
| \`npm run preview:smoke\` | ${ready.verification.previewSmoke} |
| \`npm run preview:soak\` | ${ready.verification.previewSoak} |
| \`npm run preview:security\` | ${ready.verification.previewSecurity} |
| \`npm run preview:browser-qa\` | ${ready.verification.browserQaFlagOff} |
| \`npx vitest run\` | ${ready.verification.vitest} |

## What was NOT done

${ready.notDone.map((n) => `- ${n}`).join("\n")}
`);

const rows = ledger.items.map((i) =>
  `| ${i.issueId} | ${i.description} | ${i.severity} | **${i.resolutionStatus}** |`).join("\n");
writeFileSync("docs/simulation-v3/idea101-resolution.md", `# IDEA #101 — resolution ledger

Rendered from \`data/validation/6c4d0/idea101-resolution-ledger.json\`.
**Unresolved technical failures: ${ledger.unresolvedTechnicalFailures}.**

| Issue | Description | Severity | Resolution |
|---|---|---|---|
${rows}

## The V6 run

${summary.v6Adjudication.effectiveFormalVerdict}: the run was **${summary.v6Adjudication.runValidity}** (profile-resolution failure in the validation layer). The original FAIL artifacts are ${summary.v6Adjudication.originalArtifacts}. Candidate failure was **not** established (\`candidateFailureEstablished: false\`); a replacement holdout is required for any formal claim.

## Remaining diagnostic clusters — attributed, not engine failures

- **SA movementShare** — ${summary.remainingDiagnosticClusters["SA movementShare"]}
- **Houston gamePace** — ${summary.remainingDiagnosticClusters["Houston gamePace"]}

## Verdict

**${summary.verdict}**
`);
console.log("docs rendered");
