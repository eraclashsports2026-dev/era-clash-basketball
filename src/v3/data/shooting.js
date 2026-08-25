// ── Shooting evidence (per PERSON) ────────────────────────────────────────────
// The weakest part of the derived player model was shooting: with no splits in
// the trusted dataset, every shooting attribute for an uncurated player was
// inferred from position, decade, and scoring volume. Those three things are
// not evidence of shooting identity — they cannot tell Dennis Rodman from
// Dražen Petrović beyond "wing, 90s".
//
// This file adds real evidence. It is deliberately TWO layers, because they
// have different reliability and must never be conflated:
//
//   1. MEASURED SPLITS — career FG%/3P%/FT%, read from a published career
//      table. Exact, verifiable, and null when not obtained. `precision`
//      records EXACT vs ROUNDED (a prose "51% shooting" is not a table value).
//
//   2. CATEGORICAL IDENTITY — what KIND of shooter this was, from the
//      documented playing record. Coarse on purpose. The brief for this layer
//      is "no false precision": an evidence-backed category beats a fabricated
//      decimal, so where shot-location data does not exist we say the category
//      and stop.
//
// ── THE PRE-THREE-POINT RULE (the important one) ─────────────────────────────
// The NBA had no three-point line until 1979-80. For a player who retired
// before it, 3P% is NOT ZERO — it is UNDEFINED, and the two must never collapse
// into each other. Jerry West would obviously have shot threes; the league
// simply did not offer him any. So:
//
//   threePointEra: "NONE"  -> threePct is null and threeVolume is
//                             NOT_APPLICABLE. A consumer that reads a null here
//                             as 0.0 has introduced a bug, not a datum.
//   perimeterSkill        -> the era-NEUTRAL judgement of outside shot-making,
//                             carried for every player regardless of era. This
//                             is what a future Era Style layer should read when
//                             asking "could this player shoot from distance?",
//                             never the raw 3P%.
//
// The same trap exists inside the three-point era at low volume. Mark Eaton's
// career 3P% is .000 and Ben Wallace's is .137 — both true, both meaningless,
// because the denominators are tiny. `threeVolume` is what makes a percentage
// safe to read: NONE/LOW means the percentage is noise, not ability.
//
// Splits are CAREER-scope while cards are decade-scope. A player's shooting
// genuinely moved across a long career (Jordan's three-point stroke in 1995-96
// is not his 1986-87 one), so scope is recorded on every record and
// decade-scoped splits remain the honest future refinement.

// ── SCOPE VOCABULARY ─────────────────────────────────────────────────────────
// A percentage is meaningless without knowing WHAT it covers. A career split
// silently used on a decade card is a real error: Michael Jordan's career
// three-point mark describes neither his 1980s nor his 1990s card accurately.
// Every record states its scope so a consumer can discount accordingly.
export const SHOOTING_SCOPE = [
  "DECADE_SCOPE",     // computed from the decade's seasons only — the ideal
  "CAREER_SCOPE",     // whole career; safe for a person, lossy for a decade card
  "SEASON_SCOPE",     // one season
  "INFERRED",         // no measurement; derived from position/era/volume priors
  "NOT_APPLICABLE",   // the statistic did not exist in this player's era
  "UNKNOWN",          // nothing on file
];

export const SHOOTING_IDENTITY = [
  "MOVEMENT_SHOOTER",        // gravity generated while moving off screens
  "SPOT_UP_SHOOTER",         // stationary; punishes help without creating
  "PULL_UP_SHOOTER",         // creates and makes his own jumper off the bounce
  "MIDRANGE_CREATOR",        // lives between the paint and the arc
  "RIM_SCORER",              // scores primarily at the basket
  "POST_SCORER",             // scores with his back to the basket
  "LOW_VOLUME_SPACER",       // must be respected, rarely shoots
  "NON_SHOOTER",             // defence does not have to leave the paint
  "HIGH_VOLUME_INEFFICIENT", // large diet, efficiency below the volume
  "HIGH_VOLUME_EFFICIENT",   // large diet AND efficiency
];

