# Privacy data inventory — addendum: Shareable Clash Cards + Rivalries V1

NONPUBLIC DRAFT for the owner's review. Extends `docs/legal/privacy-data-inventory.md` (draft PR #61). Nothing here is published or promised until the owner approves the Privacy Notice text; the feature itself ships disabled in Production.

## New data (Supabase Postgres, `0008_rivalries_v1`)

| Table | What it holds | Who can read it | Retention |
|---|---|---|---|
| `rivalries` | one row per pair of accounts that ever exchanged a Rivalry request: the two account ids, state (idle/pending/active), who asked and when, expiry, why/when it last closed, deletion marks | the two members (server projection; RLS select-own) | while either account exists; on deletion the row is kept for the surviving member, the deleted member marked (see below) |
| `rivalry_periods` | each mutually accepted period: start, end, who ended it, reason | the two members | as above |
| `rivalry_events` | one immutable row per official Challenge attempt that counted: which attempt, outcome for the pair, rated flag, timestamps | the two members | as above (cascades if the pair row is removed) |
| `rivalry_blocks` | "no further Rivalry requests from this account": blocker id, blocked id, time | server only (no client read) | until unblocked; removed when either account is deleted |
| `rivalry_request_log` | every request sent (from, to, time) — used only for the 10/day and outstanding-request limits | server only | while the pair row exists |

No new personal fields: no email, name snapshot, location, device or IP is stored by this feature. Opponent names shown in the UI are read live from the existing private profile (current display name) or shown as "Deleted account".

## Visibility

- Rivalry data is visible only to its two participants. There is no public Rivalry page, directory, search or leaderboard. A third account, a guest and an anonymous visitor get nothing (verified with role-switched reads on the Preview database).
- An opponent's public-profile link appears only while that opponent's profile is public; being rivals grants no access to a private profile and changes no visibility preference.

## Share cards (client-side export)

- A card is a PNG drawn in the browser from a server-built payload: the score line, outcome, result margin, era, an optional display name the user explicitly chooses to include for that export, and (invitation) the Challenge code and link. No rating, rank, XP, achievements, roster, coach, MVP, email, account id, seed or device data. The PNG carries no text metadata; the filename carries no code.
- Once a user shares or saves an image, EraClash cannot recall it. The UI says so. Withdrawing a Challenge disables the link, not the picture.

## Deletion

Deleting an account: pending Rivalry requests are invalidated, active periods close (`account_deleted`), blocks involving the account are removed, and the surviving member keeps a private record labelled "Deleted account". The pair row retains the deleted account's opaque auth uuid (the same class of pseudonymous identifier the rating ledger already retains), so the survivor's W–L–T history stays consistent. The deleted account's display name is not retained by this feature.

## Export

The account export includes the user's own Rivalry rows (state, dates, record, the opponent's current display name or "Deleted account") — never the opponent's account id, email or private data.

## Proposed Privacy Notice wording (for owner review; not published)

> **Rivalries.** If you and another player both agree, EraClash keeps a private record of your Challenge comparisons with that player. Only the two of you can see it. Either of you can end it at any time; ending keeps the record as history. You can block further Rivalry requests from an account. If an account is deleted, the other player's record shows "Deleted account".
>
> **Share cards.** You can export an image of a Clash result or a Challenge invitation. The image shows the score line, the outcome, the era and, only if you choose, your display name. Once you share or save an image we cannot recall it.
