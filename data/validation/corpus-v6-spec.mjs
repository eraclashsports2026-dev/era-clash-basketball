// ── The Historical V6 pool gap spec ─────────────────────────────────────────
//
// Seven team-seasons ingested to close a measured gap, not chosen for any
// expected result. Phase 6C4C2 found exactly 17 already-profiled team-seasons
// that no prior set had used, distributed {1950s 1, 1960s 2, 1970s 2, 1980s 2,
// 1990s 3, 2000s 2, 2010s 2, 2020s 3}. The frozen eligibility policy requires
// at least two possible pairs per era, which is C(n,2) >= 2 and therefore n >= 3
// — the same constraint as the 24-team floor across eight eras. The gap was
// 1950s +2 and one each in the 1960s, 1970s, 1980s, 2000s and 2010s.
//
// Selection of THESE seven was made on three source-only criteria, before any
// simulation and with no Candidate 2 output consulted:
//   1. the team-season appears in no prior calibration corpus, holdout manifest
//      or development fixture;
//   2. its coach resolves to an id in src/v3/data/coaches.js, because the
//      policy requires coach identity and a season with no resolvable coach
//      cannot be selected;
//   3. its five documented starters have per-season Wikipedia career tables.
//
// The coach constraint binds hard in the earliest eras: the only 1950s and
// 1960s coaches in the repository's set are John Kundla and Red Auerbach, so
// three of the seven are Celtics seasons. That is a franchise-diversity cost
// recorded rather than hidden — the alternative was a team-season whose coach
// identity could not be verified, which the policy forbids.
import { TEAM_ALIASES_V4 } from "./corpus-v4-spec.mjs";

const F = (slot, name, article = name) => ({ slot, name, article, role: "STARTER" });

/** Appended, never edited: every V4 alias set stays byte-identical. */
export const TEAM_ALIASES_V6 = Object.freeze({
  ...TEAM_ALIASES_V4,
  DEN: ["Denver", "Denver Nuggets"],
  ORL: ["Orlando", "Orlando Magic"],
  WSB: ["Washington", "Washington Bullets", "Capital"],
  MIL: ["Milwaukee", "Milwaukee Bucks"],
  IND: ["Indiana", "Indiana Pacers"],
  CLE: ["Cleveland", "Cleveland Cavaliers"],
  MIN_TWOLVES: ["Minnesota", "Minnesota Timberwolves"],
});

