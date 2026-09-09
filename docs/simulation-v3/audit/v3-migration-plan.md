# V3 migration plan

## Principle

**Additive, never replacing.** Every V3 layer is built alongside production,
proven by test, and wired in only by an explicit later decision. Nothing shipped
in Phase 2, 2B, or 3 changes a simulated result.

## Completed

| Phase | Delivered | Wired in? |
| --- | --- | --- |
| V3 engine | possession loop, coaches, eras, defense | **Yes** — live since v2.5.0, flag `SIM_ENGINE_V3_ENABLED` |
| Phase 2 | Player Intelligence (381 profiles) | No — by design |
| Phase 2B | person identity, physical, shooting, stat basis, Nance correction | Person identity **yes** (it is a correctness fix to live validation); the rest are data layers |
| Phase 3 | Team Intelligence | No — by design |

## The one deliberate production-behaviour change

Phase 2B replaced suffix-stripping person identity with a canonical registry.
This **changes what `api/game.js` accepts**:

- now correctly **refuses** `russell-50s` + `bill-60s` (two Bill Russells)
- now correctly **allows** `chet-60s` + `chet-20s` (two different men)

Both directions move the product toward its own documented rule. It is called
out here rather than buried because it is the only live behaviour change in the
whole sequence.

## Remaining sequence

1. **Phase 4 — Coach Intelligence.** Consume or formally retire the dormant
   coach fields.
2. **Matchup Engine.** Opponent-specific assignment on top of Team Intelligence.
3. **Wire the intelligence layers into the possession engine.** One layer at a
   time, each behind a flag, each backtested against stored results.
4. **Chemistry decision.** Replace the meter with real construction economics or
   remove it. Requires CEO approval; see `../chemistry-vs-team-intelligence.md`.
5. **Card convention migration.** Re-derive the 310 `LEGACY_UNVERIFIED` cards to
   the rigorous decade-average convention, or formally accept the mix.

## Rollback

Every step is a flag or a data file. `SIM_ENGINE_V3_ENABLED=false` restores the
V2 engine without a data migration.
