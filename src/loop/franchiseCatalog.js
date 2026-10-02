// Curated proposals using the existing canonical player-decade cards only.
// Sources establish historical context, not an official all-time ranking.
// See docs/data/franchise-rosters-2026-10-02.md for availability limitations.
import { PLAYERS, POSITIONS, findCard } from "../players.js";
import { isLegalLineup } from "../lineupPlacement.js";

export const FRANCHISE_DATA_VERSION = "loop-franchises-1.0.0";
export const AUTOMATIC_FRANCHISE_COACH_ID = "neutral";
export const AUTOMATIC_FRANCHISE_ERA = "2020s";
const rows = [
  {
    "id": "atlanta",
    "city": "Atlanta",
    "name": "Atlanta Hawks",
    "lineage": "Hawks",
    "playerIds": [
      "trae-20s",
      "hudson-70s",
      "dom-80s",
      "bob-60s",
      "dik-90s"
    ],
    "notes": "Includes the St. Louis era through Bob Pettit; balances early interior play with later perimeter creators.",
    "sources": [
      "https://www.nba.com/news/history-legend-dominique-wilkins",
      "https://www.nba.com/news/history-nba-legend-bob-pettit"
    ]
  },
  {
    "id": "boston",
    "city": "Boston",
    "name": "Boston Celtics",
    "lineage": "Celtics",
    "playerIds": [
      "cousy-60s",
      "john-h-70s",
      "bird-80s",
      "mcHale-80s",
      "bill-60s"
    ],
    "notes": "Cousy and Russell join Havlicek and the Bird/McHale frontcourt across distinct championship eras.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-bob-cousy"
    ]
  },
  {
    "id": "brooklyn",
    "city": "Brooklyn",
    "name": "Brooklyn Nets",
    "lineage": "Nets",
    "playerIds": [
      "kidd-00s",
      "petrovic-90s",
      "julius-70s",
      "durant-20s",
      "buck-80s"
    ],
    "notes": "Includes New York ABA and New Jersey history. Buck Williams uses his existing C eligibility; Brook Lopez is absent from the source pool.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-drazen-petrovic",
      "https://www.nba.com/news/history-nba-legend-julius-erving"
    ]
  },
  {
    "id": "charlotte",
    "city": "Charlotte",
    "name": "Charlotte Hornets",
    "lineage": "Hornets/Bobcats",
    "playerIds": [
      "kemba-10s",
      "glen-90s",
      "gwallace-00s",
      "larry-j-90s",
      "alonzo-90s"
    ],
    "notes": "Includes original Charlotte and Bobcats eras. Mourning played in Charlotte before Miami; the reused 1990s card is not a Charlotte-only statistical slice.",
    "sources": [
      "https://www.nba.com/hornets/glen-rice-and-charlotte-hornets-crossed-paths-perfect-time-0",
      "https://www.nba.com/heat/history/hall-fame-alonzo-mourning"
    ]
  },
  {
    "id": "chicago",
    "city": "Chicago",
    "name": "Chicago Bulls",
    "lineage": "Bulls",
    "playerIds": [
      "drose-10s",
      "jordan-90s",
      "pippen-90s",
      "rodman-90s",
      "artis-70s"
    ],
    "notes": "Gilmore supplies center eligibility alongside the 1990s championship core and Derrick Rose.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-michael-jordan"
    ]
  },
  {
    "id": "cleveland",
    "city": "Cleveland",
    "name": "Cleveland Cavaliers",
    "lineage": "Cavaliers",
    "playerIds": [
      "mark-p-90s",
      "dmitch-20s",
      "lebron-00s",
      "nance-90s",
      "brad-80s"
    ],
    "notes": "Price, Nance and Daugherty anchor franchise continuity alongside James and Mitchell; mixes decades intentionally.",
    "sources": [
      "https://www.nba.com/news/archive-75-lebron-james"
    ]
  },
  {
    "id": "dallas",
    "city": "Dallas",
    "name": "Dallas Mavericks",
    "lineage": "Mavericks",
    "playerIds": [
      "luka-20s",
      "blackman-80s",
      "mark-80s",
      "dirk-00s",
      "james-d-80s"
    ],
    "notes": "Blackman, Aguirre and Donaldson represent the early franchise; Nowitzki and Doncic represent later eras.",
    "sources": [
      "https://www.nba.com/news/archive-75-dirk-nowitzki"
    ]
  },
  {
    "id": "denver",
    "city": "Denver",
    "name": "Denver Nuggets",
    "lineage": "Nuggets",
    "playerIds": [
      "murray-20s",
      "david-t-70s",
      "alex-80s",
      "dan-70s",
      "jokic-20s"
    ],
    "notes": "Includes the early Denver lineage. Issel uses existing PF eligibility beside Jokic.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-alex-english"
    ]
  },
  {
    "id": "detroit",
    "city": "Detroit",
    "name": "Detroit Pistons",
    "lineage": "Pistons",
    "playerIds": [
      "isiah-80s",
      "dumars-90s",
      "grant-90s",
      "sheed-2ks",
      "ben-00s"
    ],
    "notes": "Combines the Thomas/Dumars, Hill and Wallace eras; not a single historical season.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-joe-dumars"
    ]
  },
  {
    "id": "golden-state",
    "city": "San Francisco",
    "name": "Golden State Warriors",
    "lineage": "Warriors",
    "playerIds": [
      "curry-10s",
      "klay-10s",
      "rick-70s",
      "draymond-10s",
      "wilt-60s"
    ],
    "notes": "Includes Philadelphia/San Francisco/Oakland lineage. Chamberlain supplies the historical interior alongside modern perimeter play.",
    "sources": [
      "https://www.nba.com/team/1610612744/franchise-leaders"
    ]
  },
  {
    "id": "houston",
    "city": "Houston",
    "name": "Houston Rockets",
    "lineage": "Rockets",
    "playerIds": [
      "murphy-70s",
      "harden-10s",
      "rudy-t-70s",
      "moses-80s",
      "hak-90s"
    ],
    "notes": "Malone uses existing PF eligibility alongside Olajuwon; the 1980s Malone card spans more than Houston.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-hakeem-olajuwon",
      "https://www.nba.com/news/history-nba-legend-calvin-murphy"
    ]
  },
  {
    "id": "indiana",
    "city": "Indianapolis",
    "name": "Indiana Pacers",
    "lineage": "Pacers",
    "playerIds": [
      "tyrese-20s",
      "reggie-90s",
      "pg-10s",
      "jermaine-2ks",
      "turner-20s"
    ],
    "notes": "Curated from the available cards across the Miller, ONeal and modern eras; ABA legends missing from the pool are not fabricated.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-reggie-miller"
    ]
  },
  {
    "id": "la-clippers",
    "city": "Los Angeles",
    "name": "LA Clippers",
    "lineage": "Clippers/Braves",
    "playerIds": [
      "cp3-10s",
      "pg-20s",
      "kawhi-20s",
      "blake-10s",
      "bob-mc-70s"
    ],
    "notes": "Includes Buffalo Braves lineage through Bob McAdoo, rather than excluding the franchise original MVP center.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-bob-mcadoo",
      "https://www.nba.com/clippers/city-edition"
    ]
  },
  {
    "id": "la-lakers",
    "city": "Los Angeles",
    "name": "Los Angeles Lakers",
    "lineage": "Lakers",
    "playerIds": [
      "magic-80s",
      "kobe-00s",
      "elgin-60s",
      "worthy-80s",
      "kareem-80s"
    ],
    "notes": "Worthy uses existing PF eligibility to keep the perimeter and traditional center slots legal; Minneapolis lineage remains part of pool coverage.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-magic-johnson"
    ]
  },
  {
    "id": "memphis",
    "city": "Memphis",
    "name": "Memphis Grizzlies",
    "lineage": "Grizzlies",
    "playerIds": [
      "conley-10s",
      "ja-20s",
      "bane-20s",
      "melo-f-00s",
      "marc-10s"
    ],
    "notes": "Morant uses existing SG and Bane existing SF eligibility beside Conley. Tony Allen, Rudy Gay and Memphis-era Zach Randolph cards are unavailable; no rookie is substituted for a historical icon.",
    "sources": [
      "https://www.nba.com/team/1610612763",
      "https://www.nba.com/team/1610612763/franchise-leaders"
    ]
  },
  {
    "id": "miami",
    "city": "Miami",
    "name": "Miami Heat",
    "lineage": "Heat",
    "playerIds": [
      "timH-90s",
      "wade-00s",
      "lebron-10s",
      "bosh-10s",
      "alonzo-90s"
    ],
    "notes": "Combines Hardaway/Mourning, Wade and Big Three eras; James and Mourning cards include other teams in the same decade.",
    "sources": [
      "https://www.nba.com/news/archive-75-dwyane-wade",
      "https://www.nba.com/team/1610612748/franchise-leaders"
    ]
  },
  {
    "id": "milwaukee",
    "city": "Milwaukee",
    "name": "Milwaukee Bucks",
    "lineage": "Bucks",
    "playerIds": [
      "oscar-70s",
      "moncrief-80s",
      "marques-70s",
      "giannis-20s",
      "kareem-70s"
    ],
    "notes": "Robertson and Abdul-Jabbar anchor the first title era alongside Johnson, Moncrief and Antetokounmpo.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-sidney-moncrief",
      "https://www.nba.com/news/history-nba-legend-oscar-robertson"
    ]
  },
  {
    "id": "minnesota",
    "city": "Minneapolis",
    "name": "Minnesota Timberwolves",
    "lineage": "Timberwolves/Wolves",
    "playerIds": [
      "cassell-2ks",
      "ant-20s",
      "butler-10s",
      "kg-00s",
      "kat-20s"
    ],
    "notes": "Cassell, Garnett, Towns and Edwards are core eras. Butler had a short 2017-18 tenure and uses an existing mixed Bulls/Wolves card; owner review should consider longevity.",
    "sources": [
      "https://www.nba.com/timberwolves/history/all-time-numbers",
      "https://www.nba.com/news/archive-75-kevin-garnett"
    ]
  },
  {
    "id": "new-orleans",
    "city": "New Orleans",
    "name": "New Orleans Pelicans",
    "lineage": "Pelicans/New Orleans Hornets",
    "playerIds": [
      "cp3-00s",
      "dejounte-20s",
      "ingram-20s",
      "zion-20s",
      "ad-10s"
    ],
    "notes": "Uses New Orleans history from 2002 onward, including its Hornets name. Murray at SG is an availability/position choice, not a claim of consensus all-time status; missing New Orleans-era Jrue Holiday/David West cards are not invented.",
    "sources": [
      "https://cdn.nba.com/teams/uploads/sites/1610612740/2025/10/2025-26-Pelicans-Media-Guide-v2.pdf",
      "https://www.nba.com/news/2024-25-season-preview-nop"
    ]
  },
  {
    "id": "new-york",
    "city": "New York",
    "name": "New York Knicks",
    "lineage": "Knicks",
    "playerIds": [
      "walt-70s",
      "monroe-70s",
      "king-80s",
      "dave-d-60s",
      "ewing-90s"
    ],
    "notes": "Frazier/Monroe/DeBusschere championship lineage pairs with King and Ewing; DeBusschere joined New York during the 1968-69 season.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-walt-frazier"
    ]
  },
  {
    "id": "oklahoma-city",
    "city": "Oklahoma City",
    "name": "Oklahoma City Thunder",
    "lineage": "Thunder",
    "playerIds": [
      "russ-10s",
      "shai-20s",
      "durant-10s",
      "ibaka-2010s",
      "chet-20s"
    ],
    "notes": "Curated Oklahoma City era only, from 2008 onward. Seattle identities are not relabeled Oklahoma City; this is an explicit narrower content scope.",
    "sources": [
      "https://www.nba.com/news/oklahoma-city-acquires-chris-paul-houston-rockets-official-release"
    ]
  },
  {
    "id": "orlando",
    "city": "Orlando",
    "name": "Orlando Magic",
    "lineage": "Magic",
    "playerIds": [
      "penny-90s",
      "tmac-00s",
      "franz-20s",
      "paolo-20s",
      "shaq-90s"
    ],
    "notes": "Uses Shaq/Penny, McGrady and contemporary forward eras. Wagner/Banchero are young and longevity remains an owner-review choice.",
    "sources": [
      "https://www.nba.com/team/1610612753/franchise-leaders"
    ]
  },
  {
    "id": "philadelphia",
    "city": "Philadelphia",
    "name": "Philadelphia 76ers",
    "lineage": "76ers/Nationals",
    "playerIds": [
      "ai-00s",
      "hal-60s",
      "julius-80s",
      "charles-80s",
      "wilt-60s"
    ],
    "notes": "Syracuse/Philadelphia lineage; no player is added or moved based on an opening-night narrative.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-julius-erving"
    ]
  },
  {
    "id": "phoenix",
    "city": "Phoenix",
    "name": "Phoenix Suns",
    "lineage": "Suns",
    "playerIds": [
      "nash-00s",
      "booker-20s",
      "marion-00s",
      "barkley-90s",
      "amare-00s"
    ],
    "notes": "Stoudemire uses existing C eligibility with Nash/Marion and the Barkley/Booker eras.",
    "sources": [
      "https://www.nba.com/news/archive-75-steve-nash"
    ]
  },
  {
    "id": "portland",
    "city": "Portland",
    "name": "Portland Trail Blazers",
    "lineage": "Blazers",
    "playerIds": [
      "dame-10s",
      "porter-80s",
      "clyde-90s",
      "lucas-m-70s",
      "mychal-80s"
    ],
    "notes": "Porter uses existing SG and Drexler SF eligibility. Bill Walton has no 1970s card and the 1980s Celtics card would misrepresent Portland; Mychal Thompson is a documented available center.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-clyde-drexler",
      "https://www.nba.com/news/archive-75-damian-lillard"
    ]
  },
  {
    "id": "sacramento",
    "city": "Sacramento",
    "name": "Sacramento Kings",
    "lineage": "Kings/Royals",
    "playerIds": [
      "oscar-60s",
      "mitch-90s",
      "peja-00s",
      "webb-90s",
      "boogie-2010s"
    ],
    "notes": "Includes Rochester/Cincinnati/Kansas City/Sacramento lineage. Robertson is a Royals-era selection; Webber 1990s card includes Golden State/Washington/Sacramento.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-oscar-robertson"
    ]
  },
  {
    "id": "san-antonio",
    "city": "San Antonio",
    "name": "San Antonio Spurs",
    "lineage": "Spurs",
    "playerIds": [
      "parker-00s",
      "manu-00s",
      "kawhi-10s",
      "duncan-00s",
      "rob-90s"
    ],
    "notes": "The Duncan/Parker/Ginobili core joins Robinson and Leonard; Leonard card includes more than San Antonio in the decade.",
    "sources": [
      "https://www.nba.com/news/archive-75-tim-duncan"
    ]
  },
  {
    "id": "toronto",
    "city": "Toronto",
    "name": "Toronto Raptors",
    "lineage": "Raptors",
    "playerIds": [
      "lowry-2010s",
      "vince-00s",
      "kawhi-10s",
      "siakam-20s",
      "bosh-00s"
    ],
    "notes": "Leonard is a one-season championship selection; Bosh uses existing C eligibility. Longevity versus peak remains an explicit owner choice.",
    "sources": [
      "https://www.nba.com/raptors/kyle-lowry-rewriting-record-books-again"
    ]
  },
  {
    "id": "utah",
    "city": "Salt Lake City",
    "name": "Utah Jazz",
    "lineage": "Jazz",
    "playerIds": [
      "stock-90s",
      "hornacek-90s",
      "dantley-80s",
      "malone-90s",
      "eaton-80s"
    ],
    "notes": "Stockton/Malone, Dantley, Hornacek and Eaton give legal guard/wing/interior roles; includes the New Orleans Jazz lineage only as Jazz, separate from Pelicans history.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-karl-malone"
    ]
  },
  {
    "id": "washington",
    "city": "Washington",
    "name": "Washington Wizards",
    "lineage": "Wizards/Bullets",
    "playerIds": [
      "wall-2010s",
      "beal-10s",
      "jamison-00s",
      "elvin-70s",
      "wes-60s"
    ],
    "notes": "Includes Baltimore/Capital/Washington Bullets lineage. Jamison uses existing SF eligibility alongside Hayes and Unseld.",
    "sources": [
      "https://www.nba.com/news/history-nba-legend-wes-unseld"
    ]
  }
];
const aliasById = {
  atlanta:["Hawks"], boston:["Celtics"], brooklyn:["Nets"],
  charlotte:["Hornets","Bobcats"], chicago:["Bulls"], cleveland:["Cavaliers"],
  dallas:["Mavericks"], denver:["Nuggets"], detroit:["Pistons"],
  "golden-state":["Warriors"], houston:["Rockets"], indiana:["Pacers"],
  "la-clippers":["Clippers","Braves"], "la-lakers":["Lakers"], memphis:["Grizzlies"],
  miami:["Heat"], milwaukee:["Bucks"], minnesota:["Timberwolves","Wolves"],
  "new-orleans":["Pelicans"], "new-york":["Knicks"], "oklahoma-city":["Thunder"],
  orlando:["Magic"], philadelphia:["76ers","Nationals"], phoenix:["Suns"],
  portland:["Blazers"], sacramento:["Kings","Royals"], "san-antonio":["Spurs"],
  toronto:["Raptors"], utah:["Jazz"], washington:["Wizards","Bullets"],
};