const POOL_V6_SPEC_RAW = Object.freeze([
  // ── 1950s: gap +2 ────────────────────────────────────────────────────────
  { fixtureId: "v6-1952-53-lakers", eraStyleId: "1950s", teamId: "MIN_LAKERS", teamName: "Minneapolis Lakers",
    seasonStartYear: 1952, season: "1952-53", teamArticle: "1952–53 Minneapolis Lakers season",
    coachId: "john-kundla", coachName: "John Kundla", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "post-centred", defense: "physical man",
      tags: ["POST_HEAVY", "SIZE_HEAVY", "STRONG_DEFENSIVE_REBOUNDING"] },
    five: [F("PG", "Slater Martin"), F("SG", "Whitey Skoog"), F("SF", "Jim Pollard"),
      F("PF", "Vern Mikkelsen"), F("C", "George Mikan")] },
  { fixtureId: "v6-1959-60-celtics", eraStyleId: "1950s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1959, season: "1959-60", teamArticle: "1959–60 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "very fast", offense: "fast break", defense: "rim-anchored man",
      tags: ["TRANSITION", "RIM_PROTECTION", "STRONG_DEFENSIVE_REBOUNDING"] },
    five: [F("PG", "Bob Cousy"), F("SG", "Bill Sharman"), F("SF", "Tom Heinsohn"),
      F("PF", "Jim Loscutoff"), F("C", "Bill Russell")] },

  // ── 1960s: gap +1 ────────────────────────────────────────────────────────
  { fixtureId: "v6-1965-66-celtics", eraStyleId: "1960s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1965, season: "1965-66", teamArticle: "1965–66 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "fast break and movement", defense: "rim-anchored man",
      tags: ["TRANSITION", "RIM_PROTECTION", "BALANCED"] },
    five: [F("PG", "K. C. Jones"), F("SG", "Sam Jones"), F("SF", "John Havlicek"),
      F("PF", "Satch Sanders"), F("C", "Bill Russell")] },

  // ── 1970s: gap +1 ────────────────────────────────────────────────────────
  { fixtureId: "v6-1974-75-celtics", eraStyleId: "1970s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1974, season: "1974-75", teamArticle: "1974–75 Boston Celtics season",
    coachId: "tom-heinsohn", coachName: "Tom Heinsohn", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "movement and passing", defense: "help man",
      tags: ["MOVEMENT", "PASSING", "BALANCED"] },
    five: [F("PG", "Jo Jo White"), F("SG", "Don Chaney"), F("SF", "John Havlicek"),
      F("PF", "Paul Silas"), F("C", "Dave Cowens")] },

  // ── 1980s: gap +1 ────────────────────────────────────────────────────────
  { fixtureId: "v6-1984-85-nuggets", eraStyleId: "1980s", teamId: "DEN", teamName: "Denver Nuggets",
    seasonStartYear: 1984, season: "1984-85", teamArticle: "1984–85 Denver Nuggets season",
    coachId: "doug-moe", coachName: "Doug Moe", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "extreme fast", offense: "passing motion, no set plays", defense: "gambling man",
      tags: ["PACE_EXTREME", "MOVEMENT", "WEAK_DEFENSE"] },
    five: [F("PG", "Fat Lever"), F("SG", "T. R. Dunn"), F("SF", "Alex English"),
      F("PF", "Calvin Natt"), F("C", "Danny Schayes")] },

  // ── 2000s: gap +1 ────────────────────────────────────────────────────────
  { fixtureId: "v6-2008-09-magic", eraStyleId: "2000s", teamId: "ORL", teamName: "Orlando Magic",
    seasonStartYear: 2008, season: "2008-09", teamArticle: "2008–09 Orlando Magic season",
    coachId: "stan-van-gundy", coachName: "Stan Van Gundy", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "average", offense: "inside-out, four-out spacing", defense: "rim-anchored drop",
      tags: ["THREE_POINT_HEAVY", "RIM_PROTECTION", "INSIDE_OUT"] },
    five: [F("PG", "Rafer Alston"), F("SG", "Courtney Lee"), F("SF", "Hedo Türkoğlu"),
      F("PF", "Rashard Lewis"), F("C", "Dwight Howard")] },

  // ── 2010s: gap +1 ────────────────────────────────────────────────────────
  { fixtureId: "v6-2011-12-bulls", eraStyleId: "2010s", teamId: "CHI", teamName: "Chicago Bulls",
    seasonStartYear: 2011, season: "2011-12", teamArticle: "2011–12 Chicago Bulls season",
    coachId: "tom-thibodeau", coachName: "Tom Thibodeau", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "pick-and-roll driven", defense: "scheme-heavy help man",
      tags: ["STRONG_DEFENSE", "PICK_AND_ROLL", "SLOW_PACE"] },
    five: [F("PG", "Derrick Rose"), F("SG", "Richard Hamilton"), F("SF", "Luol Deng"),
      F("PF", "Carlos Boozer"), F("C", "Joakim Noah")] },
]);

/**
 * Wave two. Wave one closed the era gaps but was chosen for era coverage alone,
 * and the frozen near-overlap rule then excluded five of its seven: adjacent
 * dynasty seasons share four or five of their five with an already-consumed
 * team-season, which is exactly what that rule exists to catch. These 22 were
 * pre-screened against every consumed lineup before a single page was fetched.
 *
 * Two source-side constraints bound the choice, and both narrowed it hard:
 *   1. the coach must resolve to an id in src/v3/data/coaches.js. That set holds
 *      30 coaches, so whole franchises are unreachable — the only 1950s coaches
 *      are Red Auerbach and John Kundla, and the entire 1960s admits just three
 *      team-seasons with a resolvable coach. The 1960s therefore lands on the
 *      3-team minimum with no slack, and two of its three sit at exactly 3/5
 *      shared people: allowed and recorded by the frozen rule, not a waiver.
 *   2. the five must share at most three people with every lineup any prior set
 *      has seen. Overlap counts below are my pre-screen; the pool audit
 *      recomputes them from the built profiles and its number is the one that
 *      governs.
 *
 * Starter assignments are claims this spec makes; the adapter verifies only that
 * the person played for that team that season. Where it refuses, the profile is
 * unresolved and the team-season drops out — it is never filled in.
 */
