#!/usr/bin/env node
// ── Head-to-head: Candidate 0 versus the strongest contender ────────────────
//   npm run calibration:c5:compare
//
// The search accepted no changed candidate, so there is no "best accepted
// candidate" to run against. Declaring the comparison vacuous would hide the
// most useful thing left to check: whether the closest contender was merely
// unlucky. So the strongest REJECTED contender is promoted into a head-to-head
// on FRESH seeds, disjoint from the ones the search used.
//
// That matters because the contender was selected BY the search seeds. Re-scoring
// it on the same seeds would re-measure the selection; re-scoring it on new ones
// asks whether the advantage was ever real. A contender that was genuinely
// better should keep most of its margin. One that won a lottery will not.
import { readArtifact, writeArtifact } from "../../src/v3/calibration/artifacts.js";
import { compileRuntimeParameterSet, defaultRuntimeParameterSet } from "../../src/v3/calibration/runtimeParameters.js";
import { loadFixtures, objectiveOn, pairedDiffs, pairedTest, SEARCH_POLICY } from "./c5-search.mjs";
import { domainSeed, MASTERS } from "../../src/v3/calibration/seedDomains.js";
// Everything below runs ONLY as a command, never on import. A calibration script
// that executes at import time turns "read one constant from it" into "silently
// re-run the whole measurement" — which happened in Phase 6C2C2 to four scripts
// at once, and once more here, to these five.
if (import.meta.url === `file://${process.argv[1]}`) {

const r5 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100000) / 100000);

// Search seeds were indices 0..seeds-1 of the actual-game domain at offset
// 150000. The confirmation block starts well past any of them.
const CONFIRMATION_OFFSET = 400;

const history = readArtifact("candidate-history").data;
const scope = readArtifact("calibration-scope").data;
const changed = history.history.filter((h) => h.candidateId !== "C0");

// Strongest contender = largest tuning gain among those the objective could see.
const visible = changed.filter((h) => h.objectiveAdjudicable);
const contender = visible.reduce((a, b) => ((b.tuningGain ?? -Infinity) > (a?.tuningGain ?? -Infinity) ? b : a), null);
if (!contender) { console.error("COMPARISON_FAILED: no adjudicable contender exists"); process.exit(2); }

const all = loadFixtures();
const tuning = all.filter((f) => scope.folds.tuningFolds.includes(f.fold));
const validation = all.filter((f) => scope.folds.validationFolds.includes(f.fold));
const seeds = history.seedsPerFixture;

// A fresh-seed objective: same fixtures, seed indices shifted past the search.
const freshObjective = (fixtures, set) => {
  const saved = globalThis.__c5SeedOffset;
  globalThis.__c5SeedOffset = CONFIRMATION_OFFSET;
  try { return objectiveOn(fixtures, set, seeds); } finally { globalThis.__c5SeedOffset = saved; }
};

const change = contender.changes[0];
const contenderSet = compileRuntimeParameterSet({ overrides: { [change.id]: change.to }, label: "contender" });
const def = defaultRuntimeParameterSet();

console.log("HEAD-TO-HEAD: Candidate 0 versus the strongest contender");
console.log(`  contender  ${contender.candidateId}  ${contender.label}`);
console.log(`  status     REJECTED by the search (${contender.reason})`);
console.log(`  seeds      confirmation block at offset ${CONFIRMATION_OFFSET}, disjoint from the search\n`);

const rows = [];
for (const [name, fixtures] of [["tuning", tuning], ["validation", validation]]) {
  const c0 = freshObjective(fixtures, null);
  const cc = freshObjective(fixtures, contenderSet);
  const t = pairedTest(pairedDiffs(cc, c0));
  rows.push({ set: name, fixtures: fixtures.length,
    candidateZeroMae: c0.mae, contenderMae: cc.mae,
    gain: r5((c0.mae ?? 0) - (cc.mae ?? 0)),
    pairedN: t.n, pairedMeanDiff: t.mean, t: t.t, rawP: r5(t.p) });
  console.log(`  ${name.padEnd(11)} C0 ${c0.mae}   contender ${cc.mae}   gain ${r5((c0.mae ?? 0) - (cc.mae ?? 0))}   paired t ${t.t}  p ${r5(t.p)}`);
}

const searchGain = contender.tuningGain;
const freshGain = rows[0].gain;
const retained = searchGain > 0 ? r5(freshGain / searchGain) : null;
const holdsUp = freshGain >= SEARCH_POLICY.minTuningImprovement && rows[0].rawP < 0.05;

const winner = "C0";
console.log(`\n  gain on search seeds       ${searchGain}`);
console.log(`  gain on confirmation seeds ${freshGain}`);
console.log(`  retained                   ${retained === null ? "n/a" : `${(retained * 100).toFixed(0)}%`}`);
console.log(`  holds up on fresh seeds    ${holdsUp}`);
console.log(`\n  WINNER: Candidate 0 (wired defaults)`);

const { path } = writeArtifact("candidate-comparison", {
  outcome: "CANDIDATE_ZERO_WINS",
  acceptedChangedCandidateExists: false,
  whyNoAcceptedCandidate: `All 84 on-grid candidates failed at least one of ${SEARCH_POLICY.acceptanceRequires.join(", ")}. 4 cleared the practical floor; 0 were family-wise significant at alpha ${SEARCH_POLICY.familyWiseAlpha} over a family of 84.`,
  contenderPromotedForTransparency: {
    candidateId: contender.candidateId, label: contender.label,
    change, rejectedReason: contender.reason,
    searchTuningGain: searchGain, searchRawP: contender.rawP, searchHolmAdjustedP: contender.holmAdjustedP,
  },
  confirmationSeedOffset: CONFIRMATION_OFFSET,
  seedsPerFixture: seeds,
  freshSeedResults: rows,
  gainRetainedOnFreshSeeds: retained,
  contenderHoldsUpOnFreshSeeds: holdsUp,
  interpretation: holdsUp
    ? "The contender retained a practically and statistically meaningful advantage on seeds it was not selected on. It still fails the frozen family-wise gate, so it is NOT adopted, but this is recorded as evidence that the gate — not the absence of signal — is what blocked it."
    : "The contender did not retain its advantage on seeds it was not selected on, which is what selection noise looks like. This independently corroborates the family-wise rejection.",
  winner,
  candidateZeroParameterSetHash: def.parameterSetHash,
  contenderParameterSetHash: contenderSet.parameterSetHash,
}, {
  generationCommand: "npm run calibration:c5:compare",
  sourceArtifacts: ["data/calibration/c5/candidate-history.json", "data/calibration/c5/calibration-scope.json"],
  extra: { parameterSetHash: def.parameterSetHash },
});
console.log(`\nwrote ${path}`);
}
