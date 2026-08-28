# Wave 1 operator guide (candidate3-wave1)

## Keys and testers

- Raw keys (owner + five testers) live at the absolute path
  **`~/era-clash-basketball/.preview-secrets/wave1-access-keys.json`**
  (gitignored, mode 0600, this machine only). Each entry maps a pseudonymous
  tester id to its key. Never commit, paste, or screenshot a key.
- **Distribute (recommended):** copy that tester's **one-tap link** — it carries
  their key and signs them in on tap, and the command prints only their id:

  ```bash
  cd ~/era-clash-basketball && npm run preview:wave1-link -- wave1-tester-01
  ```

  Add a scenario to drop them directly into it:
  `npm run preview:wave1-link -- wave1-tester-01 w1-s4`.
  To open the preview as yourself: `npm run preview:open`.
  For the bare key instead of a link: `npm run preview:wave1-copy-key -- wave1-tester-01`.

  A one-tap link is a credential in a URL: it works until that tester is
  revoked, it appears in the deployment's own request logs, and a screenshot of
  it exposes the key. Send links privately and rotate that tester if one leaks.

  Then paste it into that tester's private message (iMessage/Signal/email)
  using `docs/preview/wave1-invite-template.md`. Run it once per tester with
  `wave1-tester-02` … `wave1-tester-05`; `owner` is your own key. One key per
  person — that's how feedback stays attributable.
- To read the file directly instead: `open ~/era-clash-basketball/.preview-secrets/wave1-access-keys.json`
  (opens in your editor; avoid `cat` in any window whose output is shared).
- **Revoke one tester:** in `config/previewAccess.js`, set their entry's
  `enabled: false`, commit, push (branches `phase-6c6-…` **and** `wave1`).
  Their key AND any already-issued session die on the next request; the other
  four testers are untouched.
- **Rotate everything:** `node scripts/preview/accessKey.mjs new <id>` per
  person, replace the entries (bump `keyVersion`), push, update the secret file.
  Rotating one entry is enough to kill that key *and every session it issued* —
  sessions carry their `keyVersion`. wave1-tester-01 and -02 were rotated to
  keyVersion 3 on 2026-08-28 after their v2 keys reached a transcript.

## The preview

- Stable address: `https://era-clash-basketball-git-wave1-era-clash.vercel.app`
  — bound to the `wave1` branch; pushing that branch redeploys the same URL.
- Disable Candidate 3 (emergency-off): `config/previewEnv.js` →
  `previewSimEngine: false`, push both branches. Users still get games —
  production engine 3.2.0 answers. Re-enable by flipping back.
- Stop the wave entirely: disable all five tester entries (one commit) — the
  gate then admits only the owner key. Restart by re-enabling them.

## Reading results

```bash
npm run preview:wave1-feedback-report     # ratings, categories, negative results
npm run preview:wave1-product-metrics     # sessions, games, fallback, latency
npm run preview:wave1-access-audit        # active/revoked testers, failed attempts, key-leak scan
```

The reports read the preview KV store: export `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) from the Vercel dashboard into
your shell first. Without them the commands run in explicit EMPTY-DATA mode.

## Verifying production isolation

`curl -s https://era-clash-basketball.vercel.app/api/health` → build 2.7.2,
no `preview` block, no gate. Production deploys only from `main`, which none
of this touches.
