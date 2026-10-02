#!/usr/bin/env node
// ── Golden fixture comparison: one real Candidate 4 result through every path ─
//   node scripts/foundation/goldenFixtureQa.mjs
//
// RAW AUTHORITATIVE RESULT → SAVED CLOUD ROW (buildSavedClash) → HISTORY LIST
// PROJECTION → BREAKDOWN PROJECTION (from the raw record AND from the saved
// snapshot) → RUN IT BACK INPUT (runItBackSetup on the saved row) → CHALLENGE
// METADATA (createChallenge's row), for (a) the captured Chaos record committed
// with PR #68 and (b) a record the real api/game.js handler stores right now.
// Writes data/validation/foundation/golden-fixture-comparison.json: every
// identity that must survive, and whether it did.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

process.env.ECLASH_TEST_MEMORY_STORE = "1"; process.env.ENABLE_CHAOS_TESTS = "true"; process.env.SIM_ENGINE_V3_ENABLED = "true"; process.env.PREVIEW_SIM_ENGINE_ENABLED = "true";
process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32); process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32); process.env.CLOUD_ACCOUNTS_ENABLED = "true";
const { getJSON, _memReset } = await import("../../api/_lib/store.js");
const gameHandler = (await import("../../api/game.js")).default;
const { buildSavedClash } = await import("../../api/_lib/cloudAccounts.js");
const { createChallenge } = await import("../../api/_lib/challenges.js");
const { buildBreakdown } = await import("../../src/breakdown/engine.js");
const { listProjection } = await import("../../src/accounts/savedReport.js");
const { runItBackSetup } = await import("../../src/accounts/careerV2.js");

