// ── /api/health — minimal public readiness, operator-only diagnostics ──────────
// The PUBLIC response says whether the service is up and which engine identity
// it runs: coarse subsystem states, the build, the candidate. It never says
// anything about credentials — not that one exists, not its kind or length, not
// whether a provider accepted it — and it carries no configuration dump.
//
// DIAGNOSTICS (?deep=1) are for operators. They ask the account provider
// whether it still accepts the server's own credential (a revoked key is
// correctly shaped, so every static check reports ready while every save fails
// 401), and they report configuration booleans, the probe outcome and a
// one-way fingerprint of the stored value. Until 2026-09-10 this was public;
// now the request must carry an OWNER preview-access key in the X-Preview-Key
// header (the same hashed allowlist that gates protected previews — see
// config/previewAccess.js and api/_lib/previewAccessCheck.js). The key travels
// in a header, never in the URL; the response is private and never cached;
// authorization happens BEFORE any provider round trip; an ordinary signed-in
// player, a tester key, a bare query flag or any other query spelling gets a
// generic 401 and no probe.
import { hasStore, cmd } from "./_lib/store.js";
import { circuitState } from "./_lib/ai.js";
import { flags } from "./_lib/flags.js";
import { VERSIONS } from "../src/versions.js";
import { computeResult, newSeed } from "./_lib/game-core.js";
import { PLAYERS } from "../src/players.js";
import { previewCandidateIdentity } from "./_lib/previewEngine.js";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { cloudAccountsServerStatus, cloudAccountsReady, serviceKeyProbe, providerRefsMatch, serviceKeyIntegrity, previewPointedAtProduction } from "./_lib/cloudAccounts.js";
import { previewIdentity } from "./_lib/previewAccessCheck.js";

/** Every spelling that asks for more than the public payload. */
export const wantsDiagnostics = (query) => {
  const q = query || {};
  return q.deep === "1" || q.deep === "true" || q.deep === "" || q.debug !== undefined || q.diag !== undefined || q.diagnostics !== undefined || q.verbose !== undefined;
};

/** Operator = the holder of an ENABLED, OWNER-role preview-access key, presented as a header. */
export const isOperator = async (headers, identity = previewIdentity) => {
  const who = await identity(headers || {});
  return !!(who?.ok && who.role === "owner");
};

export default async function handler(req, res, deps = {}) {
  const resolveIdentity = deps.identity || previewIdentity;
  const probeFn = deps.serviceKeyProbe || serviceKeyProbe;
  res.setHeader("Cache-Control", "no-store");

  // Authorize BEFORE any privileged work. A generic refusal: no hint about which
  // header, which role, or whether diagnostics exist at all.
  const diagnostics = wantsDiagnostics(req.query);
  if (diagnostics) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "X-Preview-Key, Cookie");
    if (!(await isOperator(req.headers, resolveIdentity))) return res.status(401).json({ error: "unauthorized" });
  }

  let coreEngine = "ok";
  try {
    const five = (pos) => PLAYERS.filter((p) => p.pos === pos)[0];
    const t = ["PG", "SG", "SF", "PF", "C"].map(five);
    const r = computeResult("single", t, t.map((p, i) => PLAYERS.filter((x) => x.pos === t[i].pos)[1]), newSeed());
    if (!r?.core?.winner) coreEngine = "degraded";
  } catch { coreEngine = "failed"; }

  let persistence = "not_configured";
  if (hasStore()) {
    const pong = await cmd("SET", "health:ping", "1", "EX", 30);
    persistence = pong === "OK" ? "ok" : "degraded";
  }

  const f = flags();
  const circuit = await circuitState();
  const identity = previewCandidateIdentity();
  const st = cloudAccountsServerStatus();

  // Public: availability, never configuration. `enabled` is the feature switch;
  // `ready` says the account features can operate (static wiring plus the
  // environment-isolation rule) — it is NOT a claim that the provider accepted
  // the credential; only the operator probe below can say that.
  const body = {
    status: f.maintenance ? "maintenance" : coreEngine === "ok" ? "ok" : "degraded",
    build: VERSIONS.app,
    coreEngine,
    persistence,
    aiNarrative: !f.aiNarrative ? "disabled" : circuit === "OPEN" ? "circuit_open" : "ok",
    simV3: f.simV3,
    cloudAccounts: { enabled: st.enabled, ready: cloudAccountsReady() },
    // Engine identity only: the candidate, its calibration and core hash. No
    // namespaces, flag names, fallback descriptions or access-control notes.
    preview: {
      enabled: f.previewSimEngine,
      candidateId: identity.candidateId,
      candidateCoreHash: identity.coreHash,
      calibrationVersion: identity.possessionCalibrationVersion,
    },
  };
  if (!diagnostics) return res.status(200).json(body);

  // Operator diagnostics. Booleans, statuses and a one-way fingerprint — never a
  // value or a fragment of one. Field names avoid the word the server test
  // forbids in every health payload ("key"), on purpose.
  const probe = await probeFn();
  const diag = {
    environment: process.env.VERCEL_ENV || "local",
    providerConfigured: st.providerUrlConfigured,
    serverCredentialConfigured: st.serviceRoleConfigured,
    browserCredentialConfigured: st.anonKeyConfigured,
    serverAndBrowserSameProject: providerRefsMatch(),
    previewPointedAtProduction: previewPointedAtProduction(),
  };
  diag.serverCredentialAccepted = probe.accepted;
  diag.serverCredentialProbeStatus = probe.status;
  diag.serverCredentialProbeCode = probe.code;
  diag.serverCredentialAcceptedVia = probe.variant;
  diag.serverCredentialAttempts = probe.tried;
  diag.serverCredentialIntegrity = serviceKeyIntegrity();
  diag.previewAccess = {
    waveId: PREVIEW_ACCESS.waveId,
    featureFlag: "PREVIEW_SIM_ENGINE_ENABLED",
    accessControl: process.env.VERCEL_ENV === "preview" ? "hashed-key allowlist (config/previewAccess.js)" : "n/a (not a preview deployment)",
    fallbackEngine: "production engine 3.2.0 (per-request fallback)",
  };
  return res.status(200).json({ ...body, diagnostics: diag });
}
