// ── Threat and defender profiles ─────────────────────────────────────────────
// Both are MATCHUP-SPECIFIC descriptions, not universal player scores.
//
// A threat profile answers "what kind of defensive problem is this player, in
// this lineup?" — not "how good is he". A lower-OVR movement shooter creates a
// harder chase assignment than a higher-OVR interior role player, and an
// assignment system built on one overall number cannot express that.
//
// A defender profile answers "what kinds of threat can this player handle?" —
// deliberately NOT a single defenceScore, because a defender can be elite at
// the point of attack, average against large wings, poor in the post, and
// vulnerable chasing movement shooting, all at once.
import { strategicEffects } from "../eraStyleIntelligence.js";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

// Categorical shooting identity → a bounded numeric the matrix can compare.
// Kept here so the mapping lives in one place.
const PERIMETER_SKILL = { ELITE: 9, STRONG: 7.5, AVERAGE: 5, LIMITED: 3, MINIMAL: 1.5 };
const THREE_VOLUME = { HIGH: 9, MEDIUM: 6, LOW: 3, NONE: 0.5 };

const hasRole = (profile, name) => (profile.roles?.all ?? []).includes(name);
const roleRank = (profile, name) => {
  const all = profile.roles?.all ?? [];
  const i = all.indexOf(name);
  return i < 0 ? 0 : clamp(1 - i * 0.16, 0.2, 1);
};

/**
 * What kind of problem this player creates. Era-aware: the three-point gravity
 * of a movement shooter is a different defensive problem when the shot does
 * not exist, so the era translation is applied to the THREAT, not to the
 * player's ability.
 */
