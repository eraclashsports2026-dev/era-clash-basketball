// ── The authoritative Chaos result record contract ────────────────────────────
// Every consumer of a completed Clash — the saved career row, the governed
// Challenge, Clash Breakdown, Run It Back — reads the STORED record through
// api/_lib/resultContract.js. This file pins that record's real shape two ways
// so a hand-made fixture can never again drift from what the builder writes:
//   1. a record produced RIGHT NOW by the real api/game.js handler (in-memory
//      store, Candidate 4 path) and read back from the store;
//   2. the captured Candidate 4 Chaos record committed with PR #68
//      (tests/fixtures/saved-clash/candidate4-chaos-record.json).
// Both must carry every contract path, and neither may carry the view-model
// fields (`previewCandidate`, `pregame.cards`, `coachGold`) the old code read.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { _memReset, getJSON } from "../api/_lib/store.js";
import gameHandler from "../api/game.js";
import { buildSavedClash } from "../api/_lib/cloudAccounts.js";
import { createChallenge, challengeFingerprint } from "../api/_lib/challenges.js";
import { engineIdentity, RESULT_RECORD_CONTRACT } from "../api/_lib/resultContract.js";
import { buildBreakdown } from "../src/breakdown/engine.js";
import { listProjection } from "../src/accounts/savedReport.js";
import { runItBackSetup } from "../src/accounts/careerV2.js";
import { getCoach } from "../src/v3/coaches.js";

