# Account data export

From **Account → Export my data**, a signed-in player downloads everything in
their account as one JSON file, assembled entirely from their own RLS-scoped
reads. No new serverless function was added; the export is built in the browser
by `assembleAccountExport()`.

## Contents

`buildAccountExport()` produces:

- `profile` — display name and timestamps
- `preferences` — the cleaned, closed-vocabulary settings
- `savedClashes` — every saved Clash
- `savedRosters` — every saved roster
- `favorites` — the ids of favorited Clashes and rosters

Filename: `eraclash-account-export-YYYY-MM-DD.json`, using the reader's local
date. Every timestamp **inside** the file stays UTC.

## What is never exported

A deep exclusion list (`EXPORT_EXCLUDED_KEYS`) strips, at every depth:
credentials and tokens (`session`, `access_token`, `refresh_token`, `token`,
`token_hash`), the device-session hash, internal deployment identifiers
(`build_stamp`, `theme_version`, `candidate_core_hash`, `challenge_fingerprint`,
`narrativeKeyId`) and the email address. A contract test asserts none of these
survives. A CSV of the Clash history is also offered for convenience.