const POOL_V6_EXPANSION_RAW = Object.freeze([
  // ── 1950s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-1950-51-celtics", eraStyleId: "1950s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1950, season: "1950-51", teamArticle: "1950–51 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "guard-driven fast break", defense: "man",
      tags: ["TRANSITION", "GUARD_HEAVY"] },
    five: [F("PG", "Bob Cousy"), F("SG", "Sonny Hertzberg"), F("SF", "Chuck Cooper", "Chuck Cooper (basketball)"),
      F("PF", "Bob Donham"), F("C", "Ed Macauley")] },
  { fixtureId: "v6x-1953-54-celtics", eraStyleId: "1950s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1953, season: "1953-54", teamArticle: "1953–54 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "guard-driven fast break", defense: "physical man",
      tags: ["TRANSITION", "GUARD_HEAVY", "PHYSICAL"] },
    five: [F("PG", "Bob Cousy"), F("SG", "Bill Sharman"), F("SF", "Bob Brannum"),
      F("PF", "Bob Harris", "Bob Harris (basketball)"), F("C", "Ed Macauley")] },
  { fixtureId: "v6x-1958-59-lakers", eraStyleId: "1950s", teamId: "MIN_LAKERS", teamName: "Minneapolis Lakers",
    seasonStartYear: 1958, season: "1958-59", teamArticle: "1958–59 Minneapolis Lakers season",
    coachId: "john-kundla", coachName: "John Kundla", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "wing-centred", defense: "man",
      tags: ["WING_HEAVY", "POST_PRESENCE"] },
    five: [F("PG", "Hot Rod Hundley"), F("SG", "Dick Garmaker"), F("SF", "Elgin Baylor"),
      F("PF", "Vern Mikkelsen"), F("C", "Larry Foust")] },
  // ── 1960s: only three team-seasons in this era have a resolvable coach ────
  { fixtureId: "v6x-1967-68-knicks", eraStyleId: "1960s", teamId: "NYK", teamName: "New York Knicks",
    seasonStartYear: 1967, season: "1967-68", teamArticle: "1967–68 New York Knicks season",
    coachId: "red-holzman", coachName: "Red Holzman", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "passing motion", defense: "team man with pressure",
      tags: ["BALL_MOVEMENT", "PERIMETER_PRESSURE"] },
    five: [F("PG", "Walt Frazier"), F("SG", "Dick Barnett"), F("SF", "Cazzie Russell"),
      F("PF", "Willis Reed"), F("C", "Walt Bellamy")] },
  { fixtureId: "v6x-1969-70-celtics", eraStyleId: "1960s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1969, season: "1969-70", teamArticle: "1969–70 Boston Celtics season",
    coachId: "tom-heinsohn", coachName: "Tom Heinsohn", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "very fast", offense: "fast break", defense: "man",
      tags: ["TRANSITION", "WING_HEAVY"] },
    five: [F("PG", "Jo Jo White"), F("SG", "John Havlicek"), F("SF", "Don Nelson"),
      F("PF", "Tom Sanders", "Satch Sanders"), F("C", "Henry Finkel")] },
  // ── 1970s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-1974-75-bullets", eraStyleId: "1970s", teamId: "WSB", teamName: "Washington Bullets",
    seasonStartYear: 1974, season: "1974-75", teamArticle: "1974–75 Washington Bullets season",
    coachId: "kc-jones", coachName: "K.C. Jones", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "post and wing", defense: "physical man",
      tags: ["POST_HEAVY", "STRONG_DEFENSIVE_REBOUNDING"] },
    five: [F("PG", "Kevin Porter", "Kevin Porter (basketball)"), F("SG", "Phil Chenier"),
      F("SF", "Mike Riordan"), F("PF", "Elvin Hayes"), F("C", "Wes Unseld")] },
  { fixtureId: "v6x-1976-77-spurs", eraStyleId: "1970s", teamId: "SAS", teamName: "San Antonio Spurs",
    seasonStartYear: 1976, season: "1976-77", teamArticle: "1976–77 San Antonio Spurs season",
    coachId: "doug-moe", coachName: "Doug Moe", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "very fast", offense: "free-flowing high volume", defense: "gambling man",
      tags: ["TRANSITION", "HIGH_VOLUME", "WEAK_INTERIOR_DEFENSE"] },
    five: [F("PG", "James Silas"), F("SG", "George Gervin"), F("SF", "Larry Kenon"),
      F("PF", "Mark Olberding"), F("C", "Billy Paultz")] },
  { fixtureId: "v6x-1977-78-sixers", eraStyleId: "1970s", teamId: "PHI", teamName: "Philadelphia 76ers",
    seasonStartYear: 1977, season: "1977-78", teamArticle: "1977–78 Philadelphia 76ers season",
    coachId: "billy-cunningham", coachName: "Billy Cunningham", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "isolation and transition", defense: "athletic man",
      tags: ["ISOLATION", "TRANSITION", "SIZE_HEAVY"] },
    five: [F("PG", "Henry Bibby"), F("SG", "Doug Collins", "Doug Collins (basketball)"),
      F("SF", "Julius Erving"), F("PF", "George McGinnis"), F("C", "Caldwell Jones")] },
  // ── 1980s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-1980-81-bucks", eraStyleId: "1980s", teamId: "MIL", teamName: "Milwaukee Bucks",
    seasonStartYear: 1980, season: "1980-81", teamArticle: "1980–81 Milwaukee Bucks season",
    coachId: "don-nelson", coachName: "Don Nelson", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "movement and mismatch hunting", defense: "team man",
      tags: ["BALL_MOVEMENT", "MISMATCH_HUNTING"] },
    five: [F("PG", "Quinn Buckner"), F("SG", "Brian Winters"), F("SF", "Marques Johnson"),
      F("PF", "Mickey Johnson"), F("C", "Bob Lanier")] },
  { fixtureId: "v6x-1982-83-sonics", eraStyleId: "1980s", teamId: "SEA", teamName: "Seattle SuperSonics",
    seasonStartYear: 1982, season: "1982-83", teamArticle: "1982–83 Seattle SuperSonics season",
    coachId: "lenny-wilkens", coachName: "Lenny Wilkens", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "balanced", defense: "man with help",
      tags: ["BALANCED", "HELP_DEFENSE"] },
    five: [F("PG", "Gus Williams", "Gus Williams (basketball)"), F("SG", "Fred Brown", "Fred Brown (basketball)"),
      F("SF", "David Thompson", "David Thompson (basketball)"), F("PF", "Lonnie Shelton"), F("C", "Jack Sikma")] },
  { fixtureId: "v6x-1983-84-knicks", eraStyleId: "1980s", teamId: "NYK", teamName: "New York Knicks",
    seasonStartYear: 1983, season: "1983-84", teamArticle: "1983–84 New York Knicks season",
    coachId: "hubie-brown", coachName: "Hubie Brown", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "structured isolation", defense: "physical man",
      tags: ["ISOLATION", "PHYSICAL", "SLOW_PACE"] },
    five: [F("PG", "Rory Sparrow"), F("SG", "Ray Williams", "Ray Williams (basketball)"),
      F("SF", "Bernard King"), F("PF", "Truck Robinson"), F("C", "Bill Cartwright")] },
  // ── 1990s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-1991-92-blazers", eraStyleId: "1990s", teamId: "POR", teamName: "Portland Trail Blazers",
    seasonStartYear: 1991, season: "1991-92", teamArticle: "1991–92 Portland Trail Blazers season",
    coachId: "rick-adelman", coachName: "Rick Adelman", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "wing attack and transition", defense: "athletic man",
      tags: ["TRANSITION", "WING_HEAVY", "STRONG_REBOUNDING"] },
    five: [F("PG", "Terry Porter"), F("SG", "Clyde Drexler"), F("SF", "Jerome Kersey"),
      F("PF", "Buck Williams"), F("C", "Kevin Duckworth")] },
  { fixtureId: "v6x-1992-93-cavaliers", eraStyleId: "1990s", teamId: "CLE", teamName: "Cleveland Cavaliers",
    seasonStartYear: 1992, season: "1992-93", teamArticle: "1992–93 Cleveland Cavaliers season",
    coachId: "lenny-wilkens", coachName: "Lenny Wilkens", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "half-court execution", defense: "disciplined man",
      tags: ["HALF_COURT", "EFFICIENT_SHOOTING"] },
    five: [F("PG", "Mark Price"), F("SG", "Craig Ehlo"), F("SF", "Larry Nance"),
      F("PF", "Hot Rod Williams"), F("C", "Brad Daugherty", "Brad Daugherty (basketball)")] },
  { fixtureId: "v6x-1994-95-pacers", eraStyleId: "1990s", teamId: "IND", teamName: "Indiana Pacers",
    seasonStartYear: 1994, season: "1994-95", teamArticle: "1994–95 Indiana Pacers season",
    coachId: "larry-brown", coachName: "Larry Brown", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "off-ball shooting and post", defense: "physical man",
      tags: ["OFF_BALL_SHOOTING", "PHYSICAL", "SLOW_PACE"] },
    five: [F("PG", "Mark Jackson", "Mark Jackson (basketball)"), F("SG", "Reggie Miller"),
      F("SF", "Derrick McKey"), F("PF", "Dale Davis"), F("C", "Rik Smits")] },
  // ── 2000s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-2007-08-jazz", eraStyleId: "2000s", teamId: "UTA", teamName: "Utah Jazz",
    seasonStartYear: 2007, season: "2007-08", teamArticle: "2007–08 Utah Jazz season",
    coachId: "jerry-sloan", coachName: "Jerry Sloan", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "pick and roll flex", defense: "positional man",
      tags: ["PICK_AND_ROLL", "BALL_MOVEMENT"] },
    five: [F("PG", "Deron Williams"), F("SG", "Ronnie Brewer"), F("SF", "Andrei Kirilenko"),
      F("PF", "Carlos Boozer"), F("C", "Mehmet Okur")] },
  { fixtureId: "v6x-2007-08-rockets", eraStyleId: "2000s", teamId: "HOU", teamName: "Houston Rockets",
    seasonStartYear: 2007, season: "2007-08", teamArticle: "2007–08 Houston Rockets season",
    coachId: "rick-adelman", coachName: "Rick Adelman", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "corner-cut motion into the post", defense: "help-heavy man",
      tags: ["MOTION", "POST_PRESENCE", "HELP_DEFENSE"] },
    five: [F("PG", "Rafer Alston"), F("SG", "Tracy McGrady"), F("SF", "Shane Battier"),
      F("PF", "Luis Scola"), F("C", "Yao Ming")] },
  // ── 2010s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-2010-11-mavericks", eraStyleId: "2010s", teamId: "DAL", teamName: "Dallas Mavericks",
    seasonStartYear: 2010, season: "2010-11", teamArticle: "2010–11 Dallas Mavericks season",
    coachId: "rick-carlisle", coachName: "Rick Carlisle", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "slow", offense: "high-post isolation with spacing", defense: "zone-mixing man",
      tags: ["ISOLATION", "SPACING", "ZONE_MIXING"] },
    five: [F("PG", "Jason Kidd"), F("SG", "DeShawn Stevenson"), F("SF", "Shawn Marion"),
      F("PF", "Dirk Nowitzki"), F("C", "Tyson Chandler")] },
  { fixtureId: "v6x-2012-13-timberwolves", eraStyleId: "2010s", teamId: "MIN_TWOLVES", teamName: "Minnesota Timberwolves",
    seasonStartYear: 2012, season: "2012-13", teamArticle: "2012–13 Minnesota Timberwolves season",
    coachId: "rick-adelman", coachName: "Rick Adelman", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "corner-cut motion", defense: "positional man",
      tags: ["MOTION", "BALL_MOVEMENT"] },
    five: [F("PG", "Ricky Rubio"), F("SG", "Alexey Shved"), F("SF", "Andrei Kirilenko"),
      F("PF", "Kevin Love"), F("C", "Nikola Peković")] },
  { fixtureId: "v6x-2012-13-nuggets", eraStyleId: "2010s", teamId: "DEN", teamName: "Denver Nuggets",
    seasonStartYear: 2012, season: "2012-13", teamArticle: "2012–13 Denver Nuggets season",
    coachId: "george-karl", coachName: "George Karl", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "very fast", offense: "transition and rim attack", defense: "gambling man",
      tags: ["TRANSITION", "RIM_ATTACK", "POOR_PERIMETER_SHOOTING"] },
    five: [F("PG", "Ty Lawson"), F("SG", "Andre Iguodala"), F("SF", "Danilo Gallinari"),
      F("PF", "Kenneth Faried"), F("C", "Kosta Koufos")] },
  // ── 2020s ────────────────────────────────────────────────────────────────
  { fixtureId: "v6x-2020-21-spurs", eraStyleId: "2020s", teamId: "SAS", teamName: "San Antonio Spurs",
    seasonStartYear: 2020, season: "2020-21", teamArticle: "2020–21 San Antonio Spurs season",
    coachId: "gregg-popovich", coachName: "Gregg Popovich", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "mid-range motion", defense: "disciplined man",
      tags: ["MOTION", "MID_RANGE", "LOW_THREE_VOLUME"] },
    five: [F("PG", "Dejounte Murray"), F("SG", "Derrick White"), F("SF", "Keldon Johnson"),
      F("PF", "Rudy Gay"), F("C", "Jakob Pöltl")] },
  { fixtureId: "v6x-2020-21-mavericks", eraStyleId: "2020s", teamId: "DAL", teamName: "Dallas Mavericks",
    seasonStartYear: 2020, season: "2020-21", teamArticle: "2020–21 Dallas Mavericks season",
    coachId: "rick-carlisle", coachName: "Rick Carlisle", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "pick and roll with five-out spacing", defense: "drop-coverage man",
      tags: ["PICK_AND_ROLL", "SPACING", "HIGH_THREE_VOLUME"] },
    five: [F("PG", "Luka Dončić"), F("SG", "Tim Hardaway Jr."), F("SF", "Dorian Finney-Smith"),
      F("PF", "Kristaps Porziņģis"), F("C", "Maxi Kleber")] },
  { fixtureId: "v6x-2023-24-pacers", eraStyleId: "2020s", teamId: "IND", teamName: "Indiana Pacers",
    seasonStartYear: 2023, season: "2023-24", teamArticle: "2023–24 Indiana Pacers season",
    coachId: "rick-carlisle", coachName: "Rick Carlisle", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "very fast", offense: "transition and short-roll passing", defense: "drop-coverage man",
      tags: ["TRANSITION", "BALL_MOVEMENT", "HIGH_THREE_VOLUME"] },
    five: [F("PG", "Tyrese Haliburton"), F("SG", "Andrew Nembhard"), F("SF", "Aaron Nesmith"),
      F("PF", "Pascal Siakam"), F("C", "Myles Turner")] },
]);

