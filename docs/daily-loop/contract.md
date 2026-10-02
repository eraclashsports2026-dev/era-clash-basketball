# New York Loop Daily contract

Version: 1.0.0 · Route: `/clash/daily` · Tag: `DAILY`.

This is a new adapter, separate from the existing UTC Daily. The day is defined by `America/New_York`, including 23-hour and 25-hour daylight-saving days. The server generates the same existing Chaos draft for every identity during that day. Three synchronized player-and-coach rolls, canonical burn/hold rules, coach selection, and era reveal use the current Chaos state machine. The client cannot submit arbitrary player ids, era, future draft choices, or a winner.

`daily-start` returns an owner-bound signed token and the existing public view. `daily-roll` submits player and coach holds together; at the final coach board it submits only an offered coach id. `daily-play` reserves and records the server-owned completed attempt. Guests can play without an account. Local storage contains only an opaque resume hint and is not the attempt enforcement. Account streaks are displayed only from authoritative account data. Guest cookies can be reset, so the contract is one attempt per server identity, not an unverifiable claim of one attempt per human.

The compact grid contains three completed draft-roll squares followed by the result color, with a visible legend. It includes the published result-card URL when copied. Win percentages are shown only with at least twenty completed attempts. Scores, saved history, streaks, and leaderboard data are never invented when the provider/store is unavailable.

The existing possession engine and calibration are unchanged. Tests cover the New York midnight, spring/fall DST, leap-year transition, same-day configuration equality, and next-day rotation. Server ownership, second-attempt denial, authenticated resume, crawler cards, and three-run browser evidence are separate release requirements recorded by the parent ledger.
