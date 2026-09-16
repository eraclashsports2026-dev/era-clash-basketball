# Shareable Clash Cards + Rivalries V1

One coherent experience over the unchanged game: complete a Clash → share something worth opening → complete a governed Challenge → start a mutual Rivalry → challenge each other again.

Nothing here changes the simulation, the draft/Hold/placement, the Era/Coach/Legend Rival logic, the Challenge fairness and comparison contract (1.0.0), the rating contract (1.0.0), the progression contract, the visibility defaults or the accepted mobile/desktop design. Expected protected-contract drift: 0. API function count: unchanged (12 + middleware) — every new action rides `/api/profile` like Challenges, progression, rating and profiles do.

## Feature flag

`CLASH_SOCIAL_V1_ENABLED` (server). Default: on for Vercel **Preview** deployments, **off in Production** until acceptance. Read through `/api/v3meta` `modes.clashSocial`; the client hides every new surface when it is false and the route answers `FEATURE_DISABLED` for every new action. Off leaves ordinary Challenges exactly as they are. Rate limit: `RL_SOCIAL_PER_MIN_IP` (default 60).

## Clash Cards (contract `src/cards/contract.js`, version 1.0.0)

- One renderer (`src/cards/render.js`, Canvas 2D, 1080×1350 PNG, `fillText` only, same-origin logo) for two uses chosen explicitly in the composer:
  - **RESULT CARD** — `MY CLASH` (or `GUEST CLASH`), the score line, WIN/LOSS/TIE, `±N RESULT MARGIN` (or `EVEN · TIE`), the era. Never the five, coach, MVP, rating, rank, XP, achievements, email or ids. Detailed roster recaps are deferred (cannot be made spoiler-safe under the current Challenge disclosure contract).
  - **CHALLENGE INVITATION** — `YOUR TURN.` / `SAME OPPORTUNITY. BEAT MY RESULT.`, the creator's score line and era, the code and this origin's link. Exactly the public invitation contract (`PUBLIC_INVITATION_FIELDS`) — nothing a recipient cannot already see before playing.
- **Data authority**: the browser asks for a card (`card-result` with a run this device session owns; `card-invitation` with a code the caller created) and the server builds an allowlisted payload from the authoritative result record / public invitation view. No client-submitted score, outcome, era, name or opponent reaches a card. Forged body values are ignored (gate: `card-authority-qa`, `social-harness-qa`).
- **Consent**: preview before export; neutral attribution by default; "Include my display name on this export" is an explicit per-export choice; guests never have a name to add. Sharing a card changes no visibility preference.
- **Share behaviour**: `navigator.canShare({files})` → native sheet (user gesture preserved); otherwise SAVE IMAGE (download). COPY CHALLENGE LINK is separate. The UI never says "sent". A canvas PNG carries no text metadata; the filename never carries the code. Opening/rerendering/cancelling the composer mints nothing — the Challenge is the existing idempotent `challenge-create`.
- **Honesty**: "A saved image cannot be recalled once shared outside EraClash. Withdrawing a Challenge disables its link, not the picture. Official results stay on the server."

## Rivalries (contract `src/rivalries/contract.js`, `rivalryContractVersion = "1.0.0"`)

A Rivalry is a **private, mutually accepted** relationship between two authenticated accounts who agreed to track their Challenge comparisons. Not a public connection, not a follower, not a roster-vs-roster game, not a second rating.