/**
 * Name corrections made during ingestion, each verified against the source
 * rather than guessed. The adapter refused all four rather than substituting a
 * near match, which is the behaviour that made them visible.
 */
export const V6_NAME_CORRECTIONS = Object.freeze([
  { from: "Tom Sanders", to: "Satch Sanders", fixtures: ["v6-1959-60-celtics", "v6-1965-66-celtics"],
    why: "his Wikipedia article is titled Satch Sanders; Tom Sanders (basketball) does not exist." },
  { from: "Charlie Scott", to: "Don Chaney", fixtures: ["v6-1974-75-celtics"],
    why: "Charlie Scott is not named anywhere on the 1974-75 Boston Celtics season page and does not appear in its roster or statistics tables — he joined the Celtics the following season. Don Chaney is named on that page and resolves from his own career table. This is a roster correction, not a title correction." },
  { from: "Lafayette Lever", to: "Fat Lever", fixtures: ["v6-1984-85-nuggets"],
    why: "his Wikipedia article is titled Fat Lever." },
  { from: "Satch Sanders", to: "Jim Loscutoff", fixtures: ["v6-1959-60-celtics"],
    why: "Satch Sanders was drafted in 1960, so 1960-61 was his first season and he is not named on the 1959-60 Boston Celtics season page. Jim Loscutoff is named there and resolves from his own career table. A second roster correction, found the same way: the adapter refused rather than substituting a near match." },
]);

