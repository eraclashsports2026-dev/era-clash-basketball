# My EraClash V1

`/my-eraclash`. Requires a real account. Rendered in the accepted Night Court
Editorial system.

Everything on the page is real. Where there is nothing, the page says so.

## Header card

- avatar initials from the display name
- the display name, editable in place (1–24 characters, cleaned of markup and
  invisible characters, capped in the client, in the API and in the database)
- "Free account", and the member-since date when the profile has one

The email address is **not** shown here. It authenticates; it is not an
identity.

## Career summary

Four figures, all derived in the database from saved clashes:

| Figure | Source |
| --- | --- |
| Games played | `career_summary.games_played` |
| Record | wins, losses and ties |
| Win rate | `wins / games_played`, rendered as a percentage |
| Current streak | `career_streak`, the leading run of identical outcomes |

With no saved Clashes the page states that plainly and explains that finishing a
Chaos Clash saves one automatically. It does not show a zero dressed up as a
rank.

There is no rank, no contender grade, no percentile and no leaderboard position.

## Mode breakdown

Only modes with real records appear, from `career_by_mode`. A mode with no
completed games is absent rather than shown as zero.

## Recent Clashes

Collapsed row: date, mode, outcome, score, era. Expanded (a real
`aria-expanded` / `aria-controls` disclosure, keyboard operable):

- your five, with positions
- the opponent five, or "Legend Rival"
- both coaches
- the era
- the MVP
- which candidate and calibration simulated it

Actions appear only when the product genuinely supports them:

| Action | Shown when |
| --- | --- |
| VIEW FULL REPORT | always — the snapshot is stored |
| RUN IT BACK | a handler is supplied |
| CHALLENGE THIS CHAOS | the clash has a challenge fingerprint |

## Full saved report

Opens from the stored `result_snapshot` — the Final, Box Score, Game Story,
Coaching & Strategy and Analysis the original game produced. It is **not**
recomputed by a newer candidate, and the overlay names the candidate and
calibration that produced it without burying the reader in metadata.

## Cross-device behaviour

The provider session is the source of truth. localStorage caches nothing
authoritative about the account, so:

- sign in on a second device and the same Clashes are there
- open the same full report on either
- change the display name on one and it is the new name on the other after a
  refresh
- sign out and the private history disappears from that device while remaining
  in the cloud

## Accessibility

- labelled `main` landmark with an `h1`
- every control at least 44px, on desktop and on a phone
- real disclosure semantics on each Clash row
- a polite live region for save, import and rename outcomes
- the display-name field has a real label and its error is associated with it
- no email is announced anywhere outside private account settings
- no page-level horizontal overflow at any tested width

Measured by `npm run account:my-eraclash-qa` and
`npm run account:responsive-qa` at 1536×1024, 1440×900, 1280×800, 1024×768,
768×1024, 430×932, 390×844 and 375×812.

## Known limitation

Self-service account deletion and export do not exist yet. The page says so.
An operator can remove an account and everything in it.