export const FRANCHISES = Object.freeze(rows.map((row) => {
  const matches = PLAYERS.filter((p) => (p.team || "").split("/")
    .some((segment) => aliasById[row.id].includes(segment.trim())))
    .filter((p) => !(row.id === "charlotte" && p.id === "cp3-00s"));
  // Chris Paul belongs to New Orleans in this decade, despite the old Hornets label.
  const poolIds = [...new Set([...matches.map((p) => p.id), ...row.playerIds])];
  return Object.freeze({ ...row, era:"All-time", neutralName: `${row.city}${row.id === "la-lakers" ? " Gold" : row.id === "la-clippers" ? " Blue" : ""} · All-time`,
    reviewStatus:"OWNER_REVIEW", coachId:AUTOMATIC_FRANCHISE_COACH_ID,
    playerIds:Object.freeze(row.playerIds), poolIds:Object.freeze(poolIds),
    slots:Object.freeze(row.playerIds.map((playerId, i) => Object.freeze({pos:POSITIONS[i], playerId}))),
    sources:Object.freeze(row.sources),
  });
}));
const byId = new Map(FRANCHISES.map((f) => [f.id, f]));
export function getFranchise(id) { return typeof id === "string" ? byId.get(id) || null : null; }
export function getFranchiseRoster(id) {
  const franchise = getFranchise(typeof id === "string" ? id : id?.id);
  if (!franchise) throw new Error("Unknown franchise");
  const five = franchise.playerIds.map(findCard);
  if (five.some((p) => !p) || !isLegalLineup(five)) throw new Error(`Unavailable franchise roster: ${franchise.id}`);
  return five;
}
export function franchiseDisplayName(franchise, {neutralNaming = false} = {}) {
  const found = getFranchise(typeof franchise === "string" ? franchise : franchise?.id);
  return found ? (neutralNaming ? found.neutralName : `${found.name} · All-time`) : "Unknown franchise";
}
export const FRANCHISE_PAIRINGS = Object.freeze(FRANCHISES.flatMap((home, index) =>
  FRANCHISES.slice(index + 1).map((away) => {
    const [a, b] = [home.id, away.id].sort();
    const slug = `${a}-vs-${b}`;
    return Object.freeze({ id:slug, slug, homeId:a, awayId:b, goldId:a, blueId:b, path:`/clash/all-time/${slug}` });
  })
));
const pairings = new Map(FRANCHISE_PAIRINGS.map((p) => [p.slug, p]));
export function getFranchisePairing(slug) { return typeof slug === "string" ? pairings.get(slug) || null : null; }
export function franchisePairingFor(a, b) {
  if (!getFranchise(a) || !getFranchise(b) || a === b) return null;
  return getFranchisePairing([a,b].sort().join("-vs-"));
}
