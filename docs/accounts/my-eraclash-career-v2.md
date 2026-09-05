# My EraClash — Career V2

`/my-eraclash`. Requires a real account. Rendered in the Night Court Editorial
reading surface. Everything on it is real; where there is nothing, it says so.

Five tabs, selectable and deep-linkable with `?tab=`:

| Tab | What it answers |
| --- | --- |
| Overview | Who am I, how much have I played, how have I done, what's next |
| Clash History | Every saved game, filterable and sortable |
| Saved Rosters | Fives I chose to keep |
| Favorites | Clashes and rosters I starred |
| Account | My private settings, my data, and account controls |

## Overview

- **Identity**: avatar initials, display name (editable, 1–24 cleaned characters),
  "Free account", joined date. The email is never shown; it authenticates.
- **Career**: games played, record, win rate, current streak and longest win
  streak — all derived in the database from saved Clashes. No rank, percentile,
  contender grade or leaderboard position exists, so none is shown.
- **By mode**: only modes with real records. A Chaos Clash is distinguished from
  a hand-built Dream Matchup (see the note below).
- **Recent activity**: the five most recent account activities (a Clash saved, a
  roster saved or renamed, a favorite added, a display name changed), derived
  from existing data. Security events are deliberately excluded.

## Clash History

Filters (mode, outcome, era, range) and sort (newest, oldest, biggest margin,
closest game) are applied in the client over the account's own rows. Only eras
that actually occur are offered. History is paginated at 25.

Each row expands to show both fives, coaches, era, MVP and which engine
simulated it, and offers **View full report** (reopens from the stored
snapshot), **Run It Back**, **Save roster**, and a **favorite** star.

## Chaos vs Dream Matchup

A chaos run reaches the server as `mode: "single"` so its draft stays
unspoofable. The career needs to tell the two apart, so a saved Clash is stored
under `mode: "chaos"` when its record carries a revealed chaos draft. This is an
account-data derivation set at save time; no gameplay, draft or placement path
changed.

## Where the writes go

Rosters, favorites and preferences are written by the browser directly against
Postgres under row-level security — the account can only ever touch its own
rows, and the only column it may change on a saved Clash is `favorite`. Account
deletion is the one action that needs the server. Nothing on this page can
influence a simulation.
