// ── Card statistical basis (what each card's numbers actually ARE) ────────────
// The pool is NOT statistically uniform, and pretending otherwise would be the
// most dangerous kind of quiet dishonesty: every downstream layer treats
// `pts` as one comparable quantity, when in fact four different things are
// stored under that name. This file records which is which, per card, so a
// consumer can weight or exclude on the basis rather than guessing.
//
// HOW THIS WAS DERIVED — from provenance, not from vibes. Cards were grouped by
// the section of players.js that introduced them (each section maps to a known
// release commit), and the grouping was then corroborated against a rounding
// signal: the share of cards whose pts/reb/ast ALL land exactly on .0 or .5.
// Genuine per-season averages almost never do that; hand-set representative
// figures almost always do.
//
//   group             n     fully-rounded   reading
//   verified-decade   16      0%            computed averages
//   core-pool        286      3%            look computed, provenance undocumented
//   modern-allstars   24      4%            look computed, provenance undocumented
//   rookie-season     11      0%            one real season
//   v2-expansion      44     77%            hand-set prime figures
//
// The 77% vs 3% split is the whole finding. It is not a rounding artefact.

export const STAT_BASIS = {
  /** Unweighted mean of the player's per-season averages inside the decade,
   *  read off a published career table. A season belongs to the decade of its
   *  STARTING year. Verified at entry (v2.6.1 for the 1950s, v2.8.0 for the
   *  Player-Intelligence anchors). This is the project's rigorous convention
   *  and the one new cards must follow. */
  DECADE_SEASON_AVERAGE: "DECADE_SEASON_AVERAGE",
  /** Hand-set figures representing the player's typical prime form in that
   *  decade rather than a computed mean — which is why 77% of them land on .0
   *  or .5. Basketball-plausible and useful, but NOT reproducible from a
   *  career table, and systematically higher than the same player's true
   *  decade mean (Rasheed Wallace's 2000s mean is ~14.8; his card says 16.5). */
  REPRESENTATIVE_PRIME: "REPRESENTATIVE_PRIME",
  /** One real season's averages. Used for the 2025 draft class, whose players
   *  have exactly one season of professional record. Documented in players.js. */
  SINGLE_SEASON: "SINGLE_SEASON",
  /** Inherited from the pre-V3 database. The values look like genuine
   *  multi-season averages, but no commit or comment records the season range
   *  or the averaging rule, so they cannot be reproduced or checked without
   *  re-deriving each card from source. Honest label for "we do not know". */
  LEGACY_UNVERIFIED: "LEGACY_UNVERIFIED",
};

// group → { basis, confidence, note }
export const BASIS_GROUPS = {
  "verified-decade": {
    basis: STAT_BASIS.DECADE_SEASON_AVERAGE, confidence: "HIGH",
    note: "Verified against published per-season career tables at entry; decade = season start year; unweighted mean.",
  },
  "v2-expansion": {
    basis: STAT_BASIS.REPRESENTATIVE_PRIME, confidence: "MEDIUM",
    note: "The v2 defense-and-playmaking expansion. Hand-set prime-form figures; 77% land on .0/.5.",
  },
  "modern-allstars": {
    basis: STAT_BASIS.LEGACY_UNVERIFIED, confidence: "MEDIUM",
    note: "Added in v2.7.0. Values look like genuine multi-season averages (4% rounded) but the season range was never documented.",
  },
  "rookie-season": {
    basis: STAT_BASIS.SINGLE_SEASON, confidence: "HIGH",
    note: "2025 draft class, rookie year 2025-26. players.js states the basis explicitly.",
  },
  "core-pool": {
    basis: STAT_BASIS.LEGACY_UNVERIFIED, confidence: "LOW",
    note: "The original database and its incremental additions. Values look computed (3% rounded) but no averaging rule was ever recorded.",
  },
};

