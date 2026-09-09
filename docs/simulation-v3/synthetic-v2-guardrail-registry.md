# The Synthetic V2 guardrail registry

The guardrails were frozen in Phase 6C2C1 inside `HOLDOUT.syntheticGuardrails`,
covered by the acceptance policy hash `a3583d6ada42d61f...`.
This phase did not invent, merge, split or reinterpret any of them. It read
every key exactly once and attached the machine-readable detail a formal run
needs: a metric, a surface, the fixtures it applies to, an expected behaviour,
what a failure would mean, and one adjudication rule.

## The count discrepancy

The frozen object holds **eleven** keys. Both this phase's brief and the 6C4B2
blocker's own note say "ten".

Eight keys are boolean requirements. Three are numeric thresholds that
parameterise two of them: `maxSingleActionFamilyShare` parameterises
`forbidUniversalActionDominance`, and `maxSingleShellWinRate` and
`minSingleShellWinRate` parameterise `forbidUniversalShellDominance`. Merging
the thresholds into their parents would reach ten, but it would silently
reinterpret the frozen object.

So all eleven are registered, the three numerics are classified
`THRESHOLD_PARAMETER` and bound to their parent, and the discrepancy is recorded
rather than resolved by preference. The count reconciles with the frozen source,
not with the prose.

## The registry

| guardrail | class | fixtures | surface |
|---|---|---|---|
| `requireZeroInvariantFailures` | STRUCTURAL_INVARIANT | 16 | MIRROR, VS_BALANCED_CONTROL |
| `requireZeroImpossibleResults` | STRUCTURAL_INVARIANT | 16 | MIRROR, VS_BALANCED_CONTROL |
| `forbidUniversalActionDominance` | AGGREGATE_REQUIRED | 16 | MIRROR |
| `forbidUniversalShellDominance` | DIRECTIONAL_GUARDRAIL | 16 | ZONE_ASYMMETRIC |
| `maxSingleActionFamilyShare` | THRESHOLD_PARAMETER | 16 | MIRROR |
| `maxSingleShellWinRate` | THRESHOLD_PARAMETER | 16 | ZONE_ASYMMETRIC |
| `minSingleShellWinRate` | THRESHOLD_PARAMETER | 16 | ZONE_ASYMMETRIC |
| `requireSameSeedReplay` | HARD_CATASTROPHIC | 16 | MIRROR, VS_BALANCED_CONTROL |
| `requireNewSeedVariance` | TAIL_GUARDRAIL | 16 | MIRROR |
| `requireConstructionCanBeatHigherOvr` | PER_FIXTURE_REQUIRED | 5 | VS_BALANCED_CONTROL |
| `requireExtremeTalentRemainsMeaningful` | PER_FIXTURE_REQUIRED | 1 | VS_BALANCED_CONTROL |

Coverage reconciles both ways: no sealed fixture is unmapped
(`unmappedFixtures: []`) and no adjudicable guardrail lacks fixtures
(`unmappedGuardrails: []`).

## One mapping changed

`forbidUniversalShellDominance` originally mapped to the two fixtures whose
purpose label is `ZONE_EDGE_CASE`. It now maps to all sixteen.

A purpose label says what a fixture was *designed* to stress. A guardrail
applies wherever its claim is decidable, and "universally" cannot be judged from
one fixture. Era legality then narrows it to the nine zone-legal fixtures; the
other seven are held to a structural expectation of exactly zero realized zone
possessions, which is a real check rather than a skip.

