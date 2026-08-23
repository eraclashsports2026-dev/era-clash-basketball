// 25-coach research database — build-time research with provenance, fact-checked.
// See docs/simulation-v3/coaches-research.md. NO universal coach OVR exists.
export default {
  "coaches": [
    {
      "id": "billy-cunningham",
      "name": "Billy Cunningham",
      "span": "1977–1985",
      "wins": 454,
      "losses": 196,
      "pct": 0.698,
      "championships": 1,
      "teams": [
        "Philadelphia 76ers"
      ],
      "eras": [
        "1970s",
        "1980s"
      ],
      "systemTags": [
        "Fast-break attack",
        "Star-centric inside-out",
        "Fiery motivator"
      ],
      "offense": {
        "tempo": 7,
        "transition": 8,
        "motion": 5,
        "pnr": 4,
        "post": 7,
        "iso": 6,
        "threeEmphasis": 1,
        "insideOut": 6,
        "offBall": 5,
        "ballMovement": 6,
        "starFreedom": 8
      },
      "defense": {
        "man": 8,
        "zone": 1,
        "switching": 3,
        "drop": 6,
        "pressure": 7,
        "helpAggression": 7,
        "rimPriority": 7,
        "defRebPriority": 8
      },
      "management": {
        "adaptability": 8,
        "rotationDepth": 7,
        "roleDiscipline": 8,
        "starEmpowerment": 8,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 8,
        "passingBigs": 4,
        "shootingBigs": 2,
        "primaryCreators": 7,
        "multipleCreators": 6,
        "switchableWings": 7,
        "shooters": 5,
        "defenders": 8,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Dominant low-post center",
        "Elite transition wings",
        "Defensive-minded sixth man"
      ],
      "concern": "Burned out after only eight seasons; leaned on assistants for X's-and-O's detail while he supplied intensity",
      "documented": [
        "Career regular-season record of 454-196 (.698) with the Philadelphia 76ers, 1977-78 through 1984-85, one of the highest winning percentages among coaches with 500+ games",
        "Won the 1983 NBA championship, sweeping the Lakers in the Finals to cap the famous 'Fo, Fi, Fo' 12-1 playoff run behind Moses Malone and Julius Erving",
        "Reached the NBA Finals three times in four seasons (1980, 1982, 1983)",
        "At the time of his retirement, was the fastest coach in NBA history to reach 200, 300, and 400 career wins",
        "Took over the 76ers from Gene Shue early in the 1977-78 season with no prior coaching experience, having starred for the franchise as a player",
        "Inducted into the Naismith Memorial Basketball Hall of Fame (1986) as a player, not as a coach"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference from documented rosters, results, and era context rather than quantified fact",
        "tempo and transition ratings inferred from the Erving/Cheeks fast-break identity of his Sixers teams",
        "post and insideOut ratings inferred from the 1982-83 offensive retooling around Moses Malone",
        "zone rating reflects that zone defense was illegal throughout his tenure and no documented zone inclination exists",
        "tacticalAdjustment rating inferred from contemporary accounts crediting assistants (e.g. Jack McMahon, Chuck Daly, Matt Guokas) with much of the X's-and-O's detail",
        "pressure and helpAggression ratings inferred from Maurice Cheeks' steal numbers and Bobby Jones' documented defensive reputation"
      ],
      "sources": [
        "Basketball Reference coach page",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com franchise history: 1982-83 Philadelphia 76ers championship season"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "red-auerbach",
      "name": "Red Auerbach",
      "span": "1946-1966",
      "wins": 938,
      "losses": 479,
      "pct": 0.662,
      "championships": 9,
      "teams": [
        "Washington Capitols",
        "Tri-Cities Blackhawks",
        "Boston Celtics"
      ],
      "eras": [
        "1950s",
        "1960s"
      ],
      "systemTags": [
        "Fast Break Pioneer",
        "Sixth Man Concept",
        "Defense-First Culture"
      ],
      "offense": {
        "tempo": 9,
        "transition": 10,
        "motion": 5,
        "pnr": 4,
        "post": 5,
        "iso": 3,
        "threeEmphasis": 1,
        "insideOut": 5,
        "offBall": 6,
        "ballMovement": 8,
        "starFreedom": 5
      },
      "defense": {
        "man": 9,
        "zone": 3,
        "switching": 3,
        "drop": 6,
        "pressure": 7,
        "helpAggression": 8,
        "rimPriority": 9,
        "defRebPriority": 9
      },
      "management": {
        "adaptability": 8,
        "rotationDepth": 9,
        "roleDiscipline": 9,
        "starEmpowerment": 5,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 8,
        "shootingBigs": 3,
        "primaryCreators": 7,
        "multipleCreators": 5,
        "switchableWings": 6,
        "shooters": 6,
        "defenders": 9,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Elite rim-protecting rebounder to trigger outlets",
        "Fast-break athletes and runners",
        "Deep bench willing to accept defined roles"
      ],
      "concern": "Famously sparse halfcourt playbook (roughly seven set plays); untested against modern three-point spacing",
      "documented": [
        "Career NBA regular-season record of 938-479 as head coach, the most wins in league history at his 1966 retirement",
        "9 NBA championships as head coach of the Boston Celtics (1957, 1959-1966), including 8 consecutive titles",
        "Pioneered the fast break as a primary offensive weapon, built on Bill Russell's rebounding and outlet passing to Bob Cousy",
        "Popularized the sixth man concept with Frank Ramsey and later John Havlicek",
        "Drafted Chuck Cooper in 1950 (first Black player drafted by an NBA team) and fielded the NBA's first all-Black starting five in 1964",
        "NBA Coach of the Year in 1965; the award trophy is now named the Red Auerbach Trophy"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference calibrated to his documented style, not recorded statistics",
        "tempo/transition ratings inferred from the famously documented Celtics fast break",
        "pnr, drop, and switching values are extrapolations of pre-modern-era defensive concepts (Russell playing back near the rim)",
        "threeEmphasis set to 1 because the three-point line did not exist during his coaching career; it reflects absence of evidence, not documented reluctance",
        "zone rating is an inference from Russell's zone-like help principles despite the NBA's illegal-defense rules",
        "management and rosterFit scales inferred from documented roster construction (sixth man usage, the Russell trade, role-first culture)"
      ],
      "sources": [
        "Basketball Reference coach page (Red Auerbach)",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA Coach of the Year (Red Auerbach Trophy), NBA.com"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "john-kundla",
      "name": "John Kundla",
      "span": "1948–1959 (BAA/NBA)",
      "wins": 423,
      "losses": 302,
      "pct": 0.583,
      "championships": 5,
      "teams": [
        "Minneapolis Lakers"
      ],
      "eras": [
        "1950s"
      ],
      "systemTags": [
        "Mikan Post Offense",
        "Inside-Out Halfcourt",
        "Frontcourt Dominance"
      ],
      "offense": {
        "tempo": 3,
        "transition": 3,
        "motion": 4,
        "pnr": 3,
        "post": 10,
        "iso": 3,
        "threeEmphasis": 0,
        "insideOut": 9,
        "offBall": 5,
        "ballMovement": 6,
        "starFreedom": 6
      },
      "defense": {
        "man": 8,
        "zone": 2,
        "switching": 2,
        "drop": 7,
        "pressure": 3,
        "helpAggression": 5,
        "rimPriority": 9,
        "defRebPriority": 9
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 5,
        "roleDiscipline": 8,
        "starEmpowerment": 7,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 10,
        "passingBigs": 7,
        "shootingBigs": 4,
        "primaryCreators": 4,
        "multipleCreators": 4,
        "switchableWings": 3,
        "shooters": 4,
        "defenders": 7,
        "transitionAthletes": 4
      },
      "bestWith": [
        "Dominant low-post center",
        "Physical rebounding frontcourt",
        "Steady ball-handling floor general"
      ],
      "concern": "System heavily dependent on a dominant paint-anchoring center; pace and spacing concepts predate the modern game",
      "documented": [
        "Won 5 BAA/NBA championships as head coach of the Minneapolis Lakers (1949, 1950, 1952, 1953, 1954), the NBA's first dynasty; also won the 1948 NBL title",
        "Career BAA/NBA regular-season record of 423-302 (.583) over 11 seasons, all with the Lakers",
        "Built his offense around George Mikan, whose interior dominance prompted the NBA to widen the lane from 6 to 12 feet in 1951-52",
        "Managed a Hall of Fame frontcourt of Mikan, Vern Mikkelsen, and Jim Pollard, converting Mikkelsen into a pioneering face-up power forward",
        "Named one of the NBA's 10 Greatest Coaches in History (1996) and to the NBA 75th Anniversary list of 15 Greatest Coaches (2021)",
        "Inducted into the Naismith Memorial Basketball Hall of Fame as a coach in 1995"
      ],
      "inferred": [
        "All 0-10 offensive scale values are analyst inference extrapolated from the documented Mikan-centric post/inside-out system and pre-shot-clock era pacing",
        "Defensive scheme values (man, drop, pressure, helpAggression) are inferred from era rules (zone defense was illegal throughout his NBA career) and his teams' documented rebounding/rim dominance rather than from recorded scheme details",
        "zone rating reflects lack of any documented zone inclination, not just era legality",
        "Management values are inferred from his documented low-key temperament and handling of three Hall of Fame frontcourt stars",
        "rosterFit values are analyst extrapolation of a 1950s system onto modern roster archetypes",
        "threeEmphasis is 0 because the three-point line did not exist in his era"
      ],
      "sources": [
        "Basketball Reference coach page (John Kundla)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com: 10 Greatest Coaches in NBA History (1996)",
        "NBA 75th Anniversary 15 Greatest Coaches announcement (2021)",
        "NBA.com history of the Minneapolis Lakers dynasty"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "red-holzman",
      "name": "Red Holzman",
      "span": "1953-1982 (Hawks 1953-57; Knicks 1967-77, 1978-82)",
      "wins": 696,
      "losses": 604,
      "pct": 0.535,
      "championships": 2,
      "teams": [
        "Milwaukee/St. Louis Hawks",
        "New York Knicks"
      ],
      "eras": [
        "1950s",
        "1960s",
        "1970s",
        "1980s"
      ],
      "systemTags": [
        "Hit the Open Man",
        "See the Ball Defense",
        "Team-First Basketball"
      ],
      "offense": {
        "tempo": 4,
        "transition": 5,
        "motion": 8,
        "pnr": 4,
        "post": 5,
        "iso": 2,
        "threeEmphasis": 1,
        "insideOut": 4,
        "offBall": 8,
        "ballMovement": 10,
        "starFreedom": 3
      },
      "defense": {
        "man": 9,
        "zone": 4,
        "switching": 6,
        "drop": 4,
        "pressure": 8,
        "helpAggression": 9,
        "rimPriority": 5,
        "defRebPriority": 6
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 7,
        "roleDiscipline": 9,
        "starEmpowerment": 4,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 6,
        "passingBigs": 8,
        "shootingBigs": 6,
        "primaryCreators": 6,
        "multipleCreators": 7,
        "switchableWings": 7,
        "shooters": 7,
        "defenders": 9,
        "transitionAthletes": 5
      },
      "bestWith": [
        "High-IQ unselfish veterans",
        "Versatile two-way forwards",
        "Smart help defenders"
      ],
      "concern": "Sub-.500 stretches without elite veteran talent (losing Hawks tenure, late-1970s Knicks rebuild)",
      "documented": [
        "Won NBA championships as Knicks head coach in 1970 and 1973 — the only two titles in Knicks franchise history",
        "Career NBA regular-season record of 696-604 (.535) as head coach",
        "Won 613 games with the Knicks; the number 613 hangs retired in Madison Square Garden",
        "NBA Coach of the Year, 1970",
        "Named one of the 10 Greatest Coaches in NBA History (1996, NBA at 50)",
        "Famous coaching mantras: 'hit the open man' on offense and 'see the ball' on defense; inducted into the Naismith Basketball Hall of Fame in 1986"
      ],
      "inferred": [
        "All 0-10 numeric scales are analyst inference calibrated from his documented system, not measured data",
        "Offense ratings inferred from the documented 'hit the open man' ball-movement philosophy and Earl Monroe's documented subordination of his iso game (iso, starFreedom, motion, offBall)",
        "threeEmphasis reflects that the 3-point line existed only in his final seasons (1979-82); his inclination toward it is inferred as minimal",
        "Defense ratings (pressure, helpAggression, man) inferred from the documented 'see the ball' pressing team-defense identity; zone rating is inferred inclination since zone was illegal in his era",
        "Management and rosterFit ratings inferred from the composition and usage of the 1969-73 Knicks (Reed, Frazier, DeBusschere, Bradley, Monroe) and their famed bench depth",
        "tempo rating inferred from the Knicks' documented deliberate, defense-first style relative to era pace"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "New York Knicks franchise history / retired numbers"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "tom-heinsohn",
      "name": "Tom Heinsohn",
      "span": "1969–1978",
      "wins": 427,
      "losses": 263,
      "pct": 0.619,
      "championships": 2,
      "teams": [
        "Boston Celtics"
      ],
      "eras": [
        "1960s",
        "1970s"
      ],
      "systemTags": [
        "Fast-Break Offense",
        "Full-Court Pressure",
        "Auerbach Running Game"
      ],
      "offense": {
        "tempo": 9,
        "transition": 9,
        "motion": 6,
        "pnr": 4,
        "post": 4,
        "iso": 4,
        "threeEmphasis": 0,
        "insideOut": 4,
        "offBall": 6,
        "ballMovement": 6,
        "starFreedom": 5
      },
      "defense": {
        "man": 8,
        "zone": 1,
        "switching": 3,
        "drop": 4,
        "pressure": 8,
        "helpAggression": 6,
        "rimPriority": 4,
        "defRebPriority": 7
      },
      "management": {
        "adaptability": 6,
        "rotationDepth": 4,
        "roleDiscipline": 6,
        "starEmpowerment": 6,
        "tacticalAdjustment": 5
      },
      "rosterFit": {
        "traditionalCenters": 3,
        "passingBigs": 7,
        "shootingBigs": 6,
        "primaryCreators": 6,
        "multipleCreators": 6,
        "switchableWings": 6,
        "shooters": 5,
        "defenders": 7,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Mobile, running big men",
        "Tireless two-way wings",
        "Rebounders who ignite the break"
      ],
      "concern": "Rode veteran starters heavily; team cratered when the core aged, leading to his mid-season firing in 1977-78",
      "documented": [
        "Career NBA regular-season record of 427-263 (.619), all with the Boston Celtics, 1969-1978",
        "Won two NBA championships as head coach (1974 and 1976)",
        "Named NBA Coach of the Year for 1972-73 after Boston went 68-14, then a franchise record",
        "Ran an up-tempo, fast-break offense in the Red Auerbach tradition, built around undersized, mobile center Dave Cowens and pressure defense feeding the break",
        "Enshrined in the Naismith Memorial Basketball Hall of Fame as both a player (1986) and a coach (2015), one of only four men so honored",
        "Dismissed during the 1977-78 season with Boston well under .500 and replaced by Satch Sanders"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference from his documented system rather than measured data",
        "tempo, transition, and pressure ratings are anchored to his well-documented fast-break/pressing identity but the exact values are inferred",
        "motion, pnr, post, iso, insideOut, offBall, ballMovement, and starFreedom are inferred from era norms and Celtics style descriptions",
        "zone rating reflects that zone was illegal in his era and he showed no documented zone inclination",
        "threeEmphasis is 0 because the NBA had no three-point line during his coaching tenure (introduced 1979-80)",
        "all management and rosterFit scales are inferred from roster construction (Cowens, Havlicek, Jo Jo White, Silas) and reported minutes loads"
      ],
      "sources": [
        "Basketball Reference coach page",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com Boston Celtics team history (1973-74 and 1975-76 championship seasons)",
        "NBA Coach of the Year award history"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "bill-sharman",
      "name": "Bill Sharman",
      "span": "1966-1976",
      "wins": 333,
      "losses": 240,
      "pct": 0.581,
      "championships": 1,
      "teams": [
        "San Francisco Warriors",
        "Los Angeles Lakers"
      ],
      "eras": [
        "1960s",
        "1970s"
      ],
      "systemTags": [
        "Fast-Break Offense",
        "Shootaround Pioneer",
        "Conditioning & Preparation"
      ],
      "offense": {
        "tempo": 9,
        "transition": 9,
        "motion": 4,
        "pnr": 4,
        "post": 4,
        "iso": 5,
        "threeEmphasis": 2,
        "insideOut": 4,
        "offBall": 6,
        "ballMovement": 6,
        "starFreedom": 6
      },
      "defense": {
        "man": 7,
        "zone": 2,
        "switching": 3,
        "drop": 6,
        "pressure": 6,
        "helpAggression": 6,
        "rimPriority": 8,
        "defRebPriority": 9
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 5,
        "roleDiscipline": 8,
        "starEmpowerment": 7,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 8,
        "passingBigs": 7,
        "shootingBigs": 3,
        "primaryCreators": 7,
        "multipleCreators": 6,
        "switchableWings": 4,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Dominant rebounding center who can outlet pass",
        "Fast-breaking backcourt creators",
        "Well-conditioned veterans who accept defined roles"
      ],
      "concern": "Chronic voice damage from the 1971-72 season and an aging roster led to a sharp late-career decline and early exit from coaching",
      "documented": [
        "Coached the 1971-72 Los Angeles Lakers to a 69-13 record and a 33-game winning streak, both then all-time records",
        "Won the 1972 NBA championship as Lakers head coach and was named 1972 NBA Coach of the Year",
        "Only coach to win championships in three professional leagues: ABL (1962 Cleveland Pipers), ABA (1971 Utah Stars), NBA (1972 Lakers)",
        "Pioneered the morning game-day shootaround, which became a league-wide standard practice",
        "Led the San Francisco Warriors to the 1967 NBA Finals in his first NBA head coaching season",
        "Enshrined in the Naismith Hall of Fame as both a player (1976) and a coach (2004), and persuaded Wilt Chamberlain to accept a rebounding/defense/outlet role that triggered the Lakers fast break"
      ],
      "inferred": [
        "All 0-10 offense scale values are analyst inference from the documented fast-break system; tempo/transition anchored by the 1971-72 Lakers' league-leading pace and scoring",
        "Defense values inferred from the Wilt-anchored rim-and-rebound scheme; man/zone/switching/drop ratings reflect era norms, not documented scheme details",
        "Management ratings inferred from the documented Chamberlain role redefinition, shootaround/film-study preparation habits, and cross-league adaptability",
        "rosterFit values inferred from the construction of his Warriors, Stars, and Lakers rosters rather than any stated coaching preference"
      ],
      "sources": [
        "Basketball Reference coach page (Bill Sharman)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "NBA.com history: 1971-72 Lakers 33-game winning streak"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "pat-riley",
      "name": "Pat Riley",
      "span": "1981-2008",
      "wins": 1210,
      "losses": 694,
      "pct": 0.636,
      "championships": 5,
      "teams": [
        "Los Angeles Lakers",
        "New York Knicks",
        "Miami Heat"
      ],
      "eras": [
        "1980s",
        "1990s",
        "2000s"
      ],
      "systemTags": [
        "Showtime Fast Break",
        "Physical Man Defense",
        "Culture of Conditioning"
      ],
      "offense": {
        "tempo": 7,
        "transition": 9,
        "motion": 4,
        "pnr": 5,
        "post": 8,
        "iso": 5,
        "threeEmphasis": 3,
        "insideOut": 7,
        "offBall": 4,
        "ballMovement": 6,
        "starFreedom": 8
      },
      "defense": {
        "man": 9,
        "zone": 2,
        "switching": 3,
        "drop": 5,
        "pressure": 7,
        "helpAggression": 7,
        "rimPriority": 7,
        "defRebPriority": 8
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 4,
        "roleDiscipline": 8,
        "starEmpowerment": 8,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 8,
        "passingBigs": 6,
        "shootingBigs": 3,
        "primaryCreators": 8,
        "multipleCreators": 5,
        "switchableWings": 5,
        "shooters": 5,
        "defenders": 9,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Elite transition-pushing point guard",
        "Dominant physical center",
        "Tough, conditioned perimeter defenders"
      ],
      "concern": "Grinding intensity and heavy starter minutes documented to cause player burnout over long stints",
      "documented": [
        "Career NBA regular-season record of 1210-694 (.636) as head coach",
        "Won 5 NBA championships as head coach: 1982, 1985, 1987, 1988 (Lakers) and 2006 (Heat)",
        "Ran the 'Showtime' fast-break offense with the 1980s Lakers, among the fastest-paced attacks of the era",
        "Reinvented himself with the 1990s Knicks and Heat as a slow-paced, physical, defense-and-rebounding coach",
        "First coach to win NBA Coach of the Year with three different franchises (Lakers 1990, Knicks 1993, Heat 1997)",
        "Named one of the 10 Greatest Coaches in NBA History (1996) and inducted into the Naismith Hall of Fame (2008)"
      ],
      "inferred": [
        "All 0-10 numeric scale values (offense, defense, management, rosterFit) are analyst inference calibrated from his documented systems, not recorded statistics",
        "tempo=7 is a composite: Showtime Lakers would rate 10, his Knicks/Heat teams closer to 2",
        "zone=2 reflects his documented commitment to physical man-to-man; zone was illegal for most of his career",
        "rotationDepth, roleDiscipline, starEmpowerment, and tacticalAdjustment values are interpretive judgments from contemporaneous reporting and player accounts",
        "rosterFit values are projections of which archetypes fit his documented systems"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com: 10 Greatest Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com Coach of the Year award history"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "lenny-wilkens",
      "name": "Lenny Wilkens",
      "span": "1969–2005",
      "wins": 1332,
      "losses": 1155,
      "pct": 0.536,
      "championships": 1,
      "teams": [
        "Seattle SuperSonics",
        "Portland Trail Blazers",
        "Cleveland Cavaliers",
        "Atlanta Hawks",
        "Toronto Raptors",
        "New York Knicks"
      ],
      "eras": [
        "1960s",
        "1970s",
        "1980s",
        "1990s",
        "2000s"
      ],
      "systemTags": [
        "Motion Offense",
        "Fundamental Man Defense",
        "Players' Coach"
      ],
      "offense": {
        "tempo": 5,
        "transition": 5,
        "motion": 7,
        "pnr": 6,
        "post": 6,
        "iso": 3,
        "threeEmphasis": 3,
        "insideOut": 6,
        "offBall": 6,
        "ballMovement": 8,
        "starFreedom": 5
      },
      "defense": {
        "man": 8,
        "zone": 2,
        "switching": 3,
        "drop": 6,
        "pressure": 4,
        "helpAggression": 5,
        "rimPriority": 6,
        "defRebPriority": 6
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 6,
        "roleDiscipline": 7,
        "starEmpowerment": 5,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 8,
        "shootingBigs": 4,
        "primaryCreators": 6,
        "multipleCreators": 6,
        "switchableWings": 4,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 5
      },
      "bestWith": [
        "Skilled passing big men",
        "Unselfish halfcourt guards",
        "Defense-first role players"
      ],
      "concern": "Only one title and few deep playoff runs across 32 seasons despite record win total",
      "documented": [
        "Career NBA regular-season record of 1,332-1,155; his 1,332 wins were the all-time NBA record at his retirement in 2005 (losses also an all-time record)",
        "Won the 1979 NBA championship as head coach of the Seattle SuperSonics",
        "1993-94 NBA Coach of the Year with the Atlanta Hawks (57-25 season)",
        "Named one of the Top 10 Coaches in NBA History (1996)",
        "Head coach of the gold-medal-winning 1996 U.S. Olympic team",
        "Inducted into the Naismith Memorial Basketball Hall of Fame as both a player (1989) and a coach (1998)"
      ],
      "inferred": [
        "All 0-10 offense scale values (tempo, transition, motion, pnr, post, iso, threeEmphasis, insideOut, offBall, ballMovement, starFreedom) are analyst inference from documented team styles (e.g. the ball-movement identity of his Price-Daugherty Cavaliers and 1979 Sonics balance)",
        "All defense scale values are inference; his teams' man-to-man fundamentals are widely described but never quantified, and the low zone rating reflects absence of documented zone usage",
        "All management scale values are inference from his reputation as a calm, adaptable players' coach across four decades",
        "All rosterFit values are inference from the rosters he succeeded with (Sikma, Daugherty, Price, Gus Williams)",
        "bestWith and concern phrasing are analyst synthesis, though the underlying playoff-underachievement criticism is well documented"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA Coach of the Year award history",
        "USA Basketball 1996 Olympic team records"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "jack-ramsay",
      "name": "Jack Ramsay",
      "span": "1968-1989",
      "wins": 864,
      "losses": 783,
      "pct": 0.525,
      "championships": 1,
      "teams": [
        "Philadelphia 76ers",
        "Buffalo Braves",
        "Portland Trail Blazers",
        "Indiana Pacers"
      ],
      "eras": [
        "1960s",
        "1970s",
        "1980s"
      ],
      "systemTags": [
        "Motion Offense",
        "Fast Break",
        "Center-Hub Passing"
      ],
      "offense": {
        "tempo": 8,
        "transition": 8,
        "motion": 8,
        "pnr": 4,
        "post": 7,
        "iso": 2,
        "threeEmphasis": 1,
        "insideOut": 7,
        "offBall": 8,
        "ballMovement": 9,
        "starFreedom": 3
      },
      "defense": {
        "man": 8,
        "zone": 3,
        "switching": 3,
        "drop": 5,
        "pressure": 7,
        "helpAggression": 6,
        "rimPriority": 6,
        "defRebPriority": 7
      },
      "management": {
        "adaptability": 6,
        "rotationDepth": 5,
        "roleDiscipline": 8,
        "starEmpowerment": 5,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 6,
        "passingBigs": 9,
        "shootingBigs": 4,
        "primaryCreators": 5,
        "multipleCreators": 6,
        "switchableWings": 5,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 8
      },
      "bestWith": [
        "Elite passing big man as offensive hub",
        "Unselfish transition athletes",
        "Disciplined, conditioned role players"
      ],
      "concern": "System peak depended on a healthy elite hub center; Portland never returned to the Finals after Bill Walton's foot injuries",
      "documented": [
        "Won the 1977 NBA championship as head coach of the Portland Trail Blazers",
        "Career NBA regular-season record of 864-783 as head coach of Philadelphia, Buffalo, Portland, and Indiana (1968-69 through early 1988-89)",
        "Named one of the 10 Greatest Coaches in NBA History by the NBA (1996)",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 1992",
        "The 1976-77 Blazers were famed for fast-break basketball and constant ball/player movement built around Bill Walton's passing from the high post",
        "Won the 1967 NBA title as general manager of the 76ers (front office, not head coach)"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference calibrated from his documented system, not measured statistics",
        "zone rating inferred from his college pressing/zone background at St. Joseph's; NBA zone was illegal during his career",
        "pnr, switching, drop, and helpAggression values are era-typical estimates rather than documented traits",
        "management scales (adaptability, rotationDepth, roleDiscipline, starEmpowerment, tacticalAdjustment) inferred from career narratives and player accounts",
        "rosterFit values extrapolated from the Walton-era Blazers and McAdoo-era Braves rosters"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "Jack Ramsay, The Coach's Art (1978)",
        "David Halberstam, The Breaks of the Game"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "kc-jones",
      "name": "K.C. Jones",
      "span": "1973–1992",
      "wins": 522,
      "losses": 252,
      "pct": 0.674,
      "championships": 2,
      "teams": [
        "Capital/Washington Bullets",
        "Boston Celtics",
        "Seattle SuperSonics"
      ],
      "eras": [
        "1970s",
        "1980s",
        "1990s"
      ],
      "systemTags": [
        "Players' Coach",
        "Post-Centric Halfcourt",
        "Veteran Star Empowerment"
      ],
      "offense": {
        "tempo": 5,
        "transition": 6,
        "motion": 5,
        "pnr": 3,
        "post": 9,
        "iso": 5,
        "threeEmphasis": 2,
        "insideOut": 8,
        "offBall": 7,
        "ballMovement": 8,
        "starFreedom": 8
      },
      "defense": {
        "man": 8,
        "zone": 2,
        "switching": 3,
        "drop": 6,
        "pressure": 3,
        "helpAggression": 5,
        "rimPriority": 7,
        "defRebPriority": 8
      },
      "management": {
        "adaptability": 5,
        "rotationDepth": 4,
        "roleDiscipline": 7,
        "starEmpowerment": 9,
        "tacticalAdjustment": 4
      },
      "rosterFit": {
        "traditionalCenters": 8,
        "passingBigs": 8,
        "shootingBigs": 5,
        "primaryCreators": 6,
        "multipleCreators": 7,
        "switchableWings": 4,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 5
      },
      "bestWith": [
        "Elite post-scoring frontcourts",
        "High-IQ veteran stars",
        "Skilled passing big men"
      ],
      "concern": "Criticized as a hands-off tactician who rode veteran starters with thin rotations",
      "documented": [
        "Career NBA head-coaching regular-season record of 522-252 (.674) with Washington, Boston, and Seattle",
        "Won two NBA championships as Boston Celtics head coach (1984, 1986)",
        "Coached the 1985-86 Celtics to a 67-15 record, widely regarded as one of the greatest teams in NBA history",
        "Reached the NBA Finals in each of his first four seasons as Celtics head coach (1984-1987)",
        "Led the Washington Bullets to the 1975 NBA Finals after a 60-22 season",
        "Naismith Hall of Famer (inducted 1989) who won eight championships as a Celtics player before coaching"
      ],
      "inferred": [
        "All 0-10 offense scale values (tempo, motion, pnr, post, iso, threeEmphasis, insideOut, offBall, ballMovement, starFreedom) are analyst inference from documented rosters (Bird, McHale, Parish, Unseld, Hayes) and era style, not stated schemes",
        "All defense scale values are inferred; zone rating reflects lack of documented zone inclination in an era when NBA zones were illegal",
        "Management ratings (starEmpowerment, tacticalAdjustment, rotationDepth) are inferred from widely reported 'players' coach' reputation and contemporaneous criticism of his rotations and in-game tactics",
        "rosterFit values are inferred from the personnel he succeeded with rather than documented preferences"
      ],
      "sources": [
        "Basketball Reference coach page (K.C. Jones)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com history pages",
        "Boston Celtics franchise history"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "chuck-daly",
      "name": "Chuck Daly",
      "span": "1981-1994, 1997-1999",
      "wins": 638,
      "losses": 437,
      "pct": 0.594,
      "championships": 2,
      "teams": [
        "Cleveland Cavaliers",
        "Detroit Pistons",
        "New Jersey Nets",
        "Orlando Magic"
      ],
      "eras": [
        "1980s",
        "1990s"
      ],
      "systemTags": [
        "Bad Boys Defense",
        "Jordan Rules",
        "Players' Coach"
      ],
      "offense": {
        "tempo": 3,
        "transition": 4,
        "motion": 4,
        "pnr": 5,
        "post": 6,
        "iso": 6,
        "threeEmphasis": 2,
        "insideOut": 5,
        "offBall": 5,
        "ballMovement": 5,
        "starFreedom": 7
      },
      "defense": {
        "man": 9,
        "zone": 2,
        "switching": 3,
        "drop": 5,
        "pressure": 6,
        "helpAggression": 8,
        "rimPriority": 8,
        "defRebPriority": 8
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 8,
        "roleDiscipline": 8,
        "starEmpowerment": 8,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 6,
        "passingBigs": 5,
        "shootingBigs": 7,
        "primaryCreators": 8,
        "multipleCreators": 6,
        "switchableWings": 5,
        "shooters": 5,
        "defenders": 9,
        "transitionAthletes": 4
      },
      "bestWith": [
        "Physical, tough-minded defenders",
        "Elite point-guard creator",
        "Deep veteran bench with defined roles"
      ],
      "concern": "Offense could stagnate into a grinding, iso-heavy half-court attack; teams were rarely elite offensively",
      "documented": [
        "Career NBA regular-season record of 638-437 (.594) across Cleveland, Detroit, New Jersey, and Orlando",
        "Back-to-back NBA championships as Detroit Pistons head coach (1989, 1990)",
        "Architect of the 'Bad Boys' Pistons physical defense and the 'Jordan Rules' scheme against Michael Jordan",
        "Head coach of the 1992 USA Olympic 'Dream Team' gold medalists",
        "Named one of the 10 Greatest Coaches in NBA History (1996)",
        "Inducted into the Naismith Memorial Basketball Hall of Fame as a coach (1994)"
      ],
      "inferred": [
        "All 0-10 offensive scheme ratings (tempo, pnr, post, iso, threeEmphasis, offBall, ballMovement, starFreedom) are analyst inference from the documented Bad Boys system and roster usage, not measured values",
        "zone, switching, and drop ratings are inferred; illegal-defense rules of his era limit direct evidence of zone inclination",
        "Management scales are inferred from his documented 'players' coach' reputation, Dream Team ego management, and famously deep Pistons rotations",
        "rosterFit values are inferred from the construction of his championship rosters",
        "helpAggression, rimPriority, and defRebPriority are inferred from the documented Jordan Rules and 'no easy layups' identity"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA official history of the 1989-1990 Detroit Pistons"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "don-nelson",
      "name": "Don Nelson",
      "span": "1976-2010",
      "wins": 1335,
      "losses": 1063,
      "pct": 0.557,
      "championships": 0,
      "teams": [
        "Milwaukee Bucks",
        "Golden State Warriors",
        "New York Knicks",
        "Dallas Mavericks"
      ],
      "eras": [
        "1970s",
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Nellie Ball",
        "Small-Ball Pioneer",
        "Point Forward"
      ],
      "offense": {
        "tempo": 9,
        "transition": 9,
        "motion": 6,
        "pnr": 6,
        "post": 5,
        "iso": 7,
        "threeEmphasis": 8,
        "insideOut": 4,
        "offBall": 6,
        "ballMovement": 7,
        "starFreedom": 8
      },
      "defense": {
        "man": 4,
        "zone": 6,
        "switching": 7,
        "drop": 2,
        "pressure": 6,
        "helpAggression": 5,
        "rimPriority": 2,
        "defRebPriority": 2
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 7,
        "roleDiscipline": 3,
        "starEmpowerment": 7,
        "tacticalAdjustment": 8
      },
      "rosterFit": {
        "traditionalCenters": 1,
        "passingBigs": 8,
        "shootingBigs": 9,
        "primaryCreators": 8,
        "multipleCreators": 8,
        "switchableWings": 8,
        "shooters": 8,
        "defenders": 4,
        "transitionAthletes": 9
      },
      "bestWith": [
        "Skilled shooting bigs",
        "Versatile playmaking wings",
        "Up-tempo perimeter scorers"
      ],
      "concern": "Defense-optional small lineups; never reached the NBA Finals as a head coach",
      "documented": [
        "1,335 career regular-season wins, the most in NBA history at his 2010 retirement (1335-1063, .557)",
        "Three-time NBA Coach of the Year (1983, 1985, 1992)",
        "Pioneered small-ball 'Nellie Ball' and the point-forward role (Paul Pressey in Milwaukee)",
        "Head coached the Bucks, Warriors (two stints), Knicks, and Mavericks between 1976 and 2010",
        "Led the 2007 'We Believe' Warriors to the first 8-over-1 upset in a best-of-seven NBA playoff series",
        "Named one of the 10 Greatest Coaches in NBA History (1996); Naismith Hall of Fame inductee (2012); zero championships as head coach"
      ],
      "inferred": [
        "All 0-10 offense ratings are analyst inference from his documented up-tempo, small-ball, mismatch-hunting system (tempo/transition/threeEmphasis anchored to Nellie Ball reputation, exact scheme splits like motion vs pnr are estimates)",
        "All defense ratings are inference; his poor rim protection and rebounding trade-offs are widely documented criticisms, but zone, pressure, and help numbers are estimates from his experimental, gimmick-friendly reputation",
        "Management ratings (adaptability, roleDiscipline, starEmpowerment) are inferred from his innovator reputation and documented star frictions (e.g., Chris Webber)",
        "rosterFit values are projections of Nellie Ball onto roster archetypes, not documented facts",
        "bestWith phrases are analyst synthesis"
      ],
      "sources": [
        "Basketball Reference coach page (Don Nelson)",
        "Naismith Memorial Basketball Hall of Fame profile (Class of 2012)",
        "NBA.com: 10 Greatest Coaches in NBA History (1996)",
        "NBA Coach of the Year award records",
        "2007 NBA Playoffs records (Warriors vs. Mavericks first round)"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "jerry-sloan",
      "name": "Jerry Sloan",
      "span": "1979-2011",
      "wins": 1221,
      "losses": 803,
      "pct": 0.603,
      "championships": 0,
      "teams": [
        "Chicago Bulls",
        "Utah Jazz"
      ],
      "eras": [
        "1970s",
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Flex Offense",
        "Pick-and-Roll",
        "Hard-Nosed Discipline"
      ],
      "offense": {
        "tempo": 4,
        "transition": 4,
        "motion": 8,
        "pnr": 10,
        "post": 7,
        "iso": 2,
        "threeEmphasis": 3,
        "insideOut": 6,
        "offBall": 8,
        "ballMovement": 7,
        "starFreedom": 3
      },
      "defense": {
        "man": 9,
        "zone": 1,
        "switching": 2,
        "drop": 7,
        "pressure": 6,
        "helpAggression": 6,
        "rimPriority": 7,
        "defRebPriority": 7
      },
      "management": {
        "adaptability": 3,
        "rotationDepth": 4,
        "roleDiscipline": 10,
        "starEmpowerment": 4,
        "tacticalAdjustment": 4
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 6,
        "shootingBigs": 5,
        "primaryCreators": 8,
        "multipleCreators": 3,
        "switchableWings": 4,
        "shooters": 5,
        "defenders": 7,
        "transitionAthletes": 4
      },
      "bestWith": [
        "Elite pick-and-roll point guard",
        "Physical scoring power forward",
        "Tough, disciplined role players"
      ],
      "concern": "Never won a championship; famously inflexible with his system and rotations",
      "documented": [
        "Career NBA head-coaching record of 1,221-803 (.603), third-most wins all-time at his 2011 retirement",
        "Coached the Utah Jazz for 23 seasons (1988-2011), one of the longest single-team tenures in major U.S. pro sports",
        "Led the Jazz to back-to-back NBA Finals appearances in 1997 and 1998, losing both to the Chicago Bulls",
        "First NBA coach to win 1,000 games with a single franchise (Utah Jazz)",
        "Enshrined in the Naismith Memorial Basketball Hall of Fame in 2009 as a coach",
        "Renowned for running the flex offense and the Stockton-to-Malone pick-and-roll for over two decades; never won Coach of the Year despite his win total"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference derived from his documented flex/pick-and-roll system, Jazz pace and defensive reputation, and contemporary accounts",
        "pnr=10 and roleDiscipline=10 are the ratings most directly supported by documented evidence; tempo, pressure, helpAggression, and all rosterFit values are softer inferences",
        "bestWith and concern phrasing are interpretive summaries of documented history"
      ],
      "sources": [
        "Basketball Reference coach page (Jerry Sloan)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com 75th Anniversary: 15 Greatest Coaches in NBA History (2022)",
        "Utah Jazz franchise history / NBA.com"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "phil-jackson",
      "name": "Phil Jackson",
      "span": "1989-2011",
      "wins": 1155,
      "losses": 485,
      "pct": 0.704,
      "championships": 11,
      "teams": [
        "Chicago Bulls",
        "Los Angeles Lakers"
      ],
      "eras": [
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Triangle Offense",
        "Zen Management",
        "Star Empowerment"
      ],
      "offense": {
        "tempo": 4,
        "transition": 4,
        "motion": 8,
        "pnr": 2,
        "post": 8,
        "iso": 6,
        "threeEmphasis": 3,
        "insideOut": 8,
        "offBall": 8,
        "ballMovement": 8,
        "starFreedom": 8
      },
      "defense": {
        "man": 8,
        "zone": 2,
        "switching": 3,
        "drop": 5,
        "pressure": 7,
        "helpAggression": 6,
        "rimPriority": 6,
        "defRebPriority": 6
      },
      "management": {
        "adaptability": 4,
        "rotationDepth": 4,
        "roleDiscipline": 8,
        "starEmpowerment": 10,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 8,
        "shootingBigs": 5,
        "primaryCreators": 8,
        "multipleCreators": 5,
        "switchableWings": 7,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 4
      },
      "bestWith": [
        "Elite wing superstar scorer",
        "Skilled passing big man",
        "Long, versatile defensive wings"
      ],
      "concern": "Rigid commitment to the triangle system and dependence on transcendent superstar talent; never built a contender without it",
      "documented": [
        "11 NBA championships as a head coach (6 with the Chicago Bulls 1991-1998, 5 with the Los Angeles Lakers 2000-2010), the most in NBA history",
        "Career regular-season record of 1,155-485 (.704), the highest winning percentage among NBA coaches with 500+ games",
        "Coached the 1995-96 Bulls to a then-record 72-10 regular season",
        "Ran the Triangle Offense, developed with assistant Tex Winter, as his signature system throughout his head-coaching career",
        "Named one of the Top 10 Coaches in NBA History (1996) and to the NBA 75th Anniversary Team's 15 Greatest Coaches list (2021)",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 2007; nicknamed the 'Zen Master' for his mindfulness-based player management"
      ],
      "inferred": [
        "All 0-10 numeric slider values are analyst inferences calibrated from documented systems, not directly recorded statistics",
        "Offense sliders (low pnr, high post/insideOut/offBall/ballMovement, moderate tempo) inferred from the documented structure of the Triangle Offense",
        "starFreedom and iso values inferred from documented late-game usage of Michael Jordan and Kobe Bryant within the system",
        "Defense sliders inferred from the Bulls' documented ball-pressure/trapping identity (Jordan-Pippen) and the Lakers' Shaq-anchored interior schemes; no signature documented zone usage",
        "Management sliders (short playoff rotations, reluctance to call timeouts, elite star handling, limited system flexibility) inferred from widely reported coaching reputation and his own writings",
        "rosterFit values inferred from the archetypes of his championship rosters rather than any stated preference"
      ],
      "sources": [
        "Basketball Reference coach page (Phil Jackson)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com: Top 10 Coaches in NBA History (1996)",
        "NBA.com: 75th Anniversary 15 Greatest Coaches (2021)",
        "Phil Jackson, 'Eleven Rings: The Soul of Success' (memoir)"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "larry-brown",
      "name": "Larry Brown",
      "span": "1976–2011 (NBA head coach)",
      "wins": 1098,
      "losses": 904,
      "pct": 0.548,
      "championships": 1,
      "teams": [
        "Denver Nuggets",
        "New Jersey Nets",
        "San Antonio Spurs",
        "Los Angeles Clippers",
        "Indiana Pacers",
        "Philadelphia 76ers",
        "Detroit Pistons",
        "New York Knicks",
        "Charlotte Bobcats"
      ],
      "eras": [
        "1970s",
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Play The Right Way",
        "Defense-First Discipline",
        "Passing-Game Offense"
      ],
      "offense": {
        "tempo": 4,
        "transition": 5,
        "motion": 8,
        "pnr": 5,
        "post": 5,
        "iso": 4,
        "threeEmphasis": 2,
        "insideOut": 6,
        "offBall": 6,
        "ballMovement": 8,
        "starFreedom": 3
      },
      "defense": {
        "man": 9,
        "zone": 2,
        "switching": 3,
        "drop": 5,
        "pressure": 7,
        "helpAggression": 7,
        "rimPriority": 7,
        "defRebPriority": 7
      },
      "management": {
        "adaptability": 6,
        "rotationDepth": 4,
        "roleDiscipline": 9,
        "starEmpowerment": 3,
        "tacticalAdjustment": 8
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 6,
        "shootingBigs": 4,
        "primaryCreators": 6,
        "multipleCreators": 4,
        "switchableWings": 6,
        "shooters": 4,
        "defenders": 9,
        "transitionAthletes": 5
      },
      "bestWith": [
        "True pass-first point guards",
        "Tough veteran perimeter and rim defenders",
        "Selfless, ego-free role players"
      ],
      "concern": "Chronic clashes with star players and front offices leading to short tenures",
      "documented": [
        "Only head coach to win both an NCAA championship (Kansas, 1988) and an NBA championship (Detroit Pistons, 2004)",
        "Won the 2004 NBA title with a defense-first, team-oriented Pistons roster that beat the star-laden Lakers in five games",
        "NBA Coach of the Year in 2001 after leading the Philadelphia 76ers to the NBA Finals",
        "Head-coached a record nine NBA franchises and took a record eight different franchises to the playoffs",
        "Three-time ABA Coach of the Year before his NBA head-coaching career",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 2002"
      ],
      "inferred": [
        "All 0-10 numeric values in offense, defense, management, and rosterFit are analyst inference calibrated from his documented 'play the right way' philosophy, Dean Smith/North Carolina coaching lineage, and team statistical profiles — not directly documented ratings",
        "tempo (4) blends his fast late-1970s Denver teams with his slow, grinding 2000s Sixers/Pistons teams",
        "zone (2) inferred from his lifelong man-to-man orientation; he made little documented use of zone after its 2001 legalization",
        "iso (4) and starFreedom (3) reflect the tension between his motion/ball-movement ideals and his pragmatic accommodation of Allen Iverson's iso-heavy usage",
        "starEmpowerment (3) and the concern field are inferred characterizations of well-reported feuds (Iverson, Marbury) rather than quantified facts",
        "rosterFit values are projections of the player archetypes he demonstrably won with (2004 Pistons, 2001 Sixers defenses)"
      ],
      "sources": [
        "Basketball Reference coach page (Larry Brown)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com coach biography and 2004 Finals coverage",
        "NCAA/University of Kansas 1988 championship records"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "rudy-tomjanovich",
      "name": "Rudy Tomjanovich",
      "span": "1992-2005",
      "wins": 527,
      "losses": 416,
      "pct": 0.559,
      "championships": 2,
      "teams": [
        "Houston Rockets",
        "Los Angeles Lakers"
      ],
      "eras": [
        "1990s",
        "2000s"
      ],
      "systemTags": [
        "Inside-Out Offense",
        "Post-Centric Spacing",
        "Early 3-Point Volume"
      ],
      "offense": {
        "tempo": 4,
        "transition": 4,
        "motion": 3,
        "pnr": 5,
        "post": 9,
        "iso": 4,
        "threeEmphasis": 8,
        "insideOut": 10,
        "offBall": 4,
        "ballMovement": 5,
        "starFreedom": 8
      },
      "defense": {
        "man": 7,
        "zone": 2,
        "switching": 4,
        "drop": 5,
        "pressure": 3,
        "helpAggression": 6,
        "rimPriority": 8,
        "defRebPriority": 5
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 5,
        "roleDiscipline": 6,
        "starEmpowerment": 8,
        "tacticalAdjustment": 7
      },
      "rosterFit": {
        "traditionalCenters": 9,
        "passingBigs": 7,
        "shootingBigs": 5,
        "primaryCreators": 6,
        "multipleCreators": 5,
        "switchableWings": 5,
        "shooters": 9,
        "defenders": 6,
        "transitionAthletes": 4
      },
      "bestWith": [
        "Dominant low-post center",
        "Spot-up three-point shooters",
        "Veteran star-led locker room"
      ],
      "concern": "System and defense hinged on an elite post anchor; teams declined sharply once Hakeem Olajuwon faded",
      "documented": [
        "Won back-to-back NBA championships as Houston Rockets head coach in 1994 and 1995",
        "Career NBA regular-season head coaching record of 527-416 (.559) with Houston (1992-2003) and the Los Angeles Lakers (2004-05, resigned mid-season)",
        "The 1995 Rockets won the title as a No. 6 seed, defeating four 50-plus-win teams in one playoff run",
        "His mid-1990s Rockets were among the NBA leaders in three-point attempts, spacing the floor around Hakeem Olajuwon's post game in a signature inside-out attack",
        "Coached Team USA to the gold medal at the 2000 Sydney Olympics",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 2020"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference calibrated from documented systems, not measured values",
        "Offense: tempo, transition, motion, pnr, iso, offBall, ballMovement, and starFreedom scores inferred from the documented inside-out/post-spacing identity",
        "post, insideOut, and threeEmphasis scores are inferences anchored to documented three-point volume and Olajuwon-centric offense",
        "Defense: all scheme ratings (man, zone, switching, drop, pressure, helpAggression, rimPriority, defRebPriority) inferred from Olajuwon-anchored man defense; zone rating reflects lack of documented zone inclination",
        "Management ratings inferred from his player's-coach reputation, the 1995 small-ball/Drexler midseason integration, and star-trust anecdotes",
        "All rosterFit weights are analyst inference from the systems above"
      ],
      "sources": [
        "Basketball Reference coach page (Rudy Tomjanovich)",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com coach biography and NBA Finals records",
        "USA Basketball 2000 Olympic team archives"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "gregg-popovich",
      "name": "Gregg Popovich",
      "span": "1996–2025",
      "wins": 1422,
      "losses": 869,
      "pct": 0.621,
      "championships": 5,
      "teams": [
        "San Antonio Spurs"
      ],
      "eras": [
        "1990s",
        "2000s",
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Beautiful Game Motion",
        "Inside-Out Post Foundation",
        "Corner-Three Pioneer"
      ],
      "offense": {
        "tempo": 4,
        "transition": 5,
        "motion": 9,
        "pnr": 7,
        "post": 8,
        "iso": 2,
        "threeEmphasis": 6,
        "insideOut": 8,
        "offBall": 8,
        "ballMovement": 9,
        "starFreedom": 4
      },
      "defense": {
        "man": 9,
        "zone": 2,
        "switching": 4,
        "drop": 8,
        "pressure": 3,
        "helpAggression": 5,
        "rimPriority": 9,
        "defRebPriority": 8
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 9,
        "roleDiscipline": 9,
        "starEmpowerment": 6,
        "tacticalAdjustment": 9
      },
      "rosterFit": {
        "traditionalCenters": 8,
        "passingBigs": 8,
        "shootingBigs": 6,
        "primaryCreators": 6,
        "multipleCreators": 7,
        "switchableWings": 7,
        "shooters": 8,
        "defenders": 9,
        "transitionAthletes": 5
      },
      "bestWith": [
        "Elite two-way anchor big",
        "Unselfish high-IQ role players",
        "3-and-D wings who accept defined roles"
      ],
      "concern": "Openly disdained three-point volume; post-2019 rebuild years produced sustained losing that dragged his career win percentage down",
      "documented": [
        "All-time NBA leader in regular-season coaching wins (passed Don Nelson's 1,335 in March 2022; finished with 1,422)",
        "5 NBA championships as Spurs head coach: 1999, 2003, 2005, 2007, 2014",
        "22 consecutive playoff appearances (1997-98 through 2018-19), an NBA record streak",
        "3x NBA Coach of the Year (2003, 2012, 2014)",
        "Pioneer of rest/load management; fined $250,000 in 2012 for sending stars home before a Miami game",
        "Head coach of Team USA's 2020 Tokyo Olympic gold-medal team; Naismith Hall of Fame Class of 2023"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference calibrated from documented systems, not measured facts",
        "tempo and transition ratings inferred from Duncan-era slow pace versus faster mid-2010s Beautiful Game teams",
        "zone, switching, drop, pressure, and helpAggression values inferred from the Spurs' documented conservative, rim-protecting man scheme",
        "threeEmphasis balances his documented corner-three efficiency engineering against his well-quoted dislike of three-point volume",
        "starFreedom and starEmpowerment inferred from system-first culture (Duncan/Parker/Ginobili sacrifice, Ginobili's bench role)",
        "all rosterFit weights and bestWith phrases are analyst inference from roster construction patterns"
      ],
      "sources": [
        "Basketball Reference coach page (Gregg Popovich)",
        "NBA.com all-time coaching wins records",
        "Naismith Memorial Basketball Hall of Fame profile (Class of 2023)",
        "NBA Coach of the Year award history",
        "USA Basketball 2020 Tokyo Olympics records"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "rick-adelman",
      "name": "Rick Adelman",
      "span": "1988–2014",
      "wins": 1042,
      "losses": 749,
      "pct": 0.582,
      "championships": 0,
      "teams": [
        "Portland Trail Blazers",
        "Golden State Warriors",
        "Sacramento Kings",
        "Houston Rockets",
        "Minnesota Timberwolves"
      ],
      "eras": [
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Corner Offense",
        "Princeton Principles",
        "Passing-Big Hubs"
      ],
      "offense": {
        "tempo": 7,
        "transition": 8,
        "motion": 9,
        "pnr": 5,
        "post": 6,
        "iso": 3,
        "threeEmphasis": 6,
        "insideOut": 7,
        "offBall": 9,
        "ballMovement": 9,
        "starFreedom": 6
      },
      "defense": {
        "man": 6,
        "zone": 3,
        "switching": 3,
        "drop": 6,
        "pressure": 4,
        "helpAggression": 5,
        "rimPriority": 6,
        "defRebPriority": 5
      },
      "management": {
        "adaptability": 8,
        "rotationDepth": 7,
        "roleDiscipline": 6,
        "starEmpowerment": 7,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 6,
        "passingBigs": 9,
        "shootingBigs": 7,
        "primaryCreators": 6,
        "multipleCreators": 8,
        "switchableWings": 5,
        "shooters": 8,
        "defenders": 5,
        "transitionAthletes": 8
      },
      "bestWith": [
        "Elite passing big men",
        "Smart cutters and movement shooters",
        "Deep, unselfish second units"
      ],
      "concern": "Never won a championship; teams were often defensively soft relative to their elite offenses",
      "documented": [
        "Career NBA regular-season record of 1042-749 (.582) as a head coach, one of only a handful of coaches to reach 1,000 wins (milestone reached in 2013 with Minnesota)",
        "Led the Portland Trail Blazers to two NBA Finals appearances (1990 and 1992), losing to Detroit and Chicago",
        "Coached the Sacramento Kings to eight consecutive playoff appearances (1999-2006), including a franchise-record 61-win season in 2001-02 and a Game 7 Western Conference Finals loss to the Lakers",
        "Famous for the 'corner offense,' a Princeton-influenced motion system run through skilled passing big men such as Vlade Divac, Chris Webber, and Brad Miller, with heavy cutting and backdoor action",
        "His early-2000s Kings were widely recognized as one of the league's fastest-paced, highest-assist offenses",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 2021"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference calibrated from his documented systems rather than measured values",
        "Defensive scheme ratings (zone, switching, drop, pressure, helpAggression, rimPriority, defRebPriority) are inferred from roster construction and era norms; defense was never a documented Adelman signature",
        "Management ratings (adaptability, rotationDepth, roleDiscipline, starEmpowerment, tacticalAdjustment) are inferred from his adaptation across five franchises and Sacramento's noted bench depth",
        "RosterFit values are inferred projections from which player types (passing bigs, cutters, shooters) demonstrably thrived in his offense"
      ],
      "sources": [
        "Basketball Reference coach page",
        "Naismith Memorial Basketball Hall of Fame profile (Class of 2021)",
        "NBA.com coach biography and franchise histories"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "george-karl",
      "name": "George Karl",
      "span": "1984–2016",
      "wins": 1175,
      "losses": 824,
      "pct": 0.588,
      "championships": 0,
      "teams": [
        "Cleveland Cavaliers",
        "Golden State Warriors",
        "Seattle SuperSonics",
        "Milwaukee Bucks",
        "Denver Nuggets",
        "Sacramento Kings"
      ],
      "eras": [
        "1980s",
        "1990s",
        "2000s",
        "2010s"
      ],
      "systemTags": [
        "Up-Tempo Transition",
        "Trapping Pressure Defense",
        "Early Offense"
      ],
      "offense": {
        "tempo": 9,
        "transition": 9,
        "motion": 6,
        "pnr": 6,
        "post": 4,
        "iso": 3,
        "threeEmphasis": 4,
        "insideOut": 6,
        "offBall": 5,
        "ballMovement": 7,
        "starFreedom": 4
      },
      "defense": {
        "man": 7,
        "zone": 4,
        "switching": 7,
        "drop": 3,
        "pressure": 9,
        "helpAggression": 8,
        "rimPriority": 4,
        "defRebPriority": 4
      },
      "management": {
        "adaptability": 7,
        "rotationDepth": 7,
        "roleDiscipline": 5,
        "starEmpowerment": 3,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 3,
        "passingBigs": 6,
        "shootingBigs": 5,
        "primaryCreators": 6,
        "multipleCreators": 7,
        "switchableWings": 8,
        "shooters": 5,
        "defenders": 8,
        "transitionAthletes": 9
      },
      "bestWith": [
        "athletic transition finishers",
        "versatile switchable defenders",
        "deep energetic benches"
      ],
      "concern": "Repeated playoff underachievement and documented friction with star players",
      "documented": [
        "1,175 career regular-season wins (1175-824, .588), among the six winningest head coaches in NBA history",
        "Never won an NBA championship as head coach; lost the 1996 NBA Finals to Chicago with the 64-18 Seattle SuperSonics",
        "2012-13 NBA Coach of the Year with the 57-25 Denver Nuggets",
        "His top-seeded 1994 Sonics suffered the first 1-vs-8 playoff series loss in NBA history (to Denver)",
        "Seattle teams of the mid-1990s were famed for trapping, pressing, switching defense built around Gary Payton and Shawn Kemp",
        "Inducted into the Naismith Memorial Basketball Hall of Fame in 2022"
      ],
      "inferred": [
        "All 0-10 offense scale values are analyst inference from his documented up-tempo, early-offense, paint-attacking systems (Seattle, Milwaukee, Denver)",
        "All 0-10 defense scale values are inference from the documented trapping/pressure identity of his Sonics and Nuggets teams; the zone rating is an inference about inclination, not a documented zone scheme",
        "Management ratings (especially low starEmpowerment) are inferred from widely reported conflicts with Ray Allen, Carmelo Anthony, and DeMarcus Cousins rather than from any formal record",
        "rosterFit values are inferred from the archetypes of players he succeeded with (Payton, Kemp, the 2013 Nuggets athletes) and struggled with (post-centric, iso-heavy stars)"
      ],
      "sources": [
        "Basketball Reference coach page",
        "Naismith Memorial Basketball Hall of Fame profile",
        "NBA.com coaches records and Coach of the Year history"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "rick-carlisle",
      "name": "Rick Carlisle",
      "span": "2001–present (totals through 2024-25)",
      "wins": 993,
      "losses": 860,
      "pct": 0.536,
      "championships": 1,
      "teams": [
        "Detroit Pistons",
        "Indiana Pacers",
        "Dallas Mavericks"
      ],
      "eras": [
        "2000s",
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Flow Offense",
        "Elite ATO Playcalling",
        "Situational Zone Looks"
      ],
      "offense": {
        "tempo": 6,
        "transition": 6,
        "motion": 7,
        "pnr": 7,
        "post": 4,
        "iso": 5,
        "threeEmphasis": 7,
        "insideOut": 5,
        "offBall": 6,
        "ballMovement": 8,
        "starFreedom": 5
      },
      "defense": {
        "man": 7,
        "zone": 7,
        "switching": 5,
        "drop": 5,
        "pressure": 6,
        "helpAggression": 6,
        "rimPriority": 6,
        "defRebPriority": 5
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 7,
        "roleDiscipline": 7,
        "starEmpowerment": 6,
        "tacticalAdjustment": 9
      },
      "rosterFit": {
        "traditionalCenters": 5,
        "passingBigs": 6,
        "shootingBigs": 8,
        "primaryCreators": 8,
        "multipleCreators": 7,
        "switchableWings": 6,
        "shooters": 8,
        "defenders": 6,
        "transitionAthletes": 7
      },
      "bestWith": [
        "Elite playmaking point guard",
        "Stretch bigs who space the floor",
        "Deep, disciplined rotation"
      ],
      "concern": "Documented friction with young franchise stars over offensive control (Dončić-era Dallas)",
      "documented": [
        "Won the 2011 NBA championship as Dallas Mavericks head coach, upsetting the Miami Heat in six games",
        "Named 2001-02 NBA Coach of the Year with Detroit; went 50-32 in each of his two Pistons seasons",
        "Famously deployed zone defense and rotation adjustments (e.g., inserting J.J. Barea) during the 2011 Finals",
        "Led the 2003-04 Indiana Pacers to a franchise-best 61-21 record in his first season there",
        "Coached the Indiana Pacers to the 2025 NBA Finals behind one of the league's fastest-paced, highest-passing offenses",
        "Won an NBA title as a player (1986 Boston Celtics) and as a head coach (2011 Dallas Mavericks); longtime NBCA president"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference from documented systems, not recorded stats",
        "zone rating is inferred from documented 2011 Finals zone usage and his general willingness to show junk/zone looks",
        "tempo and transition ratings blend his slow early-2000s Detroit/Indiana teams with the league-fastest 2023-25 Pacers, reflecting adaptability rather than one fixed style",
        "starFreedom and starEmpowerment reflect media-reported Dončić friction alongside documented empowerment of Kidd and Haliburton",
        "rosterFit values are inferred from the personnel his best teams were built around (Nowitzki, Kidd, Chandler, Haliburton, Turner)"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com official coach bio",
        "NBA.com 2011 Finals archives",
        "Associated Press NBA Coach of the Year records"
      ],
      "confidence": "MEDIUM"
    },
    {
      "id": "mike-dantoni",
      "name": "Mike D'Antoni",
      "span": "1998-2020",
      "wins": 672,
      "losses": 527,
      "pct": 0.56,
      "championships": 0,
      "teams": [
        "Denver Nuggets",
        "Phoenix Suns",
        "New York Knicks",
        "Los Angeles Lakers",
        "Houston Rockets"
      ],
      "eras": [
        "1990s",
        "2000s",
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Seven Seconds or Less",
        "Pace and Space",
        "Spread Pick-and-Roll"
      ],
      "offense": {
        "tempo": 10,
        "transition": 10,
        "motion": 4,
        "pnr": 10,
        "post": 1,
        "iso": 7,
        "threeEmphasis": 10,
        "insideOut": 4,
        "offBall": 4,
        "ballMovement": 6,
        "starFreedom": 9
      },
      "defense": {
        "man": 6,
        "zone": 3,
        "switching": 9,
        "drop": 3,
        "pressure": 4,
        "helpAggression": 4,
        "rimPriority": 4,
        "defRebPriority": 3
      },
      "management": {
        "adaptability": 8,
        "rotationDepth": 2,
        "roleDiscipline": 7,
        "starEmpowerment": 10,
        "tacticalAdjustment": 6
      },
      "rosterFit": {
        "traditionalCenters": 2,
        "passingBigs": 4,
        "shootingBigs": 8,
        "primaryCreators": 10,
        "multipleCreators": 6,
        "switchableWings": 8,
        "shooters": 10,
        "defenders": 6,
        "transitionAthletes": 8
      },
      "bestWith": [
        "Elite pick-and-roll ballhandler",
        "Floor-spacing shooters everywhere",
        "Switchable 3-and-D wings"
      ],
      "concern": "No titles or Finals as head coach; short rotations, weak defensive rebounding, and playoff offensive droughts",
      "documented": [
        "Career NBA regular-season record of 672-527 (.560) as head coach of Denver, Phoenix, New York, the LA Lakers, and Houston",
        "Pioneered the 'Seven Seconds or Less' up-tempo spread offense with Steve Nash's Phoenix Suns (2004-2008), including back-to-back 60-win-pace seasons",
        "Two-time NBA Coach of the Year (2004-05 Suns, 2016-17 Rockets)",
        "His 2017-18 Rockets went a franchise-record 65-17 and his Houston teams set NBA records for three-point attempt volume and led the league in 3PA",
        "The 2017-18 Rockets ran a famous switch-everything defensive scheme and lost Game 7 of the Western Conference Finals; he never reached the NBA Finals as a head coach",
        "Elected to the Naismith Basketball Hall of Fame (Class of 2025)"
      ],
      "inferred": [
        "All 0-10 numeric ratings are analyst inference derived from documented systems and results, not directly documented figures",
        "Offense scales inferred from the documented Seven Seconds or Less and Moreyball/spread pick-and-roll systems (tempo, pnr, threeEmphasis anchored at 10 by famous documentation; motion, insideOut, offBall, ballMovement, iso are judgment calls)",
        "Defense scales inferred from the 2017-18 Rockets switching scheme and the Suns' documented defensive/rebounding weaknesses",
        "Management scales (rotationDepth, starEmpowerment, adaptability) inferred from widely reported short rotations and offenses built around Nash and Harden",
        "rosterFit values are entirely analyst inference from personnel he succeeded and struggled with (e.g., stretch bigs vs. traditional post centers)"
      ],
      "sources": [
        "Basketball Reference coach page",
        "Naismith Basketball Hall of Fame profile",
        "NBA.com Coach of the Year award history",
        "'Seven Seconds or Less' by Jack McCallum (2006)"
      ],
      "confidence": "HIGH"
    },
    {
      "id": "doc-rivers",
      "name": "Doc Rivers",
      "span": "1999-present (record through 2024-25)",
      "wins": 1162,
      "losses": 816,
      "pct": 0.587,
      "championships": 1,
      "teams": [
        "Orlando Magic",
        "Boston Celtics",
        "Los Angeles Clippers",
        "Philadelphia 76ers",
        "Milwaukee Bucks"
      ],
      "eras": [
        "1990s",
        "2000s",
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Ubuntu Culture",
        "Strong-Side Help Defense",
        "Veteran Star Management"
      ],
      "offense": {
        "tempo": 4,
        "transition": 5,
        "motion": 4,
        "pnr": 7,
        "post": 5,
        "iso": 6,
        "threeEmphasis": 5,
        "insideOut": 6,
        "offBall": 6,
        "ballMovement": 5,
        "starFreedom": 8
      },
      "defense": {
        "man": 8,
        "zone": 3,
        "switching": 5,
        "drop": 7,
        "pressure": 5,
        "helpAggression": 8,
        "rimPriority": 7,
        "defRebPriority": 6
      },
      "management": {
        "adaptability": 4,
        "rotationDepth": 4,
        "roleDiscipline": 7,
        "starEmpowerment": 9,
        "tacticalAdjustment": 4
      },
      "rosterFit": {
        "traditionalCenters": 7,
        "passingBigs": 5,
        "shootingBigs": 5,
        "primaryCreators": 8,
        "multipleCreators": 6,
        "switchableWings": 5,
        "shooters": 6,
        "defenders": 7,
        "transitionAthletes": 6
      },
      "bestWith": [
        "Veteran star-laden cores",
        "Elite floor-general point guards",
        "Defensive anchor centers"
      ],
      "concern": "Repeated playoff underachievement, including a record three blown 3-1 series leads (2003, 2015, 2020) and questioned in-series adjustments",
      "documented": [
        "Won the 2008 NBA championship as head coach of the Boston Celtics, defeating the Lakers in six games",
        "Named 2000 NBA Coach of the Year after leading the 'Heart and Hustle' Orlando Magic to a 41-41 record",
        "One of fewer than ten NBA head coaches to reach 1,000 career regular-season wins (milestone reached in 2021 with Philadelphia)",
        "Head coach of the Magic (1999-2003), Celtics (2004-13), Clippers (2013-20), 76ers (2020-23), and Bucks (2024-present)",
        "Reached two NBA Finals with Boston (2008, 2010); the 2007-08 Celtics' 'Ubuntu' unity philosophy and Tom Thibodeau-assisted strong-side defense are widely documented",
        "Holds the record for most 3-1 playoff series leads lost by a head coach (three: 2003 Magic, 2015 Clippers, 2020 Clippers)"
      ],
      "inferred": [
        "All 0-10 numeric scale values are analyst inference calibrated from documented systems and reputation, not published metrics",
        "Offense scales (tempo, motion, pnr, iso, starFreedom, etc.) inferred from Lob City Clippers PnR usage, Boston's veteran halfcourt offense, and star-centric Philadelphia/Milwaukee offenses",
        "Defense scales inferred from the documented 2008 strong-side overload scheme (helpAggression, man) and drop-coverage bigs (Perkins, DeAndre Jordan, Embiid, Lopez); zone rating is inference",
        "Management ratings (adaptability, rotationDepth, tacticalAdjustment) inferred from widely reported criticism of his playoff rotations and adjustments; starEmpowerment inferred from his player's-coach reputation",
        "rosterFit values are inference from the roster archetypes of his most successful teams"
      ],
      "sources": [
        "Basketball Reference coach page (Doc Rivers)",
        "NBA.com: Top 15 Coaches in NBA History (2022)",
        "NBA.com Coach of the Year award history",
        "ESPN and AP coverage of the 2008 NBA Finals"
      ],
      "confidence": "MEDIUM"
    },
    {
      "id": "steve-kerr",
      "name": "Steve Kerr",
      "span": "2014–present (Golden State Warriors)",
      "wins": 567,
      "losses": 308,
      "pct": 0.648,
      "championships": 4,
      "teams": [
        "Golden State Warriors"
      ],
      "eras": [
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Motion Offense",
        "Small-Ball Death Lineup",
        "Strength in Numbers"
      ],
      "offense": {
        "tempo": 8,
        "transition": 8,
        "motion": 9,
        "pnr": 4,
        "post": 3,
        "iso": 2,
        "threeEmphasis": 9,
        "insideOut": 4,
        "offBall": 10,
        "ballMovement": 10,
        "starFreedom": 6
      },
      "defense": {
        "man": 8,
        "zone": 3,
        "switching": 9,
        "drop": 3,
        "pressure": 5,
        "helpAggression": 7,
        "rimPriority": 5,
        "defRebPriority": 4
      },
      "management": {
        "adaptability": 8,
        "rotationDepth": 9,
        "roleDiscipline": 6,
        "starEmpowerment": 8,
        "tacticalAdjustment": 8
      },
      "rosterFit": {
        "traditionalCenters": 2,
        "passingBigs": 10,
        "shootingBigs": 6,
        "primaryCreators": 6,
        "multipleCreators": 8,
        "switchableWings": 9,
        "shooters": 10,
        "defenders": 7,
        "transitionAthletes": 7
      },
      "bestWith": [
        "Elite off-ball movement shooters",
        "Playmaking small-ball big",
        "Switchable two-way wings"
      ],
      "concern": "Pass-heavy motion system produces chronically high turnover rates and depends on elite shooting talent",
      "documented": [
        "4 NBA championships as Warriors head coach (2015, 2017, 2018, 2022)",
        "NBA-record 73-9 regular season in 2015-16",
        "2015-16 NBA Coach of the Year",
        "Won 67, 73, and 67 games in his first three seasons (2014-17), the best three-season start by a head coach in NBA history",
        "Popularized the small-ball 'Death Lineup' with Draymond Green at center",
        "Selected to the NBA's Top 15 Coaches list for the league's 75th anniversary (2022)"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference derived from documented systems and results, not directly documented figures",
        "Zone, drop, pressure, and rebounding-priority defensive ratings are inferred from observed scheme tendencies",
        "starFreedom, roleDiscipline, and tacticalAdjustment values are qualitative judgments",
        "rosterFit values are projections of which archetypes suit his motion/switching system",
        "Career W-L (567-308) is exact only through the 2024-25 season; his career is ongoing and the figure excludes 2025-26"
      ],
      "sources": [
        "Basketball Reference coach page",
        "NBA.com coach profile",
        "Golden State Warriors official team site",
        "NBA 75th Anniversary Top 15 Coaches list (2022)"
      ],
      "confidence": "MEDIUM"
    },
    {
      "id": "erik-spoelstra",
      "name": "Erik Spoelstra",
      "span": "2008–present (W-L through 2024-25 season)",
      "wins": 787,
      "losses": 572,
      "pct": 0.579,
      "championships": 2,
      "teams": [
        "Miami Heat"
      ],
      "eras": [
        "2000s",
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Pace-and-Space",
        "Zone Defense",
        "Heat Culture"
      ],
      "offense": {
        "tempo": 4,
        "transition": 6,
        "motion": 7,
        "pnr": 6,
        "post": 5,
        "iso": 6,
        "threeEmphasis": 7,
        "insideOut": 5,
        "offBall": 8,
        "ballMovement": 7,
        "starFreedom": 6
      },
      "defense": {
        "man": 7,
        "zone": 9,
        "switching": 7,
        "drop": 4,
        "pressure": 7,
        "helpAggression": 7,
        "rimPriority": 6,
        "defRebPriority": 6
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 7,
        "roleDiscipline": 9,
        "starEmpowerment": 7,
        "tacticalAdjustment": 9
      },
      "rosterFit": {
        "traditionalCenters": 4,
        "passingBigs": 9,
        "shootingBigs": 7,
        "primaryCreators": 7,
        "multipleCreators": 7,
        "switchableWings": 8,
        "shooters": 9,
        "defenders": 8,
        "transitionAthletes": 6
      },
      "bestWith": [
        "Playmaking big-man hub (DHO offense)",
        "Movement shooters",
        "Tough two-way wings"
      ],
      "concern": "Halfcourt offense has stagnated in seasons lacking elite shot creation, producing several bottom-third offensive ratings despite strong defenses",
      "documented": [
        "Two NBA championships as head coach with the Miami Heat (2012, 2013)",
        "Six NBA Finals appearances as head coach (2011, 2012, 2013, 2014, 2020, 2023)",
        "27-game winning streak in 2012-13 (66-16 season), the second-longest in NBA history",
        "Reached the 2023 NBA Finals as a No. 8 seed, only the second 8-seed ever to do so",
        "Named to the NBA's 15 Greatest Coaches list during the league's 75th anniversary season (2022)",
        "First Asian-American head coach to win a championship in a major North American pro league; Miami's documented league-leading zone-defense usage in the late 2010s and 2020s"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference derived from documented systems and observed team tendencies, not directly documented figures",
        "tempo/transition ratings inferred from Heat pace rankings across eras (fast Big Three era, slow Butler era)",
        "zone rating inferred from widely reported (tracking-data) zone-usage leadership, but the exact 9 is a judgment",
        "management scores (adaptability, tactical adjustment, role discipline) inferred from reputation and playoff results rather than a documented metric",
        "rosterFit values inferred from success profiles (Bosh/Adebayo as hubs, Robinson/Ellington shooter usage)"
      ],
      "sources": [
        "Basketball Reference coach page (Erik Spoelstra)",
        "NBA.com: 15 Greatest Coaches in NBA History (2022, 75th Anniversary)",
        "NBA.com Finals results and Miami Heat media guides",
        "Naismith Basketball Hall of Fame / NBA coverage of the 2012-13 win streak and 2023 Finals run"
      ],
      "confidence": "MEDIUM"
    },
    {
      "id": "nick-nurse",
      "name": "Nick Nurse",
      "span": "2018–present (Toronto 2018–2023, Philadelphia 2023– ; W-L through 2024-25)",
      "wins": 298,
      "losses": 256,
      "pct": 0.538,
      "championships": 1,
      "teams": [
        "Toronto Raptors",
        "Philadelphia 76ers"
      ],
      "eras": [
        "2010s",
        "2020s"
      ],
      "systemTags": [
        "Exotic Junk Defenses",
        "Full-Court Pressure",
        "Scheme Experimentation"
      ],
      "offense": {
        "tempo": 6,
        "transition": 7,
        "motion": 5,
        "pnr": 6,
        "post": 5,
        "iso": 6,
        "threeEmphasis": 7,
        "insideOut": 5,
        "offBall": 5,
        "ballMovement": 6,
        "starFreedom": 7
      },
      "defense": {
        "man": 7,
        "zone": 9,
        "switching": 7,
        "drop": 4,
        "pressure": 9,
        "helpAggression": 8,
        "rimPriority": 6,
        "defRebPriority": 5
      },
      "management": {
        "adaptability": 9,
        "rotationDepth": 7,
        "roleDiscipline": 5,
        "starEmpowerment": 7,
        "tacticalAdjustment": 9
      },
      "rosterFit": {
        "traditionalCenters": 6,
        "passingBigs": 7,
        "shootingBigs": 6,
        "primaryCreators": 8,
        "multipleCreators": 6,
        "switchableWings": 9,
        "shooters": 7,
        "defenders": 9,
        "transitionAthletes": 7
      },
      "bestWith": [
        "Long, switchable defensive wings",
        "A dominant two-way star creator",
        "High-IQ veterans who can absorb changing schemes"
      ],
      "concern": "Constant scheme experimentation can destabilize offensive roles, and his post-Toronto offenses have stagnated in halfcourt playoff settings",
      "documented": [
        "Won the 2019 NBA championship as Toronto Raptors head coach in his first NBA head-coaching season (58-24)",
        "Named 2019-20 NBA Coach of the Year after leading Toronto to 53-19 following Kawhi Leonard's departure",
        "Famously deployed a box-and-one defense against Stephen Curry in the 2019 NBA Finals, along with triangle-and-two and heavy zone looks throughout his tenure",
        "His 2019-20 Raptors led the NBA in steals and ranked near the top in defensive rating using zone and full-court press at unusually high rates for the modern era",
        "Won two NBA D-League (G League) championships as a head coach (Iowa Energy 2011, Rio Grande Valley Vipers 2013) plus multiple British Basketball League titles before the NBA",
        "Hired as Philadelphia 76ers head coach in 2023; went 47-35 in 2023-24, then 24-58 in an injury-wrecked 2024-25"
      ],
      "inferred": [
        "All 0-10 numeric ratings in offense, defense, management, and rosterFit are analyst inference from documented systems and team statistics, not directly documented figures",
        "zone (9) and pressure (9) are anchored to the documented box-and-one/press usage but the exact scale values are inference",
        "tempo, transition, threeEmphasis, and ballMovement are inferred from Raptors/76ers pace, 3PA, and turnover-creation rankings",
        "starFreedom and starEmpowerment are inferred from his handling of Kawhi Leonard (load management collaboration) and Joel Embiid",
        "rosterFit values are projections of which archetypes his documented schemes reward",
        "Career W-L (298-256) covers 2018-19 through 2024-25 only; the 2025-26 season is not included"
      ],
      "sources": [
        "Basketball Reference coach page (Nick Nurse)",
        "NBA.com Coach of the Year announcement (2020)",
        "NBA.com and ESPN coverage of the 2019 NBA Finals (box-and-one vs. Stephen Curry)",
        "NBA G League championship records",
        "Toronto Raptors and Philadelphia 76ers official team histories"
      ],
      "confidence": "MEDIUM"
    }
  ]
};
