# Chaos Clash — the guided flow's state machine (Phase 9B.3)

One route, `/play/chaos`. One board. Six presentations of it. The arena never
navigates between pages: it resolves ONE of six presentation states from the
authoritative run the server already publishes, and every surface — the stage,
the primary action, the contextual rail, the utility bar — reads that state.

The resolver is `src/components/arena/guidedState.js` (`GUIDED_FLOW_VERSION`
`chaos-guided-flow-v2`). It is pure: a run view in, a state out. It lives with
the arena because `src/chaos` is frozen gameplay code and stays byte-identical.

## The six states, in the order a player meets them

| # | State | Derived from | The one decision |
| --- | --- | --- | --- |
| 1 | `EMPTY` | no run, or `run.status === "ABANDONED"` | **ROLL** (roll 1 of 3) |
| 2 | `DRAFTING` | `ROLL_1_REVEALED`; `ROLL_2_REVEALED` once the era has been acknowledged | **ROLL 2** / **FINAL ROLL** — after holding whoever stays |
| 3 | `ERA_REVEAL` | `ROLL_2_REVEALED` with `eraState.revealed` and no acknowledgement for this run id | **ADAPT TO ERA** |
| 4 | `COACH_SELECT` | `coachDraft.selecting`; also the legacy sequence-1 phases (`ROSTERS_LOCKED`, `COACH_ROLL_n`, `COACH_SELECTION`) so an old run is never stranded | **CONTINUE WITH COACH** (enabled once an offer is picked) |
| 5 | `READY` | `run.phase === "READY"` | **RUN CLASH** |
| 6 | `RESULT` | shell phase `simulating`; shell phase `complete` with a result; or `run.phase === "SIMULATED"` | none — the result is the hero; RUN IT BACK / NEW CLASH live in the result |

Precedence, top to bottom, exactly as the code reads: a simulating or complete
game is `RESULT` whatever the run says → no run is `EMPTY` → `READY` →
`SIMULATED` → coach selection → the unacknowledged era reveal → drafting.

## What the server knows and what the browser adds

The server contract is unchanged: `src/chaos/client.js` still exposes
`start / view / holds / decide / era / coachHolds / coach / abandon / challenge /
simulate`, and `publicView` still carries `phase`, `roll`, `eraState`,
`eraContext`, `coachDraft`, `draftPressure`, `selectedCoaches` (at READY and
SIMULATED) and the CPU coach commitment hash. The guided flow reads those
fields; it does not add, rename or reinterpret any of them.

Two browser-side facts ride alongside. The last finished Clash is written to
`localStorage` (`ec_prior_result`) the moment its result exists, so a reload
after a game keeps it reachable as LAST CLASH instead of losing it; it is only
ever shown under that label and is never the draft on screen. And the one fact
the resolver itself needs is whether THIS run's era reveal has been seen. It is stored in `localStorage` under `ec_chaos_era_ack` keyed by
run id (`acknowledgeEra`, `eraAcknowledged`, `clearEraAck`). A new run reveals
its era again; the acknowledgement never leaks across runs; a browser that
refuses storage simply shows the reveal once more, which is harmless.

## Resume matrix (specification §23)

Every state except the result is recoverable by a refresh and by the lobby's
Continue card, on the same run id — no round-trip spends a roll or a hire.

| Left at | Refresh returns | Lobby returns |
| --- | --- | --- |
| `EMPTY` | `EMPTY` | START CHAOS CLASH → `EMPTY` (no Continue: nothing to continue) |
| `DRAFTING` (roll 1, holds set) | `DRAFTING`, holds intact | Continue → `DRAFTING` |
| `ERA_REVEAL` (not yet adapted) | `ERA_REVEAL` | Continue → `ERA_REVEAL` |
| `DRAFTING` (roll 2, adapted) | `DRAFTING` — the reveal does not repeat | Continue → `DRAFTING` |
| `COACH_SELECT` (final roster locked, offers dealt) | `COACH_SELECT`, the same three offers | Continue → `COACH_SELECT` |
| `COACH_SELECT` (an offer picked, CONTINUE not pressed) | `COACH_SELECT`, the same three offers, the pick to be made again — a pick is a hire only on CONTINUE WITH COACH, so nothing is spent | Continue → `COACH_SELECT` |
| `READY` | `READY` with both staffs | Continue → `READY` |
| `RESULT` | the empty frame, with the finished game one tap away as LAST CLASH (its score and report); the lobby offers no Continue because the run is finished; a signed-in account also has it in My EraClash | START CHAOS CLASH → `EMPTY` |

Every row is a real run driven by `chaos:state-machine-qa`; the run id is read
before and after each round-trip and never changes.

`chaos:state-machine-qa` drives this matrix on a real run and records it in
`data/validation/9b3/active-run-resume-qa.json`.

## The primary action, per state

`primaryAction(state, { run, spinning, picked })` returns exactly one action or
`null`. Labels are the product's words and a repository gate reads them:
`ROLL` (sub `ROLL 1 OF 3`), `ROLL 2`, `FINAL ROLL`, `ADAPT TO ERA` (sub
`FINAL ROLL NEXT`), `CONTINUE WITH COACH`, `RUN CLASH` (sub `LET HISTORY
DECIDE`). A busy action says `DEALING…` or `RUNNING…` and never changes which
action it is. Nothing predicts a winner.

## Telemetry

Eleven events, a closed vocabulary mirrored in `api/events.js` and
`src/activation.js` (allowlist 113): `chaos_state_viewed` and
`chaos_primary_action` on every state; entry events `era_reveal_viewed`,
`coach_chaos_viewed`, `clash_ready_viewed`, `result_state_viewed`; and
`era_reveal_continued`, `coach_offer_selected`, `run_clash_started`,
`live_intel_expanded`, `era_rules_expanded`. State-viewed fires once per
TRANSITION, never per render.

## Announcements

A single polite live region announces each state from real values: the roll
and what to do, a hold or release with the player's name and how many Gold
positions remain, the era with its real rule facts, the coach chosen and their
role, and the final score with the winner. Focus moves to the primary action
on every state change except the era reveal and the result, where the content
itself is what changed.
