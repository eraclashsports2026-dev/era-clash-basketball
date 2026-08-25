// ── Player Intelligence (V3) ──────────────────────────────────────────────────
// A READ-ONLY interpretive layer over Player DNA. DNA answers "how good is this
// player at X?" in 27 numbers. Intelligence answers the questions a team builder
// actually asks: what KIND of player is this, what do they need in order to
// function, what do they still give you when they get nothing, and how much of
// what we just said is actually known?
//
// WHAT THIS LAYER IS NOT
// ──────────────────────
// It is not wired into game outcomes. The possession engine consumes DNA
// exactly as it did before this file existed, and nothing here is imported by
// possession.js, gameplan.js, defense.js, or engine.js. This layer exists so
// that the Team Intelligence and Coach layers can be built on top of a stable
// vocabulary instead of re-deriving one each time. Adding it changes no
// simulated result.
//
// THE ONE RULE THAT MATTERS MOST: ERA INDEPENDENCE
// ────────────────────────────────────────────────
// A profile describes a PLAYER, never a matchup. buildIntelligence() takes no
// era, never reads one, and returns a byte-identical profile no matter what
// era a game is played in. This is deliberate and it is the philosophical
// centre of the whole feature:
//
//     players determine capability → era style determines environment →
//     matchups determine which strengths matter
//
// If a spot-up shooter is worth more in a spaced 2020s game than in a packed
// 1960s one, that difference belongs to the Era Style engine deciding what a
// skill is WORTH tonight — never to this file quietly handing the shooter a
// bonus for having been born later. There are no era bonuses here, no era
// multipliers, and no era branches. The eraTranslation block NAMES which of a
// player's strengths are environment-sensitive; it does not price them.
// tests/v3-intelligence.test.js enforces this by building every profile under
// deliberately conflicting era contexts and asserting deep equality.
//
// Deliberately NOT cached. Caching by id would let a future era-dependent
// regression slip past the era-independence test by returning a stale first
// result. This layer is not on the possession hot path, so recomputation is
// the cheaper mistake to avoid.
import { PLAYERS } from "../players.js";
import { playerDNA } from "./playerProfile.js";
import CURATED from "./data/intelligence.js";
import { personIdForCard } from "./data/persons.js";
import { physicalFor } from "./data/physical.js";
import { shootingFor, threePctIsMeaningful, SHOOTING_IDENTITY } from "./data/shooting.js";
import { statBasisFor } from "./data/cardStatBasis.js";
import { preRecordingDefense, BAND_FLOOR } from "./data/preRecordingDefense.js";

const clamp10 = (v) => Math.max(0, Math.min(10, v));
const r1 = (v) => Math.round(clamp10(v) * 10) / 10;

// ── Role vocabulary ───────────────────────────────────────────────────────────
// A closed set. Anything a profile claims to be must appear here, so that
// downstream layers can switch on roles without string-matching guesswork.
// ORDER IS THE TIE-BREAK POLICY. When two roles fit a player equally well the
// earlier one wins, so the list runs from most-defining to most-generic. Rim
// protection sits ahead of rebounding deliberately: both describe Bill Russell
// accurately, but rim protection is the more portable skill, while rebounding
// totals are the single most era-inflated number in the dataset (see the
// ^0.85 normalization in playerProfile.js). Where the evidence ties, prefer
// the label that travels.
export const ROLES = [
  "Primary Creator", "Secondary Creator", "Floor General", "Movement Shooter",
  "Spot-Up Spacer", "Slasher", "Post Hub", "Roll Threat", "Stretch Big",
  "Rim Protector", "Defensive Anchor", "Point-of-Attack Stopper",
  "Wing Stopper", "Help Defender", "Glass Cleaner", "Connector",
  "Low-Usage Finisher",
];

