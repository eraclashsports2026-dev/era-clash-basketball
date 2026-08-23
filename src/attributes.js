// ── EraClash Player Attributes & Archetypes (chemistry layer v2.5) ────────────
// Separates players with similar box-score stats but different games:
// Curry ≠ Ray Allen, Shaq ≠ Jokic, Rodman ≠ Draymond.
//
// METHODOLOGY / DATA INTEGRITY
// ─────────────────────────────
// Every entry below is CURATED: hand-assigned from historical consensus
// (playstyle, era film record, award profile), not fabricated in bulk.
// basis values used in this file:
//   "curated"  — assigned by hand from well-documented playstyle consensus
// Values that would require guessing are simply absent: players without an
// entry are treated as NEUTRAL (no attribute bonuses or penalties), and any
// team insight that needs full-lineup coverage stays silent for them.
// Current coverage: a validated subset (93 of 330 entries — the most
// frequently drafted stars plus the defense-first role players the rating
// engine exists to respect). Populating the remaining entries is a data task
// for a future session, not something to auto-generate.
//
// SCALES: all attributes 0–10.
//   Offense:  shotCreation, outsideGravity (shooting gravity), rimPressure,
//             playmaking, offBall (value without the ball)
//   Defense:  poaDef (point-of-attack), interiorDef, rimProt, rebounding,
//             switchability
//   Tendency: usage, ballDom (ball dominance), pace, shotProfile
//             (rim | mid | three | post | balanced)
//
// ⚠ SCOPE GUARD: v2.5 attributes power UI insights, the matchup engine, and
// the simulation prompt. They do NOT change teamRating / player OVR — wiring
// them into the rating formula is a CEO-approval item.

export const ARCHETYPES = [
  "Primary Creator", "Secondary Creator", "Floor General", "Movement Shooter",
  "Shot Creator", "Slasher", "Post Scorer", "Stretch Big", "Rim Runner",
  "Point Forward", "Defensive Wing", "Point-of-Attack Stopper", "Rim Protector",
  "Switch Big", "Rebounding Specialist", "Two-Way Star",
];

const A = (arch, attrs, shotProfile = "balanced") =>
  ({ basis: "curated", arch, shotProfile, ...attrs });

