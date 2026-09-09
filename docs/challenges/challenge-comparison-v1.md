# Challenge comparison V1 (Phase 9C)

`COMPARISON_VERSION 1.0.0` — stored on every completed attempt so copy can
never outrun the contract.

## Performance score

For one result, from the user's side (Gold):

| Outcome | Score |
| --- | --- |
| win | `+margin` |
| loss | `−margin` |
| tie | `0` |

where `margin = |gold − blue|`.

## Challenge outcome

Higher performance score wins the challenge. Equal scores tie.

| Creator | Recipient | Outcome |
| --- | --- | --- |
| wins 118–104 (+14) | wins 121–100 (+21) | recipient |
| wins 118–104 (+14) | wins 105–102 (+3) | creator |
| loses 100–110 (−10) | loses 102–106 (−4) | recipient |
| wins 110–100 (+10) | wins 120–110 (+10) | tie |

`compareResults(creator, recipient)` returns both scores, both outcomes, the
challenge outcome and the gap. The sentence the result shows
(`comparisonLine`) says "You beat X's Clash" only when the contract decided
`recipient`; never on a bare game win.

## Not in V1

No weighting by era, roster value, MVP or coaching. No proprietary grade. If a
later version changes the formula it gets a new `COMPARISON_VERSION`, and
attempts completed under 1.0.0 keep reading as 1.0.0.
