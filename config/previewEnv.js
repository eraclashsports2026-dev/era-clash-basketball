// ── Preview-environment configuration (repository-scoped) ─────────────────────
// The Vercel Git integration deploys every branch as a Preview deployment, and
// dashboard environment variables are an owner-only surface. This file is the
// repository's own preview-scope configuration: it is consulted ONLY when the
// runtime says VERCEL_ENV === "preview", and an explicit
// PREVIEW_SIM_ENGINE_ENABLED environment variable always wins over it in both
// directions. Production deployments build from main, which does not carry
// this integration at all.
//
// Emergency-off (no dashboard access needed): set previewSimEngine to false,
// commit, push — the preview redeploys on the production engine. With
// dashboard access, setting PREVIEW_SIM_ENGINE_ENABLED=false in the Preview
// scope does the same without a commit.
export const PREVIEW_ENV = Object.freeze({
  // Candidate 3 activation in the deployed preview. Starts false: the first
  // deployed verification pass must prove the environment itself (access
  // gate, persistence, fallback engine) before the candidate turns on.
  previewSimEngine: true,
  // The deployed preview requires an access key (see config/previewAccess.js).
  requireAccess: true,
});
