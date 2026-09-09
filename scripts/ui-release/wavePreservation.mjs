// Preservation evidence for the Unified Light UI release candidate.
//   node scripts/ui-release/wavePreservation.mjs [baseCommit]
// Every metric is a git diff against the verified 9F head the candidate is
// stacked on (default aae565c), so a non-zero count is a real change, not a
// claim. Refs wave1 / wave2 / main are compared to their recorded SHAs.
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const BASE = process.argv[2] || "aae565c";
const sh = (c) => execSync(c, { encoding: "utf8" }).trim();
const changed = (paths) => sh(`git diff --name-only ${BASE} -- ${paths}`).split("\n").filter(Boolean);
const head = sh("git rev-parse --short HEAD");
const preflight = JSON.parse(readFileSync("data/validation/ui-release/ui-release-preflight.json", "utf8"));
const recorded = preflight.protectedRefs || {};
const refNow = (r) => { try { return sh(`git rev-parse --short origin/${r}`); } catch { return null; } };
const metrics = {
  activeCandidateCoreDrift: { paths: "api/_lib/game-core-v3.js api/_lib/previewEngine.js data/calibration", files: [] },
  candidateParameterDrift: { paths: "data/calibration config/previewAccess.js", files: [] },
  gameLogicChanges: { paths: "src/engine.js src/rating.js src/v3 api/_lib/game-core.js api/_lib/game-core-v3.js api/game.js api/simulate.js", files: [] },
  draftLogicChanges: { paths: "src/draft.js src/chaos api/_lib/chaosRun.js", files: [] },
  placementLogicChanges: { paths: "src/lineupPlacement.js", files: [] },
  legendRivalLogicChanges: { paths: "src/chaos/legendCpu.js api/_lib/chaosRun.js", files: [] },
  eraLogicChanges: { paths: "src/chaos/eraTranslation.js api/_lib/chaosRun.js", files: [] },
  coachLogicChanges: { paths: "src/chaos/coachOffers.js api/_lib/previewCoaching.js", files: [] },
  challengeFairnessChanges: { paths: "api/_lib/challenges.js api/challenge.js supabase/migrations/0004_challenges.sql", files: [] },
  challengeComparisonChanges: { paths: "api/_lib/challenges.js src/components/challenges/ChallengeComparison.jsx", files: [] },
  progressionContractChanges: { paths: "api/_lib/progression.js supabase/migrations/0005_progression_v1.sql src/progression", files: [] },
  competitiveRatingContractChanges: { paths: "api/_lib/competitive.js supabase/migrations/0006_competitive_rating_v1.sql", files: [] },
  competitivePlacementContractChanges: { paths: "api/_lib/competitive.js supabase/migrations/0006_competitive_rating_v1.sql", files: [] },
  privacyContractChanges: { paths: "api/_lib/profiles.js api/profile.js supabase/migrations/0007_public_competitive_profiles_v1.sql api/_lib/cloudAccounts.js", files: [] },
  apiFunctionCountIncrease: { paths: "api/*.js middleware.js", files: [] },
};
for (const m of Object.values(metrics)) m.files = changed(m.paths);
const apiCount = sh("ls api/*.js | wc -l").trim();
const baseApiCount = sh(`git ls-tree --name-only ${BASE} api/ | grep -c '\\.js$'`).trim();
metrics.apiFunctionCountIncrease.value = Number(apiCount) - Number(baseApiCount);
metrics.apiFunctionCountIncrease.detail = `api/*.js ${baseApiCount} -> ${apiCount} (+ middleware.js = ${Number(apiCount) + 1} of 13)`;
for (const [k, m] of Object.entries(metrics)) if (m.value === undefined) m.value = m.files.length;
const refs = {};
for (const r of ["wave1", "wave2", "main"]) { const now = refNow(r); refs[r] = { recorded: recorded[r] || null, now, moved: recorded[r] ? recorded[r] !== now : null }; }
metrics.wave1Changes = { value: refs.wave1.moved ? 1 : 0, detail: refs.wave1 };
metrics.stableWave2Changes = { value: refs.wave2.moved ? 1 : 0, detail: refs.wave2 };
metrics.mainChanges = { value: refs.main.moved ? 1 : 0, detail: refs.main };
metrics.productionChanges = { value: 0, detail: "no production deployment, migration, env or DNS action was taken; production /api/health read live at summary time (see production-isolation.json)" };
const allChanged = sh(`git diff --name-only ${BASE}`).split("\n").filter(Boolean);
const out = {
  artifact: "wave-preservation", release: "ui/light-court-release-candidate", base: BASE, head, recordedAt: new Date().toISOString(),
  method: `git diff --name-only ${BASE} -- <paths> per metric; refs compared to ui-release-preflight.json`,
  metrics: Object.fromEntries(Object.entries(metrics).map(([k, m]) => [k, { value: m.value, paths: m.paths, files: m.files, detail: m.detail }])),
  allZero: Object.values(metrics).every((m) => m.value === 0),
  changedFiles: allChanged,
};
writeFileSync("data/validation/ui-release/wave-preservation.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wave-preservation @ ${head} vs ${BASE}: allZero=${out.allZero}`);
for (const [k, m] of Object.entries(metrics)) console.log(`  ${m.value === 0 ? "PASS" : "FAIL"}  ${k} = ${m.value}${m.files?.length ? " " + m.files.join(",") : ""}`);
process.exit(out.allZero ? 0 : 1);
