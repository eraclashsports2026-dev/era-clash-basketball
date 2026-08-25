# Holdout policy

`data/calibration/holdout-manifest.json` · `holdoutSetVersion` **1.0.0**
Manifest hash `cb863d5de2734f74` · **7 fixtures (27%)** · status **SEALED_UNREAD**

## Why it exists

The holdout answers one question that Phase 6C2 cannot answer about itself:
**did the tuning generalise, or did it memorise the calibration set?**

That answer is only available if the holdout is genuinely untouched. Looking at
it before or during tuning destroys its value permanently, and no later result
can restore it.

## Composition

Hand-chosen, not sampled. A random draw of 7 from 26 cannot guarantee coverage,
and an unrepresentative holdout is worse than none — it would pass a model that
generalises only to conventional teams.

| Fixture | Era | Why it is here |
| --- | --- | --- |
| `1960s-royals-creation` | 1960s | ball-dominant lead guard |
| `1970s-celtics-motion` | 1970s | off-ball motion |
| `1980s-lakers-showtime` | 1980s | pace extreme; the corpus's only sourced numeric target |
| `1990s-jazz-pnr` | 1990s | the canonical pick-and-roll team |
| `2000s-pistons-defense` | 2000s | elite defence |
| `2010s-warriors-movement` | 2010s | movement shooting |
| `2020s-nuggets-hub` | 2020s | passing hub |

Coverage: **7 eras**, 5 fixture types, 4 coaching systems, HIGH and MEDIUM
confidence. Deliberately mixes unusual teams (Showtime, the Jazz pick-and-roll)
with conventional ones — putting all the unusual teams in calibration would make
the holdout easy and meaningless.

## The seal

Reading the holdout requires `--unlock-holdout` **and** a stated reason, and
writes a record to `data/calibration/holdout-access-log.jsonl`.

This is an **audit trail, not security**. Anyone with the repo can edit the
file. The point is that a later reader can tell whether the holdout was
consulted before tuning — which is precisely what would invalidate it.

```bash
npm run calibration:holdout -- --unlock-holdout
```

The access record carries a sequence number, actor, reason, and a filtered
argv. Token-shaped and `KEY=value` arguments are stripped, so a credential
cannot end up in the log.

Access count is **not** the same as compromise: reading the holdout *after*
tuning is the intended use. But the count belongs in every report either way,
and `sealStatus()` supplies it.

## Rules

1. **Freeze before tuning.** Done — the manifest predates any coefficient work.
2. **Never tune against it.** Not for coefficients, not for thresholds, not for "just checking".
3. **Zero overlap with the calibration set.** Asserted by test.
4. **A manifest carries no timestamp.** One that changed hash on every regeneration could not prove it was frozen. Content-sensitive, so editing a fixture invalidates it.
5. **Report the seal state in every calibration report.**

## If the holdout is consulted early

Say so, in the report, with the access log. Do not quietly continue. A
compromised holdout that is *known* to be compromised is still useful
information; one that is silently compromised makes every later validation
claim false.
