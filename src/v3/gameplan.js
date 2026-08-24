// ── Realized game plan ─────────────────────────────────────────────────────────
// COACH IDEAL SYSTEM → WHAT THE ROSTER CAN EXECUTE → WHAT THE ERA ALLOWS →
// WHAT THE OPPONENT TAKES AWAY = the plan the possession engine runs.
// Coaches are never flat bonuses: every coach effect flows through this
// translation, and adaptability governs how gracefully an ideal system bends.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const avg = (dnas, f) => dnas.reduce((s, d) => s + f(d), 0) / dnas.length;

export const buildGamePlan = (coach, dnas, era, oppDnas) => {
  const adapt = coach.management.adaptability / 10; // 0..1
  const o = coach.offense, d = coach.defense;

  // ── what the roster can execute ──────────────────────────────────────────
  const rosterOutside = avg(dnas, (x) => x.outsideShooting);
  const rosterThreeT = avg(dnas, (x) => x.threeTendency);
  const rosterPost = Math.max(...dnas.map((x) => x.postScoring));
  const rosterPace = avg(dnas, (x) => x.transition);
  const rosterCreation = Math.max(...dnas.map((x) => x.creation));

  // ideal emphases bend toward what the roster supports; adaptable coaches
  // bend further instead of forcing a broken identity
  const bend = (ideal, capable) => ideal + (capable - ideal) * (0.35 + adapt * 0.45);
  let threeEmphasis = bend(o.threeEmphasis, Math.min(o.threeEmphasis, rosterThreeT + 2));
  let postEmphasis = bend(o.post, Math.min(o.post, rosterPost + 1));
  let paceTarget = bend(o.tempo, o.tempo * 0.65 + rosterPace * 0.35); // philosophy leads, legs follow
  const isoEmphasis = bend(o.iso, Math.min(o.iso, rosterCreation));

  // ── what the era allows ──────────────────────────────────────────────────
  if (!era.rules.threePoint) {
    // no three-point line: the EMPHASIS redistributes; the shooters' SKILL
    // remains (gravity, spacing, efficient long twos). Adaptable coaches
    // convert more of the identity into rim/mid pressure instead of losing it.
    const redistributed = threeEmphasis * (0.5 + adapt * 0.4);
    postEmphasis = clamp(postEmphasis + redistributed * 0.35, 0, 10);
    threeEmphasis = 0;
  }
  const zoneAvailable = era.rules.zoneLegal;
  const scheme = {
    switching: d.switching,
    zone: zoneAvailable ? d.zone : 0, // zones simply are not legal earlier
    drop: d.drop,
    pressure: d.pressure * (era.rules.handCheckAllowed ? 1.1 : 0.95),
    helpAggression: d.helpAggression,
    rimPriority: d.rimPriority,
    defRebPriority: d.defRebPriority,
  };

  // ── what the opponent takes away (light counter, not a chess engine) ─────
  const oppRimWall = avg(oppDnas, (x) => x.rimProtection);
  const oppPerimD = avg(oppDnas, (x) => x.poaDef);
  if (oppRimWall > 6.5) threeEmphasis = clamp(threeEmphasis + (era.rules.threePoint ? 0.8 * adapt : 0), 0, 10);
  if (oppPerimD > 6.5) postEmphasis = clamp(postEmphasis + 0.6 * adapt, 0, 10);

  return {
    coachId: coach.id,
    paceTarget,                          // 0-10 tempo philosophy after translation
    threeEmphasis, postEmphasis, isoEmphasis,
    motion: o.motion, ballMovement: o.ballMovement, offBallEmphasis: o.offBall,
    transitionEmphasis: bend(o.transition, rosterPace),
    crashGlass: 10 - d.defRebPriority * 0.5, // get-back coaches concede the offensive glass
    concentration: clamp(0.8 + (o.starFreedom - o.ballMovement) * 0.05 + isoEmphasis * 0.02, 0.6, 1.6),
    scheme,
    roleDiscipline: coach.management.roleDiscipline,
    adapt,
  };
};

// Coach ↔ roster fit summary (for recommendations + preview; contextual only —
// there is deliberately NO universal coach OVR anywhere in this codebase).
export const coachRosterFit = (coach, dnas) => {
  const f = coach.rosterFit;
  const have = {
    traditionalCenters: Math.max(...dnas.map((d) => (d.pos === "C" ? d.postScoring + d.rimProtection : 0))) / 2,
    passingBigs: Math.max(...dnas.map((d) => (["PF", "C"].includes(d.pos) ? d.passing : 0))),
    primaryCreators: Math.max(...dnas.map((d) => d.creation)),
    multipleCreators: dnas.filter((d) => d.creation >= 6.5).length * 2.5,
    switchableWings: avg(dnas.filter((d) => ["SG", "SF", "PF"].includes(d.pos)), (d) => d.switchability) || 0,
    shooters: avg(dnas, (d) => d.outsideShooting),
    defenders: avg(dnas, (d) => (d.poaDef + d.interiorDef) / 2),
    transitionAthletes: avg(dnas, (d) => d.transition),
  };
  // fit = how much the roster supplies what this coach's system leans on
  let score = 0, weight = 0;
  for (const [k, want] of Object.entries(f)) {
    if (!(k in have)) continue;
    const w = want / 10;
    score += w * Math.min(10, have[k]);
    weight += w;
  }
  return weight ? score / weight : 5; // 0-10 contextual fit
};

export const fitLabel = (fit) => (fit >= 7 ? "EXCELLENT" : fit >= 5.5 ? "GOOD" : fit >= 4 ? "NEUTRAL" : "POOR");

// Era fit for a coach: how much of the ideal identity survives translation.
export const coachEraFit = (coach, era) => {
  let fit = 7;
  if (!era.rules.threePoint) fit -= coach.offense.threeEmphasis * 0.35 * (1 - coach.management.adaptability / 14);
  if (!era.rules.zoneLegal) fit -= coach.defense.zone * 0.25 * (1 - coach.management.adaptability / 14);
  if (era.rules.handCheckAllowed) fit += coach.defense.pressure * 0.08;
  else fit += coach.offense.motion * 0.05;
  return clamp(fit, 1, 10);
};
