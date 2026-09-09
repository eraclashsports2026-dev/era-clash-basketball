// ── Curated Player Intelligence (HUMAN_REVIEWED overlay) ──────────────────────
// buildIntelligence() DERIVES a full profile for all 379 player-decades from
// DNA (src/v3/playerProfile.js). This file corrects that derivation where a
// documented basketball fact contradicts it. Entries here are deep-merged OVER
// the derived profile, leaf by leaf, and every field set here is recorded in
// provenance.curatedFields — so a reader can always see which numbers were
// judged by a human and which fell out of a formula.
//
// WHY AN OVERLAY AND NOT A REWRITE
// ─────────────────────────────────
// The derivation is honest but blunt. It reads capability out of box-score
// production plus accolade pedigree, and accolade pedigree is positionally
// naive: an award-laden interior defender picks up perimeter-defense credit
// because the formula cannot tell WHERE the defense happened. Mark Eaton is
// the clearest case — two Defensive Player of the Year awards and five
// All-Defensive teams push his derived wing defense to 7.4 and his derived
// switchability to 5.6, when the actual player was a 7'4" drop-coverage
// anchor who could not stay in front of a guard. Curation fixes the location
// of his defense without touching its magnitude.
//
// RULES FOR ADDING AN ENTRY
// ─────────────────────────
// 1. Only set a field you can defend from the documented record. Absence is
//    allowed and preferred over a guess — an unset field keeps the derived
//    value and its (lower) confidence rating.
// 2. NEVER set physical.heightIn / weightLb / wingspanIn. The trusted dataset
//    contains no measurements, and inventing them would launder a guess into
//    something that reads like a record. They stay null until a verified
//    measurement source is imported. This is enforced by validateIntelligence.
// 3. No era bonuses. Nothing in this file may reference the era a game is
//    played in. A profile describes the player; the Era Style engine decides
//    what that player's strengths are worth on a given night.
// 4. `note` is required and should say what the derivation got wrong, or what
//    it could not have known.
//
// Coverage: 11 of 379 (2.9%). These are the profile anchors — the players the
// role vocabulary and the fit attributes were calibrated against. Extending
// coverage is a data task, not something to auto-generate.

