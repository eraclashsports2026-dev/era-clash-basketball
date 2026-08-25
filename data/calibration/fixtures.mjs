// ── Historical calibration corpus ───────────────────────────────────────────
// historicalFixtureDataVersion 1.0.0
//
// A fixture is a historically defensible FIVE-PLAYER UNIT, because that is what
// the engine simulates. It is not a whole roster and it does not pretend to be.
//
// ── SOURCING REALITY, STATED UP FRONT ──────────────────────────────────────
// Advanced team-season metrics (pace, ORtg, DRtg, eFG%, TS%, TOV%, ORB%, FTr,
// 3PAr) live almost exclusively on basketball-reference, which returns HTTP 403
// to automated fetches. Wikipedia season articles carry records and individual
// leaders but no team advanced tables, and the aggregator pages that surfaced
// in search carry player rows rather than team rows.
//
// So those targets are `null` here, with `targetAvailability` recording WHY.
// Nothing is estimated to fill the schema. What IS populated: the unit itself,
// the coach, the era anchor, the documented style identity, and the sourced
// record and points totals where obtainable. The league ENVIRONMENT baseline
// comes from the era data already sourced in Phase 5B.
//
// Consequence for Phase 6C2, recorded in the priority register: efficiency
// calibration against real team-seasons is DATA_BLOCKED until a licensed source
// is available. Style, distribution and environment calibration are not.
import { findCard } from "../../src/players.js";
import { getCoach, NEUTRAL_COACH } from "../../src/v3/coaches.js";
import { getEra } from "../../src/v3/eraStyles.js";

export const HISTORICAL_FIXTURE_DATA_VERSION = "1.0.0";

export const FIXTURE_TYPES = ["CHAMPIONSHIP", "ELITE_OFFENSE", "ELITE_DEFENSE", "BALANCED", "PACE_EXTREME", "STYLE_ARCHETYPE"];
export const LINEUP_BASIS = ["DOCUMENTED_STARTING_FIVE", "DOCUMENTED_CORE_UNIT", "RECONSTRUCTED_FROM_AVAILABLE_CARDS"];
export const CONFIDENCE = ["HIGH", "MEDIUM", "LOW"];

// Why every numeric team target is null. One shared record rather than
// repeating the explanation 24 times.
const BLOCKED = {
  pace: "SOURCE_BLOCKED", offensiveRating: "SOURCE_BLOCKED", defensiveRating: "SOURCE_BLOCKED",
  netRating: "SOURCE_BLOCKED", efgPct: "SOURCE_BLOCKED", trueShootingPct: "SOURCE_BLOCKED",
  turnoverPct: "SOURCE_BLOCKED", offensiveReboundPct: "SOURCE_BLOCKED",
  freeThrowRate: "SOURCE_BLOCKED", threePointAttemptRate: "SOURCE_BLOCKED",
  assistRate: "SOURCE_BLOCKED", fieldGoalAttempts: "SOURCE_BLOCKED",
  threePointAttempts: "SOURCE_BLOCKED", freeThrowAttempts: "SOURCE_BLOCKED",
  rebounds: "SOURCE_BLOCKED", assists: "SOURCE_BLOCKED", turnovers: "SOURCE_BLOCKED",
};
const nullTargets = (over = {}) => ({
  pace: null, offensiveRating: null, defensiveRating: null, netRating: null,
  efgPct: null, trueShootingPct: null, turnoverPct: null, offensiveReboundPct: null,
  freeThrowRate: null, threePointAttemptRate: null, assistRate: null,
  fieldGoalAttempts: null, threePointAttempts: null, freeThrowAttempts: null,
  points: null, rebounds: null, assists: null, turnovers: null,
  ...over,
});

const F = (o) => ({
  fixtureType: "STYLE_ARCHETYPE",
  lineupBasis: "RECONSTRUCTED_FROM_AVAILABLE_CARDS",
  sourceConfidence: "MEDIUM",
  historicalTargets: nullTargets(),
  targetAvailability: { ...BLOCKED },
  sources: [],
  historicalFixtureDataVersion: HISTORICAL_FIXTURE_DATA_VERSION,
  ...o,
});

const R = (cards) => cards.map(([playerCardId, assignedPosition, historicalRole, sourceConfidence = "MEDIUM"]) =>
  ({ playerCardId, assignedPosition, historicalRole, sourceConfidence }));