/**
 * Documented prose to controlled vocabulary.
 *
 * The trait registry is keyed by the descriptor STRING, so a style written as
 * free prose is unscoreable: it resolves to no trait, no metric and no claim.
 * Wave two was written in prose, and the result was that 50 of the 92
 * descriptors across the selected sides matched nothing in the registry and
 * three sides had no scoreable trait at all. That is a defect in this file, not
 * in the registry.
 *
 * Every entry below is a translation of my own prose into the nearest existing
 * registry term. It is applied mechanically and identically to every wave-two
 * row, so no team gets a claim another team with the same documented style
 * would not get. A prose term with no registry equivalent maps to null and is
 * dropped rather than approximated — GUARD_HEAVY, PHYSICAL and WING_HEAVY
 * describe rosters the registry has no metric for, and inventing one would be
 * scoring a number nothing produces.
 *
 * The original prose is preserved on each row as `documentedStyle`. Nothing is
 * rewritten away; the identity field is the scoreable projection of it.
 */
export const STYLE_TO_REGISTRY = Object.freeze({
  pace: {
    "extreme fast": "very fast", average: "moderate", balanced: "moderate",
  },
  offense: {
    "guard-driven fast break": "fast break, early offence",
    "fast break": "fast break, early offence",
    "free-flowing high volume": "fast break and early offence",
    "wing attack and transition": "fast break and early offence",
    "transition and rim attack": "fast break and early offence",
    "transition and short-roll passing": "fast break and early offence",
    "isolation and transition": "isolation and post-up in the half court",
    "structured isolation": "isolation and post-up in the half court",
    "high-post isolation with spacing": "isolation and post-up in the half court",
    "wing-centred": "isolation and post-up in the half court",
    "passing motion": "motion, ball movement, high-post passing",
    "passing motion, no set plays": "motion, ball movement, high-post passing",
    "movement and mismatch hunting": "motion and cutting",
    "corner-cut motion into the post": "motion and cutting",
    "corner-cut motion": "motion and cutting",
    "mid-range motion": "half-court motion and passing",
    "off-ball shooting and post": "movement shooting off screens",
    "post and wing": "post entry to a dominant centre",
    "inside-out, four-out spacing": "post-up centre with perimeter spacing",
    "pick and roll flex": "the canonical pick-and-roll",
    "pick and roll with five-out spacing": "pick-and-roll around a lead guard",
    "post-centred": "post-centred, interior scoring",
    "fast break and movement": "fast break and early offence",
    "movement and passing": "half-court motion and passing",
    "pick-and-roll driven": "the canonical pick-and-roll",
    "half-court execution": "half-court execution, elite passing front line",
  },
  defense: {
    man: "disciplined man",
    "athletic man": "disciplined man",
    "team man with pressure": "pressure man with help",
    "gambling man": "gambling man defence",
    "man with a shot-blocking centre": "rim-anchored man",
    "rim-anchored drop": "drop coverage with a rim anchor",
    "drop-coverage man": "drop coverage with a rim anchor",
    "zone-mixing man": "zone-capable, scheme-heavy",
    "help man": "help-heavy man",
    "scheme-heavy help man": "help-heavy man",
    "team man": "disciplined team man",
    "positional man": "disciplined man",
  },
  tags: {
    BALL_MOVEMENT: "PASSING_HUB", MOVEMENT: "MOTION", OFF_BALL_SHOOTING: "MOTION",
    STRONG_REBOUNDING: "STRONG_OFFENSIVE_REBOUNDING", POST_PRESENCE: "POST_HEAVY",
    INSIDE_OUT: "POST_HEAVY", ISOLATION: "ISOLATION_HEAVY", SLOW_PACE: "SLOW_HALF_COURT",
    HIGH_THREE_VOLUME: "THREE_POINT_HEAVY", LOW_THREE_VOLUME: "LOW_THREE_POINT",
    POOR_PERIMETER_SHOOTING: "LOW_THREE_POINT", ZONE_MIXING: "ZONE_CAPABLE",
    // no registry trait, and no metric that could score one: dropped, not approximated
    GUARD_HEAVY: null, PHYSICAL: null, WING_HEAVY: null, PERIMETER_PRESSURE: null,
    WEAK_DEFENSE: null, HELP_DEFENSE: null, RIM_PROTECTION: null, SPACING: null,
    RIM_ATTACK: null, HIGH_VOLUME: null, WEAK_INTERIOR_DEFENSE: null, MID_RANGE: null,
    STRONG_DEFENSIVE_REBOUNDING: null, BALANCED: null, MISMATCH_HUNTING: null,
    EFFICIENT_SHOOTING: null,
    PASSING: "PASSING_HUB", HALF_COURT: "SLOW_HALF_COURT",
    // STRONG_DEFENSE is deliberately NOT mapped to ELITE_DEFENSE. The registry's
    // only claim-bearing defensive-quality trait is ELITE, and promoting "strong"
    // to "elite" would strengthen a documented claim to make it scoreable.
    STRONG_DEFENSE: null,
  },
});

