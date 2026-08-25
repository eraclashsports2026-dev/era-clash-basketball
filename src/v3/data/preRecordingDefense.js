// ── Pre-1974 defensive review ─────────────────────────────────────────────────
// The NBA did not record steals or blocks until 1973-74. Every card whose
// seasons predate that carries stl 0.0 and blk 0.0 in the trusted dataset, and
// a formula that derives defensive event creation from those zeroes concludes
// that Bill Russell created no defensive events. That is a missing-data
// artefact wearing a rating's clothes.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────
// It does NOT invent steals or blocks. There is no fabricated "2.8 blocks per
// game" for a player nobody counted. Assigning a modern per-game event rate
// from an anecdote would be worse than the zero it replaces, because a number
// looks like a measurement and an anecdote does not.
//
// Instead each player gets a CATEGORICAL BAND on three axes, with the evidence
// class recorded per player. A band says "this player belonged in this tier of
// defender"; it never claims a rate.
//
// ── EVIDENCE CLASSES ─────────────────────────────────────────────────────────
//   RECORDED_STAT    an actual recorded statistic (All-Defensive selections
//                    exist from 1968-69, and rebounding was always recorded)
//   DOCUMENTED_ROLE  the player's defensive assignment is documented (e.g. a
//                    designated stopper, a designated anchor)
//   CALCULATED       derived from recorded data — position plus rebounding rate
//   INFERRED         historical consensus only. Lowest confidence, and used
//                    for the band alone, never for a magnitude
export const DEFENSIVE_BANDS = ["ELITE", "STRONG", "AVERAGE", "LIMITED", "MINIMAL"];
export const EVIDENCE_CLASSES = ["RECORDED_STAT", "DOCUMENTED_ROLE", "CALCULATED", "INFERRED"];

// D(interior, perimeter, eventBand, evidence, note)
const D = (interior, perimeter, eventBand, evidence, note = null) =>
  ({ interiorBand: interior, perimeterBand: perimeter, eventCreationBand: eventBand, evidence, note });

