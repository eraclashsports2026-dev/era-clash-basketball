# Coach action identity

`npm run calibration:coach-matrix`

## The Doc Rivers question, answered

Phase 6C1 reported "Doc Rivers ZONE_ATTACK 56.6%" and read it as his offensive
philosophy. It is not.

`ZONE_ATTACK` is an **offensive response to the opponent's shell**. Running the
same roster under twelve different coaches against the same opponent:

> `zoneAttackVsOpponentZone` is **0.536–0.574 for every single coach.**

The share is a property of the **opponent**, not of the coach whose team is
attacking. Three metrics are now reported separately and can no longer be
conflated:

| Metric | Meaning |
| --- | --- |
| `defensiveZoneUsage` | does THIS coach play a zone when defending |
| `zoneAttackShareAgainstOpponentZone` | how often this team faces a zone |
| `offensiveActionMix` | this coach's own offence, **excluding** zone attack |

The coach who actually plays the zone in the corpus is **Erik Spoelstra**, not
Doc Rivers.

## Coach identity is real

Same roster, different coaches, against a **zone-illegal era opponent** so the
identity is visible:

| Coach | Signature | Reads as |
| --- | --- | --- |
| Phil Jackson | **lowest** PICK_AND_ROLL (0.091), ISO 0.198, OFF_BALL_SCREEN 0.152, HANDOFF 0.142 | the triangle, which avoids the pick-and-roll |
| Mike D'Antoni | **highest** PICK_AND_ROLL (0.230), TRANSITION 0.162 | seven seconds or less |
| Steve Kerr | **highest** OFF_BALL_SCREEN (0.172), CUT 0.120 | movement offence |
| Chuck Daly | ISO 0.201, PICK_AND_ROLL 0.175 | physical half-court |
| Gregg Popovich | PICK_AND_ROLL 0.190, OFF_BALL_SCREEN 0.143 | balanced motion |

Spread across coaches: PICK_AND_ROLL **0.139**, ISOLATION 0.091,
OFF_BALL_SCREEN 0.088, HANDOFF 0.055.

## Coach identity is erased by a zone-heavy opponent

Against the zone-playing opponent, the same comparison collapses:

| Family | Spread vs non-zone opponent | Spread vs 55%-zone opponent |
| --- | --- | --- |
| PICK_AND_ROLL | 0.139 | — (crowded out) |
| POST_UP | 0.008 | 0.008 |
| SPOT_UP | 0.013 | 0.005 |
| GENERIC_HALF_COURT | 0.010 | 0.006 |
| TRANSITION | 0.041 | 0.065 |

With 55% of possessions resolving as `ZONE_ATTACK`, only 45% remain for the
coach's own identity, and every non-zone family compresses proportionally.

**This is a zone-frequency problem, not a coach-identity problem.** Real NBA
zone usage is a low single-digit percentage of possessions. The correct fix is
to the shell-selection frequency, and it is recorded in the priority register
rather than applied here — lowering a coach's weights to compensate would treat
the symptom.

## Roster sensitivity

Same coach, different rosters: POST_UP range **0.149**, PICK_AND_ROLL 0.140,
HANDOFF 0.101, OFF_BALL_SCREEN 0.097. The action mix follows the roster, which
is the required behaviour — a coach cannot run a post offence without a post
player.

## The Bill Sharman generic-fallback finding

Phase 6C1 reported Sharman at 37.4% `GENERIC_HALF_COURT`. After the opportunity
allocation and shooting-vocabulary corrections, generic sits at **0.065–0.071**
across all twelve coaches — a range of 0.006.

No coach mapping was changed. The earlier figure was a symptom of the shot
distribution, not of a missing coach mapping, and the honest conclusion is that
**no Sharman-specific correction was warranted**. His documented system
(fast break, early offence, structured half-court) is now expressed through
TRANSITION 0.171 rather than falling through to the generic remainder.