const project = (identity) => {
  const m = STYLE_TO_REGISTRY;
  const tags = [...new Set((identity.tags ?? [])
    .map((t) => (t in m.tags ? m.tags[t] : t)).filter(Boolean))];
  return Object.freeze({
    pace: m.pace[identity.pace] ?? identity.pace,
    offense: m.offense[identity.offense] ?? identity.offense,
    defense: m.defense[identity.defense] ?? identity.defense,
    tags,
  });
};

/**
 * Wave-two rows, and the two wave-one rows still in the pool, with their
 * identity projected onto the registry vocabulary and their prose retained.
 */
export const projectIdentities = (rows) => Object.freeze(rows.map((f) => Object.freeze({
  ...f, documentedStyle: f.identity, identity: project(f.identity),
})));

export const V6_SPEC_RATIONALE = Object.freeze({
  gapClosed: { "1950s": 2, "1960s": 1, "1970s": 1, "1980s": 1, "2000s": 1, "2010s": 1 },
  selectionCriteria: ["unused in every prior set", "coach resolves to a repository coach id",
    "five documented starters with per-season career tables"],
  candidate2OutputConsulted: false,
  simulationsRun: 0,
  franchiseDiversityCost: "three of the seven are Boston Celtics seasons. The only 1950s and 1960s coaches in src/v3/data/coaches.js are John Kundla and Red Auerbach, and the policy requires a resolvable coach, so early-era choices are narrow. Recorded rather than hidden.",
  styleDiversityAdded: ["pace extreme (1984-85 Nuggets)", "four-out spacing with rim anchor (2008-09 Magic)",
    "scheme-heavy defence with slow pace (2011-12 Bulls)", "fast break (1959-60 and 1965-66 Celtics)",
    "post-centred (1952-53 Lakers)", "movement and passing (1974-75 Celtics)"],
});