- **Start**: `START A RIVALRY` on a completed account-vs-account comparison (My EraClash → Challenges). The server resolves the opponent from the attempt the caller took part in (`rivalry_request`). No account id, email, search or directory.
- **Consent**: recipient sees the request in Challenges → Rivalries: ACCEPT · DECLINE · BLOCK REQUESTS. Sender may CANCEL REQUEST. Crossed requests → `pending_incoming` (no duplicate, no auto-accept). One row per unordered pair (`user_low < user_high`, unique), all writes under `pg_advisory_xact_lock('rivalry:lo:hi')`.
- **Bounded requests**: 7-day expiry (retries never refresh it), 10 new requests per account per 24 h, 5 outstanding outgoing, 7-day cooldown after a decline, 1-day cooldown after a cancel or an ended Rivalry; a block in either direction reads as the same generic `unavailable` as a deleted opponent (no leak).
- **Which results count** (`rivalry_record_attempt`): both participants are the pair's accounts; the attempt is `completed` with a `challenge_outcome`; the attempt **started** (`challenge_attempts.created_at`, server time) inside the period `[started_at, ended_at)`; not already recorded (unique on attempt id). Creator win → creator's win; recipient win → recipient's win; tie → one tie each. Stored once as the low side's outcome, so A's wins always equal B's losses. Unrated (repeat-opponent-limit) comparisons count and show `unrated`; `rated` is read from the rating ledger, never computed. Not counted: guests, self, incomplete/expired attempts, plain Chaos, Run It Back, pre-acceptance comparisons, QA fixtures (fake-cloud only).
- **Awards**: none. No XP, Elo, bonus or achievement path exists in the rivalry code (tests pin it).
- **Periods**: mutual acceptance opens period N; END (either member) closes it — the record stays, open Challenges are not cancelled, rating/XP untouched; an attempt already started before closure still settles into that period. Reactivation needs fresh mutual consent and opens period N+1; the UI labels `SINCE THIS RIVALRY BEGAN` and `PERIOD n · date – date`, never "all time". Streak = consecutive wins from the newest event; a tie or loss ends it.
- **Order**: `completed_at desc, id desc` (events), `completed_at asc, id asc` (reconcile). Detail pages are paged (≤ 50).
- **Repair**: `rivalry_reconcile` enrols pending eligible attempts oldest first; called on list/detail reads; idempotent; never touches profiles, rating or XP.
- **Challenge Again**: a shortcut into the existing flow — the Rivalry row remembers a session context (`ec_rivalry_ctx`: opaque rivalry id + opponent's display name) so the result surface labels the share step "FOR YOUR RIVALRY WITH …". The Challenge link is the ordinary governed link; the server enrols from the two accounts, never from the note. A third account opening a forwarded link keeps the existing Challenge behaviour and never reads, joins or affects the Rivalry.

## Privacy, deletion, export

- Visible only to the two members (`rivalry_list` / `rivalry_detail` are member-only projections; RLS lets a member SELECT own pair/periods/events; blocks and the request log are server-only; no client write). Anonymous: nothing. Account C: nothing, including guessed ids (`not_yours`).
- Opponent identity: the **current** display name (no new snapshot) or `Deleted account`; the public-profile slug only while that profile is public right now. No rating, rank, XP, email or id.
- Deletion: the auth.users delete trigger marks the member, closes open periods (`account_deleted`), invalidates pending requests; blocks cascade; the survivor keeps private history as `Deleted account`. The pair row retains the deleted member's uuid (an identifier of a deleted auth user, like the rating ledger's ids) — documented in the privacy inventory.
- Export: the account export gains `rivalries` (own relationship/consent records, opponent's name only).

## Production promotion (not performed by this build)

1. Owner decision `APPROVE CLASH CARDS + RIVALRIES V1 — RELEASE TO PRODUCTION`.
2. Merge the feature PR into `main` (Vercel Git integration deploys).
3. Apply `supabase/migrations/0008_rivalries_v1.sql` to Production `dxdtnhdeaanhfoqngdel` (additive; safe with the live app before or after the deploy — the flag is off, the tables idle).
4. Verify on Production: `/api/health` ok; `/api/v3meta` modes `clashSocial: false`; ordinary Challenge create/accept/complete unchanged.
5. Set `CLASH_SOCIAL_V1_ENABLED=true` in Vercel → Production; redeploy.
6. Smoke: `modes.clashSocial: true`; a guest result card exports; two owner-controlled accounts complete a Challenge, START A RIVALRY, ACCEPT, CHALLENGE AGAIN, one event recorded once; C reads nothing.
7. Rollback: set the flag `false` and redeploy (every new action → `FEATURE_DISABLED`, every surface hidden). Do **not** drop the tables; existing Rivalry rows stay idle and resume when re-enabled. No data reset.

## Gates

`node scripts/social/socialQa.mjs contract | rls | lifecycle | cards | harness | fixture` → `data/validation/social-v1/*.json`; `npx vitest run tests/social-v1.test.js`. The SQL functions and RLS were exercised on the Preview database (`rivalry-rls-live.json`).
