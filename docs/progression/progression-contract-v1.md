# Progression contract V1 (Phase 9D)

> "What have I accomplished in EraClash?" — never "How much stronger am I because I played more?"

Progression is **identity and recognition**. It records a career; it never
creates basketball power. `PROGRESSION_POWER_EFFECT = 0` is a constant in the
contract and an invariant the gates prove: no roll, draft, era, coach, placement,
Legend Rival or simulation path imports progression, and progression imports
none of theirs. A Level 1 account and a Level 100 account given the same
basketball decisions have exactly the same opportunity to win.

Versions: `PROGRESSION_VERSION 1.0.0`, `LEVEL_CURVE_VERSION 1.0.0`,
`ACHIEVEMENT_CATALOG_VERSION 1.0.0`. The pure contract is
`src/progression/contract.js`; the server is `api/_lib/progression.js`,
dispatched by `api/profile.js` (no new serverless function); the schema is
`supabase/migrations/0005_progression_v1.sql`.

## The three things V1 adds

| Concept | Where it lives | Derived from |
| --- | --- | --- |
| Career XP | `xp_ledger` — one row per award, unique per (account, source type, source id, reason) | saved Clashes, completed challenge attempts, completed responses by other accounts, achievement unlocks |
| Career level | `progression_profiles.career_level`, recomputed from the ledger total inside the database function | the versioned level curve (mirrored in SQL and JavaScript; pinned equal by tests) |
| Achievements | `achievement_unlocks` — one row per achievement per account; **progress is never stored**, it is derived | the account's records, through the pure evaluator |

## Authority model

- **The server decides XP; the browser displays it.** Every award list is
  derived by `expectedAwards()` from database rows and handed to
  `progression_apply()`; the request body contributes nothing — not a score,
  not an XP delta, not a level, not a user id.
- **Identity is the verified bearer token.** Progression actions are account
  only; a presented but invalid token is refused (401), never downgraded.
- **The database is the last word.** `progression_apply()` is `SECURITY
  DEFINER`, executable by the service role alone, serialised per account with an
  advisory lock; awards insert `ON CONFLICT DO NOTHING`; the total is
  recomputed from the ledger; a trigger refuses any profile whose total or
  level disagrees with the ledger; the ledger refuses `UPDATE`.

## One function for every trigger

`reconcileProgression({ userId, trigger })` runs on: a Clash saved, a guest
result claimed after sign-in, a device import, a challenge completed (recipient
account) and answered (creator), My EraClash opened, and an explicit
reconcile. It derives what the records earn, inserts what is missing, and
reports the **delta this call produced** — so a postgame says "+125 XP" and a
refresh says "+0". Because the same code path serves backfill and repair, a
historical account is initialised by opening its career page, and a lost
callback is repaired the same way. It never erases: a failed record read
inserts nothing and removes nothing.

## Level curve 1.0.0

Cumulative XP to reach levels 1–10: 0, 250, 550, 900, 1,300, 1,750, 2,250,
2,800, 3,400, 4,050. From Level 10 the step from L to L+1 costs
`650 + (L − 10) × 75`. Cap 100 (`MAX LEVEL`); XP keeps accumulating; no
prestige, no reset, nothing erased. Expected velocity at a 50% win rate: Level 5
in about 11 Clashes, Level 10 in about 34, Level 25 around 190, Level 50 around
790 (`data/validation/9d/level-curve-analysis.json`).

## Presentation rules

- The result establishes score, winner and MVP first; CAREER PROGRESS follows,
  full width, secondary. No modal, no claim button, no fake chest.
- One Clash may unlock several achievements: one list, one module, at most one
  restrained transition; none under reduced motion.
- Level-up is a block inside the module ("LEVEL UP · LEVEL 9 REACHED · Your
  EraClash career keeps growing."). Never a full-screen interruption.
- Guests see one line — "Sign in to preserve your career" — because XP attaches
  to an account. A claimed guest result earns once, after the claim.
- Achievement state is said in words (UNLOCKED / LOCKED / SECRET), never colour alone.

## Not in V1 (by decision)

Leaderboards of any kind (Phase 9E), public profiles, XP for logging in,
seasonal resets, prestige, hidden throttles, paid progression effects, the
RIVALRY achievement (relationship tracking), fantasy rank names.
