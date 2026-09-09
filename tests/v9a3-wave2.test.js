// ── Phase 9A.3: Night Court V1 acceptance · Wave 2 private-beta isolation ─────
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { verifyPreviewKey, verifySession, signSession, previewIdentity, SESSION_VERSION, WAVE_ID } from "../api/_lib/previewAccessCheck.js";
import { validateWave2Feedback, validatePreviewFeedback, WAVE2_FEEDBACK_SCHEMA_VERSION, FEEDBACK_SCHEMA_VERSION } from "../api/feedback.js";
import { EVENTS_ALLOWLIST, wave2PartitionKey } from "../api/events.js";
import { ACTIVATION_EVENTS } from "../src/activation.js";
import { WAVE2, WAVE2_COHORTS, WAVE2_TASKS, WAVE2_TASK_IDS, WAVE2_RATINGS, WAVE2_ISSUE_CATEGORIES, WAVE2_TELEMETRY_EVENTS, cohortOf } from "../src/wave2.js";

const read = (f) => readFileSync(f, "utf8");
const json = (f) => JSON.parse(read(f));
beforeAll(() => { process.env.PREVIEW_SESSION_SECRET = "wave2-test-secret"; });

describe("owner acceptance", () => {
  it("is recorded with the exact text, private-beta scope, and no promotion authorised", () => {
    const a = json("data/validation/9a3/night-court-v1-owner-acceptance.json");
    expect(a.acceptanceText).toBe("APPROVE NIGHT COURT V1"); expect(a.acceptanceAuthority).toBe("OWNER");
    expect(a.themeId).toBe("basketball-night-court-v1"); expect(a.themeStatus).toBe("OWNER_ACCEPTED_FOR_PRIVATE_BETA");
    expect(a.implementationBranch).toBe("phase-9a2-night-court-production-theme");
    // Distribution is a SEPARATE owner decision: the flag may be true only when the
    // authorization record exists with the exact text (AUTHORIZE WAVE 2 DISTRIBUTION,
    // recorded 2026-09-03). Promotion of Wave 1 or production is never authorised here.
    const auth = json("data/validation/9a3/wave2-distribution-authorization.json");
    if (a.wave2DistributionAuthorized) expect(auth?.authorizationText).toBe("AUTHORIZE WAVE 2 DISTRIBUTION");
    else expect(auth).toBeNull();
    expect(a.stableWave1PromotionAuthorized).toBe(false); expect(a.productionPromotionAuthorized).toBe(false);
    expect(a.doesNotMean).toContain("production approved");
  });
});

describe("Wave 2 allowlist", () => {
  it("is the Wave 2 pool only: one owner, three first-time, two returning; no Wave 1 id, no shared hash", () => {
    expect(PREVIEW_ACCESS.waveId).toBe(WAVE2.waveId); expect(WAVE_ID).toBe(WAVE2.waveId); expect(PREVIEW_ACCESS.accessConfigVersion).toBe(3);
    const ids = PREVIEW_ACCESS.keys.map((k) => k.testerId).sort();
    expect(ids).toEqual(["wave2-new-01", "wave2-new-02", "wave2-new-03", "wave2-owner", "wave2-returning-01", "wave2-returning-02"]);
    expect(PREVIEW_ACCESS.keys.filter((k) => k.cohort === "first-time")).toHaveLength(3);
    expect(PREVIEW_ACCESS.keys.filter((k) => k.cohort === "returning")).toHaveLength(2);
    expect(PREVIEW_ACCESS.keys.find((k) => k.role === "owner").cohort).toBeNull();
    for (const k of PREVIEW_ACCESS.keys) expect(cohortOf(k.testerId) ?? null).toBe(k.cohort);
    const w1 = json("data/validation/9a3/wave1-baseline-preservation.json").accessConfiguration.credentialEntryHashes.map((e) => e.sha256);
    for (const k of PREVIEW_ACCESS.keys) expect(w1, `${k.testerId} shares a Wave 1 hash`).not.toContain(k.sha256);
    expect(new Set(PREVIEW_ACCESS.keys.map((k) => k.sha256)).size).toBe(6);
  });
  it("Wave 1 keys cannot verify here (their hashes are absent) and raw Wave 2 keys are local only", async () => {
    // Any 32-hex string whose hash is not in THIS allowlist is refused — the Wave 1 pool included.
    expect((await verifyPreviewKey("0123456789abcdef0123456789abcdef")).ok).toBe(false);
    const f = ".preview-secrets/wave2-access-keys.json";
    if (existsSync(f)) {
      const doc = json(f);
      expect((statSync(".preview-secrets").mode & 0o777).toString(8)).toBe("700"); expect((statSync(f).mode & 0o777).toString(8)).toBe("600");
      expect(execSync(`git check-ignore ${f} || true`, { encoding: "utf8" }).trim()).not.toBe("");
      for (const k of doc.keys) {
        expect(createHash("sha256").update(k.key).digest("hex")).toBe(PREVIEW_ACCESS.keys.find((e) => e.testerId === k.testerId)?.sha256);
        const hits = execSync(`git grep -l "${k.key}" -- . ':!.preview-secrets' || true`, { encoding: "utf8" }).trim();
        expect(hits, `raw key for ${k.testerId} in tracked content`).toBe("");
        expect((await verifyPreviewKey(k.key))).toMatchObject({ ok: true, testerId: k.testerId, cohort: k.cohort, waveId: WAVE2.waveId });
      }
      const w1 = json(".preview-secrets/wave1-access-keys.json");
      for (const k of w1.keys) expect((await verifyPreviewKey(k.key)).ok, `Wave 1 ${k.testerId} admitted on Wave 2`).toBe(false);
    }
  });
});

