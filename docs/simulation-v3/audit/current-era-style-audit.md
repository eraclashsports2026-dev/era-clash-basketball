# Current era style audit

**8 era styles** in `src/v3/eraStyles.js` (`ERA_STYLES`), with data in
`src/v3/data/eras.js`.

## The rule that defines the feature

**ONE shared era per game.** Both teams play in the same environment. There is
no per-team era advantage, and no team "brings its era with it". This is what
keeps era a *setting* rather than a *bonus*.

## What era does

`eraStyles.getEra` feeds `buildGamePlan` and `defenseContext`, shaping pace,
spacing, shot value, and defensive rules for the shared environment. Both sides
receive the identical context object, so any asymmetry in outcome comes from the
players, not from the era.

## What era must never do

Era must not adjust a player's *description*. Player Intelligence is
era-independent by construction (`buildIntelligence` takes no era and a test
builds all 381 profiles under six conflicting era contexts asserting identical
JSON). A shooter is worth more in a spaced era because the **environment prices
the skill**, never because the player quietly received a birth-year bonus.

`eraTranslation` on each profile *names* which strengths are
environment-sensitive — `spacingGravity`, `postThreat`, `usageAppetite`,
`perimeterContainment` — and attaches no value to them. Pricing them is this
layer's successor's job.

## Gap

`ERA_NOTE` and `eraInteraction` exist, but Daily and Challenges bypass era
entirely, so the most-played mode never exercises the era system. Whether the
worldwide daily puzzle should include coach and era — identical for every
player, therefore zero fairness cost — remains an open CEO decision.