const W = "Wikipedia career statistics table (mirrors Basketball-Reference)";
const D = "2026-08-24";
// personId: [fgPct, threePct, ftPct, era, threeVolume, perimeterSkill, identity, precision]
const R = (fgPct, threePct, ftPct, era, threeVolume, perimeterSkill, identity, precision = "EXACT", note = null, scope = "CAREER_SCOPE") =>
  ({ fgPct, threePct, ftPct, scope, threePointEra: era, threeVolume, perimeterSkill, identity, precision,
     source: fgPct == null && threePct == null && ftPct == null ? null : W,
     sourceTier: fgPct == null && threePct == null && ftPct == null ? null : 3,
     verifiedOn: D, note });

export const SHOOTING = {
  // ═══ pre-three-point era — threePct is UNDEFINED, never zero ═══
  "bob-cousy":            R(0.375, null, 0.803, "NONE", "NOT_APPLICABLE", "AVERAGE", "MIDRANGE_CREATOR"),
  "jerry-west":           R(0.474, null, 0.814, "NONE", "NOT_APPLICABLE", "ELITE", "MIDRANGE_CREATOR", "EXACT",
                            "One of the great long-range shooters of his era; the league simply had no arc to reward it. A future Era Style layer must read perimeterSkill here, not the null 3P%."),
  "oscar-robertson":      R(0.485, null, 0.838, "NONE", "NOT_APPLICABLE", "GOOD", "MIDRANGE_CREATOR"),
  "elgin-baylor":         R(0.431, null, 0.780, "NONE", "NOT_APPLICABLE", "GOOD", "MIDRANGE_CREATOR", "EXACT",
                            "A .431 FG% reads as poor today but sat near the league average of his era. Efficiency must be judged relative to environment, which is the Era Style layer's job, not this file's."),
  "wilt-chamberlain":     R(null, null, null, "NONE", "NOT_APPLICABLE", "LIMITED", "RIM_SCORER", "NONE"),
  "bill-russell":         R(null, null, null, "NONE", "NOT_APPLICABLE", "NONE", "RIM_SCORER", "NONE"),
  "walt-bellamy":         R(0.516, null, 0.632, "NONE", "NOT_APPLICABLE", "LIMITED", "POST_SCORER"),

  // ═══ straddles the line's introduction ═══
  "kareem-abdul-jabbar":  R(0.559, null, null, "PARTIAL", "NONE", "LIMITED", "POST_SCORER", "EXACT",
                            "Career FG% quoted in the article text rather than read from the table; FT% not obtained."),
  "michael-cooper":       R(0.469, 0.340, 0.833, "PARTIAL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER"),

  // ═══ full three-point era ═══
  "stephen-curry":        R(null, null, 0.912, "FULL", "HIGH", "ELITE", "MOVEMENT_SHOOTER", "EXACT",
                            "FG%/3P% not obtained — the article truncates before its career table. FT% .912 is quoted in the text as the highest in NBA history. Identity is not in doubt."),
  "klay-thompson":        R(0.448, 0.409, 0.858, "FULL", "HIGH", "ELITE", "MOVEMENT_SHOOTER"),
  "reggie-miller":        R(0.471, 0.395, 0.888, "FULL", "HIGH", "ELITE", "MOVEMENT_SHOOTER"),
  "ray-allen":            R(0.452, 0.400, 0.894, "FULL", "HIGH", "ELITE", "MOVEMENT_SHOOTER"),
  "drazen-petrovic":      R(0.506, 0.437, 0.841, "FULL", "MODERATE", "ELITE", "MOVEMENT_SHOOTER"),
  "chris-mullin":         R(0.509, 0.384, 0.865, "FULL", "MODERATE", "ELITE", "MOVEMENT_SHOOTER"),
  "larry-bird":           R(0.496, 0.376, 0.886, "FULL", "MODERATE", "ELITE", "HIGH_VOLUME_EFFICIENT"),
  "kevin-durant":         R(null, null, null, "FULL", "MODERATE", "ELITE", "HIGH_VOLUME_EFFICIENT", "NONE",
                            "Career table not obtained. Text records a 55/40/90 season in 2022-23, the first in NBA history."),
  "dirk-nowitzki":        R(null, null, null, "FULL", "MODERATE", "ELITE", "PULL_UP_SHOOTER", "NONE",
                            "Article gives only prose approximations ('nearly 50%... nearly 40%... 88%'). Prose is not a table value, so the splits stay null rather than being written down as if measured."),
  "kawhi-leonard":        R(0.499, 0.391, 0.863, "FULL", "MODERATE", "ELITE", "PULL_UP_SHOOTER"),
  "james-harden":         R(null, null, null, "FULL", "HIGH", "ELITE", "PULL_UP_SHOOTER", "NONE"),
  "luka-doncic":          R(null, null, null, "FULL", "HIGH", "GOOD", "PULL_UP_SHOOTER", "NONE"),
  "kobe-bryant":          R(null, null, null, "FULL", "MODERATE", "GOOD", "PULL_UP_SHOOTER", "NONE"),
  "michael-jordan":       R(null, null, null, "FULL", "LOW", "AVERAGE", "MIDRANGE_CREATOR", "NONE",
                            "The definitive midrange creator of the era; three-point volume was low and streaky by modern standards."),
  "gary-payton":          R(0.466, 0.317, 0.729, "FULL", "MODERATE", "AVERAGE", "MIDRANGE_CREATOR"),
  "magic-johnson":        R(0.520, 0.276, 0.848, "FULL", "LOW", "AVERAGE", "MIDRANGE_CREATOR"),
  "scottie-pippen":       R(0.473, 0.326, 0.704, "FULL", "MODERATE", "AVERAGE", "MIDRANGE_CREATOR"),
  "sidney-moncrief":      R(0.502, 0.284, 0.831, "FULL", "LOW", "AVERAGE", "MIDRANGE_CREATOR"),
  "kevin-garnett":        R(0.497, 0.275, 0.789, "FULL", "LOW", "AVERAGE", "MIDRANGE_CREATOR"),
  "allen-iverson":        R(0.425, 0.313, 0.780, "FULL", "MODERATE", "AVERAGE", "HIGH_VOLUME_INEFFICIENT"),
  "russell-westbrook":    R(null, null, null, "FULL", "MODERATE", "LIMITED", "HIGH_VOLUME_INEFFICIENT", "NONE"),
  "lebron-james":         R(null, null, null, "FULL", "MODERATE", "GOOD", "RIM_SCORER", "NONE"),
  "nikola-jokic":         R(null, null, null, "FULL", "MODERATE", "GOOD", "POST_SCORER", "NONE"),
  "shaquille-o-neal":     R(0.582, null, null, "FULL", "NONE", "NONE", "POST_SCORER", "ROUNDED",
                            "FG% .582 quoted in article text, not read from a table."),
  "hakeem-olajuwon":      R(0.510, null, null, "FULL", "NONE", "LIMITED", "POST_SCORER", "ROUNDED",
                            "Article gives '51% shooting' in prose. Rounded, not exact."),
  "tim-duncan":           R(null, null, null, "FULL", "NONE", "LIMITED", "POST_SCORER", "NONE"),
  "bruce-bowen":          R(0.409, 0.393, 0.575, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT",
                            "The corner-three specialist's signature shape: 3P% (.393) far above FG% (.409), because nearly everything he took was a corner three."),
  "draymond-green":       R(0.447, 0.321, 0.710, "FULL", "MODERATE", "LIMITED", "SPOT_UP_SHOOTER"),
  "tayshaun-prince":      R(0.455, 0.367, 0.756, "FULL", "LOW", "AVERAGE", "LOW_VOLUME_SPACER"),
  "larry-nance":          R(0.546, 0.145, 0.755, "FULL", "NONE", "LIMITED", "RIM_SCORER", "EXACT",
                            "The .145 three-point mark is low-volume noise, not a skill measurement — threeVolume NONE is the field that says so."),
  "andrei-kirilenko":     R(0.474, 0.310, 0.754, "FULL", "LOW", "LIMITED", "RIM_SCORER"),
  "bam-adebayo":          R(0.522, 0.316, 0.759, "FULL", "LOW", "LIMITED", "RIM_SCORER"),
  "dennis-rodman":        R(0.521, 0.231, 0.584, "FULL", "LOW", "NONE", "NON_SHOOTER", "EXACT",
                            "A .521 FG% on putbacks and dunks. The .231 three-point mark is noise on trivial volume."),
  "ben-wallace":          R(0.474, 0.137, 0.414, "FULL", "NONE", "NONE", "NON_SHOOTER", "EXACT",
                            "Holds the worst career FT% in NBA history at 1,000+ attempts. The .137 three-point figure is noise."),
  "mark-eaton":           R(0.458, 0.000, 0.649, "FULL", "NONE", "NONE", "NON_SHOOTER", "EXACT",
                            "A literal .000 three-point percentage — the clearest possible case of a true number that means nothing. threeVolume NONE is what stops a consumer reading it as measured inability at range versus never having tried."),

  // ═══ Wave-1 verification pass (2026-08-25) — persons behind the 44 prime-form cards ═══
  "paul-arizin": R(.421, null, .810, "NONE", "NOT_APPLICABLE", "GOOD", "MIDRANGE_CREATOR", "EXACT", null),
  "guy-rodgers": R(.378, null, .721, "NONE", "NOT_APPLICABLE", "LIMITED", "MIDRANGE_CREATOR", "EXACT", "A .378 career mark from a pass-first guard; perimeter skill is judged limited even by the standards of his own era."),
  "zelmo-beaty": R(.494, null, .771, "NONE", "NOT_APPLICABLE", "LIMITED", "POST_SCORER", "EXACT", null),
  "richie-guerin": R(.416, null, .780, "NONE", "NOT_APPLICABLE", "AVERAGE", "MIDRANGE_CREATOR", "EXACT", null),
  "rick-barry": R(.449, null, .900, "PARTIAL", "NONE", "ELITE", "HIGH_VOLUME_EFFICIENT", "EXACT", "A .900 career free-throw mark, shot underhand. The three-point line arrived only in his final season, so the ELITE perimeter judgement rests on shot-making rather than on attempts."),
  "earl-monroe": R(.464, null, .807, "PARTIAL", "NONE", "GOOD", "PULL_UP_SHOOTER", "EXACT", null),
  "calvin-murphy": R(.482, null, .892, "PARTIAL", "NONE", "ELITE", "PULL_UP_SHOOTER", "EXACT", "The shortest player in the pool at 5 ft 9 in; .892 career free-throw shooting is the evidence behind the shooting judgement."),
  "paul-westphal": R(.504, null, .820, "PARTIAL", "NONE", "GOOD", "PULL_UP_SHOOTER", "EXACT", null),
  "marques-johnson": R(.518, null, .739, "PARTIAL", "NONE", "AVERAGE", "RIM_SCORER", "EXACT", null),
  "lou-hudson": R(.489, null, .797, "PARTIAL", "NONE", "GOOD", "MIDRANGE_CREATOR", "EXACT", null),
  "sidney-wicks": R(.459, null, .685, "PARTIAL", "NONE", "LIMITED", "RIM_SCORER", "EXACT", null),
  "maurice-lucas": R(null, null, null, "PARTIAL", "NONE", "LIMITED", "POST_SCORER", "NONE", "Categorical only: the source carries career totals but no shooting splits. The same gap blocks his card re-derivation."),
  "bernard-king": R(.518, null, .730, "FULL", "LOW", "AVERAGE", "HIGH_VOLUME_EFFICIENT", "EXACT", "A .518 career mark on very heavy volume, almost entirely inside the arc."),
  "andrew-toney": R(.500, null, .797, "FULL", "LOW", "GOOD", "PULL_UP_SHOOTER", "ROUNDED", "Career FG% given as 50% in prose rather than read from a table."),
  "micheal-ray-richardson": R(.457, null, .690, "FULL", "LOW", "LIMITED", "MIDRANGE_CREATOR", "EXACT", null),
  "rolando-blackman": R(.493, null, .840, "FULL", "LOW", "GOOD", "MIDRANGE_CREATOR", "EXACT", null),
  "mookie-blaylock": R(.409, .336, .736, "FULL", "HIGH", "GOOD", "SPOT_UP_SHOOTER", "EXACT", "A .409 field-goal mark alongside .336 from three: an early high-volume three-point guard whose overall efficiency paid for it."),
  "jeff-hornacek": R(.496, .403, .877, "FULL", "HIGH", "ELITE", "MOVEMENT_SHOOTER", "EXACT", null),
  "charles-oakley": R(.471, .253, .761, "FULL", "NONE", "NONE", "NON_SHOOTER", "EXACT", "The .253 three-point mark is noise on trivial volume."),
  "latrell-sprewell": R(.425, .337, .804, "FULL", "MODERATE", "AVERAGE", "HIGH_VOLUME_INEFFICIENT", "EXACT", null),
  "glenn-robinson": R(.459, .340, .820, "FULL", "MODERATE", "GOOD", "MIDRANGE_CREATOR", "EXACT", null),
  "toni-kukoc": R(.447, .335, .729, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT", null),
  "dan-majerle": R(.431, .358, .741, "FULL", "HIGH", "GOOD", "SPOT_UP_SHOOTER", "EXACT", null),
  "rasheed-wallace": R(.467, .336, .721, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT", "A big who shot threes at real volume well before it was standard for the position."),
  "jermaine-o-neal": R(.467, .147, .715, "FULL", "NONE", "NONE", "POST_SCORER", "EXACT", "The .147 three-point mark is noise."),
  "ron-artest": R(.414, .339, .715, "FULL", "MODERATE", "AVERAGE", "HIGH_VOLUME_INEFFICIENT", "EXACT", null),
  "marcus-camby": R(.466, .205, .670, "FULL", "NONE", "NONE", "NON_SHOOTER", "EXACT", null),
  "deron-williams": R(.445, .357, .822, "FULL", "MODERATE", "GOOD", "PULL_UP_SHOOTER", "EXACT", null),
  "sam-cassell": R(.454, .331, .861, "FULL", "MODERATE", "GOOD", "PULL_UP_SHOOTER", "EXACT", null),
  "kyle-lowry": R(.423, .367, .815, "FULL", "HIGH", "ELITE", "SPOT_UP_SHOOTER", "EXACT", null),
  "john-wall": R(.430, .322, .776, "FULL", "MODERATE", "LIMITED", "RIM_SCORER", "EXACT", null),
  "demar-derozan": R(.471, .302, .843, "FULL", "LOW", "LIMITED", "MIDRANGE_CREATOR", "EXACT", "One of the last high-volume midrange scorers; low three-point volume is a stylistic choice, not an inability."),
  "demarcus-cousins": R(.460, .331, .737, "FULL", "MODERATE", "GOOD", "POST_SCORER", "EXACT", null),
  "serge-ibaka": R(.513, .359, .757, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT", null),
  "andre-drummond": R(.539, .217, .489, "FULL", "NONE", "NONE", "NON_SHOOTER", "EXACT", "A .489 career free-throw mark on heavy volume; the .217 three-point figure is noise."),
  "jrue-holiday": R(.461, .371, .790, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT", null),
  "jaren-jackson-jr": R(.467, .351, .793, "FULL", "MODERATE", "GOOD", "SPOT_UP_SHOOTER", "EXACT", null),
  "zion-williamson": R(.591, .324, .695, "FULL", "NONE", "LIMITED", "RIM_SCORER", "EXACT", "A .591 career field-goal mark, almost entirely at the rim. The .324 three-point figure sits on negligible volume."),
  "marcus-smart": R(.389, .324, .779, "FULL", "MODERATE", "LIMITED", "SPOT_UP_SHOOTER", "EXACT", null),
  "pascal-siakam": R(.497, .342, .754, "FULL", "MODERATE", "GOOD", "RIM_SCORER", "EXACT", null),
};

/** Shooting record for a person, or an explicitly-unknown record. */
export const shootingFor = (personId) => {
  const rec = SHOOTING[personId];
  if (!rec) {
    return {
      fgPct: null, threePct: null, ftPct: null, scope: null,
      threePointEra: "UNKNOWN", threeVolume: "UNKNOWN", perimeterSkill: "UNKNOWN",
      identity: null, precision: "NONE", source: null, sourceTier: null,
      verifiedOn: null, note: null,
      confidence: "NONE (no shooting evidence on file — the derived model's position/era/volume inference is all that exists)",
    };
  }
  const measured = [rec.fgPct, rec.threePct, rec.ftPct].filter((v) => v != null).length;
  const confidence =
    measured >= 3 && rec.precision === "EXACT" ? "HIGH (three measured splits)"
    : measured >= 1 ? "MEDIUM (partial splits + evidence-backed identity)"
    : "LOW (categorical identity only, no measured splits)";
  return { ...rec, confidence };
};

/** Guard for consumers. True when threePct is safe to read as an ABILITY
 *  signal. False for pre-line players and for anyone whose volume is too low
 *  for the percentage to mean anything. */
export const threePctIsMeaningful = (rec) =>
  rec?.threePct != null && rec.threePointEra !== "NONE" &&
  (rec.threeVolume === "HIGH" || rec.threeVolume === "MODERATE");

export const SHOOTING_PERSON_IDS = Object.keys(SHOOTING);
