// ── /api/health — minimal public readiness ─────────────────────────────────────
// Exposes only coarse subsystem states. No credentials, hostnames, versions of
// dependencies, or stack traces.
import { hasStore, cmd } from "./_lib/store.js";
import { circuitState } from "./_lib/ai.js";
import { flags } from "./_lib/flags.js";
import { VERSIONS } from "../src/versions.js";
import { computeResult, newSeed } from "./_lib/game-core.js";
import { PLAYERS } from "../src/players.js";
import { previewCandidateIdentity } from "./_lib/previewEngine.js";
import { PREVIEW_ACCESS } from "../config/previewAccess.js";
import { cloudAccountsServerStatus, serviceKeyAccepted, providerRefsMatch } from "./_lib/cloudAccounts.js";

export default async function handler(req, res) {
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
  res.setHeader("Cache-Control", "no-store");
  const identity = previewCandidateIdentity();

  // Cloud-account readiness, as booleans and never a key. `deep=1` additionally
  // asks the provider whether it still accepts the server's own credential,
  // which costs a round trip and so is opt-in. It exists because a revoked key
  // is correctly shaped: every static check reported ready while every save
  // failed with a 401, and nothing surfaced that until a game was played.
  // Renamed deliberately: tests/server.test.js forbids the substring "key"
  // anywhere in this payload. That rule is blunt on purpose and worth keeping,
  // so the field names avoid the word rather than the assertion being softened
  // to accommodate them. These are booleans about configuration, never values.
  const st = cloudAccountsServerStatus();
  const cloud = {
    providerConfigured: st.providerUrlConfigured,
    serverCredentialConfigured: st.serviceRoleConfigured,
    browserCredentialConfigured: st.anonKeyConfigured,
    enabled: st.enabled,
  };
  if (req.query?.deep === "1" || req.query?.deep === "true") {
    cloud.serverCredentialAccepted = await serviceKeyAccepted();
    // A boolean, not a URL: whether the server and the browser are configured
    // for the same project at all. If they are not, a perfectly valid
    // credential still gets a 401, because it is being shown to the wrong door.
    cloud.serverAndBrowserSameProject = providerRefsMatch();
  }
  return res.status(200).json({
    status: f.maintenance ? "maintenance" : coreEngine === "ok" ? "ok" : "degraded",
    build: VERSIONS.app,
    coreEngine,
    persistence,
    aiNarrative: !f.aiNarrative ? "disabled" : circuit === "OPEN" ? "circuit_open" : "ok",
    simV3: f.simV3,
    cloudAccounts: cloud,
    // Protected-preview health block. Identity fields only — the candidate id,
    // its version identity, the governing flag and the fallback path. No
    // hashes, secrets or internal diagnostics.
    preview: {
      enabled: f.previewSimEngine,
      // Read from previewCandidateIdentity(), the one place that resolves the
      // active candidate. These were a literal "Candidate 3" and a lookup at
      // VERSIONS.registry.* — a path that does not exist on that object, so the
      // `?? "1.3.0"` fallback fired on every request and the endpoint reported a
      // hardcoded version regardless of the registry. It sat beside a core hash
      // that DID track the candidate, so after Candidate 4 was locked this block
      // reported Candidate 3 / 1.3.0 next to Candidate 4's hash.
      candidateId: identity.candidateId,
      candidateCoreHash: identity.coreHash,
      calibrationVersion: identity.possessionCalibrationVersion,
      featureFlag: "PREVIEW_SIM_ENGINE_ENABLED",
      // Phase 9A.3: which private-beta wave this deployment admits (public id).
      waveId: PREVIEW_ACCESS.waveId,
      fallbackEngine: "production engine 3.2.0 (per-request fallback; emergency-off returns every new request to production while stored preview results stay readable by version)",
      cacheNamespace: "preview-*",
      persistenceNamespace: "pv_ result-id prefix",
      accessControl: process.env.VERCEL_ENV === "preview" ? "hashed-key allowlist (config/previewAccess.js)" : "n/a (not a preview deployment)",
    },
  });
}
