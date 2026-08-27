# Historical V6 seed domain

**Phase 6C4C2.** Domain `HISTORICAL_V6_FORMAL`, master `0x6c4c20`.

## Why it lives in validation-only code

`src/v3/calibration/seedDomains.js` is one of the 53 files in the Candidate 2
core closure. Registering a V6 domain there would change the aggregate core hash
that the V6 verdict policy, the V6 seal and the Candidate 2 lock all pin — the
holdout would be scoring a different core than the one it claims to score.

So the domain follows the pattern 6C3R established and 6C4B1 repeated: the same
primitives (sha256 stream master → splitmix32 derivation via
`src/v3/seed.js`) under a distinct phase master, in `scripts/v6/seeds.mjs`, with
disjointness proven empirically rather than argued from construction.

## Streams

| Stream | Purpose |
|---|---|
| `historical-holdout-v6` | the one-time V6 holdout run, all sample tiers |
| `v6-dryrun` | the transactional runner dry run, on non-holdout mock fixtures |

```
streamMaster = sha256('eraclash-6c4c2:<stream>:<master>').readInt32BE(0)
seed         = deriveSeed(streamMaster, index)
```

## Addressing, and why the tier is in it

```
index = tier * 5,000,000
      + matchupIndex * 300,000
      + surfaceIndex * 100,000
      + pairIndex
```

The sample plan claims that an escalation cannot reuse a decision-tier seed and
inflate agreement between tiers. That claim is only true if the addressing makes
it true. Putting the tier in the address makes it true by construction, and
`proveTierDisjoint` then proves it over the **exact addresses each tier would
draw** — 6,144 / 12,288 / 24,576 / 49,152 / 98,304 seeds across tiers 0 to 4,
with zero collisions in all 15 pairwise comparisons and zero internal duplicates.

Without this, the precheck and decision tiers could share seeds, and "the two
tiers agree" would be partly a statement about seed reuse rather than about
sample size.

## Disjointness proof

Empirical intersection over generated seed sets at 49,152 seeds per stream —
more than the decision tier draws — against **19 prior populations**:

- every registered domain in `seedDomains.js`
- the ad-hoc blocks earlier phases carved out of registered domains: the
  Historical V3 block, the internal reference block, the Candidate 1 internal
  validation block
- the four Candidate 1 diagnostic masters and the behaviour-proof and
  realized-zone control masters
- all four 6C3R validation streams, including V4's own holdout stream
- **both** 6C4B1 streams: `historical-holdout-v5` and `v5-dryrun`

Total overlap: **0**, across 39 stream × population comparisons.

Including the consumed V5 streams matters. V5 has been opened and its seeds
drawn; a V6 run reusing them would be re-running games Candidate 1 already
played, which is not what "unseen" means.

## Index blocks in shared certification streams

The Candidate 2 reference and observability certifications reuse the registered
6C3R streams with distinct index blocks rather than adding streams:

| Use | Stream | Block |
|---|---|---|
| Candidate 2 reference self-baselines | `era-reference-cert` | 12,000,000 |
| Candidate 2 reference population standing | `era-reference-cert` | 14,000,000 |
| Candidate 2 observability controls | `observability-controls` | 12,000,000 |

The first attempt used 8,400,000 for the reference self-baselines, which
overlaps the Candidate 1 population block: that runs
`7,400,000 + i*200,000 + j*20,000 + k` and reaches 8,840,299. The blocks above
start well clear of every prior use, and the arithmetic is stated in the source
rather than hoped for.

The certification runs deliberately use the **same** seeds for Candidate 1 and
Candidate 2 where they are comparing the two engines on one instrument — that
isolates the engine change from seed noise. The formal holdout does not.

## Related

- `historical-holdout-v6.md`
- `data/validation/6c4c2/historical-v6-seeds.json`
- `data/validation/6c4c2/historical-v6-seed-disjointness.json`
