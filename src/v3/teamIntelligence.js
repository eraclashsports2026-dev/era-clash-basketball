// ── Team Intelligence (V3) ────────────────────────────────────────────────────
// Player Intelligence answers "what kind of basketball player is this?".
// This layer answers the only question that comes next:
//
//        DO THESE FIVE PLAYERS FORM A COHERENT BASKETBALL TEAM?
//
// It does NOT decide who wins. It does not know there is an opponent. It reads
// five profiles together and reports what the lineup can and cannot do — who
// needs the ball, who creates, who keeps value without touches, whether the
// floor is spaced, whether guards, wings and the rim can be defended, whether
// possessions get finished, and where roles duplicate or go missing.
//
// ── FOUR INDEPENDENCES, ALL ENFORCED BY TEST ─────────────────────────────────
// COACH-INDEPENDENT   — no coach import, no concentration parameter. This is
//                       the BASE construction of a lineup, before anyone
//                       decides how to deploy it. Coach Intelligence (Phase 4)
//                       applies on top; folding it in here would destroy the
//                       product's central distinction between how a team is
//                       BUILT and how it is COACHED.
// ERA-INDEPENDENT     — no era import, no era branch. A lineup's construction
//                       is what it is; the Era Style engine prices it.
// OPPONENT-INDEPENDENT— describes tools and gaps, never assignments. Which
//                       strengths actually collide is the Matchup Engine's job.
// SEED-INDEPENDENT    — no RNG anywhere. Deliberately does NOT import seed.js,
//                       which would pull mulberry32 into a description layer.
//                       Same inputs → identical output, always.
//
// ── NO SINGLE TEAM SCORE, ON PURPOSE ─────────────────────────────────────────
// There is no teamIntelligenceScore. Player OVR already demonstrates the
// failure mode: one number the UI treats as truth and the engine ignores. A
// team is not one number — a lineup can be elite at creation and unable to
// guard a point guard, and collapsing that into 94 destroys exactly the
// information the simulation needs. Downstream layers must consume dimensions.
//
// ── HIDDEN ───────────────────────────────────────────────────────────────────
// Nothing here is exposed to users in this phase. No Team Identity Score, no
// Spacing Score, no Team IQ. The internal identity tags are descriptive
// vocabulary for later layers, never a power rating.
import { buildIntelligence } from "./intelligence.js";
import { PLAYERS, findCard } from "../players.js";
import { personIdForCard } from "./data/persons.js";

export const TEAM_INTELLIGENCE_VERSION = "1.0.0";
export const SLOTS = ["PG", "SG", "SF", "PF", "C"];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp10 = (v) => clamp(v, 0, 10);
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const topN = (xs, n) => [...xs].sort((a, b) => b - a).slice(0, n);

// Local FNV-1a. Deliberately NOT seed.js's hashString: importing that module
// would drag mulberry32 into a layer that must contain no RNG at all.
const fnv1a = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
};

// ── Finite usage ──────────────────────────────────────────────────────────────
// Basketball has one ball. Shares MUST sum to 1, so five 30%-usage stars cannot
// all keep their diets. There is NO superstar-stack penalty constant anywhere
// in this file — the cost emerges from three facts and nothing else:
//   (a) the budget is finite,
//   (b) each player has a natural diet they are built for,
//   (c) roleScalability decides who keeps value once compressed.
// A lineup of five ball-dominant creators is not "penalised". It simply cannot
// feed five diets from one ball, and the players whose value lives on-ball lose
// more of it than the players whose value does not.
const usageDemand = (o, f) => o.usageAppetite * 0.55 + f.creationDependence * 0.25 + o.selfCreation * 0.20;
const naturalShare = (demand) => clamp(0.10 + demand * 0.024, 0.12, 0.34);