// prettier-ignore
export const PLAYER_ATTRS = {
  // ═══ 1960s–70s ═══
  "wilt-60s":   A(["Post Scorer", "Rim Protector", "Rebounding Specialist"], { shotCreation: 8, outsideGravity: 0, rimPressure: 10, playmaking: 4, offBall: 5, poaDef: 2, interiorDef: 9, rimProt: 9, rebounding: 10, switchability: 3, usage: 10, ballDom: 8, pace: 6 }, "rim"),
  "bill-60s":   A(["Rim Protector", "Rebounding Specialist"], { shotCreation: 3, outsideGravity: 0, rimPressure: 6, playmaking: 5, offBall: 7, poaDef: 4, interiorDef: 10, rimProt: 10, rebounding: 10, switchability: 5, usage: 4, ballDom: 3, pace: 8 }, "rim"),
  "oscar-60s":  A(["Primary Creator", "Floor General"], { shotCreation: 9, outsideGravity: 2, rimPressure: 7, playmaking: 10, offBall: 4, poaDef: 5, interiorDef: 2, rimProt: 1, rebounding: 7, switchability: 4, usage: 9, ballDom: 9, pace: 6 }, "mid"),
  "jerry-60s":  A(["Shot Creator", "Secondary Creator"], { shotCreation: 9, outsideGravity: 4, rimPressure: 6, playmaking: 7, offBall: 6, poaDef: 6, interiorDef: 2, rimProt: 1, rebounding: 3, switchability: 4, usage: 8, ballDom: 7, pace: 6 }, "mid"),
  "elgin-60s":  A(["Slasher", "Shot Creator"], { shotCreation: 8, outsideGravity: 1, rimPressure: 9, playmaking: 5, offBall: 5, poaDef: 4, interiorDef: 4, rimProt: 2, rebounding: 9, switchability: 4, usage: 9, ballDom: 8, pace: 7 }, "rim"),
  "kareem-70s": A(["Post Scorer", "Rim Protector"], { shotCreation: 9, outsideGravity: 1, rimPressure: 9, playmaking: 4, offBall: 6, poaDef: 2, interiorDef: 8, rimProt: 9, rebounding: 8, switchability: 2, usage: 9, ballDom: 7, pace: 5 }, "post"),
  "julius-70s": A(["Slasher", "Two-Way Star"], { shotCreation: 8, outsideGravity: 2, rimPressure: 10, playmaking: 5, offBall: 6, poaDef: 6, interiorDef: 5, rimProt: 5, rebounding: 7, switchability: 6, usage: 9, ballDom: 7, pace: 8 }, "rim"),
  "pete-70s":   A(["Primary Creator", "Shot Creator"], { shotCreation: 10, outsideGravity: 4, rimPressure: 5, playmaking: 8, offBall: 3, poaDef: 3, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 10, ballDom: 10, pace: 8 }, "mid"),
  "walt-70s":   A(["Floor General", "Point-of-Attack Stopper"], { shotCreation: 6, outsideGravity: 2, rimPressure: 5, playmaking: 8, offBall: 5, poaDef: 9, interiorDef: 3, rimProt: 1, rebounding: 4, switchability: 5, usage: 6, ballDom: 6, pace: 5 }, "mid"),
  "tiny-70s":   A(["Primary Creator", "Floor General"], { shotCreation: 8, outsideGravity: 3, rimPressure: 7, playmaking: 10, offBall: 3, poaDef: 4, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 9, ballDom: 9, pace: 9 }, "rim"),
  "george-70s": A(["Shot Creator", "Movement Shooter"], { shotCreation: 9, outsideGravity: 4, rimPressure: 7, playmaking: 4, offBall: 6, poaDef: 3, interiorDef: 2, rimProt: 2, rebounding: 3, switchability: 3, usage: 9, ballDom: 7, pace: 7 }, "mid"),
  "artis-70s":  A(["Rim Protector", "Post Scorer"], { shotCreation: 5, outsideGravity: 0, rimPressure: 8, playmaking: 2, offBall: 5, poaDef: 1, interiorDef: 8, rimProt: 8, rebounding: 9, switchability: 1, usage: 6, ballDom: 4, pace: 4 }, "rim"),
  // ═══ 1980s ═══
  "magic-80s":  A(["Primary Creator", "Floor General", "Point Forward"], { shotCreation: 7, outsideGravity: 2, rimPressure: 7, playmaking: 10, offBall: 4, poaDef: 4, interiorDef: 4, rimProt: 1, rebounding: 7, switchability: 6, usage: 8, ballDom: 9, pace: 10 }, "balanced"),
  "bird-80s":   A(["Primary Creator", "Stretch Big", "Point Forward"], { shotCreation: 9, outsideGravity: 8, rimPressure: 5, playmaking: 9, offBall: 8, poaDef: 3, interiorDef: 5, rimProt: 2, rebounding: 8, switchability: 4, usage: 8, ballDom: 7, pace: 6 }, "three"),
  "jordan-80s": A(["Primary Creator", "Slasher", "Two-Way Star"], { shotCreation: 10, outsideGravity: 3, rimPressure: 10, playmaking: 6, offBall: 6, poaDef: 9, interiorDef: 4, rimProt: 3, rebounding: 5, switchability: 7, usage: 10, ballDom: 8, pace: 8 }, "rim"),
  "kareem-80s": A(["Post Scorer", "Rim Protector"], { shotCreation: 8, outsideGravity: 1, rimPressure: 8, playmaking: 4, offBall: 6, poaDef: 1, interiorDef: 7, rimProt: 7, rebounding: 6, switchability: 1, usage: 7, ballDom: 6, pace: 4 }, "post"),
  "isiah-80s":  A(["Primary Creator", "Floor General"], { shotCreation: 8, outsideGravity: 3, rimPressure: 7, playmaking: 9, offBall: 4, poaDef: 6, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 3, usage: 8, ballDom: 9, pace: 9 }, "mid"),
  "moses-80s":  A(["Post Scorer", "Rebounding Specialist", "Rim Runner"], { shotCreation: 6, outsideGravity: 0, rimPressure: 9, playmaking: 1, offBall: 7, poaDef: 1, interiorDef: 6, rimProt: 5, rebounding: 10, switchability: 1, usage: 8, ballDom: 5, pace: 5 }, "rim"),
  "charles-80s":A(["Post Scorer", "Slasher", "Rebounding Specialist"], { shotCreation: 8, outsideGravity: 3, rimPressure: 9, playmaking: 5, offBall: 5, poaDef: 3, interiorDef: 4, rimProt: 2, rebounding: 10, switchability: 4, usage: 9, ballDom: 7, pace: 8 }, "rim"),
  "mcHale-80s": A(["Post Scorer", "Rim Protector"], { shotCreation: 8, outsideGravity: 1, rimPressure: 8, playmaking: 2, offBall: 8, poaDef: 2, interiorDef: 8, rimProt: 6, rebounding: 6, switchability: 4, usage: 6, ballDom: 4, pace: 4 }, "post"),
  "moncrief-80s":A(["Point-of-Attack Stopper", "Two-Way Star", "Secondary Creator"], { shotCreation: 6, outsideGravity: 3, rimPressure: 7, playmaking: 6, offBall: 7, poaDef: 10, interiorDef: 3, rimProt: 1, rebounding: 5, switchability: 7, usage: 6, ballDom: 5, pace: 6 }, "mid"),
  "cooper-80s": A(["Point-of-Attack Stopper", "Defensive Wing"], { shotCreation: 3, outsideGravity: 4, rimPressure: 4, playmaking: 5, offBall: 7, poaDef: 10, interiorDef: 3, rimProt: 2, rebounding: 3, switchability: 8, usage: 3, ballDom: 2, pace: 8 }, "three"),
  "king-80s":   A(["Shot Creator", "Post Scorer"], { shotCreation: 9, outsideGravity: 2, rimPressure: 8, playmaking: 3, offBall: 6, poaDef: 3, interiorDef: 3, rimProt: 1, rebounding: 5, switchability: 4, usage: 9, ballDom: 7, pace: 7 }, "mid"),
  "dj-80s":     A(["Point-of-Attack Stopper", "Floor General"], { shotCreation: 5, outsideGravity: 2, rimPressure: 4, playmaking: 7, offBall: 6, poaDef: 9, interiorDef: 3, rimProt: 2, rebounding: 4, switchability: 6, usage: 5, ballDom: 5, pace: 6 }, "mid"),
  "worthy-80s": A(["Slasher", "Rim Runner"], { shotCreation: 6, outsideGravity: 2, rimPressure: 9, playmaking: 3, offBall: 8, poaDef: 4, interiorDef: 4, rimProt: 2, rebounding: 5, switchability: 5, usage: 6, ballDom: 4, pace: 9 }, "rim"),
  // ═══ 1990s ═══
  "jordan-90s": A(["Primary Creator", "Shot Creator", "Two-Way Star"], { shotCreation: 10, outsideGravity: 4, rimPressure: 9, playmaking: 6, offBall: 7, poaDef: 9, interiorDef: 4, rimProt: 2, rebounding: 5, switchability: 7, usage: 10, ballDom: 8, pace: 7 }, "mid"),
  "pippen-90s": A(["Point Forward", "Defensive Wing", "Point-of-Attack Stopper"], { shotCreation: 6, outsideGravity: 3, rimPressure: 7, playmaking: 8, offBall: 7, poaDef: 10, interiorDef: 5, rimProt: 3, rebounding: 6, switchability: 10, usage: 6, ballDom: 6, pace: 8 }, "balanced"),
  "hak-90s":    A(["Post Scorer", "Rim Protector", "Two-Way Star"], { shotCreation: 9, outsideGravity: 1, rimPressure: 9, playmaking: 4, offBall: 5, poaDef: 3, interiorDef: 10, rimProt: 10, rebounding: 8, switchability: 6, usage: 9, ballDom: 7, pace: 6 }, "post"),
  "rob-90s":    A(["Rim Protector", "Rim Runner", "Two-Way Star"], { shotCreation: 6, outsideGravity: 1, rimPressure: 9, playmaking: 4, offBall: 7, poaDef: 3, interiorDef: 9, rimProt: 10, rebounding: 8, switchability: 6, usage: 7, ballDom: 5, pace: 8 }, "rim"),
  "shaq-90s":   A(["Post Scorer", "Rim Runner", "Rim Protector"], { shotCreation: 8, outsideGravity: 0, rimPressure: 10, playmaking: 3, offBall: 6, poaDef: 1, interiorDef: 8, rimProt: 8, rebounding: 9, switchability: 1, usage: 9, ballDom: 7, pace: 6 }, "rim"),
  "stock-90s":  A(["Floor General"], { shotCreation: 5, outsideGravity: 6, rimPressure: 4, playmaking: 10, offBall: 5, poaDef: 6, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 5, ballDom: 8, pace: 6 }, "three"),
  "malone-90s": A(["Post Scorer", "Rim Runner"], { shotCreation: 7, outsideGravity: 2, rimPressure: 9, playmaking: 4, offBall: 7, poaDef: 3, interiorDef: 6, rimProt: 3, rebounding: 9, switchability: 4, usage: 9, ballDom: 6, pace: 7 }, "mid"),
  "ewing-90s":  A(["Post Scorer", "Rim Protector"], { shotCreation: 7, outsideGravity: 1, rimPressure: 8, playmaking: 2, offBall: 5, poaDef: 2, interiorDef: 8, rimProt: 8, rebounding: 8, switchability: 2, usage: 8, ballDom: 6, pace: 4 }, "post"),
  "gary-90s":   A(["Point-of-Attack Stopper", "Floor General", "Two-Way Star"], { shotCreation: 7, outsideGravity: 4, rimPressure: 6, playmaking: 8, offBall: 4, poaDef: 10, interiorDef: 2, rimProt: 1, rebounding: 3, switchability: 6, usage: 8, ballDom: 8, pace: 7 }, "mid"),
  "kidd-90s":   A(["Floor General", "Point-of-Attack Stopper"], { shotCreation: 4, outsideGravity: 2, rimPressure: 5, playmaking: 10, offBall: 4, poaDef: 8, interiorDef: 3, rimProt: 1, rebounding: 7, switchability: 6, usage: 6, ballDom: 8, pace: 10 }, "balanced"),
  "reggie-90s": A(["Movement Shooter"], { shotCreation: 5, outsideGravity: 10, rimPressure: 3, playmaking: 3, offBall: 10, poaDef: 3, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 6, ballDom: 3, pace: 6 }, "three"),
  "rodman-90s": A(["Rebounding Specialist", "Switch Big"], { shotCreation: 0, outsideGravity: 0, rimPressure: 2, playmaking: 2, offBall: 5, poaDef: 6, interiorDef: 9, rimProt: 4, rebounding: 10, switchability: 9, usage: 1, ballDom: 1, pace: 6 }, "rim"),
  "alonzo-90s": A(["Rim Protector"], { shotCreation: 5, outsideGravity: 1, rimPressure: 8, playmaking: 1, offBall: 6, poaDef: 2, interiorDef: 9, rimProt: 10, rebounding: 8, switchability: 3, usage: 7, ballDom: 4, pace: 5 }, "rim"),
  "mookie-90s": A(["Point-of-Attack Stopper", "Floor General"], { shotCreation: 4, outsideGravity: 4, rimPressure: 4, playmaking: 7, offBall: 5, poaDef: 9, interiorDef: 2, rimProt: 0, rebounding: 3, switchability: 5, usage: 5, ballDom: 6, pace: 7 }, "three"),
  // ═══ 2000s ═══
  "shaq-00s":   A(["Post Scorer", "Rim Protector"], { shotCreation: 8, outsideGravity: 0, rimPressure: 10, playmaking: 4, offBall: 6, poaDef: 1, interiorDef: 8, rimProt: 8, rebounding: 9, switchability: 1, usage: 10, ballDom: 8, pace: 5 }, "rim"),
  "kobe-00s":   A(["Primary Creator", "Shot Creator", "Two-Way Star"], { shotCreation: 10, outsideGravity: 6, rimPressure: 8, playmaking: 6, offBall: 5, poaDef: 8, interiorDef: 3, rimProt: 2, rebounding: 4, switchability: 6, usage: 10, ballDom: 9, pace: 7 }, "mid"),
  "lebron-00s": A(["Primary Creator", "Point Forward", "Slasher", "Two-Way Star"], { shotCreation: 9, outsideGravity: 4, rimPressure: 10, playmaking: 10, offBall: 5, poaDef: 7, interiorDef: 6, rimProt: 5, rebounding: 7, switchability: 9, usage: 10, ballDom: 9, pace: 9 }, "rim"),
  "duncan-00s": A(["Post Scorer", "Rim Protector", "Two-Way Star"], { shotCreation: 7, outsideGravity: 1, rimPressure: 8, playmaking: 5, offBall: 6, poaDef: 3, interiorDef: 10, rimProt: 9, rebounding: 9, switchability: 4, usage: 8, ballDom: 6, pace: 4 }, "post"),
  "kg-00s":     A(["Switch Big", "Stretch Big", "Two-Way Star"], { shotCreation: 7, outsideGravity: 4, rimPressure: 7, playmaking: 7, offBall: 6, poaDef: 6, interiorDef: 10, rimProt: 7, rebounding: 10, switchability: 10, usage: 8, ballDom: 6, pace: 7 }, "mid"),
  "dirk-00s":   A(["Stretch Big", "Shot Creator"], { shotCreation: 9, outsideGravity: 9, rimPressure: 5, playmaking: 4, offBall: 7, poaDef: 2, interiorDef: 5, rimProt: 3, rebounding: 7, switchability: 3, usage: 9, ballDom: 6, pace: 6 }, "three"),
  "wade-00s":   A(["Primary Creator", "Slasher"], { shotCreation: 9, outsideGravity: 2, rimPressure: 10, playmaking: 8, offBall: 5, poaDef: 7, interiorDef: 3, rimProt: 4, rebounding: 4, switchability: 6, usage: 10, ballDom: 9, pace: 9 }, "rim"),
  "cp3-00s":    A(["Floor General", "Primary Creator"], { shotCreation: 8, outsideGravity: 5, rimPressure: 5, playmaking: 10, offBall: 4, poaDef: 8, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 3, usage: 8, ballDom: 10, pace: 6 }, "mid"),
  "kidd-00s":   A(["Floor General", "Point-of-Attack Stopper"], { shotCreation: 4, outsideGravity: 4, rimPressure: 4, playmaking: 10, offBall: 5, poaDef: 8, interiorDef: 3, rimProt: 1, rebounding: 7, switchability: 6, usage: 6, ballDom: 8, pace: 9 }, "three"),
  "ai-00s":     A(["Primary Creator", "Shot Creator"], { shotCreation: 9, outsideGravity: 4, rimPressure: 8, playmaking: 7, offBall: 3, poaDef: 6, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 10, ballDom: 10, pace: 9 }, "rim"),
  "ray-00s":    A(["Movement Shooter"], { shotCreation: 6, outsideGravity: 9, rimPressure: 4, playmaking: 4, offBall: 10, poaDef: 4, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 3, usage: 7, ballDom: 4, pace: 7 }, "three"),
  "nash-00s":   A(["Floor General", "Primary Creator"], { shotCreation: 7, outsideGravity: 8, rimPressure: 4, playmaking: 10, offBall: 5, poaDef: 2, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 2, usage: 7, ballDom: 10, pace: 10 }, "three"),
  "ben-00s":    A(["Rim Protector", "Rebounding Specialist", "Switch Big"], { shotCreation: 0, outsideGravity: 0, rimPressure: 3, playmaking: 3, offBall: 4, poaDef: 5, interiorDef: 10, rimProt: 9, rebounding: 10, switchability: 8, usage: 1, ballDom: 1, pace: 6 }, "rim"),
  "bowen-2ks":  A(["Point-of-Attack Stopper", "Defensive Wing"], { shotCreation: 1, outsideGravity: 5, rimPressure: 2, playmaking: 1, offBall: 6, poaDef: 10, interiorDef: 4, rimProt: 1, rebounding: 2, switchability: 6, usage: 2, ballDom: 1, pace: 5 }, "three"),
  "artest-2ks": A(["Point-of-Attack Stopper", "Defensive Wing"], { shotCreation: 5, outsideGravity: 4, rimPressure: 5, playmaking: 3, offBall: 5, poaDef: 10, interiorDef: 5, rimProt: 2, rebounding: 4, switchability: 7, usage: 6, ballDom: 5, pace: 5 }, "three"),
  "camby-2ks":  A(["Rim Protector", "Rebounding Specialist"], { shotCreation: 1, outsideGravity: 0, rimPressure: 4, playmaking: 3, offBall: 4, poaDef: 2, interiorDef: 8, rimProt: 10, rebounding: 9, switchability: 4, usage: 3, ballDom: 2, pace: 6 }, "rim"),
  "ak47-2ks":   A(["Switch Big", "Defensive Wing", "Rim Protector"], { shotCreation: 4, outsideGravity: 3, rimPressure: 5, playmaking: 5, offBall: 7, poaDef: 6, interiorDef: 8, rimProt: 8, rebounding: 6, switchability: 9, usage: 5, ballDom: 3, pace: 7 }, "balanced"),
  "manu-00s":   A(["Secondary Creator", "Slasher"], { shotCreation: 8, outsideGravity: 6, rimPressure: 8, playmaking: 8, offBall: 6, poaDef: 6, interiorDef: 2, rimProt: 1, rebounding: 3, switchability: 5, usage: 7, ballDom: 6, pace: 9 }, "balanced"),
  "dwight-00s": A(["Rim Protector", "Rim Runner", "Rebounding Specialist"], { shotCreation: 3, outsideGravity: 0, rimPressure: 9, playmaking: 1, offBall: 6, poaDef: 2, interiorDef: 9, rimProt: 10, rebounding: 10, switchability: 5, usage: 6, ballDom: 4, pace: 7 }, "rim"),
  // ═══ 2010s ═══
  "curry-10s":  A(["Primary Creator", "Movement Shooter"], { shotCreation: 10, outsideGravity: 10, rimPressure: 5, playmaking: 8, offBall: 9, poaDef: 4, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 3, usage: 9, ballDom: 7, pace: 9 }, "three"),
  "lebron-10s": A(["Primary Creator", "Point Forward", "Two-Way Star"], { shotCreation: 9, outsideGravity: 5, rimPressure: 10, playmaking: 10, offBall: 5, poaDef: 6, interiorDef: 6, rimProt: 5, rebounding: 7, switchability: 9, usage: 10, ballDom: 9, pace: 8 }, "rim"),
  "durant-10s": A(["Shot Creator", "Stretch Big"], { shotCreation: 10, outsideGravity: 8, rimPressure: 7, playmaking: 5, offBall: 7, poaDef: 4, interiorDef: 5, rimProt: 5, rebounding: 6, switchability: 7, usage: 9, ballDom: 7, pace: 7 }, "balanced"),
  "harden-10s": A(["Primary Creator"], { shotCreation: 10, outsideGravity: 7, rimPressure: 8, playmaking: 9, offBall: 2, poaDef: 3, interiorDef: 3, rimProt: 1, rebounding: 5, switchability: 4, usage: 10, ballDom: 10, pace: 6 }, "three"),
  "kawhi-10s":  A(["Two-Way Star", "Defensive Wing", "Shot Creator"], { shotCreation: 8, outsideGravity: 6, rimPressure: 7, playmaking: 4, offBall: 7, poaDef: 10, interiorDef: 5, rimProt: 3, rebounding: 6, switchability: 8, usage: 8, ballDom: 6, pace: 4 }, "mid"),
  "giannis-10s":A(["Slasher", "Rim Runner", "Switch Big", "Point Forward"], { shotCreation: 7, outsideGravity: 1, rimPressure: 10, playmaking: 7, offBall: 6, poaDef: 5, interiorDef: 9, rimProt: 8, rebounding: 9, switchability: 9, usage: 10, ballDom: 8, pace: 9 }, "rim"),
  "jokic-10s":  A(["Primary Creator", "Post Scorer", "Point Forward"], { shotCreation: 8, outsideGravity: 6, rimPressure: 7, playmaking: 10, offBall: 6, poaDef: 1, interiorDef: 5, rimProt: 3, rebounding: 9, switchability: 3, usage: 8, ballDom: 8, pace: 6 }, "post"),
  "embiid-10s": A(["Post Scorer", "Rim Protector"], { shotCreation: 8, outsideGravity: 5, rimPressure: 9, playmaking: 3, offBall: 5, poaDef: 2, interiorDef: 9, rimProt: 9, rebounding: 9, switchability: 4, usage: 10, ballDom: 7, pace: 4 }, "post"),
  "klay-10s":   A(["Movement Shooter", "Defensive Wing"], { shotCreation: 5, outsideGravity: 9, rimPressure: 3, playmaking: 2, offBall: 10, poaDef: 7, interiorDef: 3, rimProt: 1, rebounding: 3, switchability: 6, usage: 6, ballDom: 2, pace: 7 }, "three"),
  "draymond-10s":A(["Switch Big", "Floor General", "Rim Protector"], { shotCreation: 2, outsideGravity: 2, rimPressure: 3, playmaking: 8, offBall: 5, poaDef: 7, interiorDef: 9, rimProt: 7, rebounding: 7, switchability: 10, usage: 3, ballDom: 5, pace: 8 }, "balanced"),
  "russ-10s":   A(["Primary Creator", "Slasher"], { shotCreation: 8, outsideGravity: 2, rimPressure: 10, playmaking: 9, offBall: 2, poaDef: 5, interiorDef: 3, rimProt: 1, rebounding: 8, switchability: 5, usage: 10, ballDom: 10, pace: 10 }, "rim"),
  "cp3-10s":    A(["Floor General", "Primary Creator"], { shotCreation: 8, outsideGravity: 6, rimPressure: 4, playmaking: 10, offBall: 4, poaDef: 7, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 3, usage: 7, ballDom: 10, pace: 5 }, "mid"),
  "ad-10s":     A(["Rim Protector", "Rim Runner", "Two-Way Star"], { shotCreation: 6, outsideGravity: 3, rimPressure: 9, playmaking: 3, offBall: 7, poaDef: 4, interiorDef: 9, rimProt: 10, rebounding: 9, switchability: 7, usage: 8, ballDom: 5, pace: 7 }, "balanced"),
  "gobert-10s": A(["Rim Protector", "Rim Runner"], { shotCreation: 1, outsideGravity: 0, rimPressure: 7, playmaking: 1, offBall: 6, poaDef: 2, interiorDef: 10, rimProt: 10, rebounding: 10, switchability: 3, usage: 3, ballDom: 1, pace: 6 }, "rim"),
  "dame-10s":   A(["Primary Creator", "Shot Creator"], { shotCreation: 9, outsideGravity: 9, rimPressure: 6, playmaking: 8, offBall: 4, poaDef: 2, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 2, usage: 9, ballDom: 9, pace: 7 }, "three"),
  "kyrie-10s":  A(["Shot Creator", "Secondary Creator"], { shotCreation: 10, outsideGravity: 7, rimPressure: 8, playmaking: 7, offBall: 5, poaDef: 3, interiorDef: 1, rimProt: 0, rebounding: 2, switchability: 3, usage: 9, ballDom: 9, pace: 7 }, "balanced"),
  "luka-10s":   A(["Primary Creator", "Point Forward"], { shotCreation: 10, outsideGravity: 7, rimPressure: 7, playmaking: 10, offBall: 3, poaDef: 3, interiorDef: 3, rimProt: 1, rebounding: 8, switchability: 4, usage: 10, ballDom: 10, pace: 5 }, "balanced"),
  "butler-10s": A(["Two-Way Star", "Slasher", "Defensive Wing"], { shotCreation: 7, outsideGravity: 3, rimPressure: 8, playmaking: 7, offBall: 6, poaDef: 8, interiorDef: 4, rimProt: 2, rebounding: 5, switchability: 7, usage: 8, ballDom: 7, pace: 5 }, "mid"),
  // ═══ 2020s ═══
  "jokic-20s":  A(["Primary Creator", "Post Scorer", "Point Forward"], { shotCreation: 9, outsideGravity: 6, rimPressure: 8, playmaking: 10, offBall: 6, poaDef: 1, interiorDef: 6, rimProt: 4, rebounding: 10, switchability: 3, usage: 9, ballDom: 8, pace: 6 }, "post"),
  "curry-20s":  A(["Primary Creator", "Movement Shooter"], { shotCreation: 9, outsideGravity: 10, rimPressure: 4, playmaking: 8, offBall: 9, poaDef: 4, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 3, usage: 9, ballDom: 7, pace: 9 }, "three"),
  "giannis-20s":A(["Slasher", "Rim Runner", "Switch Big", "Point Forward"], { shotCreation: 7, outsideGravity: 1, rimPressure: 10, playmaking: 8, offBall: 6, poaDef: 5, interiorDef: 9, rimProt: 8, rebounding: 9, switchability: 9, usage: 10, ballDom: 8, pace: 9 }, "rim"),
  "lebron-20s": A(["Primary Creator", "Point Forward"], { shotCreation: 8, outsideGravity: 5, rimPressure: 8, playmaking: 10, offBall: 5, poaDef: 4, interiorDef: 5, rimProt: 4, rebounding: 7, switchability: 7, usage: 9, ballDom: 9, pace: 7 }, "rim"),
  "shai-20s":   A(["Primary Creator", "Shot Creator"], { shotCreation: 10, outsideGravity: 4, rimPressure: 9, playmaking: 7, offBall: 4, poaDef: 7, interiorDef: 3, rimProt: 2, rebounding: 4, switchability: 6, usage: 10, ballDom: 9, pace: 6 }, "mid"),
  "luka-20s":   A(["Primary Creator", "Point Forward"], { shotCreation: 10, outsideGravity: 8, rimPressure: 7, playmaking: 10, offBall: 3, poaDef: 3, interiorDef: 3, rimProt: 1, rebounding: 8, switchability: 4, usage: 10, ballDom: 10, pace: 5 }, "balanced"),
  "tatum-20s":  A(["Shot Creator", "Two-Way Star"], { shotCreation: 8, outsideGravity: 7, rimPressure: 7, playmaking: 6, offBall: 6, poaDef: 6, interiorDef: 5, rimProt: 3, rebounding: 8, switchability: 7, usage: 9, ballDom: 7, pace: 7 }, "balanced"),
  "embiid-20s": A(["Post Scorer", "Rim Protector"], { shotCreation: 8, outsideGravity: 5, rimPressure: 9, playmaking: 5, offBall: 5, poaDef: 2, interiorDef: 9, rimProt: 9, rebounding: 9, switchability: 4, usage: 10, ballDom: 8, pace: 4 }, "post"),
  "jrue-20s":   A(["Point-of-Attack Stopper", "Floor General", "Two-Way Star"], { shotCreation: 6, outsideGravity: 5, rimPressure: 6, playmaking: 8, offBall: 6, poaDef: 10, interiorDef: 4, rimProt: 2, rebounding: 4, switchability: 8, usage: 6, ballDom: 6, pace: 6 }, "balanced"),
  "smart-20s":  A(["Point-of-Attack Stopper", "Floor General"], { shotCreation: 4, outsideGravity: 4, rimPressure: 4, playmaking: 7, offBall: 5, poaDef: 10, interiorDef: 5, rimProt: 1, rebounding: 3, switchability: 8, usage: 5, ballDom: 6, pace: 7 }, "three"),
  "jjj-20s":    A(["Rim Protector", "Stretch Big"], { shotCreation: 4, outsideGravity: 6, rimPressure: 6, playmaking: 1, offBall: 7, poaDef: 5, interiorDef: 9, rimProt: 10, rebounding: 5, switchability: 8, usage: 6, ballDom: 3, pace: 7 }, "three"),
  "zion-20s":   A(["Slasher", "Rim Runner"], { shotCreation: 7, outsideGravity: 1, rimPressure: 10, playmaking: 6, offBall: 6, poaDef: 3, interiorDef: 4, rimProt: 3, rebounding: 7, switchability: 5, usage: 9, ballDom: 7, pace: 9 }, "rim"),
  "wemby-20s":  A(["Rim Protector", "Stretch Big", "Switch Big"], { shotCreation: 6, outsideGravity: 6, rimPressure: 8, playmaking: 4, offBall: 6, poaDef: 5, interiorDef: 10, rimProt: 10, rebounding: 9, switchability: 9, usage: 8, ballDom: 6, pace: 7 }, "balanced"),
  "ant-20s":    A(["Shot Creator", "Slasher"], { shotCreation: 8, outsideGravity: 6, rimPressure: 9, playmaking: 5, offBall: 5, poaDef: 7, interiorDef: 3, rimProt: 1, rebounding: 5, switchability: 6, usage: 9, ballDom: 7, pace: 8 }, "balanced"),
  "brunson-20s":A(["Primary Creator", "Floor General"], { shotCreation: 9, outsideGravity: 6, rimPressure: 6, playmaking: 8, offBall: 4, poaDef: 4, interiorDef: 1, rimProt: 0, rebounding: 3, switchability: 2, usage: 9, ballDom: 9, pace: 5 }, "mid"),
  "bam-20s":    A(["Switch Big", "Rim Runner"], { shotCreation: 4, outsideGravity: 1, rimPressure: 7, playmaking: 6, offBall: 6, poaDef: 6, interiorDef: 8, rimProt: 6, rebounding: 8, switchability: 10, usage: 6, ballDom: 4, pace: 8 }, "rim"),
  "trae-20s":   A(["Primary Creator", "Floor General"], { shotCreation: 9, outsideGravity: 8, rimPressure: 5, playmaking: 10, offBall: 2, poaDef: 1, interiorDef: 0, rimProt: 0, rebounding: 2, switchability: 1, usage: 10, ballDom: 10, pace: 7 }, "three"),
};

