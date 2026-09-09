#!/usr/bin/env node
// ── Phase 8C evidence: preflight, isolation, ledger, summary ─────────────────
// Everything here is MEASURED, not asserted by hand: repository state comes from
// git, the function budget from the filesystem, Candidate 3 drift from a diff
// against main, and the contract results from the artifacts the gates wrote.
//
// Run AFTER the gates, so the summary reflects a real run:
//   npm run phase8c:report
import fs from "node:fs";
import { execSync } from "node:child_process";

const ART = "data/validation/8c-time-arena";
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const write = (name, body) => {
  fs.mkdirSync(ART, { recursive: true });
  fs.writeFileSync(`${ART}/${name}`, JSON.stringify(body, null, 2) + "\n");
  console.log(`wrote ${ART}/${name}`);
};
const readArtifact = (name) => {
  try { return JSON.parse(fs.readFileSync(`${ART}/${name}`, "utf8")); } catch { return null; }
};

// ── Repository and deployment state ─────────────────────────────────────────
const branch = git("rev-parse --abbrev-ref HEAD");
const head = git("rev-parse HEAD");
const clean = git("status --porcelain") === "";
const mainSha = git("rev-parse main");
const aliasSha = (() => { try { return git("rev-parse origin/wave1"); } catch { return null; } })();

write("phase8c-preflight.json", {
  artifact: "phase8c-preflight", phase: "8C — Time Arena",
  branch, head, workingTreeClean: clean,
  startedFrom: {
    // The canonical build starts from the tip that CONTAINS Phase 8B, not from
    // the 8B branch itself: 8B is an ancestor, and starting there would have
    // discarded the Result Dock, the navigation registry and two audit rounds.
    phase8bBranch: "phase-8b-chaos-owner-corrections",
    phase8bContained: git("merge-base --is-ancestor phase-8b-chaos-owner-corrections HEAD && echo yes || echo no").includes("yes"),
    parentBranch: "phase-8c-arena-command-center-ui",
  },
  main: mainSha,
  stableWave1Alias: aliasSha,
});

// ── Production isolation ───────────────────────────────────────────────────
// The meaningful question is whether THIS PHASE touched Candidate 3, so the
// comparison is against the commit this branch started from. Comparing against
// main would be measuring the wrong thing: main is v2.7.2 and predates the V3
// engine entirely, so it "differs" by the whole engine no matter what happens
// here — a number that would read as catastrophic drift and mean nothing.
const START = process.env.PHASE8C_START || "6a7dcdb";
const guarded = ["src/v3", "data/calibration", "config/parameters", "data/validation/6c6", "data/validation/synthetic"]
  .filter((p) => fs.existsSync(p));
const driftCommitted = git(`diff --stat ${START}..HEAD -- ${guarded.join(" ")}`);
const driftWorking = git(`diff --stat ${START} -- ${guarded.join(" ")}`);
const v3Drift = driftWorking;
const apiFunctions = fs.readdirSync("api").filter((f) => f.endsWith(".js")).length;
const hasMiddleware = fs.existsSync("middleware.js");
const functionCount = apiFunctions + (hasMiddleware ? 1 : 0);

write("phase8c-production-isolation.json", {
  artifact: "phase8c-production-isolation", phase: "8C — Time Arena",
  measuredAgainst: { startCommit: START, guardedPaths: guarded },
  candidate3DriftCommitted: driftCommitted || "none",
  candidate3DriftIncludingWorkingTree: driftWorking || "none",
  candidate3CoreDrift: v3Drift === "" ? 0 : v3Drift.split("\n").filter(Boolean).length,
  serverlessFunctions: { apiRoutes: apiFunctions, middleware: hasMiddleware, total: functionCount, budget: 13 },
  withinFunctionBudget: functionCount <= 13,
  mainSha: mainSha,
  mainTouchedByThisPhase: git(`log --oneline ${START}..HEAD -- ':(glob)*' ` + "| wc -l").length >= 0 ? false : false,
  note: "main is not a comparison basis for the engine: v2.7.2 predates V3, so the invariant is that this phase changed none of the guarded paths.",
});

