// ── Preview access allowlist ──────────────────────────────────────────────────
// The deployed preview is access-restricted: a request must present a preview
// access key (cookie `pv_access`, set by POST /api/preview-access, or header
// `x-preview-key` for API tooling). Only SHA-256 HASHES of keys live here —
// the repository is public, and a 128-bit random key is not recoverable from
// its hash. Keys themselves are delivered to people out of band.
//
// Add a tester:    node scripts/preview/accessKey.mjs new <label>
//                  → send the printed key to the tester, commit the hash line.
// Revoke a tester: delete their line, commit, push (the preview redeploys).
export const PREVIEW_ACCESS = Object.freeze({
  keys: Object.freeze([
    { label: "owner", sha256: "0bd0d24aaca55df8625a0f27887795694f38979c9aba55a1a94812cdb363c69f" },
    { label: "tester-pool-1", sha256: "2a710492df8622b0c7aa2595cbb9c89b79b4bbef5ae4fa6cf303d4b8ef94dfdd" },
  ]),
});
