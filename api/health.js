// ── /api/health — minimal public readiness ─────────────────────────────────────
// Exposes only coarse subsystem states. No credentials, hostnames, versions of
// dependencies, or stack traces.
import { hasStore, cmd } from "./_lib/store.js";
import { circuitState } from "./_lib/ai.js";
import { flags } from "./_lib/flags.js";
import { VERSIONS } from "../src/versions.js";
import { computeResult, newSeed } from "./_lib/game-core.js";
import { PLAYERS } from "../src/players.js";
import { PREVIEW_CANDIDATE_CORE_HASH } from "./_lib/previewEngine.js";

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
  return res.status(200).json({
    status: f.maintenance ? "maintenance" : coreEngine === "ok" ? "ok" : "degraded",
    build: VERSIONS.app,
    coreEngine,
    persistence,
    aiNarrative: !f.aiNarrative ? "disabled" : circuit === "OPEN" ? "circuit_open" : "ok",
    simV3: f.simV3,
    // Protected-preview health block. Identity fields only — the candidate id,
    // its version identity, the governing flag and the fallback path. No
    // hashes, secrets or internal diagnostics.
    preview: {
      enabled: f.previewSimEngine,
      candidateId: "Candidate 3",
      candidateCoreHash: PREVIEW_CANDIDATE_CORE_HASH,
      calibrationVersion: VERSIONS.registry?.possessionCalibrationVersion?.version ?? "1.3.0",
      featureFlag: "PREVIEW_SIM_ENGINE_ENABLED",
      fallbackEngine: "production engine 3.2.0 (per-request fallback; emergency-off returns every new request to production while stored preview results stay readable by version)",
      cacheNamespace: "preview-*",
      persistenceNamespace: "pv_ result-id prefix",
      accessControl: process.env.VERCEL_ENV === "preview" ? "hashed-key allowlist (config/previewAccess.js)" : "n/a (not a preview deployment)",
    },
  });
}