describe("wave-bound sessions", () => {
  const live = PREVIEW_ACCESS.keys.find((k) => k.testerId === "wave2-new-01");
  const entry = { testerId: live.testerId, role: live.role, keyVersion: live.keyVersion };
  it("issues v3 sessions naming the wave; identity carries the cohort", async () => {
    const tok = await signSession(entry); expect(tok).toMatch(/^v3\./); expect(SESSION_VERSION).toBe(3);
    const payload = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
    expect(payload.wave).toBe(WAVE2.waveId); expect(JSON.stringify(payload)).not.toMatch(/[a-f0-9]{64}/);
    const v = await verifySession(tok); expect(v).toMatchObject({ ok: true, testerId: "wave2-new-01", cohort: "first-time", waveId: WAVE2.waveId });
    const id = await previewIdentity({ cookie: `pv_session=${encodeURIComponent(tok)}` }); expect(id).toMatchObject({ ok: true, cohort: "first-time" });
  });
  it("refuses a Wave 1-format session, a wrong-wave payload, expiry, tampering, ghosts, rotation and escalation", async () => {
    expect((await verifySession("v2.eyJ2IjoyLCJ0ZXN0ZXJJZCI6Im93bmVyIn0.AAAA")).reason).toBe("wrong-version");
    const tok = await signSession(entry);
    // forge the same body with another wave: the signature no longer matches
    const [, body, mac] = tok.split("."); const p = JSON.parse(Buffer.from(body, "base64url").toString()); p.wave = "candidate3-wave1";
    expect((await verifySession(`v3.${Buffer.from(JSON.stringify(p)).toString("base64url")}.${mac}`)).reason).toBe("bad-signature");
    expect((await verifySession(await signSession(entry, Date.now() - 8 * 24 * 3600 * 1000))).reason).toBe("expired");
    expect((await verifySession(tok.slice(0, -3) + "xxx")).reason).toBe("bad-signature");
    expect((await verifySession(await signSession({ testerId: "wave2-new-09", role: "tester", keyVersion: 1 }))).reason).toBe("revoked");
    expect((await verifySession(await signSession({ ...entry, keyVersion: 99 }))).reason).toBe("revoked");
    expect((await verifySession(await signSession({ ...entry, role: "owner" }))).reason).toBe("revoked");
  });
});