/**
 * Wave three. Two 1950s team-seasons, added because the version-1 runner dry run
 * simulated Boston Celtics 1950-51 and Minneapolis Lakers 1955-56 outside the
 * formal run (see v6-dry-run-taint.json). Excluding those two left the 1950s
 * with two eligible teams and therefore one possible pair, below the frozen
 * minimum of two.
 *
 * The 1950s is where the coach constraint binds hardest: the only coaches in
 * src/v3/data/coaches.js for that decade are Red Auerbach and John Kundla, so
 * every 1950s candidate must be a Celtics or a Minneapolis Lakers season. These
 * are the two remaining unused ones whose fives share at most three people with
 * any consumed lineup. Identity is written in registry vocabulary directly this
 * time rather than in prose.
 *
 * 1957-58 Minneapolis was considered and rejected: George Mikan coached 39 games
 * of that season, so the coach-season attribution is not clean.
 */
const POOL_V6_WAVE3_RAW = Object.freeze([
  { fixtureId: "v6y-1951-52-celtics", eraStyleId: "1950s", teamId: "BOS", teamName: "Boston Celtics",
    seasonStartYear: 1951, season: "1951-52", teamArticle: "1951–52 Boston Celtics season",
    coachId: "red-auerbach", coachName: "Red Auerbach", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "fast", offense: "fast break, early offence", defense: "physical man",
      tags: ["TRANSITION", "PASSING_HUB"] },
    five: [F("PG", "Bob Cousy"), F("SG", "Bill Sharman"), F("SF", "Bob Donham"),
      F("PF", "Bob Harris", "Bob Harris (basketball)"), F("C", "Ed Macauley")] },
  { fixtureId: "v6y-1956-57-lakers", eraStyleId: "1950s", teamId: "MIN_LAKERS", teamName: "Minneapolis Lakers",
    seasonStartYear: 1956, season: "1956-57", teamArticle: "1956–57 Minneapolis Lakers season",
    coachId: "john-kundla", coachName: "John Kundla", fixtureType: "HISTORICAL_STARTER_PROXY",
    identity: { pace: "moderate", offense: "post-centred, interior scoring", defense: "disciplined man",
      tags: ["POST_HEAVY", "SIZE_HEAVY"] },
    five: [F("PG", "Bobby Leonard"), F("SG", "Dick Garmaker"), F("SF", "Ed Kalafat"),
      F("PF", "Vern Mikkelsen"), F("C", "Clyde Lovellette")] },
]);

export const POOL_V6_SPEC = projectIdentities(POOL_V6_SPEC_RAW);
export const POOL_V6_WAVE3 = projectIdentities(POOL_V6_WAVE3_RAW);
export const POOL_V6_EXPANSION = projectIdentities(POOL_V6_EXPANSION_RAW);