export const allocateTeamUsage = (profiles) => {
  const demands = profiles.map((p) => usageDemand(p.offense, p.fit));
  const weights = demands.map((d) => Math.pow(Math.max(0.5, d), 1.35));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let shares = weights.map((w) => w / wSum);

  // clamp → redistribute, iterated, so no share escapes [0.08, 0.34] while the
  // total stays exactly 1
  for (let iter = 0; iter < 8; iter++) {
    shares = shares.map((s) => clamp(s, 0.08, 0.34));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) < 1e-9) break;
    const residual = 1 - sum;
    const adjustable = shares.map((s) => (residual > 0 ? s < 0.34 - 1e-9 : s > 0.08 + 1e-9));
    const pool = shares.reduce((a, s, i) => a + (adjustable[i] ? s : 0), 0) || 1;
    shares = shares.map((s, i) => (adjustable[i] ? s + residual * (s / pool) : s));
  }
  // Exact-sum repair, applied to the ROUNDED values. The invariant that must
  // hold is on what we report, not on an unrounded intermediate — rounding five
  // shares to three places and hoping is how a usage model quietly starts
  // allocating 100.1% of one basketball.
  shares = shares.map((s) => r3(s));
  const drift = r3(1 - shares.reduce((a, b) => a + b, 0));
  if (drift !== 0) {
    const i = shares.indexOf(Math.max(...shares));
    shares[i] = r3(shares[i] + drift);
  }

  return profiles.map((p, i) => {
    const demand = demands[i];
    const natural = naturalShare(demand);
    const share = shares[i];
    const compression = Math.max(0, (natural - share) / natural);      // squeezed below diet
    const strain = Math.max(0, (share - natural) / Math.max(natural, 0.12)); // stretched above it
    // How much of a compressed player survives. Elite off-ball value keeps
    // nearly all of it; a pure on-ball creator keeps far less.
    const retention = clamp(0.45 + p.fit.roleScalability * 0.055, 0.45, 1);
    const compressionLoss = compression * (1 - retention);
    const strainLoss = Math.min(0.22, strain * 0.16);
    return {
      cardId: p.id, personId: p.personId, name: p.name,
      demand: r1(demand), natural: r3(natural), share,
      compression: r3(compression), strain: r3(strain),
      roleScalability: p.fit.roleScalability,
      valueRetained: r3(clamp(1 - compressionLoss - strainLoss, 0.7, 1.06)),
    };
  });
};

// ── Creation hierarchy ────────────────────────────────────────────────────────
// A team with five passers is not a team with five primary creators. Assists
// are not creation: creation is manufacturing a good shot with no advantage
// handed to you, which is `selfCreation`, while passing is distribution.
const CREATION_TIERS = ["PRIMARY", "SECONDARY", "TERTIARY", "NON_CREATOR"];
// Tier is CAPABILITY, not allocation. An earlier version also required a usage
// share, which produced the exact wrong answer on the case this engine exists
// to explain: five ball-dominant stars compress each other below the share
// threshold, so the lineup reported ZERO primary creators. Compression does not
// un-make a creator — it is precisely the problem worth reporting, and it is
// reported separately in usagePlan. Capability here, allocation there.
const creationTier = (p) => {
  const c = p.offense.selfCreation;
  if (c >= 7.5) return "PRIMARY";
  if (c >= 6) return "SECONDARY";
  if (c >= 4.5) return "TERTIARY";
  return "NON_CREATOR";
};

// Functional job in the offence, beyond the creation tier.
const offensiveJob = (p) => {
  const o = p.offense, f = p.fit;
  if (o.postThreat >= 7.5) return "POST_HUB";
  if (o.spacingGravity >= 7.5 && o.offBallMovement >= 7) return "MOVEMENT_SHOOTER";
  if (o.spacingGravity >= 6.5) return "SPOT_UP_SPACER";
  if (o.rimThreat >= 7 && o.offBallMovement >= 6) return "ROLL_THREAT";
  if (o.rimThreat >= 6.5) return "FINISHER";
  if (f.connectivity >= 6.5 && o.passingVision >= 6) return "CONNECTOR";
  if (f.roleScalability >= 6.5) return "OFF_BALL_CONTRIBUTOR";
  return "LOW_LEVERAGE";
};

