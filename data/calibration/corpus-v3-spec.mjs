// ── Historical corpus v3 specification ──────────────────────────────────────
// 32 team-seasons, four per Era Style, each with its documented five.
//
// Nothing here is trusted. The builder verifies every player against that
// season's own record before a fixture is accepted, and rejects the fixture if
// any of the five cannot be confirmed. This file states the CLAIM; the source
// decides whether it stands.
//
// Season selection is constrained by coach coverage: a fixture needs a coach
// who is in the pool AND who actually coached that team-season, and the pool
// holds 30 coaches. Where that forces two seasons of one franchise into an era,
// it is recorded rather than disguised.

export const TEAM_ALIASES = Object.freeze({
  BOS: ["Boston", "Boston Celtics"],
  MIN_LAKERS: ["Minneapolis", "Minneapolis Lakers"],
  LAL: ["L.A. Lakers", "LA Lakers", "Los Angeles", "Los Angeles Lakers", "L.A. Lakers*"],
  NYK: ["New York", "New York Knicks", "N.Y. Knicks"],
  POR: ["Portland", "Portland Trail Blazers"],
  PHI: ["Philadelphia", "Philadelphia 76ers", "Phila.", "Philadelphia (NBA)"],
  DET: ["Detroit", "Detroit Pistons"],
  CHI: ["Chicago", "Chicago Bulls"],
  UTA: ["Utah", "Utah Jazz"],
  HOU: ["Houston", "Houston Rockets"],
  SAS: ["San Antonio", "San Antonio Spurs"],
  PHX: ["Phoenix", "Phoenix Suns"],
  GSW: ["Golden State", "Golden State Warriors"],
  MIA: ["Miami", "Miami Heat"],
  TOR: ["Toronto", "Toronto Raptors"],
});

/**
 * `five` is the documented starting or principal five, in PG-SG-SF-PF-C order.
 * `article` is each player's own Wikipedia article, which carries a per-season
 * career table — the only authorized route to season statistics for eras whose
 * team-season articles have none.
 */
const F = (fixtureId, eraStyleId, teamId, teamName, seasonStartYear, coachId, fixtureType, identity, five) =>
  ({ fixtureId, eraStyleId, teamId, teamName, seasonStartYear,
     season: `${seasonStartYear}-${String(seasonStartYear + 1).slice(2)}`,
     // The team-season article is the SECOND authorized route: some player
     // articles carry no career table at all (Luc Longley's has only
     // navboxes), and a mid-season trade shows only the origin team on the
     // player's own page.
     teamArticle: `${seasonStartYear}\u2013${String(seasonStartYear + 1).slice(2)} ${teamName} season`,
     coachId, fixtureType, identity, five });

const p = (slot, name, article, role = "STARTER") => ({ slot, name, article: article ?? name, role });

