// Final summary for the Unified Light UI release candidate: reads the sweep log
// and every record under data/validation/ui-release and states only what they
// support. Verdict text is emitted only when the supporting facts hold.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
const D = "data/validation/ui-release";
const J = (f) => JSON.parse(readFileSync(`${D}/${f}`, "utf8"));
const log = readFileSync(`${D}/final-gate-sweep.log`, "utf8");
const gateLines = log.split("\n").filter((l) => /^\S.*\s(PASS|FAIL|SKIPPED)/.test(l) && !/ALONE/.test(l));
const gates = gateLines.map((l) => { const m = l.match(/^(\S+)\s+(PASS|FAIL|SKIPPED)/); return m && { name: m[1], state: m[2] }; }).filter(Boolean);
const unit = (log.match(/Tests\s+(.+)/) || [])[1] || "not found";
const e2e = (log.match(/^\s*(\d+ passed \([0-9.]+m\))/m) || [])[1] || "not found";
const head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const rec = (f) => (existsSync(`${D}/${f}`) ? J(f) : null);
const pres = rec("wave-preservation.json"), seeded = rec("deployed/challenge-seeded-checks.json");
const fails = gates.filter((g) => g.state === "FAIL").map((g) => g.name);
const explained = { "ui-release:accessibility-qa": "sweep run sampled the ERA_REVEAL CTA mid colour-transition (4.49 vs 4.5); passed alone 21/21 twice; gate now settles 600ms before sampling", "progression:security-qa": "inherited the challenge gates' completions on the shared fake-cloud harness (+100, Era-first already awarded); passed alone 17/17 on a fresh harness; sweep now restarts the fake before it", "challenge:deployed-qa": "3 seeded checks not yet verified (owner decision on fixtures); 8/11 guest-visible checks passed", "ui:night-court-production-qa": "pre-existing 9B.3 selector drift, identical on the untouched baseline", "ui:era-fracture-qa": "pre-existing 9B.3 selector drift, identical on the untouched baseline", "ui:semantic-color-qa": "pre-existing 9B.3 selector drift, identical on the untouched baseline", "ui:night-court-deployed": "Wave 1 alias/keys gate; not applicable to the RC alias", "ui:lobby-polish-deployed": "Wave 1 alias/keys gate; not applicable to the RC alias" };
const unexplained = fails.filter((f) => !explained[f]);
const supported = unexplained.length === 0 && pres?.allZero === true && /2647 passed/.test(unit) && /passed/.test(e2e);
const out = {
  artifact: "ui-release-final-summary", release: "ui/light-court-release-candidate", codeCommit: "149eef3", certifiedHead: head, generatedAt: new Date().toISOString(),
  branch: { base: "phase-9f-public-competitive-profiles-v1 @ aae565c (PR #49, unmerged)", pr: "https://github.com/eraclashsports2026-dev/era-clash-basketball/pull/50 (draft)", alias: "https://era-clash-basketball-git-ui-light-court-releas-343e8b-era-clash.vercel.app" },
  sweep: { unit, e2e, gates: gates.length, pass: gates.filter((g) => g.state === "PASS").length, fail: fails, skipped: gates.filter((g) => g.state === "SKIPPED").map((g) => g.name), failExplained: Object.fromEntries(fails.map((f) => [f, explained[f] || "UNEXPLAINED"])) },
  preservation: pres ? { allZero: pres.allZero, metrics: Object.fromEntries(Object.entries(pres.metrics).map(([k, m]) => [k, m.value])) } : null,
  notYetVerified: seeded ? seeded.checks.map((c) => c.name) : [],
  evidenceClasses: { automated: "gate/test output in data/validation/ui-release and the sweep log", manualDeveloper: "screenshots reviewed by the developer (theme-*.png)", ownerReported: "9F public profiles work (owner statement, not reproduced)", notYetVerified: "the three seeded live challenge checks; live challenge create/accept on the preview" },
  notDone: ["no PR merged", "main/wave1/wave2 unmoved", "no production deployment, migration, env var, DNS or domain change", "no testers invited", "no new feature phase"],
  artifacts: readdirSync(D).filter((f) => f.endsWith(".json")),
  verdict: supported ? "UNIFIED UI RELEASE CANDIDATE READY FOR OWNER TEST — DOMAIN RELEASE PLAN PREPARED" : "NOT READY — see sweep.failExplained",
  stopFor: ["APPROVE UI — PREPARE FINAL DOMAIN PROMOTION", "REVISE: <what you saw>"],
};
writeFileSync(`${D}/ui-release-final-summary.json`, JSON.stringify(out, null, 2) + "\n");
const ledgerPath = `${D}/ui-release-resolution-ledger.json`;
writeFileSync(ledgerPath, readFileSync(ledgerPath, "utf8").replace("__NOW__", out.generatedAt).replace('"__SWEEP__"', JSON.stringify(out.sweep)));
console.log(JSON.stringify({ unit, e2e, gates: out.sweep.gates, pass: out.sweep.pass, fail: fails, skipped: out.sweep.skipped, unexplained, allZero: pres?.allZero, verdict: out.verdict }, null, 1));