// ── Spacing ───────────────────────────────────────────────────────────────────
// NOT the average three-point rating. Spacing is a property of the floor, not
// of the mean player on it. Three things a mean cannot express:
//   · a low-volume shooter does not bend a defence the way a high-volume
//     movement shooter does — gravity is weighted by off-ball movement;
//   · non-shooters do not average away. One is survivable, three collapse the
//     floor, and the damage is superlinear;
//   · a dominant interior player OCCUPIES the paint he scores in. That is
//     valuable AND congesting at the same time, and a passing big relieves the
//     congestion a scoring big creates.
const spacingProfile = (profiles) => {
  const gravities = profiles.map((p) => p.offense.spacingGravity);
  // gravity weighted by the ability to generate it while moving
  const weighted = profiles.map((p) => p.offense.spacingGravity * (0.65 + p.offense.offBallMovement * 0.035));
  const nonShooters = profiles.filter((p) => p.offense.spacingGravity < 3.5).length;
  const shooters = profiles.filter((p) => p.offense.spacingGravity >= 6.5).length;
  const movementShooters = profiles.filter((p) => p.offense.spacingGravity >= 7 && p.offense.offBallMovement >= 7).length;
  // paint occupancy: how much of the lineup wants to live inside
  const interiorOccupancy = clamp10(mean(profiles.map((p) => Math.max(p.offense.postThreat, p.offense.rimThreat * 0.8))) * 1.1);
  // a big who passes out of the post relieves congestion a scoring big causes
  const passingBigRelief = mean(profiles.filter((p) => ["PF", "C"].includes(p.pos)).map((p) => p.offense.passingVision)) || 0;

  // non-shooters compound: 0→0, 1→0.4, 2→1.4, 3→3.0, 4→5.2
  const crowdPenalty = nonShooters <= 0 ? 0 : (nonShooters ** 1.7) * 0.55;
  const floorSpacing = clamp10(mean(weighted) + movementShooters * 0.35 - crowdPenalty + passingBigRelief * 0.08);

  const conflicts = [];
  if (nonShooters >= 3) conflicts.push(`${nonShooters} non-shooters — the paint has nowhere to be vacated to`);
  else if (nonShooters === 2 && interiorOccupancy >= 6.5) conflicts.push("two non-shooters alongside heavy paint occupancy");
  if (interiorOccupancy >= 7.5 && shooters <= 1) conflicts.push("interior-heavy with almost no floor stretch to relieve it");
  if (movementShooters === 0 && shooters >= 2) conflicts.push("shooting is stationary — gravity only where defenders can pre-rotate");

  return {
    floorSpacing: r1(floorSpacing),
    gravityMean: r1(mean(gravities)),
    weightedGravity: r1(mean(weighted)),
    shooters, movementShooters, nonShooters,
    interiorOccupancy: r1(interiorOccupancy),
    passingBigRelief: r1(passingBigRelief),
    conflicts,
  };
};

// ── Interior offense ──────────────────────────────────────────────────────────
// Two bigs are NOT automatically a problem. Two bigs whose skills duplicate are.
const interiorProfile = (profiles, spacing) => {
  const bigs = profiles.filter((p) => ["PF", "C"].includes(p.pos));
  const rimPressure = r1(clamp10(mean(topN(profiles.map((p) => p.offense.rimThreat), 3))));
  const postPlay = r1(clamp10(Math.max(0, ...profiles.map((p) => p.offense.postThreat))));
  const offensiveRebounding = r1(clamp10(mean(topN(profiles.map((p) => p.defense.defensiveRebounding * 0.7 + (["PF", "C"].includes(p.pos) ? 2 : 0)), 3))));
  const interiorPassing = r1(mean(bigs.map((p) => p.offense.passingVision)) || 0);
  // complementary when the bigs differ: one stretches or passes, one occupies
  const complementary = bigs.length >= 2 &&
    (Math.abs(bigs[0].offense.spacingGravity - bigs[1].offense.spacingGravity) >= 3 ||
     Math.abs(bigs[0].offense.postThreat - bigs[1].offense.postThreat) >= 3 ||
     interiorPassing >= 6.5);
  return {
    rimPressure, postPlay, offensiveRebounding, interiorPassing,
    bigCount: bigs.length,
    shape: bigs.length >= 2 && !complementary && spacing.interiorOccupancy >= 6.5 ? "PAINT_CONGESTION"
      : complementary ? "COMPLEMENTARY_INSIDE_OUT"
      : postPlay >= 7.5 || rimPressure >= 7.5 ? "INTERIOR_DOMINANT"
      : "PERIMETER_ORIENTED",
  };
};