// ── The corpus ──────────────────────────────────────────────────────────────
// Deliberately NOT only champions. Successful identities and real weaknesses
// both have to be understood, so pace extremes, one-way teams and awkward
// constructions are represented alongside dynasties.
export const FIXTURES = [
  // ══ 1950s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "1950s-celtics-team-basketball", teamSeasonId: "BOS-1950s", teamName: "Boston Celtics",
    season: "1950s core", eraStyleId: "1950s", coachId: "red-auerbach",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    // Mikan is a centre-only card and Russell holds the five, so the four is
    // filled by a documented-era forward rather than forcing an illegal slot.
    roster: R([["cousy-50s", "PG", "PRIMARY_CREATOR", "HIGH"], ["sharman-50s", "SG", "SHOOTER", "HIGH"],
      ["arizin-60s", "SF", "SCORER", "LOW"], ["gus-60s", "PF", "GLASS", "LOW"], ["russell-50s", "C", "DEFENSIVE_ANCHOR", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Fast, pass-first team basketball built on outlet passing from a dominant rebounder",
      defensiveStyle: "Rim-anchored man defence around the era's defining shot-blocker",
      primaryActions: ["TRANSITION", "CUT", "GENERIC_HALF_COURT"],
      majorStrengths: ["transition volume", "interior defence", "rebounding"],
      majorWeaknesses: ["no perimeter shot exists in this era", "half-court spacing"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Bill_Russell", tier: 3, what: "DOCUMENTED_STYLE", note: "Outlet-driven transition identity; eleven championships in thirteen years." }],
  }),
  F({
    fixtureId: "1950s-pace-extreme", teamSeasonId: "LEAGUE-1950s-PACE", teamName: "1950s pace archetype",
    season: "1957-58 anchor", eraStyleId: "1950s", coachId: "john-kundla",
    fixtureType: "PACE_EXTREME", sourceConfidence: "LOW",
    roster: R([["cousy-50s", "PG", "PRIMARY_CREATOR"], ["sharman-50s", "SG", "SHOOTER"],
      ["arizin-60s", "SF", "SCORER"], ["tom-s-60s", "PF", "ROLE_BIG"], ["mikan-50s", "C", "POST_HUB"]]),
    qualitativeIdentity: {
      offensiveStyle: "Very high possession count with low shooting efficiency, per the era environment",
      defensiveStyle: "Man principles, minimal help latitude",
      primaryActions: ["TRANSITION", "POST_UP", "GENERIC_HALF_COURT"],
      majorStrengths: ["possession volume"], majorWeaknesses: ["shooting efficiency", "spacing"],
    },
    sources: [{ url: "in-repo:src/v3/eraStyles.js", tier: 2, what: "RECORDED_STATISTIC", note: "1957-58 league environment: pace 119.7, FG% .383." }],
  }),

  // ══ 1960s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "1960s-celtics-dynasty", teamSeasonId: "BOS-1960s", teamName: "Boston Celtics",
    season: "1960s dynasty", eraStyleId: "1960s", coachId: "red-auerbach",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "MEDIUM",
    roster: R([["cousy-60s", "PG", "PRIMARY_CREATOR", "HIGH"], ["sam-60s", "SG", "SHOOTER", "HIGH"],
      ["john-h-60s", "SF", "MOVEMENT_SCORER", "HIGH"], ["tom-s-60s", "PF", "ROLE_BIG", "MEDIUM"], ["bill-60s", "C", "DEFENSIVE_ANCHOR", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Transition off defensive rebounds, constant off-ball movement",
      defensiveStyle: "The template rim-protection defence of the era",
      primaryActions: ["TRANSITION", "CUT", "OFF_BALL_SCREEN"],
      majorStrengths: ["defence", "transition", "depth"], majorWeaknesses: ["half-court shot creation", "no three-point shot"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Boston_Celtics", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "1960s-interior-dominance", teamSeasonId: "SF-1960s", teamName: "San Francisco Warriors",
    season: "1960s", eraStyleId: "1960s", coachId: "bill-sharman",
    fixtureType: "ELITE_OFFENSE", sourceConfidence: "LOW",
    roster: R([["rodgers-60s", "PG", "PRIMARY_CREATOR"], ["barry-60s", "SG", "SCORER"],
      ["arizin-60s", "SF", "SCORER"], ["fred-h-60s", "PF", "GLASS"], ["nate-60s", "C", "DEFENSIVE_ANCHOR", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Interior-first scoring with wing creation",
      defensiveStyle: "Elite one-on-one centre defence",
      primaryActions: ["POST_UP", "ISOLATION", "TRANSITION"],
      majorStrengths: ["interior scoring", "centre defence"], majorWeaknesses: ["spacing", "guard defence"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Nate_Thurmond", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "1960s-royals-creation", teamSeasonId: "CIN-1960s", teamName: "Cincinnati Royals",
    season: "1960s", eraStyleId: "1960s", coachId: "lenny-wilkens",
    fixtureType: "ELITE_OFFENSE", sourceConfidence: "MEDIUM",
    roster: R([["oscar-60s", "PG", "PRIMARY_CREATOR", "HIGH"], ["jerry-60s", "SG", "SCORER", "MEDIUM"],
      ["elgin-60s", "SF", "SCORER", "MEDIUM"], ["jerry-l-60s", "PF", "GLASS"], ["wayne-60s", "C", "ROLE_BIG"]]),
    qualitativeIdentity: {
      offensiveStyle: "Ball-dominant lead-guard creation, very high assist volume",
      defensiveStyle: "Average; the era's defensive honours went elsewhere",
      primaryActions: ["ISOLATION", "PICK_AND_ROLL", "POST_UP"],
      majorStrengths: ["creation", "assist volume", "scoring"], majorWeaknesses: ["defence", "rim protection"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Oscar_Robertson", tier: 3, what: "DOCUMENTED_STYLE", note: "Nine consecutive All-NBA First Teams; no All-Defensive selections." }],
  }),

  // ══ 1970s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "1970s-bucks-balanced", teamSeasonId: "MIL-1970s", teamName: "Milwaukee Bucks",
    season: "1970-71 core", eraStyleId: "1970s", coachId: "lenny-wilkens",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["oscar-70s", "PG", "SECONDARY_CREATOR", "HIGH"], ["hudson-70s", "SG", "SHOOTER"],
      ["marques-70s", "SF", "ROLE_WING"], ["curtis-perry-70s", "PF", "GLASS", "LOW"], ["kareem-70s", "C", "POST_HUB", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Post-centred offence with an elite passing guard alongside",
      defensiveStyle: "Rim-anchored",
      primaryActions: ["POST_UP", "PICK_AND_ROLL", "SPOT_UP"],
      majorStrengths: ["post scoring", "efficiency", "rim protection"], majorWeaknesses: ["perimeter shooting volume"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Oscar_Robertson", tier: 3, what: "RECORDED_STATISTIC", note: "Robertson played 1970-71 through 1973-74 in Milwaukee." }],
  }),
  F({
    fixtureId: "1970s-celtics-motion", teamSeasonId: "BOS-1970s", teamName: "Boston Celtics",
    season: "1970s", eraStyleId: "1970s", coachId: "tom-heinsohn",
    fixtureType: "BALANCED", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "MEDIUM",
    roster: R([["jojo-70s", "PG", "PRIMARY_CREATOR", "HIGH"], ["charlie-70s", "SG", "SCORER"],
      ["john-h-70s", "SF", "MOVEMENT_SCORER", "HIGH"], ["paul-s-70s", "PF", "GLASS", "HIGH"], ["dave-c-70s", "C", "MOBILE_BIG", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Constant off-ball motion with a mobile centre initiating",
      defensiveStyle: "Aggressive help and rebounding",
      primaryActions: ["OFF_BALL_SCREEN", "CUT", "TRANSITION"],
      majorStrengths: ["off-ball movement", "rebounding", "depth"], majorWeaknesses: ["interior size", "isolation scoring"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/John_Havlicek", tier: 3, what: "DOCUMENTED_STYLE", note: "Off-ball movement identity." }],
  }),
  F({
    fixtureId: "1970s-spurs-pace", teamSeasonId: "SAS-1970s", teamName: "San Antonio Spurs",
    season: "1970s", eraStyleId: "1970s", coachId: "doug-moe",
    fixtureType: "PACE_EXTREME", sourceConfidence: "LOW",
    roster: R([["james-70s", "PG", "SECONDARY_CREATOR"], ["george-70s", "SG", "PRIMARY_SCORER", "HIGH"],
      ["kenon-70s", "SF", "SCORER"], ["swen-70s", "PF", "GLASS"], ["billy-p-70s", "C", "ROLE_BIG"]]),
    qualitativeIdentity: {
      offensiveStyle: "High-pace, high-volume wing scoring",
      defensiveStyle: "Permissive; offence-first identity",
      primaryActions: ["ISOLATION", "TRANSITION", "SPOT_UP"],
      majorStrengths: ["scoring volume", "pace"], majorWeaknesses: ["defence", "turnovers"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/George_Gervin", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),

  // ══ 1980s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "1980s-lakers-showtime", teamSeasonId: "LAL-1987", teamName: "Los Angeles Lakers",
    season: "1986-87", eraStyleId: "1980s", coachId: "pat-riley",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    // The documented starting four was A.C. Green, who has no card. Cooper —
    // the actual sixth man and that season's Defensive Player of the Year —
    // takes the wing and Worthy slides to the four. Recorded as a
    // reconstruction rather than presented as the literal starting five.
    roster: R([["magic-80s", "PG", "PRIMARY_CREATOR", "HIGH"], ["byron-80s", "SG", "SHOOTER", "HIGH"],
      ["cooper-80s", "SF", "WING_STOPPER", "MEDIUM"], ["worthy-80s", "PF", "SLASHER", "HIGH"], ["kareem-80s", "C", "POST_HUB", "HIGH"]]),
    // The only fixture with sourced numeric targets: season points for/against
    // are documented, so PPG is real rather than estimated.
    historicalTargets: nullTargets({ points: 117.8 }),
    targetAvailability: { ...BLOCKED, points: "RECORDED_STATISTIC" },
    qualitativeIdentity: {
      offensiveStyle: "Fastest elite offence of its era; transition initiated by the point guard",
      defensiveStyle: "Perimeter pressure with a DPOY wing stopper",
      primaryActions: ["TRANSITION", "PICK_AND_ROLL", "POST_UP"],
      majorStrengths: ["pace", "creation", "post efficiency", "wing defence"],
      majorWeaknesses: ["three-point volume", "size at the four"],
    },
    sources: [
      { url: "https://en.wikipedia.org/wiki/1986%E2%80%9387_Los_Angeles_Lakers_season", tier: 3, what: "RECORDED_STATISTIC", note: "65-17; starting five Johnson/Scott/Worthy/Green/Abdul-Jabbar; Cooper won DPOY. 9,656 points scored, 8,893 conceded over 82 games = 117.8 / 108.5 per game." },
    ],
  }),
  F({
    fixtureId: "1980s-celtics-halfcourt", teamSeasonId: "BOS-1986", teamName: "Boston Celtics",
    season: "1985-86", eraStyleId: "1980s", coachId: "kc-jones",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    roster: R([["tiny-80s", "PG", "ROLE_GUARD", "MEDIUM"], ["danny-80s", "SG", "SHOOTER", "HIGH"],
      ["bird-80s", "SF", "PRIMARY_CREATOR", "HIGH"], ["mcHale-80s", "PF", "POST_HUB", "HIGH"], ["parish-80s", "C", "MOBILE_BIG", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Half-court passing and post play with elite frontcourt skill",
      defensiveStyle: "Positional, low-turnover, rebound-focused",
      primaryActions: ["POST_UP", "SPOT_UP", "HANDOFF"],
      majorStrengths: ["frontcourt skill", "passing", "half-court efficiency"],
      majorWeaknesses: ["pace", "point-of-attack defence"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/1985%E2%80%9386_Boston_Celtics_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "1980s-sixers-transition", teamSeasonId: "PHI-1980s", teamName: "Philadelphia 76ers",
    season: "1982-83 core", eraStyleId: "1980s", coachId: "billy-cunningham",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["mo-80s", "PG", "PRIMARY_CREATOR", "HIGH"], ["toney-80s", "SG", "SCORER", "HIGH"],
      ["julius-80s", "SF", "SLASHER", "HIGH"], ["charles-80s", "PF", "GLASS", "MEDIUM"], ["jack-80s", "C", "ROLE_BIG", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Slashing wing attack with transition finishing",
      defensiveStyle: "Athletic help defence",
      primaryActions: ["TRANSITION", "ISOLATION", "CUT"],
      majorStrengths: ["rim pressure", "transition", "offensive rebounding"],
      majorWeaknesses: ["outside shooting", "half-court spacing"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/1982%E2%80%9383_Philadelphia_76ers_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "1980s-bucks-defense", teamSeasonId: "MIL-1980s", teamName: "Milwaukee Bucks",
    season: "1980s", eraStyleId: "1980s", coachId: "don-nelson",
    fixtureType: "ELITE_DEFENSE", sourceConfidence: "LOW",
    roster: R([["moncrief-80s", "PG", "POINT_OF_ATTACK_STOPPER", "HIGH"], ["ricky-80s", "SG", "SHOOTER"],
      ["mark-80s", "SF", "SCORER"], ["terry-80s", "PF", "ROLE_BIG"], ["tree-80s", "C", "RIM_PROTECTOR"]]),
    qualitativeIdentity: {
      offensiveStyle: "Balanced, structured, low-usage-concentration",
      defensiveStyle: "Elite point-of-attack pressure",
      primaryActions: ["PICK_AND_ROLL", "SPOT_UP", "OFF_BALL_SCREEN"],
      majorStrengths: ["guard defence", "discipline"], majorWeaknesses: ["star creation", "interior scoring"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Sidney_Moncrief", tier: 3, what: "DOCUMENTED_STYLE", note: "Two-time Defensive Player of the Year." }],
  }),

  // ══ 1990s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "1990s-bulls-triangle", teamSeasonId: "CHI-1996", teamName: "Chicago Bulls",
    season: "1995-96", eraStyleId: "1990s", coachId: "phil-jackson",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    roster: R([["isiah-90s", "PG", "ROLE_GUARD", "LOW"], ["jordan-90s", "SG", "PRIMARY_CREATOR", "HIGH"],
      ["pippen-90s", "SF", "SECONDARY_CREATOR", "HIGH"], ["kukoc-90s", "PF", "SHOOTER", "MEDIUM"], ["luc-90s", "C", "ROLE_BIG", "MEDIUM"]]),
    qualitativeIdentity: {
      offensiveStyle: "Triangle: post and wing creation, read-and-react, low pick-and-roll volume",
      defensiveStyle: "Elite wing defence with aggressive pressure",
      primaryActions: ["POST_UP", "ISOLATION", "OFF_BALL_SCREEN"],
      majorStrengths: ["wing creation", "wing defence", "low turnovers"],
      majorWeaknesses: ["traditional point-guard creation", "interior scoring volume"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/1995%E2%80%9396_Chicago_Bulls_season", tier: 3, what: "RECORDED_STATISTIC", note: "72-10. Triangle offence; the point-guard slot is reconstructed because the actual starter has no card." }],
  }),
  F({
    fixtureId: "1990s-jazz-pnr", teamSeasonId: "UTA-1990s", teamName: "Utah Jazz",
    season: "1996-97 core", eraStyleId: "1990s", coachId: "jerry-sloan",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "HIGH",
    roster: R([["stock-90s", "PG", "PRIMARY_CREATOR", "HIGH"], ["hornacek-90s", "SG", "SHOOTER", "HIGH"],
      ["pippen-90s", "SF", "WING_STOPPER", "LOW"], ["malone-90s", "PF", "POST_HUB", "HIGH"], ["rob-90s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "The defining pick-and-roll offence of its era, with strict role discipline",
      defensiveStyle: "Structured, physical, low-gamble",
      primaryActions: ["PICK_AND_ROLL", "POST_UP", "SPOT_UP"],
      majorStrengths: ["pick-and-roll efficiency", "low turnovers", "free-throw rate"],
      majorWeaknesses: ["three-point volume", "transition"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/John_Stockton", tier: 3, what: "DOCUMENTED_STYLE", note: "Stockton-Malone pick-and-roll." }],
  }),
  F({
    fixtureId: "1990s-pistons-physical", teamSeasonId: "DET-1990s", teamName: "Detroit Pistons",
    season: "1989-90 core", eraStyleId: "1990s", coachId: "chuck-daly",
    fixtureType: "ELITE_DEFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["isiah-90s", "PG", "PRIMARY_CREATOR", "HIGH"], ["dumars-90s", "SG", "TWO_WAY_GUARD", "HIGH"],
      ["grant-90s", "SF", "WING_STOPPER", "HIGH"], ["charles-80s", "PF", "GLASS", "LOW"], ["ewing-90s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Guard-driven half-court scoring, moderate pace",
      defensiveStyle: "Maximum physicality within the era's contact rules",
      primaryActions: ["ISOLATION", "PICK_AND_ROLL", "POST_UP"],
      majorStrengths: ["perimeter defence", "physicality", "guard creation"],
      majorWeaknesses: ["shooting efficiency", "spacing"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Detroit_Pistons", tier: 3, what: "DOCUMENTED_STYLE", note: "Bad Boys defensive identity." }],
  }),
  F({
    fixtureId: "1990s-suns-pace", teamSeasonId: "PHX-1990s", teamName: "Phoenix Suns",
    season: "1992-93", eraStyleId: "1990s", coachId: "pat-riley",
    fixtureType: "PACE_EXTREME", sourceConfidence: "MEDIUM",
    roster: R([["kj-90s", "PG", "PRIMARY_CREATOR", "HIGH"], ["majerle-90s", "SG", "SHOOTER", "HIGH"],
      ["marion-90s", "SF", "SLASHER", "LOW"], ["barkley-90s", "PF", "PRIMARY_CREATOR", "HIGH"], ["rob-90s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "High pace with a ball-dominant power forward",
      defensiveStyle: "Average; offence-led team",
      primaryActions: ["TRANSITION", "POST_UP", "PICK_AND_ROLL"],
      majorStrengths: ["pace", "power-forward creation", "free-throw rate"],
      majorWeaknesses: ["interior defence", "half-court defence"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/1992%E2%80%9393_Phoenix_Suns_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),

  // ══ 2000s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "2000s-lakers-interior", teamSeasonId: "LAL-2001", teamName: "Los Angeles Lakers",
    season: "2000-01 core", eraStyleId: "2000s", coachId: "phil-jackson",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "HIGH",
    roster: R([["billups-00s", "PG", "ROLE_GUARD", "LOW"], ["kobe-00s", "SG", "PRIMARY_CREATOR", "HIGH"],
      ["prince-00s", "SF", "WING_STOPPER", "LOW"], ["duncan-00s", "PF", "POST_HUB", "LOW"], ["shaq-00s", "C", "DOMINANT_POST", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Dominant interior scoring with elite wing isolation alongside",
      defensiveStyle: "Rim-anchored, physical",
      primaryActions: ["POST_UP", "ISOLATION", "SPOT_UP"],
      majorStrengths: ["interior scoring", "free-throw volume", "rim protection"],
      majorWeaknesses: ["three-point volume", "free-throw accuracy"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2000%E2%80%9301_Los_Angeles_Lakers_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "2000s-pistons-defense", teamSeasonId: "DET-2004", teamName: "Detroit Pistons",
    season: "2003-04", eraStyleId: "2000s", coachId: "larry-brown",
    fixtureType: "ELITE_DEFENSE", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    roster: R([["billups-00s", "PG", "PRIMARY_CREATOR", "HIGH"], ["rip-00s", "SG", "MOVEMENT_SHOOTER", "HIGH"],
      ["prince-00s", "SF", "WING_STOPPER", "HIGH"], ["kg-00s", "PF", "DEFENSIVE_ANCHOR", "LOW"], ["ben-00s", "C", "RIM_PROTECTOR", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Deliberate half-court offence built on off-ball movement and mid-range shooting",
      defensiveStyle: "The defining defence-first champion of its era",
      primaryActions: ["OFF_BALL_SCREEN", "PICK_AND_ROLL", "SPOT_UP"],
      majorStrengths: ["team defence", "rim protection", "off-ball movement"],
      majorWeaknesses: ["pace", "scoring volume", "star creation"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2003%E2%80%9304_Detroit_Pistons_season", tier: 3, what: "RECORDED_STATISTIC", note: "NBA champions; league-best defence. Hamilton's off-ball movement identity is documented." }],
  }),
  F({
    fixtureId: "2000s-spurs-balanced", teamSeasonId: "SAS-2005", teamName: "San Antonio Spurs",
    season: "2004-05", eraStyleId: "2000s", coachId: "gregg-popovich",
    fixtureType: "BALANCED", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    roster: R([["parker-00s", "PG", "PRIMARY_CREATOR", "HIGH"], ["manu-00s", "SG", "SECONDARY_CREATOR", "HIGH"],
      ["bowen-2ks", "SF", "WING_STOPPER", "HIGH"], ["duncan-00s", "PF", "POST_HUB", "HIGH"], ["okur-00s", "C", "STRETCH_BIG", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Balanced, low-turnover, post-and-drive offence",
      defensiveStyle: "Elite anchored defence with a dedicated wing stopper",
      primaryActions: ["POST_UP", "PICK_AND_ROLL", "SPOT_UP"],
      majorStrengths: ["two-way balance", "efficiency", "low turnovers"],
      majorWeaknesses: ["pace", "three-point volume"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2004%E2%80%9305_San_Antonio_Spurs_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),

  // ══ 2010s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "2010s-warriors-movement", teamSeasonId: "GSW-2016", teamName: "Golden State Warriors",
    season: "2015-16", eraStyleId: "2010s", coachId: "steve-kerr",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_STARTING_FIVE", sourceConfidence: "HIGH",
    roster: R([["curry-10s", "PG", "PRIMARY_CREATOR", "HIGH"], ["klay-10s", "SG", "MOVEMENT_SHOOTER", "HIGH"],
      ["lebron-10s", "SF", "SECONDARY_CREATOR", "LOW"], ["draymond-10s", "PF", "PLAYMAKING_DEFENDER", "HIGH"], ["jokic-20s", "C", "PASSING_HUB", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Movement shooting, off-ball screens and handoffs at high volume",
      defensiveStyle: "Switch-heavy with a versatile defensive four",
      primaryActions: ["OFF_BALL_SCREEN", "HANDOFF", "SPOT_UP"],
      majorStrengths: ["three-point volume and accuracy", "off-ball movement", "switchability"],
      majorWeaknesses: ["interior size", "offensive rebounding"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2015%E2%80%9316_Golden_State_Warriors_season", tier: 3, what: "RECORDED_STATISTIC", note: "73-9. Movement-shooting identity; the three and five slots are reconstructed." }],
  }),
  F({
    fixtureId: "2010s-clippers-pnr", teamSeasonId: "LAC-2010s", teamName: "Los Angeles Clippers",
    season: "2013-14 core", eraStyleId: "2010s", coachId: "doc-rivers",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["cp3-10s", "PG", "PRIMARY_CREATOR", "HIGH"], ["klay-10s", "SG", "SHOOTER", "LOW"],
      ["prince-00s", "SF", "ROLE_WING", "LOW"], ["blake-10s", "PF", "ROLL_THREAT", "HIGH"], ["dj-10s", "C", "RIM_RUNNER", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Elite pick-and-roll with a lob-threat centre",
      defensiveStyle: "Rim-protection dependent",
      primaryActions: ["PICK_AND_ROLL", "TRANSITION", "SPOT_UP"],
      majorStrengths: ["pick-and-roll", "rim finishing", "low turnovers"],
      majorWeaknesses: ["wing defence", "free-throw accuracy"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Chris_Paul", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "2010s-heat-switch", teamSeasonId: "MIA-2010s", teamName: "Miami Heat",
    season: "2012-13 core", eraStyleId: "2010s", coachId: "erik-spoelstra",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["cp3-10s", "PG", "ROLE_GUARD", "LOW"], ["wade-10s", "SG", "SECONDARY_CREATOR", "HIGH"],
      ["lebron-10s", "SF", "PRIMARY_CREATOR", "HIGH"], ["bosh-10s", "PF", "STRETCH_BIG", "HIGH"], ["hassan-10s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Wing-dominant creation with a stretch four and heavy transition",
      defensiveStyle: "Aggressive switching and trapping",
      primaryActions: ["ISOLATION", "TRANSITION", "SPOT_UP"],
      majorStrengths: ["wing creation", "transition", "switchability"],
      majorWeaknesses: ["traditional centre size", "offensive rebounding"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2012%E2%80%9313_Miami_Heat_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),

  // ══ 2020s ══════════════════════════════════════════════════════════════════
  F({
    fixtureId: "2020s-bucks-giannis", teamSeasonId: "MIL-2021", teamName: "Milwaukee Bucks",
    season: "2020-21 core", eraStyleId: "2020s", coachId: "erik-spoelstra",
    fixtureType: "CHAMPIONSHIP", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["dame-20s", "PG", "PRIMARY_CREATOR", "HIGH"], ["jbrown-20s", "SG", "SCORER", "LOW"],
      ["middleton-20s", "SF", "SECONDARY_CREATOR", "HIGH"], ["giannis-20s", "PF", "RIM_ATTACKER", "HIGH"], ["jallen-20s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Rim pressure from a dominant forward with perimeter spacing around him",
      defensiveStyle: "Drop coverage with elite interior deterrence",
      primaryActions: ["ISOLATION", "TRANSITION", "SPOT_UP"],
      majorStrengths: ["rim pressure", "free-throw volume", "interior defence"],
      majorWeaknesses: ["free-throw accuracy", "half-court spacing when packed"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2020%E2%80%9321_Milwaukee_Bucks_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "2020s-nuggets-hub", teamSeasonId: "DEN-2023", teamName: "Denver Nuggets",
    season: "2022-23 core", eraStyleId: "2020s", coachId: "nick-nurse",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["garland-20s", "PG", "SECONDARY_CREATOR", "LOW"], ["reaves-20s", "SG", "SHOOTER", "LOW"],
      ["middleton-20s", "SF", "SHOOTER", "LOW"], ["ad-20s", "PF", "INTERIOR_SCORER", "LOW"], ["jokic-20s", "C", "PASSING_HUB", "HIGH"]]),
    qualitativeIdentity: {
      offensiveStyle: "Passing-hub centre operating above the break, handoffs and high-post reads",
      defensiveStyle: "Positional rather than athletic; conceding some rim pressure",
      primaryActions: ["HANDOFF", "POST_UP", "SPOT_UP"],
      majorStrengths: ["assist rate", "half-court efficiency", "post scoring"],
      majorWeaknesses: ["point-of-attack defence", "transition defence"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Nikola_Joki%C4%87", tier: 3, what: "DOCUMENTED_STYLE", note: "Handoff and high-post hub identity — the case the paint-availability model was built for." }],
  }),
  F({
    fixtureId: "2020s-celtics-volume-threes", teamSeasonId: "BOS-2020s", teamName: "Boston Celtics",
    season: "2023-24 core", eraStyleId: "2020s", coachId: "steve-kerr",
    fixtureType: "ELITE_OFFENSE", lineupBasis: "DOCUMENTED_CORE_UNIT", sourceConfidence: "MEDIUM",
    roster: R([["smart-20s", "PG", "POINT_OF_ATTACK_STOPPER", "HIGH"], ["jbrown-20s", "SG", "SCORER", "HIGH"],
      ["tatum-20s", "SF", "PRIMARY_CREATOR", "HIGH"], ["lauri-20s", "PF", "STRETCH_BIG", "LOW"], ["walker-k-20s", "C", "RIM_PROTECTOR", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Very high three-point volume with wing isolation",
      defensiveStyle: "Switch-heavy with elite point-of-attack defence",
      primaryActions: ["SPOT_UP", "ISOLATION", "PICK_AND_ROLL"],
      majorStrengths: ["three-point volume", "switchability", "guard defence"],
      majorWeaknesses: ["interior scoring", "offensive rebounding"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/2023%E2%80%9324_Boston_Celtics_season", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
  F({
    fixtureId: "2020s-grizzlies-pace", teamSeasonId: "MEM-2020s", teamName: "Memphis Grizzlies",
    season: "2021-22 core", eraStyleId: "2020s", coachId: "mike-dantoni",
    fixtureType: "PACE_EXTREME", sourceConfidence: "LOW",
    roster: R([["ja-20s", "PG", "RIM_ATTACKER", "HIGH"], ["dmitch-20s", "SG", "SCORER", "LOW"],
      ["coward-20s", "SF", "ROLE_WING", "LOW"], ["jjj-20s", "PF", "RIM_PROTECTOR", "HIGH"], ["embiid-20s", "C", "DOMINANT_POST", "LOW"]]),
    qualitativeIdentity: {
      offensiveStyle: "Maximum pace with a downhill lead guard",
      defensiveStyle: "Elite shot-blocking behind aggressive perimeter play",
      primaryActions: ["TRANSITION", "PICK_AND_ROLL", "ISOLATION"],
      majorStrengths: ["pace", "rim pressure", "block rate"],
      majorWeaknesses: ["turnovers", "half-court shooting"],
    },
    sources: [{ url: "https://en.wikipedia.org/wiki/Ja_Morant", tier: 3, what: "DOCUMENTED_STYLE" }],
  }),
];

// ── Validation ──────────────────────────────────────────────────────────────
/** Every referenced id must resolve. A fixture that cannot be fielded is not a fixture. */
export const validateFixture = (f) => {
  const errors = [];
  if (!f.fixtureId) errors.push("missing fixtureId");
  if (!getEra(f.eraStyleId)) errors.push(`unknown eraStyleId "${f.eraStyleId}"`);
  const coach = f.coachId === "neutral" ? NEUTRAL_COACH : getCoach(f.coachId);
  if (!coach) errors.push(`unknown coachId "${f.coachId}"`);
  if (!Array.isArray(f.roster) || f.roster.length !== 5) errors.push("roster must be exactly 5 players");
  else {
    const SLOTS = ["PG", "SG", "SF", "PF", "C"];
    f.roster.forEach((r, i) => {
      const card = findCard(r.playerCardId);
      if (!card) { errors.push(`unknown card "${r.playerCardId}"`); return; }
      if (r.assignedPosition !== SLOTS[i]) errors.push(`${r.playerCardId} at slot ${i} declares ${r.assignedPosition}, expected ${SLOTS[i]}`);
      if (!card.positions.includes(r.assignedPosition)) errors.push(`${card.name} cannot play ${r.assignedPosition}`);
      if (!CONFIDENCE.includes(r.sourceConfidence)) errors.push(`${r.playerCardId} bad confidence`);
    });
    const names = f.roster.map((r) => findCard(r.playerCardId)?.name).filter(Boolean);
    if (new Set(names).size !== names.length) errors.push("duplicate person in one unit");
  }
  if (!FIXTURE_TYPES.includes(f.fixtureType)) errors.push(`bad fixtureType "${f.fixtureType}"`);
  if (!LINEUP_BASIS.includes(f.lineupBasis)) errors.push(`bad lineupBasis "${f.lineupBasis}"`);
  if (!CONFIDENCE.includes(f.sourceConfidence)) errors.push("bad sourceConfidence");
  if (!f.sources?.length) errors.push("no sources");
  if (!f.qualitativeIdentity?.primaryActions?.length) errors.push("no qualitative identity");
  // A populated target must have an availability grade, and a null one must not
  // claim to be recorded.
  for (const [k, v] of Object.entries(f.historicalTargets ?? {})) {
    const avail = f.targetAvailability?.[k];
    if (v != null && (!avail || avail === "SOURCE_BLOCKED")) errors.push(`${k} has a value but is marked ${avail ?? "ungraded"}`);
    if (v == null && avail && avail !== "SOURCE_BLOCKED") errors.push(`${k} is null but marked ${avail}`);
  }
  return errors;
};

export const validateCorpus = (fixtures = FIXTURES) => {
  const errors = [];
  const seen = new Set();
  for (const f of fixtures) {
    for (const e of validateFixture(f)) errors.push(`${f.fixtureId}: ${e}`);
    if (seen.has(f.fixtureId)) errors.push(`duplicate fixtureId ${f.fixtureId}`);
    seen.add(f.fixtureId);
  }
  return errors;
};

export const fixtureById = (id) => FIXTURES.find((f) => f.fixtureId === id) ?? null;
export const fixturesByEra = (eraStyleId) => FIXTURES.filter((f) => f.eraStyleId === eraStyleId);
export const ERAS_COVERED = [...new Set(FIXTURES.map((f) => f.eraStyleId))].sort();