const GROUP_MEMBERS = {
  "verified-decade": [
    "mikan-50s", "pettit-50s", "schayes-50s", "cousy-50s", "russell-50s", "arizin-50s",
    "sharman-50s", "eaton-80s", "mullin-90s", "petrovic-90s", "prince-00s", "finley-00s",
    "joshsmith-00s", "gwallace-00s", "walt-b-70s", "nance-90s",
  ],
  "core-pool": [
    "wilt-60s", "bill-60s", "oscar-60s", "jerry-60s", "elgin-60s", "hal-60s", "nate-60s",
    "willis-60s", "bob-60s", "sam-60s", "lenny-60s", "dave-60s", "john-h-60s", "billy-60s",
    "kareem-70s", "julius-70s", "pete-70s", "bob-mc-70s", "rick-70s", "elvin-70s", "dave-c-70s",
    "tiny-70s", "george-70s", "artis-70s", "john-h-70s", "wilt-70s", "oscar-70s", "walt-70s",
    "bob-l-70s", "gail-70s", "spencer-70s", "magic-80s", "bird-80s", "jordan-80s", "kareem-80s",
    "julius-80s", "isiah-80s", "moses-80s", "alex-80s", "dom-80s", "charles-80s", "clyde-80s",
    "mcHale-80s", "parish-80s", "george-80s", "dantley-80s", "jack-80s", "walton-80s",
    "mark-80s", "terry-80s", "jordan-90s", "pippen-90s", "hak-90s", "rob-90s", "barkley-90s",
    "stock-90s", "malone-90s", "ewing-90s", "shaq-90s", "penny-90s", "kemp-90s", "reggie-90s",
    "gary-90s", "dom-90s", "grant-90s", "kidd-90s", "mitch-90s", "isiah-90s", "clyde-90s",
    "dumars-90s", "glen-90s", "alonzo-90s", "larry-j-90s", "dik-90s", "webb-90s", "shaq-00s",
    "kobe-00s", "lebron-00s", "duncan-00s", "kidd-00s", "ai-00s", "tmac-00s", "dirk-00s",
    "wade-00s", "cp3-00s", "kg-00s", "pierce-00s", "carmelo-00s", "vince-00s", "ray-00s",
    "yao-00s", "amare-00s", "arenas-00s", "bosh-00s", "ben-00s", "rip-00s", "melo-f-00s",
    "lebron-10s", "kobe-10s", "durant-10s", "curry-10s", "russ-10s", "harden-10s", "kawhi-10s",
    "dame-10s", "cp3-10s", "giannis-10s", "ad-10s", "kyrie-10s", "luka-10s", "jokic-10s",
    "embiid-10s", "butler-10s", "drose-10s", "blake-10s", "klay-10s", "draymond-10s",
    "beal-10s", "love-10s", "booker-10s", "gobert-10s", "lavine-10s", "kemba-10s", "al-10s",
    "melo-10s", "jokic-20s", "lebron-20s", "giannis-20s", "embiid-20s", "durant-20s",
    "luka-20s", "tatum-20s", "curry-20s", "ad-20s", "butler-20s", "kawhi-20s", "dame-20s",
    "shai-20s", "tyrese-20s", "kyrie-20s", "booker-20s", "ja-20s", "brunson-20s", "bam-20s",
    "wemby-20s", "ant-20s", "paolo-20s", "cade-20s", "evan-20s", "franz-20s", "chet-60s",
    "tom-h-60s", "bailey-60s", "jerry-l-60s", "gus-60s", "dave-d-60s", "don-n-60s", "tom-s-60s",
    "walt-b-60s", "wes-60s", "wayne-60s", "archie-60s", "clem-60s", "dick-v-60s", "lucius-60s",
    "emmette-60s", "jon-m-60s", "fred-h-60s", "paul-s-60s", "leroy-60s", "larry-s-60s",
    "norm-70s", "jojo-70s", "phil-c-70s", "don-b-70s", "kevin-p-70s", "randy-70s",
    "charlie-70s", "mike-n-70s", "kenon-70s", "chet-70s", "bobby-70s", "rudy-t-70s",
    "paul-s-70s", "dan-70s", "tom-b-70s", "swen-70s", "billy-p-70s", "luol-70s", "clint-70s",
    "connie-70s", "james-70s", "david-t-70s", "billy-k-70s", "john-d-70s", "dj-80s", "mo-80s",
    "kj-80s", "price-80s", "porter-80s", "sleepy-80s", "doc-80s", "lever-80s", "tiny-80s",
    "johnny-80s", "byron-80s", "vinnie-80s", "danny-80s", "dale-80s", "wdavis-80s", "ricky-80s",
    "buck-80s", "chambers-80s", "nance-80s", "xavier-80s", "tree-80s", "brad-80s",
    "james-d-80s", "mychal-80s", "benoit-80s", "kj-90s", "timH-90s", "rod-90s", "avery-90s",
    "van-ex-90s", "mark-p-90s", "detlef-90s", "ced-90s", "marion-90s", "antawn-90s",
    "vin-b-90s", "horace-90s", "otis-90s", "popeye-90s", "hersey-90s", "vlade-90s", "luc-90s",
    "calbert-90s", "nash-00s", "baron-00s", "marbury-00s", "parker-00s", "billups-00s",
    "miller-00s", "bibby-00s", "redd-00s", "manu-00s", "joe-j-00s", "peja-00s", "lamar-00s",
    "jamison-00s", "rashard-00s", "marion-00s", "elton-00s", "zach-00s", "ilg-00s", "okur-00s",
    "dwight-00s", "rondo-10s", "conley-10s", "dj-10s", "marc-10s", "hassan-10s", "trae-20s",
    "fox-20s", "og-20s", "sengun-20s", "sabonis-20s", "mitch-r-20s", "walker-k-20s",
    "cousy-60s", "sharman-60s", "boozer-60s", "worthy-80s", "rodman-90s", "dirk-10s",
    "wade-10s", "kg-10s", "dwight-10s", "bosh-10s", "pg-10s", "dmitch-10s", "jbrown-20s",
    "pg-20s", "dmitch-20s", "murray-20s",
  ],
  "v2-expansion": [
    "arizin-60s", "rodgers-60s", "beaty-60s", "guerin-60s", "barry-60s", "monroe-70s",
    "murphy-70s", "westphal-70s", "marques-70s", "hudson-70s", "wicks-70s", "lucas-m-70s",
    "moncrief-80s", "king-80s", "cooper-80s", "toney-80s", "sugar-80s", "blackman-80s",
    "mookie-90s", "hornacek-90s", "oakley-90s", "spree-90s", "bigdog-90s", "kukoc-90s",
    "majerle-90s", "sheed-2ks", "jermaine-2ks", "ak47-2ks", "artest-2ks", "bowen-2ks",
    "camby-2ks", "deron-2ks", "cassell-2ks", "lowry-2010s", "wall-2010s", "demar-2010s",
    "boogie-2010s", "ibaka-2010s", "drummond-2010s", "jrue-20s", "jjj-20s", "zion-20s",
    "smart-20s", "siakam-20s",
  ],
  "modern-allstars": [
    "kat-20s", "maxey-20s", "gobert-20s", "randle-20s", "lamelo-20s", "middleton-20s",
    "barnes-20s", "lauri-20s", "garland-20s", "ingram-20s", "jallen-20s", "chet-20s",
    "jdub-20s", "herro-20s", "bane-20s", "mikal-20s", "reaves-20s", "demar-20s", "draymond-20s",
    "turner-20s", "dejounte-20s", "beal-20s", "lavine-20s", "klay-20s",
  ],
  "rookie-season": [
    "flagg-20s", "knueppel-20s", "edgecombe-20s", "fears-20s", "acebailey-20s", "coward-20s",
    "trejohnson-20s", "harper-20s", "queen-20s", "cmb-20s", "clayton-20s",
  ],
};

const INDEX = (() => {
  const m = new Map();
  for (const [group, ids] of Object.entries(GROUP_MEMBERS)) for (const id of ids) m.set(id, group);
  return m;
})();

/** The statistical basis of one card. Never guesses: a card the registry does
 *  not know returns LEGACY_UNVERIFIED with UNKNOWN confidence rather than
 *  being quietly assumed to follow the rigorous convention. */
export const statBasisFor = (cardId) => {
  const group = INDEX.get(cardId);
  if (!group) {
    return { group: null, basis: STAT_BASIS.LEGACY_UNVERIFIED, confidence: "UNKNOWN",
             note: "Card is not in the basis registry — basis was never recorded.", reproducible: false };
  }
  const g = BASIS_GROUPS[group];
  return { group, ...g, reproducible: g.basis === STAT_BASIS.DECADE_SEASON_AVERAGE || g.basis === STAT_BASIS.SINGLE_SEASON };
};

export const BASIS_GROUP_MEMBERS = GROUP_MEMBERS;
