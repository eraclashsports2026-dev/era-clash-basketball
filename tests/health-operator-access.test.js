import { describe, it, expect } from "vitest";
import healthHandler, { wantsDiagnostics } from "../api/health.js";

// 2026-09-10: /api/health is public and minimal; ?deep=1 (and every other
// diagnostic spelling) is for OPERATORS — an owner-role preview-access key in
// the X-Preview-Key header, verified server-side against the hashed allowlist.
// Authorization happens BEFORE the provider probe.
const mockRes = () => { const r = { headers: {}, statusCode: 200 }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const req = (query = {}, headers = {}) => ({ method: "GET", query, headers: { host: "eraclash.test", ...headers } });
const probeSpy = () => { const calls = []; const fn = async () => { calls.push(1); return { accepted: false, status: 401, code: null, variant: null, tried: [] }; }; fn.calls = calls; return fn; };
const owner = async () => ({ ok: true, role: "owner", testerId: "wave2-owner" });
const tester = async () => ({ ok: true, role: "tester", testerId: "wave2-tester-01" });
const nobody = async () => ({ ok: false });
// camelCase field names are matched case-sensitively ("not_configured" is a legitimate persistence state); the server test's blunt /key|token|secret/i rule is applied too.
const FORBIDDEN_PUBLIC = /serverCredential|Configured|fingerprint|Integrity|accessControl|Namespace|fallbackEngine|[kK]ey|token|secret/;

describe("public health", () => {
  it("answers availability and engine identity only — no credential metadata, no configuration dump", async () => {
    const res = mockRes(); const probe = probeSpy();
    await healthHandler(req(), res, { identity: nobody, serviceKeyProbe: probe });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBeTruthy(); expect(res.body.build).toBeTruthy();
    expect(Object.keys(res.body.cloudAccounts).sort()).toEqual(["enabled", "ready"]);
    expect(Object.keys(res.body.preview).sort()).toEqual(["calibrationVersion", "candidateCoreHash", "candidateId", "enabled"]);
    expect(res.body.diagnostics).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_PUBLIC);
    expect(probe.calls.length).toBe(0);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });
  it("ready is not a claim that the provider accepted the credential", async () => {
    const res = mockRes(); await healthHandler(req(), res, { identity: nobody, serviceKeyProbe: probeSpy() });
    expect(typeof res.body.cloudAccounts.ready).toBe("boolean");
    expect("serverCredentialAccepted" in res.body.cloudAccounts).toBe(false);
  });
});

describe("diagnostics are operator-only", () => {
  const spellings = [{ deep: "1" }, { deep: "true" }, { deep: "" }, { debug: "1" }, { diag: "1" }, { diagnostics: "" }, { verbose: "1" }];
  it("recognises every spelling that asks for more than the public payload", () => {
    for (const q of spellings) expect(wantsDiagnostics(q), JSON.stringify(q)).toBe(true);
    expect(wantsDiagnostics({})).toBe(false); expect(wantsDiagnostics({ deep: "0" })).toBe(false);
  });
  it("an anonymous caller gets a generic 401 for every spelling, and no probe runs", async () => {
    for (const q of spellings) {
      const res = mockRes(); const probe = probeSpy();
      await healthHandler(req(q), res, { identity: nobody, serviceKeyProbe: probe });
      expect(res.statusCode, JSON.stringify(q)).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
      expect(probe.calls.length).toBe(0);
      expect(res.headers["cache-control"]).toMatch(/private/); expect(res.headers["cache-control"]).toMatch(/no-store/);
    }
  });
  it("a tester key — or any non-owner identity — is refused; a client-supplied role claim is not consulted", async () => {
    const res = mockRes(); const probe = probeSpy();
    await healthHandler(req({ deep: "1" }, { "x-role": "owner", "x-preview-role": "owner" }), res, { identity: tester, serviceKeyProbe: probe });
    expect(res.statusCode).toBe(401); expect(probe.calls.length).toBe(0);
  });
  it("an operator receives the probe outcome, configuration booleans and a fingerprint — never a value — marked private and never cached", async () => {
    const res = mockRes(); const probe = probeSpy();
    await healthHandler(req({ deep: "1" }), res, { identity: owner, serviceKeyProbe: probe });
    expect(res.statusCode).toBe(200); expect(probe.calls.length).toBe(1);
    const d = res.body.diagnostics;
    expect(typeof d.providerConfigured).toBe("boolean"); expect(typeof d.serverCredentialConfigured).toBe("boolean");
    expect(d.serverCredentialAccepted).toBe(false); expect(d.serverCredentialProbeStatus).toBe(401);
    expect(typeof d.previewPointedAtProduction).toBe("boolean");
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9_-]{16,}/); expect(dump).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\./);
    expect(res.headers["cache-control"]).toBe("private, no-store"); expect(res.headers["vary"]).toMatch(/X-Preview-Key/);
    // the public half is unchanged beside the diagnostics
    expect(Object.keys(res.body.cloudAccounts).sort()).toEqual(["enabled", "ready"]);
  });
  it("the real identity resolver reads the header, not the query string", async () => {
    const res = mockRes(); const probe = probeSpy();
    await healthHandler(req({ deep: "1", key: "anything", "x-preview-key": "anything" }), res, { serviceKeyProbe: probe });
    expect(res.statusCode).toBe(401); expect(probe.calls.length).toBe(0);
  });
});
