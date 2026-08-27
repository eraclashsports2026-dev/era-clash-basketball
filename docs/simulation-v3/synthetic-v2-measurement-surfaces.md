# Synthetic V2 measurement surfaces

A guardrail is only meaningful on a surface where its claim is decidable. Three
surface defects were caught during preparation, each by measurement rather than
by review.

## MIRROR

the fixture five against ITSELF under its own coach, side-balanced across paired seeds. Construction is the only variable, so an action-mix, variance or structural result cannot be an artifact of the opponent.

Decides: `requireZeroInvariantFailures`, `requireZeroImpossibleResults`, `forbidUniversalActionDominance`, `requireSameSeedReplay`, `requireNewSeedVariance`.

## ZONE_ASYMMETRIC, and why the mirror could not decide the shell

the fixture five on BOTH sides, personnel therefore exactly controlled, with the frozen zone-heavy coach on one side and the frozen matched man coach on the other, side-balanced. A zone side exists by design rather than by chance, so a shell win rate is defined.

With the same coach on both sides of a mirror, both defences draw zone with
equal probability, so the "zoning side" is whichever side happened to draw more.
Measured on four development fixtures the win rate came back 0.499, 0.521, 0.523
and 0.505 — pinned to 0.5 by construction, where the frozen band [0.35, 0.65]
can neither fail nor pass on evidence.

Substituting a coach pair introduces a confound: changing the coach changes
every other scheme dimension too. Two things address it. The pair is chosen by
an explicit rule — among all pairs whose `zonePreference` differs by at least 6,
the one minimising Euclidean distance across the other ten toolkit dimensions,
which selected `erik-spoelstra` (zone
9) against
`steve-kerr` (zone
3) at distance
5.09902 from
49 candidates. And the surface
carries a twin.

## ZONE_ABLATION_TWIN

the identical construction in a zone-ILLEGAL era, where the engine cannot realize a zone possession at all. Any win-rate deviation from 0.5 here is the coach confound with the shell removed, so the shell's own contribution is the difference between the two surfaces.

The twin runs the identical era, coaches and personnel with `zoneResolution`
disabled, which realizes exactly zero zone possessions. Any deviation from 0.5
there is the coach confound with the shell removed. A band breach the twin also
explains is recorded `INDETERMINATE`, never converted into a pass and never
counted as a failure.

At the frozen volume the confound is small: across ten zone-legal development
fixtures the twin deviated from 0.5 by at most 0.063. An earlier reading of it
as large came from a scale-0.05 rehearsal and was small-sample noise.

Because the twin runs the engine in a non-production module configuration, it is
marked `DIAGNOSTIC_ONLY` and never adjudicates a guardrail.

## VS_COHERENT_LOWER_CONTROL

the fixture five against a coherent five built to a summed card rating strictly BELOW the fixture's, under the neutral coach on both sides so coaching cannot explain the result. The only decidable surface for a construction-beats-talent claim, because it needs two different constructions and a known rating direction.

The control is built per fixture, because the sealed fixtures span a wide rating
range and no single control can be lower-rated than all of them. Coherence is a
hard constraint of the search, not a tie-break: an earlier version scored it only
at the end and returned zero coherent controls, because interior scoring is the
scarce requirement — 16 of 292 non-holdout cards reach `postThreat` 5.5 — and a
rating-targeted beam prunes those cards away before coherence is ever evaluated.

If no coherent five sits strictly below the fixture, the surface reports
`CONTROL_PRECONDITION_UNREACHABLE` and the guardrail is `NOT_APPLICABLE` on that
fixture. That branch exists because it fired: `sd2-extreme-small` is rated below
what a coherent five can cost, and an unconstrained search returned a control at
ratio 1.143 with a 0.777 win rate that would have read as construction beating
talent when it was simply the better team winning.

## VS_ROLE_MATCHED_UPGRADE, and the rating basis

the fixture five against ITSELF UPGRADED SLOT BY SLOT: same five slots, same functional role in each, a strictly better card wherever the pool offers one, under the neutral coach on both sides and side-balanced. Card quality is the only thing that moved, so a win-rate difference is a talent effect and not a construction effect.

Two corrections produced this surface.

The direction was backwards. `ss2-extreme-strength-gap` is the flattest five in
the sealed set and the lowest rated of the sixteen: it is the *weak* side of the
gap, so a precondition requiring the fixture to out-rate its control was
unsatisfiable.

And the rating basis was wrong. The guardrails speak of OVR, and OVR is
`src/rating.js` — the position-weighted rating the product computes and displays.
An earlier draft used a summed-stat proxy invented for this phase. A calibration
ladder exposed it: a five the proxy rated 1.75x higher **lost about 60% of games
in all three eras**, because the proxy tracked accolade counts while the engine
responds to position-weighted production and balance.

That failure also showed the talent surface could not work by targeting a rating
level at all. A search free to pick any five that reaches a target is free to
change the *construction*, which is the other axis under test. So the strong side
is built by upgrading the fixture slot by slot — same slot, same functional role,
a strictly better card wherever the pool offers one — leaving card quality as the
only thing that moved. A slot with no role-preserving upgrade is left unchanged
and recorded, so the result is never weaker anywhere.

## Zone legality

Zone defence is legal only in the 2000s, 2010s and 2020s, capped at
`maxZoneUsage` 8. That makes 9 of the sixteen
sealed fixtures zone-decidable and the other seven `NOT_APPLICABLE` for the shell
band, held instead to zero realized zone.