// Each role scores 0–10 against a profile's own attributes (NOT raw DNA), so a
// curated attribute correction propagates into classification automatically.
//
// LIMITING-FACTOR SCORING. Most roles use min() across the traits the role
// genuinely REQUIRES TOGETHER, because basketball roles are conjunctive: a
// Primary Creator needs both the skill to make a shot from nothing AND the
// usage to be handed that job — a high-usage scorer who cannot create is not
// one, and neither is a gifted creator who never touches the ball. A plain
// weighted average lets one high attribute carry a role the player cannot
// actually fill, and when this file first used averages it labelled 38% of the
// pool "Primary Creator". min() makes the weakest required trait the ceiling,
// which is how the role actually works on the floor. Weights sum to 1.0.
const lo = Math.min;
export const ROLE_DEFINITIONS = [
  { role: "Primary Creator",         about: "The offense is run through them; they manufacture shots for themselves and others at high volume.", requires: ["selfCreation", "usageAppetite"],            fit: (o, d, f) => lo(o.selfCreation, o.usageAppetite) * 0.60 + f.creationDependence * 0.40 },
  { role: "Secondary Creator",       about: "Can create a shot when the first option is taken away, without needing the ball to stay useful.",    requires: ["selfCreation", "roleScalability"],          fit: (o, d, f) => lo(o.selfCreation, f.roleScalability) * 0.65 + o.passingVision * 0.35 },
  { role: "Floor General",           about: "Organises the possession: sees the read early, delivers it on time, does not give it away.",         requires: ["passingVision", "ballSecurity"],           fit: (o, d, f) => lo(o.passingVision, o.ballSecurity) * 0.60 + f.connectivity * 0.40 },
  { role: "Movement Shooter",        about: "Generates shooting gravity while moving — off screens, on relocations, never standing still.",        requires: ["spacingGravity", "offBallMovement"],       fit: (o, d, f) => lo(o.spacingGravity, o.offBallMovement) * 0.70 + o.shotSelection * 0.30 },
  { role: "Spot-Up Spacer",          about: "Punishes help by standing still and making the pass-out shot. Costs nothing to play beside.",         requires: ["spacingGravity", "roleScalability"],        fit: (o, d, f) => lo(o.spacingGravity, f.roleScalability) * 0.70 + o.offBallMovement * 0.30 },
  { role: "Slasher",                 about: "Attacks a closing defender off the bounce and finishes or draws help at the rim.",                    requires: ["rimThreat", "selfCreation"],               fit: (o, d, f) => lo(o.rimThreat, o.selfCreation) * 0.65 + o.usageAppetite * 0.35 },
  { role: "Post Hub",                about: "The possession is thrown to them on the block and resolves from there.",                              requires: ["postThreat"],                              fit: (o, d, f) => o.postThreat * 0.60 + lo(o.passingVision, o.rimThreat) * 0.40 },
  { role: "Roll Threat",             about: "Scores off someone else's advantage — rolls, cuts, dives, and finishes what the defence concedes.",   requires: ["rimThreat", "offBallMovement"],            fit: (o, d, f) => lo(o.rimThreat, o.offBallMovement) * 0.65 + f.roleScalability * 0.35 },
  { role: "Stretch Big",             about: "Interior size that also has to be guarded away from the basket.",                                     requires: ["spacingGravity", "interiorDeterrence"],    fit: (o, d, f) => lo(o.spacingGravity, d.interiorDeterrence) * 0.70 + d.defensiveRebounding * 0.30 },
  { role: "Glass Cleaner",           about: "Ends defensive possessions by securing the rebound.",                                                 requires: ["defensiveRebounding"],                     fit: (o, d, f) => d.defensiveRebounding * 0.70 + d.interiorDeterrence * 0.30 },
  { role: "Rim Protector",           about: "Deters and erases shots at the basket. The most portable defensive skill there is.",                  requires: ["rimDeterrence", "interiorDeterrence"],     fit: (o, d, f) => lo(d.rimDeterrence, d.interiorDeterrence) * 0.80 + d.defensiveRebounding * 0.20 },
  { role: "Defensive Anchor",        about: "The defence is organised around them holding the middle of the floor.",                               requires: ["interiorDeterrence", "defensiveRebounding"], fit: (o, d, f) => lo(d.interiorDeterrence, d.defensiveRebounding) * 0.55 + d.rimDeterrence * 0.45 },
  { role: "Point-of-Attack Stopper", about: "Takes the ball-handler and keeps them in front before help is ever needed.",                          requires: ["perimeterContainment"],                    fit: (o, d, f) => d.perimeterContainment * 0.70 + d.schemeVersatility * 0.30 },
  { role: "Wing Stopper",            about: "Guards the opponent's best perimeter scorer with length and position rather than with hands.",        requires: ["wingContainment", "schemeVersatility"],    fit: (o, d, f) => lo(d.wingContainment, d.schemeVersatility) * 0.65 + d.perimeterContainment * 0.35 },
  { role: "Help Defender",           about: "Defends possessions that are not their own — weak-side blocks, rotations, steals in passing lanes.",  requires: ["eventCreation", "schemeVersatility"],      fit: (o, d, f) => lo(d.eventCreation, d.schemeVersatility) * 0.60 + d.rimDeterrence * 0.40 },
  { role: "Connector",               about: "Keeps the ball moving and the spacing honest. Adds value without consuming any.",                     requires: ["connectivity", "roleScalability"],          fit: (o, d, f) => lo(f.connectivity, f.roleScalability) * 0.65 + o.passingVision * 0.35 },
  { role: "Low-Usage Finisher",      about: "Converts what the offence hands them and asks for nothing back.",                                     requires: ["roleScalability", "rimThreat"],             fit: (o, d, f) => lo(f.roleScalability, o.rimThreat) * 0.60 + (10 - o.usageAppetite) * 0.40 },
];

