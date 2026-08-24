// ── Historical backtest teams (researched 2026-08-23) ──────────────────────────
// Real five-man units built from the EraClash player pool, run in their NATIVE
// era to test whether the engine understands known basketball. calibration =
// teams formulas may be tuned against; holdout = NEVER tuned against, used to
// measure generalization (EraClash Labs standard practice).
export default {
  "teams": [
    {
      "label": "1972 Los Angeles Lakers",
      "season": "1971-72",
      "eraId": "1970s",
      "coachId": "bill-sharman",
      "lineup": [
        "jerry-60s",
        "gail-70s",
        "bobby-70s",
        "paul-s-70s",
        "wilt-70s"
      ],
      "usageOrder": [
        "gail-70s",
        "jerry-60s",
        "bobby-70s",
        "paul-s-70s",
        "wilt-70s"
      ],
      "fidelity": "Real starters used: Wilt Chamberlain (wilt-70s, correct-decade card), Jerry West (jerry-60s — only version in pool, adjacent-decade 60s card used for a 1972 season), Gail Goodrich (gail-70s, correct-decade card). Pool substitutions: Bobby Dandridge (bobby-70s) stands in for SF Jim McMillian — a smooth, efficient mid-range wing scorer in the same mid-usage role; Paul Silas (paul-s-70s) stands in for PF Happy Hairston — a near-perfect stylistic match as a low-usage, elite-rebounding, defense-first power forward. Elgin Baylor retired 9 games into this season, so the post-streak starting five is the canonical unit.",
      "identity": {
        "paceRel": "well-above-league",
        "threeRel": "era-no-threes",
        "offEffRel": "elite",
        "defEffRel": "elite",
        "rebIdentity": "Dominant defensive rebounding team — Wilt led the league on the glass (~19 rpg) and Hairston added 13+, the first teammate pair with 1,000+ rebounds each, and their board-cleaning ignited the fast break.",
        "styleTags": [
          "transition",
          "fast-break",
          "guard-driven-scoring",
          "defensive-rebounding",
          "rim-protection",
          "conditioning-pressure"
        ]
      },
      "notes": "69-13 with the 33-game win streak; led the NBA in scoring (~121 ppg) and point differential (+12.3). Sharman's system: sprint the break off Wilt's outlet, with West and Goodrich (both ~26 ppg) as the engines while Wilt played a low-usage, defense/rebounding anchor role (led league in FG%). Offensive rating #1 and defensive rating top-2 that season — both honestly called elite. Pace was among the very fastest in the league; exact pace rank has some uncertainty but they were clearly a top-tier tempo team even by early-70s standards.",
      "set": "calibration"
    },
    {
      "label": "1986 Boston Celtics",
      "season": "1985-86",
      "eraId": "1980s",
      "coachId": "kc-jones",
      "lineup": [
        "dj-80s",
        "danny-80s",
        "bird-80s",
        "mcHale-80s",
        "parish-80s"
      ],
      "usageOrder": [
        "bird-80s",
        "mcHale-80s",
        "parish-80s",
        "dj-80s",
        "danny-80s"
      ],
      "fidelity": "Perfect fidelity: all five real starters are in the pool with correct-decade cards — Dennis Johnson (dj-80s), Danny Ainge (danny-80s), Larry Bird (bird-80s), Kevin McHale (mcHale-80s), Robert Parish (parish-80s). The one missing piece of the real rotation is sixth man Bill Walton (walton-80s exists in the pool but a five-man unit has no bench slot), so this unit slightly understates their real frontcourt depth.",
      "identity": {
        "paceRel": "league-average",
        "threeRel": "above-league",
        "offEffRel": "elite",
        "defEffRel": "elite",
        "rebIdentity": "Elite defensive rebounding built on a huge frontline — Parish, McHale, and Bird (plus Walton off the bench) made them one of the best defensive-glass teams in the league.",
        "styleTags": [
          "half-court-execution",
          "post-centric",
          "ball-movement",
          "midrange",
          "frontcourt-depth",
          "team-defense"
        ]
      },
      "notes": "67-15, 40-1 at home; arguably the greatest single-season team of the decade. #1 in both offensive and defensive rating in 1985-86. Played at roughly league-average tempo but killed teams in the half court through Bird's shot creation/passing and McHale's unguardable post game. Above-average three-point volume for the era, driven almost entirely by Bird, who led the league in makes — the rest of the lineup rarely shot them, so the tag reflects Bird more than a team-wide scheme. Bird (MVP) was the clear usage leader, McHale second; Parish and DJ were comparable mid-tier options (Parish slightly higher usage per possession), Ainge the low-usage spacer/connector.",
      "set": "calibration"
    },
    {
      "label": "1983 Philadelphia 76ers",
      "season": "1982-83",
      "eraId": "1980s",
      "coachId": "billy-cunningham",
      "lineup": [
        "mo-80s",
        "toney-80s",
        "julius-80s",
        "nance-80s",
        "moses-80s"
      ],
      "usageOrder": [
        "moses-80s",
        "toney-80s",
        "julius-80s",
        "mo-80s",
        "nance-80s"
      ],
      "identity": {
        "paceRel": "league-average",
        "threeRel": "below-league",
        "offEffRel": "elite",
        "defEffRel": "elite",
        "rebIdentity": "The league's dominant offensive-rebounding team — Moses Malone led the NBA in offensive boards and second-chance points were the engine of their halfcourt offense.",
        "styleTags": [
          "post-centric",
          "offensive-rebounding",
          "transition",
          "pressure-defense",
          "midrange-iso",
          "low-three-volume"
        ]
      },
      "fidelity": "Four of five slots are the real top-minutes starters on decade-correct 1980s cards: Maurice Cheeks (PG), Andrew Toney (SG), Julius Erving (SF), Moses Malone (C). The forward slot's real occupants — nominal starter Marc Iavaroni and top-minutes sixth man Bobby Jones (that year's Sixth Man of the Year, effectively the closing four) — are both absent from the pool; Larry Nance (80s) is substituted as the closest stylistic analog to Jones: an athletic, shot-blocking, low-usage, high-efficiency defensive forward.",
      "notes": "The 65-17 'Fo, Fo, Fo' champions. Elite on both ends: roughly +3.5 ORtg vs league (top-2 offense) and a top-2 defense anchored by Moses, Bobby Jones and Cheeks's ball pressure. Pace was near league average (approximately 102 vs league ~103 possessions). Three-point volume was minimal even by 1983 standards — the line was a non-factor in their offense; modest uncertainty on their exact 3PA rank but they were clearly at or below the (already tiny) league norm. Usage order: Moses (volume scoring plus heavy FT/putback load) and Toney (high-usage shot creator per minute) sit at the top, with Erving just behind, Cheeks a pure low-usage floor general.",
      "set": "holdout"
    },
    {
      "label": "2008 Boston Celtics",
      "season": "2007-08",
      "eraId": "2000s",
      "coachId": "doc-rivers",
      "lineup": [
        "rondo-10s",
        "ray-00s",
        "pierce-00s",
        "kg-00s",
        "ben-00s"
      ],
      "usageOrder": [
        "pierce-00s",
        "kg-00s",
        "ray-00s",
        "rondo-10s",
        "ben-00s"
      ],
      "identity": {
        "paceRel": "below-league",
        "threeRel": "league-average",
        "offEffRel": "above-league",
        "defEffRel": "elite",
        "rebIdentity": "A top-tier defensive-rebounding team anchored by Garnett — they ended possessions on the defensive glass but largely conceded offensive boards to get back in transition defense.",
        "styleTags": [
          "defense-first",
          "halfcourt",
          "ball-movement",
          "post-and-midrange",
          "help-rotations",
          "three-point-accuracy"
        ]
      },
      "fidelity": "Four of five slots are the real starters: Ray Allen, Paul Pierce and Kevin Garnett on decade-correct 2000s cards; Rajon Rondo (the real starting PG) uses his only pool version, a 2010s card, as an adjacent-decade substitution for the 2007-08 season. Starting center Kendrick Perkins is absent from the pool; Ben Wallace (00s) is substituted as the closest stylistic analog — a near-zero-usage, physical, defense-and-screens center (Wallace's card is stronger than Perkins was, which slightly overstates the fifth slot).",
      "notes": "The 66-16 champions built on a historically great defense — Thibodeau's strong-side overload scheme with KG quarterbacking produced the league's best DRtg by a wide margin (~99 vs league ~107.5), clearly elite. Offense was comfortably above league average (ORtg ~110 vs ~107.5, roughly top-5) despite a deliberate below-league pace (~91 vs ~92.4). Three-point volume was around league average, but they led the NBA in 3P% (~.381) behind Allen and House — accuracy over volume. Real usage hierarchy per basketball-reference-style data: Pierce (~26%), Garnett (~25%), Allen (~22%), Rondo (~17%), Perkins (~15%).",
      "set": "holdout"
    },
    {
      "label": "2017 Golden State Warriors",
      "season": "2016-17",
      "eraId": "2010s",
      "coachId": "steve-kerr",
      "lineup": [
        "curry-10s",
        "klay-10s",
        "durant-10s",
        "draymond-10s",
        "gobert-10s"
      ],
      "usageOrder": [
        "curry-10s",
        "durant-10s",
        "klay-10s",
        "draymond-10s",
        "gobert-10s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "above-league",
        "offEffRel": "elite",
        "defEffRel": "elite",
        "rebIdentity": "Deliberately punted the offensive glass to prioritize transition defense; solid committee defensive rebounding led by Draymond Green rather than a dominant board center.",
        "styleTags": [
          "pace-and-space",
          "motion",
          "off-ball-screening",
          "transition",
          "switch-defense",
          "ball-movement"
        ]
      },
      "fidelity": "Curry (PG), Klay Thompson (SG), Durant (SF), and Draymond Green (PF) are the real 2016-17 starters on native 2010s cards. Starting center Zaza Pachulia is not in the pool; Rudy Gobert (2010s) substitutes as the closest low-usage screen-set-and-defend center, though he significantly upgrades the rim protection over Pachulia. Key sixth man Andre Iguodala is also unavailable in the pool.",
      "notes": "67-15, 16-1 playoff run, No. 1 ORtg (about 115.6) and No. 2 DRtg; 4th in pace (about 99.8 vs league about 96.4). 3PA volume was clearly above league average (about 31 per game vs about 27) but well behind Houston, while 3P% led the league. Usage order is solid: Curry (about 30%) edged Durant (about 27.8%), then Klay (about 26%), Draymond (about 16%), with the center slot a sub-15% screener role. Main honesty caveat: Gobert in the Pachulia slot makes this five better defensively at center than the real team was.",
      "set": "calibration"
    },
    {
      "label": "1977 Portland Trail Blazers",
      "season": "1976-77",
      "eraId": "1970s",
      "coachId": "jack-ramsay",
      "lineup": [
        "don-b-70s",
        "randy-70s",
        "bobby-70s",
        "lucas-m-70s",
        "walton-80s"
      ],
      "usageOrder": [
        "lucas-m-70s",
        "walton-80s",
        "randy-70s",
        "bobby-70s",
        "don-b-70s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "era-no-threes",
        "offEffRel": "above-league",
        "defEffRel": "elite",
        "rebIdentity": "Dominant on both backboards — Walton led the NBA in rebounding (14.4 rpg) and triggered the break with outlet passes, while Maurice Lucas controlled the power glass.",
        "styleTags": [
          "transition",
          "outlet-fast-break",
          "motion",
          "high-post-hub",
          "team-defense",
          "rebounding"
        ]
      },
      "fidelity": "Bill Walton (C) and Maurice Lucas (PF) are real 1976-77 starters. Walton uses his only pool card, a 1980s version (his Celtics sixth-man era) standing in for his 1977 near-MVP self — an adjacent-decade substitution that likely underrates him. The other three real starters are missing from the pool: Bobby Dandridge subs for Bob Gross (efficient, two-way, off-ball-moving SF, though higher usage than Gross), Randy Smith subs for Lionel Hollins (quick, athletic, transition-oriented guard), and Don Buse subs for Dave Twardzik (low-usage, defense-first, high-efficiency complementary PG).",
      "notes": "The 1977 champions ran Ramsay's motion offense through Walton's high-post passing and pushed tempo off his outlets; the NBA had no three-point line until 1979-80. Best point differential in the league that season; defense was top-2 to top-3 and offense roughly top-5 — I am confident in the directional ranks but less so in exact ORtg/DRtg placement. Pace was above league average though not the league's fastest; some sources put them closer to mid-pack, so treat paceRel with mild uncertainty. Real usage order: Lucas was the leading scorer (20.2 ppg), Walton next (18.6 on high efficiency), then Hollins (14.7), Gross (11.4), Twardzik (10.3) — mapped onto the substitutes accordingly.",
      "set": "holdout"
    },
    {
      "label": "1996 Chicago Bulls",
      "season": "1995-96",
      "eraId": "1990s",
      "coachId": "phil-jackson",
      "lineup": [
        "kukoc-90s",
        "jordan-90s",
        "pippen-90s",
        "rodman-90s",
        "luc-90s"
      ],
      "usageOrder": [
        "jordan-90s",
        "pippen-90s",
        "kukoc-90s",
        "luc-90s",
        "rodman-90s"
      ],
      "identity": {
        "paceRel": "league-average",
        "threeRel": "above-league",
        "offEffRel": "elite",
        "defEffRel": "elite",
        "rebIdentity": "Led the NBA in rebound differential behind Dennis Rodman's historic offensive rebounding (league-best ORB%), making second chances a genuine weapon despite a modest-sized frontcourt.",
        "styleTags": [
          "triangle-offense",
          "pressure-defense",
          "offensive-rebounding",
          "mid-range",
          "transition-off-turnovers",
          "low-turnover"
        ]
      },
      "fidelity": "Jordan, Pippen, Rodman, and Longley are all real 1995-96 starters on native 1990s cards. Ron Harper (starting PG, very low-usage defender) is not in the pool; the fifth slot goes to real Bull Toni Kukoc (kukoc-90s), the Sixth Man of the Year who actually played more minutes than Harper (26.3 vs 23.6 mpg), so this is five of the team's top six in minutes. Tradeoff: the unit is bigger and more offense-tilted than the actual opening five, with Jordan/Pippen absorbing Harper's ballhandling as they did in the real triangle.",
      "notes": "72-10, best regular-season record of the decade. No. 1 in both offensive rating (115.2 vs league 107.6) and defensive rating (101.8), plus a league-best 40.3% from the shortened three-point line with slightly above-average attempt volume. Pace (91.1) was a hair under league average (91.8) — effectively average, and I've coded it as such. Kukoc's usage (~23%) was just behind Pippen's (~25%); Rodman's was a tiny ~11%. High confidence in all of this; the only judgment call is Kukoc-over-a-Harper-proxy, which trades positional shape for roster authenticity.",
      "set": "calibration"
    },
    {
      "label": "2001 Los Angeles Lakers",
      "season": "2000-01",
      "eraId": "2000s",
      "coachId": "phil-jackson",
      "lineup": [
        "bibby-00s",
        "kobe-00s",
        "bowen-2ks",
        "horace-90s",
        "shaq-00s"
      ],
      "usageOrder": [
        "shaq-00s",
        "kobe-00s",
        "bibby-00s",
        "bowen-2ks",
        "horace-90s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "league-average",
        "offEffRel": "elite",
        "defEffRel": "below-league",
        "rebIdentity": "Strong defensive rebounding anchored by Shaq and Horace Grant, but middling on the offensive glass — they controlled their own board rather than crashing.",
        "styleTags": [
          "triangle-offense",
          "post-centric",
          "inside-out",
          "star-iso",
          "defensive-glass"
        ]
      },
      "fidelity": "Shaq and Kobe are real starters on native 2000s cards. Horace Grant (real starting PF that season) uses his adjacent-decade 1990s card — the only version in the pool. Derek Fisher (who split PG starts with Ron Harper; neither is in the pool) is subbed with Mike Bibby, the closest spot-up-shooting PG built to play off a dominant offensive hub, though Bibby's real usage was higher than Fisher's. Rick Fox is subbed with Bruce Bowen, a near-exact stylistic match as a low-usage 3-and-D corner wing.",
      "notes": "56-26 regular season, then a legendary 15-1 playoff run. Offense was elite (ORtg ~108.4, 2nd in the league vs ~103.0 average), running through Shaq in the post with Kobe's mid-post/iso game as the counter. Regular-season defense was genuinely below league average (DRtg ~104.8, ranked around 20th) — the famous defensive dominance only materialized in the playoffs, so defEffRel reflects the honest regular-season mark. Pace (~93) was moderately above the league's ~91.3. Usage caveat: Kobe's and Shaq's usage rates were essentially identical (~31.5%); I list Shaq first as the structural hub of the triangle, but a Kobe-first ordering is equally defensible from the raw numbers.",
      "set": "calibration"
    },
    {
      "label": "1964-65 Boston Celtics",
      "season": "1964-65",
      "eraId": "1960s",
      "coachId": "red-auerbach",
      "lineup": [
        "larry-s-60s",
        "sam-60s",
        "john-h-60s",
        "tom-s-60s",
        "bill-60s"
      ],
      "usageOrder": [
        "sam-60s",
        "john-h-60s",
        "tom-s-60s",
        "bill-60s",
        "larry-s-60s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "era-no-threes",
        "offEffRel": "below-league",
        "defEffRel": "elite",
        "rebIdentity": "Dominated the glass — Russell led the NBA in rebounding and Boston led the league in team rebounds, fueling the outlet-pass fast break.",
        "styleTags": [
          "transition",
          "fast-break",
          "defense-first",
          "shot-blocking",
          "ball-movement",
          "deep-bench"
        ]
      },
      "fidelity": "Four of five are real 1964-65 Celtics: Russell (C), Sam Jones (SG), Sanders (PF), and Havlicek (SF) — Havlicek was nominally the sixth man but was a top-five-minutes wing and clearly ahead of the aging Tom Heinsohn (also in pool) in the rotation. Starting PG K.C. Jones is NOT in the pool; the slot goes to Larry Siegfried, an actual 1964-65 Celtics reserve guard — chosen over non-Celtics because he was genuinely on this roster, though he was more of a shooter than K.C.'s pressure-defense, near-zero-usage style. No decade-version substitutions; all five are 1960s cards.",
      "notes": "62-18, NBA champions. Won with the league's best defense by a wide margin (Russell rim protection, Sanders and K.C. Jones on-ball) and volume offense: below-average shooting efficiency (team FG% about .401 vs league ~.426) offset by pace and offensive rebounding. Sam Jones had a career year (25.9 ppg) as the clear first option, Havlicek second. Exact pace estimates for 1965 are approximate on basketball-reference; confidence is high that Boston was faster than league average but not the fastest team outright.",
      "set": "calibration"
    },
    {
      "label": "1972-73 New York Knicks",
      "season": "1972-73",
      "eraId": "1970s",
      "coachId": "red-holzman",
      "lineup": [
        "walt-70s",
        "monroe-70s",
        "bobby-70s",
        "dave-d-60s",
        "willis-60s"
      ],
      "usageOrder": [
        "walt-70s",
        "monroe-70s",
        "dave-d-60s",
        "bobby-70s",
        "willis-60s"
      ],
      "identity": {
        "paceRel": "well-below-league",
        "threeRel": "era-no-threes",
        "offEffRel": "above-league",
        "defEffRel": "elite",
        "rebIdentity": "A below-average rebounding team — undersized up front, DeBusschere carried the glass; they conceded boards and compensated with positioning and team defense.",
        "styleTags": [
          "motion",
          "ball-movement",
          "half-court",
          "team-defense",
          "mid-range",
          "hit-the-open-man"
        ]
      },
      "fidelity": "Chose 1973 over 1970 because the pool supports it far better: 1970 is missing both Dick Barnett and Bill Bradley, while 1973 has four of five real starters — Frazier, Monroe, DeBusschere, and Reed. Bill Bradley is NOT in the pool; Bobby Dandridge substitutes at SF as the closest stylistic match — a constantly moving, catch-and-shoot mid-range forward who plays within a motion offense. Decade-version substitutions: DeBusschere and Reed use 1960s cards (the only versions in the pool). Caveat: 1973 Reed was post-knee-injury and well below his 60s-card level, and Jerry Lucas (also in pool, jerry-l-60s) actually logged slightly more minutes at center that season — Reed is used here as the true starter and Finals MVP.",
      "notes": "57-25, NBA champions. The archetypal Holzman team: slowest-tier pace (roughly 100 possessions vs league ~106), league-best defensive rating, and an efficient, egalitarian offense built on constant movement and 'hit the open man' — five players between about 11 and 21 ppg with Frazier the lead creator and Monroe having subordinated his Baltimore iso game. Usage placement of DeBusschere vs Bradley vs Monroe is close and estimated; Monroe's per-minute usage may have edged Frazier's slightly.",
      "set": "calibration"
    },
    {
      "label": "1987 Showtime Los Angeles Lakers",
      "season": "1986-87",
      "eraId": "1980s",
      "coachId": "pat-riley",
      "lineup": [
        "magic-80s",
        "byron-80s",
        "worthy-80s",
        "buck-80s",
        "kareem-80s"
      ],
      "usageOrder": [
        "magic-80s",
        "worthy-80s",
        "kareem-80s",
        "byron-80s",
        "buck-80s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "above-league",
        "offEffRel": "elite",
        "defEffRel": "above-league",
        "rebIdentity": "A strong defensive-rebounding team that cleaned the glass to ignite the break, but only middling on the offensive boards with an aging Kareem and finesse wings.",
        "styleTags": [
          "transition",
          "early-offense",
          "post-centric",
          "lob-finishing",
          "open-court-passing"
        ]
      },
      "fidelity": "Four of five are the real 1986-87 starters on native-decade cards: Magic Johnson, Byron Scott, James Worthy, and Kareem Abdul-Jabbar (all 1980s cards). Starting PF A.C. Green is not in the pool; Buck Williams (buck-80s) substitutes as the closest stylistic match — a low-usage, rebounding/defense energy PF. No cross-decade card substitutions were needed.",
      "notes": "65-17, NBA champions, Magic's MVP year. Clearly the No. 1 offense in the league (ORtg ~115, best in NBA). Defense was very good — roughly top-5 in DRtg, arguably borderline elite by playoff time after the Mychal Thompson trade. Pace was above league average but not extreme; the Showtime identity came more from transition frequency and hit-ahead passing than raw possession count. Three-point volume was above the (very low) 1987 league norm, driven almost entirely by Michael Cooper and Byron Scott; treat exact 3PA rank with mild uncertainty. Usage order: Magic clearly first; Worthy vs Kareem is close (Worthy higher scoring volume, Kareem similar per-minute usage) — I ranked Worthy second with low confidence between those two.",
      "set": "calibration"
    },
    {
      "label": "1989 Detroit Pistons Bad Boys",
      "season": "1988-89",
      "eraId": "1980s",
      "coachId": "chuck-daly",
      "lineup": [
        "isiah-80s",
        "dumars-90s",
        "mark-80s",
        "rodman-90s",
        "jack-80s"
      ],
      "usageOrder": [
        "isiah-80s",
        "mark-80s",
        "dumars-90s",
        "jack-80s",
        "rodman-90s"
      ],
      "identity": {
        "paceRel": "below-league",
        "threeRel": "below-league",
        "offEffRel": "above-league",
        "defEffRel": "elite",
        "rebIdentity": "An elite, physical rebounding team — Laimbeer owned the defensive glass while Rodman, Salley, and Mahorn generated relentless second-chance offensive boards.",
        "styleTags": [
          "pressure-defense",
          "physical-halfcourt",
          "grind-it-out",
          "iso-heavy",
          "offensive-rebounding"
        ]
      },
      "fidelity": "Isiah Thomas (1980s card) is the real starting PG. Mark Aguirre (1980s card) is the real post-trade starting SF — he started the Finals run after the midseason Adrian Dantley trade (dantley-80s exists in the pool if the first-half version is preferred). Joe Dumars is a real starter used via his 1990s card, the only Dumars version in the pool. Starting PF Rick Mahorn is not in the pool; Dennis Rodman — a real 1989 Piston and the team's top reserve forward — fills the PF slot via his 1990s card (both a real-member promotion and a cross-decade card substitution). Starting C Bill Laimbeer is not in the pool; Jack Sikma (jack-80s) substitutes as the closest stylistic match — a physical, elite-rebounding center with a genuine perimeter jumper.",
      "notes": "63-19, NBA champions, swept the Lakers in the Finals. Defense was the identity: roughly top-3 in DRtg with hard fouls, no easy layups, and the Jordan Rules. Offense was efficient but deliberate — above league average ORtg (roughly top-6-8) built on Isiah/Dumars/Vinnie guard scoring and second-chance points, at a below-average pace. Three-point volume was modest, below the 1989 league norm (mostly Laimbeer and Isiah); exact rank uncertain. Usage caveat: Aguirre's Pistons usage (~22-23%) slightly edged Dumars; the 1990s Rodman card overstates the 1989 version's rebounding gravity but matches his near-zero offensive usage and elite defense. Sikma-as-Laimbeer slightly boosts scoring polish but preserves the stretch-big, glass-dominant, hard-nosed profile.",
      "set": "calibration"
    },
    {
      "label": "2011 Dallas Mavericks",
      "season": "2010-11",
      "eraId": "2010s",
      "coachId": "rick-carlisle",
      "lineup": [
        "kidd-00s",
        "beal-10s",
        "marion-00s",
        "dirk-10s",
        "dj-10s"
      ],
      "usageOrder": [
        "dirk-10s",
        "beal-10s",
        "marion-00s",
        "kidd-00s",
        "dj-10s"
      ],
      "identity": {
        "paceRel": "below-league",
        "threeRel": "above-league",
        "offEffRel": "above-league",
        "defEffRel": "above-league",
        "rebIdentity": "Weak offensive-rebounding team by design (retreated in transition defense) that leaned almost entirely on Tyson Chandler to hold the defensive glass; roughly league-average overall board team.",
        "styleTags": [
          "pick-and-pop",
          "halfcourt-execution",
          "ball-movement",
          "zone-defense",
          "late-clock-dirk-iso",
          "veteran-spacing"
        ]
      },
      "fidelity": "Real members: Dirk Nowitzki (dirk-10s, native card), Jason Kidd (kidd-00s, adjacent-decade 2000s card for the 37-year-old 2011 Kidd — the only usable version; note the 00s card plays younger/higher-usage than 2011 Kidd, who was a spot-up shooter and organizer by then) and Shawn Marion (marion-00s, adjacent-decade card; 2011 Marion was a lower-usage defensive wing than his Suns-era card). Substitutions: Tyson Chandler is not in the pool — DeAndre Jordan (dj-10s) is the closest stylistic match (lob-catching rim-runner, zero-usage offense, defensive anchor and rebounder). The SG slot (nominal starter DeShawn Stevenson / top-minutes sixth man Jason Terry) has no pool version — Bradley Beal (beal-10s) substitutes for Terry as a high-volume three-point-shooting secondary scoring guard; Beal is bigger and higher-usage than Terry.",
      "notes": "Title team built on Carlisle's flow offense: Dirk pick-and-pop and one-legged-fade isolations, Kidd orchestrating, heavy corner-three generation, and situational zone defense. Regular season ORtg and DRtg both top-10 (roughly 8th on each side per basketball-reference); pace slightly below the league norm (~91 vs ~92). Three-point volume and accuracy were both above average (~36.5% as a team) and rose further in the playoffs. Two of the five slots are substitutions, so treat perimeter defense (Stevenson's real role) as slightly overstated by this unit's talent.",
      "set": "holdout"
    },
    {
      "label": "2014 San Antonio Spurs",
      "season": "2013-14",
      "eraId": "2010s",
      "coachId": "gregg-popovich",
      "lineup": [
        "parker-00s",
        "manu-00s",
        "kawhi-10s",
        "duncan-00s",
        "gobert-10s"
      ],
      "usageOrder": [
        "parker-00s",
        "manu-00s",
        "duncan-00s",
        "kawhi-10s",
        "gobert-10s"
      ],
      "identity": {
        "paceRel": "above-league",
        "threeRel": "league-average",
        "offEffRel": "above-league",
        "defEffRel": "elite",
        "rebIdentity": "Deliberately conceded offensive rebounds to protect transition defense; solid but unspectacular defensive-glass team anchored by Duncan and Splitter.",
        "styleTags": [
          "motion",
          "ball-movement",
          "drive-and-kick",
          "corner-threes",
          "pace-and-space",
          "deep-bench"
        ]
      },
      "fidelity": "Real members in four of five slots: Tony Parker (parker-00s, adjacent-decade card — only version; plays close to 2014 Parker's PnR-heavy game), Manu Ginobili (manu-00s, adjacent-decade card; Manu was the sixth man in 2014 but a top-five usage/closing player, chosen over a substitute for nominal starter Danny Green, who is absent from the pool — note the 00s Manu card is his higher-minute peak version), Kawhi Leonard (kawhi-10s, native decade, though this card likely reflects peak Kawhi rather than the lower-usage 2014 version), Tim Duncan (duncan-00s, adjacent-decade card — only version; plays younger and higher-usage than 38-year-old 2014 Duncan). Substitution: Tiago Splitter is not in the pool — Rudy Gobert (gobert-10s) is the closest archetype (low-usage PnR dive man, interior defender), though clearly a better player than Splitter.",
      "notes": "62-win 'beautiful game' champion: league-best point differential, No. 1 in 3P% (~39.7%) on roughly league-average attempt volume, top-7 offensive efficiency (110+ ORtg) and top-4 defense (~102 DRtg), pace a touch above league average (~95 vs ~94). Uncertainty flags: this five-man unit is meaningfully stronger than the real 2014 starting unit because three adjacent-decade cards (Parker, Manu, Duncan) capture peak versions, the Kawhi card overstates 2014 Kawhi's usage, and Gobert upgrades Splitter; the real team's edge was depth (nobody over 29.4 mpg), which a five-man sim cannot capture.",
      "set": "holdout"
    }
  ]
};