describe("Wave 2 feedback schema v3", () => {
  const good = { taskId: "N2", resultId: "pv_abc123defg", ratings: { draftClarity: 5, eraClarity: 4, coachChoiceClarity: 4, resultClarity: 5, visualComfort: 5 }, issueCategory: "ERA_CONFUSION", optionalComment: "ok", clientBuildStamp: "2.7.2:abcdef012345" };
  it("accepts a task's own ratings, normalises the category, keeps the Wave 1 validator intact", () => {
    expect(WAVE2_FEEDBACK_SCHEMA_VERSION).toBe(3); expect(FEEDBACK_SCHEMA_VERSION).toBe(2);
    const r = validateWave2Feedback(good);
    expect(r).toMatchObject({ taskId: "N2", resultId: "pv_abc123defg", issueCategory: "ERA_CONFUSION" }); expect(Object.keys(r.ratings)).toEqual(WAVE2_TASKS.N2.ratings);
    expect(validateWave2Feedback({ ...good, issueCategory: "made_up" }).issueCategory).toBe("NONE");
    expect(validateWave2Feedback({ taskId: "N1", ratings: { startingClarity: 4, modeChoiceClarity: 5, visualComfort: 4, visualPremiumQuality: 3, brandDistinctiveness: 4 } })).toBeTruthy();
    expect(typeof validatePreviewFeedback).toBe("function");
  });
  it("rejects unknown tasks, missing or foreign ratings, a result-bound task without a result, over-long comments, and never validates identity", () => {
    expect(validateWave2Feedback({ ...good, taskId: "X9" })).toBeNull();
    expect(validateWave2Feedback({ ...good, ratings: { ...good.ratings, draftClarity: 0 } })).toBeNull();
    expect(validateWave2Feedback({ ...good, ratings: { ...good.ratings, notARating: 5 } })).toBeNull();
    expect(validateWave2Feedback({ ...good, resultId: undefined })).toBeNull();
    expect(validateWave2Feedback({ ...good, optionalComment: "x".repeat(501) })).toBeNull();
    const r = validateWave2Feedback({ ...good, testerId: "spoof", waveId: "x", cohort: "owner", candidateId: "Candidate 99", revision: 99, sessionId: "s" });
    for (const k of ["testerId", "waveId", "cohort", "candidateId", "revision", "sessionId"]) expect(r[k]).toBeUndefined();
    expect(WAVE2_ISSUE_CATEGORIES).toHaveLength(15); expect(Object.keys(WAVE2_RATINGS)).toHaveLength(11);
    for (const id of WAVE2_TASK_IDS) for (const f of WAVE2_TASKS[id].ratings) expect(WAVE2_RATINGS[f], `${id}.${f}`).toBeTruthy();
  });
  it("writes only wave2-* keys and reads identity from the session (source pin)", () => {
    const src = read("api/feedback.js").split('if (b.kind === "wave2")')[1].split('if (b.kind === "preview")')[0];
    expect(src).toMatch(/previewIdentity\(req\.headers\)/); expect(src).toMatch(/wave2-feedback:primary/); expect(src).toMatch(/wave2-metrics:counters/);
    expect(src).not.toMatch(/preview-feedback:/); expect(src).not.toMatch(/preview-metrics:/);
    expect(src).toMatch(/testerId: who\.testerId/); expect(src).toMatch(/buildStamp: serverBuildStamp\(\)/);
  });
});

describe("Wave 2 telemetry", () => {
  it("every study event is allowlisted server-side and mirrored client-side; the partition never mixes waves", () => {
    for (const e of WAVE2_TELEMETRY_EVENTS.filter((x) => x !== "preview_fallback_invoked")) expect(EVENTS_ALLOWLIST.has(e), e).toBe(true);
    expect(read("api/game.js")).toMatch(/preview_fallback_invoked/); // server-side, counted into the wave's namespace
    for (const e of ACTIVATION_EVENTS) expect(EVENTS_ALLOWLIST.has(e), e).toBe(true);
    for (const e of WAVE2_TELEMETRY_EVENTS.filter((x) => !/^(rematch_started|feedback_submitted|preview_fallback_invoked|dream_|eligible_)/.test(x))) expect(ACTIVATION_EVENTS, e).toContain(e);
    expect(wave2PartitionKey(WAVE2.waveId, "first-time", "wave2-new-01", "abcdef")).toBe(`wave2-metrics:${WAVE2.waveId}:first-time:wave2-new-01:abcdef`);
    expect(wave2PartitionKey(WAVE2.waveId, null, "wave2-owner", "not a build")).toBe(`wave2-metrics:${WAVE2.waveId}:unknown:wave2-owner:unknown`);
    const ev = read("api/events.js");
    expect(ev).toMatch(/previewIdentity\(req\.headers\)/); expect(ev).not.toMatch(/preview-metrics:/);
    const client = [read("src/components/arena/ChaosStage.jsx"), read("src/components/arena/ResultDock.jsx"), read("src/App.jsx"), read("src/activation.js")].join("\n");
    for (const e of ["chaos_roll_completed", "chaos_era_revealed", "chaos_coach_selected", "chaos_game_completed", "result_tab_opened", "new_clash_started", "time_to_mode_selection_recorded"]) expect(client, e).toMatch(new RegExp(`"${e}"`));
    expect(read("src/analytics.js")).toMatch(/build: shortBuild\(\)/);
    expect(read("api/game.js")).not.toMatch(/waveId: "candidate3-wave1"/);
  });
});