const OUT = "data/validation/foundation";
const SESSION = "g".repeat(48);
const checks = [];
const ok = (name, pass, detail = "") => { checks.push({ check: name, pass: !!pass, detail: String(detail).slice(0, 240) }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " … " + String(detail).slice(0, 120) : ""}`); };

const challengeRowFor = async (record) => {
  const writes = [];
  const fetchStub = async (url, init = {}) => {
    const u = String(url); const method = init.method || "GET";
    if (method === "POST" && u.includes("/rest/v1/challenges")) { const b = JSON.parse(init.body); writes.push(b); return new Response(JSON.stringify([{ id: "c-1", public_code: b.public_code }]), { status: 201 }); }
    if (method === "POST" && u.includes("/rest/v1/challenge_secrets")) return new Response("[]", { status: 201 });
    return new Response("[]", { status: 200 });
  };
  const run = { chaosRunId: "rungolden001", session: SESSION, status: "SIMULATED", resultId: record.id, chaosDraftVersion: record.chaosDraft?.chaosDraftVersion || null, eraCustom: false, selectedCoaches: record.chaosDraft?.selectedCoaches };
  const out = await createChallenge({ chaosRunId: run.chaosRunId, userId: "11111111-1111-4111-8111-111111111111", deviceSession: SESSION, displayName: "Golden" }, { fetch: fetchStub, run, record: { ...record, session: SESSION, chaosDraft: record.chaosDraft || { mode: "chaos" } }, manifest: { challengeId: "gold0001", chaosSequenceVersion: 3 } });
  return { status: out.status, row: writes[0] || null };
};

const trace = async (label, raw) => {
  const record = { ...structuredClone(raw), session: SESSION };
  const saved = buildSavedClash({ record, userId: "u-golden", claimedFrom: "signed_in" });
  const history = listProjection(saved);
  const bdRaw = buildBreakdown(record), bdSaved = buildBreakdown(saved.result_snapshot);
  const rib = runItBackSetup(saved);
  const chal = await challengeRowFor(raw);
  const cand = raw.preview === true ? raw.candidate : null;
  const expectCoach = (id) => (id && id !== "neutral" ? id : null);
  const cmp = {
    resultId: { raw: raw.id, saved: saved.result_id, history: history.result_id, breakdown: bdRaw.resultId, challenge: chal.row?.creator_result_id },
    candidate: { raw: cand?.candidateId ?? null, saved: saved.candidate_id, history: history.candidate_id, challenge: chal.row?.candidate_id },
    calibration: { raw: cand?.possessionCalibrationVersion ?? null, saved: saved.calibration_version, history: history.calibration_version, challenge: chal.row?.calibration_version },
    coreHash: { raw: cand?.coreHash ?? null, saved: saved.candidate_core_hash, challenge: chal.row?.parameter_hash },
    goldIds: { raw: raw.goldIds, saved: saved.gold_roster.map((p) => p.id), runItBack: rib.goldIds ?? null, challenge: chal.row?.creator_roster?.map((p) => p.id) },
    blueIds: { raw: raw.blueIds, saved: saved.blue_roster.map((p) => p.id), runItBack: rib.blueIds ?? null },
    goldCoach: { raw: raw.coachIds?.gold, saved: saved.gold_coach?.id ?? null, runItBack: rib.coachGoldId ?? rib.coachGold ?? null, challenge: chal.row?.creator_coach?.id ?? null },
    blueCoach: { raw: raw.coachIds?.blue, saved: saved.blue_coach?.id ?? null, runItBack: rib.coachBlueId ?? rib.coachBlue ?? null },
    era: { raw: raw.eraId, saved: saved.era_id, runItBack: rib.eraStyleId ?? rib.eraId ?? null, challenge: chal.row?.creator_era_id },
    finalScore: { raw: raw.core.finalScore, saved: { gold: saved.gold_score, blue: saved.blue_score }, breakdown: { gold: bdRaw.score?.gold, blue: bdRaw.score?.blue }, challenge: chal.row ? { gold: chal.row.creator_gold_score, blue: chal.row.creator_blue_score } : null },
    rosterNames: { saved: saved.gold_roster.map((p) => p.name), box: raw.v3.fullBox.gold.map((l) => l.name) },
    breakdownRawEqualsSaved: JSON.stringify(bdRaw) === JSON.stringify(bdSaved),
    runItBack: rib,
  };
  ok(`${label}: result id is the same everywhere`, [cmp.resultId.saved, cmp.resultId.history, cmp.resultId.breakdown, cmp.resultId.challenge].every((v) => v === raw.id), JSON.stringify(cmp.resultId));
  ok(`${label}: candidate / calibration / core hash identical raw → saved → history → challenge`, [cmp.candidate.saved, cmp.candidate.history, cmp.candidate.challenge].every((v) => v === cmp.candidate.raw) && [cmp.calibration.saved, cmp.calibration.history, cmp.calibration.challenge].every((v) => v === cmp.calibration.raw) && [cmp.coreHash.saved, cmp.coreHash.challenge].every((v) => v === cmp.coreHash.raw) && cmp.candidate.raw === "Candidate 4", JSON.stringify(cmp.candidate));
  ok(`${label}: gold/blue five identical raw → saved → Run It Back (→ challenge for gold)`, JSON.stringify(cmp.goldIds.saved) === JSON.stringify(raw.goldIds) && JSON.stringify(cmp.goldIds.runItBack) === JSON.stringify(raw.goldIds) && JSON.stringify(cmp.goldIds.challenge) === JSON.stringify(raw.goldIds) && JSON.stringify(cmp.blueIds.saved) === JSON.stringify(raw.blueIds) && JSON.stringify(cmp.blueIds.runItBack) === JSON.stringify(raw.blueIds));
  ok(`${label}: coaches identical raw → saved → Run It Back (neutral = none); the challenge keeps the gold coach id`, cmp.goldCoach.saved === expectCoach(raw.coachIds.gold) && cmp.blueCoach.saved === expectCoach(raw.coachIds.blue) && (cmp.goldCoach.runItBack ?? null) === expectCoach(raw.coachIds.gold) && (cmp.blueCoach.runItBack ?? null) === expectCoach(raw.coachIds.blue) && cmp.goldCoach.challenge === raw.coachIds.gold, JSON.stringify({ gold: cmp.goldCoach, blue: cmp.blueCoach }));
  ok(`${label}: era identical raw → saved → Run It Back → challenge`, [cmp.era.saved, cmp.era.runItBack, cmp.era.challenge].every((v) => v === raw.eraId), JSON.stringify(cmp.era));
  ok(`${label}: final score identical raw → saved → breakdown → challenge`, [cmp.finalScore.saved, cmp.finalScore.breakdown, cmp.finalScore.challenge].every((v) => v && v.gold === raw.core.finalScore.gold && v.blue === raw.core.finalScore.blue));
  ok(`${label}: saved roster names are the game's own box-score names`, JSON.stringify(cmp.rosterNames.saved) === JSON.stringify(raw.goldIds.map((id) => raw.v3.fullBox.gold.find((l) => l.id === id)?.name ?? null)));
  ok(`${label}: the breakdown from the saved snapshot equals the breakdown from the raw record`, cmp.breakdownRawEqualsSaved && bdRaw.available);
  ok(`${label}: Run It Back carries no seed (the server draws a new one)`, !/"seed"/.test(JSON.stringify(rib)));
  ok(`${label}: no device session in the saved snapshot; no seed on the challenge row`, !JSON.stringify(saved.result_snapshot).includes(SESSION) && !JSON.stringify(chal.row || {}).includes(`"seed"`));
  return cmp;
};

const captured = JSON.parse(readFileSync("tests/fixtures/saved-clash/candidate4-chaos-record.json", "utf8"));
_memReset();
const res = { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
await gameHandler({ method: "POST", query: {}, body: { mode: "single", simulationId: `golden-${Date.now()}`, goldIds: captured.goldIds, blueIds: captured.blueIds, coachGoldId: captured.coachIds.gold, coachBlueId: captured.coachIds.blue, eraStyleId: captured.eraId }, headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${SESSION}` } }, res);
const liveId = res.body?.resultId;
const liveStored = await getJSON(`${String(liveId).startsWith("pv_") ? "preview-result" : "result"}:${liveId}`);
const { session: _s, ...live } = liveStored || {};
ok("the real api/game.js handler stored a Candidate 4 record for the same setup (a new seed)", live?.candidate?.candidateId === "Candidate 4" && live.seed !== captured.seed, `${captured.seed} → ${live?.seed}`);

const report = { artifact: "golden-fixture-comparison", generatedAt: new Date().toISOString(), captured: await trace("captured Chaos record", captured), live: await trace("live handler record", live) };
mkdirSync(OUT, { recursive: true });
const passed = checks.every((c) => c.pass);
writeFileSync(`${OUT}/golden-fixture-comparison.json`, JSON.stringify({ ...report, checks, passed }, null, 2) + "\n");
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} passed → ${OUT}/golden-fixture-comparison.json`);
process.exit(passed ? 0 : 1);
