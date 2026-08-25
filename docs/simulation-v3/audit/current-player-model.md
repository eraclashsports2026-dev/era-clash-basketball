# Current player model — how a player becomes numbers

## The chain

```
players.js (VERIFIED production)
   → era normalization (leagueNorms.js, per-statistic exponents)
   → playerProfile.playerDNA  → 27 capabilities, 0–10
   → [Phase 2] intelligence.js → roles, fit, era translation   (UNWIRED)
```

## Era normalization

`playerProfile.js` translates raw production into a shared reference
environment **per statistic**, never with one blanket formula:

| Stat | Exponent | Reason |
| --- | --- | --- |
| `pts` | ^0.7 | environments differ, but talent carries |
| `reb` | ^0.85 | the biggest artefact — 1960s miss volume inflated every total |
| `ast` | ^0.5 | league rates moved less; scorekeeping cuts both ways |
| `stl`/`blk` | ^0.5 **only where recorded** | pre-1974 values are estimates, so normalizing them would fake precision |

## Provenance grades

`VERIFIED` (read from the trusted dataset) · `HUMAN_REVIEWED` (curated) ·
`CALCULATED` (deterministic transform) · `INFERRED` (era/position prior).

Confidence describes **knowledge quality and never feeds game variance** — that
is `consistency`'s job. A low-confidence player is not made random.

## Known weaknesses (and what Phase 2B did about them)

| Weakness | Status |
| --- | --- |
| No shooting splits → all shooting inferred from position/era/volume | **Improved.** `data/shooting.js` adds measured splits + categorical identity for 44 persons; `spacingGravity` now anchors on evidence where it exists |
| No physical measurements | **Improved.** `data/physical.js` adds verified height/weight for 44 persons. Wingspan stays null |
| Pre-1974 steals/blocks unrecorded → `eventCreation` 0.0 for Russell and Wilt | **Corrected** for the affected review set via the curated overlay, with the artefact documented |
| `iq` is computed and consumed by nothing | Still true |
| Accolade pedigree is positionally naive (Eaton's wing defence) | Mitigated by the curated overlay, not by the formula |
| Card statistical conventions are mixed | **Now explicit** — see `../player-card-stat-basis.md` |
