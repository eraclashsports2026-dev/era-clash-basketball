# Era Gauntlet contract

Version: 1.0.0 · Route: `/clash/gauntlet` · Tag: `GAUNTLET`.

One fixed canonical five faces seven opponents in ascending order: 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s. The 1950s anniversary-only source pool remains untouched; this seven-stage variant deliberately starts in the 1960s. A win opens the next stage, a loss ends the run, and seven wins finish it. Survived-era counts come from server victories, not client inference.

`gauntlet-start` locks the five and returns an owner-bound token. `gauntlet-play` uses that token and expected stage. The server owns the opponents, results, and progression. Refresh resume uses an opaque browser hint plus server ownership checks; account resume depends on the configured account provider. The team cannot be changed mid-run. Each stage is a current possession simulation with an authoritative result; the result callback preserves the continuation interface and makes its Breakdown/card available.

The brag statement is exactly the server count, for example “6 of 7 eras.” It is not a forecast or a competitive human rating. UI progress shows the actual era sequence and completed stages. An ended run may be followed by a new independently locked five.

Protected simulation unchanged. Unit evidence verifies the fixed seven eras and legal construction for every era. Full survival, loss handling, expected-stage/retry checks, guest/account resume, all result-card crawlers, and mobile verification must be recorded from actual server/browser runs.
