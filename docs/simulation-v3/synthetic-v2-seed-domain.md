# The Synthetic V2 seed domain

The 6C4B2 blocker's first missing component: "NO frozen synthetic-V2 seed
manifest exists ... there is nothing to verify a seed hash against."

## Construction

Master `0x6c4b1e` under namespace `eraclash-6c4b1s`.

`streamMaster = int32BE(sha256(`${NAMESPACE}:${stream}:${master}`)); seed = deriveSeed(streamMaster, index) via splitmix32 — the same primitives as every prior domain, under a distinct master and namespace`

`seedDomains.js` is a Candidate 1 **core** file, so this domain is deliberately
not registered there: doing so would mutate the core the holdout is about to
hash.

## Addressing

`fixtureIndex * FIXTURE_STRIDE + SURFACE_SLOTS[slot] * SURFACE_STRIDE + pairIndex`

Fixture stride 400,000, surface stride
40,000, eight surface slots. The address is
a pure function of its three indices, so a resumed run re-derives exactly the
seeds it had.

## Disjointness, proven rather than assumed

| | |
|---|---|
| seeds per stream in the proof | 65,536 |
| prior populations checked | 25 |
| stream x population comparisons | 51 |
| total overlap | **0** |
| addresses the run will draw | 37,432 |
| distinct seeds those produce | 37,432 |

The prior populations include every registered domain, every ad-hoc block earlier
phases carved out, all V4 and V5 streams, and **this phase's own preparation
streams** — the development-evidence and ladder runs happened before the formal
domain existed, so the formal domain has to be proven clear of them too.

The formal stream and the dry-run stream are also proven disjoint from each
other, so a rehearsal cannot consume a seed the formal run will use.