// ── Team defense ──────────────────────────────────────────────────────────────
// Coverage, not assignment. Which opponent each defender takes belongs to the
// Matchup Engine; this reports the TOOLS the lineup has and the gaps it cannot
// cover no matter who it is playing.
//
// Defence is not additive. One elite stopper does not make a lineup able to
// guard five positions, so perimeter coverage weights the best two defenders
// rather than the mean — and the WEAKEST link is reported separately, because
// an offence attacks the weakest link by choice.
const defenseProfile = (profiles) => {
  const poa = profiles.map((p) => p.defense.perimeterContainment);
  const wing = profiles.map((p) => p.defense.wingContainment);
  const rim = profiles.map((p) => p.defense.rimDeterrence);
  const help = profiles.map((p) => p.defense.eventCreation * 0.5 + p.defense.schemeVersatility * 0.5);
  const dreb = profiles.map((p) => p.defense.defensiveRebounding);

  const pointOfAttack = r1(mean(topN(poa, 2)));
  const wingContainment = r1(mean(topN(wing, 2)));
  // rim protection is dominated by the best deterrent, with a real second
  // body mattering less but not nothing
  const sorted = [...rim].sort((a, b) => b - a);
  const rimProtection = r1(clamp10(sorted[0] * 0.75 + (sorted[1] ?? 0) * 0.25));
  const helpDefense = r1(mean(topN(help, 3)));
  const switchability = r1(mean(profiles.map((p) => p.defense.schemeVersatility)));
  const defensiveRebounding = r1(mean(topN(dreb, 2)) * 0.6 + mean(dreb) * 0.4);
  // takeaways are PART of defence, never the whole of it
  const defensivePlaymaking = r1(mean(profiles.map((p) => p.defense.eventCreation)));
  const weakestPerimeter = r1(Math.min(...poa));

  const gaps = [];
  if (pointOfAttack < 5) gaps.push("no credible point-of-attack defender — elite ball handlers get downhill unopposed");
  if (wingContainment < 5) gaps.push("no wing stopper — scoring forwards are unguarded");
  if (rimProtection < 5) gaps.push("no rim deterrent — the paint is unprotected once beaten");
  if (switchability < 4) gaps.push("scheme-locked — cannot switch, so screens force help every time");
  if (defensiveRebounding < 5) gaps.push("possessions do not finish — stops leak into second chances");
  if (weakestPerimeter < 3 && pointOfAttack >= 6) gaps.push("one hideable weak link the offence will hunt every possession");

  return { pointOfAttack, wingContainment, rimProtection, helpDefense, switchability,
           defensiveRebounding, defensivePlaymaking, weakestPerimeter, gaps };
};

// ── Physical balance ──────────────────────────────────────────────────────────
// Size is NOT universally good. More size buys rebounding and interior defence
// and costs pace and switchability; less size buys the reverse. Missing
// measurements REDUCE CONFIDENCE — they never produce a fabricated value.
const physicalProfile = (profiles) => {
  const heights = profiles.map((p) => p.physical.heightIn).filter((h) => h != null);
  const weights = profiles.map((p) => p.physical.weightLb).filter((w) => w != null);
  const known = heights.length;
  const guards = profiles.filter((p) => ["PG", "SG"].includes(p.pos)).map((p) => p.physical.heightIn).filter((h) => h != null);
  const wings = profiles.filter((p) => p.pos === "SF").map((p) => p.physical.heightIn).filter((h) => h != null);
  const bigs = profiles.filter((p) => ["PF", "C"].includes(p.pos)).map((p) => p.physical.heightIn).filter((h) => h != null);
  // how many slots each player can legally fill
  const positionalFlexibility = r1(mean(profiles.map((p) => p.positions.length)));

  return {
    measuredPlayers: known,
    // null rather than 0 when nothing is known — an unmeasured lineup is not a short one
    averageHeightIn: known ? r1(mean(heights)) : null,
    averageWeightLb: weights.length ? r1(mean(weights)) : null,
    guardHeightIn: guards.length ? r1(mean(guards)) : null,
    wingHeightIn: wings.length ? r1(mean(wings)) : null,
    interiorHeightIn: bigs.length ? r1(mean(bigs)) : null,
    // an explicit proxy, never presented as measured strength or speed
    strengthProxy: weights.length ? r1(mean(weights)) : null,
    speed: null, // no accessible source publishes it; never inferred from weight
    positionalFlexibility,
    note: known === 0
      ? "No verified measurements in this lineup — every size conclusion below is unsupported and confidence is reduced accordingly."
      : known < profiles.length
      ? `Only ${known} of ${profiles.length} players have verified measurements; size conclusions are partial.`
      : "All five players have verified measurements.",
  };
};

