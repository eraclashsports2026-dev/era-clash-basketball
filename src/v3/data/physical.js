// ── Verified physical metadata (per PERSON, not per card) ─────────────────────
// Height and weight belong to the human, not to the decade, so this file is
// keyed by personId (see data/persons.js). A player's listed weight did drift
// across a long career; where that difference is basketball-material a
// career-phase entry can be added later, but a single canonical profile is the
// honest default rather than inventing per-decade precision we do not have.
//
// WHAT THESE NUMBERS ARE — LISTED roster measurements, published by teams and
// leagues. They are NOT biomechanical truth. Listed heights have historically
// been recorded in shoes, rounded, and occasionally flattered; the NBA only
// began verifying them without shoes in 2019. Treat them as the best public
// record, not as measurement, and never as a tiebreaker finer than an inch.
//
// SOURCE PRIORITY (documented, applied in order):
//   1. Official NBA / official team or player profile
//   2. Naismith Basketball Hall of Fame
//   3. Established statistical reference (Basketball-Reference, or Wikipedia
//      where it mirrors it — b-ref blocks automated reads)
//   4. Reputable historical source
// Every entry below was read from the player's Wikipedia infobox on
// 2026-08-24, which is tier 3. Upgrading high-traffic entries to tier 1 is a
// worthwhile future pass; the tier is recorded so that pass knows what to skip.
//
// WINGSPAN IS NULL EVERYWHERE. No tier-1..3 source publishes wingspan for
// historical players, and wingspan is NOT derivable from height — the whole
// reason it matters (Kawhi Leonard, Kevin Durant, Mark Eaton) is precisely
// that it diverges from height. Estimating it would fabricate the one number a
// consumer would most want to trust. It stays null until a real source exists,
// and validation rejects any attempt to populate it by inference.
//
// CONFLICTS: none encountered in this pass. If two tier-≤3 sources ever
// disagree, record BOTH in `conflict`, pick the higher-tier value as canonical,
// and never silently average them.

const IN = (ft, inch) => ft * 12 + inch;

// personId -> { heightIn, weightLb, wingspanIn, source, sourceTier, verifiedOn }
const W = "Wikipedia infobox (mirrors Basketball-Reference)";
const T = 3;
const D = "2026-08-24";
const P = (personId, ft, inch, lb) => [personId, { heightIn: IN(ft, inch), weightLb: lb, wingspanIn: null, source: W, sourceTier: T, verifiedOn: D, basis: "LISTED_ROSTER" }];

export const PHYSICAL = Object.fromEntries([
  // — guards —
  P("bob-cousy", 6, 1, 175),
  P("jerry-west", 6, 3, 175),
  P("allen-iverson", 6, 0, 165),
  P("stephen-curry", 6, 2, 185),
  P("gary-payton", 6, 4, 190),
  P("sidney-moncrief", 6, 4, 180),
  P("russell-westbrook", 6, 4, 200),
  P("oscar-robertson", 6, 5, 205),
  P("james-harden", 6, 5, 220),
  P("klay-thompson", 6, 5, 220),
  P("ray-allen", 6, 5, 205),
  P("drazen-petrovic", 6, 5, 195),
  P("elgin-baylor", 6, 5, 225),
  P("kobe-bryant", 6, 6, 212),
  P("michael-jordan", 6, 6, 216),
  // — wings & forwards —
  P("kawhi-leonard", 6, 6, 225),
  P("draymond-green", 6, 6, 230),
  P("reggie-miller", 6, 7, 195),
  P("chris-mullin", 6, 7, 200),
  P("michael-cooper", 6, 7, 170),
  P("bruce-bowen", 6, 7, 200),
  P("dennis-rodman", 6, 7, 210),
  P("scottie-pippen", 6, 8, 228),
  P("luka-doncic", 6, 8, 230),
  P("magic-johnson", 6, 9, 220),
  P("larry-bird", 6, 9, 220),
  P("lebron-james", 6, 9, 250),
  P("tayshaun-prince", 6, 9, 212),
  P("andrei-kirilenko", 6, 9, 235),
  P("bam-adebayo", 6, 9, 255),
  P("ben-wallace", 6, 9, 240),
  // — bigs —
  P("bill-russell", 6, 10, 215),
  P("larry-nance", 6, 10, 205),
  P("walt-bellamy", 6, 10, 225),
  P("kevin-garnett", 6, 11, 240),
  P("nikola-jokic", 6, 11, 284),
  P("tim-duncan", 6, 11, 250),
  P("kevin-durant", 6, 11, 240),
  P("dirk-nowitzki", 7, 0, 245),
  P("hakeem-olajuwon", 7, 0, 255),
  P("wilt-chamberlain", 7, 1, 250),
  P("shaquille-o-neal", 7, 1, 325),
  P("kareem-abdul-jabbar", 7, 2, 225),
  P("mark-eaton", 7, 4, 275),
]);

/** Physical record for a person, or a null-filled record with UNVERIFIED
 *  provenance. Never estimates, never infers from position or era. */
export const physicalFor = (personId) => {
  const rec = PHYSICAL[personId];
  if (!rec) {
    return {
      heightIn: null, weightLb: null, wingspanIn: null,
      source: null, sourceTier: null, verifiedOn: null,
      basis: "UNVERIFIED",
      confidence: "NONE (no verified measurement on file)",
    };
  }
  return { ...rec, confidence: "MEDIUM-HIGH (listed roster measurement, tier-3 source)" };
};

export const PHYSICAL_PERSON_IDS = Object.keys(PHYSICAL);