// ── Role calibration (FROZEN CONSTANTS) ───────────────────────────────────────
// Raw role fits are not comparable to each other. This is a database of
// legends: the median card sits near 6 for self-creation and usage but near
// 1.5 for rim deterrence, so an uncalibrated argmax hands "Primary Creator" to
// anyone merely ordinary and reserves "Rim Protector" for the extraordinary.
// Before calibration 149 of 379 profiles came back Primary Creator.
//
// Each role is therefore mapped onto a 0–10 ROLE STRENGTH against two authored
// constants: `floor` (the pool median for that role — genuinely unremarkable
// at it) and `ceiling` (the pool's 95th percentile — definitively that role).
// A calibrated strength answers the question that actually matters: how
// unusual is this player AT THIS ROLE, measured against everyone else in the
// game.
//
// MINIMUM BAND WIDTH. `floor` is the pool median and `ceiling` is the pool's
// 95th percentile OR floor + 2.5, whichever is larger. The guard matters: roles
// the pool barely varies on — Connector spanned 4.6→5.9, Roll Threat 4.3→5.8 —
// turn a tenth of a point into a saturated 10 without it, which is how Mark
// Eaton briefly qualified as a "Roll Threat" and Tayshaun Prince as a "Stretch
// Big". A role the pool cannot separate people on should not hand out strong
// scores for being slightly above average.
//
// THESE NUMBERS ARE FROZEN ON PURPOSE. They were computed once, from the 379-
// card pool on 2026-08-24, and then written down. They are NOT recomputed from
// the live pool at runtime, because a percentile that moves would make role
// labels drift every time a card is added — the same instability that already
// forces the OVR tests to be tolerance-based. Adding cards must not silently
// restate what an existing player IS. Re-derive them deliberately, in a commit
// that says so, if the pool ever changes character.
export const ROLE_CALIBRATION = {
  "Primary Creator":         { floor: 5.5, ceiling: 8.7 },
  "Secondary Creator":       { floor: 4.6, ceiling: 7.1 },
  "Floor General":           { floor: 4.7, ceiling: 7.2 },
  "Movement Shooter":        { floor: 4.5, ceiling: 7.0 },
  "Spot-Up Spacer":          { floor: 3.9, ceiling: 6.4 },
  "Slasher":                 { floor: 4.4, ceiling: 8.2 },
  "Post Hub":                { floor: 3.4, ceiling: 5.9 },
  "Roll Threat":             { floor: 4.3, ceiling: 6.8 },
  "Stretch Big":             { floor: 2.4, ceiling: 4.9 },
  "Glass Cleaner":           { floor: 3.4, ceiling: 8.7 },
  "Rim Protector":           { floor: 2.0, ceiling: 8.2 },
  "Defensive Anchor":        { floor: 1.7, ceiling: 8.4 },
  "Point-of-Attack Stopper": { floor: 3.4, ceiling: 7.6 },
  "Wing Stopper":            { floor: 3.4, ceiling: 7.1 },
  "Help Defender":           { floor: 2.9, ceiling: 6.2 },
  "Connector":               { floor: 4.6, ceiling: 7.1 },
  "Low-Usage Finisher":      { floor: 3.7, ceiling: 6.2 },
};

// A role must reach this calibrated strength to be claimed at all. 5.0 sits
// roughly at the pool's 85th percentile for the role in question.
const ROLE_THRESHOLD = 5.0;