export const buildThreatProfile = ({ profile, card, usagePlanEntry, creationTier, eff, era, positionAssignment }) => {
  const o = profile.offense ?? {};
  const sh = profile.shooting ?? {};
  const perim = PERIMETER_SKILL[sh.perimeterSkill] ?? 5;
  const vol = THREE_VOLUME[sh.threeVolume] ?? 3;
  const threeLegal = Boolean(era.rules?.threePoint);

  // Movement vs spot-up shooting are different assignments: one is a chase,
  // the other is a closeout. Splitting them is the point of this profile.
  const movement = clamp(perim * 0.5 + num(o.offBallMovement, 5) * 0.5, 0, 10) * roleRank(profile, "Movement Shooter");
  const spotUp = clamp(perim * 0.7 + num(o.spacingGravity, 5) * 0.3, 0, 10) * (hasRole(profile, "Spot-Up Spacer") ? 1 : 0.7);
  const pullUp = clamp(perim * 0.45 + num(o.selfCreation, 5) * 0.55, 0, 10);

  return {
    playerCardId: card.id,
    personId: profile.personId ?? null,
    name: profile.name ?? card.name,
    nominalPosition: positionAssignment ?? card.pos ?? null,
    functionalRoles: profile.roles?.all ?? [],
    primaryRole: profile.roles?.primary ?? null,

    threats: {
      primaryCreation: r1(clamp(num(o.selfCreation, 5) * 0.6 + num(o.usageAppetite, 5) * 0.4, 0, 10) * (creationTier === "PRIMARY" ? 1 : creationTier === "SECONDARY" ? 0.82 : 0.6)),
      secondaryCreation: r1(clamp(num(o.passingVision, 5) * 0.5 + num(o.selfCreation, 5) * 0.5, 0, 10) * (creationTier === "TERTIARY" ? 0.8 : 1)),
      // Shooting threats are era-gated: a movement shooter in 1962 is still a
      // hard chase, but the SHOT he is chasing is a long two, not a three.
      pullUpShooting: r1(pullUp * (threeLegal ? 1 : 0.72)),
      movementShooting: r1(movement * (threeLegal ? 1 : 0.68)),
      spotUpShooting: r1(spotUp * (threeLegal ? 1 : 0.6)),
      rimPressure: r1(num(o.rimThreat, 5)),
      postScoring: r1(num(o.postThreat, 3)),
      passing: r1(num(o.passingVision, 5)),
      screening: r1(clamp(num(o.postThreat, 3) * 0.5 + (num(profile.physical?.weightLb, 0) > 230 ? 3 : 1.5), 0, 10)),
      rollThreat: r1(clamp(num(o.rimThreat, 5) * 0.7 + roleRank(profile, "Roll Threat") * 3, 0, 10)),
      popThreat: r1(clamp(perim * 0.8 * (hasRole(profile, "Stretch Big") ? 1 : 0.5), 0, 10) * (threeLegal ? 1 : 0.5)),
      cutting: r1(clamp(num(o.offBallMovement, 5) * 0.7 + num(o.rimThreat, 5) * 0.3, 0, 10)),
      offensiveRebounding: r1(num(profile.defense?.defensiveRebounding, 5)),
      transition: r1(clamp(num(o.rimThreat, 5) * 0.6 + num(o.offBallMovement, 5) * 0.4, 0, 10)),
      foulPressure: r1(clamp(num(o.rimThreat, 5) * 0.55 + num(o.postThreat, 3) * 0.45, 0, 10)),
    },

    // The offensive player's own verified measurements, for size comparison.
    // null when unverified — a size mismatch that cannot be measured is not
    // claimed, and position is NEVER written into these fields.
    threatHeightIn: Number.isFinite(Number(profile.physical?.heightIn)) ? Number(profile.physical.heightIn) : null,
    threatWeightLb: Number.isFinite(Number(profile.physical?.weightLb)) ? Number(profile.physical.weightLb) : null,

    usageShare: usagePlanEntry?.share ?? 0.2,
    expectedTouchShare: r1((usagePlanEntry?.share ?? 0.2) * 100) / 100,
    creationTier,

    // ── Creation locus ─────────────────────────────────────────────────────
    // WHERE a player creates, not just how much. Treating all creation as
    // point-of-attack creation charged a centre full perimeter-containment
    // shortfall for guarding another centre — which is why Bill Russell on
    // Nikola Jokic priced at 40.7 while Russell chasing Klay Thompson priced
    // at 20.4, and the optimizer duly picked the absurd one.
    creationLocus: (() => {
      const onBall = num(o.selfCreation, 5) * 0.6 + perim * 0.4;
      const interior = num(o.postThreat, 3) * 0.7 + num(o.rimThreat, 5) * 0.3;
      const total = onBall + interior;
      return total <= 0 ? { perimeter: 0.5, interior: 0.5 } : {
        perimeter: Math.round((onBall / total) * 100) / 100,
        interior: Math.round((interior / total) * 100) / 100,
      };
    })(),

    // ── Defensive demand ───────────────────────────────────────────────────
    // How much WORK this assignment is, which is NOT the same as how many
    // touches the player gets. An elite movement shooter at 12% usage runs a
    // defender off three screens a possession; weighting the assignment by
    // on-ball usage alone made him look like a hiding spot.
    //
    // Deliberately general: no player id appears anywhere in this calculation.
    defensiveDemand: r1(clamp(
      Math.max(
        (usagePlanEntry?.share ?? 0.2) * 22,
        (movement * 0.34 + spotUp * 0.16 + num(o.offBallMovement, 5) * 0.2
          + num(o.spacingGravity, 5) * 0.18 + clamp(perim * 0.12, 0, 2)) * (threeLegal ? 1 : 0.78),
      ),
      0, 10,
    )),
    // Spacing gravity is lineup context, not a personal threat: it describes
    // how much the defence must respect him away from the ball.
    gravity: r1(num(o.spacingGravity, 5) * (threeLegal ? 1 : 0.55)),
    dataConfidence: {
      offense: profile.confidence?.offense ?? "UNKNOWN",
      shooting: profile.confidence?.shooting ?? "UNKNOWN",
      physical: profile.confidence?.physical ?? "UNKNOWN",
      overall: profile.confidence?.overall ?? "UNKNOWN",
    },
  };
};

/**
 * What kinds of threat this defender can take. Physical fields stay null when
 * unverified — never inferred from position, and wingspan is null by policy
 * everywhere. Missing measurements lower confidence and push the profile
 * toward its documented functional role, they do not invent a number.
 */