// ── Rebounding ────────────────────────────────────────────────────────────────
// Offensive and defensive assessed separately, and never by summing RPG. One
// elite rebounder does not make a rebounding team: the question is how many
// bodies go to the glass and whether the perimeter helps.
const reboundingProfile = (profiles) => {
  const dreb = profiles.map((p) => p.defense.defensiveRebounding);
  const strong = profiles.filter((p) => p.defense.defensiveRebounding >= 7).length;
  const perimeterHelp = profiles.filter((p) => ["PG", "SG", "SF"].includes(p.pos) && p.defense.defensiveRebounding >= 5).length;
  const best = Math.max(...dreb);
  const rest = mean([...dreb].sort((a, b) => b - a).slice(1));
  const concerns = [];
  if (strong === 0) concerns.push("no strong rebounder in the lineup");
  if (strong === 1 && rest < 4) concerns.push("one elite rebounder carrying four non-contributors — vulnerable the moment he is moved");
  if (perimeterHelp === 0) concerns.push("no perimeter rebounding help");
  return {
    defensiveGlass: r1(clamp10(best * 0.45 + rest * 0.55)),
    offensiveGlass: r1(clamp10(mean(topN(profiles.map((p) => p.defense.defensiveRebounding * 0.6 + (["PF", "C"].includes(p.pos) ? 1.8 : 0)), 2)))),
    strongRebounders: strong, perimeterHelp, bestRebounder: r1(best), supportingCast: r1(rest),
    concerns,
  };
};

// ── Role coverage ─────────────────────────────────────────────────────────────
// Deliberately NOT one ideal template. Different legitimate basketball
// identities must remain possible, so this reports what is covered, what is
// duplicated, and what is absent — and lets the reader judge.
const OFFENSIVE_ROLES = {
  "Primary Creator": (p) => p.offense.selfCreation >= 7.5,
  "Secondary Creator": (p) => p.offense.selfCreation >= 6,
  "Movement Shooter": (p) => p.offense.spacingGravity >= 7 && p.offense.offBallMovement >= 7,
  "Spot-Up Shooter": (p) => p.offense.spacingGravity >= 6,
  "Connector": (p) => p.fit.connectivity >= 6.5 && p.offense.passingVision >= 6,
  "Post Hub": (p) => p.offense.postThreat >= 7,
  "Roll Threat": (p) => p.offense.rimThreat >= 6.5 && p.offense.offBallMovement >= 6,
  "Transition Threat": (p) => p.offense.rimThreat >= 6 && p.fit.roleScalability >= 5,
};
const DEFENSIVE_ROLES = {
  "Point-of-Attack Stopper": (p) => p.defense.perimeterContainment >= 7,
  "Wing Stopper": (p) => p.defense.wingContainment >= 7,
  "Help Defender": (p) => p.defense.eventCreation >= 6.5 && p.defense.schemeVersatility >= 5,
  "Rim Protector": (p) => p.defense.rimDeterrence >= 7,
  "Switch Defender": (p) => p.defense.schemeVersatility >= 7,
  "Defensive Anchor": (p) => p.defense.interiorDeterrence >= 7 && p.defense.defensiveRebounding >= 6,
  "Rebounding Finisher": (p) => p.defense.defensiveRebounding >= 7,
};

const roleCoverage = (profiles) => {
  const tally = (defs) => {
    const out = {};
    for (const [role, test] of Object.entries(defs)) out[role] = profiles.filter(test).map((p) => p.id);
    return out;
  };
  const offense = tally(OFFENSIVE_ROLES);
  const defense = tally(DEFENSIVE_ROLES);
  const all = { ...offense, ...defense };
  const covered = Object.entries(all).filter(([, ids]) => ids.length > 0).map(([r]) => r);
  const missing = Object.entries(all).filter(([, ids]) => ids.length === 0).map(([r]) => r);
  // redundancy is only interesting for roles a team cannot use three of
  const SCARCE = ["Primary Creator", "Post Hub", "Rim Protector", "Defensive Anchor"];
  const redundant = Object.entries(all)
    .filter(([r, ids]) => ids.length >= (SCARCE.includes(r) ? 2 : 3))
    .map(([role, ids]) => ({ role, count: ids.length, players: ids }));
  return { offense, defense, covered, missing, redundant };
};