// ── Attribute dictionary ──────────────────────────────────────────────────────
// Every numeric attribute a profile carries, what it means, and what it is NOT.
// Exported so docs and any future UI describe attributes from one source.
export const ATTRIBUTE_DEFINITIONS = {
  // offense
  usageAppetite:        { block: "offense", means: "How much of the offence this player WANTS to consume. Appetite, not entitlement — the finite-usage allocator decides what they actually get." },
  selfCreation:         { block: "offense", means: "Ability to manufacture a good shot with no advantage handed to them." },
  spacingGravity:       { block: "offense", means: "How far from the basket the defence must honour them. Perimeter shot-MAKING skill, not three-point attempt volume." },
  rimThreat:            { block: "offense", means: "Pressure applied at the basket: getting there, and finishing once there." },
  postThreat:           { block: "offense", means: "Scoring value with their back to the basket." },
  passingVision:        { block: "offense", means: "Seeing and delivering the advantage pass on time." },
  offBallMovement:      { block: "offense", means: "Value produced while not holding the ball. The attribute that decides who survives being squeezed." },
  shotSelection:        { block: "offense", means: "How well the shots they take match the shots they can make. Low means volume the efficiency does not support." },
  ballSecurity:         { block: "offense", means: "Keeping possession under pressure." },
  // defense
  perimeterContainment: { block: "defense", means: "Staying in front of a ball-handler at the point of attack." },
  wingContainment:      { block: "defense", means: "Guarding a primary perimeter scorer with length and positioning." },
  interiorDeterrence:   { block: "defense", means: "Making the paint an expensive place to operate." },
  rimDeterrence:        { block: "defense", means: "Deterring and erasing shots at the basket specifically." },
  eventCreation:        { block: "defense", means: "Generating steals and blocks — takeaways, not merely stops. High event creation and high containment are DIFFERENT skills and often trade off." },
  defensiveRebounding:  { block: "defense", means: "Ending the possession by securing the ball." },
  schemeVersatility:    { block: "defense", means: "How many coverages this player can legally be asked to play. Low means scheme-locked, not bad." },
  // fit
  roleScalability:       { block: "fit", means: "How much basketball value survives when this player receives fewer touches and less primary-creation responsibility. Measured from the value that does not require the ball: off-ball shooting, cutting, screening, passing, defence and rebounding. A low score locates a player's value in on-ball creation — it describes where the value is STORED, and makes no claim about the person." },
  spacingContribution:  { block: "fit", means: "How much easier this player makes the floor for the other four." },
  defensiveVersatility: { block: "fit", means: "How many opposing player types they can be assigned to." },
  creationDependence:   { block: "fit", means: "How much of their value evaporates when someone else runs the offence. The inverse pressure to roleScalability." },
  connectivity:         { block: "fit", means: "Keeping the ball and the possession moving — passing plus off-ball plus security." },
};

// Which strengths travel across any environment, and which are priced by it.
// NAMING ONLY — no value is attached to either list here. See the era-
// independence rule at the top of this file.
const PORTABLE_SKILLS = {
  rimDeterrence: "Rim protection is worth roughly the same in every era ever played.",
  defensiveRebounding: "Ending a possession has no era discount.",
  passingVision: "Seeing the floor early travels intact.",
  selfCreation: "Manufacturing a shot from nothing is the least environment-dependent offensive skill.",
  eventCreation: "Takeaways are takeaways.",
  offBallMovement: "Moving usefully without the ball is valuable in any spacing.",
};
const ERA_SENSITIVE_SKILLS = {
  spacingGravity: "Worth far more where the floor is spread and the line is respected; worth much less in a packed paint.",
  postThreat: "Priced by the defensive rules of the era — legal zones and help timing change what a block-up possession is worth.",
  usageAppetite: "A high-appetite scorer is priced by pace and by how many possessions exist to consume.",
  perimeterContainment: "Valued against the era's hand-check rules as much as against the player.",
};

const deepMergeInto = (base, patch, path = [], touched = []) => {
  for (const [k, v] of Object.entries(patch)) {
    const here = [...path, k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      base[k] = base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? base[k] : {};
      deepMergeInto(base[k], v, here, touched);
    } else {
      base[k] = v;
      touched.push(here.join("."));
    }
  }
  return touched;
};

