# Challenge security (Phase 9C)

## Authority

- **Identity** — the verified bearer token (`verifyAccountToken`) for a
  signed-in user; the HttpOnly device-session cookie for a guest. The request
  body never names a user.
- **Results** — read from the authoritative result record and the run that
  produced it. Creating a challenge requires the run to belong to the caller's
  device session, to be simulated, and to name the result. Completing an
  attempt reads the score the server stored at simulation; a client cannot
  post a score.
- **Runs** — a recipient's run is created server-side from the challenge's
  manifest through the existing `createRun`; the attempt id is written on the
  run in the run store, which the public run view never exposes.
- **Seeds** — the seed reaches Postgres only in `challenge_secrets`, a table
  with RLS enabled, no policies and every privilege revoked from `anon` and
  `authenticated`. It never reaches the browser; the link carries the public
  code and nothing else (`FORBIDDEN_LINK_FIELDS` is asserted by a test).

## Row-level security

| Table | anon | authenticated | writes |
| --- | --- | --- | --- |
| `challenges` | none | select own (`creator_user_id = auth.uid()`) | service role only |
| `challenge_attempts` | none | select own (`user_id = auth.uid()`) and attempts on own challenges | service role only |
| `challenge_secrets` | none | none | service role only |

Everything the product shows comes through the server actions, scoped to the
verified user. The direct policies exist so a browser client can never read
more than its own rows even if it tries.

## Enumeration

Codes are 8 symbols from a 32-symbol alphabet (about 1.1 × 10¹²), random, not
sequential and unrelated to any id. Lookups are rate-limited per IP. Unknown,
malformed and deleted-creator codes all answer with one generic
`unavailable`; a real code answers `open`, `expired` or `revoked`. No response
says whether a person exists.

## Fairness

- same starting opportunity: the run is created from the same manifest under
  the sequence it was minted in;
- same draft model, candidate, era contract, CPU policy: frozen on the row and
  hashed into `challenge_fingerprint`;
- no odds function takes a tier, an account age or a creator flag;
- one official attempt per account is a unique index, so a second browser or a
  refresh cannot mint a second attempt; a refresh resumes the same run;
- a guest's attempt spends a guest run like any other Chaos run.

## Deletion and revocation

- Revoking sets `revoked_at`; the invitation reads `revoked`, no attempt may
  start, completed attempts remain in the participants' private history, the
  contract row stays for audit.
- A deleted creator: the challenge's `creator_user_id` becomes null, its
  display snapshot, roster, coach and MVP are cleared by a trigger, and the
  invitation reads `unavailable`. Recipients keep their completed attempt
  against "Deleted account".
- A deleted recipient: the attempt's `user_id` becomes null and its snapshot is
  cleared; the creator sees an anonymised response.

## Telemetry privacy

Only `challengeVersion, authState, entryPoint, status, mode, success,
failureCode` may travel with a challenge event. Names, codes, ids, payloads,
seeds, tokens and cookies are excluded by the contract and pinned by a test.