// ── Internal identity tags ────────────────────────────────────────────────────
// Descriptive vocabulary for later layers. NOT a power rating, and never shown
// to a user in this phase. A lineup may carry several tags or none.
const identityTags = (spacing, interior, defense, usage, physical, creation) => {
  const tags = [];
  if (spacing.movementShooters >= 2 && spacing.floorSpacing >= 6.5) tags.push("MOTION_SPACING");
  if (interior.shape === "INTERIOR_DOMINANT" || interior.shape === "PAINT_CONGESTION") tags.push("INTERIOR_DOMINANT");
  if (defense.rimProtection >= 7 && defense.pointOfAttack >= 6.5) tags.push("DEFENSE_FIRST");
  if (creation.primaryCount >= 3) tags.push("CREATOR_HEAVY");
  if (defense.switchability >= 7) tags.push("SWITCHABLE");
  if (interior.postPlay >= 7.5) tags.push("POST_CENTRIC");
  if (usage.filter((u) => u.compression >= 0.25).length >= 3) tags.push("HIGH_USAGE_REDUNDANT");
  // Size tags require enough MEASURED players to mean anything. With two of
  // five measured, an average of the two that happen to be tall is not a
  // statement about the lineup — it is a statement about the sample.
  const sizeKnown = physical.measuredPlayers >= 4 && physical.averageHeightIn != null;
  if (sizeKnown && physical.averageHeightIn <= 77.5) tags.push("SMALL_BALL");
  if (sizeKnown && physical.averageHeightIn >= 80.5) tags.push("OVERSIZED");
  if (spacing.floorSpacing >= 5.5 && defense.rimProtection >= 6 && defense.pointOfAttack >= 5.5) tags.push("BALANCED_TWO_WAY");
  if (creation.primaryCount <= 1 && spacing.shooters >= 3) tags.push("ONE_CREATOR_SPACED");
  return tags;
};

// ── Confidence ────────────────────────────────────────────────────────────────
// Reflects INPUT QUALITY. Never variance — a low-confidence lineup is not a
// random one, it is one we know less about.
const teamConfidence = (profiles, physical) => {
  const reviewed = profiles.filter((p) => p.provenance.humanReviewed).length;
  const measuredShooting = profiles.filter((p) => p.shooting.source != null).length;
  // Read the RAW DNA signal, not the profile-level confidence. Human review
  // legitimately raises confidence in a judgement, but it cannot conjure a
  // statistic the NBA never recorded — a curated Bill Russell is still a
  // player whose blocks were never counted, and a lineup built on such
  // profiles should say so.
  const preRecording = profiles.filter((p) =>
    String(p.provenance?.dnaProvenance?.confidence?.stlBlkCapabilities ?? "").startsWith("LOW")).length;
  const grade = (n) => (n >= 4 ? "HIGH" : n >= 2 ? "MEDIUM" : "LOW");
  return {
    overall: grade(Math.round((reviewed + measuredShooting + physical.measuredPlayers) / 3)),
    offense: measuredShooting >= 3 ? "MEDIUM-HIGH" : measuredShooting >= 1 ? "MEDIUM" : "LOW (no measured shooting splits in this lineup)",
    defense: preRecording >= 2
      ? `LOW (${preRecording} players predate official steal/block recording in 1973-74 — their defensive inputs are estimates, not measurements)`
      : preRecording === 1 ? "MEDIUM (one player predates official steal/block recording)" : "MEDIUM-HIGH",
    preRecordingPlayers: preRecording,
    physical: physical.measuredPlayers === 5 ? "HIGH" : physical.measuredPlayers >= 2 ? "MEDIUM" : "LOW (size conclusions largely unsupported)",
    humanReviewed: reviewed,
    note: "Confidence describes how much is KNOWN about this lineup. It is not game randomness and must never be used as variance.",
  };
};

/**
 * Build the construction analysis for one five-player lineup.
 *
 * @param playerCards          five PLAYERS entries, or five card ids
 * @param playerIntelligence   optional pre-built profiles (else built here)
 * @param positionAssignments  optional explicit slots; defaults to each
 *                             player's primary position
 * @param ctx                  accepted and DELIBERATELY IGNORED, exactly as in
 *                             buildIntelligence. It exists so the coach/era
 *                             independence tests have something real to vary.
 */
