// ── Preview access allowlist (Wave 1, key version 2) ─────────────────────────
// Version 1 keys (phase 6C5) were exposed in conversation output and are
// REVOKED — every v1 hash is gone and v1 sessions fail the keyVersion check.
// Only SHA-256 HASHES and opaque pseudonymous tester ids live here — the
// repository is public, and a 128-bit random key is not recoverable from its
// hash. Raw keys exist only in .preview-secrets/wave1-access-keys.json
// (gitignored, 0600) and are delivered to people out of band.
//
// Add a tester:    node scripts/preview/accessKey.mjs new <tester-id>
//                  → deliver the printed key out of band, commit the entry.
// Revoke a tester: set enabled: false (or delete the entry), commit, push —
//                  already-issued sessions die on their next request because
//                  the middleware re-checks this entry every time.
// Rotate all keys: bump keyVersion on new entries and remove the old ones —
//                  sessions carry their keyVersion and stale ones fail.
export const PREVIEW_ACCESS = Object.freeze({
  accessConfigVersion: 2,
  waveId: "candidate3-wave1",
  keys: Object.freeze([
    { testerId: "owner", role: "owner", sha256: "6d3f1c7811d9f068b99f990127bc85d6d5fb1b63016051114861310d2e7ab52e", enabled: true, keyVersion: 2 },
    { testerId: "wave1-tester-01", role: "tester", sha256: "94c7eca8df528814228ea6b680825aedef374aacb3823fdb2aa6f2ed19fd0628", enabled: true, keyVersion: 2 },
    { testerId: "wave1-tester-02", role: "tester", sha256: "d5e194388e5ba976dba5778dcb5aa7e2a5826dfa51e7a6af302c33766c2dd68b", enabled: true, keyVersion: 2 },
    { testerId: "wave1-tester-03", role: "tester", sha256: "d344c1b3d9f3bf6c42b21cf816e61d0bea82dc145910a99d933524078e0a364d", enabled: true, keyVersion: 2 },
    { testerId: "wave1-tester-04", role: "tester", sha256: "56cc3895d6594abc38e3cd2ec38a1279d506cbd9c4db8012ac4304d97200cb2d", enabled: true, keyVersion: 2 },
    { testerId: "wave1-tester-05", role: "tester", sha256: "a018c836d98e19a22636c5c0967acdea8d1dfcdab1ace2d72ea80fe8c29a7775", enabled: true, keyVersion: 2 },
  ]),
});
