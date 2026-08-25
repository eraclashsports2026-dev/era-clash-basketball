# Coach field consumption

Machine-readable source: `COACH_FIELD_CONSUMPTION` in `src/v3/coachIntelligence.js`.
A test asserts **every** coach attribute carries a status, and that no
`RESEARCH_ONLY` field is described as changing a game.

## Statuses

| Status | Meaning |
| --- | --- |
| `ACTIVE_CURRENT_ENGINE` | Read by the live production engine today |
| `ACTIVE_COACH_INTELLIGENCE` | Read by Coach Intelligence (fit only — not a result) |
| `PLANNED_POSSESSION_ENGINE` | Will be consumed when the possession engine models the action |
| `RESEARCH_ONLY` | Nothing reads it. Kept for research legibility |
| `DEPRECATED_PENDING_REVIEW` | Slated for removal |

## Resolution of the six dormant fields

| Field | Before | After | Why |
| --- | --- | --- | --- |
| `insideOut` | dormant | **ACTIVE_COACH_INTELLIGENCE** | Drives the `interiorGeometry` fit dimension — does the roster support playing through the interior and kicking out? |
| `starEmpowerment` | dormant | **ACTIVE_COACH_INTELLIGENCE** | Drives `usageHierarchy` fit — a star-empowering system needs a star worth empowering, and cannot feed five primaries from one ball |
| `tacticalAdjustment` | dormant | **ACTIVE_COACH_INTELLIGENCE** | Pairs with `adaptability` to supply the `adaptabilityNeed` dimension |
| `pnr` | dormant | **PLANNED_POSSESSION_ENGINE** | Now reads in coach fit, but the possession loop has **no pick-and-roll action** to consume it. Becomes engine-active when that action exists |
| `man` | *unreported* | **RESEARCH_ONLY** | The engine models scheme via `zone` and treats man as its complement, so `man` is redundant with `10 − zone` |
| `rotationDepth` | *unreported* | **RESEARCH_ONLY** | **Structurally unusable:** EraClash plays five players with no substitutions, so rotation depth has nothing to act on. Meaningful only if the bench/minutes format opens — a standing CEO decision |

## User-facing copy

No user-facing coach description currently claims that `man`, `rotationDepth`,
or `pnr` changes a result — the UI shows `systemTags`, `bestWith`, and `concern`,
none of which reference them. **No copy correction was required.**

The rule going forward: a coach attribute may appear in user-facing copy as a
*description of the coach* at any time, but may be presented as *affecting the
game* only when its status is `ACTIVE_CURRENT_ENGINE`.

Coach Fit surfaces a concern when a `RESEARCH_ONLY` field would otherwise
mislead — a deep-rotation coach on a five-player lineup reports plainly that
"a deep-rotation system has nothing to act on in a five-player format."
