# Current coach audit

**25 coaches** (`src/v3/coaches.js` → `COACHES`), with career-phase research in
`src/v3/data/coachPhases.js` (872 lines) and profiles in
`src/v3/data/coaches.js` (2,347 lines).

## What a coach actually does today

`src/v3/gameplan.js` turns a coach into a game plan that the possession loop
consumes. Verified consumers:

| Coach field | Consumed in | Effect |
| --- | --- | --- |
| `adaptability` | `gameplan.js:5,10,98,99`; `possession.js:141` | halftime / Q3 adjustments |
| `roleDiscipline` | `gameplan.js:63` | how tightly roles are enforced |
| tempo / scheme / concentration | `gameplan.js` → `roles.allocateUsage`, `defense.js` | usage hierarchy, pace, defensive scheme |

**There is no coach OVR and no flat coach bonus**, which is a deliberate
constitutional rule and is upheld in code.

## Dormant fields — researched, wired to nothing

`grep` across `gameplan.js`, `possession.js`, and `defense.js` returns **zero
consumers** for:

`pnr` · `insideOut` · `starEmpowerment` · `tacticalAdjustment` · `man`

They are defined on the coach shape (`src/v3/coaches.js:28,30`) and populated by
research, but no engine module reads them. `pnr` in particular implies a
pick-and-roll possession action that the loop does not currently model.

**This is a CEO decision, not a bug:** either fund the possession actions that
would consume these fields, or mark them research-only so the data stops
implying capability the engine does not have.

## Not in scope for Phase 3

Coach Intelligence is Phase 4. Team Intelligence is explicitly
**coach-independent** so that the coach layer can be applied on top of it later
rather than being tangled into it.
