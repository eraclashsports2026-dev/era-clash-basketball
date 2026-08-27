# Phase 6C4B2R limitations

## What this phase establishes

Candidate 1, exactly as locked, does not pass Historical Holdout V5. That
statement rests on 98,304 games across
8 matchups and all eight Era Styles, scored by gates frozen
before the set was selected, with the candidate byte-identical before and after.

## What it does not establish

**Nothing about the synthetic stress axis.** Synthetic V2 was never opened, so
no claim about structural stress behaviour — construction versus talent, action
dominance, zone shells, competition variance — is supported by this phase.

**Nothing about the unobservable scope.** 19 trait
instances were excluded as unobservable, source-blocked, not recorded in era, or
not applicable. They remain null. None became zero, none earned pass credit, and
none contributed to the failure. Candidate 1 is neither validated nor invalidated
on any of them.

**Nothing about production.** `main` is unchanged at
`9cd95ff8797f8cdef252bbe67d63158c01b9f9bd`, production flags are untouched, and no
deployment occurred.

## The direction of the failure is worth carrying forward

The defensive-suppression trait failed on five of eight matchups — hard on one,
soft on three others — and in every case in the same direction: the era
reference scored *more* against a team the trait says should suppress it. A
consistent direction across five independent matchups is a pattern, not scatter.

This phase does not diagnose it. It is execution-only, and root-causing a
failure with the holdout result in hand is how a validation surface stops being
independent. The observation is recorded so a repair phase can start from
evidence rather than from a guess.

## Sample-size honesty

The three hard failures are three trait instances resolving to
2 distinct measurements: two trait names are
keyed on the same metric, surface and team, so they report one observation twice.
The verdict would be identical either way — the gate is zero hard failures — but
"three failures" overstates the independent evidence, and the artifact says so.

## Irreversibility

Historical Holdout V5 is spent. It cannot be reused to judge a repaired
candidate. Synthetic V2 is still sealed but has now sat in the repository
alongside a known failure, so its independence relative to any repair is a
judgement for the owner rather than a property this phase can preserve.