export const buildDefenderProfile = ({ profile, card, eff, era, positionAssignment }) => {
  const d = profile.defense ?? {};
  const o = profile.offense ?? {};
  const ph = profile.physical ?? {};
  const heightIn = Number.isFinite(Number(ph.heightIn)) ? Number(ph.heightIn) : null;
  const weightLb = Number.isFinite(Number(ph.weightLb)) ? Number(ph.weightLb) : null;
  const measured = (heightIn != null ? 1 : 0) + (weightLb != null ? 1 : 0);

  // Position is a SOFT fallback for missing physicals — it says what size this
  // player was asked to play against, which is weaker evidence than a
  // measurement but stronger than nothing. Never written into the physical
  // fields themselves.
  const pos = positionAssignment ?? card.pos ?? null;
  const POSITIONAL_SIZE = { PG: 74, SG: 77, SF: 79, PF: 81, C: 83 };
  const sizeProxy = heightIn ?? POSITIONAL_SIZE[pos] ?? 78;
  const sizeProxySource = heightIn != null ? "VERIFIED_HEIGHT" : pos ? "POSITIONAL_FALLBACK" : "DEFAULT";

  const perimeter = num(d.perimeterContainment, 5);
  const wing = num(d.wingContainment, 5);
  const interior = num(d.interiorDeterrence, 5);
  const rim = num(d.rimDeterrence, 5);
  const versatility = num(d.schemeVersatility, 5);

  // Strength and speed are DERIVED PROXIES and labelled as such. Weight is a
  // real measurement where present; where absent the proxy leans on interior
  // defence, which is the observable consequence of strength.
  const strength = weightLb != null
    ? r1(clamp((weightLb - 175) / 12 + interior * 0.35, 0, 10))
    : r1(clamp(interior * 0.7 + 1.5, 0, 10));
  const speed = r1(clamp(perimeter * 0.55 + versatility * 0.25 + (heightIn != null ? clamp((82 - heightIn) * 0.5, 0, 3) : 1.2), 0, 10));

  const capabilities = {
    pointOfAttack: r1(perimeter),
    // Screen navigation and movement chasing are the two things a big guard
    // gets wrong against a shooter, and they are NOT the same as containment.
    screenNavigation: r1(clamp(perimeter * 0.45 + versatility * 0.3 + speed * 0.25, 0, 10)),
    movementChasing: r1(clamp(speed * 0.45 + perimeter * 0.3 + versatility * 0.25, 0, 10)),
    wingContainment: r1(wing),
    postDefense: r1(clamp(interior * 0.6 + strength * 0.4, 0, 10)),
    interiorDefense: r1(interior),
    rimProtection: r1(rim),
    helpDefense: r1(clamp(versatility * 0.45 + interior * 0.3 + num(d.eventCreation, 5) * 0.25, 0, 10)),
    switchability: r1(clamp(versatility * 0.4 + perimeter * 0.25 + interior * 0.2 + speed * 0.15, 0, 10)),
    defensivePlaymaking: r1(num(d.eventCreation, 5)),
    defensiveRebounding: r1(num(d.defensiveRebounding, 5)),
    // Foul discipline is not a defensive strength — a defender who fouls is
    // often one who was beaten. It reads shot selection and ball security as
    // proxies for control, and is bounded.
    foulDiscipline: r1(clamp(4 + num(o.shotSelection, 5) * 0.3 + versatility * 0.2, 0, 10)),
  };

  return {
    playerCardId: card.id,
    personId: profile.personId ?? null,
    name: profile.name ?? card.name,
    nominalPosition: pos,
    capabilities,
    physical: {
      heightIn, weightLb,
      wingspanIn: null, // null by policy everywhere; never inferred
      strength, speed,
      athleticism: r1(clamp((speed + strength) / 2, 0, 10)),
      sizeProxy, sizeProxySource,
      measuredFields: measured,
    },
    roleAvailability: {
      canTakePrimaryCreator: capabilities.pointOfAttack >= 6 || capabilities.wingContainment >= 7,
      canChaseShooter: capabilities.movementChasing >= 5.5 && capabilities.screenNavigation >= 5,
      canGuardPost: capabilities.postDefense >= 6 || (weightLb != null && weightLb >= 235),
      canProtectRim: capabilities.rimProtection >= 6.5,
      canSwitch: capabilities.switchability >= 6,
      // Hiding is only available to a defender who is weak ACROSS THE BOARD.
      // Every big is poor at the point of attack — that is his role, not a
      // weakness to hide. Gating on perimeter defence alone labelled Tim
      // Duncan the weak link and "hid" him on a low-usage forward, which is
      // the opposite of what a coach would do with him.
      canHideOnLowUsagePlayer: capabilities.pointOfAttack <= 5 && capabilities.wingContainment <= 5.5
        && capabilities.postDefense <= 6 && capabilities.rimProtection <= 6,
    },
    confidence: {
      defense: profile.confidence?.defense ?? "UNKNOWN",
      physical: profile.confidence?.physical ?? "UNKNOWN",
      // Explicit: how much of this profile rests on a measurement.
      physicalCoverage: measured === 2 ? "COMPLETE" : measured === 1 ? "PARTIAL" : "NONE",
      derivedProxies: ["strength", "speed", "athleticism"],
      overall: profile.confidence?.overall ?? "UNKNOWN",
    },
  };
};

/** Build both sides' profiles for one prepared team. Pure and order-stable. */
export const buildMatchupProfiles = ({ team, eff, era }) => ({
  threats: team.players.map((p) => buildThreatProfile({
    profile: p.profile, card: { id: p.cardId, name: p.name, pos: p.position },
    usagePlanEntry: p.usagePlanEntry, creationTier: p.creationTier,
    eff, era, positionAssignment: p.position,
  })),
  defenders: team.players.map((p) => buildDefenderProfile({
    profile: p.profile, card: { id: p.cardId, name: p.name, pos: p.position },
    eff, era, positionAssignment: p.position,
  })),
});

export { PERIMETER_SKILL, THREE_VOLUME };
