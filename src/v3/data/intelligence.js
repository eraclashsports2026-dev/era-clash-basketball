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
    fit: { roleAcceptance: 5, spacingContribution: 1 },
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
    fit: { roleAcceptance: 2, creationDependence: 9, connectivity: 7 },
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
    fit: { roleAcceptance: 9, defensiveVersatility: 2, spacingContribution: 0, creationDependence: 1 },
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
    fit: { roleAcceptance: 7, defensiveVersatility: 6 },
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
    fit: { roleAcceptance: 7, spacingContribution: 9, connectivity: 8, creationDependence: 4 },
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
    fit: { roleAcceptance: 8, spacingContribution: 9, creationDependence: 3 },
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
    fit: { roleAcceptance: 7, spacingContribution: 9, creationDependence: 4 },
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
    fit: { roleAcceptance: 9, defensiveVersatility: 8, connectivity: 7, creationDependence: 3 },
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
    fit: { roleAcceptance: 8, spacingContribution: 7, creationDependence: 4, connectivity: 6 },
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
    fit: { roleAcceptance: 5, defensiveVersatility: 7, spacingContribution: 2 },
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
    fit: { roleAcceptance: 6, defensiveVersatility: 8, spacingContribution: 4 },
    note:
      "Led the NBA in steals in 2005-06 and made the All-Defensive First Team in 2009-10 while " +
      "blocking about a shot a game as a wing — an event-generation profile almost no forward " +
      "matches. Like Mullin's, his decade mean is depressed by three low-minute Sacramento bench " +
      "years at the start, so curated values describe the Charlotte player the honours were won " +
      "by. High-variance, gambling style: event creation is set very high and containment " +
      "deliberately lower, because the two are not the same skill and he was far better at one.",
  },
};

export default CURATED;
export const CURATED_IDS = Object.keys(CURATED);