// QUALIFY pool-relative, ORDER absolute.
//
// Calibrated strength answers "is this player unusual at this role?" and is the
// right question for whether a role applies at all — it is the only way to
// compare a rebounding role against a creation role in a pool whose medians
// differ wildly. It is the WRONG question for which role leads, because a role
// the pool barely varies on (Connector spans just 4.6→5.9) turns a small edge
// into a saturated 10, and elite players then tie at 10 across half the
// vocabulary with the winner decided by array order. That is how Bill Russell
// first came back as a "Roll Threat".
//
// So: a role must clear the calibrated bar to be claimed, and among the roles
// that clear it, the ordering is by RAW fit — how strong the role is in
// absolute basketball terms, not how rare it is.
const classifyRolesFrom = (o, d, f) => {
  const scored = ROLE_DEFINITIONS
    .map((rd) => {
      const { floor, ceiling } = ROLE_CALIBRATION[rd.role];
      const raw = Math.round(rd.fit(o, d, f) * 10) / 10;
      return { role: rd.role, raw, strength: r1(((raw - floor) / (ceiling - floor)) * 10), qualifies: false };
    })
    .map((sc) => ({ ...sc, qualifies: sc.strength >= ROLE_THRESHOLD }))
    .sort((a, b) => b.raw - a.raw || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const all = scored.filter((sc) => sc.qualifies).map((sc) => sc.role);
  // A player with no qualifying role is a real thing — a card with no defining
  // skill. Name their strongest anyway so downstream code always has a label,
  // but record plainly that it does not define them.
  const defining = all.length > 0;
  const primary = defining ? all[0] : scored[0].role;
  return { primary, secondary: all.slice(1, 3), all: defining ? all : [primary], defining, scored };
};

// Perimeter shot-making, from evidence rather than inference.
//
// The anchor is keyed on (perimeterSkill × threeVolume) rather than on 3P%
// alone, and that pairing is the whole point. A raw 3P% is unreadable on its
// own: Jerry West has none because the league had no arc, Mark Eaton's is a
// literal .000 on trivial volume, and both would collapse to "cannot shoot" if
// read naively. perimeterSkill is the era-neutral judgement; threeVolume says
// how much the league let him prove it. Only once anchored is a MEASURED
// percentage allowed to move the number, and only when it is meaningful.
const GRAVITY_ANCHOR = {
  ELITE:   { HIGH: 10,  MODERATE: 9,   LOW: 8,   NONE: 8,   NOT_APPLICABLE: 8,   UNKNOWN: 8.5 },
  GOOD:    { HIGH: 8.5, MODERATE: 7.5, LOW: 6.5, NONE: 6.5, NOT_APPLICABLE: 6.5, UNKNOWN: 7 },
  AVERAGE: { HIGH: 5.5, MODERATE: 5,   LOW: 4.5, NONE: 4.5, NOT_APPLICABLE: 4.5, UNKNOWN: 5 },
  LIMITED: { HIGH: 3,   MODERATE: 2.5, LOW: 2,   NONE: 2,   NOT_APPLICABLE: 2,   UNKNOWN: 2.5 },
  NONE:    { HIGH: 1,   MODERATE: 1,   LOW: 1,   NONE: 0.5, NOT_APPLICABLE: 0.5, UNKNOWN: 0.5 },
};
const spacingFromEvidence = (shoot) => {
  const row = GRAVITY_ANCHOR[shoot?.perimeterSkill];
  if (!row) return null;                       // UNKNOWN skill → no evidence, defer to inference
  const anchor = row[shoot.threeVolume] ?? row.UNKNOWN;
  // a meaningful measured percentage nudges around the anchor; .350 is par
  const adj = threePctIsMeaningful(shoot) ? (shoot.threePct - 0.35) * 20 : 0;
  return clamp10(anchor + adj);
};

/**
 * Build the intelligence profile for one player entry.
 *
 * @param p   a PLAYERS entry
 * @param ctx accepted and DELIBERATELY IGNORED. It exists so that callers which
 *            already thread a game context do not have to special-case this
 *            layer, and so that the era-independence test has something real to
 *            vary. If you ever find yourself reading ctx.era in here, the
 *            feature has gone wrong — put it in the Era Style engine instead.
 */
export const buildIntelligence = (p, ctx = {}) => {
  void ctx; // era independence: never read. See module header.
  const dna = playerDNA(p);
  const personId = personIdForCard(p.id);
  const shoot = shootingFor(personId);

  // ── derive ──────────────────────────────────────────────────────────────────
  const offense = {
    usageAppetite: r1(dna.usageTendency),
    selfCreation: r1(dna.creation),
    // Evidence-first. Where a verified shooting record exists it ANCHORS the
    // value, because "position, decade, and scoring volume" cannot tell Dennis
    // Rodman from Dražen Petrović. Falls back to the DNA inference otherwise.
    spacingGravity: r1(spacingFromEvidence(shoot) ?? (dna.outsideShooting * 0.7 + dna.threeTendency * 0.3)),
    rimThreat: r1(dna.rimPressure * 0.6 + dna.finishing * 0.4),
    postThreat: r1(dna.postScoring),
    passingVision: r1(dna.passing * 0.75 + dna.iq * 0.25),
    offBallMovement: r1(dna.offBall),
    // No shooting-split data exists, so "did the shots match the skill?" is the
    // single weakest derived attribute in the file. It leans on IQ and ball
    // security and is the field curation most often has to correct.
    shotSelection: r1(4 + (dna.creation - dna.usageTendency) * 0.5 + dna.iq * 0.35 + dna.ballSecurity * 0.15),
    ballSecurity: r1(dna.ballSecurity),
  };
  const defense = {
    perimeterContainment: r1(dna.poaDef),
    wingContainment: r1(dna.wingDef),
    interiorDeterrence: r1(dna.interiorDef),
    rimDeterrence: r1(dna.rimProtection),
    eventCreation: r1(dna.defPlaymaking),
    defensiveRebounding: r1(dna.defReb),
    schemeVersatility: r1(dna.switchability * 0.6 + dna.helpDef * 0.4),
  };
  // ── pre-1974 defensive floors ───────────────────────────────────────────────
  // Steals and blocks were not recorded until 1973-74, so these three
  // attributes derive from zeroes for every earlier card — which is how Bill
  // Russell arrived at an event-creation rating of 0.0. The review in
  // data/preRecordingDefense.js supplies a categorical BAND per player, and the
  // band lifts the derived value to a floor. A floor says "at least this good";
  // it never claims a steal or block rate, because no such rate was ever
  // measured. Curation still overrides afterwards.
  const preDef = preRecordingDefense(p.id);
  if (preDef) {
    defense.eventCreation = r1(Math.max(defense.eventCreation, BAND_FLOOR[preDef.eventCreationBand]));
    defense.interiorDeterrence = r1(Math.max(defense.interiorDeterrence, BAND_FLOOR[preDef.interiorBand]));
    defense.perimeterContainment = r1(Math.max(defense.perimeterContainment, BAND_FLOOR[preDef.perimeterBand]));
  }

  const fit = {
    roleScalability: r1(dna.offBall * 0.5 + (10 - dna.ballDominance) * 0.28 + (10 - dna.usageTendency) * 0.14 + dna.iq * 0.08),
    spacingContribution: r1(dna.outsideShooting * 0.6 + dna.threeTendency * 0.25 + dna.offBall * 0.15),
    defensiveVersatility: r1(dna.switchability * 0.5 + dna.wingDef * 0.25 + dna.poaDef * 0.15 + dna.interiorDef * 0.1),
    creationDependence: r1(dna.ballDominance * 0.6 + dna.usageTendency * 0.25 + (10 - dna.offBall) * 0.15),
    connectivity: r1(dna.passing * 0.45 + dna.offBall * 0.3 + dna.ballSecurity * 0.25),
  };

  const profile = {
    id: p.id, name: p.name, decade: p.decade, pos: p.pos, positions: [...p.positions],
    // The HUMAN this card depicts. Cards are player-decades; people are people.
    personId,
    // Verified where a real source exists, null everywhere else. NEVER
    // estimated from position, era, or height — a plausible measurement is
    // still a fabricated one, and it would read like a record. Wingspan in
    // particular is null for everyone: no accessible source publishes it for
    // historical players, and it is not derivable from height (its whole value
    // is that it diverges from height).
    physical: physicalFor(personId),
    // Measured splits + evidence-backed categorical identity. See data/shooting.js
    // for the pre-three-point rule — a null threePct is UNDEFINED, not zero.
    shooting: shoot,
    roles: null, // filled after curation so corrections propagate into classification
    offense, defense, fit,
    eraTranslation: null,
    provenance: null,
    confidence: null,
  };

  // ── curate ──────────────────────────────────────────────────────────────────
  const curated = CURATED[p.id] || null;
  const curatedFields = [];
  let curatedNote = null;
  if (curated) {
    const { note, roles: curatedRoles, ...attrPatch } = curated;
    curatedNote = note || null;
    deepMergeInto(profile, attrPatch, [], curatedFields);
    // roles are classified AFTER attribute curation, then overridden if the
    // curator named them explicitly
    profile.roles = classifyRolesFrom(profile.offense, profile.defense, profile.fit);
    if (curatedRoles) {
      // A curator may assert a role the derivation cannot see — Prince's Wing
      // Stopper is invisible to a formula reading a 0.6 steal rate. So the
      // claimed set is the UNION of what qualified and what was asserted, and
      // `defining` becomes true because a human vouched for it. Uncurated
      // profiles keep the strict invariant: all === the qualifying set.
      const primary = curatedRoles.primary || profile.roles.primary;
      const secondary = (curatedRoles.secondary || profile.roles.secondary).filter((r) => r !== primary);
      const qualified = profile.roles.defining ? profile.roles.all : [];
      const all = [...new Set([primary, ...secondary, ...qualified])];
      profile.roles = { ...profile.roles, primary, secondary, all, defining: true };
      curatedFields.push("roles.primary", "roles.secondary");
    }
  } else {
    profile.roles = classifyRolesFrom(profile.offense, profile.defense, profile.fit);
  }

  // ── era translation (names, never prices) ───────────────────────────────────
  const strong = (obj, k) => (obj[k] ?? 0) >= 7;
  const merged = { ...profile.offense, ...profile.defense, ...profile.fit };
  profile.eraTranslation = {
    portable: Object.keys(PORTABLE_SKILLS).filter((k) => strong(merged, k)).map((k) => ({ skill: k, why: PORTABLE_SKILLS[k] })),
    eraSensitive: Object.keys(ERA_SENSITIVE_SKILLS).filter((k) => strong(merged, k)).map((k) => ({ skill: k, why: ERA_SENSITIVE_SKILLS[k] })),
    note:
      "These lists NAME which of this player's strengths are environment-sensitive. " +
      "They attach no value and apply no bonus — what a skill is worth tonight is the " +
      "Era Style engine's decision, not this layer's.",
  };

  // ── provenance & confidence ─────────────────────────────────────────────────
  const rawPhysical = profile.physical;
  const stlBlkUnrecorded = String(dna.provenance.confidence.stlBlkCapabilities).startsWith("LOW");
  const shootingConfidence = dna.provenance.confidence.shooting; // HIGH when curated attrs exist
  profile.provenance = {
    derivedFrom: "playerProfile.playerDNA — VERIFIED production + CALCULATED era normalization + INFERRED priors",
    dnaProvenance: dna.provenance,
    humanReviewed: Boolean(curated),
    curatedFields: curatedFields.sort(),
    curatorNote: curatedNote,
    physical: rawPhysical.heightIn == null
      ? "ABSENT — no verified measurement on file for this person. Values stay null rather than being estimated from position or era."
      : `VERIFIED — ${rawPhysical.source} (source tier ${rawPhysical.sourceTier}, read ${rawPhysical.verifiedOn}). LISTED roster measurement, not biomechanical truth. Wingspan remains null: not published, and never inferred from height.`,
    shooting: shoot.source
      ? `MEASURED SPLITS (${shoot.precision}) — ${shoot.source}, read ${shoot.verifiedOn}; scope ${shoot.scope}. Categorical identity from the documented playing record.`
      : "CATEGORICAL ONLY — no measured splits obtained. Shooting attributes fall back to the position/era/volume inference in playerProfile.js.",
    statBasis: statBasisFor(p.id),
    preRecordingDefense: preDef
      ? `REVIEWED (${preDef.evidence}) — steals and blocks were unrecorded in this era, so defensive attributes carry a categorical BAND floor rather than a fabricated rate. interior=${preDef.interiorBand} perimeter=${preDef.perimeterBand} events=${preDef.eventCreationBand}.`
      : null,
    eraIndependence: "Computed without reference to any game era. No era bonuses, multipliers, or branches exist in this layer.",
    engineUse: "NONE — no simulation module imports this file. Profiles do not affect game outcomes.",
  };
  profile.confidence = {
    offense: curated ? "HIGH (human-reviewed)" : shootingConfidence === "HIGH" ? "MEDIUM-HIGH" : "MEDIUM-LOW (no shooting-split data; spacing and shot selection are inferred)",
    defense: curated ? "HIGH (human-reviewed)" : stlBlkUnrecorded ? "LOW (pre-1974: steals and blocks were never officially recorded)" : "MEDIUM",
    roles: curated ? "HIGH (human-reviewed)" : "MEDIUM (classified from derived attributes)",
    physical: rawPhysical.confidence,
    shooting: shoot.confidence,
    overall: curated ? "HIGH" : stlBlkUnrecorded ? "LOW-MEDIUM" : shootingConfidence === "HIGH" ? "MEDIUM-HIGH" : "MEDIUM-LOW",
  };

  return profile;
};

// ── Validation ────────────────────────────────────────────────────────────────
const NUM_BLOCKS = ["offense", "defense", "fit"];
export const validateIntelligence = (profile) => {
  const errors = [];
  const e = (msg) => errors.push(msg);
  if (!profile || typeof profile !== "object") return { valid: false, errors: ["profile is not an object"] };
  for (const k of ["id", "name", "decade", "pos"]) if (typeof profile[k] !== "string" || !profile[k]) e(`${k} missing`);
  if (!Array.isArray(profile.positions) || !profile.positions.length) e("positions missing");
  else if (!profile.positions.includes(profile.pos)) e("pos not present in positions");

  // Physical: a measurement may exist ONLY with provenance behind it. The rule
  // is not "no numbers" — it is "no unsourced numbers". An unattributed height
  // is indistinguishable from an invented one, so it is rejected outright.
  const ph = profile.physical;
  if (!ph || typeof ph !== "object") e("physical block missing");
  else {
    for (const k of ["heightIn", "weightLb", "wingspanIn"]) if (!(k in ph)) e(`physical.${k} missing`);
    // wingspan is never populated: not published for historical players, and
    // NEVER derivable from height. Inferring it would fabricate the single
    // number a consumer would most want to trust.
    if (ph.wingspanIn !== null) e("physical.wingspanIn must be null — no accessible source publishes it, and it must never be inferred from height");
    for (const [k, lo, hi] of [["heightIn", 60, 96], ["weightLb", 120, 400]]) {
      const v = ph[k];
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) e(`physical.${k} is not a finite number`);
      else if (v < lo || v > hi) e(`physical.${k}=${v} outside the plausible range ${lo}–${hi}`);
      else if (!ph.source || !ph.sourceTier || !ph.verifiedOn) e(`physical.${k} is populated but carries no source/tier/date — unsourced measurements are rejected`);
    }
    if (ph.heightIn === null && ph.basis !== "UNVERIFIED") e("physical.basis must be UNVERIFIED when no measurement is on file");
  }

  // Shooting: percentages are fractions, and the pre-three-point rule is
  // structural — an era of NONE must not carry a three-point percentage at all.
  const sh = profile.shooting;
  if (!sh || typeof sh !== "object") e("shooting block missing");
  else {
    for (const k of ["fgPct", "threePct", "ftPct"]) {
      const v = sh[k];
      if (v === null || v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) e(`shooting.${k} is not a finite number`);
      else if (v < 0 || v > 1) e(`shooting.${k}=${v} is not a fraction between 0 and 1`);
    }
    if (!["FULL", "PARTIAL", "NONE", "UNKNOWN"].includes(sh.threePointEra)) e(`shooting.threePointEra "${sh.threePointEra}" is not a recognised value`);
    if (sh.threePointEra === "NONE") {
      if (sh.threePct !== null) e("shooting.threePct must be null when the three-point line did not exist — undefined is not zero");
      if (sh.threeVolume !== "NOT_APPLICABLE") e("shooting.threeVolume must be NOT_APPLICABLE in a pre-three-point era");
    }
    if (!["ELITE", "GOOD", "AVERAGE", "LIMITED", "NONE", "UNKNOWN"].includes(sh.perimeterSkill)) e(`shooting.perimeterSkill "${sh.perimeterSkill}" is not a recognised value`);
    if (sh.identity != null && !SHOOTING_IDENTITY.includes(sh.identity)) e(`shooting.identity "${sh.identity}" is not in the identity vocabulary`);
  }

  if (typeof profile.personId !== "string" || !profile.personId) e("personId missing");

  for (const block of NUM_BLOCKS) {
    const b = profile[block];
    if (!b || typeof b !== "object") { e(`${block} block missing`); continue; }
    for (const [k, v] of Object.entries(b)) {
      if (!(k in ATTRIBUTE_DEFINITIONS)) e(`${block}.${k} is not a defined attribute`);
      if (typeof v !== "number" || !Number.isFinite(v)) e(`${block}.${k} is not a finite number`);
      else if (v < 0 || v > 10) e(`${block}.${k}=${v} out of range 0–10`);
    }
  }
  // every defined attribute must actually be present in its block
  for (const [k, def] of Object.entries(ATTRIBUTE_DEFINITIONS)) {
    if (!profile[def.block] || !(k in profile[def.block])) e(`${def.block}.${k} missing`);
  }

  const r = profile.roles;
  if (!r || typeof r !== "object") e("roles block missing");
  else {
    if (!ROLES.includes(r.primary)) e(`roles.primary "${r.primary}" is not in the role vocabulary`);
    if (!Array.isArray(r.all) || !r.all.length) e("roles.all missing or empty");
    else {
      for (const role of r.all) if (!ROLES.includes(role)) e(`roles.all contains unknown role "${role}"`);
      if (!r.all.includes(r.primary)) e("roles.primary is not listed in roles.all");
    }
    if (!Array.isArray(r.secondary)) e("roles.secondary missing");
    else for (const role of r.secondary) {
      if (!ROLES.includes(role)) e(`roles.secondary contains unknown role "${role}"`);
      if (Array.isArray(r.all) && !r.all.includes(role)) e(`roles.secondary "${role}" not listed in roles.all`);
      if (role === r.primary) e("roles.secondary repeats the primary role");
    }
  }

  const et = profile.eraTranslation;
  if (!et || !Array.isArray(et.portable) || !Array.isArray(et.eraSensitive)) e("eraTranslation block malformed");

  const pv = profile.provenance;
  if (!pv || typeof pv !== "object") e("provenance block missing");
  else {
    if (typeof pv.humanReviewed !== "boolean") e("provenance.humanReviewed missing");
    if (!Array.isArray(pv.curatedFields)) e("provenance.curatedFields missing");
    if (!pv.dnaProvenance) e("provenance.dnaProvenance missing");
    for (const k of ["derivedFrom", "physical", "eraIndependence", "engineUse"]) if (!pv[k]) e(`provenance.${k} missing`);
  }
  const cf = profile.confidence;
  if (!cf || typeof cf !== "object") e("confidence block missing");
  else for (const k of ["offense", "defense", "roles", "physical", "shooting", "overall"]) if (!cf[k]) e(`confidence.${k} missing`);

  return { valid: errors.length === 0, errors };
};

// ── Convenience ───────────────────────────────────────────────────────────────
export const intelligenceFor = (id, ctx) => {
  const p = PLAYERS.find((x) => x.id === id);
  return p ? buildIntelligence(p, ctx) : null;
};
export const allIntelligence = (ctx) => PLAYERS.map((p) => buildIntelligence(p, ctx));
