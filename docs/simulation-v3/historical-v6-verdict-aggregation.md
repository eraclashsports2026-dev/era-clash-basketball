# Verdict aggregation: independent clusters, not trait labels

**Phase 6C4C2.** The change that separates a V6 verdict from a V5 verdict.

## What V5 counted

Historical V5's trait gate was `maxHardFails: 0`, counted over trait **labels**.
It reported **3 hard fails**:

- `ball movement, drive and kick, corner threes` on `v5m-2000s` teamB
- `ELITE_DEFENSE` on `v5m-2020s` teamA
- `elite team man defence` on `v5m-2020s` teamA

Phase 6C4C1 examined those three and found the last two were **one
observation**: identical fixture, side, metric, surface, expected direction,
observed value (1.36011) and reference value (1.32206). Two trait names claiming
the same measurement.

The real independent evidence was **2 clusters**, not 3.

## Why that matters

A label count double-counts whenever two descriptors claim the same metric on
the same surface in the same direction. That inflates the apparent weight of
evidence, and it makes a verdict sensitive to a naming decision: adding a synonym
to the trait registry would have increased V5's hard-fail count without any new
measurement existing.

For a gate set at zero the inflation does not change the verdict. For any gate
above zero, or for any narrative about "how many things went wrong", it does.

## What V6 counts

The aggregation unit is `INDEPENDENT_MEASUREMENT_CLUSTER`, keyed on:

```
matchupId | side | metricId | surface | expectedDirection | observedValue | referenceValue
```

The key **excludes the trait label**. Two labels on one measurement collapse to
one cluster; the same metric failing on two different matchups stays two
clusters, because different teams are different evidence.

Every formal trait label is preserved — in the register, in the result, and in
the cluster's own `formalTraitLabels` array with a `duplicateLabelNote` naming
the collapse. Nothing is deleted or hidden. Only the evidence **count** collapses.

## The gate

```
maxIndependentHardFailClusters: 0
maxHardFailLabelsNote: "not a gate. Labels are counted and reported;
                        only clusters are aggregated."
```

The dry run proves the collapse does not weaken the gate: one synthetic cluster
carrying two labels still fails `zeroIndependentHardFailClusters`.

## Cluster independence rule

Two hard fails sharing a cluster key are one cluster. Two hard fails on the same
metric and side but different matchups are two clusters. The rule is stated in
the frozen verdict policy before any V6 game is played.

## What a cluster does not change

The **per-trait** rule is unchanged and remains the dual gate:

- a hard fail needs the wrong direction, **and** a 95% interval excluding zero,
  **and** a difference beyond the metric's frozen practical margin;
- a wrong-direction result inside the margin is
  `STATISTICALLY_DIFFERENT_PRACTICALLY_EQUIVALENT` — reported, never
  verdict-driving, at any sample tier;
- the trait pass rate (`minTraitPassRate: 0.75`), the per-matchup majority rule
  and the per-era rule all still count individual scored traits, because those
  gates are about coverage rather than weight of evidence.

## Related

- `historical-holdout-v6.md` — the set, its policies and its seal
- `data/validation/6c4c1/historical-v5-independent-evidence-clusters.json` —
  the 6C4C1 analysis that established the collapse
- `data/validation/6c4c2/historical-v6-verdict-policy.json` — the frozen policy
