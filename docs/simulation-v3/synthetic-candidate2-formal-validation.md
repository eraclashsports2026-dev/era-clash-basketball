# Synthetic Stress Holdout — Candidate 2 formal validation

Rendered from `data/validation/6c4c3/candidate2-formal-status.json`,
`data/validation/6c4c2/synthetic-v2-candidate2-binding.json` and
`data/validation/6c4b1s/synthetic-v2-guardrail-registry.json`.

## It was not opened

| Property | Value |
| --- | --- |
| set | `synthetic-stress-holdout-v2` |
| access count | 0 |
| access events | 0 |
| formal outputs | 0 |
| formal verdict | NOT_OPENED |

Historical Holdout V6 returned HISTORICAL_HOLDOUT_V6_FAIL. A synthetic stress pass says nothing about a candidate that failed the historical stage, and opening it would consume a one-shot resource for no evidence.

This is the frozen stage order working, not a gap. The Candidate 2 runner
requires a **passing** Historical V6 in code before the seal is touched and
refuses with `SYNTHETIC_ACCESS_REFUSED` otherwise.
Historical V5 is consumed and returned FAIL. A gate naming V5 could never clear, and a gate requiring merely 'a historical stage' would have been satisfied by a failure.

## The package remains prepared and unread

| Property | Value |
| --- | --- |
| disposition | POLICY_COMPATIBLE_REBIND_REQUIRED |
| action | REBIND |
| replaced with a V3 | false |
| membership fixtures | 16 |
| planned games | 79,444 |
| binding hash | `9080a994fce64edb…` |
| thresholds derived under | Candidate 2 |
| synthetic observations used to derive them | 0 |

## The frozen registry

| Quantity | Value |
| --- | --- |
| frozen keys | 11 |
| adjudicable behavioural requirements | 8 |
| numeric threshold parameters | 3 |

Phase prose has referred to 'ten conceptual guardrails'. The frozen object holds eleven keys: eight boolean requirements plus three numeric thresholds parameterising two of them. Both prior artifacts (the 6C4B2 preflight and blocker) recorded eleven. All eleven are registered here; the thresholds are classified as THRESHOLD_PARAMETER rather than merged into their parents, so nothing is reinterpreted and the count reconciles with the frozen source rather than with the prose.

## Availability to a future candidate

The set has never been read. It remains genuinely unseen and is still available
to whatever candidate next passes a historical stage.