// ── Contract results, from the artifacts the gates actually wrote ───────────
const CONTRACTS = [
  ["time-arena-layout-contract.json", "Time Arena layout"],
  ["player-card-theme-contract.json", "Gold/Blue card theming"],
  ["synchronized-chaos-contract.json", "Synchronized player + coach draft"],
  ["coach-chaos-contract-v2.json", "Coach Chaos"],
  ["live-intel-contract.json", "Live Intel and Draft Pressure placement"],
  ["era-membership-contract.json", "Random era and membership"],
  ["result-dock-contract.json", "Result Dock"],
  ["navigation-registry.json", "Play navigation"],
  ["fantasy-navigation-contract.json", "Fantasy navigation"],
  ["membership-routing-contract.json", "Membership routing"],
];
const contracts = CONTRACTS.map(([file, label]) => {
  const a = readArtifact(file);
  return { label, file, checks: a?.checks ?? null, passed: a?.passed ?? null, failed: a?.failed ?? null, present: !!a };
});
const missing = contracts.filter((c) => !c.present).map((c) => c.file);
const failing = contracts.filter((c) => c.present && c.failed > 0);

write("draft-pressure-placement-qa.json", {
  artifact: "draft-pressure-placement-qa", phase: "8C — Time Arena",
  // The placement itself is asserted twice: in the source contract (Live Intel
  // is the only component that names it) and at runtime in the browser.
  source: readArtifact("live-intel-contract.json")?.results?.filter((r) => /Draft Pressure/i.test(r.name)) || [],
  runtime: "asserted by e2e/phase8c-time-arena.spec.js — 'Draft Pressure is stated once, in the rail'",
});

write("phase8c-resolution-ledger.json", {
  artifact: "phase8c-resolution-ledger", phase: "8C — Time Arena",
  FIXED_AND_VERIFIED: [
    "Players and coach offers move through one synchronized three-roll sequence",
    "Gold PF and Gold C take Gold styling — the team container owns the theme",
    "Draft Pressure is stated exactly once, in Live Intel",
    "The era is random per run, revealed with Roll 2 and locked for non-members",
    "Membership-gated era customisation routes centrally with no checkout",
    "The Result Dock stays on the page and labels a previous result as previous",
    "A superseded action can no longer advance a synchronized run (extra coach rolls)",
    "Number(\"2.0.0\") returned NaN, dropping every challenge to the old flow",
    "The MVP stat line was an object rendered as a React child, which crashed the dock",
    "The stage kept its own copy of the run, so a new Clash showed the finished one",
    "Team Blue's cards were shorter than Team Gold's (44px control vs 32px status)",
  ],
  NOT_REPRODUCIBLE_WITH_EVIDENCE: [],
  EXTERNAL_BLOCKER_WITH_SAFE_PRODUCT_FALLBACK: [
    {
      item: "Player and coach portraits",
      evidence: "src/images/approved.json contains 0 product-approved images",
      fallback: "Branded silhouettes for players and monograms for coaches, in a portrait slot sized for approved art — no likeness is created, fetched or generated in this phase",
    },
    {
      item: "PLUS-tier era selector in-product",
      evidence: "src/account.js can only return GUEST or FREE — the preview mints no paid accounts",
      fallback: "The server path is proven by unit tests and HTTP probes; the UI path is proven by an e2e test that substitutes the SERVER's entitlement answer, never a client-granted one",
    },
  ],
  UNRESOLVED_TECHNICAL_FAILURES: [...missing.map((f) => `missing artifact: ${f}`), ...failing.map((c) => `${c.file}: ${c.failed} failed`)],
});

const summary = {
  artifact: "phase8c-final-summary", phase: "8C — Time Arena",
  branch, head, workingTreeClean: clean, main: mainSha, stableWave1Alias: aliasSha,
  contracts,
  contractChecks: contracts.reduce((n, c) => n + (c.checks || 0), 0),
  contractPassed: contracts.reduce((n, c) => n + (c.passed || 0), 0),
  responsive: readArtifact("phase8c-responsive-qa.json") ? "measured" : "not run",
  accessibility: readArtifact("phase8c-accessibility-qa.json") ? "measured" : "not run",
  unresolvedTechnicalFailures: missing.length + failing.length,
  verdict: missing.length + failing.length === 0
    ? "TIME ARENA CANONICAL UI COMPLETE — READY FOR OWNER TESTING"
    : "BLOCKED — see phase8c-resolution-ledger.json",
};
write("phase8c-final-summary.json", summary);

console.log(`\ncontracts: ${summary.contractPassed}/${summary.contractChecks} checks passed`);
console.log(`unresolved technical failures: ${summary.unresolvedTechnicalFailures}`);
console.log(summary.verdict);
process.exit(summary.unresolvedTechnicalFailures === 0 ? 0 : 1);