export const PRE_1974_DEFENSE = {
  // ── documented anchors ──
  "russell-50s": D("ELITE", "AVERAGE", "ELITE", "DOCUMENTED_ROLE", "The defining shot-blocker of the sport, on a defence built entirely around him. Eleven championships in thirteen years. The band is documented; no rate is claimed."),
  "mikan-50s": D("ELITE", "LIMITED", "STRONG", "DOCUMENTED_ROLE", "So dominant defensively that the NBA widened the lane in 1951 in response to him — a rule change is about as documented as a defensive role gets."),
  "nate-60s": D("ELITE", "AVERAGE", "ELITE", "DOCUMENTED_ROLE", "Widely regarded as the one centre who could guard Chamberlain and Abdul-Jabbar one-on-one; 22.0 rebounds per game on this card."),
  "wes-60s": D("STRONG", "AVERAGE", "STRONG", "RECORDED_STAT", "18.2 rebounds per game at 6'7\" — recorded rebounding is the evidence; the interior band follows from it."),
  "willis-60s": D("STRONG", "AVERAGE", "STRONG", "DOCUMENTED_ROLE", "The anchor of a championship defence and a documented physical presence at centre."),
  "beaty-60s": D("STRONG", "LIMITED", "AVERAGE", "CALCULATED", "11.2 rebounds per game at centre. Band derived from recorded rebounding and position."),
  "leroy-60s": D("AVERAGE", "LIMITED", "AVERAGE", "CALCULATED"),
  "wayne-60s": D("STRONG", "LIMITED", "AVERAGE", "CALCULATED", "A famously physical interior body; band from recorded rebounding plus documented role."),

  // ── All-Defensive selections exist from 1968-69: RECORDED ──
  "dave-d-60s": D("STRONG", "ELITE", "STRONG", "RECORDED_STAT", "Two All-Defensive First Teams and two Second Teams are on the card already — an actual recorded honour, not an inference."),

  // ── documented stoppers and strong forwards ──
  "tom-s-60s": D("STRONG", "STRONG", "AVERAGE", "DOCUMENTED_ROLE", "Boston's designated defensive forward through eight championships — a documented assignment rather than a statistical one."),
  "gus-60s": D("STRONG", "STRONG", "STRONG", "DOCUMENTED_ROLE", "Renowned for physical, athletic defence at forward; 12.7 rebounds per game."),
  "paul-s-60s": D("STRONG", "AVERAGE", "AVERAGE", "CALCULATED", "10.6 rebounds per game from a forward known for positioning."),
  "jerry-l-60s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED", "19.1 rebounds per game, but rebounding prowess is not the same claim as defensive deterrence — band held at average deliberately."),
  "john-h-60s": D("AVERAGE", "STRONG", "STRONG", "DOCUMENTED_ROLE", "A documented perimeter defender with famous conditioning and hands; his 1965 steal of Hal Greer's inbound pass is the most replayed defensive play of the era."),
  "billy-60s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED"),
  "bob-60s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED", "20.3 rebounds per game; a scorer-rebounder rather than a documented stopper."),
  "pettit-50s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED"),
  "schayes-50s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED"),
  "bailey-60s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED"),
  "tom-h-60s": D("AVERAGE", "LIMITED", "AVERAGE", "CALCULATED"),
  "chet-60s": D("AVERAGE", "AVERAGE", "AVERAGE", "CALCULATED"),
  "don-n-60s": D("AVERAGE", "LIMITED", "LIMITED", "CALCULATED"),
  "fred-h-60s": D("AVERAGE", "LIMITED", "LIMITED", "CALCULATED"),
  "boozer-60s": D("AVERAGE", "LIMITED", "AVERAGE", "CALCULATED"),
  "barry-60s": D("LIMITED", "AVERAGE", "AVERAGE", "INFERRED", "A great offensive forward with no documented defensive reputation either way."),
  "arizin-50s": D("LIMITED", "AVERAGE", "AVERAGE", "INFERRED"),
  "arizin-60s": D("LIMITED", "AVERAGE", "AVERAGE", "INFERRED"),

  // Curated cards still need a band when curation did not happen to set the
  // defensive-event field. Walt Bellamy's curated entry sets interior and
  // rebounding but not event creation, so without a band his event creation
  // stayed at the derived 0.0 — the exact artefact this file exists to remove.
  "walt-b-60s": D("AVERAGE", "LIMITED", "AVERAGE", "DOCUMENTED_ROLE", "Enormous rebounding volume but no All-Defensive selection and no contemporary reputation as an anchor; the band deliberately sits at average rather than following the rebounding."),
  "walt-b-70s": D("AVERAGE", "LIMITED", "AVERAGE", "CALCULATED", "His declining Atlanta years; band held at his 1960s level rather than raised or lowered without evidence."),

  // ── guards ──
  "lenny-60s": D("LIMITED", "STRONG", "STRONG", "DOCUMENTED_ROLE", "Documented as one of the era's better defensive guards; later a Hall of Fame coach whose teams defended."),
  "dick-v-60s": D("LIMITED", "STRONG", "AVERAGE", "DOCUMENTED_ROLE", "Known as a tenacious, physical guard defender."),
  "larry-s-60s": D("LIMITED", "STRONG", "AVERAGE", "DOCUMENTED_ROLE", "A Boston defensive-minded guard in a championship rotation."),
  "emmette-60s": D("MINIMAL", "STRONG", "AVERAGE", "DOCUMENTED_ROLE", "A defensive specialist guard — that was his role on the roster."),
  "hal-60s": D("LIMITED", "AVERAGE", "AVERAGE", "CALCULATED"),
  "sam-60s": D("LIMITED", "AVERAGE", "AVERAGE", "CALCULATED"),
  "dave-60s": D("LIMITED", "AVERAGE", "AVERAGE", "CALCULATED"),
  "archie-60s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
  "clem-60s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
  "lucius-60s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
  "jon-m-60s": D("MINIMAL", "LIMITED", "LIMITED", "CALCULATED"),
  "guerin-60s": D("LIMITED", "AVERAGE", "AVERAGE", "CALCULATED", "A physical, hard-nosed guard; band from position and documented style."),
  "rodgers-60s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
  "cousy-60s": D("MINIMAL", "LIMITED", "AVERAGE", "INFERRED", "Contemporary accounts do not credit him as a defender; the band reflects that without inventing a rate."),
  "sharman-50s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
  "sharman-60s": D("MINIMAL", "AVERAGE", "AVERAGE", "CALCULATED"),
};

/** Numeric floors the intelligence layer may apply, per band. These are FLOORS
 *  on a 0-10 capability scale — not steal or block rates. The distinction is
 *  the whole point: a floor says "at least this good"; a rate would claim a
 *  measurement that does not exist. */
export const BAND_FLOOR = { ELITE: 8.5, STRONG: 6.5, AVERAGE: 4.5, LIMITED: 2.5, MINIMAL: 1.0 };

export const preRecordingDefense = (cardId) => PRE_1974_DEFENSE[cardId] ?? null;
export const PRE_1974_REVIEWED_IDS = Object.keys(PRE_1974_DEFENSE);