describe("frozen study contracts and cohorts", () => {
  it("exist, are frozen, and match the code constants", () => {
    for (const f of ["wave2-identity", "wave2-cohort-contract", "wave2-access-contract", "wave2-test-plan", "wave2-feedback-contract", "wave2-telemetry-contract", "wave2-acceptance-policy", "wave1-baseline-preservation"]) expect(existsSync(`data/validation/9a3/${f}.json`), f).toBe(true);
    const idn = json("data/validation/9a3/wave2-identity.json"); expect(idn.status).toBe("FROZEN"); expect(idn.waveId).toBe(WAVE2.waveId); expect(idn.bindings.candidateLockCoreHash).toBe("55bb26a20e7d9176b25f102eea553820a7ea94cf935953f87cb3c9cc18656fff");
    const coh = json("data/validation/9a3/wave2-cohort-contract.json"); expect(coh.cohorts["first-time"].testerIds).toEqual(WAVE2_COHORTS["first-time"].testerIds); expect(coh.humanTestingStarted).toBe(false);
    const pol = json("data/validation/9a3/wave2-acceptance-policy.json"); expect(pol.status).toMatch(/^FROZEN/); expect(pol.firstTimeActivationGates.medianTimeToFirstRollSeconds).toBe("≤ 90");
    const plan = json("data/validation/9a3/wave2-test-plan.json"); expect(plan.firstTime.tasks.map((t) => t.id)).toEqual(["N1", "N2", "N3", "N4", "N5"]); expect(plan.returning.tasks.map((t) => t.id)).toEqual(["R1", "R2", "R3"]);
    const access = json("data/validation/9a3/wave2-access-contract.json"); expect(access.status).toBe("FROZEN"); expect(access.counts).toEqual({ owner: 1, firstTime: 3, returning: 2 }); expect(JSON.stringify(access)).not.toMatch(/"key":/);
    for (const d of ["wave2-invite-template", "wave2-first-time-tester-guide", "wave2-returning-tester-guide", "wave2-operator-guide"]) { expect(existsSync(`docs/preview/${d}.md`), d).toBe(true); expect(read(`docs/preview/${d}.md`)).not.toMatch(/\b[a-f0-9]{32}\b/); }
  });
  it("the Wave 1 baseline is recorded and the wave1 branch head matches it", () => {
    const w1 = json("data/validation/9a3/wave1-baseline-preservation.json");
    expect(w1.commit).toBe("4dc59e7b2175b82cea8d5ab5c336b75b550c7f59"); expect(w1.buildStamp).toBe("eraclash-assets:2.7.2:2f35a3b70c30"); expect(w1.accessConfiguration.entries).toBe(8);
    const head = execSync("git rev-parse origin/wave1 2>/dev/null || git rev-parse wave1", { encoding: "utf8" }).trim();
    expect(head).toBe(w1.commit);
    expect(createHash("sha256").update(execSync("git show origin/wave1:config/previewAccess.js")).digest("hex")).toBe(w1.accessConfiguration.sha256);
  });
  it("the product surfaces the Wave 2 panel only on a Wave 2 deployment and adds no route or function", () => {
    expect(read("src/components/Feedback.jsx")).toMatch(/if \(IS_WAVE2\) return <Wave2Feedback/);
    expect(read("src/components/arena/InfoPages.jsx")).toMatch(/feedback: \{ title: "Wave 2 feedback"/);
    expect(read("src/components/arena/UtilityBar.jsx")).toMatch(/\["FEEDBACK", "feedback"/);
    expect(execSync("ls api/*.js | grep -v _lib | wc -l", { encoding: "utf8" }).trim()).toBe("12");
    // The invariant is the serverless FUNCTION budget, which a rewrite does not
    // consume: a later phase may add SPA routes (9B.1 added /auth/* and
    // /my-eraclash) without touching the 13-function limit. What must stay true
    // is that every Wave 2 route is still rewritten to the app shell.
    const rewrites = JSON.parse(read("vercel.json")).rewrites.map((r) => r.source);
    for (const required of ["/play", "/play/:path*", "/membership", "/fantasy/:path*", "/modes/:path*"]) {
      expect(rewrites, required).toContain(required);
    }
  });
});
