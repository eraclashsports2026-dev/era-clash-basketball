# Offensive action library 2.0

`actionLibraryVersion` **2.0.0** — a **MAJOR** bump. The library's contract changed from one detailed
action plus a generic fallback to a set of families with a shared interface, and Phase 6B1 results are
not comparable to Phase 6B2 results.

Behind `EXPANDED_OFFENSIVE_ACTIONS_ENABLED` (default false).

## Interface

```js
canSelect(ctx)      // legal and possible at all?
weight(ctx)         // frequency ONLY, never effectiveness
prepare(ctx)        // who is involved, and what does the defence look like?
resolve(ctx, rng)   // structured consequences
```

No family authors a score, a winner or a player line.

## Families

| Family | Cap | Notes |
|---|---|---|
| `PICK_AND_ROLL` | 0.46 | unchanged from Phase 5C |
| `POST_UP` | 0.30 | converts a detected post mismatch into exploitation |
| `ISOLATION` | 0.28 | rises with late-game urgency; can convert a size mismatch into a post attack |
| `SPOT_UP` | 0.26 | emerges from a creation event |
| `OFF_BALL_SCREEN` | 0.26 | makes movement-shooter chase burden real |
| `HANDOFF` | 0.22 | a hub big pulls a rim protector out of the paint |
| `CUT` | 0.20 | emerges from a creation event |
| `TRANSITION` | — | overrides the mix: a live-ball break is not a called play |
| `ZONE_ATTACK` | 0.75 | against a zone, replaces man actions |
| `GENERIC_HALF_COURT` | — | honest remainder, floored at 0.10 |

## Frequency, not effectiveness

The mix is **normalised to a distribution**. Raw family weights are independent and summed to ~1.53,
which made `GENERIC_HALF_COURT` a *floor* rather than a *remainder* and left every family pinned at
its cap. Normalising is what makes "generic share" a number worth reporting.

Coach identity is legible in the mix (2010s, same rosters):

| Coach | Top families |
|---|---|
| Phil Jackson | POST-UP 25% · OFF-BALL 12% · PnR **9%** |
| Mike D'Antoni | **PnR 21.5%** · ISO 11% · POST-UP 9.5% |
| Steve Kerr | OFF-BALL 14.7% · POST-UP 13.3% · PnR 11.4% |
| Jerry Sloan | POST-UP 24% · **PnR 18.6%** |

Max single-family share across all seven coaches: **25%**. No action dominates.

## Mismatch hunting is coach-dependent

A detected mismatch **raises** a family's frequency, scaled by how willing that coach is to run it at
all. Without the scaling, a severe post mismatch pinned **every** coach to the post cap — including
one whose documented system never posts — and erased coach identity for that family. A mismatch
raises frequency; it does not convert a team.

## Usage still governs volume

Family shooter selection uses `usage × boundedFitMultiplier(0.55–1.7)`, not `usage + fit`. Adding
them let a low-usage specialist out-shoot a primary creator by fitting one family well — measured, the
top-usage player took **fewer** attempts than the bottom-usage one.

Fixing that surfaced a worse bug: the helper took an index parameter, but `rng.weighted` invokes the
weight function with the **item alone**. Every weight became `NaN`, floored to zero, and the first
player in the array was selected every time — one player took **3,749** attempts in an 80-game sample.

## Generic share

| Slice | Generic share |
|---|---|
| By coach (7 coaches) | 7.9% – 8.8% |
| By era (5 eras) | 8.0% – 8.9% |
| By roster (4 archetypes) | 8.2% – 8.5% |

Down from **73.5%** in the 6B1 baseline. It remains a truthful fallback and was **not** forced down by
selecting inappropriate families — a test asserts it stays above 2%.