const read = (p) => readFileSync(p, "utf8");
const CAPTURED = JSON.parse(read("tests/fixtures/saved-clash/candidate4-chaos-record.json"));
const GOLD = ["magic-80s", "jordan-90s", "bird-80s", "duncan-00s", "hak-90s"];
const BLUE = ["curry-10s", "ray-00s", "durant-10s", "dirk-00s", "jokic-20s"];
const SESSION = "c".repeat(48);
const mockRes = () => ({ statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } });
const mockReq = (body) => ({ method: "POST", body, query: {}, headers: { host: "eraclash.test", origin: "https://eraclash.test", cookie: `ec_session=${SESSION}` } });
const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
/** Every dotted path the contract relies on, with the value kind it must have. */
const REQUIRED = [
  ["id", "string"], ["mode", "string"], ["goldIds", "array5"], ["blueIds", "array5"], ["coachIds.gold", "string"], ["coachIds.blue", "string"],
  ["eraId", "string"], ["preview", "boolean"], ["candidate.candidateId", "string"], ["candidate.possessionCalibrationVersion", "string"], ["candidate.coreHash", "hex64"],
  ["versions.engine", "string"], ["fingerprint.engineVersion", "string"], ["seed", "number"],
  ["core.finalScore.gold", "number"], ["core.finalScore.blue", "number"], ["core.winner", "string"], ["core.mvp", "string"],
  ["v3.fullBox.gold", "array5"], ["v3.fullBox.blue", "array5"], ["v3.teamTotals.gold.pts", "number"], ["v3.periodScores", "array"], ["v3.overtimes", "number"],
  ["created_at", "number"],
];
const kindOk = (v, k) => (k === "array5" ? Array.isArray(v) && v.length === 5 : k === "array" ? Array.isArray(v) && v.length >= 4 : k === "hex64" ? /^[0-9a-f]{64}$/.test(String(v)) : typeof v === k);
const BOX_LINE_KEYS = ["id", "name", "pos", "pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "to", "pf"];
const VIEW_MODEL_ONLY = ["previewCandidate", "pregame.cards", "pregame.coachGold", "pregame.coachBlue", "coachGold", "coachBlue", "coachNames", "sim"];

let LIVE = null;   // the record api/game.js actually stored, read back from the store
beforeAll(async () => {
  process.env.ECLASH_TEST_MEMORY_STORE = "1"; process.env.ENABLE_CHAOS_TESTS = "true"; process.env.SIM_ENGINE_V3_ENABLED = "true"; process.env.PREVIEW_SIM_ENGINE_ENABLED = "true";
  _memReset();
  const res = mockRes();
  await gameHandler(mockReq({ mode: "single", simulationId: `contract-${Date.now()}`, goldIds: GOLD, blueIds: BLUE, coachGoldId: "phil-jackson", coachBlueId: "gregg-popovich", eraStyleId: "1990s" }), res);
  expect(res.statusCode).toBe(200);
  const id = res.body.resultId;
  LIVE = await getJSON(`${id.startsWith("pv_") ? "preview-result" : "result"}:${id}`);
});

describe("the stored record shape (live builder + captured Chaos record)", () => {
  it("the live handler stored a Candidate 4 record", () => {
    expect(LIVE?.preview).toBe(true); expect(LIVE.candidate.candidateId).toBe("Candidate 4"); expect(LIVE.session).toBe(SESSION);
  });
  for (const [label, rec] of [["live", () => LIVE], ["captured", () => CAPTURED]]) {
    it(`${label}: carries every contract path with the right kind`, () => {
      const r = rec(); const missing = REQUIRED.filter(([p, k]) => !kindOk(get(r, p), k)).map(([p]) => p);
      expect(missing).toEqual([]);
    });
    it(`${label}: box lines have exactly the recorded fields`, () => {
      for (const side of ["gold", "blue"]) for (const l of rec().v3.fullBox[side]) expect(Object.keys(l).sort()).toEqual([...BOX_LINE_KEYS].sort());
    });
    it(`${label}: carries none of the view-model-only fields the old code read`, () => {
      for (const p of VIEW_MODEL_ONLY) expect(get(rec(), p)).toBeUndefined();
    });
  }
  it("the captured fixture has the same top-level and v3 key sets as a record the handler writes today (chaos-only keys aside)", () => {
    const top = (r) => Object.keys(r).filter((k) => k !== "session").sort();
    expect(top(CAPTURED)).toEqual(top(LIVE));
    expect(Object.keys(CAPTURED.v3).sort()).toEqual(Object.keys(LIVE.v3).sort());
    expect(Object.keys(CAPTURED.candidate).sort()).toEqual(Object.keys(LIVE.candidate).sort());
  });
  it("the contract document names what the record does NOT have", () => {
    expect(RESULT_RECORD_CONTRACT.notOnRecord.join(" ")).toMatch(/previewCandidate.*pregame\.cards.*coachGold/);
  });
});

describe("one identity from raw record to every projection (captured Chaos record)", () => {
  const record = { ...structuredClone(CAPTURED), session: SESSION };
  const row = buildSavedClash({ record, userId: "u-1", claimedFrom: "signed_in" });
  it("saved row ← record: result id, score, era, rosters, coaches, candidate", () => {
    expect(row.result_id).toBe(CAPTURED.id); expect(row.gold_score).toBe(CAPTURED.core.finalScore.gold); expect(row.blue_score).toBe(CAPTURED.core.finalScore.blue);
    expect(row.era_id).toBe(CAPTURED.eraId); expect(row.mode).toBe("chaos");
    expect(row.gold_roster.map((p) => p.id)).toEqual(CAPTURED.goldIds); expect(row.blue_roster.map((p) => p.id)).toEqual(CAPTURED.blueIds);
    expect(row.gold_roster.every((p) => p.name && p.pos)).toBe(true);
    expect(row.gold_coach?.id ?? "neutral").toBe(CAPTURED.coachIds.gold); expect(row.blue_coach?.id ?? "neutral").toBe(CAPTURED.coachIds.blue);
    expect(row).toMatchObject({ candidate_id: "Candidate 4", calibration_version: CAPTURED.candidate.possessionCalibrationVersion, candidate_core_hash: CAPTURED.candidate.coreHash });
    expect(JSON.stringify(row.result_snapshot)).not.toContain(SESSION);
  });
  it("history projection ← saved row: the list carries the same identity, no snapshot", () => {
    const li = listProjection(row);
    expect(li.result_snapshot).toBeUndefined(); expect(li.result_id).toBe(row.result_id); expect(li.candidate_id).toBe("Candidate 4"); expect(li.gold_coach).toEqual(row.gold_coach);
  });
  it("breakdown ← saved snapshot equals breakdown ← raw record", () => {
    expect(JSON.stringify(buildBreakdown(row.result_snapshot))).toBe(JSON.stringify(buildBreakdown(record)));
    expect(buildBreakdown(row.result_snapshot).available).toBe(true);
  });
  it("Run It Back ← saved row: same five, same coaches, same era (the server picks a new seed)", () => {
    const s = runItBackSetup(row);
    expect(s.goldIds ?? s.gold).toEqual(CAPTURED.goldIds);
    expect(JSON.stringify(s)).toContain(CAPTURED.coachIds.gold); expect(JSON.stringify(s)).toContain(CAPTURED.eraId);
    expect(JSON.stringify(s)).not.toMatch(/"seed"/);
  });
});

describe("Challenge metadata ← the real record", () => {
  const record = { ...structuredClone(CAPTURED), session: SESSION };
  const run = { chaosRunId: "runcontract01", session: SESSION, status: "SIMULATED", resultId: CAPTURED.id, chaosDraftVersion: "x", eraCustom: false, selectedCoaches: CAPTURED.chaosDraft?.selectedCoaches };
  const manifest = { challengeId: "abcd1234", chaosSequenceVersion: 3 };
  const run2 = async () => {
    const writes = [];
    const fetchStub = async (url, init = {}) => {
      const u = String(url); const method = init.method || "GET";
      if (method === "POST" && u.includes("/rest/v1/challenges")) { writes.push(JSON.parse(init.body)); return new Response(JSON.stringify([{ id: "c-1", public_code: JSON.parse(init.body).public_code }]), { status: 201, headers: { "content-type": "application/json" } }); }
      if (method === "POST" && u.includes("/rest/v1/challenge_secrets")) return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_" + "A".repeat(32); process.env.SUPABASE_ANON_KEY = "sb_publishable_" + "B".repeat(32); process.env.CLOUD_ACCOUNTS_ENABLED = "true";
    const out = await createChallenge({ chaosRunId: run.chaosRunId, userId: "11111111-1111-4111-8111-111111111111", deviceSession: SESSION, displayName: "Joseph" }, { fetch: fetchStub, run, record, manifest });
    return { out, row: writes[0] };
  };
  it("stores the candidate, calibration and core hash that produced the creator's result", async () => {
    const { out, row } = await run2();
    expect(out.status).toBe("created");
    expect(row).toMatchObject({ candidate_id: "Candidate 4", calibration_version: CAPTURED.candidate.possessionCalibrationVersion, parameter_hash: CAPTURED.candidate.coreHash, creator_result_id: CAPTURED.id });
    expect(row.creator_gold_score).toBe(CAPTURED.core.finalScore.gold); expect(row.creator_era_id).toBe(CAPTURED.eraId);
  });
  it("hashes the real identity into the fingerprint (it previously hashed nulls)", async () => {
    const { row } = await run2();
    const withNulls = challengeFingerprint({ challengeVersion: row.challenge_version, draftModelVersion: JSON.stringify(row.draft_model_version), playerPoolVersion: row.player_pool_version, candidateId: null, parameterHash: null, eraContractVersion: row.era_contract_version, cpuPolicyVersion: row.cpu_policy_version, creatorChallengeSeedDomain: manifest.challengeId, chaosSequenceVersion: manifest.chaosSequenceVersion });
    const withReal = challengeFingerprint({ challengeVersion: row.challenge_version, draftModelVersion: JSON.stringify(row.draft_model_version), playerPoolVersion: row.player_pool_version, candidateId: "Candidate 4", parameterHash: CAPTURED.candidate.coreHash, eraContractVersion: row.era_contract_version, cpuPolicyVersion: row.cpu_policy_version, creatorChallengeSeedDomain: manifest.challengeId, chaosSequenceVersion: manifest.chaosSequenceVersion });
    expect(row.challenge_fingerprint).toBe(withReal); expect(row.challenge_fingerprint).not.toBe(withNulls);
  });
  it("the creator snapshot a recipient sees after completing is unchanged: catalog five and the gold coach by id", async () => {
    const { row } = await run2();
    expect(row.creator_roster.map((p) => p.id)).toEqual(CAPTURED.goldIds); expect(row.creator_roster.every((p) => p.name)).toBe(true);
    expect(row.creator_coach).toEqual({ id: CAPTURED.coachIds.gold, name: getCoach(CAPTURED.coachIds.gold)?.name ?? null });
  });
  it("the seed stays in challenge_secrets, never on the challenge row", async () => {
    const { row } = await run2();
    expect(JSON.stringify(row)).not.toContain(String(CAPTURED.seed)); expect(row.seed).toBeUndefined();
  });
  it("engineIdentity is null for a production-engine record", () => {
    expect(engineIdentity({ ...CAPTURED, preview: false })).toEqual({ candidateId: null, calibrationVersion: null, candidateCoreHash: null });
  });
});

describe("no server consumer reads a view-model field off a stored record", () => {
  it("api/ never reads previewCandidate, pregame.cards or coachGold from a record", () => {
    const files = [...readdirSync("api").filter((f) => f.endsWith(".js")).map((f) => `api/${f}`), ...readdirSync("api/_lib").filter((f) => f.endsWith(".js")).map((f) => `api/_lib/${f}`)];
    for (const f of files) {
      // code only: comments and string contents removed (a string may NAME a field; only code can READ it)
      const src = read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""').replace(/\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/record\??\.previewCandidate|pregame\??\.cards|record\??\.pregame\??\.coach|record\??\.coachGold|record\??\.coachBlue/);
    }
  });
});
