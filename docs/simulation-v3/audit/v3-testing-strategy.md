# V3 testing strategy

## Layers of guard

| Level | Tool | What it proves |
| --- | --- | --- |
| Unit / data | Vitest (`tests/`) | schema validity, provenance, identity, conventions |
| Behavioural | Vitest | usage allocation, role classification, construction analysis |
| Isolation | Vitest + source grep | the new layers cannot leak into production |
| Determinism | Vitest | same input → identical output; no seed, no order dependence |
| Journey | Playwright (`e2e/`) | 13 real user journeys against the local harness |
| Benchmark | `benchmarks/v3/*.mjs` | engine behaviour over many games |

## The tests that matter most

**Isolation.** Reading the source and asserting no simulation module imports the
intelligence layers is the only thing standing between "built alongside
production" and an accidental live wiring.

**Era independence.** Building all 381 profiles under six conflicting era
contexts and asserting byte-identical JSON. A future "shooters were better in
the 2010s" patch fails here immediately.

**Anti-fabrication.** Validation rejects an unsourced measurement and rejects any
wingspan at all. The rule is not "no numbers" but "no unsourced numbers".

**Pre-three-point handling.** A player who retired before 1979-80 must carry a
null three-point percentage, never a zero, and must still carry an era-neutral
`perimeterSkill`.

**Determinism without seeds.** Team Intelligence is asserted to produce
identical output across repeated builds and across array reordering with fixed
positions.

## What tests must never do

Do not loosen an assertion to accommodate a change. When Phase 2B corrected
Larry Nance's accolade and replaced person identity, the affected assertions
were rewritten to the **new correct specification** and new tests were added
proving the specific defects were fixed — the assertions became stricter, not
looser.

The one deliberately tolerance-based test is the OVR examples check (±2 with a
separate ordering assertion), because `displayOVR` is a percentile over the pool
and legitimately shifts when the roster changes. It must not be converted back
to exact matching.
