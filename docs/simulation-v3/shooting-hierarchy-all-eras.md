# Shooting hierarchy — all eight Era Styles

`npm run calibration:shooting-all-eras`

Two methods, because they answer different questions.

## Method A — controlled profiles (all 8 eras)

The **same five cards** in every arm; only the curated perimeter tier is
overridden. This isolates the shooting model from roster quality, which the
real-roster method cannot do — an "elite shooting" five is usually also a better
five.

The override is applied at the intelligence layer in the harness, **not** through
an engine flag: a test-only input path into the engine would be a permanent
affordance for faking a result.

| Era | 3PT | ELITE | AVERAGE | LIMITED | Ordering | Elite−weak spread |
| --- | --- | --- | --- | --- | --- | --- |
| 1950s | none | .4704 | .4569 | .4439 | ✓ | 0.027 |
| 1960s | none | .5407 | .5247 | .5143 | ✓ | 0.026 |
| 1970s | none | .5924 | .5784 | .5791 | **✗** | 0.013 |
| 1980s | legal | .5984 | .5875 | .5795 | ✓ | 0.019 |
| 1990s | legal | .5820 | .5612 | .5479 | ✓ | 0.034 |
| 2000s | legal | .5771 | .5632 | .5510 | ✓ | 0.026 |
| 2010s | legal | .5533 | .5254 | .5003 | ✓ | 0.053 |
| 2020s | legal | .6001 | .5622 | .5400 | ✓ | 0.060 |

**Ordering holds in 7 of 8.** The single failure is 1970s AVERAGE vs LIMITED at
**−0.0007** — a tie, not an inversion, in the engine's highest-efficiency era
where ceiling effects compress differences.

**Elite outside skill retains value where the shot does not exist.** In the
three pre-three-point eras, `3PAr = 0` and elite still beats average by +0.0135,
+0.0160 and +0.0140 of eFG%. The value comes through spacing, long-two quality
and defensive attention rather than through attempts — which is the required
behaviour.

**The spread scales with three-point volume**, as it should: 0.013–0.027 where
`3PAr = 0`, rising to 0.060 at `3PAr = 0.34`. Shooting skill matters more where
threes are actually taken.

## Method B — real rosters by curated tier (1 of 8 eras)

Testable only in the 2010s; the other seven eras have too few curated cards to
field three legal lineups, and are reported as untestable rather than filled
with inferred tiers.

| Group | eFG% | TS% | 3PAr | Lineup |
| --- | --- | --- | --- | --- |
| elite | .5733 | .5998 | .288 | Lowry, Curry, Klay, Durant, Dirk |
| average | .5379 | .5536 | .238 | Luka, Kobe, LeBron, Jokić, KG |
| weak | .5036 | .5356 | .217 | Wall, Westbrook, DeRozan, Draymond, Drummond |

Full ordering holds, with three-point attempt rate ordering correctly too.