export const buildTeamIntelligence = ({ playerCards, playerIntelligence = null, positionAssignments = null, ctx = {} } = {}) => {
  void ctx; // coach/era/opponent independence: never read.

  // ── validate ────────────────────────────────────────────────────────────────
  if (!Array.isArray(playerCards)) throw new Error("buildTeamIntelligence: playerCards must be an array");
  if (playerCards.length !== 5) throw new Error(`buildTeamIntelligence: a lineup is exactly 5 players, received ${playerCards.length}`);

  const cards = playerCards.map((c, i) => {
    const card = typeof c === "string" ? findCard(c) : c;
    if (!card || !card.id) throw new Error(`buildTeamIntelligence: unknown player at index ${i}: ${JSON.stringify(c)}`);
    return card;
  });

  const seenPerson = new Map();
  for (const c of cards) {
    const pid = personIdForCard(c.id) ?? c.id;
    if (seenPerson.has(pid)) throw new Error(`buildTeamIntelligence: ${c.name} appears twice in one lineup (${seenPerson.get(pid)} and ${c.id})`);
    seenPerson.set(pid, c.id);
  }

  const slots = positionAssignments ?? cards.map((c) => c.pos);
  if (!Array.isArray(slots) || slots.length !== 5) throw new Error("buildTeamIntelligence: positionAssignments must be 5 entries");
  for (const [i, s] of slots.entries()) {
    if (!SLOTS.includes(s)) throw new Error(`buildTeamIntelligence: "${s}" is not a position`);
    if (!cards[i].positions.includes(s)) throw new Error(`buildTeamIntelligence: ${cards[i].name} cannot play ${s}`);
  }

  const supplied = playerIntelligence ? new Map(playerIntelligence.map((p) => [p.id, p])) : null;
  const built = cards.map((c) => supplied?.get(c.id) ?? buildIntelligence(c));

  // ── order-independence ──────────────────────────────────────────────────────
  // Sort by assigned slot, then card id. Reordering the input array without
  // changing the explicit positions must not change a single output value.
  const paired = built
    .map((profile, i) => ({ profile, slot: slots[i] }))
    .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || a.profile.id.localeCompare(b.profile.id));
  const profiles = paired.map((x) => ({ ...x.profile, pos: x.slot }));
  const orderedIds = paired.map((x) => x.profile.id);
  const orderedSlots = paired.map((x) => x.slot);

  // ── analyse ─────────────────────────────────────────────────────────────────
  const usagePlan = allocateTeamUsage(profiles);
  const shareById = new Map(usagePlan.map((u) => [u.cardId, u.share]));

  const rolePlan = profiles.map((p) => ({
    cardId: p.id, personId: p.personId, name: p.name, slot: p.pos,
    playerRole: p.roles.primary,
    creationTier: creationTier(p),
    offensiveJob: offensiveJob(p),
    usageShare: shareById.get(p.id),
    roleScalability: p.fit.roleScalability,
  }));

  const byCreation = [...rolePlan].sort((a, b) => CREATION_TIERS.indexOf(a.creationTier) - CREATION_TIERS.indexOf(b.creationTier) || b.usageShare - a.usageShare);
  const primaryCount = rolePlan.filter((r) => r.creationTier === "PRIMARY").length;
  const creationHierarchy = {
    order: byCreation.map((r) => ({ cardId: r.cardId, tier: r.creationTier, usageShare: r.usageShare })),
    primary: byCreation.find((r) => r.creationTier === "PRIMARY")?.cardId ?? null,
    secondary: byCreation.filter((r) => r.creationTier === "SECONDARY").map((r) => r.cardId),
    primaryCount,
    lateClockCreation: r1(Math.max(0, ...profiles.map((p) => p.offense.selfCreation))),
    passingConnectivity: r1(mean(profiles.map((p) => p.fit.connectivity))),
    // a team of five distributors is not a team with a creator
    hasCredibleCreator: primaryCount >= 1 || Math.max(...profiles.map((p) => p.offense.selfCreation)) >= 7,
    tooManyPrimaries: primaryCount >= 3,
  };

  const spacing = spacingProfile(profiles);
  const interior = interiorProfile(profiles, spacing);
  const defense = defenseProfile(profiles);
  const physical = physicalProfile(profiles);
  const rebounding = reboundingProfile(profiles);
  const coverage = roleCoverage(profiles);
  const confidence = teamConfidence(profiles, physical);

  const offBallValue = r1(mean(profiles.map((p) => p.fit.roleScalability)));
  const compressed = usagePlan.filter((u) => u.compression >= 0.2);

  const strengths = [];
  if (spacing.floorSpacing >= 7) strengths.push("the floor is genuinely spaced");
  if (defense.rimProtection >= 7.5) strengths.push("elite rim deterrence");
  if (defense.pointOfAttack >= 7) strengths.push("can contain elite ball handlers");
  if (creationHierarchy.primaryCount === 1 && offBallValue >= 6) strengths.push("one clear creator with four players who keep value off the ball");
  if (defense.switchability >= 7) strengths.push("switchable across most assignments");
  if (rebounding.strongRebounders >= 2) strengths.push("multiple bodies on the defensive glass");
  if (interior.shape === "COMPLEMENTARY_INSIDE_OUT") strengths.push("bigs complement rather than duplicate");

  const offensiveLimits = [];
  if (spacing.floorSpacing < 4) offensiveLimits.push("the floor does not stretch — help defenders never have to leave the paint");
  else if (spacing.floorSpacing < 5.5) offensiveLimits.push("limited floor stretch");
  if (creationHierarchy.lateClockCreation < 6.5) offensiveLimits.push("no reliable late-clock shot creation when the first action dies");
  if (offBallValue < 4.5) offensiveLimits.push("little value without the ball — four players wait while one works");
  if (interior.rimPressure < 5 && spacing.floorSpacing < 6) offensiveLimits.push("neither rim pressure nor spacing — the defence can sit in one shape all night");

  const concerns = [
    ...spacing.conflicts, ...defense.gaps, ...rebounding.concerns, ...offensiveLimits,
    ...(creationHierarchy.tooManyPrimaries ? [`${primaryCount} primary creators sharing one ball — ${compressed.length} players compressed below their natural diet`] : []),
    ...(!creationHierarchy.hasCredibleCreator ? ["no credible shot creator — nobody manufactures offence when a possession breaks down"] : []),
    ...(coverage.missing.length >= 6 ? [`${coverage.missing.length} of ${coverage.covered.length + coverage.missing.length} roles uncovered`] : []),
  ];

  const construction = {
    roleCoverage: coverage,
    roleRedundancy: coverage.redundant,
    usageCompression: {
      compressedPlayers: compressed.map((u) => ({ cardId: u.cardId, compression: u.compression, valueRetained: u.valueRetained, roleScalability: u.roleScalability })),
      totalValueRetained: r3(mean(usagePlan.map((u) => u.valueRetained))),
      // the diagnostic that matters: who loses value, and why
      worstFit: compressed.length ? compressed.reduce((a, b) => (a.valueRetained <= b.valueRetained ? a : b)).cardId : null,
    },
    spacingConflicts: spacing.conflicts,
    defensiveGaps: defense.gaps,
    reboundingGaps: rebounding.concerns,
    lineupStrengths: strengths,
    lineupConcerns: concerns,
  };

  return {
    lineupFingerprint: fnv1a(orderedIds.map((id, i) => `${id}:${orderedSlots[i]}`).join("|") + `|v${TEAM_INTELLIGENCE_VERSION}`),
    playerIds: orderedIds,
    positionAssignments: orderedSlots,
    rolePlan,
    usagePlan,
    creationHierarchy,
    offense: {
      shotCreation: r1(mean(topN(profiles.map((p) => p.offense.selfCreation), 2))),
      secondaryCreation: r1(mean(topN(profiles.map((p) => p.offense.selfCreation), 3).slice(1))),
      offBallValue,
      spacing,
      rimPressure: interior.rimPressure,
      postPlay: interior.postPlay,
      passing: r1(mean(profiles.map((p) => p.offense.passingVision))),
      screening: r1(mean(profiles.map((p) => (["PF", "C"].includes(p.pos) ? 6 : 4) * 0.5 + p.offense.offBallMovement * 0.35))),
      cutting: r1(mean(profiles.map((p) => p.offense.offBallMovement))),
      transition: r1(mean(topN(profiles.map((p) => p.offense.rimThreat * 0.6 + p.defense.eventCreation * 0.4), 3))),
      turnoverRisk: r1(clamp10(10 - mean(profiles.map((p) => p.offense.ballSecurity)) + (creationHierarchy.hasCredibleCreator ? 0 : 1.5))),
      interior,
    },
    defense,
    physical,
    rebounding,
    construction,
    identity: identityTags(spacing, interior, defense, usagePlan, physical, creationHierarchy),
    confidence,
    provenance: {
      derivedFrom: "Player Intelligence profiles (src/v3/intelligence.js), which derive from Player DNA",
      independence: "Coach-, era-, opponent- and seed-independent by construction. No RNG, no era branch, no coach import.",
      engineUse: "NONE — no simulation module imports this layer. It does not affect game outcomes.",
      noOverallScore: "Deliberately absent. A lineup is many dimensions; collapsing them into one number recreates the OVR problem at team level.",
      hidden: "Internal only in this phase. No team score, spacing score, or identity is exposed to users.",
    },
    modelVersion: TEAM_INTELLIGENCE_VERSION,
  };
};

export const teamIntelligenceFor = (cardIds, positionAssignments = null) =>
  buildTeamIntelligence({ playerCards: cardIds, positionAssignments });
