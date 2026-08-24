// ── V3 analysis: expectations, postgame explanation, preview, coach recs ──────
// Everything here is computed from the SAME engine that played the game.
// Upsets are explained honestly: if the stronger expected team lost, we say
// the better team lost tonight — we never rewrite reality to flatter the
// winner. No numbers are invented for prose.
import { simulateGameV3 } from "./engine.js";
import { deriveSeed } from "./seed.js";
import { teamDNA } from "./playerProfile.js";
import { allocateUsage } from "./roles.js";
import { coachRosterFit, coachEraFit, fitLabel } from "./gameplan.js";
import { COACHES } from "./coaches.js";
import { eraInteraction } from "./eraStyles.js";

// Pre-game expectation: a deterministic 25-sim sample on seeds derived from
// the game seed (reproducible; cheap: ~5ms). This is the honest baseline the
// postgame compares the real result against.
export const expectedWinPct = (gold, blue, coachG, coachB, era, seed, n = 25) => {
  let g = 0;
  for (let i = 0; i < n; i++) {
    if (simulateGameV3(gold, blue, coachG, coachB, era, deriveSeed(seed, 7000 + i)).winner === "Gold") g++;
  }
  return g / n;
};

const pct = (m, a) => (a ? Math.round((m / a) * 1000) / 10 : 0);

// ── expected vs realized (Addendum 12/23/40) ──────────────────────────────────
// The matchup evaluation is computed BEFORE the game and never rewritten after
// the final score. Users see honest bands, not false precision; the exact
// probability stays in the stored v3 block for analytics.
export const classifyOutcome = (winnerExpectedPct) => {
  if (winnerExpectedPct >= 0.55) return "EXPECTED_RESULT";
  if (winnerExpectedPct >= 0.45) return "TOSS_UP_RESULT";
  if (winnerExpectedPct >= 0.30) return "MILD_UPSET";
  if (winnerExpectedPct >= 0.15) return "SIGNIFICANT_UPSET";
  return "MAJOR_UPSET";
};
export const edgeBand = (p) => {
  const fav = Math.max(p, 1 - p);
  if (fav < 0.55) return "TOSS-UP";
  if (fav < 0.62) return "SLIGHT EDGE";
  if (fav < 0.72) return "MODERATE EDGE";
  return "STRONG EDGE";
};

// 4–6 sentence deterministic "why you won/lost" from real possession outcomes.
export const gameSummary = (result, gold, blue, coachG, coachB, era, expGold) => {
  const won = result.winner === "Gold";
  const W = won ? result.gold : result.blue;
  const L = won ? result.blue : result.gold;
  const winName = won ? "Team Gold" : "Team Blue";
  const loseName = won ? "Team Blue" : "Team Gold";
  const wCoach = won ? coachG : coachB;
  const margin = Math.abs(result.finalScore.gold - result.finalScore.blue);
  const s = [];

  // expectation honesty — bands, never decimal probabilities, and the matchup
  // evaluation is never rewritten because of tonight's score
  const expW = won ? expGold : 1 - expGold;
  const klass = classifyOutcome(expW);
  if (klass === "MAJOR_UPSET" || klass === "SIGNIFICANT_UPSET") {
    s.push(`${winName} pulled off a genuine upset — ${loseName} entered with the stronger matchup on paper, but ${winName} produced the better game tonight.`);
  } else if (klass === "MILD_UPSET") {
    s.push(`${winName} won a game that leaned ${loseName} on paper — a mild upset, the kind a single night's shooting can swing.`);
  } else if (klass === "TOSS_UP_RESULT") {
    s.push(`${winName} took a genuine toss-up ${result.seriesResult} — these teams were built even, and tonight broke their way.`);
  } else {
    s.push(`${winName} won ${result.seriesResult} in a matchup the engine saw as a ${edgeBand(expW).toLowerCase()} in their favor.`);
  }

  // shot quality vs shot making: good shots miss and bad shots go in — say
  // which one actually happened instead of pretending the winner planned it
  const wx = won ? result.gold.xPts : result.blue.xPts;
  const lx = won ? result.blue.xPts : result.gold.xPts;
  const wReal = W.totals.pts, lReal = L.totals.pts;
  if (wx != null && lx != null && lx - wx >= 6 && wReal > lReal) {
    s.push(`${loseName} actually generated the better looks (${Math.round(lx)} expected points to ${Math.round(wx)}), but ${winName} converted the harder shots at an unusually high rate.`);
  }

  // the shooting story (real numbers)
  const wFg = pct(W.totals.fgm, W.totals.fga), lFg = pct(L.totals.fgm, L.totals.fga);
  const w3 = pct(W.totals.tpm, W.totals.tpa), l3 = pct(L.totals.tpm, L.totals.tpa);
  if (W.totals.tpa >= 15 && w3 - l3 >= 8) s.push(`The perimeter decided it: ${winName} hit ${w3}% from deep on ${W.totals.tpa} attempts while ${loseName} managed ${l3}%.`);
  else if (wFg - lFg >= 4) s.push(`${winName} simply got better shots all night — ${wFg}% from the field against ${lFg}%.`);
  else if (lFg - wFg >= 4) s.push(`${loseName} actually shot better (${lFg}% to ${wFg}%) — and still lost, because the game slipped away at the possession level.`);
  else s.push(`Shooting was nearly even (${wFg}% to ${lFg}%), so the game came down to possessions.`);

  // the possession battle (turnovers + offensive glass)
  const tovDiff = L.totals.to - W.totals.to;
  const orbDiff = W.totals.oreb - L.totals.oreb;
  if (tovDiff >= 3) s.push(`${winName} forced ${tovDiff} more turnovers, turning ${loseName}'s possessions into extra offense.`);
  if (orbDiff >= 3) s.push(`${orbDiff} extra offensive rebounds gave ${winName} the second-chance battle outright.`);
  if (tovDiff < 3 && orbDiff < 3 && margin <= 6) s.push(`Neither side controlled the possession battle, which kept it a one-run game to the finish.`);

  // usage/leading man (real lines)
  const top = [...W.lines].sort((a, b) => b.pts - a.pts)[0];
  const topShare = W.usage.find((u) => u.id === top.id);
  s.push(`${top.name} led the winners with ${top.pts} points on ${top.fgm}-of-${top.fga} shooting as their ${topShare?.role?.toLowerCase() || "lead option"}.`);

  // in-game adjustment that actually happened (from the possession engine's log)
  const wAdj = (won ? result.gold.adjustments : result.blue.adjustments) || [];
  if (wAdj.length) s.push(`${wAdj[0]} — and the game tilted after it.`);

  // coach/system note (from realized plans — never a flat bonus)
  const wPlan = W.plan, lPlan = L.plan;
  if (wPlan.threeEmphasis - lPlan.threeEmphasis >= 2 && W.totals.tpm > L.totals.tpm) {
    s.push(`${wCoach.name}'s shot spectrum won the math battle: ${W.totals.tpm} threes to ${L.totals.tpm} in a ${era.id} environment.`);
  } else if (wPlan.ballMovement >= 7 && W.totals.ast >= L.totals.ast + 4) {
    s.push(`${wCoach.name}'s ball movement showed up in the assist column, ${W.totals.ast} to ${L.totals.ast}.`);
  }
  return s.slice(0, 6).join(" ");
};

