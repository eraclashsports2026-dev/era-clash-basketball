# Daily Challenge — coaches and Era Style

Status: **DEVELOPMENT** — gated behind `DAILY_COACH_ERA_ENABLED`, default `false`.
Schema: `dailyConfigSchemaVersion` **1.0.0** (`affectsResult: false`).

The Daily used to be one decision: which five players do you keep? This adds a
second decision — which of three coaches do you hire — inside one shared,
server-fixed Era Style. The goal is a leaderboard that compares *decisions*.
Everything that is not the player's decision is therefore taken away from the
browser.

## What the server owns

| Thing | Owner | Why |
|---|---|---|
| The day's Era Style | server | one shared puzzle; a chosen era would be a chosen difficulty |
| The three coach options | server | a free coach pool makes the board a search problem, not a decision |
| Team Blue's staff | server (`neutral`) | the opponent must be identical for everyone |
| The daily seed | server, derived | see below |
| Every data version | server | a version change must not silently reinterpret a Daily in progress |
| **Which of the three coaches** | **the player** | this is the game |

The browser submits exactly one field: `coachGoldId`. It does not submit the
era, the seed, the date, or any version. `api/game.js` validates the id against
today's stored options and rejects anything else with `DAILY_INVALID_COACH`.

## The three options

`dailyCoachOptions` draws one coach from each of three strategic buckets —
`OFFENSIVE_SYSTEM`, `DEFENSIVE_STRUCTURE`, `ADAPTABLE_MANAGER` — so the choice
is between three *ideas*, not three grades of the same idea. Candidates are
sorted by id before selection, so reordering `coaches.js` cannot change a
Daily that players have already started.

### "Why these three differ"

`coachContrasts()` names, for each option, the tendency where that coach
separates most from **the other two options today**. It is a contrast, not a
grade:

- derived only from documented coach tendencies already in `coaches.js`
- one dimension per option, so the three lines describe three different aspects
  of basketball rather than three points on the same axis
- gaps below `CONTRAST_MIN_GAP` (2) produce no claim at all — the fallback is
  the coach's own documented system tag, because dressing up noise as a
  distinction is worse than saying less
- no number, no score, no ordering is exposed

A ranked list would make the choice cosmetic, so the UI states plainly: *"They
are not ranked — they play differently."*

## Seed derivation — one owner

`dailySimulationSeed({config, goldIds, coachId})` is FNV-1a over:

```
dailyId | gold=... | coach=... | era=... | pd=... | cd=... | ed=... | schema=...
```

Two players who make identical official decisions get the identical game. A
refresh cannot reroll it. A data-version change produces a *new* seed rather
than quietly changing results under the old one.

`computeResultV3` already contained its own date-based daily derivation, which
silently won over this one — two derivations of the same number, only one of
which included the versions. The engine now honors a caller-derived seed when
told `dailySeedPolicy: "caller-derived"`, and keeps its legacy derivation for
every caller that does not say so. Exactly one derivation is authoritative,
and a regression test asserts the stored seed equals `dailySimulationSeed`.

## Narrative reuse

Because identical decisions produce a byte-identical game, narrating that game
once per player would be one paid provider call per player for one piece of
text. A coach/era Daily result therefore carries a shared content identity:

```
narrativeKeyId = d.{dailyId}.s{seed >>> 0}
```

`api/narrative.js` binds its cache identity from **our own stored record**,
never from the request body — a client that could name the narrative key could
read or poison another game's recap. The narrative path holds no user identity
(no name, no session, no uid), so one text is correct for every player who
made the same choices. Other modes have no `narrativeKeyId` and keep per-result
keying unchanged.

Measured: two players, same coach → **1** provider call. Different coach →
**2**. Verified at the network boundary, not against a mock.

## UI

`src/components/DailyCoachEra.jsx`:

- the official era with its documented `styleSummary` (words, not coefficients)
- three coach cards: name, strategic bucket, "Differs: …", up to three system tags
- `RUN THE SIM` does not render until a coach is hired — while the player is
  choosing, nothing covers the options
- 44px minimum tap targets; no horizontal overflow at 375px
- the Postgame reports the coach and era the **server** said it ran

## Rejections

| Code | Cause | Attempt consumed? |
|---|---|---|
| `DAILY_INVALID_COACH` | coach not among today's three | no |
| `DAILY_INVALID_ERA` | client tried to name an era | no |
| `DAILY_VERSION_MISMATCH` | config moved mid-session | no — client drops its stale copy and re-drafts |
| `DAILY_ALREADY_COMPLETED` | one attempt per session per day | already was |

## Analytics

`daily_config_loaded`, `daily_era_viewed`, `daily_coach_options_viewed`,
`daily_coach_selected`, `daily_started`, `daily_completed`,
`daily_invalid_coach`, `daily_invalid_era`, `daily_version_mismatch`,
`daily_result_shared`.

All ten are in the `/api/events` allowlist — an event name missing from it is
dropped server-side, so instrumentation without a line there does nothing.
Tests assert both ends, plus that no daily event carries PII or any
rating/fit/projection field.

## Isolation

Playwright runs two harnesses: **4173 with every preview flag off** (the 13
existing journeys, which must keep passing unchanged) and **4174 with
`DAILY_COACH_ERA_ENABLED=true`** (the 6 new ones). That pair is the isolation
proof at the UI level. With the flag off, `/api/daily?config=1` returns the
historical `{date, seed}` shape exactly, the record's `narrativeKeyId` is
`null`, and the engine's legacy seed derivation runs untouched.

## Deferred

- Bench/rotation depth stays `RESEARCH_ONLY`; the Daily hires a coach, not a rotation.
- No coach OVR, no "best coach" hint, no projected win probability anywhere in the Daily surface.
