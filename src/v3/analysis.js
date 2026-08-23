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

  // expectation honesty
  const expW = won ? expGold : 1 - expGold;
  if (expW < 0.42) {
    s.push(`${winName} won a game it was expected to lose — over a large sample this matchup leans ${loseName} (${Math.round((1 - expW) * 100)}%), but tonight the better team didn't play the better game.`);
  } else {
    s.push(`${winName} won ${result.seriesResult} in a matchup the engine ${expW > 0.6 ? "favored" : "rated close to even for"} them (${Math.round(expW * 100)}% expected).`);
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

// ── Coach recommendations: contextual, roster-driven, no OVR ─────────────────
export const recommendCoaches = (team, era = null, n = 3) => {
  const dnas = teamDNA(team);
  const scored = COACHES.map((c) => {
    const fit = coachRosterFit(c, dnas);
    const eFit = era ? coachEraFit(c, era) : null;
    return { coach: c, fit, eraFit: eFit, blend: fit + (eFit ?? 6) * 0.35 };
  }).sort((a, b) => b.blend - a.blend);
  return scored.slice(0, n).map(({ coach, fit, eraFit }) => ({
    id: coach.id, name: coach.name, span: coach.span,
    championships: coach.championships, systemTags: coach.systemTags,
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