// ── Team-level attribute aggregation ──────────────────────────────────────────
// Sums each attribute across curated players only. coverage = how many of the
// five have curated entries; insights that need the full picture require
// coverage === team size and stay silent otherwise (accuracy over fake
// completeness).
export const getAttrs = (playerId) => PLAYER_ATTRS[playerId] || null;

export const teamAttributeProfile = (team) => {
  const t = team.filter(Boolean);
  const entries = t.map((p) => getAttrs(p.id)).filter(Boolean);
  const agg = (k) => entries.reduce((s, a) => s + (a[k] || 0), 0);
  return {
    coverage: entries.length,
    teamSize: t.length,
    full: entries.length === t.length && t.length === 5,
    shotCreation: agg("shotCreation"),
    outsideGravity: agg("outsideGravity"),
    rimPressure: agg("rimPressure"),
    playmaking: agg("playmaking"),
    offBall: agg("offBall"),
    poaDef: agg("poaDef"),
    interiorDef: agg("interiorDef"),
    rimProt: agg("rimProt"),
    rebounding: agg("rebounding"),
    switchability: agg("switchability"),
    usage: agg("usage"),
    ballDom: agg("ballDom"),
  };
};

// ── Chemistry v2.5 insights (additive to analyzeBalance v2) ───────────────────
// Named bonuses/gaps from playstyle attributes. Display + engine + prompt
// context only — does NOT alter teamRating (CEO gate). Only reported when the
// full lineup has curated data, so we never punish a lineup for missing data.
export const attributeInsights = (team) => {
  const prof = teamAttributeProfile(team);
  const bonuses = [], gaps = [];
  if (!prof.full) return { bonuses, gaps, profile: prof };

  if (prof.outsideGravity >= 30) bonuses.push({ label: "Elite spacing", detail: "Multiple shooters bend the defense" });
  else if (prof.outsideGravity <= 12) gaps.push({ label: "Cramped spacing", detail: "Defenses can pack the paint" });

  if (prof.ballDom >= 40) gaps.push({ label: "Ball-dominance overload", detail: "Too many players need the rock" });
  if (prof.offBall >= 32) bonuses.push({ label: "Off-ball motion", detail: "Constant movement without the ball" });

  if (prof.switchability >= 35) bonuses.push({ label: "Switch-everything defense", detail: "No mismatch to hunt" });
  else if (prof.switchability <= 15) gaps.push({ label: "Switch-hunting target", detail: "Slow feet get exposed in space" });

  if (prof.poaDef >= 32) bonuses.push({ label: "Point-of-attack wall", detail: "Elite pressure on the ball" });
  if (prof.shotCreation <= 20) gaps.push({ label: "Late-clock creation shortage", detail: "Who gets a bucket when sets break down?" });

  return { bonuses, gaps, profile: prof };
};

// Archetype list for a player (empty array when not yet curated).
export const playerArchetypes = (playerId) => getAttrs(playerId)?.arch || [];
