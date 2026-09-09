// ── Historical Holdout V5 candidate-pool spec (Phase 6C4A) ──────────────────
// SOURCE-ONLY, OUTPUT-BLIND. Every field here is team-season identity, the
// documented five, the documented coach, or documented style identity. No
// Candidate 0 or Candidate 1 output was consulted, and no fixture in this file
// has ever been simulated at the time it is written.
//
// The pool is the 15 UNCONSUMED eligible teams from the V4 pool plus the new
// team-seasons below. The V4 pool's 16 consumed teams are excluded permanently:
// they are diagnostics now, and a holdout may not reuse a set the candidate has
// been developed against.
//
// Exclusions enforced by the builder, not by trust:
//   · no team-season appearing in historical corpus v3 (calibration OR holdout)
//   · no team-season consumed by Historical Holdout V4
//   · no five duplicating any prior fixture's five (person-level)
//   · no fixture used in Candidate 1 development (the six V4 diagnostic teams)
//
// Coaches are restricted to the researched coach registry, because a fixture
// whose coach cannot be resolved cannot render coach identity at all.
const F = (slot, name, article = name) => ({ slot, name, article, role: "STARTER" });

export const NEW_V5_SPEC = Object.freeze([
  // ── 1950s ────────────────────────────────────────────────────────────────
  // Only Kundla (Lakers) and Auerbach (Celtics) are in the researched coach
  // registry for this era, and every Celtics five available in the 1950s
  // duplicates a five already used (1954-55, 1956-57, 1957-58, 1958-59), so
  // the era contributes one new team-season. The 1952-53 and 1959-60 first
  // drafts of this file were BOTH rejected by the builder's five-duplication
  // check — recorded here rather than worked around.
  { fixtureId: "v5-1950-51-lakers", eraStyleId: "1950s", teamId: "MIN_LAKERS", teamName: "Minneapolis Lakers",
    seasonStartYear: 1950, season: "1950-51", teamArticle: "1950–51 Minneapolis Lakers season",
    coachId: "john-kundla", coachName: "John Kundla", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "slow", offense: "post-centred through the pivot", defense: "physical man", tags: ["POST_HEAVY", "SIZE_HEAVY", "STRONG_OFFENSIVE_REBOUNDING"] },
    // Arnie Ferrin, not Bob Harrison: Harrison resolves only through the team
    // roster page, which carries no statistics at all, so a starter would have
    // entered with no recorded scoring and the fixture could not render the
    // offensive identity a holdout scores. Ferrin is documented on the same
    // roster with a full statistical line (68 games, 5.2 ppg).
    five: [F("PG", "Slater Martin"), F("SG", "Arnie Ferrin"), F("SF", "Jim Pollard"), F("PF", "Vern Mikkelsen"), F("C", "George Mikan")] },

  // ── 1960s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-1960-61-celtics", eraStyleId: "1960s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1960, season: "1960-61", teamArticle: "1960–61 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "very fast", offense: "fast break and early offence", defense: "elite team man defence", tags: ["TRANSITION", "ELITE_DEFENSE"] },
    five: [F("PG", "Bob Cousy"), F("SG", "Bill Sharman"), F("SF", "Tom Sanders", "Satch Sanders"), F("PF", "Tom Heinsohn"), F("C", "Bill Russell")] },
  { fixtureId: "v5-1968-69-76ers", eraStyleId: "1960s", teamId: "PHI", teamName: "Philadelphia 76ers",
    seasonStartYear: 1968, season: "1968-69", teamArticle: "1968–69 Philadelphia 76ers season",
    coachId: "jack-ramsay", coachName: "Jack Ramsay", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "fast", offense: "perimeter creation and early offence", defense: "pressure man", tags: ["TRANSITION"] },
    five: [F("PG", "Wali Jones"), F("SG", "Hal Greer"), F("SF", "Chet Walker"), F("PF", "Billy Cunningham"), F("C", "Darrall Imhoff")] },

  // ── 1970s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-1974-75-blazers", eraStyleId: "1970s", teamId: "POR", teamName: "Portland Trail Blazers",
    seasonStartYear: 1974, season: "1974-75", teamArticle: "1974–75 Portland Trail Blazers season",
    coachId: "lenny-wilkens", coachName: "Lenny Wilkens", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "interior passing through the centre", defense: "man with a shot-blocking centre", tags: ["POST_HEAVY", "STRONG_OFFENSIVE_REBOUNDING"] },
    five: [F("PG", "Geoff Petrie"), F("SG", "Larry Steele"), F("SF", "Sidney Wicks"), F("PF", "Lloyd Neal"), F("C", "Bill Walton")] },
  { fixtureId: "v5-1976-77-celtics", eraStyleId: "1970s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1976, season: "1976-77", teamArticle: "1976–77 Boston Celtics season",
    coachId: "tom-heinsohn", coachName: "Tom Heinsohn", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "fast", offense: "motion and ball movement", defense: "team man defence", tags: ["TRANSITION", "PASSING_HUB"] },
    five: [F("PG", "Jo Jo White"), F("SG", "Charlie Scott", "Charlie Scott (basketball)"), F("SF", "John Havlicek"), F("PF", "Curtis Rowe"), F("C", "Dave Cowens")] },

  // ── 1980s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-1981-82-lakers", eraStyleId: "1980s", teamId: "LAL", teamName: "Los Angeles Lakers",
    seasonStartYear: 1981, season: "1981-82", teamArticle: "1981–82 Los Angeles Lakers season",
    coachId: "pat-riley", coachName: "Pat Riley", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "very fast", offense: "fast break led by the point guard", defense: "man with a dominant rebounder", tags: ["TRANSITION", "PACE_EXTREME", "PASSING_HUB"] },
    five: [F("PG", "Magic Johnson"), F("SG", "Norm Nixon"), F("SF", "Jamaal Wilkes"), F("PF", "Kurt Rambis"), F("C", "Kareem Abdul-Jabbar")] },
  { fixtureId: "v5-1987-88-pistons", eraStyleId: "1980s", teamId: "DET", teamName: "Detroit Pistons",
    seasonStartYear: 1987, season: "1987-88", teamArticle: "1987–88 Detroit Pistons season",
    coachId: "chuck-daly", coachName: "Chuck Daly", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "slow", offense: "half-court isolation and post scoring", defense: "elite physical man", tags: ["ISOLATION_HEAVY", "ELITE_DEFENSE"] },
    five: [F("PG", "Isiah Thomas"), F("SG", "Joe Dumars"), F("SF", "Adrian Dantley"), F("PF", "Rick Mahorn"), F("C", "Bill Laimbeer")] },

  // ── 1990s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-1993-94-rockets", eraStyleId: "1990s", teamId: "HOU", teamName: "Houston Rockets",
    seasonStartYear: 1993, season: "1993-94", teamArticle: "1993–94 Houston Rockets season",
    coachId: "rudy-tomjanovich", coachName: "Rudy Tomjanovich", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "post-centred with perimeter spacing", defense: "elite man with rim protection", tags: ["POST_HEAVY", "ELITE_DEFENSE"] },
    five: [F("PG", "Kenny Smith"), F("SG", "Vernon Maxwell"), F("SF", "Robert Horry"), F("PF", "Otis Thorpe"), F("C", "Hakeem Olajuwon")] },
  { fixtureId: "v5-1996-97-heat", eraStyleId: "1990s", teamId: "MIA", teamName: "Miami Heat",
    seasonStartYear: 1996, season: "1996-97", teamArticle: "1996–97 Miami Heat season",
    coachId: "pat-riley", coachName: "Pat Riley", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "slow", offense: "pick-and-roll and post scoring", defense: "elite physical man", tags: ["PNR_HEAVY", "ELITE_DEFENSE"] },
    five: [F("PG", "Tim Hardaway"), F("SG", "Voshon Lenard"), F("SF", "Jamal Mashburn"), F("PF", "P. J. Brown"), F("C", "Alonzo Mourning")] },

  // ── 2000s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-2007-08-celtics", eraStyleId: "2000s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 2007, season: "2007-08", teamArticle: "2007–08 Boston Celtics season",
    coachId: "doc-rivers", coachName: "Doc Rivers", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "balanced three-creator half-court offence", defense: "elite team man defence", tags: ["ELITE_DEFENSE", "PASSING_HUB"] },
    five: [F("PG", "Rajon Rondo"), F("SG", "Ray Allen"), F("SF", "Paul Pierce"), F("PF", "Kevin Garnett"), F("C", "Kendrick Perkins")] },
  { fixtureId: "v5-2008-09-lakers", eraStyleId: "2000s", teamId: "LAL", teamName: "Los Angeles Lakers",
    seasonStartYear: 2008, season: "2008-09", teamArticle: "2008–09 Los Angeles Lakers season",
    coachId: "phil-jackson", coachName: "Phil Jackson", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "triangle: post entries and off-ball movement", defense: "man with length", tags: ["POST_HEAVY", "MOTION", "SIZE_HEAVY"] },
    five: [F("PG", "Derek Fisher"), F("SG", "Kobe Bryant"), F("SF", "Trevor Ariza"), F("PF", "Pau Gasol"), F("C", "Andrew Bynum")] },

  // ── 2010s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-2015-16-spurs", eraStyleId: "2010s", teamId: "SAS", teamName: "San Antonio Spurs",
    seasonStartYear: 2015, season: "2015-16", teamArticle: "2015–16 San Antonio Spurs season",
    coachId: "gregg-popovich", coachName: "Gregg Popovich", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "slow", offense: "ball movement into post and mid-range", defense: "elite team man defence", tags: ["PASSING_HUB", "ELITE_DEFENSE", "POST_HEAVY"] },
    five: [F("PG", "Tony Parker"), F("SG", "Danny Green"), F("SF", "Kawhi Leonard"), F("PF", "LaMarcus Aldridge"), F("C", "Tim Duncan")] },
  { fixtureId: "v5-2018-19-raptors", eraStyleId: "2010s", teamId: "TOR", teamName: "Toronto Raptors",
    seasonStartYear: 2018, season: "2018-19", teamArticle: "2018–19 Toronto Raptors season",
    coachId: "nick-nurse", coachName: "Nick Nurse", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "isolation creation with three-point spacing", defense: "switching man with zone looks", tags: ["ISOLATION_HEAVY", "THREE_POINT_HEAVY", "ELITE_DEFENSE"] },
    five: [F("PG", "Kyle Lowry"), F("SG", "Danny Green"), F("SF", "Kawhi Leonard"), F("PF", "Pascal Siakam"), F("C", "Marc Gasol")] },

  // ── 2020s ────────────────────────────────────────────────────────────────
  { fixtureId: "v5-2023-24-knicks", eraStyleId: "2020s", teamId: "NYK", teamName: "New York Knicks",
    seasonStartYear: 2023, season: "2023-24", teamArticle: "2023–24 New York Knicks season",
    coachId: "tom-thibodeau", coachName: "Tom Thibodeau", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "slow", offense: "pick-and-roll with heavy offensive rebounding", defense: "physical man", tags: ["PNR_HEAVY", "STRONG_OFFENSIVE_REBOUNDING"] },
    five: [F("PG", "Jalen Brunson"), F("SG", "Donte DiVincenzo"), F("SF", "Josh Hart"), F("PF", "OG Anunoby"), F("C", "Isaiah Hartenstein")] },
  { fixtureId: "v5-2023-24-76ers", eraStyleId: "2020s", teamId: "PHI", teamName: "Philadelphia 76ers",
    seasonStartYear: 2023, season: "2023-24", teamArticle: "2023–24 Philadelphia 76ers season",
    coachId: "nick-nurse", coachName: "Nick Nurse", fixtureType: "SOURCE_BACKED_PRINCIPAL_FIVE",
    identity: { pace: "moderate", offense: "post hub with three-point spacing", defense: "drop-coverage man behind a rim protector", tags: ["POST_HEAVY", "THREE_POINT_HEAVY"] },
    five: [F("PG", "Tyrese Maxey"), F("SG", "Kelly Oubre Jr."), F("SF", "Tobias Harris"), F("PF", "Nicolas Batum"), F("C", "Joel Embiid")] },
]);
