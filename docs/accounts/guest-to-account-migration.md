# Guest to account migration

A guest plays Chaos Clash without an account and gets a real result. The account
exists so that result — and the ones before it — do not disappear.

```text
Guest opens the Play Lobby
        ↓
Guest plays Chaos Clash                      (no account, no prompt)
        ↓
Guest receives a real result
        ↓
SAVE THIS CLASH                              (in the flow, never over the result)
        ↓
Google, or an email one-time code
        ↓
the result on screen is claimed, once
        ↓
My EraClash, on every device they sign in on
```

## The ownership proof

The whole design rests on one fact: **the authoritative result record already
knows which browser produced it.** `api/game.js` writes `session` — the
server-minted `ec_session` cookie value — into every result record, and
`publicResult()` strips it before the record is ever sent to a client.

So a claim asks three questions, in this order:

1. Is this a real account? The bearer token is verified **with the provider**
   (`GET /auth/v1/user`). No local secret, no local JWT parsing, so a revoked or
   expired token fails here.
2. Does this result exist? Read `result:<id>` or `preview-result:pv_<id>`.
3. Did *this* browser produce it? `record.session === ec_session cookie`.

Only then is the claim written, and the claim is decided by the database:
`result_claims.result_id` is a primary key, so a second account attempting the
same result gets a conflict rather than a race.

## Current-result claim

The dialog opened from the postgame panel carries the result id. On success the
App claims it immediately. Statuses the interface understands:

| Status | Meaning | What the player sees |
| --- | --- | --- |
| `saved` | claimed and stored | SAVED TO MY ERACLASH |
| `already_saved` | this account already had it | SAVED TO MY ERACLASH |
| `already_claimed` | another account owns it | save failed, retry offered |
| `not_your_result` | a different browser produced it | save failed, retry offered |
| `not_found` | expired or never existed | save failed, retry offered |
| `not_configured` | accounts are switched off here | the honest disabled message |

A failure never re-runs the simulation and never loses the result: it stays on
screen and the panel offers TRY AGAIN.

## Device-history import

Offered **once**, and only when this browser remembers results that are not
already in the career.

`src/accounts/deviceResults.js` keeps a capped list of result ids this browser
produced (`ec_result_ids`, newest first, 25 max). That list is a **candidate
list, not evidence of ownership** — a ledger copied from another browser imports
nothing, because every id goes through the same three questions above.

The offer states a real count, obtained from `import-preview`, which writes
nothing. The import itself is idempotent per result, so a partial failure is
resumable: run it again and the already-saved ones report `already_saved` while
the rest are attempted.

Properties the tests pin:

- the current result is claimed once
- a repeated claim creates no duplicate
- a second account cannot claim the same result
- a result from another browser is refused
- an unknown result id is refused honestly
- an unverifiable token saves nothing
- a repeated import adds nothing
- signing out leaves no claimed history readable

## What is not imported

Local career totals (`ec_career`, `ec_recent`) are **not** copied into the
cloud. They are self-reported device history with no authoritative record behind
them, and treating them as career truth would let a browser invent a record.
Only results the server can still prove are claimable. A device with expired
results therefore imports fewer Clashes than its local history shows, which is
the honest outcome.

## The preview gate is a different layer

A preview access key admits a tester to a private deployment. It is **not** an
EraClash account, it never becomes one, and it never enters career data. The two
layers are tested together: a signed-in account still needs the preview session
to reach the deployment, and a preview key grants no access to anyone's career.
