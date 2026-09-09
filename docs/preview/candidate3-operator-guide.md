# Candidate 3 protected preview — operator guide

## What is deployed where

| Surface | Engine | How |
|---|---|---|
| Production (main) | 3.2.0 (`computeResultV3`) | untouched; carries none of the preview code |
| Preview (branch `phase-6c5-candidate3-protected-preview`) | Candidate 3 possession engine, Single Game only | Vercel Git integration — every push redeploys |

Every preview result: `pv_` id, stored under `preview-result:*`, carries
`candidate` identity (Candidate 3, calibration 1.3.0, core `6a423d4f…`).
Any preview failure falls back to production 3.2.0 **for that request**
(`fallback_invoked` in telemetry). Unsupported modes always run production.

## Flag control

`config/previewEnv.js` → `previewSimEngine` (consulted only when
`VERCEL_ENV === "preview"`). An explicit `PREVIEW_SIM_ENGINE_ENABLED` env var
(Vercel dashboard, Preview scope) **always wins**, in both directions.

**Emergency off (no dashboard):** set `previewSimEngine: false`, commit, push.
New requests run production 3.2.0; stored `pv_` results stay readable.
**Emergency off (with dashboard):** set `PREVIEW_SIM_ENGINE_ENABLED=false` in
the Preview environment and redeploy. Same effect, no commit.
Drill rehearsed and recorded in `data/validation/6c5/candidate3-preview-fallback-drill.json`.

## Access control

Edge middleware (preview deployments only) requires a key: cookie `pv_access`
(set by the gate page) or header `x-preview-key` (tooling). Allowlist:
`config/previewAccess.js` — **sha256 hashes only, never keys, never emails**.

- **Add a tester:** `node scripts/preview/accessKey.mjs new <label>` → send the
  printed key out of band, commit the printed hash line, push.
- **Revoke:** delete the line, commit, push. (A revoked key fails on the next
  request — cookies carry the key, not a session.)
- Sign-out / forced re-auth: `DELETE /api/preview-access`.

## Telemetry & feedback

- Telemetry: single-line JSON on function stdout (`scope: "preview"`),
  allowlisted event names, secret/PII keys stripped structurally
  (`api/_lib/previewTelemetry.js`). Read via the Vercel dashboard log view.
- Structured feedback: `POST /api/feedback` with `kind: "preview"` → KV
  `preview-feedback:log` (list) + `preview-feedback:categories` counters.
  Inspect with any KV client: `LRANGE preview-feedback:log 0 50`.

## Verification commands (local)

`npm run preview:preflight | preview:smoke | preview:soak | preview:security | preview:browser-qa`
Deployed: `PREVIEW_ACCESS_KEY=… node scripts/c5/deployedQa.mjs <smoke|security|soak|fallback> <previewUrl>`

## What must never happen

- No merge of this branch to `main` without a formal validation phase.
- No `PREVIEW_SIM_ENGINE_ENABLED=true` in the Production environment.
- Candidate 3 remains `FORMAL_VALIDATION_INCOMPLETE` — the preview is product
  QA and user-feel testing, **not** engine validation.
