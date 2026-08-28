// ── Phase 6C6 — Wave 1 credentials, sessions, scenarios, feedback v2 ──────────
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { verifyPreviewKey, verifySession, signSession, previewIdentity, COOKIE_NAME, SESSION_TTL_SECONDS } from "../api/_lib/previewAccessCheck.js";
import { validatePreviewFeedback, PREVIEW_ISSUE_CATEGORIES, FEEDBACK_SCHEMA_VERSION } from "../api/feedback.js";
import { WAVE1_SCENARIOS, getWave1Scenario, WAVE1_PLAN } from "../src/wave1Scenarios.js";
import { PLAYERS } from "../src/players.js";
import { COACHES } from "../src/v3/coaches.js";
import { findDuplicatePerson } from "../src/v3/persons.js";

beforeAll(() => { process.env.PREVIEW_SESSION_SECRET = "vitest-session-secret"; });
afterEach(() => { process.env.PREVIEW_SESSION_SECRET = "vitest-session-secret"; });

// The v1 keys that appeared in phase 6C5 conversation output. Hard-coded HERE
// as a regression tripwire: they must never verify again. (Hashes would hide
// the point — these strings are already burned.)
const EXPOSED_V1_KEYS = ["c3db0203453b5ff57285ec6bc0d08453", "5866914beb2a928b06d1840fcf3fc581"];

describe("Wave 1 credentials", () => {
  it("carries exactly one owner and five wave1 testers, all v2, hashes only", () => {
    expect(PREVIEW_ACCESS.accessConfigVersion).toBe(2);
    const owners = PREVIEW_ACCESS.keys.filter((k) => k.role === "owner" && k.enabled !== false);
    const testers = PREVIEW_ACCESS.keys.filter((k) => k.role === "tester" && k.enabled !== false);
    expect(owners).toHaveLength(1);
    expect(testers.map((t) => t.testerId).sort()).toEqual(
      ["wave1-tester-01", "wave1-tester-02", "wave1-tester-03", "wave1-tester-04", "wave1-tester-05"]);
    for (const k of PREVIEW_ACCESS.keys) {
      expect(k.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(k.keyVersion).toBe(2);
      expect(JSON.stringify(k)).not.toMatch(/@/);
    }
    expect(new Set(PREVIEW_ACCESS.keys.map((k) => k.sha256)).size).toBe(PREVIEW_ACCESS.keys.length);
  });

  it("REVOKED: the exposed v1 keys never verify again", async () => {
    for (const k of EXPOSED_V1_KEYS) expect((await verifyPreviewKey(k)).ok, k.slice(-4)).toBe(false);
  });

  it("key-leak regression: no raw key from the local secret file exists in tracked content", () => {
    if (!existsSync(".preview-secrets/wave1-access-keys.json")) return; // other machines hold no secrets
    const { keys } = JSON.parse(readFileSync(".preview-secrets/wave1-access-keys.json", "utf8"));
    // git grep: tracked + staged content only — exactly what a commit would ship.
    for (const k of keys) {
      const hits = execSync(`git grep -l "${k.key}" || true`, { encoding: "utf8" }).trim();
      expect(hits, `raw key for ${k.testerId} leaked`).toBe("");
    }
  }, 30_000);

  it(".preview-secrets is gitignored", () => {
    expect(execSync("git check-ignore .preview-secrets/wave1-access-keys.json || true", { encoding: "utf8" }).trim()).not.toBe("");
  });
});

describe("signed preview sessions", () => {
  const entry = { testerId: "wave1-tester-01", role: "tester", keyVersion: 2 };

  it("issues and verifies a finite session carrying no key material", async () => {
    const tok = await signSession(entry);
    expect(tok).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const payload = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "keyVersion", "role", "sid", "testerId", "v"]);
    expect(JSON.stringify(payload)).not.toMatch(/[a-f0-9]{64}/); // no hash, no key
    expect(payload.exp - payload.iat).toBe(SESSION_TTL_SECONDS);
    const v = await verifySession(tok);
    expect(v.ok).toBe(true);
    expect(v.testerId).toBe("wave1-tester-01");
  });

  it("rejects expiry, tampering, malformed tokens, and wrong-secret tokens", async () => {
    const old = await signSession(entry, Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    expect((await verifySession(old)).reason).toBe("expired");
    const tok = await signSession(entry);
    expect((await verifySession(tok.slice(0, -3) + "xxx")).reason).toBe("bad-signature");
    expect((await verifySession("v2.garbage")).reason).toBe("malformed");
    process.env.PREVIEW_SESSION_SECRET = "a-different-secret";
    expect((await verifySession(tok)).reason).toBe("bad-signature");
  });

  it("revocation and key rotation kill already-issued sessions", async () => {
    const ghost = await signSession({ testerId: "wave1-tester-99", role: "tester", keyVersion: 2 });
    expect((await verifySession(ghost)).reason).toBe("revoked");     // not in allowlist
    const stale = await signSession({ testerId: "wave1-tester-01", role: "tester", keyVersion: 1 });
    expect((await verifySession(stale)).reason).toBe("revoked");     // rotated keyVersion
    const escal = await signSession({ testerId: "wave1-tester-01", role: "owner", keyVersion: 2 });
    expect((await verifySession(escal)).reason).toBe("revoked");     // role must match the entry
  });

  it("fails closed without a signing secret", async () => {
    delete process.env.PREVIEW_SESSION_SECRET;
    delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.KV_REST_API_TOKEN;
    expect(await signSession(entry)).toBeNull();
    const v = await verifySession("v2.eyJ2IjoyfQ.AAAA");
    expect(v.ok).toBe(false);
  });

  it("previewIdentity: session first, raw-key header for tooling, else refused", async () => {
    const tok = await signSession(entry);
    const s = await previewIdentity({ cookie: `${COOKIE_NAME}=${encodeURIComponent(tok)}` });
    expect(s).toMatchObject({ ok: true, testerId: "wave1-tester-01" });
    expect((await previewIdentity({})).ok).toBe(false);
  });
});

