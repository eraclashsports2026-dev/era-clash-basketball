# Synthetic V2 verdict schema

## A cell: one guardrail on one fixture

| outcome | meaning |
|---|---|
| `PASS` | measured, decided, and inside the frozen threshold by at least the practical margin |
| `FAIL` | measured, decided, and outside the frozen threshold by at least the practical margin |
| `INDETERMINATE` | measured but not decidable — the observation sits inside the practical margin of the threshold, or the surface result is confounded beyond attribution. Contributes no pass credit and no failure. |
| `NOT_APPLICABLE` | the surface does not exist for this fixture, so the claim cannot be posed at all. Contributes no pass credit and no failure, and is never recorded as zero. |
| `NOT_MEASURED` | the run did not produce the games this cell needs. An apparatus fault, not a candidate result. |

## A fixture

| verdict | meaning |
|---|---|
| `PASS` | every adjudicable guardrail mapped to this fixture is PASS or NOT_APPLICABLE, at least one is PASS, and no cell is FAIL or NOT_MEASURED |
| `FAIL` | at least one adjudicable guardrail mapped to this fixture is FAIL |
| `INVALID_RUN` | the fixture's games are missing, incomplete, or inconsistent with the frozen seed addressing — the apparatus failed, so the fixture carries no candidate verdict |

## The catastrophic rule

if a catastrophic guardrail (requireZeroInvariantFailures, requireZeroImpossibleResults, requireSameSeedReplay) FAILs on a fixture, that fixture's verdict is FAIL and every non-structural cell on it becomes INDETERMINATE, because those observations were measured on games the engine itself contradicts. A broken game must not grant pass credit to anything measured alongside it.

## Nulls

an unmeasurable metric stays null and its cell is NOT_APPLICABLE or NOT_MEASURED. It never becomes zero, never contributes pass credit, and never contributes failure.

## Two definitions frozen here rather than left to the runner

### universal dominance

A single action family or a single defensive shell is dominant on a fixture when its measured share (action family: share of that side's possessions; shell: win rate of the zoning side) lies outside the frozen threshold for that fixture by at least the practical margin. Dominance is UNIVERSAL when it occurs on a fixture at all: the frozen thresholds maxSingleActionFamilyShare, maxSingleShellWinRate and minSingleShellWinRate are per-fixture ceilings and floors, so the guardrail is evaluated per fixture and no fixture is permitted to breach one.

A failure budget — 'k of 16 fixtures may breach' — would weaken a frozen numeric threshold, which this phase may not do. The protection against a noise-driven failure is the practical margin, not a tolerance for real breaches: an observation within the margin of the threshold is INDETERMINATE, never FAIL. So the strict reading costs nothing in robustness and invents no allowance the frozen policy does not contain.

### better construction beating higher card rating

On the VS_COHERENT_LOWER_CONTROL surface a coherent five whose summed card rating is strictly below the fixture's, under the neutral coach on both sides and side-balanced, wins at least the frozen construction floor share of decided games. Coherence is the six-check functional definition in the surface plan (a lead creator, creation not collided, spacing, rim protection, interior scoring, a passer) evaluated on the intelligence profile rather than on card accolades.

It does not require the weaker roster to WIN the matchup. The claim is that construction is CAPABLE of overcoming a card-rating deficit — a floor on the lower-rated side's win rate — not that it usually does. A rule that required the weaker five to win outright would fail an engine in which talent correctly matters.

requireExtremeTalentRemainsMeaningful is the same axis measured at the other end, on VS_TALENT_GAP_CONTROL: a large rating gap must still move the win rate clearly away from a coin flip. The two guardrails bracket the axis, so an engine cannot satisfy both by flattening talent or by making talent absolute.

