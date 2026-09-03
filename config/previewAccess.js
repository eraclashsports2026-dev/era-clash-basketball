// ── Preview access allowlist — WAVE 2 (candidate4-night-court-wave2) ─────────
// Phase 9A.3. This branch (and the `wave2` alias built from it) admits ONLY the
// Wave 2 pool: one owner key and five pseudonymous tester keys in two cohorts.
// Wave 1's allowlist lives on the frozen `wave1` branch and is untouched; no
// Wave 1 key (owner included) is present here, so Wave 1 keys are refused on
// Wave 2 and Wave 2 keys are refused on Wave 1. The two waves never share a
// credential, a session, a feedback namespace or a metric.
//
// Only SHA-256 HASHES and opaque pseudonymous ids live here — the repository is
// public, and a 128-bit random key is not recoverable from its hash. Raw keys
// exist only in .preview-secrets/wave2-access-keys.json (gitignored, 0600, in a
// 0700 directory) and are delivered to people out of band by the owner.
//
// Revoke a tester: set enabled: false, commit, push wave2 — already-issued
//                  sessions die on their next request (the middleware re-checks
//                  this entry every time).
// Rotate a key:    bump keyVersion with the new hash — the old key and every
//                  session minted under it die the same way.
// The signed session is bound to waveId (api/_lib/previewAccessCheck.js), so a
// session from another wave can never verify here.
export const PREVIEW_ACCESS = Object.freeze({
  accessConfigVersion: 3,
  waveId: "candidate4-night-court-wave2",
  studyVersion: "wave2-activation-v1",
  keys: Object.freeze([
    { testerId: "wave2-owner", role: "owner", cohort: null, sha256: "501285518b15f8fa69be01b04f1d9cf58fb0bbcca726c66361def3784bc490dc", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
    { testerId: "wave2-new-01", role: "tester", cohort: "first-time", sha256: "3c8e3ca3e5954a6ac2f47e2b56daf4247a4b4159aef264d8dbfb3879ef08860f", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
    { testerId: "wave2-new-02", role: "tester", cohort: "first-time", sha256: "c0203718f4e0eb96ac57dc51b04a6403ef541b02d0c102929de3186a16507bba", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
    { testerId: "wave2-new-03", role: "tester", cohort: "first-time", sha256: "b17053990219106998bac7141095391d84236b6e9709099758b2994ba8f8aca5", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
    { testerId: "wave2-returning-01", role: "tester", cohort: "returning", sha256: "b492bfe8fecc6e1d9e2ef5f26f1ef0bd8d0a314680fc68891d68ca2818b9abed", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
    { testerId: "wave2-returning-02", role: "tester", cohort: "returning", sha256: "d95721ddf5e07a1c39be9102ca9b42df96163b76912eb3dca35325ee2a1acc4f", enabled: true, keyVersion: 1, createdAt: "2026-09-03" },
  ]),
});