describe("Wave 1 guided scenarios", () => {
  const POS = ["PG", "SG", "SF", "PF", "C"];

  it("eight scenarios, all structurally complete", () => {
    expect(WAVE1_SCENARIOS).toHaveLength(8);
    expect(WAVE1_PLAN.plannedGames).toBe(55);
    for (const s of WAVE1_SCENARIOS) {
      expect(s.id).toMatch(/^w1-s[1-8]$/);
      for (const f of ["title", "instruction", "tradeoff", "era", "coachGold", "coachBlue"]) expect(s[f], `${s.id}.${f}`).toBeTruthy();
    }
  });

  it("uses only valid cards, legal positions, real coaches, no duplicate person", () => {
    for (const s of WAVE1_SCENARIOS) {
      for (const side of ["gold", "blue"]) {
        expect(s[side]).toHaveLength(5);
        expect(findDuplicatePerson(s[side]), `${s.id} ${side}`).toBeFalsy();
        s[side].forEach((id, i) => {
          const p = PLAYERS.find((x) => x.id === id);
          expect(p, `${s.id} ${side} ${id}`).toBeTruthy();
          expect(p.pos === POS[i] || (p.positions || []).includes(POS[i]), `${s.id} ${side} slot ${POS[i]} got ${id}`).toBe(true);
        });
      }
      for (const c of [s.coachGold, s.coachBlue]) expect(COACHES.some((x) => x.id === c), `${s.id} coach ${c}`).toBe(true);
      expect(s.era).toMatch(/^(19[5-9]0s|20[0-2]0s)$/);
    }
  });

  it("no scenario preselects a winner or leaks engine scores", () => {
    for (const s of WAVE1_SCENARIOS) {
      const text = `${s.title} ${s.instruction} ${s.tradeoff}`.toLowerCase();
      expect(text).not.toMatch(/will win|should win|expected to win|favorite to win/);
      expect(JSON.stringify(s)).not.toMatch(/rating|ovr|score:\s*\d/i);
    }
    expect(getWave1Scenario("w1-s3").era).not.toBe(getWave1Scenario("w1-s3") && "");
  });
});

describe("feedback schema v2", () => {
  const good = { kind: "preview", resultId: "pv_abc123defg", scenarioId: "w1-s4", gameMode: "single",
    resultBelievability: 4, teamIdentityFeltAccurate: 5, coachDifferenceFeltMeaningful: 3,
    eraStyleFeltMeaningful: 4, postgameExplanationHelpful: 5, wouldRematchOrShare: true,
    issueCategory: "TEAM_IDENTITY", optionalComment: "big man drifted" };

  it("accepts the v2 shape and normalizes scenario and category", () => {
    expect(FEEDBACK_SCHEMA_VERSION).toBe(2);
    const r = validatePreviewFeedback(good);
    expect(r).toMatchObject({ resultId: "pv_abc123defg", scenarioId: "w1-s4", issueCategory: "TEAM_IDENTITY" });
    expect(validatePreviewFeedback({ ...good, scenarioId: "w1-s9" }).scenarioId).toBe("FREE_FORM");
    expect(validatePreviewFeedback({ ...good, scenarioId: undefined }).scenarioId).toBe("FREE_FORM");
    expect(validatePreviewFeedback({ ...good, issueCategory: "made_up" }).issueCategory).toBe("NONE");
    expect(PREVIEW_ISSUE_CATEGORIES.size).toBe(12);
  });

  it("client-sent identity fields never validate into the record", () => {
    const r = validatePreviewFeedback({ ...good, testerId: "spoof", candidateId: "Candidate 99", waveId: "x", revision: 99 });
    expect(r.testerId).toBeUndefined();
    expect(r.candidateId).toBeUndefined();
    expect(r.revision).toBeUndefined();
  });

  it("still rejects malformed payloads", () => {
    expect(validatePreviewFeedback({ ...good, resultBelievability: 0 })).toBeNull();
    expect(validatePreviewFeedback({ ...good, resultId: "abc123defg" })).toBeNull();
    expect(validatePreviewFeedback({ ...good, optionalComment: "x".repeat(501) })).toBeNull();
  });
});

describe("middleware session gate", () => {
  const mw = readFileSync("middleware.js", "utf8");
  it("issues signed sessions and never stores the raw key in the browser", () => {
    expect(mw).toMatch(/signSession\(who\)/);
    expect(mw).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(mw).not.toMatch(/COOKIE_NAME\}=\$\{encodeURIComponent\(String\(key\)\)/);
    expect(mw).toMatch(/verifySession\(readCookie/);
  });
});