// Turning-point analysis grounded in the biggest realized statistical swing.
export const turningPointV3 = (result, era) => {
  const won = result.winner === "Gold";
  const W = won ? result.gold : result.blue;
  const L = won ? result.blue : result.gold;
  const winName = won ? "Team Gold" : "Team Blue";
  const loseName = won ? "Team Blue" : "Team Gold";
  const s = [];
  // which factor swung hardest (all real)
  const factors = [
    { k: "threes", diff: (W.totals.tpm - L.totals.tpm) * 3, text: `a ${W.totals.tpm}-to-${L.totals.tpm} three-point barrage` },
    { k: "turnovers", diff: (L.totals.to - W.totals.to) * 1.1, text: `${L.totals.to - W.totals.to > 0 ? `forcing ${L.totals.to - W.totals.to} extra turnovers` : "ball security"}` },
    { k: "glass", diff: (W.totals.oreb - L.totals.oreb) * 1.1, text: `${Math.max(0, W.totals.oreb - L.totals.oreb)} extra second-chance possessions` },
    { k: "line", diff: (W.totals.ftm - L.totals.ftm) * 0.9, text: `a ${W.totals.ftm}-${L.totals.ftm} edge at the free-throw line` },
  ].sort((a, b) => b.diff - a.diff);
  const top = factors[0];
  s.push(`The decisive lever was ${top.text} — over ${result.possessions} possessions, that's where ${winName} banked its margin.`);
  const duel = W.lines.map((l, i) => ({ l, d: (result.winner === "Gold" ? result.assignments.onGold : result.assignments.onBlue)[i] }))
    .sort((a, b) => b.l.pts - a.l.pts)[0];
  if (duel?.d) s.push(`${duel.l.name} kept the pressure on against ${duel.d.defender}'s coverage, finishing with ${duel.l.pts} on ${duel.l.fga} shots.`);
  const lTop = [...L.lines].sort((a, b) => b.pts - a.pts)[0];
  s.push(`${lTop.name} answered with ${lTop.pts} for ${loseName}, but ${lTop.fgm}-of-${lTop.fga} wasn't efficient enough to swing the possession math back.`);
  if (result.overtimes > 0) s.push(`It took ${result.overtimes} overtime${result.overtimes > 1 ? "s" : ""} to separate them.`);
  return s.join(" ");
};