export const CORPUS_V3_SPEC = [
  // ── 1950s ── Auerbach (Celtics 1950-66) and Kundla (Minneapolis 1948-59) are
  // the only pool coaches active in this decade, which constrains franchise
  // diversity to two.
  F("h3-1956-57-celtics", "1950s", "BOS", "Boston Celtics", 1956, "red-auerbach", "HISTORICAL_STARTER_PROXY",
    { pace: "very fast", offense: "fast break from defensive rebounding", defense: "rim-anchored man", tags: ["TRANSITION", "ELITE_DEFENSE", "BALANCED_CHAMPION"] },
    [p("PG", "Bob Cousy"), p("SG", "Bill Sharman"), p("SF", "Jim Loscutoff"), p("PF", "Tom Heinsohn"), p("C", "Bill Russell")]),
  F("h3-1953-54-lakers", "1950s", "MIN_LAKERS", "Minneapolis Lakers", 1953, "john-kundla", "HISTORICAL_STARTER_PROXY",
    { pace: "slow", offense: "post-centred, interior scoring", defense: "size-heavy man", tags: ["POST_HEAVY", "SIZE_HEAVY", "SLOW_HALF_COURT"] },
    [p("PG", "Slater Martin"), p("SG", "Whitey Skoog"), p("SF", "Jim Pollard"), p("PF", "Vern Mikkelsen"), p("C", "George Mikan")]),
  F("h3-1958-59-celtics", "1950s", "BOS", "Boston Celtics", 1958, "red-auerbach", "HISTORICAL_STARTER_PROXY",
    { pace: "very fast", offense: "fast break, balanced scoring", defense: "rim-anchored man", tags: ["PACE_EXTREME", "TRANSITION", "ELITE_DEFENSE"] },
    [p("PG", "Bob Cousy"), p("SG", "Bill Sharman"), p("SF", "Tom Heinsohn"), p("PF", "Jim Loscutoff"), p("C", "Bill Russell")]),
  F("h3-1951-52-lakers", "1950s", "MIN_LAKERS", "Minneapolis Lakers", 1951, "john-kundla", "HISTORICAL_PRINCIPAL_FIVE_PROXY",
    { pace: "slow", offense: "post entry to a dominant centre", defense: "size-heavy man", tags: ["POST_HEAVY", "SIZE_HEAVY", "LOW_THREE_POINT"] },
    [p("PG", "Slater Martin"), p("SG", "Pep Saul"), p("SF", "Jim Pollard"), p("PF", "Vern Mikkelsen"), p("C", "George Mikan")]),

  // ── 1960s ── Auerbach (Celtics to 1966) and Holzman (Knicks from Dec 1967).
  F("h3-1962-63-celtics", "1960s", "BOS", "Boston Celtics", 1962, "red-auerbach", "HISTORICAL_LINEUP",
    { pace: "very fast", offense: "fast break, early offence", defense: "rim-anchored man", tags: ["TRANSITION", "ELITE_DEFENSE", "BALANCED_CHAMPION"] },
    [p("PG", "Bob Cousy"), p("SG", "Sam Jones"), p("SF", "Tom Heinsohn"), p("PF", "Tom Sanders", "Satch Sanders"), p("C", "Bill Russell")]),
  F("h3-1964-65-celtics", "1960s", "BOS", "Boston Celtics", 1964, "red-auerbach", "HISTORICAL_STARTER_PROXY",
    { pace: "very fast", offense: "fast break, depth scoring", defense: "rim-anchored man", tags: ["PACE_EXTREME", "ELITE_DEFENSE"] },
    [p("PG", "K. C. Jones"), p("SG", "Sam Jones"), p("SF", "John Havlicek"), p("PF", "Tom Sanders", "Satch Sanders"), p("C", "Bill Russell")]),
  F("h3-1969-70-knicks", "1960s", "NYK", "New York Knicks", 1969, "red-holzman", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "motion, ball movement, high-post passing", defense: "switching pressure man", tags: ["MOTION", "ELITE_DEFENSE", "PASSING_HUB", "BALANCED_CHAMPION"] },
    [p("PG", "Walt Frazier"), p("SG", "Dick Barnett"), p("SF", "Bill Bradley"), p("PF", "Dave DeBusschere"), p("C", "Willis Reed")]),
  F("h3-1968-69-knicks", "1960s", "NYK", "New York Knicks", 1968, "red-holzman", "HISTORICAL_STARTER_PROXY",
    { pace: "moderate", offense: "motion and cutting", defense: "pressure man", tags: ["MOTION", "ELITE_DEFENSE", "NON_CHAMPION"] },
    [p("PG", "Walt Frazier"), p("SG", "Dick Barnett"), p("SF", "Bill Bradley"), p("PF", "Dave DeBusschere"), p("C", "Willis Reed")]),

  // ── 1970s ──
  F("h3-1971-72-lakers", "1970s", "LAL", "Los Angeles Lakers", 1971, "bill-sharman", "HISTORICAL_LINEUP",
    { pace: "very fast", offense: "fast break and early offence", defense: "man with a dominant rebounder", tags: ["PACE_EXTREME", "TRANSITION", "BALANCED_CHAMPION"] },
    [p("PG", "Jerry West"), p("SG", "Gail Goodrich"), p("SF", "Jim McMillian"), p("PF", "Happy Hairston"), p("C", "Wilt Chamberlain")]),
  F("h3-1972-73-knicks", "1970s", "NYK", "New York Knicks", 1972, "red-holzman", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "half-court motion and passing", defense: "elite team man defence", tags: ["MOTION", "ELITE_DEFENSE", "SLOW_HALF_COURT", "PASSING_HUB"] },
    [p("PG", "Walt Frazier"), p("SG", "Earl Monroe"), p("SF", "Bill Bradley"), p("PF", "Dave DeBusschere"), p("C", "Willis Reed")]),
  F("h3-1976-77-blazers", "1970s", "POR", "Portland Trail Blazers", 1976, "jack-ramsay", "HISTORICAL_LINEUP",
    { pace: "fast", offense: "passing-hub centre, cutting and movement", defense: "help-heavy man", tags: ["PASSING_HUB", "MOTION", "BALANCED_CHAMPION"] },
    [p("PG", "Lionel Hollins"), p("SG", "Dave Twardzik"), p("SF", "Bob Gross"), p("PF", "Maurice Lucas"), p("C", "Bill Walton")]),
  F("h3-1973-74-celtics", "1970s", "BOS", "Boston Celtics", 1973, "tom-heinsohn", "HISTORICAL_STARTER_PROXY",
    { pace: "fast", offense: "running game, off-ball movement", defense: "switching, aggressive man", tags: ["TRANSITION", "MOTION", "BALANCED_CHAMPION"] },
    [p("PG", "Jo Jo White"), p("SG", "Don Chaney"), p("SF", "John Havlicek"), p("PF", "Paul Silas"), p("C", "Dave Cowens")]),

  // ── 1980s ──
  F("h3-1985-86-celtics", "1980s", "BOS", "Boston Celtics", 1985, "kc-jones", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "half-court execution, elite passing front line", defense: "physical man", tags: ["SIZE_HEAVY", "PASSING_HUB", "SLOW_HALF_COURT", "BALANCED_CHAMPION"] },
    [p("PG", "Dennis Johnson"), p("SG", "Danny Ainge"), p("SF", "Larry Bird"), p("PF", "Kevin McHale", "Kevin McHale (basketball)"), p("C", "Robert Parish")]),
  F("h3-1986-87-lakers", "1980s", "LAL", "Los Angeles Lakers", 1986, "pat-riley", "HISTORICAL_LINEUP",
    { pace: "very fast", offense: "Showtime transition and early offence", defense: "man with help", tags: ["PACE_EXTREME", "TRANSITION", "ELITE_OFFENSE", "BALANCED_CHAMPION"] },
    [p("PG", "Magic Johnson"), p("SG", "Byron Scott"), p("SF", "James Worthy"), p("PF", "A. C. Green"), p("C", "Kareem Abdul-Jabbar")]),
  F("h3-1982-83-sixers", "1980s", "PHI", "Philadelphia 76ers", 1982, "billy-cunningham", "HISTORICAL_LINEUP",
    { pace: "fast", offense: "transition and post scoring", defense: "rim-protected man", tags: ["TRANSITION", "POST_HEAVY", "STRONG_OFFENSIVE_REBOUNDING", "BALANCED_CHAMPION"] },
    [p("PG", "Maurice Cheeks"), p("SG", "Andrew Toney"), p("SF", "Julius Erving"), p("PF", "Marc Iavaroni"), p("C", "Moses Malone")]),
  F("h3-1988-89-pistons", "1980s", "DET", "Detroit Pistons", 1988, "chuck-daly", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "isolation and post-up in the half court", defense: "physical, trapping man", tags: ["ISOLATION_HEAVY", "ELITE_DEFENSE", "SLOW_HALF_COURT", "BALANCED_CHAMPION"] },
    [p("PG", "Isiah Thomas"), p("SG", "Joe Dumars"), p("SF", "Mark Aguirre"), p("PF", "Rick Mahorn"), p("C", "Bill Laimbeer")]),

  // ── 1990s ──
  F("h3-1995-96-bulls", "1990s", "CHI", "Chicago Bulls", 1995, "phil-jackson", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "triangle: post reads, cuts, spacing", defense: "pressure man with help", tags: ["MOTION", "ELITE_DEFENSE", "ELITE_OFFENSE", "STRONG_OFFENSIVE_REBOUNDING", "BALANCED_CHAMPION"] },
    [p("PG", "Ron Harper"), p("SG", "Michael Jordan"), p("SF", "Scottie Pippen"), p("PF", "Dennis Rodman"), p("C", "Luc Longley")]),
  F("h3-1993-94-knicks", "1990s", "NYK", "New York Knicks", 1993, "pat-riley", "HISTORICAL_LINEUP",
    { pace: "very slow", offense: "post-up and isolation, low volume", defense: "elite physical man", tags: ["ELITE_DEFENSE", "SLOW_HALF_COURT", "POST_HEAVY", "SIZE_HEAVY", "NON_CHAMPION"] },
    [p("PG", "Derek Harper"), p("SG", "John Starks"), p("SF", "Charles Smith", "Charles Smith (basketball, born 1965)"), p("PF", "Charles Oakley"), p("C", "Patrick Ewing")]),
  F("h3-1996-97-jazz", "1990s", "UTA", "Utah Jazz", 1996, "jerry-sloan", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "the canonical pick-and-roll", defense: "disciplined man", tags: ["PICK_AND_ROLL", "ELITE_OFFENSE", "NON_CHAMPION"] },
    [p("PG", "John Stockton"), p("SG", "Jeff Hornacek"), p("SF", "Bryon Russell"), p("PF", "Karl Malone"), p("C", "Greg Ostertag")]),
  F("h3-1994-95-rockets", "1990s", "HOU", "Houston Rockets", 1994, "rudy-tomjanovich", "HISTORICAL_STARTER_PROXY",
    { pace: "moderate", offense: "post-up centre with perimeter spacing", defense: "rim-protected man", tags: ["POST_HEAVY", "THREE_POINT_HEAVY", "BALANCED_CHAMPION"] },
    [p("PG", "Kenny Smith"), p("SG", "Clyde Drexler"), p("SF", "Robert Horry"), p("PF", "Otis Thorpe"), p("C", "Hakeem Olajuwon")]),

  // ── 2000s ──
  F("h3-2000-01-lakers", "2000s", "LAL", "Los Angeles Lakers", 2000, "phil-jackson", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "triangle around a dominant post centre", defense: "rim-protected man", tags: ["POST_HEAVY", "ELITE_OFFENSE", "SIZE_HEAVY", "BALANCED_CHAMPION"] },
    [p("PG", "Derek Fisher"), p("SG", "Kobe Bryant"), p("SF", "Rick Fox"), p("PF", "Horace Grant"), p("C", "Shaquille O'Neal")]),
  F("h3-2003-04-pistons", "2000s", "DET", "Detroit Pistons", 2003, "larry-brown", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "movement shooting off screens", defense: "elite man with rim protection", tags: ["ELITE_DEFENSE", "SLOW_HALF_COURT", "MOTION", "BALANCED_CHAMPION"] },
    [p("PG", "Chauncey Billups"), p("SG", "Richard Hamilton", "Richard Hamilton (basketball)"), p("SF", "Tayshaun Prince"), p("PF", "Rasheed Wallace"), p("C", "Ben Wallace", "Ben Wallace (basketball)")]),
  F("h3-2004-05-spurs", "2000s", "SAS", "San Antonio Spurs", 2004, "gregg-popovich", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "post and pick-and-roll, disciplined", defense: "elite team man", tags: ["ELITE_DEFENSE", "SLOW_HALF_COURT", "PICK_AND_ROLL", "BALANCED_CHAMPION"] },
    [p("PG", "Tony Parker"), p("SG", "Manu Ginóbili"), p("SF", "Bruce Bowen"), p("PF", "Tim Duncan"), p("C", "Rasho Nesterović")]),
  F("h3-2006-07-suns", "2000s", "PHX", "Phoenix Suns", 2006, "mike-dantoni", "HISTORICAL_LINEUP",
    { pace: "very fast", offense: "seven seconds or less: pick-and-roll and spacing", defense: "gambling man defence", tags: ["PACE_EXTREME", "PICK_AND_ROLL", "ELITE_OFFENSE", "THREE_POINT_HEAVY", "WEAK_OFFENSIVE_REBOUNDING", "NON_CHAMPION"] },
    [p("PG", "Steve Nash"), p("SG", "Raja Bell"), p("SF", "Shawn Marion"), p("PF", "Boris Diaw"), p("C", "Amar'e Stoudemire")]),

  // ── 2010s ──
  F("h3-2015-16-warriors", "2010s", "GSW", "Golden State Warriors", 2015, "steve-kerr", "HISTORICAL_LINEUP",
    { pace: "fast", offense: "movement shooting, off-ball screens, handoffs", defense: "switching small-ball", tags: ["THREE_POINT_HEAVY", "MOTION", "ELITE_OFFENSE", "SMALL_BALL", "NON_CHAMPION"] },
    [p("PG", "Stephen Curry"), p("SG", "Klay Thompson"), p("SF", "Harrison Barnes"), p("PF", "Draymond Green"), p("C", "Andrew Bogut")]),
  F("h3-2012-13-heat", "2010s", "MIA", "Miami Heat", 2012, "erik-spoelstra", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "spacing around a point-forward, cutting", defense: "aggressive switching and trapping", tags: ["SMALL_BALL", "ELITE_DEFENSE", "ELITE_OFFENSE", "WEAK_OFFENSIVE_REBOUNDING", "BALANCED_CHAMPION"] },
    [p("PG", "Mario Chalmers"), p("SG", "Dwyane Wade"), p("SF", "LeBron James"), p("PF", "Shane Battier"), p("C", "Chris Bosh")]),
  F("h3-2013-14-spurs", "2010s", "SAS", "San Antonio Spurs", 2013, "gregg-popovich", "HISTORICAL_LINEUP",
    { pace: "moderate", offense: "ball movement, drive and kick, corner threes", defense: "disciplined team man", tags: ["MOTION", "PASSING_HUB", "THREE_POINT_HEAVY", "ELITE_OFFENSE", "BALANCED_CHAMPION"] },
    [p("PG", "Tony Parker"), p("SG", "Danny Green", "Danny Green (basketball)"), p("SF", "Kawhi Leonard"), p("PF", "Tim Duncan"), p("C", "Tiago Splitter")]),
  F("h3-2010-11-bulls", "2010s", "CHI", "Chicago Bulls", 2010, "tom-thibodeau", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "pick-and-roll around a lead guard", defense: "elite scheme-driven man", tags: ["ELITE_DEFENSE", "PICK_AND_ROLL", "STRONG_OFFENSIVE_REBOUNDING", "SLOW_HALF_COURT", "NON_CHAMPION"] },
    [p("PG", "Derrick Rose"), p("SG", "Keith Bogans"), p("SF", "Luol Deng"), p("PF", "Carlos Boozer"), p("C", "Joakim Noah")]),

  // ── 2020s ──
  F("h3-2021-22-warriors", "2020s", "GSW", "Golden State Warriors", 2021, "steve-kerr", "HISTORICAL_LINEUP",
    { pace: "fast", offense: "movement shooting and handoffs", defense: "switching with a rim anchor", tags: ["THREE_POINT_HEAVY", "MOTION", "ELITE_DEFENSE", "BALANCED_CHAMPION"] },
    [p("PG", "Stephen Curry"), p("SG", "Klay Thompson"), p("SF", "Andrew Wiggins"), p("PF", "Draymond Green"), p("C", "Kevon Looney")]),
  F("h3-2022-23-heat", "2020s", "MIA", "Miami Heat", 2022, "erik-spoelstra", "HISTORICAL_STARTER_PROXY",
    { pace: "slow", offense: "isolation and post-up in the half court", defense: "zone-capable, scheme-heavy", tags: ["ISOLATION_HEAVY", "SLOW_HALF_COURT", "ZONE_CAPABLE", "NON_CHAMPION"] },
    [p("PG", "Kyle Lowry"), p("SG", "Max Strus"), p("SF", "Jimmy Butler"), p("PF", "Caleb Martin", "Caleb Martin (basketball)"), p("C", "Bam Adebayo")]),
  F("h3-2022-23-raptors", "2020s", "TOR", "Toronto Raptors", 2022, "nick-nurse", "HISTORICAL_STARTER_PROXY",
    { pace: "moderate", offense: "size-driven drives and offensive rebounding", defense: "zone-capable, long switching", tags: ["ZONE_CAPABLE", "SIZE_HEAVY", "STRONG_OFFENSIVE_REBOUNDING", "LOW_THREE_POINT", "NON_CHAMPION"] },
    // Jakob Poeltl arrived at the February deadline. The season's most-used
    // five had no true centre: Siakam played the five in a switching lineup,
    // which is the identity this fixture is here to represent.
    [p("PG", "Fred VanVleet"), p("SG", "Gary Trent Jr."), p("SF", "OG Anunoby"), p("PF", "Scottie Barnes"), p("C", "Pascal Siakam")]),
  F("h3-2022-23-sixers", "2020s", "PHI", "Philadelphia 76ers", 2022, "doc-rivers", "HISTORICAL_LINEUP",
    { pace: "slow", offense: "post-up and pick-and-roll around an MVP centre", defense: "drop coverage with a rim anchor", tags: ["POST_HEAVY", "PICK_AND_ROLL", "ELITE_OFFENSE", "SLOW_HALF_COURT", "NON_CHAMPION"] },
    [p("PG", "James Harden"), p("SG", "Tyrese Maxey"), p("SF", "Tobias Harris"), p("PF", "P. J. Tucker"), p("C", "Joel Embiid")]),
];

export const specByEra = () =>
  CORPUS_V3_SPEC.reduce((a, f) => ({ ...a, [f.eraStyleId]: (a[f.eraStyleId] ?? 0) + 1 }), {});

export const specFranchisesByEra = () => {
  const out = {};
  for (const f of CORPUS_V3_SPEC) (out[f.eraStyleId] = out[f.eraStyleId] ?? new Set()).add(f.teamId);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
};

export const styleTagCoverage = () => {
  const tags = {};
  for (const f of CORPUS_V3_SPEC) for (const t of f.identity.tags ?? []) tags[t] = (tags[t] ?? 0) + 1;
  return tags;
};