const CURATED = {
  // ═══ 1960s ═══
  "walt-b-60s": {
    roles: { primary: "Post Hub", secondary: ["Glass Cleaner", "Roll Threat"] },
    offense: { postThreat: 8, rimThreat: 8, selfCreation: 6, passingVision: 3, spacingGravity: 0 },
    defense: { interiorDeterrence: 5, rimDeterrence: 5, defensiveRebounding: 8, schemeVersatility: 2 },
    fit: { roleScalability: 5, spacingContribution: 1 },
    note:
      "Rookie of the Year 1961-62 at 31.6 points and 19.0 rebounds — one of the largest rookie " +
      "seasons on record — and a durable, highly efficient interior scorer for the rest of the " +
      "decade. The derivation cannot see the well-documented gap between his scoring and his " +
      "defensive impact: he was never an All-Defensive selection or a feared anchor despite his " +
      "size, so interior deterrence is set below what his rebounding volume alone would imply. " +
      "Blocks and steals did not exist as statistics in his era, so nothing here is measured.",
  },

  // ═══ 1970s ═══
  "tiny-70s": {
    roles: { primary: "Primary Creator", secondary: ["Floor General", "Slasher"] },
    offense: { usageAppetite: 9, selfCreation: 8, passingVision: 10, offBallMovement: 3, rimThreat: 8 },
    defense: { perimeterContainment: 3, interiorDeterrence: 1, rimDeterrence: 0, schemeVersatility: 2 },
    fit: { roleScalability: 2, creationDependence: 9, connectivity: 7 },
    note:
      "In 1972-73 he led the NBA in both points per game and assists per game — still the only " +
      "player ever to do it. That is the signature of total offensive dependence, not of a " +
      "connector: the offense existed in his hands. Role acceptance is set low deliberately. At " +
      "6'1\" and about 160 pounds he gave the possession back on defense, which the accolade-blind " +
      "derivation already gets roughly right.",
  },

  // ═══ 1980s ═══
  "eaton-80s": {
    roles: { primary: "Rim Protector", secondary: ["Defensive Anchor", "Glass Cleaner"] },
    offense: { usageAppetite: 1, selfCreation: 1, spacingGravity: 0, postThreat: 3, rimThreat: 4, shotSelection: 7 },
    defense: {
      perimeterContainment: 1, wingContainment: 2, interiorDeterrence: 10,
      rimDeterrence: 10, schemeVersatility: 1, defensiveRebounding: 7,
    },
    fit: { roleScalability: 9, defensiveVersatility: 2, spacingContribution: 0, creationDependence: 1 },
    note:
      "THE CORRECTION CASE. Two-time Defensive Player of the Year, five All-Defensive teams, and " +
      "the single-season blocks record (5.6 per game, 1984-85) give him enormous defensive " +
      "pedigree, and the derivation spreads that pedigree across the whole defensive profile — " +
      "landing on 7.4 wing containment and 5.6 scheme versatility. Both are wrong in kind rather " +
      "than degree. He was a 7'4\" drop anchor who protected one area of the floor better than " +
      "almost anyone and could not switch, hedge, or contain a guard at all. Magnitude kept, " +
      "location fixed. Role acceptance is high on the record: he started for a decade while " +
      "taking roughly six shots a game.",
  },
  "nance-80s": {
    roles: { primary: "Roll Threat", secondary: ["Help Defender", "Rim Protector"] },
    offense: { rimThreat: 8, shotSelection: 8, spacingGravity: 3, postThreat: 4 },
    defense: { rimDeterrence: 7, interiorDeterrence: 6, eventCreation: 6, schemeVersatility: 5 },
    fit: { roleScalability: 7, defensiveVersatility: 6 },
    note:
      "An exceptionally efficient vertical finisher — the first Slam Dunk Contest champion (1984) " +
      "— paired with real weak-side shot-blocking for a power forward. DATA FLAG: this card " +
      "records ad1:0, but Nance was named to the All-Defensive First Team for 1988-89 (verified " +
      "against that season's award page), a season inside his 1980s window. The card understates " +
      "his defensive pedigree; correcting players.js is out of scope for this layer, so the " +
      "curated defensive values here reflect the verified record instead.",
  },

  // ═══ 1990s ═══
  "mullin-90s": {
    roles: { primary: "Movement Shooter", secondary: ["Secondary Creator", "Connector"] },
    offense: { spacingGravity: 9, offBallMovement: 8, passingVision: 7, shotSelection: 9, selfCreation: 6 },
    defense: { perimeterContainment: 4, eventCreation: 6, schemeVersatility: 4, rimDeterrence: 1 },
    fit: { roleScalability: 7, spacingContribution: 9, connectivity: 8, creationDependence: 4 },
    note:
      "The card is a decade average and therefore includes his Indiana decline, which drags the " +
      "derived shooting and creation numbers well below the player who made All-NBA First Team in " +
      "1991-92. Curated values describe the skill, not the ten-year mean: one of the purest " +
      "left-handed strokes of the era, genuinely elite relocation and footwork off the ball, and " +
      "a better passer than a scorer's box score suggests. Active hands (2.1 steals per game in " +
      "1990-91 and 1991-92) without lateral quickness — event creation high, containment ordinary.",
  },
  "glen-90s": {
    roles: { primary: "Spot-Up Spacer", secondary: ["Movement Shooter"] },
    offense: { spacingGravity: 9, offBallMovement: 7, passingVision: 3, selfCreation: 5, shotSelection: 7 },
    defense: { perimeterContainment: 3, wingContainment: 4, eventCreation: 3, schemeVersatility: 4 },
    fit: { roleScalability: 8, spacingContribution: 9, creationDependence: 3 },
    note:
      "A catch-and-shoot marksman with forward size — the skill that most obviously gains value " +
      "in a high-spacing environment and most obviously loses it in a packed-paint one. That " +
      "swing is precisely what this layer refuses to price: spacing gravity is recorded as the " +
      "skill it is, and the Era Style engine decides what it is worth. Defensively indifferent " +
      "for most of the decade.",
  },
  "petrovic-90s": {
    roles: { primary: "Movement Shooter", secondary: ["Secondary Creator", "Spot-Up Spacer"] },
    offense: { spacingGravity: 9, offBallMovement: 8, selfCreation: 7, shotSelection: 8, usageAppetite: 7 },
    defense: { perimeterContainment: 3, wingContainment: 3, schemeVersatility: 3, rimDeterrence: 0 },
    fit: { roleScalability: 7, spacingContribution: 9, creationDependence: 4 },
    note:
      "Only three NBA seasons fall inside this card and the first is a bench year in Portland, so " +
      "the decade mean (17.7 points) badly understates the 22.3-point All-NBA Third Team player " +
      "of 1992-93. Curated values describe that player: elite off-screen footwork, a lightning " +
      "release, and shot-making confidence far beyond his usage. Defense was the acknowledged " +
      "hole. His career ended with his death in June 1993, so there is no later record to weigh.",
  },

  // ═══ 2000s ═══
  "prince-00s": {
    roles: { primary: "Wing Stopper", secondary: ["Connector", "Low-Usage Finisher"] },
    offense: { usageAppetite: 4, selfCreation: 4, shotSelection: 8, passingVision: 6, offBallMovement: 7 },
    defense: {
      perimeterContainment: 7, wingContainment: 8, interiorDeterrence: 4,
      eventCreation: 4, schemeVersatility: 7,
    },
    fit: { roleScalability: 9, defensiveVersatility: 8, connectivity: 7, creationDependence: 3 },
    note:
      "Four consecutive All-Defensive Second Teams (2004-05 through 2007-08, each verified against " +
      "its season award page) as a 6'9\" wing who took the opponent's best perimeter scorer. The " +
      "derivation cannot see this at all: his steal rate is only 0.6 per game, because length and " +
      "positional discipline suppress events rather than generate them, and All-Defensive Second " +
      "Team pedigree is weighted lightly. Event creation is left low on purpose — that part is " +
      "accurate — while containment is raised to match the record. Role acceptance is the highest " +
      "in this file alongside Eaton: a starter on a championship team at roughly ten shots a game.",
  },
  "finley-00s": {
    roles: { primary: "Spot-Up Spacer", secondary: ["Secondary Creator", "Connector"] },
    offense: { spacingGravity: 7, offBallMovement: 7, selfCreation: 6, shotSelection: 7, usageAppetite: 5 },
    defense: { perimeterContainment: 4, wingContainment: 5, schemeVersatility: 4 },
    fit: { roleScalability: 8, spacingContribution: 7, creationDependence: 4, connectivity: 6 },
    note:
      "The demonstrated role-change case, and the reason role acceptance is a measured attribute " +
      "rather than a personality guess. He opened the decade as Dallas's 21.5-point first option " +
      "and closed it as a San Antonio spot-up wing at nine points a game — winning the 2007 title " +
      "in that reduced role. A player who has actually survived that compression is worth more to " +
      "a crowded lineup than his averages suggest, which is exactly what the finite-usage " +
      "allocation in roles.js is built to reward.",
  },
  "joshsmith-00s": {
    roles: { primary: "Help Defender", secondary: ["Roll Threat", "Slasher"] },
    offense: { spacingGravity: 2, shotSelection: 2, rimThreat: 8, passingVision: 6, usageAppetite: 6 },
    defense: { rimDeterrence: 8, interiorDeterrence: 7, eventCreation: 8, schemeVersatility: 6, wingContainment: 6 },
    fit: { roleScalability: 5, defensiveVersatility: 7, spacingContribution: 2 },
    note:
      "2.3 blocks per game as a forward, from weak-side help rather than from anchoring — a " +
      "genuinely rare and portable defensive skill, and an All-Defensive Second Team in 2009-10. " +
      "The single most important curated field on this profile is shot selection, set to 2. His " +
      "well-documented habit of settling for long two-point jumpers he could not make is invisible " +
      "to a dataset with no shooting splits, and it is the difference between the player his " +
      "counting stats describe and the player teams actually got.",
  },
  "gwallace-00s": {
    roles: { primary: "Help Defender", secondary: ["Wing Stopper", "Slasher"] },
    offense: { rimThreat: 7, spacingGravity: 4, selfCreation: 5, shotSelection: 5, usageAppetite: 6 },
    defense: {
      perimeterContainment: 7, wingContainment: 8, eventCreation: 9,
      interiorDeterrence: 5, rimDeterrence: 5, schemeVersatility: 7, defensiveRebounding: 7,
    },
    fit: { roleScalability: 6, defensiveVersatility: 8, spacingContribution: 4 },
    note:
      "Led the NBA in steals in 2005-06 and made the All-Defensive First Team in 2009-10 while " +
      "blocking about a shot a game as a wing — an event-generation profile almost no forward " +
      "matches. Like Mullin's, his decade mean is depressed by three low-minute Sacramento bench " +
      "years at the start, so curated values describe the Charlotte player the honours were won " +
      "by. High-variance, gambling style: event creation is set very high and containment " +
      "deliberately lower, because the two are not the same skill and he was far better at one.",
  },

  // ═══ PHASE 2B RISK-BASED REVIEW SET ═══════════════════════════════════════
  // Chosen where the generic formulas are most likely to be WRONG, not where
  // the players are most famous. Each override is kept narrow: only the fields
  // the derivation actually gets wrong are touched.

  // ── Category: pre-1974 data uncertainty ─────────────────────────────────────
  // The single largest systematic error in the derived model. The NBA did not
  // record steals or blocks until 1973-74, so every player who retired before
  // then carries stl=0.0 and blk=0.0 in the trusted dataset — and the formula
  // reads "no recorded events" as "no events". Bill Russell, the most feared
  // shot-blocker who ever lived, derives an eventCreation of 0.0. That is not a
  // low rating, it is a missing-data artefact wearing a rating's clothes.
  // These entries restore the documented defensive record. They do NOT invent
  // per-game rates — no number here claims to be a measurement, and confidence
  // stays governed by the pre-1974 rule.
  "bill-60s": {
    defense: { eventCreation: 10, rimDeterrence: 10, interiorDeterrence: 10, schemeVersatility: 6, defensiveRebounding: 10 },
    fit: { defensiveVersatility: 7 },
    note:
      "Blocks were not a recorded statistic until 1973-74; Russell retired in 1969, so his card carries blk 0.0 and the " +
      "derivation returns eventCreation 0.0 — for the defining shot-blocker in the sport's history, eleven championships " +
      "in thirteen years, and a defensive reputation no contemporary disputes. The correction restores the documented " +
      "record rather than inventing a per-game rate: no value here is presented as measured.",
  },
  "wilt-60s": {
    defense: { eventCreation: 9, rimDeterrence: 9, interiorDeterrence: 9 },
    note: "Same pre-1974 recording gap as Russell. Blocks unrecorded for his entire 1960s peak; the derived 0.0 is an artefact, not a rating.",
  },
  "jerry-60s": {
    defense: { eventCreation: 7, perimeterContainment: 7 },
    note:
      "Pre-1974 gap again. West led the NBA in steals in 1973-74 — the first season the league recorded them — at age 35 " +
      "and in his final year. That single data point sits outside this card's decade and says plainly that the derived 0.0 " +
      "measures the record-keeping, not the player.",
  },
  "oscar-60s": { defense: { eventCreation: 5 }, note: "Pre-1974 recording gap; a strong, physical guard defender rather than a specialist. Derived 0.0 is an artefact." },
  "elgin-60s": { defense: { eventCreation: 4 }, note: "Pre-1974 recording gap. Derived 0.0 is an artefact of the era's record-keeping." },
  "cousy-50s": { defense: { eventCreation: 4 }, note: "Pre-1974 recording gap. Derived 0.0 is an artefact; Cousy was an active if undersized defender." },

  // ── Category: unique bigs (post play read as slashing or rebounding) ────────
  // The role formulas rank on raw fit, and a dominant interior scorer scores
  // highly on Slasher (rim threat plus usage) and on Glass Cleaner (rebounds)
  // before Post Hub, because post play is the pool's least-varying dimension.
  // The magnitudes are right; the LABEL is wrong, and the label is what the
  // later Coach and Matchup layers will switch on.
  "shaq-00s": {
    roles: { primary: "Post Hub", secondary: ["Rim Protector", "Glass Cleaner"] },
    offense: { postThreat: 10 },
    note: "Derived as a 'Slasher' — a 325-pound centre whose offence was the most physically dominant back-to-the-basket game on record. Rim threat plus usage outscored post play because the pool barely varies on postThreat. Label corrected, magnitudes untouched.",
  },
  "kareem-70s": {
    roles: { primary: "Post Hub", secondary: ["Rim Protector", "Defensive Anchor"] },
    offense: { postThreat: 10 },
    note: "Same mislabel as O'Neal. The skyhook is the most durable post shot in basketball history and the derivation called him a Slasher.",
  },
  "duncan-00s": {
    roles: { primary: "Defensive Anchor", secondary: ["Post Hub", "Rim Protector"] },
    offense: { postThreat: 9 },
    defense: { schemeVersatility: 7 },
    note: "Derived as a 'Glass Cleaner'. Rebounding was a consequence of his positioning, not his identity: San Antonio's defence was built around him holding the middle for nineteen years.",
  },
  "hak-90s": {
    roles: { primary: "Post Hub", secondary: ["Rim Protector", "Defensive Anchor"] },
    offense: { postThreat: 10 },
    note: "The one big whose derived defensive event creation is already right (8.9, from genuinely recorded blocks and steals). Only the offensive label needed fixing.",
  },
  "jokic-20s": {
    roles: { primary: "Post Hub", secondary: ["Floor General", "Primary Creator"] },
    offense: { postThreat: 9, passingVision: 10 },
    fit: { connectivity: 10 },
    note:
      "Derived as a 'Glass Cleaner', which is the least informative true thing that can be said about him. He is the offence: " +
      "a post hub whose passing runs a championship system. This is the clearest case in the pool of rebounding volume " +
      "outranking the thing the player is actually for.",
  },
  "kg-00s": {
    roles: { primary: "Defensive Anchor", secondary: ["Glass Cleaner", "Help Defender"] },
    defense: { schemeVersatility: 8, eventCreation: 7 },
    fit: { defensiveVersatility: 9 },
    note: "Derived as a 'Glass Cleaner'. Garnett's value was defensive command of the whole floor — switching, hedging, and covering ground no big of his era could — which the rebounding-first label buries.",
  },
  "ben-00s": {
    roles: { primary: "Defensive Anchor", secondary: ["Rim Protector", "Glass Cleaner"] },
    defense: { schemeVersatility: 7 },
    fit: { roleScalability: 8 },
    note: "Four-time Defensive Player of the Year at 6'9\" playing centre. Role scalability is genuinely elite: he anchored a championship offence while being unplayable in a half-court set — his entire value survives zero touches.",
  },
  "bam-20s": {
    roles: { primary: "Defensive Anchor", secondary: ["Roll Threat", "Help Defender"] },
    defense: { schemeVersatility: 10, perimeterContainment: 7 },
    fit: { defensiveVersatility: 10 },
    note: "The modern switch big. Scheme versatility is his defining attribute and the derivation cannot see it: guarding a point guard on a switch leaves no statistical trace in a box score.",
  },

  // ── Category: nontraditional creators ───────────────────────────────────────
  "lebron-10s": {
    roles: { primary: "Primary Creator", secondary: ["Slasher", "Floor General"] },
    note: "Derived as a 'Slasher' because rim threat and usage both max out. True but incomplete — he is the offence's initiator, and a later Coach layer switching on 'Slasher' would deploy him wrongly.",
  },
  "draymond-10s": {
    roles: { primary: "Help Defender", secondary: ["Connector", "Defensive Anchor"] },
    defense: { schemeVersatility: 10, eventCreation: 7 },
    offense: { passingVision: 9, postThreat: 2 },
    fit: { defensiveVersatility: 10, connectivity: 9, roleScalability: 8 },
    note:
      "A 6'6\" player who defends centres and initiates offence. Nothing in a box score expresses that. His derived spacing " +
      "gravity (1.9) is correct and should stay low — the point is that his value is entirely in the two dimensions the " +
      "formulas are worst at: defensive versatility and connective passing.",
  },
  "magic-80s": {
    offense: { postThreat: 7 },
    defense: { defensiveRebounding: 8 },
    fit: { connectivity: 10 },
    note: "A 6'9\" point guard who posted up smaller guards and rebounded like a forward. Position-keyed priors assume neither.",
  },

  // ── Category: movement & gravity ────────────────────────────────────────────
  "curry-10s": {
    offense: { offBallMovement: 10 },
    fit: { spacingContribution: 10, roleScalability: 8 },
    note:
      "The derivation already reaches spacingGravity 10 from the verified shooting evidence, so only the off-ball and " +
      "team-spacing terms needed lifting. His gravity operates while moving and without the ball, which is why his role " +
      "scalability is far higher than a usage-based reading suggests — the defence bends to him whether or not he touches it.",
  },
  "kawhi-10s": {
    roles: { primary: "Wing Stopper", secondary: ["Point-of-Attack Stopper", "Secondary Creator"] },
    fit: { defensiveVersatility: 9 },
    note: "Point-of-attack and wing containment are near-identical in his derived profile; the wing label is the accurate one for a player who took the opponent's best forward.",
  },
  "pippen-90s": {
    fit: { defensiveVersatility: 10, connectivity: 9 },
    note: "Guarded one through five in an era when nobody did. The derived profile captures his point-of-attack defence but not the range of assignments, which is the thing he was famous for.",
  },
  "ak47-2ks": {
    roles: { primary: "Help Defender", secondary: ["Rim Protector", "Wing Stopper"] },
    note: "A forward averaging both blocks and steals at rates his position does not produce. 'Rim Protector' captures half of it; help defence is the whole of it.",
  },
  "dirk-00s": {
    roles: { primary: "Stretch Big", secondary: ["Primary Creator", "Post Hub"] },
    note: "The archetype the role exists to describe: a seven-footer whose shooting pulled centres away from the basket. Derived as a generic 'Primary Creator', which loses the entire geometric point of him.",
  },
};

export default CURATED;
export const CURATED_IDS = Object.keys(CURATED);