// ── Coach recommendations: strategically DIFFERENT good fits ─────────────────
// Deliberately NOT a hidden ranking's top three (that would create a solved
// meta: "always pick #1"). Each card is the best coach through a different
// credible basketball lens, so choosing between them is a real strategy call.
export const recommendCoaches = (team, era = null, n = 3) => {
  const dnas = teamDNA(team);
  const scored = COACHES.map((c) => {
    const fit = coachRosterFit(c, dnas);
    const eFit = era ? coachEraFit(c, era) : null;
    const o = c.offense, d = c.defense;
    return {
      coach: c, fit, eraFit: eFit,
      blend: fit + (eFit ?? 6) * 0.35,
      // three independent lenses over the same roster
      balanceScore: fit + (10 - Math.abs(o.starFreedom - o.ballMovement)) * 0.3,
      spacingScore: fit * 0.5 + (o.threeEmphasis + o.motion + o.offBall) * 0.4,
      defenseScore: fit * 0.5 + (d.pressure + d.helpAggression + d.rimPriority) * 0.4,
    };
  });
  const lenses = [
    { key: "balanceScore", angle: "Best Role Balance" },
    { key: "spacingScore", angle: "Best Spacing / Movement Fit" },
    { key: "defenseScore", angle: "Best Defensive Identity" },
  ];
  const picked = [];
  for (const lens of lenses) {
    const best = scored
      .filter((s) => !picked.some((p) => p.coach.id === s.coach.id))
      .sort((a, b) => b[lens.key] - a[lens.key])[0];
    if (best) picked.push({ ...best, angle: lens.angle });
    if (picked.length >= n) break;
  }
  return picked.map(({ coach, fit, eraFit, angle }) => ({
    id: coach.id, name: coach.name, span: coach.span,
    championships: coach.championships, systemTags: coach.systemTags,
    angle,
    whyItFits: coach.bestWith[0] || coach.systemTags[0],
    concern: coach.concern,
    teamFit: fitLabel(fit),
    eraFit: eraFit == null ? null : fitLabel(eraFit),
  }));
};

// ── Matchup preview V3 ────────────────────────────────────────────────────────
const avg = (ds, f) => ds.reduce((s, d) => s + f(d), 0) / ds.length;
export const matchupPreviewV3 = (gold, blue, coachG, coachB, era) => {
  const g = teamDNA(gold), b = teamDNA(blue);
  const cat = (f) => {
    const d = avg(g, f) - avg(b, f);
    return Math.max(-20, Math.min(20, Math.round(d * 3)));
  };
  const gAlloc = allocateUsage(g), bAlloc = allocateUsage(b);
  const construction = (alloc) => 10 - alloc.reduce((s, a) => s + a.compression * 3 + a.strain * 2, 0);
  const categories = [
    { category: "Talent", edge: cat((d) => (d.creation + d.finishing + d.outsideShooting + d.interiorDef) / 4) },
    { category: "Construction", edge: Math.max(-20, Math.min(20, Math.round((construction(gAlloc) - construction(bAlloc)) * 2.5))) },
    { category: "Creation", edge: cat((d) => d.creation * 0.6 + d.passing * 0.4) },
    { category: "Spacing", edge: cat((d) => d.outsideShooting) },
    { category: "Defense", edge: cat((d) => (d.poaDef + d.interiorDef + d.rimProtection) / 3) },
    { category: "Rebounding", edge: cat((d) => (d.offReb + d.defReb) / 2) },
  ];
  if (coachG && coachB) {
    const gFit = coachRosterFit(coachG, g), bFit = coachRosterFit(coachB, b);
    categories.push({ category: "Coach Fit", edge: Math.max(-20, Math.min(20, Math.round((gFit - bFit) * 3))) });
    if (era) {
      const gE = coachEraFit(coachG, era), bE = coachEraFit(coachB, era);
      categories.push({ category: "Era Fit", edge: Math.max(-20, Math.min(20, Math.round((gE - bE) * 3))) });
    }
  }
  // KEY CLASH: one supported sentence
  const talent = categories[0].edge, constructionEdge = categories[1].edge;
  let keyClash;
  if (talent > 4 && constructionEdge < -3) keyClash = "Gold owns the individual talent, but Blue's construction wastes less of what it has — the cleaner machine against the bigger engine.";
  else if (talent < -4 && constructionEdge > 3) keyClash = "Blue owns the individual talent, but Gold's construction wastes less of what it has — the cleaner machine against the bigger engine.";
  else if (Math.abs(talent) <= 4) keyClash = `Talent is nearly even, so this comes down to ${Math.abs(categories[3].edge) > Math.abs(categories[4].edge) ? "whose spacing bends the defense further" : "which defense breaks first"}${era && !era.rules.threePoint ? " — with every deep shot worth two in this era" : ""}.`;
  else keyClash = `${talent > 0 ? "Gold" : "Blue"} brings clearly more talent; the underdog needs the possession battle (turnovers and the glass) to keep the math close.`;
  return {
    categories,
    keyClash,
    eraNotes: era ? { gold: eraInteraction(era, g), blue: eraInteraction(era, b) } : null,
  };
};
