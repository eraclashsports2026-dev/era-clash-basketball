# Challenge contract V1 (Phase 9C)

> "I built this team under these conditions. You get the same opportunity. Beat my result."

A **challenge** freezes the starting opportunity of a finished Chaos Clash and
lets another player make their own decisions under the same rules. It is not a
replay: two players who hold the same cards walk the same deterministic path;
two who decide differently branch, and every branch is itself reproducible
(`src/chaos/challenge.js`, unchanged since 8B). Exact Replay is a different
product and is not offered — the API does not accept a chosen historical seed
(9B.2 finding). Run It Back keeps its 9B.2 meaning: same setup, new seed.

Versions: `CHALLENGE_VERSION 1.0.0`, `COMPARISON_VERSION 1.0.0`, mode `chaos`.
The pure contract is `src/challenges/contract.js`; the server is
`api/_lib/challenges.js`; the schema is `supabase/migrations/0004_challenges.sql`.

## What a challenge binds

| Field | Source | Why |
| --- | --- | --- |
| `public_code` | server randomness, `EC-XXXX-XXXX` from a 32-symbol alphabet (no 0/O/1/I), case-insensitive | the only thing a link carries |
| `creator_user_id`, `creator_display_snapshot` | verified bearer token, private profile at creation | identity; later renames never rewrite ownership |
| `creator_result_id`, `creator_saved_clash_id` | the authoritative result the creator's own device session produced, and its career row | the result being challenged |
| `chaos_manifest_id`, `chaos_sequence_version` | the same-seed manifest the creator's run mints (a one-way hash of the seed) | the recipient's run is created from it; the seed itself lives only in `challenge_secrets` |
| `draft_model_version`, `player_pool_version`, `candidate_id`, `calibration_version`, `parameter_hash`, `era_contract_version`, `cpu_policy_version` | `DRAFT_VERSIONS`, the result's candidate identity | the frozen environment |
| `challenge_fingerprint` | sha256 over the ordered `FINGERPRINT_FIELDS` | one hash that changes if any binding changes |
| `creator_outcome`, `creator_gold_score`, `creator_blue_score`, `creator_performance`, `creator_era_id`, `era_custom`, `creator_roster`, `creator_coach`, `creator_mvp` | the authoritative result | the original result, compared later |
| `status`, `created_at`, `expires_at`, `revoked_at` | policy | 30 days, revocable, derived status |

The recipient receives the **same governed starting opportunity**: the same
Roll 1 five on both sides, the same rules, the same era (a chosen custom era
travels pinned; a rolled era is re-derived from the seed), the same coach
offers for the same final five, the same Legend Rival policy. Their own holds
create deterministic branches. Nothing gives the creator's final five to the
recipient; nothing changes odds for either side; membership, account age and
creator status never reach the draft (no odds function takes a tier).

## Who may do what

- **Create** — the signed-in creator, from the Chaos Clash they just finished
  (the run must be theirs, simulated, and its result saved to their account).
  One challenge per result; a second press returns the first.
- **Open** — anyone with the link. The invitation shows the creator's display
  name, the mode, the headline score and outcome, the era, the status and the
  expiry — never the creator's five, coach, MVP or hold path before the
  recipient has played, because that would tilt the same opportunity.
- **Accept** — a signed-in recipient gets **one official attempt per account**,
  decided by a unique index. A guest may play under the ordinary guest run
  budget (one attempt per device); the invitation says a run will be spent
  before they start, and offers CREATE FREE ACCOUNT / SIGN IN to keep the
  response. The creator cannot accept their own challenge.
- **Complete** — after the recipient's run is simulated, the server binds the
  stored result to the attempt and compares. The client sends the run id only.
- **Revoke** — the creator, while attempts remain possible. Completed attempts
  stay in private history; the contract row is immutable.
- **List** — the creator sees CREATED with every response; the recipient sees
  ACCEPTED and COMPLETED; both through the server, scoped to the verified user.

## Lifetime

`CHALLENGE_TTL_DAYS = 30` in one place. Status is derived from timestamps —
`open`, `expired`, `revoked` — never flipped by a job. Unknown codes,
malformed codes and challenges whose creator no longer exists read as one
generic `unavailable`.

## Telemetry

Ten closed events (`CHALLENGE_EVENTS`), metadata limited to
`challengeVersion, authState, entryPoint, status, mode, success, failureCode`.
No name, email, code, id, payload, seed, token or cookie is ever a property.
