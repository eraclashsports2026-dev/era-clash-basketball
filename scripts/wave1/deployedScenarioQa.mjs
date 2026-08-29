// Deployed Wave 1 scenario QA: every guided scenario played to completion on
// the stable preview as a TESTER (signed session), with schema-v2 feedback.
import { readFileSync, writeFileSync } from "node:fs";
import { WAVE1_SCENARIOS } from "../../src/wave1Scenarios.js";
// Defaults to the stable Wave 1 alias; pass a URL to QA a branch preview first.
const BASE = process.argv[2] || process.env.PREVIEW_BASE_URL || "https://era-clash-basketball-git-wave1-era-clash.vercel.app";
const { keys } = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8"));
const tester = keys.find((k) => k.testerId === "wave1-tester-01");
let pass = 0, fail = 0; const gates = []; const played = [];
const gate = (n, ok, d = "") => { console.log(`  ${ok ? "PASS " : "FAIL "} ${n}${d ? ` … ${d}` : ""}`); gates.push({ name: n, ok, detail: String(d) }); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tester session
const ex = await fetch(`${BASE}/api/preview-access`, { method: "POST", redirect: "manual",
  headers: { "content-type": "application/json" }, body: JSON.stringify({ key: tester.key }) });
const session = (ex.headers.get("set-cookie").match(/pv_session=([^;]+)/))[1];
const H = { "content-type": "application/json", cookie: `pv_session=${session}` };
gate("tester session issued", ex.status === 303);

let n = 0;
for (const s of WAVE1_SCENARIOS) {
  const body = { mode: "single", goldIds: s.gold, blueIds: s.blue, coachGoldId: s.coachGold,
    coachBlueId: s.coachBlue, eraStyleId: s.era, simulationId: `w1qa-${s.id}-${Math.random().toString(36).slice(2, 10)}` };
  const r = await fetch(`${BASE}/api/game`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const d = await r.json();
  const ok = r.status === 200 && d.result?.preview === true && /^pv_/.test(d.resultId ?? "");
  gate(`${s.id} completes on Candidate 3`, ok, `${d.result?.core?.winner} ${d.result?.core?.seriesResult} · MVP ${d.result?.core?.mvp}`);
  played.push({ scenarioId: s.id, resultId: d.resultId, score: d.result?.core?.seriesResult, winner: d.result?.core?.winner });
  if (ok) {
    const fb = await fetch(`${BASE}/api/feedback`, { method: "POST", headers: H, body: JSON.stringify({
      kind: "preview", resultId: d.resultId, scenarioId: s.id, gameMode: "single",
      resultBelievability: 4, teamIdentityFeltAccurate: 4, coachDifferenceFeltMeaningful: 4,
      eraStyleFeltMeaningful: 4, postgameExplanationHelpful: 4, wouldRematchOrShare: true,
      issueCategory: "NONE", optionalComment: `wave1 deployed QA ${s.id}` }) });
    gate(`${s.id} feedback (scenario-attributed, tester session) accepted`, fb.status === 204, `status ${fb.status}`);
  }
  await sleep(3300);
  n++;
}
// reload + rematch on scenario 1
const first = played[0];
const a = await fetch(`${BASE}/api/game?id=${first.resultId}`, { headers: H });
const b = await fetch(`${BASE}/api/game?id=${first.resultId}`, { headers: H });
gate("scenario result reload stable", a.status === 200 && (await a.text()) === (await b.text()));
const s1 = WAVE1_SCENARIOS[0];
const rem = await fetch(`${BASE}/api/game`, { method: "POST", headers: H, body: JSON.stringify({
  mode: "single", goldIds: s1.gold, blueIds: s1.blue, coachGoldId: s1.coachGold, coachBlueId: s1.coachBlue,
  eraStyleId: s1.era, simulationId: `w1qa-rematch-${Math.random().toString(36).slice(2, 10)}` }) });
const rd = await rem.json();
gate("rematch: new pv_ id + new seed", /^pv_/.test(rd.resultId ?? "") && rd.resultId !== first.resultId);
// feedback guards
const bad = await fetch(`${BASE}/api/feedback`, { method: "POST", headers: H, body: JSON.stringify({
  kind: "preview", resultId: "pv_zzzzzzzzzz", scenarioId: "w1-s1", gameMode: "single",
  resultBelievability: 4, teamIdentityFeltAccurate: 4, coachDifferenceFeltMeaningful: 4,
  eraStyleFeltMeaningful: 4, postgameExplanationHelpful: 4, wouldRematchOrShare: true, issueCategory: "NONE" }) });
gate("feedback on an unknown result refused", bad.status === 404, `status ${bad.status}`);
const resub = await fetch(`${BASE}/api/feedback`, { method: "POST", headers: H, body: JSON.stringify({
  kind: "preview", resultId: first.resultId, scenarioId: first.scenarioId, gameMode: "single",
  resultBelievability: 5, teamIdentityFeltAccurate: 4, coachDifferenceFeltMeaningful: 4,
  eraStyleFeltMeaningful: 4, postgameExplanationHelpful: 4, wouldRematchOrShare: true,
  issueCategory: "NONE", optionalComment: "revised opinion" }) });
gate("resubmission accepted (replaces primary, revision+1)", resub.status === 204);

console.log(`\nscenario QA: ${pass} passed, ${fail} failed`);
writeFileSync("data/validation/6c6/candidate3-wave1-deployed-qa.json", JSON.stringify({
  artifact: "candidate3-wave1-deployed-qa", generatedBy: "node scripts/wave1/deployedScenarioQa.mjs", baseUrl: BASE,
  data: { passed: pass, failed: fail, gates, played } }, null, 2) + "\n");
process.exit(fail ? 1 : 0);
