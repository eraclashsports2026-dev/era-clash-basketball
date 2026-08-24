// ── Coach career phases (researched 2026-08-23) ────────────────────────────────
// A coach may adapt IN-GAME only with tactics their career actually
// demonstrated (the toolkit). Multi-phase coaches earned wider toolkits by
// running genuinely different systems across periods — Riley Showtime→Knicks
// grind, Nelson Bucks defense→Nellie-ball. This file NEVER produces a rating:
// it gates and informs adaptation. One consumer coach card per coach, always.
export default {
  "coaches": [
    {
      "id": "jack-ramsay",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1968-1988",
          "teams": "Philadelphia 76ers, Buffalo Braves, Portland Trail Blazers, Indiana Pacers",
          "system": "Consistent identity throughout: up-tempo fast-break basketball, a structured motion offense with constant cutting and passing, and aggressive pressure man-to-man defense carried over from his famous St. Joseph's college press. The signature 1976-77 champion Blazers ran the half-court offense through Bill Walton as a high-post passing hub with backdoor cuts; Buffalo (McAdoo) and his other stops ran the same running/pressure philosophy with different personnel.",
          "innovations": "Brought collegiate full-court press concepts to the NBA; center-as-passing-hub motion offense with Walton's 1977 Blazers; codified his philosophy in 'The Coach's Art'"
        }
      ],
      "toolkit": [
        "fast-break",
        "motion-offense",
        "full-court-press",
        "high-post-hub",
        "backdoor-cuts",
        "pressure-man-defense",
        "up-tempo-pace"
      ],
      "sources": [
        "Jack Ramsay, 'The Coach's Art' (1978)",
        "Basketball-Reference coach/team pages",
        "1977 Trail Blazers championship histories (e.g. David Halberstam, 'The Breaks of the Game')"
      ]
    },
    {
      "id": "kc-jones",
      "multiPhase": false,
      "confidence": "MEDIUM",
      "phases": [
        {
          "period": "1973-1992",
          "teams": "Capital/Washington Bullets, Boston Celtics, Seattle SuperSonics",
          "system": "One consistent approach: defense-first man-to-man rooted in his Russell-era Celtics pedigree, paired with a half-court offense that played through elite post/frontcourt scorers (Elvin Hayes in Washington; Bird, McHale, Parish in Boston) and ran early-offense fast breaks off stops. Known as a delegating players' coach with simple rotations rather than a scheme innovator; the identity did not meaningfully change between stops.",
          "innovations": "Player-empowerment management style; maximized the 1984-86 Celtics frontcourt post attack"
        }
      ],
      "toolkit": [
        "man-to-man-defense",
        "post-up-offense",
        "fast-break",
        "half-court-execution",
        "ball-movement"
      ],
      "sources": [
        "Basketball-Reference coach pages",
        "Boston Celtics 1984/1986 championship histories",
        "Peter May, 'The Last Banner'"
      ]
    },
    {
      "id": "chuck-daly",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1983-1986",
          "teams": "Detroit Pistons",
          "system": "Up-tempo, high-scoring offense pushed by Isiah Thomas — the 1983-84 Pistons led the NBA in scoring (117.1 ppg) — built on early offense and the Thomas-Laimbeer pick-and-roll; defense was middling.",
          "innovations": ""
        },
        {
          "period": "1986-1992",
          "teams": "Detroit Pistons (Bad Boys)",
          "system": "Deliberate pace and a physical, foul-heavy man-to-man defense as the team identity ('no layups'), with a deep 9-10 man rotation and grinding half-court execution offense; back-to-back titles in 1989-90.",
          "innovations": "The 'Jordan Rules' — a rotating, physical, funnel-and-double scheme aimed at one star scorer; normalized deep-bench specialist rotations"
        },
        {
          "period": "1992-1999",
          "teams": "New Jersey Nets, Orlando Magic",
          "system": "Veteran-oriented, defense-and-execution half-court basketball adapted to the roster; made the playoffs at both stops without a signature scheme."
        }
      ],
      "toolkit": [
        "fast-break",
        "pick-and-roll",
        "physical-man-defense",
        "star-doubling (Jordan Rules)",
        "no-layups hard fouls",
        "deep-bench-rotation",
        "slow-pace half-court-execution"
      ],
      "sources": [
        "Basketball-Reference Pistons season pages (1983-84 scoring lead; 1988-90 defensive rankings)",
        "Sam Smith, 'The Jordan Rules'",
        "'Bad Boys' (ESPN 30 for 30)"
      ]
    },
    {
      "id": "don-nelson",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1976-1987",
          "teams": "Milwaukee Bucks",
          "system": "Defense-first, disciplined division-winning teams that ranked among the league's best defenses behind Sidney Moncrief, with a matchup-driven, unselfish offense — the opposite of his later reputation.",
          "innovations": "Invented the 'point forward' role with Paul Pressey; early master of matchup-based substitution"
        },
        {
          "period": "1988-1996",
          "teams": "Golden State Warriors, New York Knicks",
          "system": "'Run TMC' era: up-tempo, small-ball, three-point-launching offense that traded size for speed and shooting and hunted mismatches every possession; defense openly sacrificed.",
          "innovations": "Stationed 7'7\" Manute Bol behind the arc as a stretch center; extreme small lineups years ahead of the league"
        },
        {
          "period": "1997-2010",
          "teams": "Dallas Mavericks, Golden State Warriors",
          "system": "Mature 'Nellie-ball': positionless, top-of-league pace, spread high-scoring offense with Dirk Nowitzki developed as a stretch big in Dallas, then the fastest-pace 'We Believe' small-ball Warriors whose switch-and-run lineups upset the 67-win Mavericks in 2007.",
          "innovations": "'Hack-a-Shaq' intentional-foul strategy (Dallas, 1997); stretch-4/5 usage with Nowitzki; blueprint for modern positionless small-ball"
        }
      ],
      "toolkit": [
        "small-ball",
        "point-forward",
        "mismatch-hunting",
        "run-and-gun-pace",
        "three-point-volume",
        "stretch-big",
        "hack-a-shaq intentional fouling",
        "junk/gimmick-defenses",
        "man-to-man-defense (Bucks era)",
        "switch-heavy small lineups"
      ],
      "sources": [
        "Basketball-Reference coach/team pages (Bucks defensive rankings; 2007 Warriors pace)",
        "Run TMC / 'We Believe' Warriors histories",
        "Contemporary coverage of the 1997 Hack-a-Shaq debut vs. Chicago"
      ]
    },
    {
      "id": "jerry-sloan",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1979-2011",
          "teams": "Chicago Bulls, Utah Jazz",
          "system": "One system essentially throughout, especially across 23 Jazz seasons: a flex/UCLA-cut half-court offense built on the Stockton-Malone pick-and-roll, relentless legal (and illegal) screening, precise cutting, low turnovers and deliberate pace, paired with hard-nosed physical man-to-man defense. He ran the identical framework post-Stockton/Malone with Deron Williams and Carlos Boozer.",
          "innovations": "Refined the pick-and-roll into the most durable single offensive identity of the era; institutionalized the flex series in the NBA"
        }
      ],
      "toolkit": [
        "pick-and-roll",
        "flex-offense",
        "UCLA-cuts",
        "off-ball-screening",
        "man-to-man-defense",
        "physical hard fouls",
        "slow-pace half-court-execution"
      ],
      "sources": [
        "Basketball-Reference Jazz season pages",
        "Utah Jazz Stockton-Malone era histories",
        "NBA coaching profiles on Sloan's flex/PnR system continuity"
      ]
    },
    {
      "id": "phil-jackson",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1989-2011",
          "teams": "Chicago Bulls, Los Angeles Lakers",
          "system": "The triangle (triple-post) offense in every season he was a head coach — a read-and-react system of ball and player movement out of a sideline triangle, installed with Tex Winter. The core system never changed; only its hub did (perimeter-oriented through Jordan/Pippen in Chicago, post-centric through Shaq then Kobe/Gasol in LA). Defensively: aggressive 'Doberman' perimeter trapping and pressure with Jordan/Pippen/Harper in Chicago, and a more conservative Shaq-anchored interior scheme in LA — an adaptation within one identity, not a new system.",
          "innovations": "With Winter, proved a full-equal-opportunity read offense could win 11 titles around superstars; pioneered mindfulness/psychological star management"
        }
      ],
      "toolkit": [
        "triangle-offense",
        "post-hub-offense",
        "trapping-pressure-defense",
        "situational full-court-press",
        "late-game star isolation",
        "slow-the-game half-court-execution"
      ],
      "sources": [
        "Phil Jackson, 'Eleven Rings' and 'Sacred Hoops'",
        "Tex Winter, 'The Triple-Post Offense'",
        "Basketball-Reference Bulls/Lakers season pages"
      ]
    },
    {
      "id": "larry-brown",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1972-1979 (ABA/early Denver)",
          "teams": "Carolina Cougars, Denver Nuggets",
          "system": "Up-tempo, pressing, high-scoring ABA basketball — his Denver teams led the league in scoring — with trapping full-court defense fueling a constant fast break.",
          "innovations": "One of the ABA's defining press-and-run stylists"
        },
        {
          "period": "1981-1997",
          "teams": "New Jersey Nets, San Antonio Spurs, LA Clippers, Indiana Pacers",
          "system": "'Play the right way' template: Dean Smith-tree passing-game motion offense with a secondary break, defense-first man-to-man, adapted around David Robinson's transition/post game in San Antonio and Rik Smits' half-court post play in Indiana.",
          "innovations": "Carried the North Carolina passing-game/secondary-break package into the NBA"
        },
        {
          "period": "1997-2003",
          "teams": "Philadelphia 76ers",
          "system": "Elite, scrambling, help-heavy defense at a bottom-of-the-league pace with the offense stripped down to Allen Iverson isolation and handoff creation surrounded by defensive specialists — a documented departure from his motion principles that reached the 2001 Finals.",
          "innovations": "Won 56 games and a Finals berth with a one-creator offense built entirely on defense"
        },
        {
          "period": "2003-2010",
          "teams": "Detroit Pistons, New York Knicks, Charlotte Bobcats",
          "system": "Championship-level team defense (the 2004 Pistons repeatedly held opponents under 70-80 points) with an egalitarian, execution-based half-court offense featuring no dominant scorer; the 2004 title team beat the Lakers with defense and balance.",
          "innovations": "Proved a starless, defense-first roster could win the title in the modern era"
        }
      ],
      "toolkit": [
        "man-to-man-defense",
        "help-and-scramble-defense",
        "passing-game-motion-offense",
        "secondary-break",
        "full-court-press and traps (ABA era)",
        "star-isolation offense (Iverson era)",
        "post-up-offense",
        "slow-pace-control",
        "fast-break (ABA era)"
      ],
      "sources": [
        "Terry Pluto, 'Loose Balls' (ABA era)",
        "Basketball-Reference coach/team pages (Denver scoring leads; 76ers/Pistons pace and defensive rankings)",
        "2001 76ers and 2004 Pistons season coverage"
      ]
    },
    {
      "id": "rudy-tomjanovich",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1992-2005",
          "teams": "Houston Rockets, Los Angeles Lakers",
          "system": "One consistent principle: spread the floor with three-point shooters around a primary creator and play inside-out. In the 1993-95 championship years that meant Hakeem Olajuwon post-ups with 4-out spacing and kickouts (the mid-90s Rockets led the NBA in three-point attempts); after Hakeem's decline the same spacing framework ran through Steve Francis' drive-and-kick. Defense was straightforward man-to-man anchored by a rim protector. The hub changed with personnel but the documented system did not.",
          "innovations": "Early mover on high-volume three-point spacing around a post hub — a direct precursor to modern 4-out offense; downsized around Olajuwon for the small-ball 1995 title run with Clyde Drexler"
        }
      ],
      "toolkit": [
        "post-up-hub",
        "inside-out-kickouts",
        "three-point-volume",
        "four-out-spacing",
        "drive-and-kick",
        "small-ball (1995 playoffs)",
        "man-to-man-defense with rim-protector anchor"
      ],
      "sources": [
        "Basketball-Reference Rockets season pages (mid-90s 3PA league leads)",
        "1994-95 Rockets championship histories",
        "Retrospectives on the Rockets as proto-modern spacing offense"
      ]
    },
    {
      "id": "gregg-popovich",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1996-2011",
          "teams": "San Antonio Spurs",
          "system": "Twin Towers / Duncan-centric inside-out: deliberate pace, offense funneled through Duncan (and David Robinson through 2003) post-ups, elite half-court man defense that funneled ballhandlers toward rim-protecting bigs. Titles in 1999, 2003, 2005, 2007.",
          "innovations": "Early analytics-driven corner-three emphasis (Bruce Bowen), 'ice' sideline pick-and-roll coverage, Hack-a-Shaq intentional fouling"
        },
        {
          "period": "2011-2016",
          "teams": "San Antonio Spurs",
          "system": "'Beautiful Game' motion era: after being outgunned by faster teams, Pop rebuilt the offense around 0.5-second decisions, drive-and-kick, side-to-side ball and player movement with international spacing; 2014 title featured historic Finals ball movement while keeping a top defense.",
          "innovations": "Normalized resting healthy stars (precursor to load management); motion weak/strong series widely copied"
        },
        {
          "period": "2016-2023",
          "teams": "San Antonio Spurs",
          "system": "Post-Duncan adaptation: mid-range-heavy offenses built around LaMarcus Aldridge and DeMar DeRozan that deliberately bucked league-wide three-point trends, followed by a development-focused youth rebuild culminating in the Wembanyama era.",
          "innovations": "Proved a top-10 offense could run on a mid-range-dominant shot profile in the pace-and-space era"
        }
      ],
      "toolkit": [
        "post-centric-inside-out",
        "slow-pace",
        "elite-halfcourt-man-defense",
        "ice-pnr-coverage",
        "corner-three-emphasis",
        "motion-offense",
        "drive-and-kick",
        "hack-a-shaq",
        "star-rest-load-management",
        "midrange-iso",
        "ato-play-design"
      ],
      "sources": [
        "Basketball-Reference Spurs season pages",
        "Widely documented 2014 'Beautiful Game' Finals coverage (ESPN/Grantland Zach Lowe)",
        "Documented Hack-a-Shaq and DNP-rest history"
      ]
    },
    {
      "id": "rick-adelman",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1989-1997",
          "teams": "Portland Trail Blazers, Golden State Warriors",
          "system": "Up-tempo transition attack: Clyde Drexler-led athletic wings running early offense off defensive rebounds, attacking before the defense set; two Finals appearances (1990, 1992).",
          "innovations": "One of the era's most effective rebound-and-run transition teams"
        },
        {
          "period": "1998-2006",
          "teams": "Sacramento Kings",
          "system": "The 'corner offense': Princeton-influenced high-post hub run through elite passing bigs Vlade Divac and Chris Webber — backdoor cuts, split action, dribble-handoffs, constant motion; perennial top-3 offenses and the beloved early-2000s Kings aesthetic.",
          "innovations": "Popularized the passing-big high-post hub that later influenced Kerr's Warriors and the Jokic-era Nuggets"
        },
        {
          "period": "2007-2014",
          "teams": "Houston Rockets, Minnesota Timberwolves",
          "system": "Corner-offense principles adapted to different stars: Yao Ming post-centric inside-out in Houston (including a 22-game win streak), then Kevin Love/Ricardo Rubio elbow-hub and high-low action in Minnesota.",
          "innovations": "Demonstrated the corner offense's portability across radically different rosters"
        }
      ],
      "toolkit": [
        "transition-offense",
        "early-offense",
        "high-post-hub",
        "corner-offense",
        "backdoor-cuts",
        "split-cuts",
        "elbow-sets",
        "post-up-hub",
        "dribble-handoff",
        "pick-and-roll"
      ],
      "sources": [
        "Basketball-Reference coach page",
        "Documented corner-offense analyses (Kings 1999-2006)",
        "Rockets 2007-11 Yao-era coverage"
      ]
    },
    {
      "id": "george-karl",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1984-1998",
          "teams": "Cavaliers, Warriors, SuperSonics",
          "system": "Pressure-defense era peaking in Seattle (1992-98): hyper-aggressive pick-and-roll traps, full-court and half-court pressure with Gary Payton, turnovers converted into Kemp/Payton transition; 1996 Finals, multiple 60-win seasons.",
          "innovations": "The Sonics' PnR trapping scheme was among the most aggressive documented of the 1990s"
        },
        {
          "period": "1998-2003",
          "teams": "Milwaukee Bucks",
          "system": "Offense-first jump-shooting era: 'Big Three' of Ray Allen, Sam Cassell, and Glenn Robinson; scaled-back pressure, perimeter-scoring identity, reached the 2001 East Finals with a middling defense.",
          "innovations": ""
        },
        {
          "period": "2005-2016",
          "teams": "Denver Nuggets, Sacramento Kings",
          "system": "Extreme-pace altitude era: league-leading pace, relentless rim attacks and free throws, offensive-glass crashing, gambling passing-lane defense; the egalitarian, star-less 2012-13 Nuggets won 57 games on league-best rim pressure.",
          "innovations": "Built a top seed with no All-Star via pace, rim rate, and altitude conditioning"
        }
      ],
      "toolkit": [
        "full-court-press",
        "half-court-trap",
        "pnr-blitz",
        "gambling-passing-lane-defense",
        "transition-offense",
        "league-leading-pace",
        "rim-attack-offense",
        "offensive-glass-crash",
        "small-ball"
      ],
      "sources": [
        "Basketball-Reference Sonics/Nuggets pages",
        "Documented 1990s Sonics trapping-defense coverage",
        "2012-13 Nuggets pace/rim-rate analyses"
      ]
    },
    {
      "id": "rick-carlisle",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "2001-2007",
          "teams": "Detroit Pistons, Indiana Pacers",
          "system": "Defense-first grind: bottom-five pace, elite half-court man defense anchored by Ben Wallace then Ron Artest, structured low-possession offense; back-to-back 50-win Pistons seasons, 61-win 2004 Pacers.",
          "innovations": ""
        },
        {
          "period": "2008-2021",
          "teams": "Dallas Mavericks",
          "system": "Offensive-innovator era: 'flow' offense granting Jason Kidd early-offense freedom, Dirk high-post iso, and the 2011 title run famous for extensive zone defense against the Lakers and Heat; later an analytics-driven spread pick-and-roll attack maximizing Luka Doncic (historic 2020 offensive rating).",
          "innovations": "One of the most prominent modern users of zone defense in a title run; renowned ATO play designer"
        },
        {
          "period": "2021-present",
          "teams": "Indiana Pacers",
          "system": "League-fastest pace: relentless transition and drag screens with Tyrese Haliburton, high-volume ball movement, deep rotations, and full-court ball pressure defense; 2024 East Finals and 2025 Finals appearances.",
          "innovations": "Rebuilt an entire identity around tempo in a slow-pace league"
        }
      ],
      "toolkit": [
        "slow-pace-grind",
        "elite-halfcourt-man-defense",
        "zone-defense",
        "flow-offense",
        "spread-pick-and-roll",
        "star-iso",
        "analytics-shot-profile",
        "fastest-pace-transition",
        "drag-screens",
        "full-court-ball-pressure",
        "ato-play-design"
      ],
      "sources": [
        "Basketball-Reference coach page",
        "2011 Mavericks zone-defense Finals coverage",
        "2024-25 Pacers pace-leader documentation"
      ]
    },
    {
      "id": "mike-dantoni",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "2003-2014",
          "teams": "Phoenix Suns, New York Knicks, LA Lakers",
          "system": "'Seven Seconds or Less': Steve Nash spread pick-and-roll at the league's fastest pace, early-clock threes, small-ball with Amar'e Stoudemire at center, virtually no post-ups; the blueprint for the modern spacing revolution. Knicks and Lakers stops attempted the same system with worse fits.",
          "innovations": "SSOL pace-and-space is arguably the most influential offensive system of the 2000s"
        },
        {
          "period": "2016-2020",
          "teams": "Houston Rockets",
          "system": "Moreyball iso era: pace actually slowed while James Harden ran record isolation volume into a threes-and-layups-only shot profile; switch-everything defense, and 2020 'micro-ball' with 6'5\" PJ Tucker at center; 65-win 2018 team pushed the Warriors to seven.",
          "innovations": "Most extreme documented shot-profile (no midrange) and iso-volume offense in league history; full-season centerless lineup"
        }
      ],
      "toolkit": [
        "seven-seconds-pace",
        "spread-pick-and-roll",
        "early-offense-threes",
        "small-ball-five",
        "iso-heavy-offense",
        "three-point-volume",
        "no-midrange-shot-profile",
        "switch-everything-defense",
        "micro-ball"
      ],
      "sources": [
        "Jack McCallum, 'Seven Seconds or Less' (2006)",
        "Basketball-Reference Suns/Rockets pages",
        "2017-20 Rockets iso/shot-profile analytics coverage"
      ]
    },
    {
      "id": "doc-rivers",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1999-2003",
          "teams": "Orlando Magic",
          "system": "'Heart and Hustle' overachievers: scrappy effort-based defense with thin rosters, offense leaning heavily on Tracy McGrady isolation; Coach of the Year in 2000 with a talent-poor 41-win team.",
          "innovations": ""
        },
        {
          "period": "2004-2013",
          "teams": "Boston Celtics",
          "system": "Defense-first Ubuntu era: the Thibodeau-designed strong-side overload scheme walling off the paint and forcing weak-side passes, Kevin Garnett as vocal anchor, slow pace, veteran hierarchy; 2008 title behind a historically great defense, 2010 Finals.",
          "innovations": "The 2008 strong-side overload/ice scheme became the league's dominant defensive template for years"
        },
        {
          "period": "2013-present",
          "teams": "LA Clippers, Philadelphia 76ers, Milwaukee Bucks",
          "system": "Star-driven offense-first era: Lob City's Chris Paul high pick-and-roll with DeAndre Jordan vertical spacing produced perennial top-3 offenses with mediocre defenses; later Embiid post/delay-hub offense with drop coverage in Philadelphia, then Giannis-Lillard pick-and-roll in Milwaukee.",
          "innovations": ""
        }
      ],
      "toolkit": [
        "strong-side-overload-defense",
        "slow-pace-halfcourt",
        "post-up-hub",
        "high-pick-and-roll-offense",
        "vertical-spacing-lobs",
        "star-iso",
        "drop-coverage",
        "elite-halfcourt-man-defense"
      ],
      "sources": [
        "Basketball-Reference coach page",
        "Documented 2008 Celtics defensive-scheme analyses",
        "Lob City Clippers offensive-rating records"
      ]
    },
    {
      "id": "steve-kerr",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "2014-present",
          "teams": "Golden State Warriors",
          "system": "One consistent system throughout: motion offense blending triangle principles, Adelman's corner sets, and D'Antoni pace — split cuts, off-ball screens for Curry, dribble-handoffs, Draymond Green as elbow-hub point-center, league-leading assist and movement numbers; small-ball 'Death Lineup' with switch-everything defense. The KD years added iso leverage and the 2022+ years more Curry on-ball PnR, but the base identity never changed across four titles (2015, 2017, 2018, 2022) and the 73-win 2016 season.",
          "innovations": "Popularized the centerless switch-heavy closing lineup; deep 'Strength in Numbers' rotations; fused off-ball star gravity with a hub big"
        }
      ],
      "toolkit": [
        "motion-offense",
        "split-cuts",
        "off-ball-screens",
        "dribble-handoff",
        "elbow-hub-point-center",
        "small-ball-death-lineup",
        "switch-everything-defense",
        "transition-threes",
        "egalitarian-ball-movement",
        "deep-rotations"
      ],
      "sources": [
        "Basketball-Reference Warriors pages",
        "Documented analyses of Kerr's hybrid motion system (Grantland/ESPN Zach Lowe)"
      ]
    },
    {
      "id": "erik-spoelstra",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "2008-2010",
          "teams": "Miami Heat",
          "system": "Riley-school grind: slow pace, physical man defense, Wade-centric half-court offense on thin rosters.",
          "innovations": ""
        },
        {
          "period": "2010-2014",
          "teams": "Miami Heat",
          "system": "Big Three reinvention: after the 2011 Finals loss Spoelstra rebuilt into pace-and-space positionless offense (LeBron/Bosh at 4/5, corner shooters) paired with a hyper-aggressive pick-and-roll blitz-and-scramble defense; back-to-back titles 2012-13 and a 27-game win streak.",
          "innovations": "The blitz-and-scramble defense and positionless spacing were widely studied and copied; documented visit to Oregon's Chip Kelly to study tempo"
        },
        {
          "period": "2014-present",
          "teams": "Miami Heat",
          "system": "Adaptive Bam/Butler era: offense reorganized around Bam Adebayo as a dribble-handoff hub, league-leading 2-3 zone usage (including zone-press looks), slow-pace clutch-oriented halfcourt execution, and an undrafted-player development pipeline; Finals runs in 2020 and 2023 (as a play-in 8 seed).",
          "innovations": "Led the modern revival of heavy zone usage; DHO-hub offense; famed culture/conditioning program"
        }
      ],
      "toolkit": [
        "pnr-blitz-trap",
        "scramble-rotations",
        "zone-2-3",
        "zone-press",
        "pace-and-space",
        "positionless-small-ball",
        "dho-hub-offense",
        "slow-pace-grind",
        "elite-halfcourt-man-defense",
        "switch",
        "ato-play-design"
      ],
      "sources": [
        "Basketball-Reference Heat pages",
        "Documented Heat zone-usage league-leader tracking data (2019-2023)",
        "2012-13 Heat blitz-defense coverage"
      ]
    },
    {
      "id": "nick-nurse",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "2018-present",
          "teams": "Toronto Raptors, Philadelphia 76ers",
          "system": "One consistent identity throughout: egalitarian movement offense organized around a star (Kawhi Leonard's iso-plus-motion in 2019, later Embiid post/delay hub and Maxey) paired with the league's most experimental, aggressive defense — box-and-one, triangle-and-two, 2-3 and 3-2 zones, full-court presses, blitzing traps (famously on Curry in the 2019 Finals), and scramble switching. 2019 title; the same experimental toolkit carried directly into Philadelphia.",
          "innovations": "Mainstreamed 'junk' defenses in the modern NBA — the box-and-one on Curry in the 2019 Finals is the signature documented example; constant in-series scheme shifting"
        }
      ],
      "toolkit": [
        "box-and-one",
        "triangle-and-two",
        "zone-2-3",
        "zone-3-2",
        "full-court-press",
        "half-court-trap",
        "pnr-blitz",
        "switch-heavy",
        "aggressive-help-rotations",
        "transition-offense",
        "star-iso",
        "post-up-hub"
      ],
      "sources": [
        "2019 NBA Finals box-and-one coverage (ESPN/The Athletic)",
        "Basketball-Reference Raptors/76ers pages",
        "Documented Raptors 2019-2023 defensive-experimentation analyses"
      ]
    },
    {
      "id": "billy-cunningham",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1977-1985",
          "teams": "Philadelphia 76ers",
          "system": "Consistent identity throughout: defense-triggered transition offense built around elite athletic wings (Erving, Bobby Jones), top-tier man-to-man pressure defense, and a deep rotation with a star sixth man. Even after Moses Malone arrived (1982-83), Cunningham kept the running game — he called that team the best running team he ever coached, with Moses converted to defensive rebounding and outlet passing to fuel the break, plus a post-up hub and offensive rebounding in the halfcourt.",
          "innovations": "Repurposed a ball-dominant offensive-rebounding center (Malone) into a defensive-rebound/outlet trigger without abandoning the transition identity; institutionalized the elite defensive sixth man (Bobby Jones, first Sixth Man of the Year, 1983)."
        }
      ],
      "toolkit": [
        "transition-offense",
        "defense-triggered-fastbreak",
        "man-to-man-pressure-defense",
        "post-up-hub",
        "offensive-rebounding",
        "sixth-man-rotation",
        "defensive-stopper-deployment"
      ],
      "sources": [
        "https://www.basketballnetwork.net/old-school/billy-cunningham-on-why-moses-malone-was-the-undisputed-star-for-the-76ers-in-1983",
        "https://www.nba.com/news/archive-75-billy-cunningham",
        "Basketball-Reference coach page (Billy Cunningham)"
      ]
    },
    {
      "id": "red-auerbach",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1946-1956",
          "teams": "Washington Capitols, Tri-Cities Blackhawks, Boston Celtics (pre-Russell)",
          "system": "Offense-led fast break: with Cousy and Sharman the Celtics ran the league's fastest, highest-scoring attack off a deliberately simple playbook (roughly seven core plays with give-and-go options), but lacked a rebounder/defensive anchor — great offense, mediocre defense, no titles in Boston.",
          "innovations": "Pioneered a stripped-down playbook executed at maximum tempo; emphasis on conditioning to outrun opponents."
        },
        {
          "period": "1956-1966",
          "teams": "Boston Celtics (Russell era)",
          "system": "Defense-first dynasty: Bill Russell's shot-blocking and defensive rebounding became the engine, with blocks kept in play and defensive boards instantly converted to outlet-pass fast breaks. Same simple offense, now ignited by stops; institutionalized the sixth-man role (Ramsey, then Havlicek). Nine titles in ten seasons.",
          "innovations": "First championship model built explicitly on defense-to-offense conversion; invented/popularized the sixth-man concept; used Russell as a help-defense/shot-blocking anchor rather than a scoring center."
        }
      ],
      "toolkit": [
        "fast-break",
        "defensive-rebound-outlet",
        "shot-blocking-anchor-defense",
        "man-to-man-defense",
        "sixth-man-rotation",
        "give-and-go-simple-sets",
        "high-pace",
        "conversion-off-blocks"
      ],
      "sources": [
        "Basketball-Reference coach page (Red Auerbach)",
        "Auerbach, 'Basketball for the Player, the Fan and the Coach'",
        "Naismith Hall of Fame bio (Red Auerbach)"
      ]
    },
    {
      "id": "john-kundla",
      "multiPhase": true,
      "confidence": "MEDIUM",
      "phases": [
        {
          "period": "1948-1954",
          "teams": "Minneapolis Lakers (Mikan era)",
          "system": "Deliberate halfcourt offense fed through George Mikan in the pivot, with Vern Mikkelsen alongside in an early double-post look and Pollard/Martin providing cutting and selective breaks; disciplined, physical man-to-man defense. With no shot clock, leads could be protected by slowing the game. Five championships (1949-1954 span, BAA/NBA).",
          "innovations": "Prototype of the dominant-center pivot offense; Mikkelsen's face-up role next to Mikan is often cited as the origin of the power forward position; his teams' dominance contributed to rule changes (widened lane, and the stall games that motivated the shot clock)."
        },
        {
          "period": "1954-1959",
          "teams": "Minneapolis Lakers (post-shot-clock / post-Mikan)",
          "system": "Forced adaptation after Mikan's retirement and the 1954-55 shot clock: faster tempo, more balanced and perimeter/wing-oriented attack. By 1958-59, built around rookie Elgin Baylor's open-court and one-on-one game, reaching the NBA Finals with a running style far removed from the Mikan grind.",
          "innovations": "Early example of a title coach retooling from a pivot-stall system to shot-clock-era pace around a transcendent wing."
        }
      ],
      "toolkit": [
        "post-centric-pivot-offense",
        "double-post",
        "deliberate-halfcourt-pace",
        "stall-with-lead-pre-shot-clock",
        "physical-man-to-man-defense",
        "fast-break",
        "wing-isolation"
      ],
      "sources": [
        "https://www.hoophall.com/hall-of-famers/john-kundla",
        "Basketball-Reference coach page (John Kundla)",
        "Wikipedia: Minneapolis Lakers season pages 1948-1959"
      ]
    },
    {
      "id": "red-holzman",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1953-1957, 1967-1977, 1978-1982",
          "teams": "Milwaukee/St. Louis Hawks, New York Knicks",
          "system": "One famously consistent identity, fully realized with the Knicks: swarming, helping man-to-man defense built on his 'see the ball' principle, frequent full-court and backcourt pressure to force turnovers, and an unselfish 'hit the open man' offense — constant ball and player movement with no fixed star hierarchy. The 1970 and 1973 title teams are the canonical expression; he never ran a meaningfully different system.",
          "innovations": "Codified team-defense principles ('see the ball') and egalitarian ball-movement offense that became the New York template; heavy use of the press as a base identity rather than a gimmick."
        }
      ],
      "toolkit": [
        "full-court-press",
        "help-defense-see-the-ball",
        "man-to-man-defense",
        "hit-the-open-man-ball-movement",
        "motion-offense",
        "turnover-forcing-pressure"
      ],
      "sources": [
        "Basketball-Reference coach page (Red Holzman)",
        "Naismith Hall of Fame bio (Red Holzman)",
        "Holzman & Frommer, 'Red on Red'"
      ]
    },
    {
      "id": "tom-heinsohn",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1969-1978",
          "teams": "Boston Celtics",
          "system": "Uncompromising run-and-gun throughout: the NBA's fastest pace, every rebound pushed immediately, built around Dave Cowens as an undersized, mobile, floor-running center and Havlicek/White/Chaney applying relentless full-court and man-to-man pressure to create transition chances. Two titles (1974, 1976) with essentially the same identity from start to finish.",
          "innovations": "Extreme-pace offense as a base system; pioneered winning with a small, mobile center who defended in space and ran the floor rather than anchoring the paint."
        }
      ],
      "toolkit": [
        "fast-break",
        "extreme-pace",
        "full-court-press",
        "man-to-man-pressure-defense",
        "undersized-mobile-center",
        "quick-outlet-transition"
      ],
      "sources": [
        "Basketball-Reference coach page (Tom Heinsohn)",
        "Naismith Hall of Fame bio (Tom Heinsohn, coach)",
        "NBA.com Celtics 1973-74 and 1975-76 season histories"
      ]
    },
    {
      "id": "bill-sharman",
      "multiPhase": false,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1961-1976 (ABL Cleveland, ABA Utah Stars 1970-71, Lakers 1971-76)",
          "teams": "Cleveland Pipers (ABL), Los Angeles/Utah Stars (ABA), Los Angeles Lakers",
          "system": "One identity across three leagues: conditioning-driven, fast-break basketball. Won the 1971 ABA title with a running Stars team, then rebuilt the 1971-72 Lakers on the Celtics model he played in — convinced Wilt Chamberlain to abandon scoring for rebounding, shot-blocking and outlet passing (the Russell role) to trigger the break for West and Goodrich, producing 69 wins and the 33-game streak. Disciplined man-to-man defense supported the tempo.",
          "innovations": "Invented the morning game-day shootaround; the definitive case of converting a scoring center into a defensive/outlet engine; brought systematic conditioning and preparation science to NBA coaching."
        }
      ],
      "toolkit": [
        "fast-break",
        "defensive-rebound-outlet",
        "center-as-defensive-anchor",
        "man-to-man-defense",
        "high-pace",
        "guard-led-transition-finishing"
      ],
      "sources": [
        "https://www.espn.com/espn/news/story?id=1879063",
        "https://www.nba.com/history/season-recap/1971-72",
        "Basketball-Reference coach page (Bill Sharman)"
      ]
    },
    {
      "id": "pat-riley",
      "multiPhase": true,
      "confidence": "HIGH",
      "phases": [
        {
          "period": "1981-1990",
          "teams": "Los Angeles Lakers",
          "system": "Showtime: Magic Johnson-led fast break and early offense at league-leading tempo, with Kareem's post game as the halfcourt safety valve; underrated but genuine defensive commitment and legendary conditioning (Riley's brutal training camps). Four titles.",
          "innovations": "Perfected rebound-to-rim early offense with a 6'9\" point guard as the outlet/engine; celebrity-era pace-and-spectacle model."
        },
        {
          "period": "1991-1995",
          "teams": "New York Knicks",
          "system": "Complete stylistic reversal: bottom-of-league pace, grinding halfcourt offense through Patrick Ewing post-ups and offensive rebounding (Oakley, Mason), and a physical, hard-fouling, paint-clogging man-to-man defense with aggressive help and double-teams on stars — 'no layups' as a rule.",
          "innovations": "Codified the 1990s physical-defense era; demonstrated a star coach deliberately rebuilding his entire system around opposite personnel."
        },
        {
          "period": "1995-2003, 2005-2008",
          "teams": "Miami Heat",
          "system": "Continuation of the grind blueprint with Alonzo Mourning as a shot-blocking defensive anchor and post hub plus Tim Hardaway pick-and-rolls; perennial top defenses at slow pace. In 2005-06 he adapted the halfcourt around Shaquille O'Neal post-ups and Dwyane Wade isolations/pick-and-rolls to win the 2006 title.",
          "innovations": "Sustained the defense-first grind model into the 2000s and retooled it around a slasher-centric star (Wade) for a title."
        }
      ],
      "toolkit": [
        "showtime-fast-break",
        "early-offense",
        "post-centric-halfcourt",
        "star-isolation",
        "physical-man-to-man-defense",
        "hard-foul-paint-protection",
        "offensive-rebounding",
        "slow-pace-grind",
        "post-double-teams",
        "shot-blocking-anchor-defense"
      ],
      "sources": [
        "Basketball-Reference coach page (Pat Riley)",
        "Riley, 'Show Time'",
        "NBA.com Finals histories 1982-1988, 1994, 2006"
      ]
    },
    {
      "id": "lenny-wilkens",
      "multiPhase": true,
      "confidence": "MEDIUM",
      "phases": [
        {
          "period": "1969-1985",
          "teams": "Seattle SuperSonics (player-coach), Portland Trail Blazers, Seattle SuperSonics",
          "system": "Quickness and relentless guard-pressure defense sparking a running, guard-oriented attack: the 1978-79 champion Sonics won with a top-ranked defense and rebounding (Sikma, Dennis Johnson, Gus Williams), converting turnovers into transition while playing low-scoring, defense-first games in the halfcourt.",
          "innovations": "Championship model driven by a defensive backcourt (DJ/Williams) rather than a dominant scorer; mid-season turnaround of a 5-17 team into a Finals team (1977-78)."
        },
        {
          "period": "1986-1993",
          "teams": "Cleveland Cavaliers",
          "system": "Precision halfcourt execution: patient motion and heavy Mark Price-Brad Daugherty pick-and-roll, elite shooting efficiency, low turnovers, and inside-out balance — widely described as textbook, pass-first basketball, a clear offensive-identity shift from his defense-and-transition Seattle teams.",
          "innovations": "One of the era's cleanest pick-and-roll/motion offenses; developed Price as a stretch pick-and-roll point guard ahead of the style's league-wide rise."
        },
        {
          "period": "1993-2005",
          "teams": "Atlanta Hawks, Toronto Raptors, New York Knicks",
          "system": "Veteran defense-first grind: Hawks teams anchored by Dikembe Mutombo's rim protection with modest, slower-paced offenses (57-win 1993-94 team built on defense); later stints in Toronto and New York were adaptive, fundamentals-and-execution basketball without a signature offensive scheme. Became the NBA's all-time wins leader.",
          "innovations": "Longevity through adaptation — retooled his base system around whatever defensive anchor or star (Mutombo, Carter) the roster offered."
        }
      ],
      "toolkit": [
        "man-to-man-defense",
        "guard-pressure-defense",
        "transition-off-turnovers",
        "motion-offense",
        "pick-and-roll-halfcourt",
        "low-turnover-execution",
        "rim-protector-anchor-defense",
        "defensive-rebounding-emphasis"
      ],
      "sources": [
        "https://www.historylink.org/File/22706",
        "https://www.nba.com/news/history-nba-legend-lenny-wilkens",
        "https://www.hoophall.com/hall-of-famers/lenny-wilkens-1",
        "Basketball-Reference coach page (Lenny Wilkens)"
      ]
    }
  ]
};
