# Recommended V3 architecture

```
PLAYER INTELLIGENCE      what kind of player is this?            [Phase 2 ✅ built, unwired]
        ↓
TEAM INTELLIGENCE        do these five form a basketball team?   [Phase 3 ✅ built, unwired]
        ↓
COACH INTELLIGENCE       how does this coach deploy them?        [Phase 4 — not built]
        ↓
ERA STYLE                what is a skill worth tonight?          [exists, live]
        ↓
MATCHUP ENGINE           which strengths actually meet?          [partial: defense.js]
        ↓
POSSESSION ENGINE        what happens, possession by possession? [exists, live]
        ↓
STRUCTURED RESULT        the realized box score                  [exists, live]
        ↓
POSTGAME                 explanation of a finished result        [exists, live]
```

## Why this order

Each layer answers a question the layer above it cannot, and adding capability
at the wrong level is what produced the two defects this audit found.

- **Player before team.** A player's description must not depend on his
  teammates. Otherwise the same card means different things in different
  lineups, and nothing is comparable.
- **Team before coach.** The base construction of five players exists whether or
  not a coach is attached. If coaching were folded into team analysis, "is this
  a good team?" and "is this a good plan?" would stop being separable — and the
  product's core claim is that team construction and deployment are different
  things.
- **Coach before era.** A coach adapts to the environment; the environment does
  not adapt to the coach.
- **Era before matchup.** The environment prices skills; the matchup then decides
  which priced strengths actually collide.
- **Everything before the possession engine.** The winner must emerge from
  simulated events. Any layer that could shortcut to a result would break the
  constitution.

## The rule that keeps it honest

**Each layer describes; only the possession engine decides.** Player
Intelligence names roles without valuing them. Team Intelligence names
construction strengths and concerns without scoring the team. Era Style prices
skills without picking a winner. The scoreboard is the only thing that decides.

## Anti-goal: no team OVR

Player OVR already demonstrates the failure mode — one number that the UI treats
as truth and the engine ignores. Team Intelligence therefore exposes **many
basketball dimensions and no single overall score**, so the simulation is forced
to consume the dimensions rather than a shortcut.
